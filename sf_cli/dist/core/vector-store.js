/**
 * Lightweight local vector store for SkillFoundry memory embeddings.
 *
 * Replaces the ChromaDB dependency with a file-based approach:
 * - Index file: .skillfoundry/memory/vectors/index.json — metadata + vector references
 * - Embedding files: .skillfoundry/memory/vectors/{id}.json — individual vector payloads
 * - Stats file: .skillfoundry/memory/vectors/stats.json — collection metadata
 *
 * Cosine similarity is computed in-process. For 100 memories, search completes
 * well under the 200ms requirement. Rebuild reads source JSONL files from
 * memory_bank/ and .sf/memory/ directories.
 *
 * @module vector-store
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { EmbeddingUnavailableError } from './embedding-service.js';
import { getLogger } from '../utils/logger.js';
// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_OPTIONS = {
    persistPath: '.skillfoundry/memory/vectors',
    maxResults: 10,
    sourceDirs: ['memory_bank', '.sf/memory'],
};
const INDEX_FILE = 'index.json';
const STATS_FILE = 'stats.json';
// ── Cosine similarity ─────────────────────────────────────────────────────────
/**
 * Compute cosine similarity between two vectors of equal dimensionality.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity in [0, 1]. Returns 0 when either vector has zero magnitude.
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    if (denom === 0)
        return 0;
    // Clamp to [0, 1] — floating-point arithmetic can produce values slightly outside
    return Math.min(1, Math.max(0, dot / denom));
}
// ── VectorStore ───────────────────────────────────────────────────────────────
/**
 * File-based local vector store with cosine similarity search.
 *
 * Thread safety: This class does not implement file locking. It is intended for
 * single-process use within the SkillFoundry CLI session.
 *
 * @example
 * ```typescript
 * const store = new VectorStore(embeddingService);
 * await store.initialize();
 * await store.add([{ id: 'abc', text: 'user auth flow', metadata: { ... } }]);
 * const results = await store.search('authentication', 5);
 * ```
 */
export class VectorStore {
    embeddingService;
    options;
    storePath;
    initialized = false;
    /**
     * @param embeddingService - Service used to embed texts for storage and queries.
     * @param workDir - Project root directory. All paths are resolved relative to this.
     * @param options - Optional store configuration overrides.
     */
    workDir;
    constructor(embeddingService, workDir, options = {}) {
        this.embeddingService = embeddingService;
        this.workDir = resolve(workDir);
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.storePath = join(this.workDir, this.options.persistPath);
        // Validate sourceDirs are confined within workDir (prevent path traversal)
        for (const dir of this.options.sourceDirs) {
            const resolved = resolve(this.workDir, dir);
            const normalised = normalize(resolved);
            if (!normalised.startsWith(this.workDir)) {
                throw new TypeError(`sourceDirs: "${dir}" resolves outside of workDir — path traversal rejected`);
            }
        }
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Initialise the vector store.
     *
     * Creates the storage directory if it does not exist.
     * If the store already contains data from a different embedding dimension,
     * logs a warning and triggers a rebuild to re-embed everything with the
     * current provider.
     *
     * @throws EmbeddingUnavailableError if no embedding provider is reachable
     *         and dimension detection is required.
     */
    async initialize() {
        const log = getLogger();
        if (!existsSync(this.storePath)) {
            mkdirSync(this.storePath, { recursive: true });
            log.info('vector-store', 'store_created', { path: this.storePath });
        }
        // Check for dimension mismatch with existing data
        const stats = this.readStats();
        if (stats && stats.totalDocuments > 0) {
            try {
                const currentDims = await this.embeddingService.getDimensions();
                if (currentDims !== stats.dimensions) {
                    log.warn('vector-store', 'dimension_mismatch', {
                        stored: stats.dimensions,
                        current: currentDims,
                        action: 'triggering_rebuild',
                    });
                    await this.rebuild();
                    this.initialized = true;
                    return;
                }
            }
            catch (err) {
                if (err instanceof EmbeddingUnavailableError) {
                    log.warn('vector-store', 'dimension_check_skipped', {
                        reason: 'embedding_providers_unavailable',
                    });
                }
                else {
                    throw err;
                }
            }
        }
        this.initialized = true;
        log.debug('vector-store', 'initialized', {
            path: this.storePath,
            documents: stats?.totalDocuments ?? 0,
        });
    }
    // ── CRUD operations ───────────────────────────────────────────────────────
    /**
     * Add or update memory documents in the vector store.
     *
     * Existing documents with the same ID are replaced (upsert semantics).
     * Embeds each document's text via the EmbeddingService and writes to disk.
     *
     * @param documents - Array of memory documents to index.
     * @throws EmbeddingUnavailableError if neither embedding provider is reachable.
     */
    async add(documents) {
        if (documents.length === 0)
            return;
        const log = getLogger();
        this.ensureInitialized();
        const texts = documents.map((d) => d.text);
        const embeddings = await this.embeddingService.embedBatch(texts);
        const index = this.readIndex();
        const existingIds = new Set(index.entries.map((e) => e.id));
        // Provider name comes from the first embedding result (they all use the same provider)
        const providerName = embeddings[0].provider;
        const dimensions = embeddings[0].dimensions;
        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const embedding = embeddings[i];
            // Write individual vector file
            const vectorFile = { id: doc.id, vector: embedding.vector };
            writeFileSync(this.vectorFilePath(doc.id), JSON.stringify(vectorFile), 'utf-8');
            // Update index entry
            const entry = {
                id: doc.id,
                text: doc.text,
                metadata: doc.metadata,
                dimensions: embedding.dimensions,
            };
            if (existingIds.has(doc.id)) {
                const idx = index.entries.findIndex((e) => e.id === doc.id);
                if (idx !== -1)
                    index.entries[idx] = entry;
            }
            else {
                index.entries.push(entry);
                existingIds.add(doc.id);
            }
        }
        this.writeIndex(index);
        this.writeStats({
            totalDocuments: index.entries.length,
            dimensions,
            provider: providerName,
            lastIndexedAt: Date.now(),
        });
        log.info('vector-store', 'documents_added', {
            count: documents.length,
            total: index.entries.length,
            provider: providerName,
        });
    }
    /**
     * Search for documents by semantic similarity to the query text.
     *
     * Embeds the query, computes cosine similarity against all stored vectors,
     * applies optional metadata filters, and returns the top-k results sorted
     * by descending similarity score.
     *
     * @param query - Natural language query to search for.
     * @param topK - Maximum number of results. Defaults to options.maxResults.
     * @param filter - Optional metadata filter to narrow candidates before ranking.
     * @returns Array of SearchResult sorted by score descending.
     * @throws EmbeddingUnavailableError if neither embedding provider is reachable.
     */
    async search(query, topK, filter) {
        const log = getLogger();
        this.ensureInitialized();
        const k = topK ?? this.options.maxResults;
        const index = this.readIndex();
        if (index.entries.length === 0) {
            log.debug('vector-store', 'search_empty_store', { query });
            return [];
        }
        // Embed the query
        const queryEmbedding = await this.embeddingService.embed(query);
        const queryVector = queryEmbedding.vector;
        // Apply metadata pre-filter to reduce the vector comparison set
        const candidates = filter ? applyMetadataFilter(index.entries, filter) : index.entries;
        if (candidates.length === 0) {
            log.debug('vector-store', 'search_no_candidates', { query, filter });
            return [];
        }
        // Compute cosine similarity for each candidate
        const scored = [];
        for (const entry of candidates) {
            const vectorFile = this.readVectorFile(entry.id);
            if (!vectorFile) {
                log.warn('vector-store', 'missing_vector_file', { id: entry.id });
                continue;
            }
            const score = cosineSimilarity(queryVector, vectorFile.vector);
            scored.push({ entry, score });
        }
        // Sort by descending score, take top-k
        scored.sort((a, b) => b.score - a.score);
        const topResults = scored.slice(0, k);
        const results = topResults.map(({ entry, score }) => ({
            id: entry.id,
            text: entry.text,
            metadata: entry.metadata,
            score,
            distance: 1 - score,
        }));
        log.debug('vector-store', 'search_complete', {
            query,
            candidates: candidates.length,
            results: results.length,
            topScore: results[0]?.score ?? 0,
        });
        return results;
    }
    /**
     * Remove documents from the vector store by ID.
     *
     * Missing IDs are silently ignored.
     *
     * @param ids - Array of document IDs to remove.
     */
    async delete(ids) {
        if (ids.length === 0)
            return;
        const log = getLogger();
        this.ensureInitialized();
        const idSet = new Set(ids);
        const index = this.readIndex();
        const beforeCount = index.entries.length;
        index.entries = index.entries.filter((e) => {
            if (!idSet.has(e.id))
                return true;
            // Delete the corresponding vector file
            const vectorPath = this.vectorFilePath(e.id);
            if (existsSync(vectorPath)) {
                try {
                    unlinkSync(vectorPath);
                }
                catch {
                    log.warn('vector-store', 'vector_file_delete_failed', { id: e.id });
                }
            }
            return false;
        });
        const removedCount = beforeCount - index.entries.length;
        this.writeIndex(index);
        if (index.entries.length === 0) {
            this.writeStats({
                totalDocuments: 0,
                dimensions: 0,
                provider: '',
                lastIndexedAt: Date.now(),
            });
        }
        else {
            const existingStats = this.readStats();
            if (existingStats) {
                this.writeStats({ ...existingStats, totalDocuments: index.entries.length });
            }
        }
        log.info('vector-store', 'documents_deleted', {
            requested: ids.length,
            removed: removedCount,
            remaining: index.entries.length,
        });
    }
    /**
     * Rebuild the vector store from source JSONL files.
     *
     * Scans all configured sourceDirs for *.jsonl files, reads every entry,
     * re-embeds all texts, and re-inserts them into a fresh store.
     * This is the recovery path when the store is corrupted or after an
     * embedding provider switch causes a dimension mismatch.
     *
     * @throws EmbeddingUnavailableError if neither provider is reachable.
     */
    async rebuild() {
        const log = getLogger();
        log.info('vector-store', 'rebuild_start', { sourceDirs: this.options.sourceDirs });
        // Clear existing data
        this.clearStore();
        // Read source JSONL files
        const sourceDocuments = this.loadSourceDocuments();
        log.info('vector-store', 'rebuild_source_loaded', { count: sourceDocuments.length });
        if (sourceDocuments.length === 0) {
            this.writeIndex({ entries: [] });
            this.writeStats({
                totalDocuments: 0,
                dimensions: 0,
                provider: '',
                lastIndexedAt: Date.now(),
            });
            log.info('vector-store', 'rebuild_complete', { indexed: 0 });
            return;
        }
        // Re-embed and re-insert in batches
        const BATCH_SIZE = 50;
        let indexed = 0;
        for (let i = 0; i < sourceDocuments.length; i += BATCH_SIZE) {
            const batch = sourceDocuments.slice(i, i + BATCH_SIZE);
            try {
                await this.add(batch);
                indexed += batch.length;
                log.debug('vector-store', 'rebuild_batch', {
                    progress: `${indexed}/${sourceDocuments.length}`,
                });
            }
            catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                log.error('vector-store', 'rebuild_batch_failed', { offset: i, reason });
                throw err;
            }
        }
        log.info('vector-store', 'rebuild_complete', {
            indexed,
            sourceDirs: this.options.sourceDirs,
        });
    }
    /**
     * Return summary statistics for the current vector store collection.
     *
     * @returns CollectionStats with document count, dimensions, provider, and timestamp.
     */
    async getStats() {
        this.ensureInitialized();
        const stats = this.readStats();
        if (stats) {
            return {
                totalDocuments: stats.totalDocuments,
                dimensions: stats.dimensions,
                provider: stats.provider,
                lastIndexedAt: stats.lastIndexedAt,
            };
        }
        return {
            totalDocuments: 0,
            dimensions: 0,
            provider: '',
            lastIndexedAt: 0,
        };
    }
    // ── Private helpers ───────────────────────────────────────────────────────
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('VectorStore is not initialized. Call initialize() before using the store.');
        }
    }
    vectorFilePath(id) {
        // Sanitise ID to safe filename characters
        const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
        return join(this.storePath, `${safeId}.vec.json`);
    }
    readIndex() {
        const indexPath = join(this.storePath, INDEX_FILE);
        if (!existsSync(indexPath)) {
            return { entries: [] };
        }
        try {
            const raw = readFileSync(indexPath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return { entries: [] };
        }
    }
    writeIndex(index) {
        const indexPath = join(this.storePath, INDEX_FILE);
        writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    }
    readStats() {
        const statsPath = join(this.storePath, STATS_FILE);
        if (!existsSync(statsPath))
            return null;
        try {
            const raw = readFileSync(statsPath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    writeStats(stats) {
        const statsPath = join(this.storePath, STATS_FILE);
        writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
    }
    readVectorFile(id) {
        const vectorPath = this.vectorFilePath(id);
        if (!existsSync(vectorPath))
            return null;
        try {
            const raw = readFileSync(vectorPath, 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /**
     * Remove all vector files, index, and stats — but keep the directory.
     */
    clearStore() {
        const log = getLogger();
        if (!existsSync(this.storePath))
            return;
        const files = readdirSync(this.storePath);
        for (const file of files) {
            try {
                unlinkSync(join(this.storePath, file));
            }
            catch {
                log.warn('vector-store', 'clear_file_failed', { file });
            }
        }
    }
    /**
     * Scan sourceDirs for JSONL files and convert entries to MemoryDocuments.
     * Skips malformed lines and files that cannot be read.
     */
    loadSourceDocuments() {
        const log = getLogger();
        const documents = [];
        const seenIds = new Set();
        for (const sourceDir of this.options.sourceDirs) {
            const resolvedDir = resolve(this.workDir, sourceDir);
            if (!existsSync(resolvedDir)) {
                log.debug('vector-store', 'source_dir_missing', { dir: resolvedDir });
                continue;
            }
            const files = readdirSync(resolvedDir, { withFileTypes: true });
            for (const dirent of files) {
                if (!dirent.isFile() || !dirent.name.endsWith('.jsonl'))
                    continue;
                const filePath = join(resolvedDir, dirent.name);
                try {
                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.length === 0)
                            continue;
                        try {
                            const entry = JSON.parse(trimmed);
                            const doc = this.entryToMemoryDocument(entry, filePath);
                            if (doc && !seenIds.has(doc.id)) {
                                documents.push(doc);
                                seenIds.add(doc.id);
                            }
                        }
                        catch {
                            // Skip malformed lines
                        }
                    }
                }
                catch {
                    log.warn('vector-store', 'source_file_read_failed', { file: filePath });
                }
            }
        }
        return documents;
    }
    /**
     * Convert a raw JSONL entry (from knowledge files) to a MemoryDocument.
     * Returns null if the entry cannot be mapped to a valid MemoryDocument.
     *
     * @param entry - Parsed JSON object from a JSONL line.
     * @param sourcePath - File path used as the source metadata field.
     */
    entryToMemoryDocument(entry, sourcePath) {
        // Require at least an id and some text content
        const id = typeof entry.id === 'string' ? entry.id : null;
        const text = typeof entry.content === 'string' ? entry.content
            : typeof entry.text === 'string' ? entry.text
                : null;
        if (!id || !text || text.trim().length === 0)
            return null;
        // Map entry type to MemoryDocument type
        const rawType = typeof entry.type === 'string' ? entry.type : '';
        const docType = mapEntryType(rawType);
        // Map scope
        const rawScope = typeof entry.scope === 'string' ? entry.scope : '';
        const docScope = mapScope(rawScope);
        // Parse tags
        const tags = Array.isArray(entry.tags)
            ? entry.tags.filter((t) => typeof t === 'string')
            : [];
        // Parse timestamp
        let timestamp = Date.now();
        if (typeof entry.timestamp === 'number') {
            timestamp = entry.timestamp;
        }
        else if (typeof entry.created_at === 'string') {
            const parsed = new Date(entry.created_at).getTime();
            if (!isNaN(parsed))
                timestamp = parsed;
        }
        return {
            id,
            text,
            metadata: {
                source: sourcePath,
                scope: docScope,
                tags,
                timestamp,
                type: docType,
            },
        };
    }
}
// ── Metadata filtering ────────────────────────────────────────────────────────
/**
 * Apply a MetadataFilter to an array of index entries.
 * All non-undefined filter fields must match (AND semantics).
 * tags uses OR matching — any overlapping tag qualifies.
 *
 * @param entries - Full list of index entries to filter.
 * @param filter - Filter criteria.
 * @returns Subset of entries that match all criteria.
 */
function applyMetadataFilter(entries, filter) {
    return entries.filter((entry) => {
        if (filter.scope !== undefined && entry.metadata.scope !== filter.scope) {
            return false;
        }
        if (filter.type !== undefined && entry.metadata.type !== filter.type) {
            return false;
        }
        if (filter.since !== undefined && entry.metadata.timestamp < filter.since) {
            return false;
        }
        if (filter.tags !== undefined && filter.tags.length > 0) {
            const entryTagSet = new Set(entry.metadata.tags);
            const hasMatch = filter.tags.some((t) => entryTagSet.has(t));
            if (!hasMatch)
                return false;
        }
        return true;
    });
}
/**
 * Map a raw JSONL entry type string to a valid MemoryDocument type.
 * Unknown types default to 'fact'.
 */
function mapEntryType(raw) {
    const valid = ['decision', 'error', 'pattern', 'fact', 'lesson'];
    const lower = raw.toLowerCase();
    return valid.includes(lower) ? lower : 'fact';
}
/**
 * Map a raw scope string to a valid MemoryDocument scope.
 * Unknown scopes default to 'project'.
 */
function mapScope(raw) {
    const valid = ['project', 'framework', 'global'];
    const lower = raw.toLowerCase();
    return valid.includes(lower) ? lower : 'project';
}
// ── Named export for testing cosineSimilarity ─────────────────────────────────
export { cosineSimilarity, applyMetadataFilter };
//# sourceMappingURL=vector-store.js.map
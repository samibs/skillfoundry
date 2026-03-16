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
import type { EmbeddingService } from './embedding-service.js';
/**
 * A memory document to be stored and searched in the vector store.
 */
export interface MemoryDocument {
    /** UUID — unique identifier for this document. */
    id: string;
    /** The text content to embed and search. */
    text: string;
    /** Structured metadata for filtering and provenance. */
    metadata: {
        /** File path or memory category that produced this entry. */
        source: string;
        /** Memory scope for access control. */
        scope: 'project' | 'framework' | 'global';
        /** Classification tags for filtering. */
        tags: string[];
        /** Unix milliseconds — when this document was created. */
        timestamp: number;
        /** Entry type for semantic classification. */
        type: 'decision' | 'error' | 'pattern' | 'fact' | 'lesson';
    };
}
/**
 * A single result returned from a similarity search.
 */
export interface SearchResult {
    /** Document identifier. */
    id: string;
    /** Original text content. */
    text: string;
    /** Document metadata. */
    metadata: MemoryDocument['metadata'];
    /** Cosine similarity score in [0, 1] — higher means more similar. */
    score: number;
    /** Raw cosine distance (1 - score). */
    distance: number;
}
/**
 * Filter criteria for metadata-based narrowing of search results.
 * All provided fields are applied as AND conditions.
 * tags is an OR match across the provided values.
 */
export interface MetadataFilter {
    /** Match only documents with this scope. */
    scope?: string;
    /** Match only documents with this type. */
    type?: string;
    /** Match documents that have at least one of these tags (OR). */
    tags?: string[];
    /** Match only documents created at or after this Unix millisecond timestamp. */
    since?: number;
}
/**
 * Summary statistics about the current vector store collection.
 */
export interface CollectionStats {
    /** Total number of indexed documents. */
    totalDocuments: number;
    /** Vector dimensionality of the stored embeddings. */
    dimensions: number;
    /** Name of the embedding provider that populated the store. */
    provider: string;
    /** Unix milliseconds of the most recent add() or rebuild() call. */
    lastIndexedAt: number;
}
/**
 * Configuration for VectorStore construction.
 */
export interface VectorStoreOptions {
    /**
     * Directory where vector files are persisted.
     * Default: '.skillfoundry/memory/vectors'
     */
    persistPath: string;
    /**
     * Default number of results returned by search().
     * Default: 10
     */
    maxResults: number;
    /**
     * Source directories scanned by rebuild().
     * Default: ['memory_bank', '.sf/memory']
     */
    sourceDirs: string[];
}
interface IndexEntry {
    id: string;
    text: string;
    metadata: MemoryDocument['metadata'];
    dimensions: number;
}
/**
 * Compute cosine similarity between two vectors of equal dimensionality.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity in [0, 1]. Returns 0 when either vector has zero magnitude.
 */
declare function cosineSimilarity(a: number[], b: number[]): number;
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
export declare class VectorStore {
    private readonly embeddingService;
    private readonly options;
    private readonly storePath;
    private initialized;
    /**
     * @param embeddingService - Service used to embed texts for storage and queries.
     * @param workDir - Project root directory. All paths are resolved relative to this.
     * @param options - Optional store configuration overrides.
     */
    constructor(embeddingService: EmbeddingService, workDir: string, options?: Partial<VectorStoreOptions>);
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
    initialize(): Promise<void>;
    /**
     * Add or update memory documents in the vector store.
     *
     * Existing documents with the same ID are replaced (upsert semantics).
     * Embeds each document's text via the EmbeddingService and writes to disk.
     *
     * @param documents - Array of memory documents to index.
     * @throws EmbeddingUnavailableError if neither embedding provider is reachable.
     */
    add(documents: MemoryDocument[]): Promise<void>;
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
    search(query: string, topK?: number, filter?: MetadataFilter): Promise<SearchResult[]>;
    /**
     * Remove documents from the vector store by ID.
     *
     * Missing IDs are silently ignored.
     *
     * @param ids - Array of document IDs to remove.
     */
    delete(ids: string[]): Promise<void>;
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
    rebuild(): Promise<void>;
    /**
     * Return summary statistics for the current vector store collection.
     *
     * @returns CollectionStats with document count, dimensions, provider, and timestamp.
     */
    getStats(): Promise<CollectionStats>;
    private ensureInitialized;
    private vectorFilePath;
    private readIndex;
    private writeIndex;
    private readStats;
    private writeStats;
    private readVectorFile;
    /**
     * Remove all vector files, index, and stats — but keep the directory.
     */
    private clearStore;
    /**
     * Scan sourceDirs for JSONL files and convert entries to MemoryDocuments.
     * Skips malformed lines and files that cannot be read.
     */
    private loadSourceDocuments;
    /**
     * Convert a raw JSONL entry (from knowledge files) to a MemoryDocument.
     * Returns null if the entry cannot be mapped to a valid MemoryDocument.
     *
     * @param entry - Parsed JSON object from a JSONL line.
     * @param sourcePath - File path used as the source metadata field.
     */
    private entryToMemoryDocument;
}
/**
 * Apply a MetadataFilter to an array of index entries.
 * All non-undefined filter fields must match (AND semantics).
 * tags uses OR matching — any overlapping tag qualifies.
 *
 * @param entries - Full list of index entries to filter.
 * @param filter - Filter criteria.
 * @returns Subset of entries that match all criteria.
 */
declare function applyMetadataFilter(entries: IndexEntry[], filter: MetadataFilter): IndexEntry[];
export { cosineSimilarity, applyMetadataFilter };

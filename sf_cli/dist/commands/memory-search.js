/**
 * Memory Search command handler for SkillFoundry CLI.
 *
 * Implements `sf memory search "<query>"` with semantic ranking via VectorStore
 * (when embeddings are available) and TF-IDF fallback via layered-recall.
 *
 * @module memory-search
 */
import { EmbeddingService, EmbeddingUnavailableError } from '../core/embedding-service.js';
import { VectorStore } from '../core/vector-store.js';
import { recallIndex, recallPreview, recallFull } from '../core/layered-recall.js';
import { getLogger } from '../utils/logger.js';
// ── Argument parsing ──────────────────────────────────────────────────────────
/** Maximum allowed top-k value. */
const MAX_TOP_K = 50;
/** Default top-k when not specified. */
const DEFAULT_TOP_K = 10;
/** Preview text truncation length (characters). */
const PREVIEW_LENGTH = 200;
/**
 * Parse raw CLI argument string into a validated MemorySearchOptions object.
 *
 * Supported flags:
 *   --mode index|preview|full
 *   --top-k N
 *   --scope project|framework|global
 *   --json
 *
 * @param args - Raw argument string following the 'search' subcommand token.
 * @returns Parsed options or an error string to return to the user.
 */
export function parseSearchArgs(args) {
    const parts = tokenise(args);
    let query = '';
    let mode = 'preview';
    let topK = DEFAULT_TOP_K;
    let scope;
    let json = false;
    let i = 0;
    while (i < parts.length) {
        const token = parts[i];
        if (token === '--mode') {
            i++;
            const val = parts[i];
            if (val !== 'index' && val !== 'preview' && val !== 'full') {
                return `Invalid --mode value "${val ?? ''}". Use: index, preview, full`;
            }
            mode = val;
        }
        else if (token === '--top-k') {
            i++;
            const n = parseInt(parts[i] ?? '', 10);
            if (isNaN(n) || n < 1) {
                return `Invalid --top-k value "${parts[i] ?? ''}". Must be a positive integer.`;
            }
            topK = Math.min(n, MAX_TOP_K);
        }
        else if (token === '--scope') {
            i++;
            const val = parts[i];
            if (val !== 'project' && val !== 'framework' && val !== 'global') {
                return `Invalid --scope value "${val ?? ''}". Use: project, framework, global`;
            }
            scope = val;
        }
        else if (token === '--json') {
            json = true;
        }
        else if (!token.startsWith('--')) {
            // Unquoted query fragment — accumulate
            query += (query ? ' ' : '') + token;
        }
        else {
            return `Unknown flag "${token}".`;
        }
        i++;
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [
            'Usage: /memory search "<query>" [--mode index|preview|full] [--top-k N] [--scope project|framework|global] [--json]',
            '',
            'Example: /memory search "authentication flow" --mode preview --top-k 5',
        ].join('\n');
    }
    return {
        query: trimmedQuery,
        mode,
        topK,
        scope,
        json,
    };
}
/**
 * Split an argument string into tokens, respecting quoted strings.
 * Both single and double quotes are supported.
 *
 * @param args - Raw argument string.
 * @returns Array of individual tokens.
 */
export function tokenise(args) {
    const tokens = [];
    let current = '';
    let inQuote = '';
    for (let i = 0; i < args.length; i++) {
        const ch = args[i];
        if (inQuote) {
            if (ch === inQuote) {
                inQuote = '';
                if (current)
                    tokens.push(current);
                current = '';
            }
            else {
                current += ch;
            }
        }
        else if (ch === '"' || ch === "'") {
            inQuote = ch;
        }
        else if (ch === ' ' || ch === '\t') {
            if (current) {
                tokens.push(current);
                current = '';
            }
        }
        else {
            current += ch;
        }
    }
    if (current)
        tokens.push(current);
    return tokens;
}
// ── Semantic search (VectorStore) ────────────────────────────────────────────
/**
 * Execute a semantic search via VectorStore + EmbeddingService.
 *
 * Initialises the store on each call (no persistent state between CLI invocations).
 * Throws EmbeddingUnavailableError when neither Ollama nor OpenAI is reachable;
 * the caller falls back to TF-IDF search in that case.
 *
 * @param query - Natural language query text.
 * @param topK - Maximum number of results.
 * @param scope - Optional scope filter.
 * @param workDir - Project root directory.
 * @returns Tuple of [SearchResult[], providerName, modelName].
 * @throws EmbeddingUnavailableError when no embedding provider is reachable.
 */
export async function runSemanticSearch(query, topK, scope, workDir) {
    const embeddingService = new EmbeddingService();
    const store = new VectorStore(embeddingService, workDir);
    await store.initialize();
    const filter = scope ? { scope } : undefined;
    const results = await store.search(query, topK, filter);
    // Determine the active provider name and model for the header
    let providerName = 'unknown';
    let modelName = 'unknown';
    try {
        const provider = await embeddingService.getActiveProvider();
        providerName = provider.name;
        modelName = provider.name === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small';
    }
    catch {
        // Non-critical — already have results
    }
    return [results, providerName, modelName];
}
// ── TF-IDF fallback search ────────────────────────────────────────────────────
/** Normalisation ceiling for TF-IDF scores when converting to [0, 1]. */
const TFIDF_MAX_SCORE = 200;
/**
 * Execute a TF-IDF keyword search via layered-recall as fallback.
 * Normalises raw scores to [0, 1] for consistent display alongside semantic scores.
 *
 * @param query - Natural language query text.
 * @param topK - Maximum number of results.
 * @param mode - Display mode controlling how much text to return.
 * @param scope - Optional scope filter (applied post-search on metadata if present).
 * @param workDir - Project root directory.
 * @returns Array of FormattedSearchResult.
 */
export function runKeywordSearch(query, topK, mode, scope, workDir) {
    const indexResults = recallIndex(query, workDir, { limit: topK });
    // For full mode, load complete content; for preview/index, use recall layering
    const ids = indexResults.map((r) => r.id);
    if (ids.length === 0)
        return [];
    // Load content based on mode
    const contentMap = new Map();
    if (mode === 'full') {
        const fullResults = recallFull(ids, workDir);
        for (const r of fullResults) {
            contentMap.set(r.entry.id, r.entry.content);
        }
    }
    else {
        const previewResults = recallPreview(ids, workDir);
        for (const r of previewResults) {
            contentMap.set(r.id, r.content);
        }
    }
    // Map index results to FormattedSearchResult
    const formatted = [];
    for (const r of indexResults) {
        const text = contentMap.get(r.id) ?? r.snippet;
        // Optional scope filter: TF-IDF results don't have scope metadata,
        // so skip scope filtering for keyword results (scope metadata isn't available
        // in the KnowledgeEntry shape used by layered-recall).
        const normalised = Math.min(1, r.score / TFIDF_MAX_SCORE);
        formatted.push({
            id: r.id,
            score: parseFloat(normalised.toFixed(4)),
            title: deriveTitle(text),
            text,
            source: 'memory_bank/knowledge',
            scope: scope ?? 'project',
            type: r.type,
            tags: [],
            timestamp: 0,
        });
    }
    return formatted;
}
// ── Result conversion ──────────────────────────────────────────────────────────
/**
 * Convert VectorStore SearchResult array to FormattedSearchResult array.
 *
 * @param results - Raw semantic search results.
 * @param mode - Display mode controlling text truncation.
 * @returns Array of FormattedSearchResult.
 */
export function convertSemanticResults(results, mode) {
    return results.map((r) => {
        const text = mode === 'full' ? r.text : truncate(r.text, PREVIEW_LENGTH);
        return {
            id: r.id,
            score: parseFloat(r.score.toFixed(4)),
            title: deriveTitle(r.text),
            text,
            source: r.metadata.source,
            scope: r.metadata.scope,
            type: r.metadata.type,
            tags: r.metadata.tags,
            timestamp: r.metadata.timestamp,
        };
    });
}
// ── Output formatters ─────────────────────────────────────────────────────────
/**
 * Format search results as a JSON string conforming to SearchJsonOutput schema.
 *
 * @param query - The original search query.
 * @param providerName - Embedding provider name.
 * @param modelName - Embedding model name.
 * @param latencyMs - Search latency in milliseconds.
 * @param results - Raw vector store results (or empty when keyword search was used).
 * @returns Formatted JSON string.
 */
export function formatJsonOutput(query, providerName, modelName, latencyMs, results) {
    const output = {
        query,
        provider: providerName,
        model: modelName,
        latency_ms: latencyMs,
        results: results.map((r) => ({
            id: r.id,
            score: parseFloat(r.score.toFixed(4)),
            text: r.text,
            metadata: {
                source: r.metadata.source,
                scope: r.metadata.scope,
                type: r.metadata.type,
                tags: r.metadata.tags,
                timestamp: r.metadata.timestamp,
            },
        })),
    };
    return JSON.stringify(output, null, 2);
}
/**
 * Format results in index mode: one line per result with score and title.
 *
 * @param results - Formatted search results.
 * @returns Multi-line string ready for stdout.
 */
export function formatIndexOutput(results) {
    if (results.length === 0)
        return 'No matching memories found.';
    const lines = [];
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const score = r.score.toFixed(2);
        lines.push(`  ${i + 1}. [${score}] ${r.id} │ ${r.title}`);
    }
    return lines.join('\n');
}
/**
 * Format results in preview mode: score, title, metadata line, and truncated text.
 *
 * @param results - Formatted search results.
 * @param query - The original query (for the header line).
 * @param providerName - Provider name for the header.
 * @param latencyMs - Latency for the header.
 * @returns Multi-line string ready for stdout.
 */
export function formatPreviewOutput(results, query, providerName, latencyMs) {
    if (results.length === 0)
        return 'No matching memories found.';
    const separator = '─'.repeat(63);
    const lines = [
        '',
        `  Memory Search: "${query}"`,
        `  Provider: ${providerName} │ Results: ${results.length} │ Latency: ${latencyMs}ms`,
        `  ${separator}`,
        '',
    ];
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const score = r.score.toFixed(2);
        const dateStr = r.timestamp > 0 ? new Date(r.timestamp).toISOString().slice(0, 10) : 'unknown';
        const preview = truncate(r.text, PREVIEW_LENGTH);
        lines.push(`  ${i + 1}. [${score}] ${r.title}`);
        lines.push(`     Scope: ${r.scope} │ Type: ${r.type} │ ${dateStr}`);
        lines.push(`     ${preview}`);
        lines.push('');
    }
    return lines.join('\n');
}
/**
 * Format results in full mode: score, title, metadata line, and complete text.
 *
 * @param results - Formatted search results.
 * @param query - The original query (for the header).
 * @param providerName - Provider name for the header.
 * @param latencyMs - Latency for the header.
 * @returns Multi-line string ready for stdout.
 */
export function formatFullOutput(results, query, providerName, latencyMs) {
    if (results.length === 0)
        return 'No matching memories found.';
    const separator = '─'.repeat(63);
    const lines = [
        '',
        `  Memory Search: "${query}"`,
        `  Provider: ${providerName} │ Results: ${results.length} │ Latency: ${latencyMs}ms`,
        `  ${separator}`,
        '',
    ];
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const score = r.score.toFixed(2);
        const dateStr = r.timestamp > 0 ? new Date(r.timestamp).toISOString().slice(0, 10) : 'unknown';
        lines.push(`  ${i + 1}. [${score}] ${r.title}`);
        lines.push(`     Scope: ${r.scope} │ Type: ${r.type} │ ${dateStr}`);
        if (r.tags.length > 0) {
            lines.push(`     Tags: ${r.tags.join(', ')}`);
        }
        lines.push(`     Source: ${r.source}`);
        lines.push('');
        lines.push(`     ${r.text.replace(/\n/g, '\n     ')}`);
        lines.push('');
    }
    return lines.join('\n');
}
// ── Main execute function ─────────────────────────────────────────────────────
/**
 * Execute the `memory search` subcommand.
 *
 * Flow:
 *   1. Parse CLI arguments.
 *   2. Attempt semantic search via VectorStore + EmbeddingService.
 *   3. On EmbeddingUnavailableError, fall back to TF-IDF keyword search.
 *   4. Format results according to --mode flag.
 *   5. Return formatted output string.
 *
 * @param args - Raw argument string (everything after `memory search`).
 * @param session - Active session context providing workDir.
 * @returns Formatted output string for display.
 */
export async function executeMemorySearch(args, session) {
    const log = getLogger();
    const parsed = parseSearchArgs(args);
    // Return usage/error messages directly
    if (typeof parsed === 'string')
        return parsed;
    const { query, mode, topK, scope, json } = parsed;
    const startMs = Date.now();
    let formattedResults = [];
    let providerName = 'keyword';
    let modelName = 'tfidf';
    let rawResults = [];
    let usedFallback = false;
    try {
        const [semanticResults, provider, model] = await runSemanticSearch(query, topK, scope, session.workDir);
        rawResults = semanticResults;
        providerName = provider;
        modelName = model;
        if (semanticResults.length === 0) {
            // Check if the store is empty vs. no matches
            const latencyMs = Date.now() - startMs;
            log.info('memory-search', 'no_results', { query, provider, latencyMs });
            if (json) {
                return formatJsonOutput(query, provider, model, latencyMs, []);
            }
            return 'No matching memories found.';
        }
        formattedResults = convertSemanticResults(semanticResults, mode);
    }
    catch (err) {
        if (err instanceof EmbeddingUnavailableError) {
            log.warn('memory-search', 'semantic_unavailable', {
                reason: err.message,
                fallback: 'keyword',
            });
            usedFallback = true;
            formattedResults = runKeywordSearch(query, topK, mode, scope, session.workDir);
        }
        else {
            const reason = err instanceof Error ? err.message : String(err);
            log.error('memory-search', 'search_error', { query, reason });
            return `Memory search failed: ${reason}`;
        }
    }
    const latencyMs = Date.now() - startMs;
    log.info('memory-search', 'search_complete', {
        query,
        results: formattedResults.length,
        provider: providerName,
        latencyMs,
        fallback: usedFallback,
    });
    // JSON output
    if (json) {
        return formatJsonOutput(query, providerName, modelName, latencyMs, rawResults);
    }
    // Build warning prefix when falling back to keyword search
    const warningPrefix = usedFallback
        ? 'Warning: ChromaDB unavailable, using keyword search\n\n'
        : '';
    if (formattedResults.length === 0) {
        return `${warningPrefix}No matching memories found.`;
    }
    switch (mode) {
        case 'index':
            return warningPrefix + formatIndexOutput(formattedResults);
        case 'full':
            return warningPrefix + formatFullOutput(formattedResults, query, providerName, latencyMs);
        case 'preview':
        default:
            return warningPrefix + formatPreviewOutput(formattedResults, query, providerName, latencyMs);
    }
}
// ── Private helpers ───────────────────────────────────────────────────────────
/**
 * Truncate text to maxLen characters, replacing trailing chars with '...'.
 * Newlines are collapsed to spaces for single-line display.
 *
 * @param text - Input text.
 * @param maxLen - Maximum character count.
 * @returns Truncated string.
 */
function truncate(text, maxLen) {
    if (!text)
        return '';
    const flat = text.replace(/\n/g, ' ').trim();
    if (flat.length <= maxLen)
        return flat;
    return flat.slice(0, maxLen - 3) + '...';
}
/**
 * Derive a short display title from the first sentence or first 80 characters of text.
 *
 * @param text - Full document text.
 * @returns Single-line title string.
 */
function deriveTitle(text) {
    if (!text)
        return '(untitled)';
    const flat = text.replace(/\n/g, ' ').trim();
    // Use first sentence if it's reasonably short
    const dotIdx = flat.indexOf('. ');
    if (dotIdx > 0 && dotIdx <= 80) {
        return flat.slice(0, dotIdx + 1);
    }
    if (flat.length <= 80)
        return flat;
    return flat.slice(0, 77) + '...';
}
//# sourceMappingURL=memory-search.js.map
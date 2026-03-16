/**
 * Memory Search command handler for SkillFoundry CLI.
 *
 * Implements `sf memory search "<query>"` with semantic ranking via VectorStore
 * (when embeddings are available) and TF-IDF fallback via layered-recall.
 *
 * @module memory-search
 */
import type { SessionContext } from '../types.js';
import { type SearchResult } from '../core/vector-store.js';
/** Search mode controlling result verbosity. */
export type SearchMode = 'index' | 'preview' | 'full';
/** Parsed and validated options for a memory search operation. */
export interface MemorySearchOptions {
    /** Natural language query text. */
    query: string;
    /** Result verbosity level. Default: 'preview'. */
    mode: SearchMode;
    /** Maximum number of results to return. Clamped to [1, 50]. Default: 10. */
    topK: number;
    /** Optional memory scope filter: 'project' | 'framework' | 'global'. */
    scope: string | undefined;
    /** When true, emit raw JSON instead of formatted text. */
    json: boolean;
}
/** A single formatted search result shared across all output modes. */
export interface FormattedSearchResult {
    /** Document identifier. */
    id: string;
    /** Similarity or relevance score (0–1 for semantic, normalised for TF-IDF). */
    score: number;
    /** Short display title derived from first line of text. */
    title: string;
    /** Full document text. */
    text: string;
    /** Source file path or memory category. */
    source: string;
    /** Memory scope. */
    scope: string;
    /** Entry type. */
    type: string;
    /** Tags associated with this entry. */
    tags: string[];
    /** Unix milliseconds timestamp. */
    timestamp: number;
}
/** Top-level JSON output schema (used when --json flag is set). */
export interface SearchJsonOutput {
    query: string;
    provider: string;
    model: string;
    latency_ms: number;
    results: Array<{
        id: string;
        score: number;
        text: string;
        metadata: {
            source: string;
            scope: string;
            type: string;
            tags: string[];
            timestamp: number;
        };
    }>;
}
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
export declare function parseSearchArgs(args: string): MemorySearchOptions | string;
/**
 * Split an argument string into tokens, respecting quoted strings.
 * Both single and double quotes are supported.
 *
 * @param args - Raw argument string.
 * @returns Array of individual tokens.
 */
export declare function tokenise(args: string): string[];
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
export declare function runSemanticSearch(query: string, topK: number, scope: string | undefined, workDir: string): Promise<[SearchResult[], string, string]>;
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
export declare function runKeywordSearch(query: string, topK: number, mode: SearchMode, scope: string | undefined, workDir: string): FormattedSearchResult[];
/**
 * Convert VectorStore SearchResult array to FormattedSearchResult array.
 *
 * @param results - Raw semantic search results.
 * @param mode - Display mode controlling text truncation.
 * @returns Array of FormattedSearchResult.
 */
export declare function convertSemanticResults(results: SearchResult[], mode: SearchMode): FormattedSearchResult[];
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
export declare function formatJsonOutput(query: string, providerName: string, modelName: string, latencyMs: number, results: SearchResult[]): string;
/**
 * Format results in index mode: one line per result with score and title.
 *
 * @param results - Formatted search results.
 * @returns Multi-line string ready for stdout.
 */
export declare function formatIndexOutput(results: FormattedSearchResult[]): string;
/**
 * Format results in preview mode: score, title, metadata line, and truncated text.
 *
 * @param results - Formatted search results.
 * @param query - The original query (for the header line).
 * @param providerName - Provider name for the header.
 * @param latencyMs - Latency for the header.
 * @returns Multi-line string ready for stdout.
 */
export declare function formatPreviewOutput(results: FormattedSearchResult[], query: string, providerName: string, latencyMs: number): string;
/**
 * Format results in full mode: score, title, metadata line, and complete text.
 *
 * @param results - Formatted search results.
 * @param query - The original query (for the header).
 * @param providerName - Provider name for the header.
 * @param latencyMs - Latency for the header.
 * @returns Multi-line string ready for stdout.
 */
export declare function formatFullOutput(results: FormattedSearchResult[], query: string, providerName: string, latencyMs: number): string;
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
export declare function executeMemorySearch(args: string, session: SessionContext): Promise<string>;

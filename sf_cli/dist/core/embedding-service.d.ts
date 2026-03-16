/**
 * Vector Embedding Service for SkillFoundry CLI.
 *
 * Converts text to dense vectors using Ollama nomic-embed-text (768 dims) locally,
 * with automatic fallback to OpenAI text-embedding-3-small (1536 dims).
 *
 * Includes an in-memory LRU cache keyed by SHA-256 hash of the normalised text.
 * Both providers are reachable via the network; all HTTP calls use native fetch().
 *
 * @module embedding-service
 */
import type { EmbeddingProvider, EmbeddingResult, EmbeddingServiceOptions } from '../types.js';
/**
 * Thrown when both the primary and fallback embedding providers are unavailable.
 * The message lists each provider and the reason it failed.
 */
export declare class EmbeddingUnavailableError extends Error {
    /** Per-provider failure reasons for diagnostic output. */
    readonly failures: Record<string, string>;
    constructor(failures: Record<string, string>);
}
/**
 * Embedding provider backed by a locally-running Ollama instance.
 *
 * Uses the nomic-embed-text model which outputs 768-dimensional vectors.
 * Availability is determined by a GET to /api/tags with a 3-second timeout.
 */
export declare class OllamaEmbeddingProvider implements EmbeddingProvider {
    readonly name = "ollama";
    readonly dimensions = 768;
    private readonly baseUrl;
    private readonly model;
    /**
     * @param baseUrl - Ollama base URL, e.g. 'http://localhost:11434'.
     * @param model - Ollama model name. Default: 'nomic-embed-text'.
     */
    constructor(baseUrl: string, model?: string);
    /**
     * Check whether Ollama is running and the configured model is available.
     * Sends a GET /api/tags with a 3-second timeout.
     * @returns True when Ollama responds and the model is listed.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Embed a single text using Ollama's /api/embeddings endpoint.
     * @param text - Pre-processed text to embed.
     * @returns 768-dimensional float array.
     * @throws Error when Ollama returns a non-OK response or malformed JSON.
     */
    embed(text: string): Promise<number[]>;
    /**
     * Embed multiple texts by calling embed() sequentially within each batch.
     * Ollama processes one request at a time, so batching is only for flow control.
     *
     * @param texts - Array of pre-processed texts.
     * @param batchSize - Number of texts per sequential batch. Default: 10.
     * @returns Array of 768-dimensional vectors in input order.
     */
    embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
}
/**
 * Embedding provider backed by the OpenAI Embeddings API.
 *
 * Uses text-embedding-3-small which outputs 1536-dimensional vectors.
 * Availability is determined solely by the presence of the API key in the
 * options or the SF_OPENAI_API_KEY environment variable — no network call
 * is made during the availability check.
 */
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    readonly name = "openai";
    readonly dimensions = 1536;
    private readonly client;
    private readonly model;
    private readonly apiKey;
    /**
     * @param apiKey - OpenAI API key. Falls back to SF_OPENAI_API_KEY env var.
     * @param model - Model name. Default: 'text-embedding-3-small'.
     */
    constructor(apiKey?: string, model?: string);
    /**
     * Check whether the OpenAI provider is ready to serve requests.
     * No network call is made — only the API key presence is verified.
     * @returns True when SF_OPENAI_API_KEY is set and non-empty.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Embed a single text using the OpenAI Embeddings API.
     * @param text - Pre-processed text to embed.
     * @returns 1536-dimensional float array.
     * @throws Error when the API key is missing or the API returns an error.
     */
    embed(text: string): Promise<number[]>;
    /**
     * Embed multiple texts using OpenAI's native batch input support.
     * Sends up to batchSize texts per request.
     *
     * @param texts - Array of pre-processed texts.
     * @param batchSize - Max texts per API request. Default: 100.
     * @returns Array of 1536-dimensional vectors in input order.
     */
    embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
}
/**
 * High-level embedding service with provider abstraction, fallback logic,
 * text pre-processing, and an in-memory LRU cache.
 *
 * Provider priority:
 *   1. Preferred provider (default: Ollama)
 *   2. Fallback provider (the other one)
 *   3. null — caller falls back to TF-IDF or keyword search
 *
 * @example
 * ```typescript
 * const svc = new EmbeddingService();
 * const result = await svc.embed('implement user authentication');
 * console.log(result.vector.length); // 768 (Ollama) or 1536 (OpenAI)
 * ```
 */
export declare class EmbeddingService {
    private readonly primary;
    private readonly fallback;
    private readonly cache;
    private readonly options;
    /**
     * @param options - Service configuration. All fields are optional; defaults apply.
     *                  Pass partial options and the rest are filled from DEFAULT_OPTIONS.
     */
    constructor(options?: Partial<EmbeddingServiceOptions>);
    /**
     * Embed a single text string, with caching and automatic provider fallback.
     *
     * Steps:
     *   1. Pre-process (trim, NFC normalise, truncate).
     *   2. Compute SHA-256 cache key.
     *   3. Return cached result if present and not expired.
     *   4. Try primary provider.
     *   5. On failure, warn and try fallback provider.
     *   6. If both fail, throw EmbeddingUnavailableError.
     *   7. Cache successful result.
     *
     * @param text - Raw text to embed.
     * @returns EmbeddingResult with vector, provider name, dimensions, and cache flag.
     * @throws EmbeddingUnavailableError when both providers fail.
     */
    embed(text: string): Promise<EmbeddingResult>;
    /**
     * Embed multiple texts, returning null for texts where both providers fail.
     * Each text is independently pre-processed and cached.
     *
     * @param texts - Array of raw texts to embed.
     * @returns Array of EmbeddingResult objects, one per input text.
     * @throws EmbeddingUnavailableError when both providers are unavailable for
     *         any text in the batch.
     */
    embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
    /**
     * Return the currently preferred active provider by checking availability.
     * Falls back to the secondary provider if the primary is unavailable.
     *
     * @returns The first available EmbeddingProvider.
     * @throws EmbeddingUnavailableError when neither provider is available.
     */
    getActiveProvider(): Promise<EmbeddingProvider>;
    /**
     * Return the vector dimensionality of the currently active provider.
     * Used by ChromaDB collection setup (STORY-006) to configure the collection
     * for the right number of dimensions.
     *
     * @returns 768 (Ollama) or 1536 (OpenAI) of the active provider.
     * @throws EmbeddingUnavailableError when neither provider is available.
     */
    getDimensions(): Promise<number>;
    /**
     * Clear the in-memory embedding cache.
     * Useful in tests or when forcing a full re-embedding pass.
     */
    clearCache(): void;
    /** Current number of entries in the LRU cache. */
    get cacheSize(): number;
}

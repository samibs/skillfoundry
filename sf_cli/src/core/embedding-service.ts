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

import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { EmbeddingProvider, EmbeddingResult, EmbeddingServiceOptions } from '../types.js';
import { getLogger } from '../utils/logger.js';

// ── Custom error ────────────────────────────────────────────────────────────

/**
 * Thrown when both the primary and fallback embedding providers are unavailable.
 * The message lists each provider and the reason it failed.
 */
export class EmbeddingUnavailableError extends Error {
  /** Per-provider failure reasons for diagnostic output. */
  readonly failures: Record<string, string>;

  constructor(failures: Record<string, string>) {
    const detail = Object.entries(failures)
      .map(([p, r]) => `${p}: ${r}`)
      .join('; ');
    super(`All embedding providers unavailable — ${detail}`);
    this.name = 'EmbeddingUnavailableError';
    this.failures = failures;
  }
}

// ── LRU Cache ───────────────────────────────────────────────────────────────

interface CacheEntry {
  vector: number[];
  provider: string;
  dimensions: number;
  expiresAt: number;
}

/**
 * Minimal LRU cache backed by a Map (insertion-order = LRU order).
 * Evicts the oldest entry when maxSize is reached.
 */
class LruCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieve a non-expired cache entry.
   * @param key - SHA-256 hash of the normalised text.
   * @returns The cached entry, or undefined if missing or expired.
   */
  get(key: string): CacheEntry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU position — delete then re-insert
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  /**
   * Store a new cache entry, evicting the oldest when capacity is exceeded.
   * @param key - SHA-256 hash of the normalised text.
   * @param vector - The embedding vector to cache.
   * @param provider - Provider name that produced the vector.
   * @param dimensions - Vector dimensionality.
   */
  set(key: string, vector: number[], provider: string, dimensions: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict the oldest (first) entry
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(key, {
      vector,
      provider,
      dimensions,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Current number of cached entries (including possibly-expired ones not yet probed). */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.store.clear();
  }
}

// ── Text pre-processing ─────────────────────────────────────────────────────

/**
 * Normalise text before embedding:
 * 1. Trim leading/trailing whitespace.
 * 2. Normalise Unicode to NFC.
 * 3. Truncate to maxChunkLength characters, logging a warning if truncated.
 *
 * @param text - Raw input text.
 * @param maxChunkLength - Maximum character length.
 * @returns Normalised, possibly-truncated string.
 */
function preprocessText(text: string, maxChunkLength: number): string {
  const logger = getLogger();
  let processed = text.trim().normalize('NFC');
  if (processed.length > maxChunkLength) {
    logger.warn('embedding', 'text_truncated', {
      originalLength: processed.length,
      truncatedLength: maxChunkLength,
    });
    processed = processed.slice(0, maxChunkLength);
  }
  return processed;
}

/**
 * Compute a stable SHA-256 hex digest for use as a cache key.
 * @param text - Normalised text.
 * @returns 64-character hex string.
 */
function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── Ollama provider ─────────────────────────────────────────────────────────

/**
 * Embedding provider backed by a locally-running Ollama instance.
 *
 * Uses the nomic-embed-text model which outputs 768-dimensional vectors.
 * Availability is determined by a GET to /api/tags with a 3-second timeout.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly dimensions = 768;

  private readonly baseUrl: string;
  private readonly model: string;

  /**
   * @param baseUrl - Ollama base URL, e.g. 'http://localhost:11434'.
   * @param model - Ollama model name. Default: 'nomic-embed-text'.
   */
  constructor(baseUrl: string, model = 'nomic-embed-text') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  /**
   * Check whether Ollama is running and the configured model is available.
   * Sends a GET /api/tags with a 3-second timeout.
   * @returns True when Ollama responds and the model is listed.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const body = (await res.json()) as { models?: Array<{ name: string }> };
      if (!Array.isArray(body.models)) return false;
      return body.models.some((m) => m.name.startsWith(this.model));
    } catch {
      return false;
    }
  }

  /**
   * Embed a single text using Ollama's /api/embeddings endpoint.
   * @param text - Pre-processed text to embed.
   * @returns 768-dimensional float array.
   * @throws Error when Ollama returns a non-OK response or malformed JSON.
   */
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama embedding failed (${res.status}): ${errorText}`);
    }
    const body = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(body.embedding)) {
      throw new Error('Ollama returned no embedding array in response body');
    }
    return body.embedding;
  }

  /**
   * Embed multiple texts by calling embed() sequentially within each batch.
   * Ollama processes one request at a time, so batching is only for flow control.
   *
   * @param texts - Array of pre-processed texts.
   * @param batchSize - Number of texts per sequential batch. Default: 10.
   * @returns Array of 768-dimensional vectors in input order.
   */
  async embedBatch(texts: string[], batchSize = 10): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      for (const text of batch) {
        results.push(await this.embed(text));
      }
    }
    return results;
  }
}

// ── OpenAI provider ─────────────────────────────────────────────────────────

/**
 * Embedding provider backed by the OpenAI Embeddings API.
 *
 * Uses text-embedding-3-small which outputs 1536-dimensional vectors.
 * Availability is determined solely by the presence of the API key in the
 * options or the SF_OPENAI_API_KEY environment variable — no network call
 * is made during the availability check.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions = 1536;

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly apiKey: string | undefined;

  /**
   * @param apiKey - OpenAI API key. Falls back to SF_OPENAI_API_KEY env var.
   * @param model - Model name. Default: 'text-embedding-3-small'.
   */
  constructor(apiKey?: string, model = 'text-embedding-3-small') {
    this.apiKey = apiKey ?? process.env.SF_OPENAI_API_KEY;
    this.model = model;
    this.client = new OpenAI({ apiKey: this.apiKey ?? 'missing' });
  }

  /**
   * Check whether the OpenAI provider is ready to serve requests.
   * No network call is made — only the API key presence is verified.
   * @returns True when SF_OPENAI_API_KEY is set and non-empty.
   */
  async isAvailable(): Promise<boolean> {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  /**
   * Embed a single text using the OpenAI Embeddings API.
   * @param text - Pre-processed text to embed.
   * @returns 1536-dimensional float array.
   * @throws Error when the API key is missing or the API returns an error.
   */
  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not set (SF_OPENAI_API_KEY)');
    }
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error('OpenAI returned no embedding in response');
    }
    return vector;
  }

  /**
   * Embed multiple texts using OpenAI's native batch input support.
   * Sends up to batchSize texts per request.
   *
   * @param texts - Array of pre-processed texts.
   * @param batchSize - Max texts per API request. Default: 100.
   * @returns Array of 1536-dimensional vectors in input order.
   */
  async embedBatch(texts: string[], batchSize = 100): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not set (SF_OPENAI_API_KEY)');
    }
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
      });
      // OpenAI preserves order within a batch request
      for (const item of response.data) {
        results.push(item.embedding);
      }
    }
    return results;
  }
}

// ── EmbeddingService ─────────────────────────────────────────────────────────

/** Default options applied when none are provided to EmbeddingService. */
const DEFAULT_OPTIONS: EmbeddingServiceOptions = {
  preferredProvider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  openaiModel: 'text-embedding-3-small',
  maxChunkLength: 8192,
  cacheTtlMs: 3_600_000,
  maxCacheSize: 500,
};

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
export class EmbeddingService {
  private readonly primary: EmbeddingProvider;
  private readonly fallback: EmbeddingProvider;
  private readonly cache: LruCache;
  private readonly options: EmbeddingServiceOptions;

  /**
   * @param options - Service configuration. All fields are optional; defaults apply.
   *                  Pass partial options and the rest are filled from DEFAULT_OPTIONS.
   */
  constructor(options: Partial<EmbeddingServiceOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    const ollama = new OllamaEmbeddingProvider(
      this.options.ollamaUrl,
      this.options.ollamaModel,
    );
    const openai = new OpenAIEmbeddingProvider(
      this.options.openaiApiKey,
      this.options.openaiModel,
    );

    if (this.options.preferredProvider === 'ollama') {
      this.primary = ollama;
      this.fallback = openai;
    } else {
      this.primary = openai;
      this.fallback = ollama;
    }

    this.cache = new LruCache(this.options.maxCacheSize, this.options.cacheTtlMs);
  }

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
  async embed(text: string): Promise<EmbeddingResult> {
    const logger = getLogger();
    const normalised = preprocessText(text, this.options.maxChunkLength);
    const cacheKey = hashText(normalised);

    // Cache hit
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('embedding', 'cache_hit', { keyPrefix: cacheKey.slice(0, 8) });
      return {
        vector: cached.vector,
        provider: cached.provider,
        dimensions: cached.dimensions,
        cached: true,
      };
    }

    const failures: Record<string, string> = {};

    // Try primary provider
    const primaryAvailable = await this.primary.isAvailable();
    if (primaryAvailable) {
      try {
        const vector = await this.primary.embed(normalised);
        this.cache.set(cacheKey, vector, this.primary.name, this.primary.dimensions);
        logger.debug('embedding', 'embed_success', {
          provider: this.primary.name,
          dims: vector.length,
        });
        return {
          vector,
          provider: this.primary.name,
          dimensions: this.primary.dimensions,
          cached: false,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures[this.primary.name] = reason;
        logger.warn('embedding', 'primary_embed_failed', {
          provider: this.primary.name,
          reason,
        });
      }
    } else {
      failures[this.primary.name] = 'provider unavailable';
      logger.warn('embedding', 'provider_unavailable', {
        provider: this.primary.name,
        fallback: this.fallback.name,
        message: `${this.primary.name === 'ollama' ? 'Ollama unavailable' : this.primary.name + ' unavailable'}, using ${this.fallback.name} fallback`,
      });
    }

    // Try fallback provider
    const fallbackAvailable = await this.fallback.isAvailable();
    if (fallbackAvailable) {
      try {
        const vector = await this.fallback.embed(normalised);
        this.cache.set(cacheKey, vector, this.fallback.name, this.fallback.dimensions);
        logger.debug('embedding', 'embed_success', {
          provider: this.fallback.name,
          dims: vector.length,
          viafallback: true,
        });
        return {
          vector,
          provider: this.fallback.name,
          dimensions: this.fallback.dimensions,
          cached: false,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures[this.fallback.name] = reason;
        logger.error('embedding', 'fallback_embed_failed', {
          provider: this.fallback.name,
          reason,
        });
      }
    } else {
      failures[this.fallback.name] = 'provider unavailable';
    }

    throw new EmbeddingUnavailableError(failures);
  }

  /**
   * Embed multiple texts, returning null for texts where both providers fail.
   * Each text is independently pre-processed and cached.
   *
   * @param texts - Array of raw texts to embed.
   * @returns Array of EmbeddingResult objects, one per input text.
   * @throws EmbeddingUnavailableError when both providers are unavailable for
   *         any text in the batch.
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const logger = getLogger();
    const normalised = texts.map((t) => preprocessText(t, this.options.maxChunkLength));
    const results: EmbeddingResult[] = [];

    // Separate cached from uncached
    const uncachedIndexes: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < normalised.length; i++) {
      const key = hashText(normalised[i]);
      const cached = this.cache.get(key);
      if (cached) {
        results[i] = {
          vector: cached.vector,
          provider: cached.provider,
          dimensions: cached.dimensions,
          cached: true,
        };
      } else {
        uncachedIndexes.push(i);
        uncachedTexts.push(normalised[i]);
      }
    }

    if (uncachedTexts.length === 0) return results;

    // Determine which provider to use for batch
    const failures: Record<string, string> = {};
    let batchVectors: number[][] | null = null;
    let usedProvider: EmbeddingProvider | null = null;

    const primaryAvailable = await this.primary.isAvailable();
    if (primaryAvailable) {
      try {
        batchVectors = await this.primary.embedBatch(uncachedTexts);
        usedProvider = this.primary;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures[this.primary.name] = reason;
        logger.warn('embedding', 'batch_primary_failed', { reason });
      }
    } else {
      failures[this.primary.name] = 'provider unavailable';
    }

    if (!batchVectors) {
      const fallbackAvailable = await this.fallback.isAvailable();
      if (fallbackAvailable) {
        try {
          batchVectors = await this.fallback.embedBatch(uncachedTexts);
          usedProvider = this.fallback;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          failures[this.fallback.name] = reason;
          logger.error('embedding', 'batch_fallback_failed', { reason });
        }
      } else {
        failures[this.fallback.name] = 'provider unavailable';
      }
    }

    if (!batchVectors || !usedProvider) {
      throw new EmbeddingUnavailableError(failures);
    }

    for (let j = 0; j < uncachedIndexes.length; j++) {
      const originalIndex = uncachedIndexes[j];
      const vector = batchVectors[j];
      const key = hashText(normalised[originalIndex]);
      this.cache.set(key, vector, usedProvider.name, usedProvider.dimensions);
      results[originalIndex] = {
        vector,
        provider: usedProvider.name,
        dimensions: usedProvider.dimensions,
        cached: false,
      };
    }

    return results;
  }

  /**
   * Return the currently preferred active provider by checking availability.
   * Falls back to the secondary provider if the primary is unavailable.
   *
   * @returns The first available EmbeddingProvider.
   * @throws EmbeddingUnavailableError when neither provider is available.
   */
  async getActiveProvider(): Promise<EmbeddingProvider> {
    if (await this.primary.isAvailable()) return this.primary;
    if (await this.fallback.isAvailable()) return this.fallback;
    throw new EmbeddingUnavailableError({
      [this.primary.name]: 'provider unavailable',
      [this.fallback.name]: 'provider unavailable',
    });
  }

  /**
   * Return the vector dimensionality of the currently active provider.
   * Used by ChromaDB collection setup (STORY-006) to configure the collection
   * for the right number of dimensions.
   *
   * @returns 768 (Ollama) or 1536 (OpenAI) of the active provider.
   * @throws EmbeddingUnavailableError when neither provider is available.
   */
  async getDimensions(): Promise<number> {
    const provider = await this.getActiveProvider();
    return provider.dimensions;
  }

  /**
   * Clear the in-memory embedding cache.
   * Useful in tests or when forcing a full re-embedding pass.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /** Current number of entries in the LRU cache. */
  get cacheSize(): number {
    return this.cache.size;
  }
}

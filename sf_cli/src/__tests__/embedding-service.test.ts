/**
 * Unit tests for the Vector Embedding Service.
 *
 * All HTTP calls are intercepted via vi.stubGlobal('fetch', ...) so no real
 * network requests are made during the test run.
 * The openai SDK is mocked at the module level to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingService,
  EmbeddingUnavailableError,
  OllamaEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from '../core/embedding-service.js';

// ── Logger mock (prevents disk writes in tests) ────────────────────────────

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── OpenAI SDK mock ──────────────────────────────────────────────────────────

const mockEmbeddingsCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: mockEmbeddingsCreate,
      },
    })),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake 768-dim Ollama vector. */
function makeOllamaVector(): number[] {
  return Array.from({ length: 768 }, (_, i) => i * 0.001);
}

/** Build a fake 1536-dim OpenAI vector. */
function makeOpenAIVector(): number[] {
  return Array.from({ length: 1536 }, (_, i) => i * 0.0005);
}

/**
 * Stub global fetch to simulate Ollama responses.
 * @param tagsResponse - Shape returned by GET /api/tags.
 * @param embeddingResponse - Shape returned by POST /api/embeddings.
 */
function stubFetch(
  tagsResponse: { ok: boolean; body?: unknown },
  embeddingResponse?: { ok: boolean; body?: unknown },
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/tags')) {
        return Promise.resolve({
          ok: tagsResponse.ok,
          json: () => Promise.resolve(tagsResponse.body ?? {}),
          text: () => Promise.resolve(''),
          status: tagsResponse.ok ? 200 : 503,
          statusText: tagsResponse.ok ? 'OK' : 'Service Unavailable',
        });
      }
      if (urlStr.includes('/api/embeddings') && embeddingResponse) {
        return Promise.resolve({
          ok: embeddingResponse.ok,
          json: () => Promise.resolve(embeddingResponse.body ?? {}),
          text: () => Promise.resolve(embeddingResponse.ok ? 'ok' : 'error'),
          status: embeddingResponse.ok ? 200 : 500,
          statusText: embeddingResponse.ok ? 'OK' : 'Internal Server Error',
        });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${urlStr}`));
    }),
  );
}

/** Stub fetch so that all Ollama calls fail with a network error. */
function stubFetchNetworkError(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure no leaked env from prior tests
  delete process.env.SF_OPENAI_API_KEY;
  delete process.env.OLLAMA_HOST;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SF_OPENAI_API_KEY;
  delete process.env.OLLAMA_HOST;
});

// ─────────────────────────────────────────────────────────────────────────────
// OllamaEmbeddingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('OllamaEmbeddingProvider', () => {
  describe('isAvailable()', () => {
    it('returns true when Ollama responds and the model is listed', async () => {
      stubFetch({
        ok: true,
        body: { models: [{ name: 'nomic-embed-text:latest' }] },
      });
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when Ollama returns non-OK status', async () => {
      stubFetch({ ok: false });
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when Ollama is unreachable (network error)', async () => {
      stubFetchNetworkError();
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when model is not in the listed models', async () => {
      stubFetch({
        ok: true,
        body: { models: [{ name: 'llama3.1' }] },
      });
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when models list is missing from response', async () => {
      stubFetch({ ok: true, body: {} });
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('embed()', () => {
    it('returns a 768-dim vector from a successful Ollama response', async () => {
      const vector = makeOllamaVector();
      stubFetch(
        { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
        { ok: true, body: { embedding: vector } },
      );
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      const result = await provider.embed('hello world');
      expect(result).toHaveLength(768);
      expect(result[0]).toBeCloseTo(0);
    });

    it('throws when Ollama returns a non-OK status', async () => {
      stubFetch(
        { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
        { ok: false, body: {} },
      );
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      await expect(provider.embed('hello')).rejects.toThrow('Ollama embedding failed');
    });

    it('throws when response body has no embedding array', async () => {
      stubFetch(
        { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
        { ok: true, body: { message: 'no embedding here' } },
      );
      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      await expect(provider.embed('hello')).rejects.toThrow('no embedding array');
    });
  });

  describe('embedBatch()', () => {
    it('returns correct number of vectors for a batch', async () => {
      const vector = makeOllamaVector();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: vector }),
        text: () => Promise.resolve(''),
        status: 200,
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      const texts = ['text1', 'text2', 'text3'];
      const results = await provider.embedBatch(texts, 10);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(768);
      expect(fetchMock).toHaveBeenCalledTimes(3); // one embed() call per text
    });

    it('respects batchSize and processes all texts', async () => {
      const vector = makeOllamaVector();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: vector }),
        text: () => Promise.resolve(''),
        status: 200,
        statusText: 'OK',
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OllamaEmbeddingProvider('http://localhost:11434');
      const texts = Array.from({ length: 25 }, (_, i) => `text ${i}`);
      const results = await provider.embedBatch(texts, 5);

      expect(results).toHaveLength(25);
      expect(fetchMock).toHaveBeenCalledTimes(25);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAIEmbeddingProvider
// ─────────────────────────────────────────────────────────────────────────────

describe('OpenAIEmbeddingProvider', () => {
  describe('isAvailable()', () => {
    it('returns true when API key is set', async () => {
      const provider = new OpenAIEmbeddingProvider('sk-test-key');
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when no API key is provided and env var is absent', async () => {
      delete process.env.SF_OPENAI_API_KEY;
      const provider = new OpenAIEmbeddingProvider(undefined);
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns true when SF_OPENAI_API_KEY env var is set', async () => {
      process.env.SF_OPENAI_API_KEY = 'sk-env-key';
      const provider = new OpenAIEmbeddingProvider();
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when API key is an empty string', async () => {
      const provider = new OpenAIEmbeddingProvider('');
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('embed()', () => {
    it('returns a 1536-dim vector from a successful OpenAI response', async () => {
      const vector = makeOpenAIVector();
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: vector }],
      });
      const provider = new OpenAIEmbeddingProvider('sk-test-key');
      const result = await provider.embed('hello world');
      expect(result).toHaveLength(1536);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'hello world',
      });
    });

    it('throws when API key is not set', async () => {
      delete process.env.SF_OPENAI_API_KEY;
      const provider = new OpenAIEmbeddingProvider(undefined);
      await expect(provider.embed('text')).rejects.toThrow('API key is not set');
    });

    it('throws when response contains no embedding', async () => {
      mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{}] });
      const provider = new OpenAIEmbeddingProvider('sk-test-key');
      await expect(provider.embed('text')).rejects.toThrow('no embedding in response');
    });

    it('uses a custom model when specified', async () => {
      const vector = makeOpenAIVector();
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: vector }],
      });
      const provider = new OpenAIEmbeddingProvider('sk-test-key', 'text-embedding-ada-002');
      await provider.embed('hello');
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'text-embedding-ada-002' }),
      );
    });
  });

  describe('embedBatch()', () => {
    it('sends texts in batches and returns all vectors in order', async () => {
      const vectors = Array.from({ length: 3 }, () => makeOpenAIVector());
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: vectors.map((v) => ({ embedding: v })),
      });
      const provider = new OpenAIEmbeddingProvider('sk-test-key');
      const results = await provider.embedBatch(['a', 'b', 'c'], 100);
      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(1536);
    });

    it('splits into multiple requests when batchSize is exceeded', async () => {
      const twoVectors = [makeOpenAIVector(), makeOpenAIVector()];
      const oneVector = [makeOpenAIVector()];
      mockEmbeddingsCreate
        .mockResolvedValueOnce({ data: twoVectors.map((v) => ({ embedding: v })) })
        .mockResolvedValueOnce({ data: oneVector.map((v) => ({ embedding: v })) });

      const provider = new OpenAIEmbeddingProvider('sk-test-key');
      const texts = ['t1', 't2', 't3'];
      const results = await provider.embedBatch(texts, 2);
      expect(results).toHaveLength(3);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
    });

    it('throws when API key is not set', async () => {
      delete process.env.SF_OPENAI_API_KEY;
      const provider = new OpenAIEmbeddingProvider(undefined);
      await expect(provider.embedBatch(['text'])).rejects.toThrow('API key is not set');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — core embed() behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService.embed()', () => {
  it('returns an Ollama vector when Ollama is available (primary path)', async () => {
    const vector = makeOllamaVector();
    stubFetch(
      { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
      { ok: true, body: { embedding: vector } },
    );
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const result = await svc.embed('implement user authentication');
    expect(result.provider).toBe('ollama');
    expect(result.dimensions).toBe(768);
    expect(result.vector).toHaveLength(768);
    expect(result.cached).toBe(false);
  });

  it('falls back to OpenAI when Ollama is unavailable', async () => {
    stubFetchNetworkError();
    const vector = makeOpenAIVector();
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: vector }] });
    process.env.SF_OPENAI_API_KEY = 'sk-test';

    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const result = await svc.embed('some skill text');
    expect(result.provider).toBe('openai');
    expect(result.dimensions).toBe(1536);
    expect(result.vector).toHaveLength(1536);
  });

  it('throws EmbeddingUnavailableError when both providers fail', async () => {
    stubFetchNetworkError();
    delete process.env.SF_OPENAI_API_KEY;

    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    await expect(svc.embed('text')).rejects.toThrow(EmbeddingUnavailableError);
  });

  it('EmbeddingUnavailableError message lists both providers', async () => {
    stubFetchNetworkError();
    delete process.env.SF_OPENAI_API_KEY;

    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    try {
      await svc.embed('text');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingUnavailableError);
      const e = err as EmbeddingUnavailableError;
      expect(e.message).toContain('ollama');
      expect(e.message).toContain('openai');
      expect(Object.keys(e.failures)).toContain('ollama');
      expect(Object.keys(e.failures)).toContain('openai');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — caching
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService — caching', () => {
  it('returns cached: false on first call and cached: true on repeat', async () => {
    const vector = makeOllamaVector();
    stubFetch(
      { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
      { ok: true, body: { embedding: vector } },
    );
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });

    const first = await svc.embed('user auth');
    expect(first.cached).toBe(false);
    expect(svc.cacheSize).toBe(1);

    const second = await svc.embed('user auth');
    expect(second.cached).toBe(true);
    expect(second.vector).toEqual(first.vector);
  });

  it('does not make a network call on cache hit', async () => {
    const vector = makeOllamaVector();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [{ name: 'nomic-embed-text' }],
          embedding: vector,
        }),
      text: () => Promise.resolve(''),
      status: 200,
      statusText: 'OK',
    });

    // First call: two fetch calls (tags + embeddings)
    vi.stubGlobal('fetch', fetchMock);
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });

    // Seed the cache via a direct provider call to avoid counting fetch calls here
    // Instead use the service directly and count total calls
    const tagsAndEmbedFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: 'nomic-embed-text' }] }),
        text: () => Promise.resolve(''),
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ embedding: vector }),
        text: () => Promise.resolve(''),
        status: 200,
        statusText: 'OK',
      });
    vi.stubGlobal('fetch', tagsAndEmbedFetch);

    await svc.embed('user auth cache test');
    const callsAfterFirst = tagsAndEmbedFetch.mock.calls.length;

    // Second call should not invoke fetch at all
    await svc.embed('user auth cache test');
    expect(tagsAndEmbedFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it('evicts oldest entry when maxCacheSize is reached', async () => {
    const vector = makeOllamaVector();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'nomic-embed-text' }], embedding: vector }),
      text: () => Promise.resolve(''),
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new EmbeddingService({ preferredProvider: 'ollama', maxCacheSize: 3 });

    await svc.embed('text-a');
    await svc.embed('text-b');
    await svc.embed('text-c');
    expect(svc.cacheSize).toBe(3);

    // Adding a 4th entry must evict the oldest
    await svc.embed('text-d');
    expect(svc.cacheSize).toBe(3);
  });

  it('re-fetches after cache TTL expires', async () => {
    const vector = makeOllamaVector();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ models: [{ name: 'nomic-embed-text' }], embedding: vector }),
      text: () => Promise.resolve(''),
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    // TTL of 0ms — entries expire immediately
    const svc = new EmbeddingService({
      preferredProvider: 'ollama',
      cacheTtlMs: 0,
    });

    const first = await svc.embed('ttl-test');
    expect(first.cached).toBe(false);

    // Wait a tick for TTL to expire
    await new Promise((r) => setTimeout(r, 5));

    const second = await svc.embed('ttl-test');
    expect(second.cached).toBe(false); // TTL expired → fresh fetch
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — text pre-processing / truncation
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService — text truncation', () => {
  it('truncates text that exceeds maxChunkLength', async () => {
    const vector = makeOllamaVector();
    let capturedPrompt = '';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'nomic-embed-text' }] }),
            text: () => Promise.resolve(''),
            status: 200,
            statusText: 'OK',
          });
        }
        // Capture the prompt that was actually sent
        const body = JSON.parse((init?.body as string) ?? '{}') as { prompt?: string };
        capturedPrompt = body.prompt ?? '';
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: vector }),
          text: () => Promise.resolve(''),
          status: 200,
          statusText: 'OK',
        });
      }),
    );

    const maxLen = 100;
    const svc = new EmbeddingService({ preferredProvider: 'ollama', maxChunkLength: maxLen });
    const longText = 'a'.repeat(200);
    await svc.embed(longText);

    expect(capturedPrompt.length).toBe(maxLen);
  });

  it('does not truncate text at exactly maxChunkLength', async () => {
    const vector = makeOllamaVector();
    let capturedPrompt = '';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [{ name: 'nomic-embed-text' }] }),
            text: () => Promise.resolve(''),
            status: 200,
            statusText: 'OK',
          });
        }
        const body = JSON.parse((init?.body as string) ?? '{}') as { prompt?: string };
        capturedPrompt = body.prompt ?? '';
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: vector }),
          text: () => Promise.resolve(''),
          status: 200,
          statusText: 'OK',
        });
      }),
    );

    const maxLen = 50;
    const svc = new EmbeddingService({ preferredProvider: 'ollama', maxChunkLength: maxLen });
    const exactText = 'b'.repeat(50);
    await svc.embed(exactText);

    expect(capturedPrompt.length).toBe(maxLen);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — getDimensions() / getActiveProvider()
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService.getDimensions()', () => {
  it('returns 768 when Ollama is available', async () => {
    stubFetch({ ok: true, body: { models: [{ name: 'nomic-embed-text' }] } });
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    expect(await svc.getDimensions()).toBe(768);
  });

  it('returns 1536 when Ollama is unavailable and OpenAI key is set', async () => {
    stubFetchNetworkError();
    process.env.SF_OPENAI_API_KEY = 'sk-test';
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    expect(await svc.getDimensions()).toBe(1536);
  });

  it('throws EmbeddingUnavailableError when both providers are unavailable', async () => {
    stubFetchNetworkError();
    delete process.env.SF_OPENAI_API_KEY;
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    await expect(svc.getDimensions()).rejects.toThrow(EmbeddingUnavailableError);
  });
});

describe('EmbeddingService.getActiveProvider()', () => {
  it('returns the primary (ollama) provider when it is available', async () => {
    stubFetch({ ok: true, body: { models: [{ name: 'nomic-embed-text' }] } });
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const provider = await svc.getActiveProvider();
    expect(provider.name).toBe('ollama');
  });

  it('returns openai when ollama is down and openai key is set', async () => {
    stubFetchNetworkError();
    process.env.SF_OPENAI_API_KEY = 'sk-test';
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const provider = await svc.getActiveProvider();
    expect(provider.name).toBe('openai');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — embedBatch()
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService.embedBatch()', () => {
  it('returns correct number of results for a batch of 25 texts', async () => {
    const vector = makeOllamaVector();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ models: [{ name: 'nomic-embed-text' }], embedding: vector }),
        text: () => Promise.resolve(''),
        status: 200,
        statusText: 'OK',
      }),
    );
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const texts = Array.from({ length: 25 }, (_, i) => `skill description ${i}`);
    const results = await svc.embedBatch(texts);
    expect(results).toHaveLength(25);
    expect(results.every((r) => r.vector.length === 768)).toBe(true);
  });

  it('falls back to OpenAI for batch when Ollama is unavailable', async () => {
    stubFetchNetworkError();
    process.env.SF_OPENAI_API_KEY = 'sk-test';
    const batchVectors = [makeOpenAIVector(), makeOpenAIVector()];
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: batchVectors.map((v) => ({ embedding: v })),
    });

    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    const results = await svc.embedBatch(['a', 'b']);
    expect(results).toHaveLength(2);
    expect(results[0].provider).toBe('openai');
    expect(results[0].dimensions).toBe(1536);
  });

  it('throws EmbeddingUnavailableError for batch when both providers fail', async () => {
    stubFetchNetworkError();
    delete process.env.SF_OPENAI_API_KEY;
    const svc = new EmbeddingService({ preferredProvider: 'ollama' });
    await expect(svc.embedBatch(['text1', 'text2'])).rejects.toThrow(EmbeddingUnavailableError);
  });

  it('serves cached entries without network calls in a batch', async () => {
    const vector = makeOllamaVector();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ models: [{ name: 'nomic-embed-text' }], embedding: vector }),
      text: () => Promise.resolve(''),
      status: 200,
      statusText: 'OK',
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new EmbeddingService({ preferredProvider: 'ollama' });

    // First batch: populates cache
    await svc.embedBatch(['cached-text']);
    const callsAfterFirst = fetchMock.mock.calls.length;

    // Second batch with same text: should hit cache
    const results = await svc.embedBatch(['cached-text']);
    expect(results[0].cached).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbeddingService — OpenAI as preferred provider
// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingService with openai as preferredProvider', () => {
  it('uses OpenAI first and falls back to Ollama when OpenAI key is missing', async () => {
    delete process.env.SF_OPENAI_API_KEY;
    const vector = makeOllamaVector();
    stubFetch(
      { ok: true, body: { models: [{ name: 'nomic-embed-text' }] } },
      { ok: true, body: { embedding: vector } },
    );
    const svc = new EmbeddingService({ preferredProvider: 'openai' });
    const result = await svc.embed('test fallback to ollama');
    expect(result.provider).toBe('ollama');
    expect(result.dimensions).toBe(768);
  });

  it('uses OpenAI when API key is present', async () => {
    process.env.SF_OPENAI_API_KEY = 'sk-test';
    const vector = makeOpenAIVector();
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: vector }] });

    // Stub fetch to ensure no Ollama calls are made
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('should not be called')));

    const svc = new EmbeddingService({ preferredProvider: 'openai' });
    const result = await svc.embed('openai preferred test');
    expect(result.provider).toBe('openai');
    expect(result.dimensions).toBe(1536);
  });
});

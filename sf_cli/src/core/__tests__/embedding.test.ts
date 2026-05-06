import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingService,
  TransformersEmbeddingProvider,
  EmbeddingUnavailableError,
} from '../embedding-service.js';

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(async (_text: string) => ({
    data: new Float32Array(384).fill(0.1),
  })),
}));

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: { create: vi.fn() },
  })),
}));

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    service = new EmbeddingService({ preferredProvider: 'transformers' });
    service.clearCache();
  });

  it('should generate an embedding via TransformersProvider', async () => {
    const result = await service.embed('test text');
    expect(result.vector.length).toBe(384);
    expect(result.provider).toBe('transformers');
    expect(result.cached).toBe(false);
  });

  it('should cache results for identical text', async () => {
    const first = await service.embed('hello world');
    const second = await service.embed('hello world');
    expect(second.cached).toBe(true);
    expect(second.vector).toEqual(first.vector);
  });

  it('should track cache size', async () => {
    expect(service.cacheSize).toBe(0);
    await service.embed('entry one');
    expect(service.cacheSize).toBe(1);
  });

  it('should clear cache', async () => {
    await service.embed('some text');
    service.clearCache();
    expect(service.cacheSize).toBe(0);
  });

  it('should return correct dimensions', async () => {
    const dims = await service.getDimensions();
    expect(dims).toBe(384);
  });

  it('throws EmbeddingUnavailableError when all providers fail', async () => {
    // Force all providers unavailable by stubbing fetch to reject and using ollama/openai only
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const failService = new EmbeddingService({
      preferredProvider: 'ollama',
      openaiApiKey: undefined,
    });
    // Override transformers to also fail
    const providers = (failService as any).providers as TransformersEmbeddingProvider[];
    for (const p of providers) {
      vi.spyOn(p, 'isAvailable').mockResolvedValue(false);
    }
    await expect(failService.embed('test')).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    vi.unstubAllGlobals();
  });
});

describe('TransformersEmbeddingProvider', () => {
  it('should always report as available', async () => {
    const provider = new TransformersEmbeddingProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('should embed text and return a number array', async () => {
    const provider = new TransformersEmbeddingProvider();
    const result = await provider.embed('hello');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(384);
  });
});

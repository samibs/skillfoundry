import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VectorStore, cosineSimilarity } from '../vector-store.js';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EmbeddingService } from '../embedding-service.js';

const tmpDir = join(process.cwd(), '.tmp-test-vector-core');

function makeMockEmbeddingService(dims = 2): EmbeddingService {
  let callCount = 0;
  return {
    embed: vi.fn().mockImplementation(async (text: string) => {
      callCount++;
      // Return deterministic vectors based on text content for testing
      const v = dims === 2 ? [callCount % 2 === 0 ? 0 : 1, callCount % 2 === 0 ? 1 : 0] : Array(dims).fill(0.1);
      return { vector: v, provider: 'mock', dimensions: dims, cached: false };
    }),
    embedBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      return texts.map((_, i) => ({
        vector: Array(dims).fill(i === 0 ? 1 : 0),
        provider: 'mock',
        dimensions: dims,
        cached: false,
      }));
    }),
    getDimensions: vi.fn().mockResolvedValue(dims),
    clearCache: vi.fn(),
    cacheSize: 0,
  } as unknown as EmbeddingService;
}

beforeEach(() => {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });

  it('returns correct similarity for angled vectors', () => {
    const score = cosineSimilarity([1, 1], [1, 0]);
    expect(score).toBeCloseTo(0.707, 2);
  });
});

describe('VectorStore', () => {
  it('initializes and creates storage directory', async () => {
    const svc = makeMockEmbeddingService();
    const store = new VectorStore(svc, tmpDir, { persistPath: 'vectors-init' });
    await store.initialize();
    expect(existsSync(join(tmpDir, 'vectors-init'))).toBe(true);
  });

  it('adds and searches documents', async () => {
    const svc = makeMockEmbeddingService();
    (svc.embedBatch as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    ]);
    (svc.embed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    );

    const store = new VectorStore(svc, tmpDir, { persistPath: 'vectors-add' });
    await store.initialize();
    await store.add([{
      id: 'doc1',
      text: 'hello world',
      metadata: { source: 'test', scope: 'project', tags: [], timestamp: Date.now(), type: 'fact' },
    }]);

    const results = await store.search('hello', 5);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc1');
    expect(results[0].score).toBe(1.0);
  });

  it('returns empty results when store is empty', async () => {
    const svc = makeMockEmbeddingService();
    (svc.embed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    );
    const store = new VectorStore(svc, tmpDir, { persistPath: 'vectors-empty' });
    await store.initialize();
    const results = await store.search('anything', 5);
    expect(results).toEqual([]);
  });

  it('persists data across instances', async () => {
    const svc = makeMockEmbeddingService();
    const persistPath = 'vectors-persist';

    // Create and populate first store
    (svc.embedBatch as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    ]);
    const store1 = new VectorStore(svc, tmpDir, { persistPath });
    await store1.initialize();
    await store1.add([{
      id: 'persisted',
      text: 'persisted doc',
      metadata: { source: 'test', scope: 'project', tags: [], timestamp: Date.now(), type: 'fact' },
    }]);

    // Create second store, search should find it
    (svc.embed as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    );
    (svc.getDimensions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
    const store2 = new VectorStore(svc, tmpDir, { persistPath });
    await store2.initialize();
    const results = await store2.search('persisted', 5);
    expect(results.some(r => r.id === 'persisted')).toBe(true);
  });

  it('deletes documents by id', async () => {
    const svc = makeMockEmbeddingService();
    (svc.embedBatch as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    ]);
    (svc.embed as ReturnType<typeof vi.fn>).mockResolvedValue(
      { vector: [1, 0], provider: 'mock', dimensions: 2, cached: false },
    );

    const store = new VectorStore(svc, tmpDir, { persistPath: 'vectors-delete' });
    await store.initialize();
    await store.add([{
      id: 'to-delete',
      text: 'delete me',
      metadata: { source: 'test', scope: 'project', tags: [], timestamp: Date.now(), type: 'fact' },
    }]);
    await store.delete(['to-delete']);
    const results = await store.search('delete', 5);
    expect(results.find(r => r.id === 'to-delete')).toBeUndefined();
  });
});

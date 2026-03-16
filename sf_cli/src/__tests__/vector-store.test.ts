/**
 * Unit and integration tests for the lightweight local VectorStore.
 *
 * All embedding calls are mocked — no real Ollama or OpenAI connection is made.
 * File I/O uses a real temp directory under /tmp so the persistence logic is
 * exercised without polluting the working tree.
 *
 * Test layout:
 *   1. cosineSimilarity  — pure math, no mocks
 *   2. applyMetadataFilter — pure filter logic
 *   3. VectorStore unit tests — mocked EmbeddingService, real temp filesystem
 *   4. Integration — add → search full roundtrip with deterministic vectors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  VectorStore,
  cosineSimilarity,
  applyMetadataFilter,
  type MemoryDocument,
  type MetadataFilter,
} from '../core/vector-store.js';

// ── Logger mock (prevents disk writes) ───────────────────────────────────────

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── EmbeddingService mock factory ─────────────────────────────────────────────

/**
 * Build a mock EmbeddingService with controllable embed/embedBatch/getDimensions.
 * All vectors are deterministic based on input text for integration testing.
 */
function makeMockEmbeddingService(dims = 4) {
  const textToVector = (text: string, d: number): number[] => {
    // Produce a deterministic unit vector from text hash
    const arr = new Array<number>(d).fill(0);
    for (let i = 0; i < text.length; i++) {
      arr[i % d] += text.charCodeAt(i);
    }
    const mag = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
    return arr.map((v) => v / mag);
  };

  const embed = vi.fn(async (text: string) => ({
    vector: textToVector(text, dims),
    provider: 'mock',
    dimensions: dims,
    cached: false,
  }));

  const embedBatch = vi.fn(async (texts: string[]) =>
    texts.map((t) => ({
      vector: textToVector(t, dims),
      provider: 'mock',
      dimensions: dims,
      cached: false,
    })),
  );

  const getDimensions = vi.fn(async () => dims);
  const getActiveProvider = vi.fn(async () => ({ name: 'mock', dimensions: dims }));

  return { embed, embedBatch, getDimensions, getActiveProvider } as unknown as import('../core/embedding-service.js').EmbeddingService;
}

// ── Temp directory management ─────────────────────────────────────────────────

let tempDir: string;

function makeTempDir(): string {
  const dir = join(tmpdir(), `sf-vector-store-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Sample data builders ──────────────────────────────────────────────────────

function makeDoc(overrides: Partial<MemoryDocument> & { id?: string } = {}): MemoryDocument {
  return {
    id: overrides.id ?? randomUUID(),
    text: overrides.text ?? 'sample memory document text',
    metadata: {
      source: 'test/memory.jsonl',
      scope: 'project',
      tags: ['test'],
      timestamp: Date.now(),
      type: 'fact',
      ...overrides.metadata,
    },
  };
}

// ── 1. cosineSimilarity tests ─────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('scores a nearly-parallel vector close to 1', () => {
    const a = [0.6, 0.8, 0];
    const b = [0.7, 0.7, 0]; // close but not identical
    const score = cosineSimilarity(a, b);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('clamps result to [0, 1] range', () => {
    const a = [1, 1, 1];
    const b = [1, 1, 1];
    const score = cosineSimilarity(a, b);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ── 2. applyMetadataFilter tests ──────────────────────────────────────────────

describe('applyMetadataFilter', () => {
  const baseEntry = {
    id: 'e1',
    text: 'hello',
    dimensions: 4,
    metadata: {
      source: 'file.jsonl',
      scope: 'project' as const,
      tags: ['auth', 'login'],
      timestamp: 1000,
      type: 'decision' as const,
    },
  };

  it('returns all entries when filter is empty', () => {
    const result = applyMetadataFilter([baseEntry], {});
    expect(result).toHaveLength(1);
  });

  it('filters by scope', () => {
    const global = { ...baseEntry, id: 'e2', metadata: { ...baseEntry.metadata, scope: 'global' as const } };
    const filter: MetadataFilter = { scope: 'project' };
    const result = applyMetadataFilter([baseEntry, global], filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by type', () => {
    const lesson = { ...baseEntry, id: 'e3', metadata: { ...baseEntry.metadata, type: 'lesson' as const } };
    const filter: MetadataFilter = { type: 'decision' };
    const result = applyMetadataFilter([baseEntry, lesson], filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by since timestamp', () => {
    const old = { ...baseEntry, id: 'e4', metadata: { ...baseEntry.metadata, timestamp: 500 } };
    const filter: MetadataFilter = { since: 999 };
    const result = applyMetadataFilter([baseEntry, old], filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('filters by tags (OR match)', () => {
    const untagged = { ...baseEntry, id: 'e5', metadata: { ...baseEntry.metadata, tags: ['unrelated'] } };
    const filter: MetadataFilter = { tags: ['auth', 'billing'] };
    const result = applyMetadataFilter([baseEntry, untagged], filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('applies multiple filters simultaneously (AND)', () => {
    const other = {
      ...baseEntry,
      id: 'e6',
      metadata: {
        ...baseEntry.metadata,
        scope: 'global' as const,
        type: 'decision' as const,
        tags: ['auth'],
      },
    };
    const filter: MetadataFilter = { scope: 'project', type: 'decision' };
    const result = applyMetadataFilter([baseEntry, other], filter);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('returns empty array when no entries match', () => {
    const filter: MetadataFilter = { scope: 'framework' };
    const result = applyMetadataFilter([baseEntry], filter);
    expect(result).toHaveLength(0);
  });
});

// ── 3. VectorStore unit tests ─────────────────────────────────────────────────

describe('VectorStore', () => {
  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    cleanTempDir(tempDir);
  });

  describe('initialize()', () => {
    it('creates storage directory on first use', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();
      expect(existsSync(join(tempDir, 'vectors'))).toBe(true);
    });

    it('does not throw when store already exists', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();
      await expect(store.initialize()).resolves.not.toThrow();
    });

    it('triggers rebuild on dimension mismatch', async () => {
      // Pre-populate stats with dims=768, then init with dims=4 provider
      const vecDir = join(tempDir, 'vectors');
      mkdirSync(vecDir, { recursive: true });
      const statsData = {
        totalDocuments: 3,
        dimensions: 768,
        provider: 'ollama',
        lastIndexedAt: Date.now() - 10000,
      };
      writeFileSync(join(vecDir, 'stats.json'), JSON.stringify(statsData), 'utf-8');
      writeFileSync(join(vecDir, 'index.json'), JSON.stringify({ entries: [] }), 'utf-8');

      const svc = makeMockEmbeddingService(4); // current provider = 4 dims
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors', sourceDirs: [] });

      await store.initialize();

      // After dimension mismatch, stats should be reset (rebuild ran on empty sources)
      const stats = await store.getStats();
      expect(stats.dimensions).toBe(0); // no source docs to re-embed
    });
  });

  describe('add()', () => {
    it('embeds text via EmbeddingService', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const doc = makeDoc({ text: 'user authentication flow' });
      await store.add([doc]);

      expect(svc.embedBatch).toHaveBeenCalledWith(['user authentication flow']);
    });

    it('writes index and vector files to disk', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const doc = makeDoc({ id: 'test-doc-001', text: 'hello world' });
      await store.add([doc]);

      const vecDir = join(tempDir, 'vectors');
      expect(existsSync(join(vecDir, 'index.json'))).toBe(true);
      expect(existsSync(join(vecDir, 'stats.json'))).toBe(true);
      // Vector file: id sanitised to safe filename
      expect(existsSync(join(vecDir, 'test-doc-001.vec.json'))).toBe(true);
    });

    it('updates stats after add', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc(), makeDoc(), makeDoc()]);

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.provider).toBe('mock');
    });

    it('upserts existing documents (same ID replaces content)', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const id = randomUUID();
      await store.add([makeDoc({ id, text: 'original content' })]);
      await store.add([makeDoc({ id, text: 'updated content' })]);

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(1); // still one document, not two
    });

    it('handles empty array without calling embedBatch', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([]);

      expect(svc.embedBatch).not.toHaveBeenCalled();
    });

    it('throws when not initialized', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });

      await expect(store.add([makeDoc()])).rejects.toThrow('not initialized');
    });
  });

  describe('search()', () => {
    it('embeds the query before searching', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc({ text: 'auth flow' })]);
      await store.search('authentication');

      expect(svc.embed).toHaveBeenCalledWith('authentication');
    });

    it('returns empty array when store is empty', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const results = await store.search('anything');
      expect(results).toHaveLength(0);
    });

    it('returns results sorted by descending score', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      // Add several docs; deterministic vectors based on text
      await store.add([
        makeDoc({ id: 'a', text: 'user login authentication' }),
        makeDoc({ id: 'b', text: 'database connection pooling' }),
        makeDoc({ id: 'c', text: 'user authentication oauth' }),
      ]);

      const results = await store.search('user authentication');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('respects top-k limit', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([
        makeDoc({ id: 'a', text: 'alpha' }),
        makeDoc({ id: 'b', text: 'beta' }),
        makeDoc({ id: 'c', text: 'gamma' }),
        makeDoc({ id: 'd', text: 'delta' }),
        makeDoc({ id: 'e', text: 'epsilon' }),
      ]);

      const results = await store.search('query', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('result includes score and distance', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc({ id: 'x', text: 'sample text' })]);
      const results = await store.search('sample text');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].distance).toBeCloseTo(1 - results[0].score, 5);
    });

    it('applies metadata filter during search', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([
        makeDoc({ id: 'p1', text: 'project memory', metadata: { source: 'x', scope: 'project', tags: [], timestamp: Date.now(), type: 'fact' } }),
        makeDoc({ id: 'g1', text: 'global memory', metadata: { source: 'x', scope: 'global', tags: [], timestamp: Date.now(), type: 'fact' } }),
      ]);

      const results = await store.search('memory', 10, { scope: 'project' });
      expect(results.every((r) => r.metadata.scope === 'project')).toBe(true);
      expect(results.some((r) => r.id === 'p1')).toBe(true);
      expect(results.some((r) => r.id === 'g1')).toBe(false);
    });

    it('returns empty array when filter matches no candidates', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc({ id: 'a', text: 'content', metadata: { source: 'x', scope: 'project', tags: [], timestamp: Date.now(), type: 'fact' } })]);

      const results = await store.search('content', 10, { scope: 'framework' });
      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('removes documents by ID', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const id1 = randomUUID();
      const id2 = randomUUID();
      await store.add([makeDoc({ id: id1 }), makeDoc({ id: id2 })]);

      await store.delete([id1]);

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(1);
    });

    it('removes the vector file from disk', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const id = 'deletable-doc-123';
      await store.add([makeDoc({ id })]);

      const vecPath = join(tempDir, 'vectors', 'deletable-doc-123.vec.json');
      expect(existsSync(vecPath)).toBe(true);

      await store.delete([id]);
      expect(existsSync(vecPath)).toBe(false);
    });

    it('silently ignores non-existent IDs', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc({ id: 'real-doc' })]);
      await expect(store.delete(['non-existent-id'])).resolves.not.toThrow();

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(1);
    });

    it('handles empty array without error', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await expect(store.delete([])).resolves.not.toThrow();
    });
  });

  describe('getStats()', () => {
    it('returns zero stats when store is empty', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.dimensions).toBe(0);
      expect(stats.provider).toBe('');
      expect(stats.lastIndexedAt).toBe(0);
    });

    it('returns accurate counts after adding documents', async () => {
      const svc = makeMockEmbeddingService(4);
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
      await store.initialize();

      await store.add([makeDoc(), makeDoc(), makeDoc(), makeDoc(), makeDoc()]);

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(5);
      expect(stats.dimensions).toBe(4);
      expect(stats.provider).toBe('mock');
      expect(stats.lastIndexedAt).toBeGreaterThan(0);
    });

    it('throws when not initialized', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });

      await expect(store.getStats()).rejects.toThrow('not initialized');
    });
  });

  describe('rebuild()', () => {
    it('reads JSONL files from sourceDirs and re-indexes', async () => {
      // Create a source JSONL file in the temp dir
      const sourceDir = join(tempDir, 'memory_bank', 'knowledge');
      mkdirSync(sourceDir, { recursive: true });

      const entries = [
        { id: 'r1', content: 'rebuild entry one', type: 'fact', scope: 'project', tags: ['rebuild'], created_at: new Date().toISOString() },
        { id: 'r2', content: 'rebuild entry two', type: 'lesson', scope: 'global', tags: [], created_at: new Date().toISOString() },
      ];
      writeFileSync(
        join(sourceDir, 'test.jsonl'),
        entries.map((e) => JSON.stringify(e)).join('\n'),
        'utf-8',
      );

      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, {
        persistPath: 'vectors',
        sourceDirs: [join(tempDir, 'memory_bank', 'knowledge')],
      });
      await store.initialize();
      await store.rebuild();

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(2);
    });

    it('clears existing data before re-indexing', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors', sourceDirs: [] });
      await store.initialize();

      // Add some initial docs
      await store.add([makeDoc(), makeDoc()]);
      expect((await store.getStats()).totalDocuments).toBe(2);

      // Rebuild with no source dirs → clears everything
      await store.rebuild();
      expect((await store.getStats()).totalDocuments).toBe(0);
    });

    it('skips missing source directories gracefully', async () => {
      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, {
        persistPath: 'vectors',
        sourceDirs: ['nonexistent_subdir_that_does_not_exist'],
      });
      await store.initialize();

      await expect(store.rebuild()).resolves.not.toThrow();
      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(0);
    });

    it('rejects sourceDirs that escape workDir via path traversal', () => {
      const svc = makeMockEmbeddingService();
      expect(() => new VectorStore(svc, tempDir, {
        persistPath: 'vectors',
        sourceDirs: ['/etc/passwd'],
      })).toThrow(TypeError);
      expect(() => new VectorStore(svc, tempDir, {
        persistPath: 'vectors',
        sourceDirs: ['../../etc/passwd'],
      })).toThrow(TypeError);
    });

    it('skips malformed JSONL lines without failing', async () => {
      const sourceDir = join(tempDir, 'sources');
      mkdirSync(sourceDir, { recursive: true });

      const content = [
        JSON.stringify({ id: 'valid-1', content: 'valid entry', type: 'fact' }),
        'this is not valid JSON }{{{',
        JSON.stringify({ id: 'valid-2', content: 'another valid entry', type: 'lesson' }),
      ].join('\n');

      writeFileSync(join(sourceDir, 'mixed.jsonl'), content, 'utf-8');

      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors', sourceDirs: [sourceDir] });
      await store.initialize();
      await store.rebuild();

      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(2);
    });

    it('deduplicates entries with the same ID across multiple JSONL files', async () => {
      const sourceDir = join(tempDir, 'dedup-sources');
      mkdirSync(sourceDir, { recursive: true });

      const entry = { id: 'dup-id', content: 'same entry', type: 'fact' };
      writeFileSync(join(sourceDir, 'file1.jsonl'), JSON.stringify(entry), 'utf-8');
      writeFileSync(join(sourceDir, 'file2.jsonl'), JSON.stringify(entry), 'utf-8');

      const svc = makeMockEmbeddingService();
      const store = new VectorStore(svc, tempDir, { persistPath: 'vectors', sourceDirs: [sourceDir] });
      await store.initialize();
      await store.rebuild();

      // Only one document despite appearing in two files
      const stats = await store.getStats();
      expect(stats.totalDocuments).toBe(1);
    });
  });
});

// ── 4. Integration: add → search roundtrip ────────────────────────────────────

describe('VectorStore integration: add + search', () => {
  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    cleanTempDir(tempDir);
  });

  it('finds the most semantically similar document', async () => {
    const svc = makeMockEmbeddingService(16);
    const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
    await store.initialize();

    // These texts are deterministic — "auth" will be most similar to "authenticate"
    await store.add([
      makeDoc({ id: 'auth-doc', text: 'authentication and authorization system' }),
      makeDoc({ id: 'db-doc', text: 'database connection pool management' }),
      makeDoc({ id: 'cache-doc', text: 'redis cache invalidation strategy' }),
    ]);

    const results = await store.search('authentication and authorization', 3);
    expect(results).toHaveLength(3);
    // The auth-doc must score highest
    expect(results[0].id).toBe('auth-doc');
  });

  it('returns results with valid score and distance in [0,1] range', async () => {
    const svc = makeMockEmbeddingService(8);
    const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
    await store.initialize();

    await store.add([
      makeDoc({ id: 'd1', text: 'memory management patterns' }),
      makeDoc({ id: 'd2', text: 'error handling best practices' }),
    ]);

    const results = await store.search('memory and error handling', 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
      expect(r.distance).toBeGreaterThanOrEqual(0);
      expect(r.distance).toBeLessThanOrEqual(1);
      expect(r.score + r.distance).toBeCloseTo(1, 5);
    }
  });

  it('meets the <200ms performance requirement for 100 documents', async () => {
    const svc = makeMockEmbeddingService(32);
    const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
    await store.initialize();

    // Add 100 documents
    const docs: MemoryDocument[] = Array.from({ length: 100 }, (_, i) =>
      makeDoc({ id: `perf-doc-${i}`, text: `performance test document number ${i} with some content` }),
    );
    await store.add(docs);

    // Measure search time
    const start = Date.now();
    const results = await store.search('performance test document', 10);
    const elapsed = Date.now() - start;

    expect(results.length).toBeLessThanOrEqual(10);
    expect(elapsed).toBeLessThan(200);
  }, 5000);

  it('persists data across separate VectorStore instances', async () => {
    const svc = makeMockEmbeddingService(8);
    const opts = { persistPath: 'vectors' };

    // First instance — add documents
    const store1 = new VectorStore(svc, tempDir, opts);
    await store1.initialize();
    await store1.add([
      makeDoc({ id: 'persist-1', text: 'persisted document one' }),
      makeDoc({ id: 'persist-2', text: 'persisted document two' }),
    ]);
    const stats1 = await store1.getStats();
    expect(stats1.totalDocuments).toBe(2);

    // Second instance — verify data is still there
    const store2 = new VectorStore(svc, tempDir, opts);
    await store2.initialize();
    const stats2 = await store2.getStats();
    expect(stats2.totalDocuments).toBe(2);

    const results = await store2.search('persisted document', 5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('metadata is round-tripped correctly through add and search', async () => {
    const svc = makeMockEmbeddingService(8);
    const store = new VectorStore(svc, tempDir, { persistPath: 'vectors' });
    await store.initialize();

    const ts = Date.now();
    const doc = makeDoc({
      id: 'meta-roundtrip',
      text: 'metadata roundtrip test',
      metadata: {
        source: 'custom/source.jsonl',
        scope: 'framework',
        tags: ['alpha', 'beta'],
        timestamp: ts,
        type: 'pattern',
      },
    });
    await store.add([doc]);

    const results = await store.search('metadata roundtrip test', 1);
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.metadata.source).toBe('custom/source.jsonl');
    expect(r.metadata.scope).toBe('framework');
    expect(r.metadata.tags).toEqual(['alpha', 'beta']);
    expect(r.metadata.timestamp).toBe(ts);
    expect(r.metadata.type).toBe('pattern');
  });
});

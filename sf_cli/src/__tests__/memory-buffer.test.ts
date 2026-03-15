import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryBuffer } from '../core/memory-buffer.js';

const TEST_DIR = join(process.cwd(), '.test-memory-buf-tmp');
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('MemoryBuffer', () => {
  describe('add and flush', () => {
    it('writes entries to correct JSONL files', () => {
      const buf = new MemoryBuffer('run-001');
      buf.add({ type: 'fact', content: 'Test fact', tags: ['test'] });
      buf.add({ type: 'error', content: 'Test error', tags: ['test'] });
      buf.add({ type: 'decision', content: 'Test decision', tags: ['test'] });

      const result = buf.flush(TEST_DIR);
      expect(result.entriesWritten).toBe(3);
      expect(result.entriesDeduplicated).toBe(0);

      expect(existsSync(join(KNOWLEDGE_DIR, 'facts.jsonl'))).toBe(true);
      expect(existsSync(join(KNOWLEDGE_DIR, 'errors.jsonl'))).toBe(true);
      expect(existsSync(join(KNOWLEDGE_DIR, 'decisions.jsonl'))).toBe(true);
    });

    it('writes canonical schema entries', () => {
      const buf = new MemoryBuffer('run-002');
      buf.add({
        type: 'fact',
        content: 'Schema test fact',
        tags: ['schema', 'test'],
        storyId: 'STORY-001',
        prdId: 'auth-service',
      });

      buf.flush(TEST_DIR);

      const content = readFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe('fact');
      expect(entry.content).toBe('Schema test fact');
      expect(entry.created_by).toBe('memory-buffer');
      expect(entry.session_id).toBe('run-002');
      expect(entry.context.prd_id).toBe('auth-service');
      expect(entry.context.story_id).toBe('STORY-001');
      expect(entry.tags).toEqual(['schema', 'test']);
      expect(entry.weight).toBe(0.5);
      expect(entry.lineage).toBeDefined();
      expect(entry.reality_anchor).toBeDefined();
    });

    it('clears buffer after flush', () => {
      const buf = new MemoryBuffer('run-003');
      buf.add({ type: 'fact', content: 'Entry 1', tags: [] });

      expect(buf.pendingCount).toBe(1);
      buf.flush(TEST_DIR);
      expect(buf.pendingCount).toBe(0);
    });
  });

  describe('deduplication', () => {
    it('skips duplicate content', () => {
      const buf = new MemoryBuffer('run-004');
      buf.add({ type: 'fact', content: 'Duplicate fact', tags: [] });
      buf.flush(TEST_DIR);

      // Add same content again
      buf.add({ type: 'fact', content: 'Duplicate fact', tags: [] });
      const result = buf.flush(TEST_DIR);

      expect(result.entriesWritten).toBe(0);
      expect(result.entriesDeduplicated).toBe(1);

      // File should have only 1 line
      const content = readFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
    });

    it('allows different content with same type', () => {
      const buf = new MemoryBuffer('run-005');
      buf.add({ type: 'fact', content: 'Fact A', tags: [] });
      buf.flush(TEST_DIR);

      buf.add({ type: 'fact', content: 'Fact B', tags: [] });
      const result = buf.flush(TEST_DIR);

      expect(result.entriesWritten).toBe(1);
      const content = readFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('auto-flush on story complete', () => {
    it('flushes after default interval (3 stories)', () => {
      const buf = new MemoryBuffer('run-006');
      buf.add({ type: 'fact', content: 'Story 1 fact', tags: [] });
      expect(buf.onStoryComplete(TEST_DIR)).toBeNull(); // story 1
      buf.add({ type: 'fact', content: 'Story 2 fact', tags: [] });
      expect(buf.onStoryComplete(TEST_DIR)).toBeNull(); // story 2
      buf.add({ type: 'fact', content: 'Story 3 fact', tags: [] });

      const result = buf.onStoryComplete(TEST_DIR); // story 3 — triggers flush
      expect(result).not.toBeNull();
      expect(result!.entriesWritten).toBe(3);
      expect(buf.pendingCount).toBe(0);
    });

    it('respects custom flush interval', () => {
      const buf = new MemoryBuffer('run-007', 2);
      buf.add({ type: 'fact', content: 'Entry 1', tags: [] });
      expect(buf.onStoryComplete(TEST_DIR)).toBeNull(); // story 1

      buf.add({ type: 'fact', content: 'Entry 2', tags: [] });
      const result = buf.onStoryComplete(TEST_DIR); // story 2 — triggers
      expect(result).not.toBeNull();
      expect(result!.entriesWritten).toBe(2);
    });
  });

  describe('stats', () => {
    it('tracks cumulative stats across flushes', () => {
      const buf = new MemoryBuffer('run-008');

      buf.add({ type: 'fact', content: 'Fact 1', tags: [] });
      buf.flush(TEST_DIR);

      buf.add({ type: 'fact', content: 'Fact 2', tags: [] });
      buf.add({ type: 'fact', content: 'Fact 1', tags: [] }); // duplicate
      buf.flush(TEST_DIR);

      const stats = buf.getStats();
      expect(stats.totalWritten).toBe(2);
      expect(stats.totalDeduped).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });

  describe('directory creation', () => {
    it('creates knowledge directory if missing', () => {
      const buf = new MemoryBuffer('run-009');
      buf.add({ type: 'fact', content: 'Dir test', tags: [] });
      buf.flush(TEST_DIR);
      expect(existsSync(KNOWLEDGE_DIR)).toBe(true);
    });
  });
});

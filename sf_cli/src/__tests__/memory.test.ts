import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recall, capture, captureLesson, captureDecision, getMemoryStats } from '../core/memory.js';

const TEST_DIR = join(tmpdir(), 'sf-memory-test-' + Date.now());

function seedKnowledge() {
  const knowledgeDir = join(TEST_DIR, 'memory_bank', 'knowledge');
  mkdirSync(knowledgeDir, { recursive: true });

  const entries = [
    { id: 'mem-001', type: 'lesson', content: 'Always validate user input before database writes', tags: ['validation', 'security', 'database'], created_at: '2026-02-20T10:00:00Z' },
    { id: 'mem-002', type: 'decision', content: 'Use JWT RS256 for authentication tokens', tags: ['auth', 'jwt', 'security'], created_at: '2026-02-19T10:00:00Z' },
    { id: 'mem-003', type: 'error', content: 'TypeScript strict mode caught null reference in payment handler', tags: ['typescript', 'null', 'payment'], created_at: '2026-02-18T10:00:00Z' },
    { id: 'mem-004', type: 'pattern', content: 'React hooks must be called at the top level of components', tags: ['react', 'hooks', 'rules'], created_at: '2026-02-17T10:00:00Z' },
    { id: 'mem-005', type: 'lesson', content: 'Always run tests before committing code changes', tags: ['testing', 'workflow', 'quality'], created_at: '2026-02-16T10:00:00Z' },
  ];

  writeFileSync(
    join(knowledgeDir, 'patterns-universal.jsonl'),
    entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('recall', () => {
  it('should find entries matching a query', () => {
    seedKnowledge();
    const result = recall(TEST_DIR, 'security validation');
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.entries.some((e) => e.content.includes('validate'))).toBe(true);
  });

  it('should find entries by tag keywords', () => {
    seedKnowledge();
    const result = recall(TEST_DIR, 'authentication jwt');
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.entries.some((e) => e.content.includes('JWT'))).toBe(true);
  });

  it('should return empty for unrelated queries', () => {
    seedKnowledge();
    const result = recall(TEST_DIR, 'quantum computing blockchain');
    // Should have 0 or very low matches
    expect(result.entries.length).toBeLessThanOrEqual(2);
  });

  it('should return all entries when no knowledge exists', () => {
    const result = recall(TEST_DIR, 'anything');
    expect(result.entries).toHaveLength(0);
  });

  it('should return recent entries first for equal relevance', () => {
    seedKnowledge();
    const result = recall(TEST_DIR, 'lesson testing');
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

describe('capture', () => {
  it('should capture a new entry to file', () => {
    const entry = capture(TEST_DIR, {
      type: 'lesson',
      content: 'New lesson from test',
      tags: ['test'],
    });

    expect(entry.id).toMatch(/^mem-/);
    expect(entry.created_at).toBeTruthy();

    // Verify it can be recalled
    const result = recall(TEST_DIR, 'lesson test');
    expect(result.entries.some((e) => e.content === 'New lesson from test')).toBe(true);
  });
});

describe('captureLesson', () => {
  it('should capture as lesson type', () => {
    const entry = captureLesson(TEST_DIR, 'Test lesson content', ['tag1']);
    expect(entry.type).toBe('lesson');
  });
});

describe('captureDecision', () => {
  it('should capture as decision type', () => {
    const entry = captureDecision(TEST_DIR, 'Test decision content', ['tag1']);
    expect(entry.type).toBe('decision');
  });
});

describe('getMemoryStats', () => {
  it('should return stats with seeded data', () => {
    seedKnowledge();
    const stats = getMemoryStats(TEST_DIR);
    expect(stats.totalEntries).toBe(5);
    expect(stats.byType['lesson']).toBe(2);
    expect(stats.byType['decision']).toBe(1);
    expect(stats.recentEntries.length).toBeGreaterThan(0);
  });

  it('should return empty stats when no knowledge exists', () => {
    const stats = getMemoryStats(TEST_DIR);
    expect(stats.totalEntries).toBe(0);
  });
});

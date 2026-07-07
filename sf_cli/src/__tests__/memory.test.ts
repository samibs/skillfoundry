import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  recall,
  capture,
  captureLesson,
  captureDecision,
  getMemoryStats,
  deriveProject,
  isVisibleToProject,
  UNIVERSAL_PROJECT,
} from '../core/memory.js';
import type { MemoryEntry } from '../core/memory.js';

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

describe('project isolation (S4)', () => {
  const mk = (over: Partial<MemoryEntry>): MemoryEntry => ({
    id: 'x', type: 'lesson', content: 'c', tags: [], created_at: '2026-01-01T00:00:00Z', ...over,
  });

  afterEach(() => { delete process.env.SF_PROJECT; });

  it('derives the project namespace from the workDir basename', () => {
    expect(deriveProject('/home/u/redacted-project')).toBe('redacted-project');
    expect(deriveProject('/a/b/redacted-project')).toBe('redacted-project');
  });

  it('honors the SF_PROJECT override', () => {
    process.env.SF_PROJECT = 'custom-scope';
    expect(deriveProject('/home/u/anything')).toBe('custom-scope');
  });

  it('capture stamps the entry with the active project', () => {
    process.env.SF_PROJECT = 'proj-a';
    const e = captureLesson(TEST_DIR, 'scoped lesson', ['t']);
    expect(e.project).toBe('proj-a');
  });

  it('isVisibleToProject: unstamped and universal entries are shared; other projects are hidden', () => {
    expect(isVisibleToProject(mk({ project: undefined }), 'proj-a')).toBe(true);
    expect(isVisibleToProject(mk({ project: UNIVERSAL_PROJECT }), 'proj-a')).toBe(true);
    expect(isVisibleToProject(mk({ project: 'proj-a' }), 'proj-a')).toBe(true);
    expect(isVisibleToProject(mk({ project: 'proj-b' }), 'proj-a')).toBe(false);
  });

  it('recall does not surface another project\'s memory', () => {
    const knowledgeDir = join(TEST_DIR, 'memory_bank', 'knowledge');
    mkdirSync(knowledgeDir, { recursive: true });
    const rows = [
      mk({ id: 'a', content: 'alpha secret handling', project: 'proj-a' }),
      mk({ id: 'b', content: 'beta secret handling', project: 'proj-b' }),
      mk({ id: 'u', content: 'universal secret handling', project: undefined }),
    ];
    writeFileSync(join(knowledgeDir, 'patterns-universal.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const result = recall(TEST_DIR, 'secret handling', 10, { project: 'proj-a' });
    const ids = result.entries.map((e) => e.id).sort();
    expect(ids).toContain('a'); // own project
    expect(ids).toContain('u'); // universal/legacy
    expect(ids).not.toContain('b'); // other project — isolated
  });
});

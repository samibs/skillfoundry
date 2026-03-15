import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  recallIndex,
  recallPreview,
  recallFull,
  formatIndexResults,
  formatPreviewResults,
  formatFullResults,
  type RecallFilters,
} from '../core/layered-recall.js';

const TEST_DIR = join(process.cwd(), '_test_recall_workdir');
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

function writeEntry(file: string, entry: Record<string, unknown>): void {
  const filePath = join(KNOWLEDGE_DIR, file);
  const existing = existsSync(filePath) ? '' : '';
  writeFileSync(filePath, existing + JSON.stringify(entry) + '\n', { flag: 'a' });
}

function makeEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    type: 'fact',
    content: 'Test knowledge entry about the project',
    created_at: new Date().toISOString(),
    weight: 0.5,
    tags: ['test'],
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Index Mode ──────────────────────────────────────────────────

describe('recallIndex', () => {
  it('returns empty array when no knowledge exists', () => {
    const results = recallIndex('auth', TEST_DIR);
    expect(results).toEqual([]);
  });

  it('matches entries by content keywords', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'auth-fact', content: 'Authentication uses JWT with RS256' }));
    writeEntry('facts.jsonl', makeEntry({ id: 'other-fact', content: 'Database uses PostgreSQL' }));

    const results = recallIndex('authentication JWT', TEST_DIR);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('auth-fact');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('ranks exact phrase matches higher', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'exact-match', content: 'database migration pattern for PostgreSQL' }));
    writeEntry('facts.jsonl', makeEntry({ id: 'partial-match', content: 'the database was migrated' }));

    const results = recallIndex('database migration', TEST_DIR);
    expect(results[0].id).toBe('exact-match');
    expect(results[0].scoreBreakdown.exactMatch).toBe(100);
  });

  it('boosts by weight', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'heavy', content: 'auth decision', weight: 0.9 }));
    writeEntry('facts.jsonl', makeEntry({ id: 'light', content: 'auth decision', weight: 0.1 }));

    const results = recallIndex('auth', TEST_DIR);
    expect(results[0].id).toBe('heavy');
    expect(results[0].scoreBreakdown.weightBonus).toBeGreaterThan(results[1].scoreBreakdown.weightBonus);
  });

  it('respects limit filter', () => {
    for (let i = 0; i < 10; i++) {
      writeEntry('facts.jsonl', makeEntry({ content: `auth entry ${i}` }));
    }

    const results = recallIndex('auth', TEST_DIR, { limit: 3 });
    expect(results.length).toBe(3);
  });

  it('provides score breakdown', () => {
    writeEntry('facts.jsonl', makeEntry({ content: 'auth service handling', tags: ['auth'] }));

    const results = recallIndex('auth', TEST_DIR);
    expect(results[0].scoreBreakdown).toHaveProperty('exactMatch');
    expect(results[0].scoreBreakdown).toHaveProperty('wordMatches');
    expect(results[0].scoreBreakdown).toHaveProperty('typeBonus');
    expect(results[0].scoreBreakdown).toHaveProperty('weightBonus');
    expect(results[0].scoreBreakdown).toHaveProperty('tagBonus');
  });

  it('returns snippet not full content', () => {
    const longContent = 'A very detailed entry about authentication that spans many words and contains lots of information about JWT tokens and session management with refresh tokens and cookie security';
    writeEntry('facts.jsonl', makeEntry({ content: longContent }));

    const results = recallIndex('authentication', TEST_DIR);
    expect(results[0].snippet.length).toBeLessThanOrEqual(63); // 60 + "..."
  });
});

// ── Filters ─────────────────────────────────────────────────────

describe('recallIndex filters', () => {
  it('filters by type', () => {
    writeEntry('decisions.jsonl', makeEntry({ id: 'dec-1', type: 'decision', content: 'auth decision' }));
    writeEntry('errors.jsonl', makeEntry({ id: 'err-1', type: 'error', content: 'auth error' }));

    const results = recallIndex('auth', TEST_DIR, { type: 'decision' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('dec-1');
  });

  it('filters by minimum weight', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'heavy', content: 'auth fact', weight: 0.8 }));
    writeEntry('facts.jsonl', makeEntry({ id: 'light', content: 'auth fact', weight: 0.2 }));

    const results = recallIndex('auth', TEST_DIR, { minWeight: 0.5 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('heavy');
  });

  it('filters by since (relative days)', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86400000).toISOString(); // 30 days ago

    writeEntry('facts.jsonl', makeEntry({ id: 'recent', content: 'auth fact', created_at: recent }));
    writeEntry('facts.jsonl', makeEntry({ id: 'old', content: 'auth fact', created_at: old }));

    const results = recallIndex('auth', TEST_DIR, { since: '7d' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('recent');
  });

  it('filters by tags', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'tagged', content: 'some fact', tags: ['auth', 'security'] }));
    writeEntry('facts.jsonl', makeEntry({ id: 'untagged', content: 'some fact', tags: ['database'] }));

    const results = recallIndex('fact', TEST_DIR, { tags: ['auth'] });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('tagged');
  });
});

// ── Preview Mode ────────────────────────────────────────────────

describe('recallPreview', () => {
  it('returns previews for given IDs', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'target-id', content: 'Detailed content about auth that is quite long and informative', weight: 0.7, tags: ['auth'] }));
    writeEntry('facts.jsonl', makeEntry({ id: 'other-id', content: 'Something else' }));

    const results = recallPreview(['target-id'], TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('target-id');
    expect(results[0].weight).toBe(0.7);
    expect(results[0].tags).toContain('auth');
    expect(results[0].content.length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  it('returns empty for non-existent IDs', () => {
    const results = recallPreview(['does-not-exist'], TEST_DIR);
    expect(results).toEqual([]);
  });

  it('handles multiple IDs', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'id-1', content: 'Entry one' }));
    writeEntry('facts.jsonl', makeEntry({ id: 'id-2', content: 'Entry two' }));

    const results = recallPreview(['id-1', 'id-2'], TEST_DIR);
    expect(results).toHaveLength(2);
  });
});

// ── Full Mode ───────────────────────────────────────────────────

describe('recallFull', () => {
  it('returns complete entries', () => {
    const fullEntry = makeEntry({
      id: 'full-id',
      content: 'Complete auth implementation details',
      weight: 0.8,
      tags: ['auth', 'jwt'],
      lineage: { parent_id: null, supersedes: [], superseded_by: null },
    });
    writeEntry('facts.jsonl', fullEntry);

    const results = recallFull(['full-id'], TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].entry.id).toBe('full-id');
    expect(results[0].entry.content).toBe('Complete auth implementation details');
    expect(results[0].entry.weight).toBe(0.8);
  });
});

// ── Format functions ────────────────────────────────────────────

describe('formatIndexResults', () => {
  it('formats as markdown table', () => {
    const results = [
      { id: 'abcdef12-3456', type: 'fact', snippet: 'Auth uses JWT', score: 120, weight: 0.8, scoreBreakdown: { exactMatch: 100, wordMatches: 10, typeBonus: 0, weightBonus: 8, tagBonus: 2 } },
    ];
    const output = formatIndexResults(results);
    expect(output).toContain('| ID | Type | Score | Weight | Content |');
    expect(output).toContain('abcdef12');
    expect(output).toContain('fact');
    expect(output).toContain('/recall --preview');
  });

  it('returns no-match message for empty results', () => {
    expect(formatIndexResults([])).toContain('No matching');
  });
});

describe('formatPreviewResults', () => {
  it('formats with content and metadata', () => {
    const results = [
      { id: 'abcdef12-3456', type: 'decision', content: 'Chose JWT over sessions', weight: 0.7, tags: ['auth'], createdAt: '2026-03-15' },
    ];
    const output = formatPreviewResults(results);
    expect(output).toContain('abcdef12');
    expect(output).toContain('Chose JWT');
    expect(output).toContain('auth');
    expect(output).toContain('/recall --full');
  });
});

describe('formatFullResults', () => {
  it('formats as JSON code blocks', () => {
    const results = [
      { entry: { id: 'abcdef12', type: 'fact', content: 'Full content', created_at: '2026-03-15', weight: 0.5 } as any },
    ];
    const output = formatFullResults(results);
    expect(output).toContain('```json');
    expect(output).toContain('"id": "abcdef12"');
    expect(output).toContain('```');
  });
});

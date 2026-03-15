import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  recordRetrieval,
  runValidationUpdate,
  runDecay,
  runWeightLearning,
  WEIGHT_CONFIG,
} from '../core/weight-learner.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-weightlearn-' + process.pid);
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

function writeEntry(file: string, entry: Record<string, unknown>) {
  const filePath = join(KNOWLEDGE_DIR, file);
  const existing = (() => {
    try { return readFileSync(filePath, 'utf-8'); } catch { return ''; }
  })();
  writeFileSync(filePath, existing + JSON.stringify(entry) + '\n');
}

function readEntries(file: string): Array<Record<string, unknown>> {
  const content = readFileSync(join(KNOWLEDGE_DIR, file), 'utf-8').trim();
  return content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

beforeEach(() => {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('recordRetrieval', () => {
  it('boosts weight on retrieval', () => {
    writeEntry('facts.jsonl', {
      id: 'entry-1',
      type: 'fact',
      content: 'Test fact',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.5,
      retrieval_count: 0,
    });

    const update = recordRetrieval(TEST_DIR, 'entry-1');
    expect(update).not.toBeNull();
    expect(update!.old_weight).toBe(0.5);
    expect(update!.new_weight).toBe(0.5 + WEIGHT_CONFIG.retrieval_boost);
    expect(update!.reason).toContain('retrieval');

    // Verify persisted
    const entries = readEntries('facts.jsonl');
    expect(entries[0].weight).toBe(0.5 + WEIGHT_CONFIG.retrieval_boost);
    expect(entries[0].retrieval_count).toBe(1);
  });

  it('caps weight at ceiling', () => {
    writeEntry('decisions.jsonl', {
      id: 'entry-2',
      type: 'decision',
      content: 'Test decision',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.98,
      retrieval_count: 10,
    });

    const update = recordRetrieval(TEST_DIR, 'entry-2');
    expect(update!.new_weight).toBe(WEIGHT_CONFIG.weight_ceiling);
  });

  it('returns null for unknown entry', () => {
    writeEntry('facts.jsonl', {
      id: 'entry-1', type: 'fact', content: 'x', created_at: '2026-01-01T00:00:00Z',
    });

    const update = recordRetrieval(TEST_DIR, 'nonexistent');
    expect(update).toBeNull();
  });

  it('returns null when knowledge dir missing', () => {
    rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
    const update = recordRetrieval(TEST_DIR, 'entry-1');
    expect(update).toBeNull();
  });

  it('increments retrieval_count', () => {
    writeEntry('facts.jsonl', {
      id: 'entry-1', type: 'fact', content: 'x', created_at: '2026-01-01T00:00:00Z', weight: 0.5, retrieval_count: 5,
    });

    recordRetrieval(TEST_DIR, 'entry-1');
    const entries = readEntries('facts.jsonl');
    expect(entries[0].retrieval_count).toBe(6);
  });

  it('uses default weight 0.5 when weight is missing', () => {
    writeEntry('facts.jsonl', {
      id: 'entry-1', type: 'fact', content: 'x', created_at: '2026-01-01T00:00:00Z',
    });

    const update = recordRetrieval(TEST_DIR, 'entry-1');
    expect(update!.old_weight).toBe(0.5);
  });
});

describe('runValidationUpdate', () => {
  it('boosts weight for entries with passing tests', () => {
    // Create a fake test file
    const testFile = 'sf_cli/src/__tests__/fake.test.ts';
    mkdirSync(join(TEST_DIR, 'sf_cli/src/__tests__'), { recursive: true });
    writeFileSync(join(TEST_DIR, testFile), 'test content');

    writeEntry('decisions.jsonl', {
      id: 'entry-v1',
      type: 'decision',
      content: 'Test decision',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.6,
      reality_anchor: { has_tests: true, test_file: testFile, test_passing: true },
    });

    const updates = runValidationUpdate(TEST_DIR);
    expect(updates.length).toBe(1);
    expect(updates[0].new_weight).toBeCloseTo(0.6 + WEIGHT_CONFIG.validation_pass_boost, 2);
    expect(updates[0].reason).toContain('passing');
  });

  it('penalizes weight for entries with failing tests', () => {
    const testFile = 'sf_cli/src/__tests__/broken.test.ts';
    mkdirSync(join(TEST_DIR, 'sf_cli/src/__tests__'), { recursive: true });
    writeFileSync(join(TEST_DIR, testFile), 'broken test');

    writeEntry('errors.jsonl', {
      id: 'entry-v2',
      type: 'error',
      content: 'Test error',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.7,
      reality_anchor: { has_tests: true, test_file: testFile, test_passing: false },
    });

    const updates = runValidationUpdate(TEST_DIR);
    expect(updates.length).toBe(1);
    expect(updates[0].new_weight).toBeCloseTo(0.7 - WEIGHT_CONFIG.validation_fail_penalty, 2);
    expect(updates[0].reason).toContain('failing');
  });

  it('skips entries without test_file', () => {
    writeEntry('facts.jsonl', {
      id: 'entry-no-test',
      type: 'fact',
      content: 'No test',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.5,
      reality_anchor: { has_tests: false, test_file: null, test_passing: false },
    });

    const updates = runValidationUpdate(TEST_DIR);
    expect(updates.length).toBe(0);
  });

  it('respects weight floor on penalty', () => {
    const testFile = 'sf_cli/src/__tests__/min.test.ts';
    mkdirSync(join(TEST_DIR, 'sf_cli/src/__tests__'), { recursive: true });
    writeFileSync(join(TEST_DIR, testFile), 'x');

    writeEntry('errors.jsonl', {
      id: 'entry-floor',
      type: 'error',
      content: 'Floor test',
      created_at: '2026-03-01T00:00:00Z',
      weight: 0.15,
      reality_anchor: { has_tests: true, test_file: testFile, test_passing: false },
    });

    const updates = runValidationUpdate(TEST_DIR);
    expect(updates.length).toBe(1);
    expect(updates[0].new_weight).toBe(WEIGHT_CONFIG.weight_floor);
  });
});

describe('runDecay', () => {
  it('decays old entries with zero retrievals', () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    writeEntry('facts.jsonl', {
      id: 'old-entry',
      type: 'fact',
      content: 'Old fact',
      created_at: threeWeeksAgo,
      weight: 0.5,
      retrieval_count: 0,
    });

    const updates = runDecay(TEST_DIR);
    expect(updates.length).toBe(1);
    expect(updates[0].new_weight).toBeLessThan(0.5);
    expect(updates[0].reason).toContain('stale');
  });

  it('does not decay entries with retrievals', () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    writeEntry('facts.jsonl', {
      id: 'active-entry',
      type: 'fact',
      content: 'Active fact',
      created_at: threeWeeksAgo,
      weight: 0.5,
      retrieval_count: 3,
    });

    const updates = runDecay(TEST_DIR);
    expect(updates.length).toBe(0);
  });

  it('does not decay recent entries', () => {
    writeEntry('facts.jsonl', {
      id: 'recent-entry',
      type: 'fact',
      content: 'Recent fact',
      created_at: new Date().toISOString(),
      weight: 0.5,
      retrieval_count: 0,
    });

    const updates = runDecay(TEST_DIR);
    expect(updates.length).toBe(0);
  });

  it('respects weight floor', () => {
    const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    writeEntry('facts.jsonl', {
      id: 'ancient-entry',
      type: 'fact',
      content: 'Ancient fact',
      created_at: veryOld,
      weight: 0.2,
      retrieval_count: 0,
    });

    const updates = runDecay(TEST_DIR);
    if (updates.length > 0) {
      expect(updates[0].new_weight).toBeGreaterThanOrEqual(WEIGHT_CONFIG.weight_floor);
    }
  });
});

describe('runWeightLearning', () => {
  it('runs full cycle (validation + decay)', () => {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    writeEntry('facts.jsonl', {
      id: 'stale-1',
      type: 'fact',
      content: 'Stale fact',
      created_at: threeWeeksAgo,
      weight: 0.5,
      retrieval_count: 0,
    });

    const result = runWeightLearning(TEST_DIR);
    expect(result.entries_scanned).toBeGreaterThanOrEqual(1);
    expect(result.entries_updated).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBe(0);
  });

  it('returns empty when knowledge dir missing', () => {
    rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
    const result = runWeightLearning(TEST_DIR);
    expect(result.entries_scanned).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  it('handles empty knowledge files', () => {
    writeFileSync(join(KNOWLEDGE_DIR, 'empty.jsonl'), '');
    const result = runWeightLearning(TEST_DIR);
    expect(result.entries_scanned).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

describe('WEIGHT_CONFIG', () => {
  it('has valid ranges', () => {
    expect(WEIGHT_CONFIG.weight_floor).toBeGreaterThan(0);
    expect(WEIGHT_CONFIG.weight_ceiling).toBe(1.0);
    expect(WEIGHT_CONFIG.weight_floor).toBeLessThan(WEIGHT_CONFIG.weight_ceiling);
    expect(WEIGHT_CONFIG.retrieval_boost).toBeGreaterThan(0);
    expect(WEIGHT_CONFIG.validation_fail_penalty).toBeGreaterThan(0);
    expect(WEIGHT_CONFIG.decay_per_week).toBeGreaterThan(0);
  });
});

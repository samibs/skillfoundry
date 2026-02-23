import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadUsage, recordUsage, checkBudget, getUsageSummary } from '../core/budget.js';

const TEST_DIR = join(tmpdir(), 'sf-budget-test-' + Date.now());

beforeEach(() => {
  mkdirSync(join(TEST_DIR, '.skillfoundry'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadUsage', () => {
  it('should return default usage when no file exists', () => {
    const usage = loadUsage(TEST_DIR);
    expect(usage.version).toBe('1.0');
    expect(usage.entries).toHaveLength(0);
  });
});

describe('recordUsage', () => {
  it('should record a usage entry', () => {
    const usage = recordUsage(TEST_DIR, {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.003,
    });

    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0].provider).toBe('anthropic');
    expect(usage.entries[0].costUsd).toBe(0.003);
  });

  it('should accumulate monthly totals', () => {
    recordUsage(TEST_DIR, {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
    });
    const usage = recordUsage(TEST_DIR, {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.02,
    });

    const monthKey = Object.keys(usage.monthlyTotals)[0];
    expect(usage.monthlyTotals[monthKey]).toBeCloseTo(0.03);
  });

  it('should persist across loads', () => {
    recordUsage(TEST_DIR, {
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 500,
      outputTokens: 1000,
      costUsd: 0.05,
    });

    const loaded = loadUsage(TEST_DIR);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].provider).toBe('openai');
  });
});

describe('checkBudget', () => {
  it('should allow when under budget', () => {
    const check = checkBudget(TEST_DIR, 50, 2, 0.5);
    expect(check.allowed).toBe(true);
  });

  it('should block when monthly budget exceeded', () => {
    // Record a large spend
    recordUsage(TEST_DIR, {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 10000,
      outputTokens: 20000,
      costUsd: 55,
    });

    const check = checkBudget(TEST_DIR, 50, 2, 0);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Monthly budget exceeded');
  });

  it('should block when run budget exceeded', () => {
    const check = checkBudget(TEST_DIR, 50, 2, 2.5);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Run budget exceeded');
  });
});

describe('getUsageSummary', () => {
  it('should return summary with provider breakdown', () => {
    recordUsage(TEST_DIR, {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01,
    });
    recordUsage(TEST_DIR, {
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 300,
      outputTokens: 400,
      costUsd: 0.02,
    });

    const summary = getUsageSummary(TEST_DIR);
    expect(summary.totalEntries).toBe(2);
    expect(summary.byProvider['anthropic'].count).toBe(1);
    expect(summary.byProvider['openai'].count).toBe(1);
  });
});

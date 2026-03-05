import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { harvestRunMemory } from '../core/memory-harvest.js';
import type { HarvestInput } from '../core/memory-harvest.js';

const TEST_DIR = join(tmpdir(), 'sf-harvest-test-' + Date.now());
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

function baseInput(overrides?: Partial<HarvestInput>): HarvestInput {
  return {
    runId: 'forge-test-abc123',
    workDir: TEST_DIR,
    storiesCompleted: 3,
    storiesFailed: 0,
    storiesTotal: 3,
    totalCostUsd: 0.42,
    gateVerdict: 'PASS',
    gateSummary: { passed: 5, failed: 0, warned: 1 },
    storyExecutions: {
      'STORY-001-auth.md': { storyFile: 'STORY-001-auth.md', status: 'completed', turnCount: 5, costUsd: 0.14, fixerAttempts: 0 },
      'STORY-002-api.md': { storyFile: 'STORY-002-api.md', status: 'completed', turnCount: 3, costUsd: 0.12, fixerAttempts: 0 },
      'STORY-003-ui.md': { storyFile: 'STORY-003-ui.md', status: 'completed', turnCount: 4, costUsd: 0.16, fixerAttempts: 0 },
    },
    microGateResults: [],
    prdFiles: ['genesis/2026-01-01-auth.md'],
    ...overrides,
  };
}

function readJsonlEntries(filePath: string): Array<Record<string, unknown>> {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l));
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('harvestRunMemory', () => {
  it('writes run summary fact to facts.jsonl', () => {
    const result = harvestRunMemory(baseInput());

    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    const summary = facts.find((f) => (f.content as string).startsWith('Forge run:'));
    expect(summary).toBeDefined();
    expect(summary!.content).toContain('3/3 stories');
    expect(summary!.content).toContain('TEMPER PASS');
    expect(summary!.content).toContain('$0.42');
    expect(summary!.type).toBe('fact');
    expect(result.entriesWritten).toBeGreaterThanOrEqual(1);
  });

  it('writes error entries for failed stories to errors.jsonl', () => {
    const input = baseInput({
      storiesCompleted: 2,
      storiesFailed: 1,
      storyExecutions: {
        'STORY-001-auth.md': { storyFile: 'STORY-001-auth.md', status: 'completed', turnCount: 5, costUsd: 0.14, fixerAttempts: 0 },
        'STORY-002-api.md': { storyFile: 'STORY-002-api.md', status: 'completed', turnCount: 3, costUsd: 0.12, fixerAttempts: 0 },
        'STORY-003-ui.md': { storyFile: 'STORY-003-ui.md', status: 'failed', turnCount: 4, costUsd: 0.16, fixerAttempts: 2 },
      },
    });

    harvestRunMemory(input);

    const errors = readJsonlEntries(join(KNOWLEDGE_DIR, 'errors.jsonl'));
    const storyError = errors.find((e) => (e.content as string).includes('STORY-003-ui.md'));
    expect(storyError).toBeDefined();
    expect(storyError!.content).toContain('failed');
    expect(storyError!.content).toContain('2 fixer attempts');
    expect(storyError!.type).toBe('error');
  });

  it('writes error entries for MG FAIL findings', () => {
    const input = baseInput({
      microGateResults: [
        {
          gate: 'MG1', agent: 'security', verdict: 'FAIL',
          findings: [
            { severity: 'HIGH', description: 'SQL injection', location: 'src/db.ts:10' },
          ],
          summary: 'Issue', costUsd: 0.005, turnCount: 2, durationMs: 200,
        },
        {
          gate: 'MG2', agent: 'standards', verdict: 'PASS',
          findings: [], summary: 'Clean', costUsd: 0.004, turnCount: 1, durationMs: 150,
        },
      ],
    });

    harvestRunMemory(input);

    const errors = readJsonlEntries(join(KNOWLEDGE_DIR, 'errors.jsonl'));
    const mgError = errors.find((e) => (e.content as string).includes('SQL injection'));
    expect(mgError).toBeDefined();
    expect(mgError!.content).toContain('MG1 security FAIL');
    expect(mgError!.content).toContain('in src/db.ts:10');
  });

  it('skips MG findings that were skippedDueToError', () => {
    const input = baseInput({
      microGateResults: [
        {
          gate: 'MG1', agent: 'security', verdict: 'FAIL',
          findings: [{ severity: 'HIGH', description: 'Provider error' }],
          summary: 'Skipped', costUsd: 0, turnCount: 0, durationMs: 0,
          skippedDueToError: true,
        },
      ],
    });

    const result = harvestRunMemory(input);

    const errors = readJsonlEntries(join(KNOWLEDGE_DIR, 'errors.jsonl'));
    const providerError = errors.find((e) => (e.content as string).includes('Provider error'));
    expect(providerError).toBeUndefined();
    // Only run summary + gate verdict = 2 facts, 0 errors
    expect(result.entriesWritten).toBe(2);
  });

  it('writes gate verdict fact', () => {
    harvestRunMemory(baseInput());

    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    const verdict = facts.find((f) => (f.content as string).startsWith('TEMPER:'));
    expect(verdict).toBeDefined();
    expect(verdict!.content).toContain('5P 0F 1W');
    expect(verdict!.content).toContain('verdict PASS');
  });

  it('skips gate verdict when gateSummary is null', () => {
    const input = baseInput({ gateSummary: null, gateVerdict: 'UNKNOWN' });

    const result = harvestRunMemory(input);

    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    const verdict = facts.find((f) => (f.content as string).startsWith('TEMPER:'));
    expect(verdict).toBeUndefined();
    // Only run summary fact
    expect(result.entriesWritten).toBe(1);
  });

  it('creates memory_bank/knowledge/ dir if missing', () => {
    expect(existsSync(KNOWLEDGE_DIR)).toBe(false);

    harvestRunMemory(baseInput());

    expect(existsSync(KNOWLEDGE_DIR)).toBe(true);
  });

  it('deduplicates — no duplicate content on re-run', () => {
    const input = baseInput();

    harvestRunMemory(input);
    const firstRunFacts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));

    harvestRunMemory(input);
    const secondRunFacts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));

    expect(secondRunFacts.length).toBe(firstRunFacts.length);
  });

  it('entries follow full JSONL schema (all required fields present)', () => {
    harvestRunMemory(baseInput());

    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    expect(facts.length).toBeGreaterThan(0);

    for (const entry of facts) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('content');
      expect(entry).toHaveProperty('created_at');
      expect(entry).toHaveProperty('created_by', 'forge-pipeline');
      expect(entry).toHaveProperty('session_id');
      expect(entry).toHaveProperty('context');
      expect(entry).toHaveProperty('weight', 0.5);
      expect(entry).toHaveProperty('validation_count', 0);
      expect(entry).toHaveProperty('retrieval_count', 0);
      expect(entry).toHaveProperty('tags');
      expect((entry.tags as string[])).toContain('forge');
      expect((entry.tags as string[])).toContain('auto-harvest');
      expect(entry).toHaveProperty('reality_anchor');
      expect(entry).toHaveProperty('lineage');

      const context = entry.context as Record<string, unknown>;
      expect(context).toHaveProperty('phase', 'DEBRIEF');

      const anchor = entry.reality_anchor as Record<string, unknown>;
      expect(anchor).toHaveProperty('has_tests');
      expect(anchor).toHaveProperty('test_file');
      expect(anchor).toHaveProperty('test_passing');

      const lineage = entry.lineage as Record<string, unknown>;
      expect(lineage).toHaveProperty('parent_id');
      expect(lineage).toHaveProperty('supersedes');
      expect(lineage).toHaveProperty('superseded_by');
    }
  });

  it('returns correct entriesWritten count', () => {
    const input = baseInput({
      storiesCompleted: 2,
      storiesFailed: 1,
      storyExecutions: {
        'STORY-001.md': { storyFile: 'STORY-001.md', status: 'completed', turnCount: 5, costUsd: 0.1, fixerAttempts: 0 },
        'STORY-002.md': { storyFile: 'STORY-002.md', status: 'completed', turnCount: 3, costUsd: 0.1, fixerAttempts: 0 },
        'STORY-003.md': { storyFile: 'STORY-003.md', status: 'failed', turnCount: 4, costUsd: 0.1, fixerAttempts: 1 },
      },
      microGateResults: [
        {
          gate: 'MG1', agent: 'security', verdict: 'FAIL',
          findings: [{ severity: 'HIGH', description: 'XSS vulnerability', location: 'src/app.ts:5' }],
          summary: 'Fail', costUsd: 0.005, turnCount: 1, durationMs: 100,
        },
      ],
    });

    const result = harvestRunMemory(input);

    // 1 run summary fact + 1 failed story error + 1 MG FAIL error + 1 gate verdict fact = 4
    expect(result.entriesWritten).toBe(4);
  });

  it('handles zero-story runs without crashing', () => {
    const input = baseInput({
      storiesCompleted: 0,
      storiesFailed: 0,
      storiesTotal: 0,
      totalCostUsd: 0,
      storyExecutions: {},
      microGateResults: [],
    });

    const result = harvestRunMemory(input);

    // Run summary fact + gate verdict fact = 2
    expect(result.entriesWritten).toBe(2);
    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    expect(facts.length).toBe(2);
    expect((facts[0].content as string)).toContain('0/0 stories');
  });

  it('sets context.story_id for failed story entries', () => {
    const input = baseInput({
      storiesFailed: 1,
      storyExecutions: {
        'STORY-001.md': { storyFile: 'STORY-001.md', status: 'failed', turnCount: 3, costUsd: 0.1, fixerAttempts: 2 },
      },
    });

    harvestRunMemory(input);

    const errors = readJsonlEntries(join(KNOWLEDGE_DIR, 'errors.jsonl'));
    expect(errors.length).toBeGreaterThan(0);
    const ctx = errors[0].context as Record<string, unknown>;
    expect(ctx.story_id).toBe('STORY-001.md');
  });

  it('sets context.prd_id from first PRD file', () => {
    harvestRunMemory(baseInput());

    const facts = readJsonlEntries(join(KNOWLEDGE_DIR, 'facts.jsonl'));
    const ctx = facts[0].context as Record<string, unknown>;
    expect(ctx.prd_id).toBe('genesis/2026-01-01-auth.md');
  });
});

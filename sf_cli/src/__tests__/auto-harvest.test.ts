import { describe, it, expect } from 'vitest';
import {
  harvestStoryCompletion,
  harvestGateFailure,
  harvestFixerIntervention,
  harvestSessionSummary,
  type StoryCompletionEvent,
  type GateFailureEvent,
  type FixerInterventionEvent,
  type SessionSummaryEvent,
} from '../core/auto-harvest.js';

// ── Story Completion ────────────────────────────────────────────

describe('harvestStoryCompletion', () => {
  const baseEvent: StoryCompletionEvent = {
    storyId: 'STORY-001',
    prdId: 'passive-memory-engine',
    filesCreated: [],
    filesModified: [],
    testFilesCreated: [],
    dependenciesAdded: [],
    patterns: [],
  };

  it('produces fact entry for created files', () => {
    const event = { ...baseEvent, filesCreated: ['src/core/auto-harvest.ts'] };
    const entries = harvestStoryCompletion(event);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const fact = entries.find((e) => e.type === 'fact');
    expect(fact).toBeDefined();
    expect(fact!.content).toContain('auto-harvest.ts');
    expect(fact!.content).toContain('core module');
    expect(fact!.storyId).toBe('STORY-001');
    expect(fact!.prdId).toBe('passive-memory-engine');
  });

  it('produces fact entry for test files', () => {
    const event = { ...baseEvent, testFilesCreated: ['src/__tests__/auto-harvest.test.ts', 'src/__tests__/primer.test.ts'] };
    const entries = harvestStoryCompletion(event);
    const testFact = entries.find((e) => e.content.includes('test file'));
    expect(testFact).toBeDefined();
    expect(testFact!.content).toContain('2 test file(s)');
    expect(testFact!.tags).toContain('testing');
  });

  it('produces decision entry for dependencies', () => {
    const event = { ...baseEvent, dependenciesAdded: ['@anthropic-ai/sdk'] };
    const entries = harvestStoryCompletion(event);
    const dep = entries.find((e) => e.type === 'decision');
    expect(dep).toBeDefined();
    expect(dep!.content).toContain('@anthropic-ai/sdk');
    expect(dep!.tags).toContain('dependency');
  });

  it('produces decision entry for patterns', () => {
    const event = { ...baseEvent, patterns: ['singleton'] };
    const entries = harvestStoryCompletion(event);
    const pattern = entries.find((e) => e.content.includes('singleton'));
    expect(pattern).toBeDefined();
    expect(pattern!.type).toBe('decision');
  });

  it('returns empty array when nothing significant happened', () => {
    const entries = harvestStoryCompletion(baseEvent);
    expect(entries).toEqual([]);
  });

  it('extracts tags from file paths', () => {
    const event = { ...baseEvent, filesCreated: ['sf_cli/src/core/auth-service.ts'] };
    const entries = harvestStoryCompletion(event);
    const fact = entries[0];
    expect(fact.tags).toContain('core');
    expect(fact.tags).toContain('auth-service');
  });

  it('limits tags to 10', () => {
    const event = {
      ...baseEvent,
      filesCreated: Array.from({ length: 15 }, (_, i) => `src/modules/mod${i}/file${i}.ts`),
    };
    const entries = harvestStoryCompletion(event);
    expect(entries[0].tags.length).toBeLessThanOrEqual(10);
  });
});

// ── Gate Failure ────────────────────────────────────────────────

describe('harvestGateFailure', () => {
  it('produces error entry with gate and reason', () => {
    const event: GateFailureEvent = {
      gate: 'T3',
      agent: 'tester',
      storyId: 'STORY-002',
      prdId: 'test-prd',
      reason: 'Missing test coverage for auth module',
    };
    const entries = harvestGateFailure(event);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('error');
    expect(entries[0].content).toContain('T3 gate failed');
    expect(entries[0].content).toContain('tester');
    expect(entries[0].content).toContain('Missing test coverage');
    expect(entries[0].tags).toContain('gate-failure');
    expect(entries[0].tags).toContain('t3');
  });

  it('includes resolution when provided', () => {
    const event: GateFailureEvent = {
      gate: 'T5',
      agent: 'coder',
      storyId: 'STORY-003',
      prdId: 'test-prd',
      reason: 'Build failed',
      resolution: 'Fixed missing import in auth.ts',
    };
    const entries = harvestGateFailure(event);
    expect(entries[0].content).toContain('Resolution: Fixed missing import');
  });

  it('omits resolution text when not provided', () => {
    const event: GateFailureEvent = {
      gate: 'T2',
      agent: 'coder',
      storyId: 'STORY-004',
      prdId: 'test-prd',
      reason: 'Type errors detected',
    };
    const entries = harvestGateFailure(event);
    expect(entries[0].content).not.toContain('Resolution');
  });
});

// ── Fixer Intervention ──────────────────────────────────────────

describe('harvestFixerIntervention', () => {
  it('produces error entry for successful fix', () => {
    const event: FixerInterventionEvent = {
      storyId: 'STORY-005',
      prdId: 'test-prd',
      errorType: 'TypeScript',
      errorFile: 'src/core/auth.ts',
      errorMessage: 'Missing return type',
      fixApplied: 'Added Promise<void> return type',
      attempts: 2,
      succeeded: true,
    };
    const entries = harvestFixerIntervention(event);
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('error');
    expect(entries[0].content).toContain('TypeScript in auth.ts');
    expect(entries[0].content).toContain('Fixed after 2 attempt(s)');
    expect(entries[0].content).toContain('Added Promise<void>');
    expect(entries[0].tags).toContain('fixer');
  });

  it('marks unresolved fixes', () => {
    const event: FixerInterventionEvent = {
      storyId: 'STORY-006',
      prdId: 'test-prd',
      errorType: 'Runtime',
      errorFile: 'src/server.ts',
      errorMessage: 'Port already in use',
      fixApplied: 'Attempted port reassignment',
      attempts: 3,
      succeeded: false,
    };
    const entries = harvestFixerIntervention(event);
    expect(entries[0].content).toContain('Unresolved after 3 attempt(s)');
  });
});

// ── Session Summary ─────────────────────────────────────────────

describe('harvestSessionSummary', () => {
  it('produces fact entry with session stats', () => {
    const event: SessionSummaryEvent = {
      storiesCompleted: 7,
      storiesTotal: 8,
      testFilesCreated: 12,
      entriesHarvested: 5,
      gateVerdict: 'PASS',
    };
    const entry = harvestSessionSummary(event);
    expect(entry.type).toBe('fact');
    expect(entry.content).toContain('7/8 stories');
    expect(entry.content).toContain('12 test files');
    expect(entry.content).toContain('5 knowledge entries');
    expect(entry.content).toContain('verdict PASS');
    expect(entry.tags).toContain('session-summary');
  });
});

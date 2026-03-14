import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SessionRecorder } from '../core/session-recorder.js';
import type { PipelineResult, MicroGateResult } from '../types.js';

const TEST_DIR = join(process.cwd(), '__test-session-recorder__');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

function mockResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    runId: 'test-run-123',
    phases: [],
    storiesTotal: 5,
    storiesCompleted: 3,
    storiesFailed: 2,
    gateVerdict: 'PASS',
    totalCostUsd: 0.5,
    totalTokens: { input: 1000, output: 500 },
    durationMs: 60000,
    ...overrides,
  };
}

describe('SessionRecorder', () => {
  describe('issue tracking', () => {
    it('records issues with correct fields', () => {
      const recorder = new SessionRecorder('test-run');
      const id = recorder.addIssue('HIGH', 'BUILD_FAILURE', 'Build failed',
        'tsc error TS2307', 'Fix imports');

      expect(id).toMatch(/^issue-/);
      expect(recorder.getIssueCount()).toBe(1);
      const issues = recorder.getIssues();
      expect(issues[0].severity).toBe('HIGH');
      expect(issues[0].category).toBe('BUILD_FAILURE');
      expect(issues[0].title).toBe('Build failed');
      expect(issues[0].detail).toBe('tsc error TS2307');
      expect(issues[0].remediation).toBe('Fix imports');
    });

    it('tracks blocker count separately', () => {
      const recorder = new SessionRecorder('test-run');
      recorder.addIssue('CRITICAL', 'BLOCKER', 'Systemic failure', 'd', 'r');
      recorder.addIssue('HIGH', 'BUILD_FAILURE', 'Minor build issue', 'd', 'r');
      recorder.addIssue('CRITICAL', 'CIRCUIT_BREAKER', 'Halted', 'd', 'r');

      expect(recorder.getIssueCount()).toBe(3);
      expect(recorder.getBlockerCount()).toBe(2);
    });

    it('records anomalies with evidence', () => {
      const recorder = new SessionRecorder('test-run');
      recorder.addAnomaly('ZERO_TESTS', 'No tests', ['Evidence 1', 'Evidence 2']);

      expect(recorder.getAnomalies()).toHaveLength(1);
      expect(recorder.getAnomalies()[0].type).toBe('ZERO_TESTS');
      expect(recorder.getAnomalies()[0].evidence).toHaveLength(2);
    });
  });

  describe('anomaly detection', () => {
    it('detects zero tests with story completions', () => {
      const recorder = new SessionRecorder('test-run');
      const result = mockResult({ storiesCompleted: 5, storiesFailed: 0 });
      // testsFoundCount stays at 0 (default) since no TEST_EXIST pass callback was fired
      recorder.detectAnomalies(result);

      const anomalies = recorder.getAnomalies();
      expect(anomalies.some((a) => a.type === 'ZERO_TESTS_WITH_COMPLETIONS')).toBe(true);
    });

    it('detects PASS verdict with story failures', () => {
      const recorder = new SessionRecorder('test-run');
      const result = mockResult({ gateVerdict: 'PASS', storiesFailed: 3 });
      recorder.detectAnomalies(result);

      const anomalies = recorder.getAnomalies();
      expect(anomalies.some((a) => a.type === 'PASS_WITH_FAILURES')).toBe(true);
    });

    it('detects all stories passed but TEMPER failed', () => {
      const recorder = new SessionRecorder('test-run');
      const result = mockResult({
        storiesCompleted: 5,
        storiesFailed: 0,
        phases: [
          { name: 'TEMPER', status: 'failed', durationMs: 100 },
        ],
      });
      recorder.detectAnomalies(result);

      const anomalies = recorder.getAnomalies();
      expect(anomalies.some((a) => a.type === 'ALL_PASSED_BUT_TEMPER_FAILED')).toBe(true);
    });

    it('detects high cost with zero completion', () => {
      const recorder = new SessionRecorder('test-run');
      const result = mockResult({
        storiesCompleted: 0,
        storiesFailed: 5,
        totalCostUsd: 5.0,
      });
      recorder.detectAnomalies(result);

      const anomalies = recorder.getAnomalies();
      expect(anomalies.some((a) => a.type === 'HIGH_COST_ZERO_COMPLETION')).toBe(true);
    });

    it('does not flag anomalies on clean run', () => {
      const recorder = new SessionRecorder('test-run');
      // Simulate TEST_EXIST pass callback
      const callbacks = recorder.createCallbacks();
      callbacks.onGateResult?.('TEST_EXIST', 'pass', '3 test files');
      callbacks.onGateResult?.('TEST_EXIST', 'pass', '2 test files');

      const result = mockResult({
        storiesCompleted: 5,
        storiesFailed: 0,
        gateVerdict: 'PASS',
        totalCostUsd: 0.5,
      });
      recorder.detectAnomalies(result);

      expect(recorder.getAnomalies()).toHaveLength(0);
    });
  });

  describe('callback integration', () => {
    it('records gate failures as issues', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      callbacks.onGateResult?.('T2', 'fail', 'error TS2307: Cannot find module');

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].category).toBe('BUILD_FAILURE');
    });

    it('records circuit breaker activation', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      callbacks.onGateResult?.('CIRCUIT_BREAKER', 'fail', 'Consecutive failures detected');

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].category).toBe('CIRCUIT_BREAKER');
      expect(recorder.getIssues()[0].severity).toBe('CRITICAL');
    });

    it('records build baseline warnings', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      callbacks.onGateResult?.('BUILD_BASELINE', 'warn', 'Pre-existing errors');

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].severity).toBe('HIGH');
      expect(recorder.getIssues()[0].category).toBe('BUILD_FAILURE');
    });

    it('records test existence failures', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      callbacks.onStoryStart?.('STORY-001.md', 0, 3);
      callbacks.onGateResult?.('TEST_EXIST', 'fail', 'No test files');

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].category).toBe('TEST_GAP');
    });

    it('records micro-gate failures with findings', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      const mgResult: MicroGateResult = {
        gate: 'MG1',
        agent: 'security',
        verdict: 'FAIL',
        findings: [
          { severity: 'HIGH', description: 'SQL injection in query', location: 'db.ts:42' },
        ],
        summary: 'Security issues found',
        costUsd: 0.01,
        turnCount: 1,
        durationMs: 500,
      };

      callbacks.onMicroGateResult?.(mgResult);

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].category).toBe('SECURITY');
    });

    it('records skipped micro-gates as anomalies', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      const mgResult: MicroGateResult = {
        gate: 'MG1',
        agent: 'security',
        verdict: 'FAIL',
        findings: [],
        summary: 'Provider error',
        costUsd: 0,
        turnCount: 0,
        durationMs: 0,
        skippedDueToError: true,
      };

      callbacks.onMicroGateResult?.(mgResult);

      expect(recorder.getIssueCount()).toBe(1);
      expect(recorder.getIssues()[0].category).toBe('ANOMALY');
    });

    it('tracks current story context across callbacks', () => {
      const recorder = new SessionRecorder('test-run');
      const callbacks = recorder.createCallbacks();

      callbacks.onPhaseStart?.('FORGE', 'Implementing');
      callbacks.onStoryStart?.('STORY-003-api.md', 2, 5);
      callbacks.onGateResult?.('T2', 'fail', 'Type error');

      expect(recorder.getIssues()[0].story).toBe('STORY-003-api.md');
      expect(recorder.getIssues()[0].phase).toBe('FORGE');
    });
  });

  describe('report generation', () => {
    it('generates complete report with summary', () => {
      const recorder = new SessionRecorder('test-run');
      recorder.addIssue('CRITICAL', 'BLOCKER', 'Blocker', 'd', 'r');
      recorder.addIssue('HIGH', 'TEST_GAP', 'Missing tests', 'd', 'r');
      recorder.addIssue('LOW', 'QUALITY', 'Minor issue', 'd', 'r');
      recorder.addAnomaly('TEST', 'Test anomaly', ['evidence']);

      const report = recorder.generateReport();

      expect(report.runId).toBe('test-run');
      expect(report.issues).toHaveLength(3);
      expect(report.anomalies).toHaveLength(1);
      expect(report.summary.totalIssues).toBe(3);
      expect(report.summary.bySeverity.CRITICAL).toBe(1);
      expect(report.summary.bySeverity.HIGH).toBe(1);
      expect(report.summary.bySeverity.LOW).toBe(1);
      expect(report.summary.blockers).toBe(1);
      expect(report.summary.anomalies).toBe(1);
      expect(report.summary.topRemediations.length).toBeGreaterThan(0);
    });

    it('writes JSON and markdown report files', () => {
      const recorder = new SessionRecorder('test-run');
      recorder.addIssue('HIGH', 'BUILD_FAILURE', 'Build failed', 'error output', 'fix it');
      recorder.addAnomaly('TEST_ANOMALY', 'Something unexpected', ['proof']);

      const { jsonPath, mdPath } = recorder.writeReport(TEST_DIR);

      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(mdPath)).toBe(true);

      const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      expect(jsonData.runId).toBe('test-run');
      expect(jsonData.issues).toHaveLength(1);
      expect(jsonData.anomalies).toHaveLength(1);

      const md = readFileSync(mdPath, 'utf-8');
      expect(md).toContain('# Session Issues Report');
      expect(md).toContain('Build failed');
      expect(md).toContain('fix it');
    });

    it('writes clean run report when no issues', () => {
      const recorder = new SessionRecorder('clean-run');
      const { mdPath } = recorder.writeReport(TEST_DIR);

      const md = readFileSync(mdPath, 'utf-8');
      expect(md).toContain('Clean run');
    });
  });

  describe('error pattern tracking', () => {
    it('tracks recurring error patterns across stories', () => {
      const recorder = new SessionRecorder('test-run');

      recorder.trackErrorPattern("Can't resolve 'tailwindcss'", 'STORY-001', 'Dependency not installed');
      recorder.trackErrorPattern("Can't resolve 'tailwindcss'", 'STORY-002', 'Dependency not installed');
      recorder.trackErrorPattern("Can't resolve 'tailwindcss'", 'STORY-003', 'Dependency not installed');

      const result = mockResult();
      recorder.detectAnomalies(result);

      // Should generate a BLOCKER issue for recurring pattern
      const blockerIssues = recorder.getIssues().filter((i) => i.category === 'BLOCKER');
      expect(blockerIssues.length).toBeGreaterThan(0);
      expect(blockerIssues[0].title).toContain('Recurring error pattern');
    });

    it('does not flag single-occurrence patterns as blockers', () => {
      const recorder = new SessionRecorder('test-run');

      recorder.trackErrorPattern('Unique error A', 'STORY-001', 'One-off');
      recorder.trackErrorPattern('Different error B', 'STORY-002', 'Different cause');

      const result = mockResult();
      recorder.detectAnomalies(result);

      const blockerIssues = recorder.getIssues().filter((i) => i.category === 'BLOCKER');
      expect(blockerIssues).toHaveLength(0);
    });
  });
});

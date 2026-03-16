import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  recordGatePerf,
  recordGateResults,
  readPerfLog,
  computePerfStats,
  checkP95,
  formatPerfResult,
} from '../core/perf-tracker.js';
import type { GateResult } from '../core/gates.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sf-perf-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeResult(tier: string, durationMs: number): GateResult {
  return {
    tier,
    name: `Gate ${tier}`,
    status: 'pass',
    detail: 'Test result',
    durationMs,
  };
}

describe('perf-tracker', () => {
  describe('recordGatePerf', () => {
    it('creates directory and file if missing', () => {
      recordGatePerf(tempDir, makeResult('T1', 100));
      expect(existsSync(join(tempDir, '.skillfoundry', 'perf.jsonl'))).toBe(true);
    });

    it('writes valid JSONL entry', () => {
      recordGatePerf(tempDir, makeResult('T1', 42));
      const content = readFileSync(join(tempDir, '.skillfoundry', 'perf.jsonl'), 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.gate).toBe('T1');
      expect(entry.duration_ms).toBe(42);
      expect(entry.timestamp).toBeTruthy();
    });

    it('includes run_id when provided', () => {
      recordGatePerf(tempDir, makeResult('T2', 50), 'run-123');
      const entries = readPerfLog(tempDir);
      expect(entries[0].run_id).toBe('run-123');
    });

    it('appends multiple entries', () => {
      recordGatePerf(tempDir, makeResult('T1', 10));
      recordGatePerf(tempDir, makeResult('T2', 20));
      recordGatePerf(tempDir, makeResult('T3', 30));
      const entries = readPerfLog(tempDir);
      expect(entries).toHaveLength(3);
    });
  });

  describe('recordGateResults', () => {
    it('records all results at once', () => {
      const results = [makeResult('T1', 10), makeResult('T2', 20), makeResult('T4', 30)];
      recordGateResults(tempDir, results, 'run-456');
      const entries = readPerfLog(tempDir);
      expect(entries).toHaveLength(3);
      expect(entries.every((e) => e.run_id === 'run-456')).toBe(true);
    });
  });

  describe('readPerfLog', () => {
    it('returns empty array for missing file', () => {
      expect(readPerfLog(tempDir)).toEqual([]);
    });

    it('skips malformed lines', () => {
      mkdirSync(join(tempDir, '.skillfoundry'), { recursive: true });
      writeFileSync(
        join(tempDir, '.skillfoundry', 'perf.jsonl'),
        '{"gate":"T1","duration_ms":10,"timestamp":"2026-01-01"}\nBAD LINE\n{"gate":"T2","duration_ms":20,"timestamp":"2026-01-01"}\n',
      );
      const entries = readPerfLog(tempDir);
      expect(entries).toHaveLength(2);
    });
  });

  describe('computePerfStats', () => {
    it('computes stats per gate tier', () => {
      const entries = [
        { gate: 'T1', duration_ms: 10, timestamp: '' },
        { gate: 'T1', duration_ms: 20, timestamp: '' },
        { gate: 'T1', duration_ms: 30, timestamp: '' },
        { gate: 'T2', duration_ms: 100, timestamp: '' },
      ];
      const stats = computePerfStats(entries);
      expect(stats).toHaveLength(2);
      const t1 = stats.find((s) => s.gate === 'T1')!;
      expect(t1.count).toBe(3);
      expect(t1.min_ms).toBe(10);
      expect(t1.max_ms).toBe(30);
      expect(t1.avg_ms).toBe(20);
    });

    it('computes percentiles correctly', () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        gate: 'T1',
        duration_ms: i + 1,
        timestamp: '',
      }));
      const stats = computePerfStats(entries);
      const t1 = stats[0];
      expect(t1.p50_ms).toBe(50);
      expect(t1.p95_ms).toBe(95);
      expect(t1.p99_ms).toBe(99);
    });

    it('returns sorted by gate name', () => {
      const entries = [
        { gate: 'T4', duration_ms: 10, timestamp: '' },
        { gate: 'T1', duration_ms: 20, timestamp: '' },
        { gate: 'T2', duration_ms: 30, timestamp: '' },
      ];
      const stats = computePerfStats(entries);
      expect(stats.map((s) => s.gate)).toEqual(['T1', 'T2', 'T4']);
    });
  });

  describe('checkP95', () => {
    it('passes when all gates under threshold', () => {
      for (let i = 0; i < 10; i++) {
        recordGatePerf(tempDir, makeResult('T1', 100 + i));
        recordGatePerf(tempDir, makeResult('T2', 200 + i));
      }
      const result = checkP95(tempDir, 500);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('fails when P95 exceeds threshold', () => {
      // 10 fast + 10 slow — P95 will be in the slow range
      for (let i = 0; i < 10; i++) {
        recordGatePerf(tempDir, makeResult('T1', 100));
      }
      for (let i = 0; i < 10; i++) {
        recordGatePerf(tempDir, makeResult('T1', 1000));
      }
      const result = checkP95(tempDir, 500);
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('excludes T3 from P95 check', () => {
      for (let i = 0; i < 10; i++) {
        recordGatePerf(tempDir, makeResult('T3', 5000));
      }
      const result = checkP95(tempDir, 500);
      expect(result.passed).toBe(true);
    });

    it('skips gates with insufficient samples', () => {
      recordGatePerf(tempDir, makeResult('T1', 1000));
      const result = checkP95(tempDir, 500, 5);
      expect(result.passed).toBe(true); // Not enough samples to check
    });
  });

  describe('formatPerfResult', () => {
    it('includes gate stats', () => {
      for (let i = 0; i < 10; i++) {
        recordGatePerf(tempDir, makeResult('T1', 50 + i));
      }
      const result = checkP95(tempDir, 500);
      const output = formatPerfResult(result);
      expect(output).toContain('T1');
      expect(output).toContain('P95');
    });

    it('shows PASS for passing check', () => {
      const result: ReturnType<typeof checkP95> = {
        passed: true,
        stats: [],
        violations: [],
      };
      const output = formatPerfResult(result);
      expect(output).toContain('PASS');
    });
  });
});

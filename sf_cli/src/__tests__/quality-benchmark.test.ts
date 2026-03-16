import { describe, it, expect } from 'vitest';
import {
  ALL_SCENARIOS,
  evaluateScenario,
  runBenchmark,
  formatBenchmarkSummary,
} from '../core/quality-benchmark.js';

describe('quality-benchmark', () => {
  describe('scenario inventory', () => {
    it('has exactly 50 scenarios (25 bad + 25 good)', () => {
      expect(ALL_SCENARIOS).toHaveLength(50);
      const bad = ALL_SCENARIOS.filter((s) => s.id.startsWith('bad-'));
      const good = ALL_SCENARIOS.filter((s) => s.id.startsWith('good-'));
      expect(bad).toHaveLength(25);
      expect(good).toHaveLength(25);
    });

    it('all scenarios have unique IDs', () => {
      const ids = ALL_SCENARIOS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all scenarios have required fields', () => {
      for (const s of ALL_SCENARIOS) {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.content).toBeTruthy();
        expect(s.target_gate).toBeTruthy();
        expect(['pass', 'fail', 'warn']).toContain(s.expected_verdict);
      }
    });

    it('bad scenarios expect fail or warn', () => {
      const bad = ALL_SCENARIOS.filter((s) => s.id.startsWith('bad-'));
      for (const s of bad) {
        expect(['fail', 'warn']).toContain(s.expected_verdict);
      }
    });

    it('good scenarios expect pass', () => {
      const good = ALL_SCENARIOS.filter((s) => s.id.startsWith('good-'));
      for (const s of good) {
        expect(s.expected_verdict).toBe('pass');
      }
    });
  });

  describe('evaluateScenario', () => {
    it('detects TODO pattern', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'bad-01')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('fail');
      expect(result.correct).toBe(true);
    });

    it('detects hardcoded API key', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'bad-08')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('fail');
      expect(result.correct).toBe(true);
    });

    it('passes clean function', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'good-01')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('pass');
      expect(result.correct).toBe(true);
    });

    it('passes parameterized query', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'good-03')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('pass');
      expect(result.correct).toBe(true);
    });

    it('detects empty function body', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'bad-07')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('fail');
      expect(result.correct).toBe(true);
    });

    it('detects eval() usage', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'bad-12')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('fail');
      expect(result.correct).toBe(true);
    });

    it('detects @ts-ignore', () => {
      const scenario = ALL_SCENARIOS.find((s) => s.id === 'bad-13')!;
      const result = evaluateScenario(scenario);
      expect(result.actual).toBe('fail');
      expect(result.correct).toBe(true);
    });

    it('result includes duration', () => {
      const scenario = ALL_SCENARIOS[0];
      const result = evaluateScenario(scenario);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.scenario_id).toBe(scenario.id);
      expect(result.gate_tier).toBe(scenario.target_gate);
    });
  });

  describe('runBenchmark', () => {
    it('runs all 50 scenarios', () => {
      const summary = runBenchmark();
      expect(summary.total).toBe(50);
      expect(summary.results).toHaveLength(50);
    });

    it('achieves >90% accuracy', () => {
      const summary = runBenchmark();
      expect(summary.accuracy_pct).toBeGreaterThanOrEqual(90);
    });

    it('includes by_category breakdown', () => {
      const summary = runBenchmark();
      expect(Object.keys(summary.by_category).length).toBeGreaterThan(0);
      for (const stats of Object.values(summary.by_category)) {
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.correct).toBeLessThanOrEqual(stats.total);
      }
    });

    it('reports duration', () => {
      const summary = runBenchmark();
      expect(summary.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('runs on subset of scenarios', () => {
      const subset = ALL_SCENARIOS.slice(0, 5);
      const summary = runBenchmark(subset);
      expect(summary.total).toBe(5);
    });
  });

  describe('formatBenchmarkSummary', () => {
    it('includes accuracy percentage', () => {
      const summary = runBenchmark();
      const output = formatBenchmarkSummary(summary);
      expect(output).toContain('Accuracy:');
      expect(output).toContain('%');
    });

    it('includes category breakdown', () => {
      const summary = runBenchmark();
      const output = formatBenchmarkSummary(summary);
      expect(output).toContain('By category:');
    });

    it('shows BENCHMARK PASSED for >90% accuracy', () => {
      const summary = runBenchmark();
      if (summary.accuracy_pct >= 90) {
        const output = formatBenchmarkSummary(summary);
        expect(output).toContain('BENCHMARK PASSED');
      }
    });
  });
});

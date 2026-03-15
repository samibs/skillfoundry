import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  recordEvent,
  readEvents,
  readEventsByType,
  aggregateMetrics,
  formatMetrics,
  formatMetricsWithBaselines,
  INDUSTRY_BASELINES,
} from '../core/telemetry.js';
import type { TelemetryEvent, ForgeRunDetails } from '../core/telemetry.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-telemetry-' + process.pid);
const SF_DIR = join(TEST_DIR, '.skillfoundry');
const TELEMETRY_PATH = join(SF_DIR, 'telemetry.jsonl');

beforeEach(() => {
  mkdirSync(SF_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('recordEvent', () => {
  it('writes a telemetry event to JSONL file', () => {
    const event = recordEvent(TEST_DIR, 'forge_run', 'session-1', 'pass', 5000, { stories_total: 3 });
    expect(event).not.toBeNull();
    expect(event!.id).toBeTruthy();
    expect(event!.event_type).toBe('forge_run');
    expect(event!.status).toBe('pass');
    expect(event!.schema_version).toBe(1);

    const content = readFileSync(TELEMETRY_PATH, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe(event!.id);
  });

  it('appends multiple events', () => {
    recordEvent(TEST_DIR, 'forge_run', 's1', 'pass', 1000, {});
    recordEvent(TEST_DIR, 'gate_execution', 's1', 'fail', 200, { tier: 'T4' });

    const content = readFileSync(TELEMETRY_PATH, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines.length).toBe(2);
  });

  it('creates .skillfoundry directory if missing', () => {
    rmSync(SF_DIR, { recursive: true, force: true });
    const event = recordEvent(TEST_DIR, 'hook_execution', 's1', 'pass', 100, {});
    expect(event).not.toBeNull();
    expect(existsSync(TELEMETRY_PATH)).toBe(true);
  });

  it('returns null on write failure (read-only dir simulation)', () => {
    // Pass a path that can't be created
    const event = recordEvent('/nonexistent/path/that/should/fail', 'forge_run', 's1', 'pass', 100, {});
    expect(event).toBeNull();
  });
});

describe('readEvents', () => {
  it('reads events from JSONL file', () => {
    recordEvent(TEST_DIR, 'forge_run', 's1', 'pass', 1000, { a: 1 });
    recordEvent(TEST_DIR, 'gate_execution', 's1', 'fail', 200, { b: 2 });

    const { events, skipped } = readEvents(TEST_DIR);
    expect(events.length).toBe(2);
    expect(skipped).toBe(0);
  });

  it('returns empty for missing file', () => {
    rmSync(TELEMETRY_PATH, { force: true });
    const { events } = readEvents(TEST_DIR);
    expect(events.length).toBe(0);
  });

  it('skips malformed lines', () => {
    writeFileSync(TELEMETRY_PATH, '{"id":"a","event_type":"forge_run","timestamp":"2026-01-01"}\nnot json\n{"broken":true}\n');
    const { events, skipped } = readEvents(TEST_DIR);
    expect(events.length).toBe(1);
    expect(skipped).toBe(2);
  });
});

describe('readEventsByType', () => {
  it('filters events by type', () => {
    recordEvent(TEST_DIR, 'forge_run', 's1', 'pass', 1000, {});
    recordEvent(TEST_DIR, 'gate_execution', 's1', 'fail', 200, {});
    recordEvent(TEST_DIR, 'forge_run', 's2', 'warn', 2000, {});

    const forgeRuns = readEventsByType(TEST_DIR, 'forge_run');
    expect(forgeRuns.length).toBe(2);
  });
});

describe('aggregateMetrics', () => {
  function writeForgeRun(sessionId: string, status: TelemetryEvent['status'], details: Partial<ForgeRunDetails>, timestamp?: string) {
    const event: TelemetryEvent = {
      id: `test-${Math.random().toString(36).slice(2)}`,
      schema_version: 1,
      event_type: 'forge_run',
      timestamp: timestamp || new Date().toISOString(),
      session_id: sessionId,
      duration_ms: 5000,
      status,
      details: details as Record<string, unknown>,
    };
    const { appendFileSync } = require('node:fs');
    appendFileSync(TELEMETRY_PATH, JSON.stringify(event) + '\n');
  }

  it('returns zero aggregation when no data', () => {
    const agg = aggregateMetrics(TEST_DIR, 10);
    expect(agg.total_runs).toBe(0);
    expect(agg.trend).toBe('stable');
  });

  it('aggregates forge run metrics', () => {
    writeForgeRun('s1', 'pass', { gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 1, medium: 2, low: 0 }, tests_created: 10, rework_cycles: 1, cost_usd: 0.5 });
    writeForgeRun('s2', 'pass', { gate_passes: 7, gate_failures: 0, security_findings: { critical: 0, high: 0, medium: 1, low: 0 }, tests_created: 5, rework_cycles: 0, cost_usd: 0.3 });

    const agg = aggregateMetrics(TEST_DIR, 10);
    expect(agg.total_runs).toBe(2);
    expect(agg.successful_runs).toBe(2);
    expect(agg.total_security_findings.high).toBe(1);
    expect(agg.total_security_findings.medium).toBe(3);
    expect(agg.total_tests_created).toBe(15);
    expect(agg.total_rework_cycles).toBe(1);
    expect(agg.avg_cost_usd).toBeCloseTo(0.4, 1);
  });

  it('respects window size', () => {
    for (let i = 0; i < 15; i++) {
      writeForgeRun(`s${i}`, 'pass', { gate_passes: 7, gate_failures: 0 });
    }
    const agg = aggregateMetrics(TEST_DIR, 5);
    expect(agg.total_runs).toBe(5);
  });

  it('calculates gate pass rate', () => {
    writeForgeRun('s1', 'pass', { gate_passes: 6, gate_failures: 1 });
    writeForgeRun('s2', 'pass', { gate_passes: 5, gate_failures: 2 });

    const agg = aggregateMetrics(TEST_DIR, 10);
    expect(agg.avg_gate_pass_rate).toBeCloseTo(11 / 14, 2);
  });

  it('detects improving trend', () => {
    // Older runs: worse pass rate
    for (let i = 0; i < 4; i++) {
      writeForgeRun(`old-${i}`, 'pass', { gate_passes: 4, gate_failures: 3 }, new Date(Date.now() - 86400000 * (10 - i)).toISOString());
    }
    // Recent runs: better pass rate
    for (let i = 0; i < 4; i++) {
      writeForgeRun(`new-${i}`, 'pass', { gate_passes: 7, gate_failures: 0 }, new Date(Date.now() - 86400000 * (4 - i)).toISOString());
    }

    const agg = aggregateMetrics(TEST_DIR, 8);
    expect(agg.trend).toBe('improving');
  });

  it('counts failed and partial runs', () => {
    writeForgeRun('s1', 'fail', {});
    writeForgeRun('s2', 'warn', {});
    writeForgeRun('s3', 'pass', {});

    const agg = aggregateMetrics(TEST_DIR, 10);
    expect(agg.successful_runs).toBe(1);
    expect(agg.partial_runs).toBe(1);
    expect(agg.failed_runs).toBe(1);
  });

  it('aggregates dependency findings', () => {
    writeForgeRun('s1', 'pass', { dependency_findings: { critical: 1, high: 2, moderate: 3, low: 0 } });
    const agg = aggregateMetrics(TEST_DIR, 10);
    expect(agg.total_dependency_findings.critical).toBe(1);
    expect(agg.total_dependency_findings.high).toBe(2);
  });
});

describe('formatMetrics', () => {
  it('shows no-data message when empty', () => {
    const agg = aggregateMetrics(TEST_DIR, 10);
    const output = formatMetrics(agg);
    expect(output).toContain('No telemetry data yet');
  });

  it('formats aggregated metrics', () => {
    recordEvent(TEST_DIR, 'forge_run', 's1', 'pass', 120000, { gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 1, medium: 0, low: 0 }, tests_created: 10, rework_cycles: 1, cost_usd: 0.25 });

    const agg = aggregateMetrics(TEST_DIR, 10);
    const output = formatMetrics(agg);
    expect(output).toContain('Quality Metrics');
    expect(output).toContain('Forge Runs:');
    expect(output).toContain('Gate Pass Rate:');
    expect(output).toContain('Security Findings:');
  });
});

describe('formatMetricsWithBaselines', () => {
  it('includes industry comparison when data exists', () => {
    recordEvent(TEST_DIR, 'forge_run', 's1', 'pass', 5000, { gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 0, medium: 1, low: 0 } });

    const agg = aggregateMetrics(TEST_DIR, 10);
    const output = formatMetricsWithBaselines(agg);
    expect(output).toContain('vs Industry Baselines');
    expect(output).toContain('Veracode');
  });
});

describe('INDUSTRY_BASELINES', () => {
  it('has all expected baseline entries', () => {
    expect(INDUSTRY_BASELINES.security_vuln_rate.value).toBe(0.45);
    expect(INDUSTRY_BASELINES.issue_ratio_vs_human.value).toBe(1.7);
    expect(INDUSTRY_BASELINES.code_churn_rate.value).toBe(0.057);
  });

  it('each baseline has source and metric description', () => {
    for (const baseline of Object.values(INDUSTRY_BASELINES)) {
      expect(baseline.source).toBeTruthy();
      expect(baseline.metric).toBeTruthy();
      expect(typeof baseline.value).toBe('number');
    }
  });
});

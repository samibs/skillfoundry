import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateReport,
  formatReportMarkdown,
  formatReportJson,
} from '../core/report-generator.js';
import type { TelemetryEvent } from '../core/telemetry.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-reportgen-' + process.pid);
const SF_DIR = join(TEST_DIR, '.skillfoundry');
const TELEMETRY_PATH = join(SF_DIR, 'telemetry.jsonl');

function writeEvent(event: Partial<TelemetryEvent>) {
  const full: TelemetryEvent = {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    schema_version: 1,
    event_type: 'forge_run',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    duration_ms: 5000,
    status: 'pass',
    details: {},
    ...event,
  };
  appendFileSync(TELEMETRY_PATH, JSON.stringify(full) + '\n');
}

beforeEach(() => {
  mkdirSync(SF_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'test-project' }));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('generateReport', () => {
  it('generates report with no data', () => {
    const report = generateReport(TEST_DIR, 10);
    expect(report.summary.total_runs).toBe(0);
    expect(report.project_name).toBe('test-project');
    expect(report.generated_at).toBeTruthy();
  });

  it('generates report from forge run data', () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: {
        prd_count: 1,
        stories_total: 5,
        stories_completed: 5,
        stories_failed: 0,
        gate_passes: 30,
        gate_failures: 2,
        security_findings: { critical: 0, high: 1, medium: 3, low: 0 },
        tests_created: 20,
        rework_cycles: 1,
        cost_usd: 0.5,
      },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.summary.total_runs).toBe(1);
    expect(report.summary.success_rate).toBe(1);
    expect(report.security.total_findings).toBe(4);
    expect(report.security.by_severity.high).toBe(1);
  });

  it('includes security scan details', () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: { gate_passes: 7, gate_failures: 0 } });
    writeEvent({
      event_type: 'security_scan',
      status: 'pass',
      details: {
        scanner: 'semgrep',
        owasp_categories_checked: 10,
        findings_by_owasp: { A01: 2, A03: 1 },
      },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.security.owasp_coverage['A01']).toBe(2);
    expect(report.security.owasp_coverage['A03']).toBe(1);
  });

  it('includes dependency scan details', () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });
    writeEvent({
      event_type: 'dependency_scan',
      status: 'warn',
      details: {
        package_manager: 'npm',
        vulnerable_count: 3,
        findings: [
          { name: 'lodash', severity: 'high' },
          { name: 'axios', severity: 'moderate' },
          { name: 'qs', severity: 'moderate' },
        ],
      },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.dependencies.total_vulnerable).toBe(3);
    expect(report.dependencies.by_severity.high).toBe(1);
    expect(report.dependencies.by_severity.moderate).toBe(2);
  });

  it('calculates baselines when data exists', () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: {
        gate_passes: 6, gate_failures: 1,
        security_findings: { critical: 0, high: 0, medium: 1, low: 0 },
      },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.baselines.length).toBeGreaterThan(0);
    expect(report.baselines[0].source).toBeTruthy();
  });

  it('generates recommendations for critical findings', () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'fail',
      details: {
        gate_passes: 3, gate_failures: 4,
        security_findings: { critical: 2, high: 3, medium: 0, low: 0 },
      },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0]).toContain('CRITICAL');
  });

  it('computes verdict based on success rate', () => {
    writeEvent({ event_type: 'forge_run', status: 'fail', details: {} });
    writeEvent({ event_type: 'forge_run', status: 'fail', details: {} });
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });

    const report = generateReport(TEST_DIR, 10);
    expect(report.summary.verdict).toBe('AT RISK');
  });

  it('includes gate performance data', () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });
    writeEvent({
      event_type: 'gate_execution',
      status: 'pass',
      duration_ms: 200,
      details: { tier: 'T0', gate_name: 'Banned Patterns' },
    });
    writeEvent({
      event_type: 'gate_execution',
      status: 'fail',
      duration_ms: 500,
      details: { tier: 'T4', gate_name: 'Security Scan' },
    });

    const report = generateReport(TEST_DIR, 10);
    expect(report.gates.length).toBeGreaterThan(0);
  });
});

describe('formatReportMarkdown', () => {
  it('produces valid markdown structure', () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: { gate_passes: 7, gate_failures: 0, security_findings: { critical: 0, high: 0, medium: 1, low: 0 }, tests_created: 5 },
    });

    const report = generateReport(TEST_DIR, 10);
    const md = formatReportMarkdown(report);

    expect(md).toContain('# Quality Report');
    expect(md).toContain('## Executive Summary');
    expect(md).toContain('## Quality Trends');
    expect(md).toContain('## Security Posture');
    expect(md).toContain('## Recommendations');
    expect(md).toContain('Generated by SkillFoundry');
  });

  it('includes project name in title', () => {
    const report = generateReport(TEST_DIR, 10);
    const md = formatReportMarkdown(report);
    expect(md).toContain('test-project');
  });

  it('includes industry comparison table when baselines exist', () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: { gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 0, medium: 1, low: 0 } },
    });

    const report = generateReport(TEST_DIR, 10);
    const md = formatReportMarkdown(report);
    expect(md).toContain('## Industry Comparison');
    expect(md).toContain('Project');
    expect(md).toContain('Industry Avg');
  });
});

describe('formatReportJson', () => {
  it('produces valid JSON', () => {
    const report = generateReport(TEST_DIR, 10);
    const json = formatReportJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.generated_at).toBeTruthy();
    expect(parsed.summary).toBeTruthy();
    expect(parsed.security).toBeTruthy();
  });

  it('includes all report sections', () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });
    const report = generateReport(TEST_DIR, 10);
    const json = formatReportJson(report);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('security');
    expect(parsed).toHaveProperty('dependencies');
    expect(parsed).toHaveProperty('gates');
    expect(parsed).toHaveProperty('trends');
    expect(parsed).toHaveProperty('baselines');
    expect(parsed).toHaveProperty('recommendations');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  captureSnapshots,
  getSnapshots,
  getLatestSnapshots,
  computeProjectTrend,
  generateTrendReport,
  forecastMetric,
  formatTrendReport,
  formatSnapshotResult,
  formatForecast,
} from '../core/kpi-engine.js';
import {
  initDatabase,
  upsertProject,
  insertTelemetryEvents,
  insertFailurePatterns,
} from '../core/dashboard-db.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-kpi-engine-' + process.pid);
const DB_PATH = join(TEST_DIR, 'test.db');
let db: Database.Database;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = initDatabase(DB_PATH);
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function seedProjects() {
  upsertProject(db, { id: 'p1', path: '/path/alpha', name: 'alpha' });
  upsertProject(db, { id: 'p2', path: '/path/beta', name: 'beta' });
}

function seedTelemetry() {
  insertTelemetryEvents(db, 'p1', [
    { id: 'e1', event_type: 'forge_run', timestamp: '2026-03-01T10:00:00Z', status: 'pass', duration_ms: 60000 },
    { id: 'e2', event_type: 'forge_run', timestamp: '2026-03-02T10:00:00Z', status: 'pass', duration_ms: 55000 },
    { id: 'e3', event_type: 'forge_run', timestamp: '2026-03-03T10:00:00Z', status: 'fail', duration_ms: 30000 },
  ]);
  insertTelemetryEvents(db, 'p2', [
    { id: 'e4', event_type: 'forge_run', timestamp: '2026-03-01T10:00:00Z', status: 'pass', duration_ms: 45000 },
  ]);
}

function seedSnapshots(projectId: string, days: number, startRate: number, endRate: number) {
  const now = new Date();
  for (let d = days; d >= 0; d--) {
    const date = new Date(now.getTime() - d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const progress = days > 0 ? (days - d) / days : 0;
    const rate = startRate + (endRate - startRate) * progress;

    db.prepare(`
      INSERT OR IGNORE INTO kpi_snapshots (project_id, snapshot_date, forge_runs, success_rate, gate_pass_rate,
        security_findings_critical, security_findings_high, test_coverage, avg_cost_usd, trend)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, dateStr, 10 + d, rate, rate * 0.95, 0, 0, 0, 0.05, 'stable');
  }
}

describe('captureSnapshots', () => {
  it('captures snapshots for all projects', () => {
    seedProjects();
    seedTelemetry();

    const result = captureSnapshots(db);
    expect(result.projects_captured).toBe(2);
    expect(result.projects_skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify snapshots in DB
    const snapshots = db.prepare('SELECT * FROM kpi_snapshots').all();
    expect(snapshots).toHaveLength(2);
  });

  it('skips already-captured projects (same day)', () => {
    seedProjects();
    seedTelemetry();

    captureSnapshots(db);
    const result = captureSnapshots(db);

    expect(result.projects_captured).toBe(0);
    expect(result.projects_skipped).toBe(2);
  });

  it('captures for a single project when projectId specified', () => {
    seedProjects();
    seedTelemetry();

    const result = captureSnapshots(db, 'p1');
    expect(result.projects_captured).toBe(1);

    const snapshots = db.prepare('SELECT * FROM kpi_snapshots').all();
    expect(snapshots).toHaveLength(1);
  });

  it('sets trend based on prior snapshot', () => {
    seedProjects();
    seedTelemetry();

    // Insert prior snapshot with lower success rate
    db.prepare(`
      INSERT INTO kpi_snapshots (project_id, snapshot_date, forge_runs, success_rate, gate_pass_rate,
        security_findings_critical, security_findings_high, test_coverage, avg_cost_usd, trend)
      VALUES ('p1', '2026-03-01', 5, 0.4, 0.4, 0, 0, 0, 0.05, 'stable')
    `).run();

    // Capture new snapshot — p1 has 2/3 success rate (0.667), which is > 0.4 + 0.02
    const result = captureSnapshots(db, 'p1');
    expect(result.projects_captured).toBe(1);

    const latest = db.prepare(
      "SELECT trend FROM kpi_snapshots WHERE project_id = 'p1' ORDER BY snapshot_date DESC LIMIT 1"
    ).get() as { trend: string };
    expect(latest.trend).toBe('improving');
  });
});

describe('getSnapshots', () => {
  it('returns snapshots within window', () => {
    seedProjects();
    seedSnapshots('p1', 10, 0.6, 0.8);

    const snapshots = getSnapshots(db, 'p1', 30);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].project_id).toBe('p1');
    // Should be sorted ASC
    if (snapshots.length > 1) {
      expect(snapshots[0].snapshot_date <= snapshots[snapshots.length - 1].snapshot_date).toBe(true);
    }
  });

  it('returns empty for non-existent project', () => {
    seedProjects();
    const snapshots = getSnapshots(db, 'nonexistent', 30);
    expect(snapshots).toHaveLength(0);
  });
});

describe('getLatestSnapshots', () => {
  it('returns latest snapshot per project', () => {
    seedProjects();
    seedSnapshots('p1', 5, 0.6, 0.8);
    seedSnapshots('p2', 3, 0.7, 0.9);

    const latest = getLatestSnapshots(db);
    expect(latest).toHaveLength(2);
    expect(latest.map(s => s.project_name).sort()).toEqual(['alpha', 'beta']);
  });
});

describe('computeProjectTrend', () => {
  it('returns insufficient_data when no snapshots', () => {
    seedProjects();
    const trend = computeProjectTrend(db, 'p1', 'alpha', 7);
    expect(trend.overall_direction).toBe('insufficient_data');
    expect(trend.snapshot_count).toBe(0);
  });

  it('detects improving trend', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.5, 0.9);

    const trend = computeProjectTrend(db, 'p1', 'alpha', 7);
    expect(trend.project_name).toBe('alpha');
    expect(trend.snapshot_count).toBeGreaterThan(0);

    const successMetric = trend.metrics.find(m => m.metric === 'success_rate');
    expect(successMetric).toBeDefined();
    if (successMetric && successMetric.direction !== 'insufficient_data') {
      expect(successMetric.current).toBeGreaterThan(successMetric.previous);
    }
  });

  it('detects declining trend', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.9, 0.5);

    const trend = computeProjectTrend(db, 'p1', 'alpha', 7);

    const successMetric = trend.metrics.find(m => m.metric === 'success_rate');
    if (successMetric && successMetric.direction !== 'insufficient_data') {
      expect(successMetric.direction).toBe('declining');
    }
  });

  it('includes all metric types', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.7, 0.8);

    const trend = computeProjectTrend(db, 'p1', 'alpha', 7);
    const metricNames = trend.metrics.map(m => m.metric);
    expect(metricNames).toContain('success_rate');
    expect(metricNames).toContain('gate_pass_rate');
    expect(metricNames).toContain('forge_runs');
    expect(metricNames).toContain('avg_cost_usd');
    expect(metricNames).toContain('security_findings_critical');
  });
});

describe('generateTrendReport', () => {
  it('returns empty report when no data', () => {
    const report = generateTrendReport(db);
    expect(report.projects).toHaveLength(0);
    expect(report.alerts).toHaveLength(0);
    expect(report.global_summary.projects_improving).toBe(0);
  });

  it('aggregates trends across projects', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.5, 0.9);
    seedSnapshots('p2', 14, 0.8, 0.8);

    const report = generateTrendReport(db, 7);
    expect(report.projects).toHaveLength(2);
    expect(report.window_days).toBe(7);
    expect(typeof report.global_summary.avg_success_rate).toBe('number');
  });

  it('detects alerts for declining success rate', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.9, 0.3); // dramatic decline

    const report = generateTrendReport(db, 7);
    const alerts = report.alerts.filter(a => a.metric === 'success_rate');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts alerts by severity', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.9, 0.3);

    const report = generateTrendReport(db, 7);
    if (report.alerts.length > 1) {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      for (let i = 1; i < report.alerts.length; i++) {
        expect(severityOrder[report.alerts[i - 1].severity]).toBeLessThanOrEqual(
          severityOrder[report.alerts[i].severity]
        );
      }
    }
  });
});

describe('forecastMetric', () => {
  it('returns insufficient_data when too few snapshots', () => {
    seedProjects();
    const forecast = forecastMetric(db, 'p1', 'success_rate');
    expect(forecast.trend_direction).toBe('insufficient_data');
    expect(forecast.forecast).toHaveLength(0);
  });

  it('generates forecast points', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.6, 0.8);

    const forecast = forecastMetric(db, 'p1', 'success_rate', 14, 7);
    expect(forecast.forecast.length).toBe(7);
    expect(forecast.metric).toBe('success_rate');
    expect(typeof forecast.current).toBe('number');

    // Forecast dates should be in the future
    for (const point of forecast.forecast) {
      expect(point.date).toBeTruthy();
      expect(typeof point.value).toBe('number');
    }
  });

  it('clamps rate metrics between 0 and 1', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.6, 0.99);

    const forecast = forecastMetric(db, 'p1', 'success_rate', 14, 30);
    for (const point of forecast.forecast) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(1);
    }
  });

  it('works with cost metric', () => {
    seedProjects();
    seedSnapshots('p1', 14, 0.6, 0.8);

    const forecast = forecastMetric(db, 'p1', 'avg_cost_usd', 14, 7);
    expect(forecast.metric).toBe('avg_cost_usd');
    expect(forecast.forecast.length).toBe(7);
    for (const point of forecast.forecast) {
      expect(point.value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('formatTrendReport', () => {
  it('formats empty report', () => {
    const output = formatTrendReport({
      generated_at: new Date().toISOString(),
      window_days: 7,
      projects: [],
      alerts: [],
      global_summary: {
        projects_improving: 0,
        projects_declining: 0,
        projects_stable: 0,
        avg_success_rate: 0,
        avg_success_rate_change: 0,
      },
    });

    expect(output).toContain('KPI Trend Report');
    expect(output).toContain('No project data');
  });

  it('formats report with data', () => {
    const output = formatTrendReport({
      generated_at: new Date().toISOString(),
      window_days: 7,
      projects: [{
        project_id: 'p1',
        project_name: 'alpha',
        overall_direction: 'improving',
        metrics: [
          { metric: 'success_rate', current: 0.85, previous: 0.75, change: 0.10, change_pct: 0.133, direction: 'improving', alert: false },
          { metric: 'gate_pass_rate', current: 0.80, previous: 0.78, change: 0.02, change_pct: 0.025, direction: 'stable', alert: false },
          { metric: 'avg_cost_usd', current: 0.05, previous: 0.06, change: -0.01, change_pct: -0.167, direction: 'improving', alert: false },
        ],
        snapshot_count: 14,
        first_snapshot: '2026-03-01',
        latest_snapshot: '2026-03-14',
      }],
      alerts: [
        { project_name: 'beta', metric: 'success_rate', severity: 'warning', message: 'Success rate declining', current_value: 0.5, previous_value: 0.7 },
      ],
      global_summary: {
        projects_improving: 1,
        projects_declining: 0,
        projects_stable: 0,
        avg_success_rate: 0.85,
        avg_success_rate_change: 0.10,
      },
    });

    expect(output).toContain('KPI Trend Report');
    expect(output).toContain('Improving: 1');
    expect(output).toContain('alpha');
    expect(output).toContain('[WARNING]');
    expect(output).toContain('Success rate declining');
  });
});

describe('formatSnapshotResult', () => {
  it('formats capture result', () => {
    const output = formatSnapshotResult({
      projects_captured: 5,
      projects_skipped: 2,
      errors: [],
    });

    expect(output).toContain('KPI Snapshot Capture');
    expect(output).toContain('Projects captured: 5');
    expect(output).toContain('Projects skipped:  2');
  });

  it('includes errors', () => {
    const output = formatSnapshotResult({
      projects_captured: 3,
      projects_skipped: 0,
      errors: ['p1: database locked'],
    });

    expect(output).toContain('Errors (1)');
    expect(output).toContain('database locked');
  });
});

describe('formatForecast', () => {
  it('formats forecast data', () => {
    const output = formatForecast([{
      metric: 'success_rate',
      current: 0.85,
      forecast: [
        { date: '2026-03-15', value: 0.86 },
        { date: '2026-03-16', value: 0.87 },
      ],
      trend_direction: 'improving',
    }]);

    expect(output).toContain('KPI Forecast');
    expect(output).toContain('success_rate');
    expect(output).toContain('IMPROVING');
    expect(output).toContain('86.0%');
  });

  it('handles insufficient data', () => {
    const output = formatForecast([{
      metric: 'success_rate',
      current: 0,
      forecast: [],
      trend_direction: 'insufficient_data',
    }]);

    expect(output).toContain('Insufficient data');
  });
});

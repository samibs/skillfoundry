import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  initDatabase,
  upsertProject,
  insertTelemetryEvents,
  insertPerfEntries,
  insertKnowledgeEntries,
  insertFailurePatterns,
  getProjectSyncState,
  updateSyncTimestamp,
  getProjectSummaries,
  getProjectDetail,
  getFailurePatterns,
  getProjectRankings,
  computeProjectKpis,
  computeHealthReport,
} from '../core/dashboard-db.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-dashboard-db-' + process.pid);
const DB_PATH = join(TEST_DIR, 'test.db');
let db: Database.Database;

beforeEach(() => {
  db = initDatabase(DB_PATH);
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('initDatabase', () => {
  it('creates a database file with required tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('telemetry_events');
    expect(tableNames).toContain('perf_entries');
    expect(tableNames).toContain('knowledge_entries');
    expect(tableNames).toContain('failure_patterns');
    expect(tableNames).toContain('kpi_snapshots');
  });

  it('sets WAL journal mode', () => {
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(mode).toBe('wal');
  });

  it('is idempotent (can be called twice)', () => {
    const db2 = initDatabase(DB_PATH);
    const tables = db2.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get() as { cnt: number };
    expect(tables.cnt).toBeGreaterThan(0);
    db2.close();
  });
});

describe('upsertProject', () => {
  it('inserts a new project', () => {
    upsertProject(db, {
      id: 'proj-1',
      path: '/home/test/proj1',
      name: 'proj1',
      platform: 'claude',
    });

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get('proj-1') as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.name).toBe('proj1');
    expect(row.platform).toBe('claude');
  });

  it('updates an existing project on conflict', () => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'old-name' });
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'new-name', health_status: 'healthy' });

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get('proj-1') as Record<string, unknown>;
    expect(row.name).toBe('new-name');
    expect(row.health_status).toBe('healthy');
  });
});

describe('insertTelemetryEvents', () => {
  beforeEach(() => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
  });

  it('inserts telemetry events', () => {
    const count = insertTelemetryEvents(db, 'proj-1', [
      { id: 'evt-1', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-01T00:00:00Z', status: 'pass', duration_ms: 5000 },
      { id: 'evt-2', project_id: 'proj-1', event_type: 'gate_execution', timestamp: '2026-01-01T00:01:00Z', status: 'fail', duration_ms: 200 },
    ]);

    expect(count).toBe(2);
    const rows = db.prepare('SELECT * FROM telemetry_events WHERE project_id = ?').all('proj-1');
    expect(rows.length).toBe(2);
  });

  it('skips duplicate events by ID', () => {
    insertTelemetryEvents(db, 'proj-1', [
      { id: 'evt-1', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-01T00:00:00Z' },
    ]);

    const count = insertTelemetryEvents(db, 'proj-1', [
      { id: 'evt-1', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-01T00:00:00Z' },
      { id: 'evt-3', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-02T00:00:00Z' },
    ]);

    expect(count).toBe(1); // Only evt-3 is new
    const total = db.prepare('SELECT count(*) as cnt FROM telemetry_events').get() as { cnt: number };
    expect(total.cnt).toBe(2);
  });

  it('returns 0 for empty array', () => {
    const count = insertTelemetryEvents(db, 'proj-1', []);
    expect(count).toBe(0);
  });
});

describe('insertPerfEntries', () => {
  beforeEach(() => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
  });

  it('inserts performance entries', () => {
    const count = insertPerfEntries(db, 'proj-1', [
      { project_id: 'proj-1', gate: 'T1-lint', duration_ms: 150, timestamp: '2026-01-01T00:00:00Z' },
      { project_id: 'proj-1', gate: 'T2-test', duration_ms: 300, timestamp: '2026-01-01T00:01:00Z', run_id: 'run-1' },
    ]);

    expect(count).toBe(2);
  });
});

describe('insertFailurePatterns', () => {
  beforeEach(() => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
  });

  it('inserts failure patterns', () => {
    const count = insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'BUILD_FAILURE:tsc', severity: 'error', detail: 'TypeScript compile error' },
    ]);

    expect(count).toBe(1);
  });

  it('upserts on duplicate signature — increments occurrences', () => {
    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'BUILD_FAILURE:tsc', occurrences: 1, last_seen: '2026-01-01T00:00:00Z' },
    ]);

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'BUILD_FAILURE:tsc', occurrences: 2, last_seen: '2026-01-02T00:00:00Z' },
    ]);

    const row = db.prepare("SELECT * FROM failure_patterns WHERE signature = 'BUILD_FAILURE:tsc'").get() as Record<string, unknown>;
    expect(row.occurrences).toBe(3); // 1 + 2
    expect(row.last_seen).toBe('2026-01-02T00:00:00Z');
  });
});

describe('insertKnowledgeEntries', () => {
  beforeEach(() => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
  });

  it('inserts knowledge entries', () => {
    const count = insertKnowledgeEntries(db, 'proj-1', [
      { id: 'k-1', project_id: 'proj-1', type: 'lesson', content: 'Always test edge cases' },
      { id: 'k-2', project_id: 'proj-1', type: 'error', content: 'Off-by-one in pagination' },
    ]);

    expect(count).toBe(2);
  });

  it('skips duplicate knowledge by ID', () => {
    insertKnowledgeEntries(db, 'proj-1', [
      { id: 'k-1', project_id: 'proj-1', type: 'lesson', content: 'test' },
    ]);

    const count = insertKnowledgeEntries(db, 'proj-1', [
      { id: 'k-1', project_id: 'proj-1', type: 'lesson', content: 'test' },
      { id: 'k-3', project_id: 'proj-1', type: 'fact', content: 'new entry' },
    ]);

    expect(count).toBe(1);
  });
});

describe('getProjectSyncState', () => {
  it('returns null last_synced_at for new project', () => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
    const state = getProjectSyncState(db, 'proj-1');
    expect(state.last_synced_at).toBeNull();
  });

  it('returns last_synced_at after sync', () => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'proj1' });
    updateSyncTimestamp(db, 'proj-1');

    const state = getProjectSyncState(db, 'proj-1');
    expect(state.last_synced_at).toBeTruthy();
  });
});

describe('getProjectSummaries', () => {
  it('returns empty array when no projects', () => {
    const summaries = getProjectSummaries(db);
    expect(summaries).toEqual([]);
  });

  it('returns project summaries with event and failure counts', () => {
    upsertProject(db, { id: 'proj-1', path: '/path1', name: 'alpha' });
    upsertProject(db, { id: 'proj-2', path: '/path2', name: 'beta' });

    insertTelemetryEvents(db, 'proj-1', [
      { id: 'e1', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-01T00:00:00Z' },
      { id: 'e2', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-01-02T00:00:00Z' },
    ]);

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'err:1', severity: 'error' },
    ]);

    const summaries = getProjectSummaries(db);
    expect(summaries.length).toBe(2);

    // Sorted by name: alpha first
    expect(summaries[0].name).toBe('alpha');
    expect(summaries[0].event_count).toBe(2);
    expect(summaries[0].failure_count).toBe(1);

    expect(summaries[1].name).toBe('beta');
    expect(summaries[1].event_count).toBe(0);
    expect(summaries[1].failure_count).toBe(0);
  });
});

// ── Phase 2: Advanced Query Tests ──────────────────────────────────

function seedTestData() {
  upsertProject(db, { id: 'proj-1', path: '/path/alpha', name: 'alpha', platform: 'claude', framework_version: '2.0.67', health_status: 'healthy' });
  upsertProject(db, { id: 'proj-2', path: '/path/beta', name: 'beta', platform: 'claude', framework_version: '2.0.60' });

  insertTelemetryEvents(db, 'proj-1', [
    { id: 'e1', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-03-01T10:00:00Z', status: 'pass', duration_ms: 120000, details: JSON.stringify({ gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 1, medium: 2, low: 0 }, cost_usd: 0.5 }) },
    { id: 'e2', project_id: 'proj-1', event_type: 'forge_run', timestamp: '2026-03-02T10:00:00Z', status: 'fail', duration_ms: 60000, details: JSON.stringify({ gate_passes: 3, gate_failures: 4, security_findings: { critical: 1, high: 0, medium: 0, low: 0 }, cost_usd: 0.3 }) },
    { id: 'e3', project_id: 'proj-1', event_type: 'gate_execution', timestamp: '2026-03-01T10:01:00Z', status: 'pass', duration_ms: 200 },
  ]);

  insertTelemetryEvents(db, 'proj-2', [
    { id: 'e4', project_id: 'proj-2', event_type: 'forge_run', timestamp: '2026-03-01T12:00:00Z', status: 'pass', duration_ms: 90000, details: JSON.stringify({ gate_passes: 7, gate_failures: 0, cost_usd: 0.2 }) },
  ]);

  insertPerfEntries(db, 'proj-1', [
    { project_id: 'proj-1', gate: 'T1-lint', duration_ms: 100, timestamp: '2026-03-01T10:00:10Z' },
    { project_id: 'proj-1', gate: 'T1-lint', duration_ms: 150, timestamp: '2026-03-02T10:00:10Z' },
    { project_id: 'proj-1', gate: 'T2-test', duration_ms: 400, timestamp: '2026-03-01T10:00:20Z' },
  ]);

  insertFailurePatterns(db, 'proj-1', [
    { project_id: 'proj-1', signature: 'BUILD:tsc', occurrences: 3, severity: 'error', last_seen: '2026-03-02T10:00:00Z', detail: 'TypeScript error' },
    { project_id: 'proj-1', signature: 'TEST:timeout', occurrences: 1, severity: 'warning', last_seen: '2026-03-01T10:00:00Z', detail: 'Test timeout' },
  ]);

  insertFailurePatterns(db, 'proj-2', [
    { project_id: 'proj-2', signature: 'LINT:unused', occurrences: 5, severity: 'warning', last_seen: '2026-03-01T12:00:00Z' },
  ]);

  insertKnowledgeEntries(db, 'proj-1', [
    { id: 'k1', project_id: 'proj-1', type: 'lesson', content: 'Use strict mode' },
    { id: 'k2', project_id: 'proj-1', type: 'error', content: 'Off-by-one' },
  ]);
}

describe('getProjectDetail', () => {
  beforeEach(seedTestData);

  it('returns detailed info for a project by name', () => {
    const detail = getProjectDetail(db, 'alpha');
    expect(detail).not.toBeNull();
    expect(detail!.project.name).toBe('alpha');
    expect(detail!.project.framework_version).toBe('2.0.67');
  });

  it('returns detailed info for a project by ID', () => {
    const detail = getProjectDetail(db, 'proj-1');
    expect(detail).not.toBeNull();
    expect(detail!.project.name).toBe('alpha');
  });

  it('returns null for nonexistent project', () => {
    const detail = getProjectDetail(db, 'nonexistent');
    expect(detail).toBeNull();
  });

  it('includes event counts by type', () => {
    const detail = getProjectDetail(db, 'alpha')!;
    expect(detail.event_counts['forge_run']).toBe(2);
    expect(detail.event_counts['gate_execution']).toBe(1);
  });

  it('includes recent events (newest first)', () => {
    const detail = getProjectDetail(db, 'alpha')!;
    expect(detail.recent_events.length).toBe(3);
    expect(detail.recent_events[0].timestamp).toBe('2026-03-02T10:00:00Z');
  });

  it('includes failure patterns sorted by occurrences', () => {
    const detail = getProjectDetail(db, 'alpha')!;
    expect(detail.failure_patterns.length).toBe(2);
    expect(detail.failure_patterns[0].signature).toBe('BUILD:tsc');
    expect(detail.failure_patterns[0].occurrences).toBe(3);
  });

  it('includes perf stats grouped by gate', () => {
    const detail = getProjectDetail(db, 'alpha')!;
    expect(detail.perf_stats.length).toBe(2);
    // T2-test has higher avg, comes first (sorted by avg_ms DESC)
    expect(detail.perf_stats[0].gate).toBe('T2-test');
    expect(detail.perf_stats[0].avg_ms).toBe(400);
  });

  it('includes knowledge count', () => {
    const detail = getProjectDetail(db, 'alpha')!;
    expect(detail.knowledge_count).toBe(2);
  });
});

describe('getFailurePatterns', () => {
  beforeEach(seedTestData);

  it('returns all failure patterns across projects', () => {
    const patterns = getFailurePatterns(db);
    expect(patterns.length).toBe(3);
    // Sorted by occurrences DESC
    expect(patterns[0].signature).toBe('LINT:unused');
    expect(patterns[0].occurrences).toBe(5);
  });

  it('filters by severity', () => {
    const patterns = getFailurePatterns(db, { severity: 'error' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].signature).toBe('BUILD:tsc');
  });

  it('filters by project name', () => {
    const patterns = getFailurePatterns(db, { projectName: 'beta' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].signature).toBe('LINT:unused');
  });

  it('respects limit', () => {
    const patterns = getFailurePatterns(db, { limit: 1 });
    expect(patterns.length).toBe(1);
  });

  it('combines severity and project filters', () => {
    const patterns = getFailurePatterns(db, { severity: 'warning', projectName: 'alpha' });
    expect(patterns.length).toBe(1);
    expect(patterns[0].signature).toBe('TEST:timeout');
  });
});

describe('getProjectRankings', () => {
  beforeEach(seedTestData);

  it('ranks by events', () => {
    const rankings = getProjectRankings(db, 'events');
    expect(rankings.length).toBe(2);
    expect(rankings[0].name).toBe('alpha');
    expect(rankings[0].value).toBe(3); // 2 forge_run + 1 gate_execution
    expect(rankings[0].rank).toBe(1);
  });

  it('ranks by failures', () => {
    const rankings = getProjectRankings(db, 'failures');
    expect(rankings[0].name).toBe('beta'); // 5 occurrences
    expect(rankings[0].value).toBe(5);
  });

  it('ranks by perf (avg duration)', () => {
    const rankings = getProjectRankings(db, 'perf');
    // Only alpha has perf data
    expect(rankings.length).toBe(1);
    expect(rankings[0].name).toBe('alpha');
  });

  it('respects limit', () => {
    const rankings = getProjectRankings(db, 'events', 1);
    expect(rankings.length).toBe(1);
  });
});

describe('computeProjectKpis', () => {
  beforeEach(seedTestData);

  it('computes KPIs across all projects', () => {
    const kpi = computeProjectKpis(db);
    expect(kpi.total_forge_runs).toBe(3);
    expect(kpi.successful_runs).toBe(2);
    expect(kpi.failed_runs).toBe(1);
    expect(kpi.success_rate).toBeCloseTo(2 / 3, 2);
  });

  it('computes gate pass rate from details JSON', () => {
    const kpi = computeProjectKpis(db);
    // proj-1: 6+3=9 passes, 1+4=5 failures; proj-2: 7 passes, 0 failures
    expect(kpi.total_gate_passes).toBe(16);
    expect(kpi.total_gate_failures).toBe(5);
    expect(kpi.gate_pass_rate).toBeCloseTo(16 / 21, 2);
  });

  it('computes security findings from details JSON', () => {
    const kpi = computeProjectKpis(db);
    expect(kpi.security_critical).toBe(1);
    expect(kpi.security_high).toBe(1);
  });

  it('computes KPIs for a single project', () => {
    const kpi = computeProjectKpis(db, 'proj-2');
    expect(kpi.total_forge_runs).toBe(1);
    expect(kpi.successful_runs).toBe(1);
    expect(kpi.success_rate).toBe(1);
    expect(kpi.open_failures).toBe(5); // LINT:unused with 5 occurrences
  });

  it('counts knowledge entries', () => {
    const kpi = computeProjectKpis(db);
    expect(kpi.total_knowledge).toBe(2);
  });

  it('counts open failures', () => {
    const kpi = computeProjectKpis(db);
    expect(kpi.open_failures).toBe(9); // 3 + 1 + 5
  });
});

describe('computeHealthReport', () => {
  beforeEach(seedTestData);

  it('returns health report for all projects', () => {
    const report = computeHealthReport(db);
    expect(report.length).toBe(2);
    // alpha and beta, sorted by name
    expect(report[0].name).toBe('alpha');
    expect(report[1].name).toBe('beta');
  });

  it('assigns grades based on score', () => {
    const report = computeHealthReport(db);
    for (const r of report) {
      expect(['A', 'B', 'C', 'D', 'F']).toContain(r.grade);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('penalizes projects with critical failures', () => {
    const report = computeHealthReport(db);
    const alpha = report.find((r) => r.name === 'alpha')!;
    // alpha has 3 critical/error failures + 1 warning — score should be reduced
    expect(alpha.score).toBeLessThan(100);
    expect(alpha.issues.length).toBeGreaterThan(0);
  });

  it('penalizes projects that have never been synced', () => {
    const report = computeHealthReport(db);
    // Neither project has been synced (updateSyncTimestamp not called)
    for (const r of report) {
      expect(r.issues).toContain('never synced');
    }
  });

  it('returns empty array when no projects exist', () => {
    db.prepare('DELETE FROM failure_patterns').run();
    db.prepare('DELETE FROM telemetry_events').run();
    db.prepare('DELETE FROM perf_entries').run();
    db.prepare('DELETE FROM knowledge_entries').run();
    db.prepare('DELETE FROM projects').run();
    const report = computeHealthReport(db);
    expect(report).toEqual([]);
  });
});

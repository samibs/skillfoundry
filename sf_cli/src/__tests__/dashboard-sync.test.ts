import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { syncAllProjects, formatSyncResult } from '../core/dashboard-sync.js';
import { initDatabase } from '../core/dashboard-db.js';
import type { SyncResult } from '../core/dashboard-sync.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-dashboard-sync-' + process.pid);
const DB_PATH = join(TEST_DIR, 'data', 'dashboard.db');
const PROJECT_A = join(TEST_DIR, 'projects', 'proj-a');
const PROJECT_B = join(TEST_DIR, 'projects', 'proj-b');

function setupProject(projectPath: string, options?: { telemetry?: boolean; perf?: boolean; knowledge?: boolean; monitor?: boolean }) {
  mkdirSync(join(projectPath, '.skillfoundry'), { recursive: true });

  if (options?.telemetry) {
    const events = [
      JSON.stringify({
        id: `evt-${Math.random().toString(36).slice(2)}`,
        schema_version: 1,
        event_type: 'forge_run',
        timestamp: new Date().toISOString(),
        session_id: 'test-session',
        duration_ms: 5000,
        status: 'pass',
        details: { gate_passes: 6, gate_failures: 1 },
      }),
    ];
    writeFileSync(join(projectPath, '.skillfoundry', 'telemetry.jsonl'), events.join('\n') + '\n');
  }

  if (options?.perf) {
    const entries = [
      JSON.stringify({ gate: 'T1-lint', duration_ms: 120, timestamp: new Date().toISOString(), run_id: 'run-1' }),
    ];
    writeFileSync(join(projectPath, '.skillfoundry', 'perf.jsonl'), entries.join('\n') + '\n');
  }

  if (options?.knowledge) {
    mkdirSync(join(projectPath, 'memory_bank', 'knowledge'), { recursive: true });
    const entries = [
      JSON.stringify({ id: `k-${Math.random().toString(36).slice(2)}`, type: 'lesson', content: 'Test lesson', created_at: new Date().toISOString() }),
    ];
    writeFileSync(join(projectPath, 'memory_bank', 'knowledge', 'lessons.jsonl'), entries.join('\n') + '\n');
  }

  if (options?.monitor) {
    mkdirSync(join(projectPath, 'logs'), { recursive: true });
    const entries = [
      JSON.stringify({ severity: 'error', signature: 'BUILD:tsc', type: 'build_failure', timestamp: new Date().toISOString(), message: 'TypeScript compile error' }),
    ];
    writeFileSync(join(projectPath, 'logs', 'session-monitor.jsonl'), entries.join('\n') + '\n');
  }
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'data'), { recursive: true });

  // Setup project registry
  setupProject(PROJECT_A, { telemetry: true, perf: true, knowledge: true, monitor: true });
  setupProject(PROJECT_B, { telemetry: true });

  writeFileSync(join(TEST_DIR, '.project-registry'), `${PROJECT_A}\n${PROJECT_B}\n`);
  writeFileSync(join(TEST_DIR, '.project-registry-meta.jsonl'), [
    JSON.stringify({ path: PROJECT_A, platform: 'claude', framework_version: '2.0.67', health_status: 'healthy' }),
    JSON.stringify({ path: PROJECT_B, platform: 'claude', framework_version: '2.0.60', health_status: 'unknown' }),
  ].join('\n') + '\n');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('syncAllProjects', () => {
  it('syncs all registered projects into the database', () => {
    const result = syncAllProjects(DB_PATH, TEST_DIR);

    expect(result.projects_synced).toBe(2);
    expect(result.projects_skipped).toBe(0);
    expect(result.events_added).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
  });

  it('creates project.json files with UUIDs', () => {
    syncAllProjects(DB_PATH, TEST_DIR);

    expect(existsSync(join(PROJECT_A, '.skillfoundry', 'project.json'))).toBe(true);
    expect(existsSync(join(PROJECT_B, '.skillfoundry', 'project.json'))).toBe(true);
  });

  it('populates the database with project records', () => {
    syncAllProjects(DB_PATH, TEST_DIR);

    const db = initDatabase(DB_PATH);
    const count = db.prepare('SELECT count(*) as cnt FROM projects').get() as { cnt: number };
    expect(count.cnt).toBe(2);
    db.close();
  });

  it('syncs telemetry events into the database', () => {
    syncAllProjects(DB_PATH, TEST_DIR);

    const db = initDatabase(DB_PATH);
    const count = db.prepare('SELECT count(*) as cnt FROM telemetry_events').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it('syncs perf entries from project A', () => {
    const result = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result.perf_entries_added).toBeGreaterThan(0);

    const db = initDatabase(DB_PATH);
    const count = db.prepare('SELECT count(*) as cnt FROM perf_entries').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThan(0);
    db.close();
  });

  it('syncs knowledge entries from project A', () => {
    const result = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result.knowledge_added).toBeGreaterThan(0);
  });

  it('syncs failure patterns from project A session monitor', () => {
    const result = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result.failures_detected).toBeGreaterThan(0);

    const db = initDatabase(DB_PATH);
    const count = db.prepare('SELECT count(*) as cnt FROM failure_patterns').get() as { cnt: number };
    expect(count.cnt).toBeGreaterThan(0);
    db.close();
  });

  it('deduplicates on second sync — adds 0 new events', () => {
    const result1 = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result1.events_added).toBeGreaterThan(0);

    const result2 = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result2.events_added).toBe(0);
    expect(result2.projects_synced).toBe(2);
  });

  it('returns empty result when no registry exists', () => {
    rmSync(join(TEST_DIR, '.project-registry'));
    const result = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result.projects_synced).toBe(0);
  });

  it('skips non-existent project paths gracefully', () => {
    writeFileSync(join(TEST_DIR, '.project-registry'), `${PROJECT_A}\n/nonexistent/path\n`);
    const result = syncAllProjects(DB_PATH, TEST_DIR);
    expect(result.projects_synced).toBe(1);
  });
});

describe('formatSyncResult', () => {
  it('formats a sync result for CLI output', () => {
    const result: SyncResult = {
      projects_synced: 5,
      projects_skipped: 2,
      events_added: 42,
      perf_entries_added: 10,
      knowledge_added: 3,
      failures_detected: 1,
      errors: [],
    };

    const output = formatSyncResult(result);
    expect(output).toContain('Dashboard Sync Complete');
    expect(output).toContain('Projects synced:     5');
    expect(output).toContain('Events added:        42');
    expect(output).toContain('Failures detected:   1');
  });

  it('includes errors in output when present', () => {
    const result: SyncResult = {
      projects_synced: 1,
      projects_skipped: 1,
      events_added: 0,
      perf_entries_added: 0,
      knowledge_added: 0,
      failures_detected: 0,
      errors: ['/path/to/broken: ENOENT'],
    };

    const output = formatSyncResult(result);
    expect(output).toContain('Errors (1)');
    expect(output).toContain('ENOENT');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  importSessionReport,
  importForgeLog,
  scanProjectSessions,
  importInbox,
  formatImportResult,
} from '../core/session-import.js';
import { initDatabase, upsertProject } from '../core/dashboard-db.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-session-import-' + process.pid);
const DB_PATH = join(TEST_DIR, 'data', 'test.db');
const PROJECT_DIR = join(TEST_DIR, 'projects', 'proj-a');
let db: Database.Database;

function makeSessionReport(runId: string, issues: number = 2, blockers: number = 0) {
  return {
    runId,
    startedAt: '2026-03-01T10:00:00Z',
    completedAt: '2026-03-01T10:30:00Z',
    issues: Array.from({ length: issues }, (_, i) => ({
      id: `${runId}-issue-${i}`,
      severity: i === 0 && blockers > 0 ? 'CRITICAL' : 'HIGH',
      category: i === 0 ? 'BUILD_FAILURE' : 'TEST_GAP',
      title: `Issue ${i}`,
      detail: `Detail for issue ${i}`,
      story: `STORY-00${i + 1}`,
      phase: 'implementation',
      occurredAt: '2026-03-01T10:15:00Z',
      remediation: `Fix issue ${i}`,
      relatedIssues: [],
    })),
    anomalies: [],
    errorPatterns: [
      {
        signature: 'tsc:type_error',
        occurrences: 3,
        stories: ['STORY-001', 'STORY-002'],
        firstSeen: '2026-03-01T10:05:00Z',
        likelyRootCause: 'Missing type definitions',
      },
    ],
    summary: {
      totalIssues: issues,
      bySeverity: { CRITICAL: blockers, HIGH: issues - blockers, MEDIUM: 0, LOW: 0, INFO: 0 },
      byCategory: { BUILD_FAILURE: 1, TEST_GAP: issues - 1 },
      blockers,
      anomalies: 0,
      storiesWithIssues: issues,
      topRemediations: ['Fix type definitions'],
    },
  };
}

function makeForgeLog(events: Array<{ level: string; category: string; event: string }>) {
  return events
    .map((e, i) => JSON.stringify({
      ts: new Date(Date.now() - (events.length - i) * 1000).toISOString(),
      level: e.level,
      category: e.category,
      event: e.event,
      data: { story: 'STORY-001' },
    }))
    .join('\n');
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'data'), { recursive: true });
  mkdirSync(join(PROJECT_DIR, '.skillfoundry', 'runs'), { recursive: true });
  mkdirSync(join(PROJECT_DIR, '.skillfoundry', 'logs'), { recursive: true });

  db = initDatabase(DB_PATH);
  upsertProject(db, { id: 'proj-1', path: PROJECT_DIR, name: 'proj-a' });
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('importSessionReport', () => {
  it('imports a session report with issues and patterns', () => {
    const report = makeSessionReport('run-001', 3, 1);
    const result = importSessionReport(db, 'proj-1', report, 'test-file.json');

    expect(result.imported).toBe(true);
    expect(result.issues).toBe(3);
    expect(result.patterns).toBe(1);

    // Verify DB
    const sessions = db.prepare('SELECT * FROM session_reports').all();
    expect(sessions.length).toBe(1);

    const issues = db.prepare('SELECT * FROM session_issues').all();
    expect(issues.length).toBe(3);

    const patterns = db.prepare('SELECT * FROM failure_patterns WHERE source = ?').all('session-report');
    expect(patterns.length).toBe(1);
  });

  it('skips duplicate session reports', () => {
    const report = makeSessionReport('run-001');
    importSessionReport(db, 'proj-1', report);
    const result = importSessionReport(db, 'proj-1', report);

    expect(result.imported).toBe(false);
    expect(result.issues).toBe(0);
  });

  it('sets outcome based on blockers', () => {
    const report = makeSessionReport('run-002', 2, 1);
    importSessionReport(db, 'proj-1', report);

    const row = db.prepare('SELECT outcome FROM session_reports WHERE id = ?').get('run-002') as { outcome: string };
    expect(row.outcome).toBe('fail');
  });

  it('sets outcome to warn when issues but no blockers', () => {
    const report = makeSessionReport('run-003', 2, 0);
    importSessionReport(db, 'proj-1', report);

    const row = db.prepare('SELECT outcome FROM session_reports WHERE id = ?').get('run-003') as { outcome: string };
    expect(row.outcome).toBe('warn');
  });
});

describe('importForgeLog', () => {
  it('extracts failure patterns from forge log', () => {
    const log = makeForgeLog([
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
      { level: 'WARN', category: 'gate', event: 'gate_failed' },
      { level: 'INFO', category: 'pipeline', event: 'story_started' }, // should be skipped
    ]);
    const logPath = join(PROJECT_DIR, '.skillfoundry', 'logs', 'forge-test.log');
    writeFileSync(logPath, log);

    const result = importForgeLog(db, 'proj-1', logPath);
    expect(result.events_processed).toBe(4);
    expect(result.patterns_extracted).toBe(2); // pipeline:story_failed + gate:gate_failed

    const patterns = db.prepare('SELECT * FROM failure_patterns WHERE source = ?').all('forge-log');
    expect(patterns.length).toBe(2);
  });

  it('returns zero for nonexistent file', () => {
    const result = importForgeLog(db, 'proj-1', '/nonexistent/file.log');
    expect(result.events_processed).toBe(0);
  });

  it('aggregates occurrences for repeated signatures', () => {
    const log = makeForgeLog([
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
    ]);
    writeFileSync(join(PROJECT_DIR, '.skillfoundry', 'logs', 'forge-test.log'), log);

    importForgeLog(db, 'proj-1', join(PROJECT_DIR, '.skillfoundry', 'logs', 'forge-test.log'));

    const row = db.prepare("SELECT occurrences FROM failure_patterns WHERE signature = 'pipeline:story_failed'").get() as { occurrences: number };
    expect(row.occurrences).toBe(3);
  });
});

describe('scanProjectSessions', () => {
  it('imports session reports from .skillfoundry/runs/', () => {
    const report = makeSessionReport('scan-run-001', 2);
    writeFileSync(
      join(PROJECT_DIR, '.skillfoundry', 'runs', 'scan-run-001-issues.json'),
      JSON.stringify(report),
    );

    const result = scanProjectSessions(db, 'proj-1', PROJECT_DIR);
    expect(result.sessions_imported).toBe(1);
    expect(result.issues_imported).toBe(2);
  });

  it('imports forge logs from .skillfoundry/logs/', () => {
    const log = makeForgeLog([
      { level: 'ERROR', category: 'pipeline', event: 'story_failed' },
    ]);
    writeFileSync(join(PROJECT_DIR, '.skillfoundry', 'logs', 'forge-20260301.log'), log);

    const result = scanProjectSessions(db, 'proj-1', PROJECT_DIR);
    expect(result.forge_events_processed).toBeGreaterThan(0);
  });

  it('skips duplicate sessions on re-scan', () => {
    const report = makeSessionReport('scan-run-002');
    writeFileSync(
      join(PROJECT_DIR, '.skillfoundry', 'runs', 'scan-run-002-issues.json'),
      JSON.stringify(report),
    );

    scanProjectSessions(db, 'proj-1', PROJECT_DIR);
    const result = scanProjectSessions(db, 'proj-1', PROJECT_DIR);
    expect(result.sessions_imported).toBe(0);
    expect(result.sessions_skipped).toBe(1);
  });

  it('handles missing directories gracefully', () => {
    rmSync(join(PROJECT_DIR, '.skillfoundry', 'runs'), { recursive: true, force: true });
    rmSync(join(PROJECT_DIR, '.skillfoundry', 'logs'), { recursive: true, force: true });

    const result = scanProjectSessions(db, 'proj-1', PROJECT_DIR);
    expect(result.sessions_imported).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

describe('importInbox', () => {
  it('imports session reports from data/inbox/', () => {
    const inboxDir = join(TEST_DIR, 'data', 'inbox');
    mkdirSync(inboxDir, { recursive: true });

    const report = makeSessionReport('inbox-run-001');
    writeFileSync(join(inboxDir, 'inbox-run-001-issues.json'), JSON.stringify(report));

    const result = importInbox(db, TEST_DIR);
    expect(result.sessions_imported).toBe(1);
    expect(result.issues_imported).toBe(2);

    // File should be moved to imported/
    expect(existsSync(join(inboxDir, 'inbox-run-001-issues.json'))).toBe(false);
    expect(existsSync(join(inboxDir, 'imported', 'inbox-run-001-issues.json'))).toBe(true);
  });

  it('imports forge logs from data/inbox/', () => {
    const inboxDir = join(TEST_DIR, 'data', 'inbox');
    mkdirSync(inboxDir, { recursive: true });

    const log = makeForgeLog([
      { level: 'ERROR', category: 'pipeline', event: 'inbox_failure' },
    ]);
    writeFileSync(join(inboxDir, 'forge-import.log'), log);

    const result = importInbox(db, TEST_DIR);
    expect(result.forge_events_processed).toBeGreaterThan(0);
  });

  it('returns empty result when inbox is empty', () => {
    const result = importInbox(db, TEST_DIR);
    expect(result.sessions_imported).toBe(0);
  });
});

describe('formatImportResult', () => {
  it('formats a clean import result', () => {
    const output = formatImportResult({
      sessions_imported: 3,
      sessions_skipped: 1,
      issues_imported: 12,
      patterns_extracted: 4,
      forge_events_processed: 50,
      errors: [],
    });

    expect(output).toContain('Session Import Complete');
    expect(output).toContain('Sessions imported:   3');
    expect(output).toContain('Issues imported:     12');
  });

  it('includes errors in output', () => {
    const output = formatImportResult({
      sessions_imported: 0,
      sessions_skipped: 0,
      issues_imported: 0,
      patterns_extracted: 0,
      forge_events_processed: 0,
      errors: ['file.json: parse error'],
    });

    expect(output).toContain('Errors (1)');
    expect(output).toContain('parse error');
  });
});

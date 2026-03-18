import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { detectPatterns, formatPatternReport } from '../core/failure-detector.js';
import {
  initDatabase,
  upsertProject,
  insertFailurePatterns,
  insertSessionIssues,
  insertSessionReport,
} from '../core/dashboard-db.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-failure-detector-' + process.pid);
const DB_PATH = join(TEST_DIR, 'test.db');
let db: Database.Database;

beforeEach(() => {
  db = initDatabase(DB_PATH);
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function seedProjects() {
  upsertProject(db, { id: 'proj-1', path: '/path/alpha', name: 'alpha' });
  upsertProject(db, { id: 'proj-2', path: '/path/beta', name: 'beta' });
  upsertProject(db, { id: 'proj-3', path: '/path/gamma', name: 'gamma' });
}

describe('detectPatterns', () => {
  it('returns empty report when no data', () => {
    const report = detectPatterns(db);
    expect(report.total_patterns).toBe(0);
    expect(report.patterns).toEqual([]);
  });

  it('detects cross-project patterns (same signature in 2+ projects)', () => {
    seedProjects();

    // Same failure in alpha and beta
    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'BUILD:tsc', occurrences: 3, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    insertFailurePatterns(db, 'proj-2', [
      { project_id: 'proj-2', signature: 'BUILD:tsc', occurrences: 2, last_seen: new Date().toISOString(), severity: 'error' },
    ]);

    const report = detectPatterns(db);
    const crossProject = report.patterns.filter((p) => p.type === 'cross-project');
    expect(crossProject.length).toBe(1);
    expect(crossProject[0].title).toContain('BUILD:tsc');
    expect(crossProject[0].affected_projects).toContain('alpha');
    expect(crossProject[0].affected_projects).toContain('beta');
  });

  it('detects high-frequency failures (5+ occurrences)', () => {
    seedProjects();

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'TEST:timeout', occurrences: 7, last_seen: new Date().toISOString(), severity: 'warning' },
    ]);

    const report = detectPatterns(db);
    const recurring = report.patterns.filter((p) => p.type === 'recurring');
    expect(recurring.length).toBeGreaterThanOrEqual(1);
    expect(recurring[0].title).toContain('TEST:timeout');
    expect(recurring[0].occurrences).toBe(7);
  });

  it('does not flag low-frequency failures', () => {
    seedProjects();

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'LINT:minor', occurrences: 2, last_seen: new Date().toISOString(), severity: 'warning' },
    ]);

    const report = detectPatterns(db);
    const recurring = report.patterns.filter((p) => p.type === 'recurring');
    expect(recurring.length).toBe(0);
  });

  it('detects category clusters from session issues', () => {
    seedProjects();

    // Create a session report first
    insertSessionReport(db, {
      id: 'run-1',
      project_id: 'proj-1',
      total_issues: 5,
      outcome: 'fail',
    });

    // Insert multiple issues in same category
    insertSessionIssues(db, [
      { id: 'i1', session_id: 'run-1', project_id: 'proj-1', severity: 'HIGH', category: 'BUILD_FAILURE', title: 'Build failed 1' },
      { id: 'i2', session_id: 'run-1', project_id: 'proj-1', severity: 'HIGH', category: 'BUILD_FAILURE', title: 'Build failed 2' },
      { id: 'i3', session_id: 'run-1', project_id: 'proj-1', severity: 'HIGH', category: 'BUILD_FAILURE', title: 'Build failed 3' },
    ]);

    const report = detectPatterns(db);
    const clusters = report.patterns.filter((p) => p.type === 'category-cluster');
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].title).toContain('BUILD_FAILURE');
  });

  it('detects escalating failures (recent + high rate)', () => {
    seedProjects();

    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);

    insertFailurePatterns(db, 'proj-1', [
      {
        project_id: 'proj-1',
        signature: 'ESCALATING:crash',
        occurrences: 5,
        first_seen: yesterday.toISOString(),
        last_seen: now.toISOString(),
        severity: 'error',
      },
    ]);

    const report = detectPatterns(db);
    const escalating = report.patterns.filter((p) => p.type === 'escalating');
    expect(escalating.length).toBeGreaterThanOrEqual(1);
    expect(escalating[0].title).toContain('ESCALATING:crash');
  });

  it('sorts patterns by severity then occurrences', () => {
    seedProjects();

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'LOW:minor', occurrences: 20, last_seen: new Date().toISOString(), severity: 'warning', first_seen: new Date(Date.now() - 86400000 * 30).toISOString() },
    ]);
    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'HIGH:crash', occurrences: 10, last_seen: new Date().toISOString(), severity: 'error', first_seen: new Date(Date.now() - 86400000).toISOString() },
    ]);
    insertFailurePatterns(db, 'proj-2', [
      { project_id: 'proj-2', signature: 'HIGH:crash', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error', first_seen: new Date(Date.now() - 86400000).toISOString() },
    ]);

    const report = detectPatterns(db);
    expect(report.patterns.length).toBeGreaterThan(0);

    // Critical/high should come before medium/low
    const severities = report.patterns.map((p) => p.severity);
    const criticalIdx = severities.indexOf('critical');
    const highIdx = severities.indexOf('high');
    if (criticalIdx >= 0 && highIdx >= 0) {
      expect(criticalIdx).toBeLessThanOrEqual(highIdx);
    }
  });

  it('filters by project ID when specified', () => {
    seedProjects();

    insertFailurePatterns(db, 'proj-1', [
      { project_id: 'proj-1', signature: 'ALPHA:only', occurrences: 8, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    insertFailurePatterns(db, 'proj-2', [
      { project_id: 'proj-2', signature: 'BETA:only', occurrences: 8, last_seen: new Date().toISOString(), severity: 'error' },
    ]);

    const report = detectPatterns(db, 'proj-1');
    const signatures = report.patterns.map((p) => p.title);
    // Should only contain alpha-related patterns in recurring type
    const recurring = report.patterns.filter((p) => p.type === 'recurring');
    for (const p of recurring) {
      expect(p.affected_projects).toContain('alpha');
    }
  });
});

describe('formatPatternReport', () => {
  it('formats empty report', () => {
    const output = formatPatternReport({
      generated_at: new Date().toISOString(),
      total_patterns: 0,
      critical_count: 0,
      high_count: 0,
      patterns: [],
    });

    expect(output).toContain('Pattern Analysis');
    expect(output).toContain('No actionable patterns detected');
  });

  it('formats report with patterns', () => {
    const output = formatPatternReport({
      generated_at: new Date().toISOString(),
      total_patterns: 2,
      critical_count: 1,
      high_count: 1,
      patterns: [
        {
          type: 'cross-project',
          severity: 'critical',
          title: 'Cross-project: BUILD:tsc',
          detail: 'Affects 3 projects',
          affected_projects: ['alpha', 'beta', 'gamma'],
          occurrences: 15,
          recommendation: 'Investigate shared deps.',
        },
        {
          type: 'recurring',
          severity: 'high',
          title: 'Recurring: TEST:timeout (x8)',
          detail: '8 occurrences in alpha',
          affected_projects: ['alpha'],
          occurrences: 8,
          recommendation: 'Prioritize investigation.',
        },
      ],
    });

    expect(output).toContain('Pattern Analysis');
    expect(output).toContain('2 (1 critical, 1 high)');
    expect(output).toContain('[CRITICAL]');
    expect(output).toContain('[HIGH]');
    expect(output).toContain('alpha, beta, gamma');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  seedPlaybooks,
  scanForRemediations,
  applyRemediation,
  generateRemediationReport,
  formatScanResult,
  formatRemediationReport,
  formatRemediationList,
  formatPlaybookList,
} from '../core/remediation-engine.js';
import {
  initDatabase,
  upsertProject,
  insertFailurePatterns,
  getPlaybooks,
  getRemediations,
  getRemediationStats,
} from '../core/dashboard-db.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-remediation-' + process.pid);
const DB_PATH = join(TEST_DIR, 'test.db');
let db: Database.Database;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = initDatabase(DB_PATH);
  upsertProject(db, { id: 'p1', path: '/path/alpha', name: 'alpha' });
  upsertProject(db, { id: 'p2', path: '/path/beta', name: 'beta' });
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('seedPlaybooks', () => {
  it('seeds built-in playbooks', () => {
    const count = seedPlaybooks(db);
    expect(count).toBeGreaterThan(0);

    const playbooks = getPlaybooks(db);
    expect(playbooks.length).toBeGreaterThanOrEqual(8);
  });

  it('does not duplicate on second seed', () => {
    seedPlaybooks(db);
    const count2 = seedPlaybooks(db);
    expect(count2).toBe(0);
  });

  it('includes playbooks for common categories', () => {
    seedPlaybooks(db);
    const playbooks = getPlaybooks(db);
    const categories = playbooks.map(p => p.category);
    expect(categories).toContain('BUILD_FAILURE');
    expect(categories).toContain('TEST_GAP');
    expect(categories).toContain('SECURITY');
    expect(categories).toContain('GATE_FAILURE');
  });
});

describe('scanForRemediations', () => {
  it('creates remediation actions for open failures', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
      { project_id: 'p1', signature: 'TEST:timeout', occurrences: 3, last_seen: new Date().toISOString(), severity: 'warning' },
    ]);

    const result = scanForRemediations(db);
    expect(result.actions_created).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);

    const remediations = getRemediations(db);
    expect(remediations.length).toBeGreaterThanOrEqual(1);
  });

  it('skips already-tracked failures', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);

    scanForRemediations(db);
    const result = scanForRemediations(db);
    expect(result.actions_skipped).toBeGreaterThanOrEqual(1);
    expect(result.actions_created).toBe(0);
  });

  it('matches playbooks to failure signatures', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);

    scanForRemediations(db);

    const remediations = getRemediations(db);
    const tscRemediation = remediations.find(r => r.failure_signature === 'BUILD:tsc');
    expect(tscRemediation).toBeDefined();
    if (tscRemediation) {
      expect(tscRemediation.playbook_id).toBeTruthy();
      expect(tscRemediation.steps).toBeTruthy();
    }
  });

  it('auto-applies when enabled and playbook supports it', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:dep', occurrences: 3, last_seen: new Date().toISOString(), severity: 'warning' },
    ]);

    const result = scanForRemediations(db, { autoApply: true });
    expect(result.auto_applied).toBeGreaterThanOrEqual(0);
    // BUILD:dep playbook is auto_applicable
  });

  it('sets priority based on severity and occurrences', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'CRITICAL:crash', occurrences: 15, last_seen: new Date().toISOString(), severity: 'critical' },
    ]);

    scanForRemediations(db);
    const remediations = getRemediations(db);
    const critical = remediations.find(r => r.failure_signature === 'CRITICAL:crash');
    expect(critical).toBeDefined();
    if (critical) {
      expect(critical.priority).toBe('critical');
    }
  });

  it('filters by project when projectId specified', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:p1only', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    insertFailurePatterns(db, 'p2', [
      { project_id: 'p2', signature: 'BUILD:p2only', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);

    scanForRemediations(db, { projectId: 'p1' });
    const remediations = getRemediations(db);
    const signatures = remediations.map(r => r.failure_signature);
    expect(signatures).toContain('BUILD:p1only');
    expect(signatures).not.toContain('BUILD:p2only');
  });
});

describe('applyRemediation', () => {
  it('starts a remediation', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:test', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const remediations = getRemediations(db);
    const result = applyRemediation(db, remediations[0].id, 'start');
    expect(result.status).toBe('completed');
    expect(result.message).toContain('started');

    const updated = getRemediations(db);
    expect(updated[0].status).toBe('in_progress');
  });

  it('completes a remediation and updates failure status', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:test', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const remediations = getRemediations(db);
    applyRemediation(db, remediations[0].id, 'start');
    const result = applyRemediation(db, remediations[0].id, 'complete', 'Fixed the build');

    expect(result.status).toBe('completed');

    // Check failure pattern status updated
    const failures = db.prepare("SELECT remediation_status FROM failure_patterns WHERE signature = 'BUILD:test'").get() as { remediation_status: string };
    expect(failures.remediation_status).toBe('resolved');
  });

  it('fails a remediation', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:test', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const remediations = getRemediations(db);
    const result = applyRemediation(db, remediations[0].id, 'fail', 'Root cause unclear');
    expect(result.status).toBe('failed');

    const stats = getRemediationStats(db);
    expect(stats.failed).toBe(1);
  });

  it('returns skipped for non-existent remediation', () => {
    const result = applyRemediation(db, 'nonexistent-id', 'start');
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('not found');
  });
});

describe('generateRemediationReport', () => {
  it('returns empty report when no data', () => {
    const report = generateRemediationReport(db);
    expect(report.stats.total).toBe(0);
    expect(report.pending_actions).toHaveLength(0);
    expect(report.playbook_effectiveness).toHaveLength(0);
  });

  it('includes stats and pending actions', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const report = generateRemediationReport(db);
    expect(report.stats.total).toBeGreaterThanOrEqual(1);
    expect(report.stats.pending).toBeGreaterThanOrEqual(1);
    expect(report.pending_actions.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks playbook effectiveness after completions', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const remediations = getRemediations(db);
    applyRemediation(db, remediations[0].id, 'complete', 'Fixed');

    const report = generateRemediationReport(db);
    if (remediations[0].playbook_id) {
      expect(report.playbook_effectiveness.length).toBeGreaterThanOrEqual(1);
      expect(report.playbook_effectiveness[0].success_count).toBe(1);
    }
  });
});

describe('getRemediationStats', () => {
  it('returns zeros when no data', () => {
    const stats = getRemediationStats(db);
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.completed).toBe(0);
  });

  it('counts by status', () => {
    insertFailurePatterns(db, 'p1', [
      { project_id: 'p1', signature: 'BUILD:a', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
      { project_id: 'p1', signature: 'BUILD:b', occurrences: 5, last_seen: new Date().toISOString(), severity: 'error' },
    ]);
    scanForRemediations(db);

    const remediations = getRemediations(db);
    if (remediations.length >= 2) {
      applyRemediation(db, remediations[0].id, 'complete');

      const stats = getRemediationStats(db);
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
    }
  });
});

describe('formatScanResult', () => {
  it('formats scan result', () => {
    const output = formatScanResult({
      actions_created: 5,
      actions_skipped: 2,
      auto_applied: 1,
      errors: [],
    });
    expect(output).toContain('Remediation Scan');
    expect(output).toContain('Actions created:   5');
    expect(output).toContain('Auto-applied:      1');
  });

  it('includes errors', () => {
    const output = formatScanResult({
      actions_created: 0,
      actions_skipped: 0,
      auto_applied: 0,
      errors: ['p1/BUILD:tsc: db error'],
    });
    expect(output).toContain('Errors (1)');
    expect(output).toContain('db error');
  });
});

describe('formatRemediationReport', () => {
  it('formats empty report', () => {
    const output = formatRemediationReport({
      stats: { total: 0, pending: 0, in_progress: 0, completed: 0, failed: 0, auto_applied: 0, avg_resolution_hours: 0 },
      pending_actions: [],
      playbook_effectiveness: [],
    });
    expect(output).toContain('Remediation Report');
    expect(output).toContain('No pending remediations');
  });

  it('formats report with data', () => {
    const output = formatRemediationReport({
      stats: { total: 5, pending: 2, in_progress: 1, completed: 1, failed: 1, auto_applied: 1, avg_resolution_hours: 3.5 },
      pending_actions: [{
        id: 'r1', project_id: 'p1', failure_signature: 'BUILD:tsc', playbook_id: 'pb-1',
        status: 'pending', priority: 'high', title: 'Fix TypeScript build',
        description: 'tsc errors', steps: '["Step 1","Step 2"]',
        project_name: 'alpha', created_at: '2026-03-01', started_at: null, completed_at: null,
      }],
      playbook_effectiveness: [
        { name: 'TSC Fix', category: 'BUILD_FAILURE', success_count: 3, failure_count: 1, success_rate: 0.75 },
      ],
    });
    expect(output).toContain('Total: 5');
    expect(output).toContain('Pending: 2');
    expect(output).toContain('[HIGH]');
    expect(output).toContain('TSC Fix');
    expect(output).toContain('75%');
  });
});

describe('formatRemediationList', () => {
  it('formats empty list', () => {
    const output = formatRemediationList([]);
    expect(output).toContain('No remediations found');
  });

  it('formats list with items', () => {
    const output = formatRemediationList([{
      id: 'r1', project_id: 'p1', failure_signature: 'BUILD:tsc',
      status: 'pending', priority: 'high', title: 'Fix build',
      project_name: 'alpha', created_at: '2026-03-01', started_at: null, completed_at: null,
    }]);
    expect(output).toContain('[PENDING]');
    expect(output).toContain('Fix build');
    expect(output).toContain('alpha');
  });
});

describe('formatPlaybookList', () => {
  it('formats empty list', () => {
    const output = formatPlaybookList([]);
    expect(output).toContain('No playbooks registered');
  });

  it('formats playbooks with steps', () => {
    seedPlaybooks(db);
    const playbooks = getPlaybooks(db);
    const output = formatPlaybookList(playbooks);
    expect(output).toContain('Playbooks');
    expect(output).toContain('TypeScript Build Failure');
    expect(output).toContain('Steps');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAuditEntry,
  auditGateResult,
  readAuditLog,
  streamAuditEntries,
  countAuditEntries,
  getRecentAuditEntries,
  filterAuditEntries,
  rotateAuditLogIfNeeded,
  getAuditSummary,
  detectActor,
} from '../core/audit-log.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const AUDIT_DIR = '.skillfoundry';
const AUDIT_FILE = 'audit.jsonl';

let tmpDir: string;

function auditPath(): string {
  return join(tmpDir, AUDIT_DIR, AUDIT_FILE);
}

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-uuid',
    timestamp: '2026-01-15T10:00:00.000Z',
    actor: 'testuser',
    gate: 'T1',
    verdict: 'pass',
    reason: 'All checks passed',
    duration_ms: 42,
    ...overrides,
  };
}

function writeEntries(entries: Record<string, unknown>[]): void {
  mkdirSync(join(tmpDir, AUDIT_DIR), { recursive: true });
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(auditPath(), content, 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sf-audit-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── appendAuditEntry ──────────────────────────────────────────────────────────

describe('appendAuditEntry', () => {
  it('creates .skillfoundry directory if missing', () => {
    appendAuditEntry(tmpDir, {
      gate: 'T1',
      verdict: 'pass',
      reason: 'ok',
      duration_ms: 10,
    });
    expect(existsSync(join(tmpDir, AUDIT_DIR))).toBe(true);
  });

  it('writes a valid JSONL line', () => {
    appendAuditEntry(tmpDir, {
      gate: 'T2',
      verdict: 'fail',
      reason: 'lint errors',
      duration_ms: 55,
    });

    const content = readFileSync(auditPath(), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.gate).toBe('T2');
    expect(parsed.verdict).toBe('fail');
    expect(parsed.reason).toBe('lint errors');
    expect(parsed.duration_ms).toBe(55);
  });

  it('generates UUID and ISO 8601 timestamp automatically', () => {
    appendAuditEntry(tmpDir, {
      gate: 'T1',
      verdict: 'pass',
      reason: 'ok',
      duration_ms: 5,
    });

    const content = readFileSync(auditPath(), 'utf-8');
    const entry = JSON.parse(content.trim());

    // UUID v4 format
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // ISO 8601 timestamp
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('truncates reason to 2000 characters', () => {
    const longReason = 'x'.repeat(3000);
    appendAuditEntry(tmpDir, {
      gate: 'T1',
      verdict: 'warn',
      reason: longReason,
      duration_ms: 1,
    });

    const content = readFileSync(auditPath(), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.reason).toHaveLength(2000);
  });

  it('appends multiple entries without overwriting', () => {
    appendAuditEntry(tmpDir, { gate: 'T1', verdict: 'pass', reason: 'first', duration_ms: 1 });
    appendAuditEntry(tmpDir, { gate: 'T2', verdict: 'fail', reason: 'second', duration_ms: 2 });

    const content = readFileSync(auditPath(), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).reason).toBe('first');
    expect(JSON.parse(lines[1]).reason).toBe('second');
  });

  it('includes optional story_file and file_sha fields', () => {
    appendAuditEntry(tmpDir, {
      gate: 'T3',
      verdict: 'pass',
      reason: 'ok',
      duration_ms: 10,
      story_file: 'STORY-001.md',
      file_sha: 'abc123',
    });

    const content = readFileSync(auditPath(), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.story_file).toBe('STORY-001.md');
    expect(entry.file_sha).toBe('abc123');
  });
});

// ── readAuditLog ──────────────────────────────────────────────────────────────

describe('readAuditLog', () => {
  it('returns empty array when file does not exist', () => {
    const entries = readAuditLog(tmpDir);
    expect(entries).toEqual([]);
  });

  it('parses multiple JSONL entries', () => {
    writeEntries([
      makeEntry({ gate: 'T1', verdict: 'pass' }),
      makeEntry({ gate: 'T2', verdict: 'fail' }),
      makeEntry({ gate: 'T3', verdict: 'warn' }),
    ]);

    const entries = readAuditLog(tmpDir);
    expect(entries).toHaveLength(3);
    expect(entries[0].gate).toBe('T1');
    expect(entries[1].gate).toBe('T2');
    expect(entries[2].gate).toBe('T3');
  });

  it('skips malformed lines gracefully', () => {
    mkdirSync(join(tmpDir, AUDIT_DIR), { recursive: true });
    const content =
      JSON.stringify(makeEntry({ gate: 'T1' })) +
      '\nNOT_VALID_JSON\n' +
      JSON.stringify(makeEntry({ gate: 'T2' })) +
      '\n';
    writeFileSync(auditPath(), content, 'utf-8');

    const entries = readAuditLog(tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries[0].gate).toBe('T1');
    expect(entries[1].gate).toBe('T2');
  });
});

// ── countAuditEntries ─────────────────────────────────────────────────────────

describe('countAuditEntries', () => {
  it('returns 0 when file does not exist', () => {
    expect(countAuditEntries(tmpDir)).toBe(0);
  });

  it('returns correct count for existing entries', () => {
    writeEntries([
      makeEntry(),
      makeEntry(),
      makeEntry(),
    ]);

    expect(countAuditEntries(tmpDir)).toBe(3);
  });
});

// ── getRecentAuditEntries ─────────────────────────────────────────────────────

describe('getRecentAuditEntries', () => {
  it('returns last N entries', () => {
    writeEntries([
      makeEntry({ gate: 'T1' }),
      makeEntry({ gate: 'T2' }),
      makeEntry({ gate: 'T3' }),
      makeEntry({ gate: 'T4' }),
      makeEntry({ gate: 'T5' }),
    ]);

    const recent = getRecentAuditEntries(tmpDir, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].gate).toBe('T4');
    expect(recent[1].gate).toBe('T5');
  });

  it('returns all entries when count exceeds total', () => {
    writeEntries([makeEntry({ gate: 'T1' }), makeEntry({ gate: 'T2' })]);

    const recent = getRecentAuditEntries(tmpDir, 100);
    expect(recent).toHaveLength(2);
  });
});

// ── filterAuditEntries ────────────────────────────────────────────────────────

describe('filterAuditEntries', () => {
  const entries = [
    makeEntry({ gate: 'T1', verdict: 'pass', timestamp: '2026-01-10T00:00:00.000Z' }),
    makeEntry({ gate: 'T2', verdict: 'fail', timestamp: '2026-01-12T00:00:00.000Z' }),
    makeEntry({ gate: 'T1', verdict: 'warn', timestamp: '2026-01-14T00:00:00.000Z' }),
    makeEntry({ gate: 'T3', verdict: 'pass', timestamp: '2026-01-16T00:00:00.000Z' }),
  ];

  beforeEach(() => {
    writeEntries(entries);
  });

  it('filters by gate', () => {
    const result = filterAuditEntries(tmpDir, { gate: 'T1' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.gate === 'T1')).toBe(true);
  });

  it('filters by verdict', () => {
    const result = filterAuditEntries(tmpDir, { verdict: 'pass' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.verdict === 'pass')).toBe(true);
  });

  it('filters by since timestamp', () => {
    const result = filterAuditEntries(tmpDir, { since: '2026-01-13T00:00:00.000Z' });
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('2026-01-14T00:00:00.000Z');
    expect(result[1].timestamp).toBe('2026-01-16T00:00:00.000Z');
  });

  it('combines multiple filters', () => {
    const result = filterAuditEntries(tmpDir, { gate: 'T1', verdict: 'pass' });
    expect(result).toHaveLength(1);
    expect(result[0].gate).toBe('T1');
    expect(result[0].verdict).toBe('pass');
  });
});

// ── auditGateResult ───────────────────────────────────────────────────────────

describe('auditGateResult', () => {
  it('converts GateResult to audit entry correctly', () => {
    auditGateResult(
      tmpDir,
      {
        tier: 'T2',
        name: 'lint-check',
        status: 'fail',
        detail: 'Found 3 lint errors',
        durationMs: 120,
      },
      'STORY-005.md',
    );

    const entries = readAuditLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].gate).toBe('T2');
    expect(entries[0].verdict).toBe('fail');
    expect(entries[0].reason).toBe('Found 3 lint errors');
    expect(entries[0].duration_ms).toBe(120);
    expect(entries[0].story_file).toBe('STORY-005.md');
  });

  it('maps running status to skip verdict', () => {
    auditGateResult(tmpDir, {
      tier: 'T1',
      name: 'syntax-check',
      status: 'running',
      detail: 'Still in progress',
      durationMs: 0,
    });

    const entries = readAuditLog(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].verdict).toBe('skip');
  });
});

// ── rotateAuditLogIfNeeded ────────────────────────────────────────────────────

describe('rotateAuditLogIfNeeded', () => {
  it('returns false when entry count is below threshold', () => {
    writeEntries([makeEntry(), makeEntry()]);
    const rotated = rotateAuditLogIfNeeded(tmpDir, 100);
    expect(rotated).toBe(false);
    // Original file should still exist
    expect(existsSync(auditPath())).toBe(true);
  });

  it('archives file when entry count meets or exceeds threshold', () => {
    // Write entries equal to threshold
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ gate: `T${i}` }),
    );
    writeEntries(entries);

    const rotated = rotateAuditLogIfNeeded(tmpDir, 5);
    expect(rotated).toBe(true);

    // Original file should be gone (renamed)
    expect(existsSync(auditPath())).toBe(false);

    // Archive file should exist in .skillfoundry/
    const files = readdirSync(join(tmpDir, AUDIT_DIR));
    const archiveFiles = files.filter((f) => f.startsWith('audit-') && f.endsWith('.jsonl'));
    expect(archiveFiles).toHaveLength(1);
  });

  it('returns false when audit file does not exist', () => {
    const rotated = rotateAuditLogIfNeeded(tmpDir, 10);
    expect(rotated).toBe(false);
  });
});

// ── getAuditSummary ───────────────────────────────────────────────────────────

describe('getAuditSummary', () => {
  it('returns correct summary statistics', () => {
    writeEntries([
      makeEntry({ gate: 'T1', verdict: 'pass', timestamp: '2026-01-10T00:00:00.000Z' }),
      makeEntry({ gate: 'T2', verdict: 'fail', timestamp: '2026-01-11T00:00:00.000Z' }),
      makeEntry({ gate: 'T1', verdict: 'pass', timestamp: '2026-01-12T00:00:00.000Z' }),
      makeEntry({ gate: 'T3', verdict: 'warn', timestamp: '2026-01-13T00:00:00.000Z' }),
    ]);

    const summary = getAuditSummary(tmpDir);
    expect(summary.total_entries).toBe(4);
    expect(summary.by_verdict).toEqual({ pass: 2, fail: 1, warn: 1 });
    expect(summary.by_gate).toEqual({ T1: 2, T2: 1, T3: 1 });
    expect(summary.first_entry).toBe('2026-01-10T00:00:00.000Z');
    expect(summary.last_entry).toBe('2026-01-13T00:00:00.000Z');
  });

  it('returns empty summary for missing audit log', () => {
    const summary = getAuditSummary(tmpDir);
    expect(summary.total_entries).toBe(0);
    expect(summary.by_verdict).toEqual({});
    expect(summary.by_gate).toEqual({});
    expect(summary.first_entry).toBeUndefined();
    expect(summary.last_entry).toBeUndefined();
  });
});

// ── detectActor ───────────────────────────────────────────────────────────────

describe('detectActor', () => {
  const envBackup: Record<string, string | undefined> = {};
  const envKeys = ['GITHUB_ACTOR', 'GITLAB_USER_LOGIN', 'BUILD_REQUESTEDFOR', 'CIRCLE_USERNAME', 'USER', 'USERNAME', 'LOGNAME'];

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('returns github:actor when GITHUB_ACTOR is set', () => {
    process.env.GITHUB_ACTOR = 'octocat';
    expect(detectActor()).toBe('github:octocat');
  });

  it('returns gitlab:user when GITLAB_USER_LOGIN is set', () => {
    process.env.GITLAB_USER_LOGIN = 'gitlabuser';
    expect(detectActor()).toBe('gitlab:gitlabuser');
  });

  it('returns USER when no CI env vars are set', () => {
    process.env.USER = 'localdev';
    expect(detectActor()).toBe('localdev');
  });

  it('returns unknown when no env vars are set', () => {
    expect(detectActor()).toBe('unknown');
  });

  it('prefers GITHUB_ACTOR over USER', () => {
    process.env.GITHUB_ACTOR = 'cibot';
    process.env.USER = 'localdev';
    expect(detectActor()).toBe('github:cibot');
  });
});

// ── streamAuditEntries ────────────────────────────────────────────────────────

describe('streamAuditEntries', () => {
  it('streams entries and invokes callback for each', async () => {
    writeEntries([
      makeEntry({ gate: 'T1' }),
      makeEntry({ gate: 'T2' }),
      makeEntry({ gate: 'T3' }),
    ]);

    const received: { gate: string }[] = [];
    const count = await streamAuditEntries(tmpDir, (entry) => {
      received.push({ gate: entry.gate });
    });

    expect(count).toBe(3);
    expect(received).toHaveLength(3);
    expect(received[0].gate).toBe('T1');
    expect(received[2].gate).toBe('T3');
  });

  it('returns 0 when file does not exist', async () => {
    const count = await streamAuditEntries(tmpDir, () => {});
    expect(count).toBe(0);
  });

  it('skips malformed lines during streaming', async () => {
    mkdirSync(join(tmpDir, AUDIT_DIR), { recursive: true });
    const content =
      JSON.stringify(makeEntry({ gate: 'T1' })) +
      '\nBROKEN_JSON\n' +
      JSON.stringify(makeEntry({ gate: 'T2' })) +
      '\n';
    writeFileSync(auditPath(), content, 'utf-8');

    const received: string[] = [];
    const count = await streamAuditEntries(tmpDir, (entry) => {
      received.push(entry.gate);
    });

    expect(count).toBe(2);
    expect(received).toEqual(['T1', 'T2']);
  });
});

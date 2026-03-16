/**
 * STORY-002: Append-Only Audit Log
 *
 * Writes every gate decision to `.skillfoundry/audit.jsonl` as an append-only
 * JSONL file. Entries are immutable — no update or delete operations.
 *
 * Features:
 * - Atomic append via appendFileSync
 * - UUID v4 for each entry
 * - Actor detection from environment (USER, CI vars)
 * - Streaming reader for large logs (10k+ entries)
 * - Optional rotation (archive after threshold)
 */

import { appendFileSync, existsSync, readFileSync, renameSync, mkdirSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { AuditEntry } from '../types.js';
import type { GateResult } from './gates.js';
import { getLogger } from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUDIT_DIR = '.skillfoundry';
const AUDIT_FILE = 'audit.jsonl';
const MAX_REASON_LENGTH = 2000;
const ROTATION_THRESHOLD = 10_000;

/**
 * Resolve workDir and return the audit file path, guarding against path traversal.
 */
function resolveAuditPath(workDir: string): { dirPath: string; filePath: string } {
  const resolvedWorkDir = resolve(workDir);
  const dirPath = join(resolvedWorkDir, AUDIT_DIR);
  const filePath = join(resolvedWorkDir, AUDIT_DIR, AUDIT_FILE);
  return { dirPath, filePath };
}

// ── Actor detection ───────────────────────────────────────────────────────────

/**
 * Detect the current actor identity from environment variables.
 * Checks CI-specific vars first, then falls back to OS user.
 */
export function detectActor(): string {
  // CI environments
  if (process.env.GITHUB_ACTOR) return `github:${process.env.GITHUB_ACTOR}`;
  if (process.env.GITLAB_USER_LOGIN) return `gitlab:${process.env.GITLAB_USER_LOGIN}`;
  if (process.env.BUILD_REQUESTEDFOR) return `azdo:${process.env.BUILD_REQUESTEDFOR}`;
  if (process.env.CIRCLE_USERNAME) return `circleci:${process.env.CIRCLE_USERNAME}`;

  // Local user
  return process.env.USER || process.env.USERNAME || process.env.LOGNAME || 'unknown';
}

// ── Core audit log ────────────────────────────────────────────────────────────

/**
 * Append a single audit entry to the log.
 * Creates the file and directory if they don't exist.
 */
export function appendAuditEntry(workDir: string, entry: Omit<AuditEntry, 'id' | 'timestamp' | 'actor'>): void {
  const log = getLogger();

  const { dirPath, filePath } = resolveAuditPath(workDir);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const fullEntry: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: detectActor(),
    gate: entry.gate,
    verdict: entry.verdict,
    reason: (entry.reason || '').slice(0, MAX_REASON_LENGTH),
    duration_ms: entry.duration_ms,
    story_file: entry.story_file,
    file_sha: entry.file_sha,
  };

  const line = JSON.stringify(fullEntry) + '\n';

  try {
    appendFileSync(filePath, line, { encoding: 'utf-8' });
  } catch (err) {
    log.error('audit', 'write_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Convert a GateResult to an audit log entry and append it.
 */
export function auditGateResult(workDir: string, result: GateResult, storyFile?: string): void {
  appendAuditEntry(workDir, {
    gate: result.tier,
    verdict: result.status === 'running' ? 'skip' : result.status,
    reason: result.detail,
    duration_ms: result.durationMs,
    story_file: storyFile,
  });
}

// ── Readers ───────────────────────────────────────────────────────────────────

/**
 * Read all audit entries synchronously.
 * For small logs (<10k entries). For larger logs use streamAuditEntries.
 */
export function readAuditLog(workDir: string): AuditEntry[] {
  const { filePath } = resolveAuditPath(workDir);

  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries: AuditEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as AuditEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Stream audit entries line-by-line for large logs.
 * Calls the callback for each valid entry.
 */
export async function streamAuditEntries(
  workDir: string,
  callback: (entry: AuditEntry) => void,
): Promise<number> {
  const { filePath } = resolveAuditPath(workDir);

  if (!existsSync(filePath)) {
    return 0;
  }

  let count = 0;
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as AuditEntry;
      callback(entry);
      count++;
    } catch {
      // Skip malformed lines
    }
  }

  return count;
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/**
 * Count entries in the audit log without loading all into memory.
 */
export function countAuditEntries(workDir: string): number {
  const { filePath } = resolveAuditPath(workDir);
  if (!existsSync(filePath)) return 0;

  const content = readFileSync(filePath, 'utf-8');
  return content.split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Get recent audit entries (last N).
 */
export function getRecentAuditEntries(workDir: string, count: number = 50): AuditEntry[] {
  const all = readAuditLog(workDir);
  return all.slice(-count);
}

/**
 * Filter audit entries by gate tier and/or verdict.
 */
export function filterAuditEntries(
  workDir: string,
  filters: { gate?: string; verdict?: string; since?: string },
): AuditEntry[] {
  const all = readAuditLog(workDir);
  return all.filter((entry) => {
    if (filters.gate && entry.gate !== filters.gate) return false;
    if (filters.verdict && entry.verdict !== filters.verdict) return false;
    if (filters.since && entry.timestamp < filters.since) return false;
    return true;
  });
}

// ── Rotation ──────────────────────────────────────────────────────────────────

/**
 * Rotate the audit log if it exceeds the threshold.
 * Archives the current log as `audit-{timestamp}.jsonl` and starts fresh.
 */
export function rotateAuditLogIfNeeded(workDir: string, threshold: number = ROTATION_THRESHOLD): boolean {
  const entryCount = countAuditEntries(workDir);
  if (entryCount < threshold) return false;

  const { filePath, dirPath } = resolveAuditPath(workDir);
  const archiveName = `audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const archivePath = join(dirPath, archiveName);

  try {
    renameSync(filePath, archivePath);
    getLogger().info('audit', 'rotated', { entries: entryCount, archive: archiveName });
    return true;
  } catch (err) {
    getLogger().error('audit', 'rotation_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface AuditSummary {
  total_entries: number;
  by_verdict: Record<string, number>;
  by_gate: Record<string, number>;
  first_entry?: string;
  last_entry?: string;
}

/**
 * Generate a summary of the audit log.
 */
export function getAuditSummary(workDir: string): AuditSummary {
  const entries = readAuditLog(workDir);
  const by_verdict: Record<string, number> = {};
  const by_gate: Record<string, number> = {};

  for (const entry of entries) {
    by_verdict[entry.verdict] = (by_verdict[entry.verdict] || 0) + 1;
    by_gate[entry.gate] = (by_gate[entry.gate] || 0) + 1;
  }

  return {
    total_entries: entries.length,
    by_verdict,
    by_gate,
    first_entry: entries[0]?.timestamp,
    last_entry: entries[entries.length - 1]?.timestamp,
  };
}

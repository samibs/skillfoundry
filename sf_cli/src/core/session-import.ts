/**
 * Session import pipeline — imports session reports, forge logs, and inbox files
 * into the central dashboard database for cross-project analysis.
 *
 * Import sources:
 *   1. .skillfoundry/runs/*-issues.json  (SessionReport format)
 *   2. .skillfoundry/logs/session.log    (forge log events)
 *   3. data/inbox/*.json                 (manually placed session exports)
 */

import { existsSync, readFileSync, readdirSync, renameSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import {
  insertSessionReport,
  insertSessionIssues,
  insertFailurePatterns,
} from './dashboard-db.js';
import type {
  SessionReportRecord,
  SessionIssueRecord,
  FailurePatternRecord,
} from './dashboard-db.js';
import type Database from 'better-sqlite3';

// ── Types ───────────────────────────────────────────────────────

export interface ImportResult {
  sessions_imported: number;
  sessions_skipped: number;
  issues_imported: number;
  patterns_extracted: number;
  forge_events_processed: number;
  errors: string[];
}

// Matches SessionReport from session-recorder.ts
interface SessionReportJson {
  runId: string;
  startedAt: string;
  completedAt: string;
  issues: Array<{
    id: string;
    severity: string;
    category: string;
    title: string;
    detail: string;
    story?: string;
    phase: string;
    occurredAt: string;
    remediation: string;
    relatedIssues: string[];
  }>;
  anomalies: Array<{
    id: string;
    type: string;
    description: string;
    evidence: string[];
    detectedAt: string;
  }>;
  errorPatterns: Array<{
    signature: string;
    occurrences: number;
    stories: string[];
    firstSeen: string;
    likelyRootCause: string;
  }>;
  summary: {
    totalIssues: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    blockers: number;
    anomalies: number;
    storiesWithIssues: number;
    topRemediations: string[];
  };
}

// Forge log entry format
interface ForgeLogEntry {
  ts: string;
  level: string;
  category: string;
  event: string;
  data?: Record<string, unknown>;
}

// ── Session Report Import ──────────────────────────────────────

/**
 * Import a session report JSON into the database.
 * Returns true if imported, false if duplicate.
 */
export function importSessionReport(
  db: Database.Database,
  projectId: string,
  report: SessionReportJson,
  sourceFile?: string,
): { imported: boolean; issues: number; patterns: number } {
  const log = getLogger();

  // Determine outcome from summary
  let outcome = 'pass';
  if (report.summary.blockers > 0) outcome = 'fail';
  else if (report.summary.totalIssues > 0) outcome = 'warn';

  // Insert session report
  const wasInserted = insertSessionReport(db, {
    id: report.runId,
    project_id: projectId,
    started_at: report.startedAt,
    completed_at: report.completedAt,
    total_issues: report.summary.totalIssues,
    blockers: report.summary.blockers,
    anomalies: report.summary.anomalies,
    error_patterns: report.errorPatterns.length,
    outcome,
    source_file: sourceFile,
  });

  if (!wasInserted) {
    return { imported: false, issues: 0, patterns: 0 };
  }

  // Insert issues
  const issueRecords: SessionIssueRecord[] = report.issues.map((issue) => ({
    id: issue.id,
    session_id: report.runId,
    project_id: projectId,
    severity: issue.severity,
    category: issue.category,
    title: issue.title,
    detail: issue.detail,
    story: issue.story,
    phase: issue.phase,
    occurred_at: issue.occurredAt,
    remediation: issue.remediation,
  }));

  const issuesInserted = insertSessionIssues(db, issueRecords);

  // Extract error patterns into failure_patterns table
  const patternRecords: FailurePatternRecord[] = report.errorPatterns.map((ep) => ({
    project_id: projectId,
    signature: ep.signature,
    occurrences: ep.occurrences,
    first_seen: ep.firstSeen,
    last_seen: report.completedAt,
    source: 'session-report',
    severity: ep.occurrences >= 3 ? 'error' : 'warning',
    detail: ep.likelyRootCause,
  }));

  const patternsInserted = insertFailurePatterns(db, projectId, patternRecords);

  log.info('session-import', 'report_imported', {
    runId: report.runId,
    issues: issuesInserted,
    patterns: patternsInserted,
  });

  return { imported: true, issues: issuesInserted, patterns: patternsInserted };
}

// ── Forge Log Import ──────────────────────────────────────────

/**
 * Import a forge run log file. Extracts failure events and converts
 * them to failure patterns.
 */
export function importForgeLog(
  db: Database.Database,
  projectId: string,
  logPath: string,
): { events_processed: number; patterns_extracted: number } {
  const log = getLogger();

  if (!existsSync(logPath)) {
    return { events_processed: 0, patterns_extracted: 0 };
  }

  const content = readFileSync(logPath, 'utf-8').trim();
  if (!content) return { events_processed: 0, patterns_extracted: 0 };

  const failureSignatures = new Map<string, { count: number; firstTs: string; lastTs: string; detail: string; severity: string }>();
  let eventsProcessed = 0;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as ForgeLogEntry;
      eventsProcessed++;

      // Only process error/warn level events
      if (!['ERROR', 'WARN'].includes(entry.level)) continue;

      const signature = `${entry.category}:${entry.event}`;
      const existing = failureSignatures.get(signature);

      if (existing) {
        existing.count++;
        if (entry.ts > existing.lastTs) existing.lastTs = entry.ts;
        if (entry.ts < existing.firstTs) existing.firstTs = entry.ts;
      } else {
        const detail = entry.data
          ? Object.entries(entry.data).map(([k, v]) => `${k}=${String(v)}`).join(', ')
          : entry.event;
        failureSignatures.set(signature, {
          count: 1,
          firstTs: entry.ts,
          lastTs: entry.ts,
          detail,
          severity: entry.level === 'ERROR' ? 'error' : 'warning',
        });
      }
    } catch {
      // Skip malformed
    }
  }

  // Upsert extracted patterns
  const patterns: FailurePatternRecord[] = [];
  for (const [signature, data] of failureSignatures) {
    patterns.push({
      project_id: projectId,
      signature,
      occurrences: data.count,
      first_seen: data.firstTs,
      last_seen: data.lastTs,
      source: 'forge-log',
      severity: data.severity,
      detail: data.detail,
    });
  }

  const patternsInserted = insertFailurePatterns(db, projectId, patterns);

  log.info('session-import', 'forge_log_imported', {
    path: logPath,
    events: eventsProcessed,
    patterns: patternsInserted,
  });

  return { events_processed: eventsProcessed, patterns_extracted: patternsInserted };
}

// ── Project Session Scanner ──────────────────────────────────

/**
 * Scan a project's .skillfoundry/runs/ for session reports and import them.
 */
export function scanProjectSessions(
  db: Database.Database,
  projectId: string,
  projectPath: string,
): ImportResult {
  const result: ImportResult = {
    sessions_imported: 0,
    sessions_skipped: 0,
    issues_imported: 0,
    patterns_extracted: 0,
    forge_events_processed: 0,
    errors: [],
  };

  // 1. Scan .skillfoundry/runs/ for session reports
  const runsDir = join(projectPath, '.skillfoundry', 'runs');
  if (existsSync(runsDir)) {
    try {
      const files = readdirSync(runsDir).filter((f) => f.endsWith('-issues.json'));
      for (const file of files) {
        const filePath = join(runsDir, file);
        try {
          const content = readFileSync(filePath, 'utf-8');
          const report = JSON.parse(content) as SessionReportJson;

          if (!report.runId || !report.summary) continue;

          const res = importSessionReport(db, projectId, report, filePath);
          if (res.imported) {
            result.sessions_imported++;
            result.issues_imported += res.issues;
            result.patterns_extracted += res.patterns;
          } else {
            result.sessions_skipped++;
          }
        } catch (err) {
          result.errors.push(`${file}: ${String(err)}`);
        }
      }
    } catch {
      // runs dir read failed
    }
  }

  // 2. Scan .skillfoundry/logs/ for forge run logs
  const logsDir = join(projectPath, '.skillfoundry', 'logs');
  if (existsSync(logsDir)) {
    try {
      const logFiles = readdirSync(logsDir).filter((f) => f.startsWith('forge-') && f.endsWith('.log'));
      for (const file of logFiles) {
        try {
          const res = importForgeLog(db, projectId, join(logsDir, file));
          result.forge_events_processed += res.events_processed;
          result.patterns_extracted += res.patterns_extracted;
        } catch (err) {
          result.errors.push(`${file}: ${String(err)}`);
        }
      }
    } catch {
      // logs dir read failed
    }
  }

  // 3. Scan session.log aggregated log
  const sessionLog = join(logsDir, 'session.log');
  if (existsSync(sessionLog)) {
    try {
      const res = importForgeLog(db, projectId, sessionLog);
      result.forge_events_processed += res.events_processed;
      result.patterns_extracted += res.patterns_extracted;
    } catch (err) {
      result.errors.push(`session.log: ${String(err)}`);
    }
  }

  return result;
}

// ── Inbox Import ──────────────────────────────────────────────

/**
 * Import files from data/inbox/. Supports:
 *   - *-issues.json (SessionReport format)
 *   - *.log (forge log format)
 *
 * Successfully imported files are moved to data/inbox/imported/.
 */
export function importInbox(
  db: Database.Database,
  frameworkDir: string,
  projectIdOverride?: string,
): ImportResult {
  const log = getLogger();
  const inboxDir = join(frameworkDir, 'data', 'inbox');

  const result: ImportResult = {
    sessions_imported: 0,
    sessions_skipped: 0,
    issues_imported: 0,
    patterns_extracted: 0,
    forge_events_processed: 0,
    errors: [],
  };

  if (!existsSync(inboxDir)) return result;

  let files: string[];
  try {
    files = readdirSync(inboxDir).filter((f) =>
      f.endsWith('.json') || f.endsWith('.log'),
    );
  } catch {
    return result;
  }

  if (files.length === 0) return result;

  // Create imported/ destination
  const importedDir = join(inboxDir, 'imported');
  if (!existsSync(importedDir)) {
    mkdirSync(importedDir, { recursive: true });
  }

  for (const file of files) {
    const filePath = join(inboxDir, file);

    try {
      if (file.endsWith('-issues.json') || file.endsWith('.json')) {
        // Attempt to parse as session report
        const content = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        if (data.runId && data.summary) {
          // Session report format
          const projectId = projectIdOverride || extractProjectIdFromReport(db, data) || createUnknownProject(db);
          const res = importSessionReport(db, projectId, data as SessionReportJson, filePath);
          if (res.imported) {
            result.sessions_imported++;
            result.issues_imported += res.issues;
            result.patterns_extracted += res.patterns;
          } else {
            result.sessions_skipped++;
          }
        }
      } else if (file.endsWith('.log')) {
        const projectId = projectIdOverride || createUnknownProject(db);
        const res = importForgeLog(db, projectId, filePath);
        result.forge_events_processed += res.events_processed;
        result.patterns_extracted += res.patterns_extracted;
      }

      // Move to imported/
      renameSync(filePath, join(importedDir, file));
    } catch (err) {
      result.errors.push(`${file}: ${String(err)}`);
      log.warn('session-import', 'inbox_file_failed', { file, error: String(err) });
    }
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────

function extractProjectIdFromReport(db: Database.Database, data: Record<string, unknown>): string | null {
  // Check if report contains a project_id or project_path hint
  const projectPath = data.project_path as string | undefined;
  if (projectPath) {
    const row = db.prepare('SELECT id FROM projects WHERE path = ?').get(projectPath) as { id: string } | undefined;
    if (row) return row.id;
  }
  return null;
}

function createUnknownProject(db: Database.Database): string {
  const id = 'unknown-' + randomUUID().slice(0, 8);
  const existing = db.prepare("SELECT id FROM projects WHERE name = 'unknown-inbox'").get() as { id: string } | undefined;
  if (existing) return existing.id;

  db.prepare(`
    INSERT OR IGNORE INTO projects (id, path, name, platform, health_status)
    VALUES (?, 'inbox', 'unknown-inbox', 'unknown', 'unknown')
  `).run(id);

  return id;
}

/**
 * Format import result for CLI output.
 */
export function formatImportResult(result: ImportResult): string {
  const lines = [
    'Session Import Complete',
    '\u2501'.repeat(40),
    `  Sessions imported:   ${result.sessions_imported}`,
    `  Sessions skipped:    ${result.sessions_skipped} (duplicate)`,
    `  Issues imported:     ${result.issues_imported}`,
    `  Patterns extracted:  ${result.patterns_extracted}`,
    `  Forge events:        ${result.forge_events_processed}`,
  ];

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`  Errors (${result.errors.length}):`);
    for (const err of result.errors.slice(0, 5)) {
      lines.push(`    - ${err}`);
    }
  }

  return lines.join('\n');
}

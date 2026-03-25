/**
 * Dashboard SQLite database — central aggregation store for multi-project telemetry.
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations.
 * Schema: projects, telemetry_events, perf_entries, knowledge_entries, failure_patterns, kpi_snapshots.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  path: string;
  name: string;
  platform?: string;
  framework_version?: string;
  health_status?: string;
}

export interface TelemetryEventRecord {
  id: string;
  project_id: string;
  event_type: string;
  timestamp: string;
  status?: string;
  duration_ms?: number;
  details?: string;
}

export interface PerfEntryRecord {
  project_id: string;
  gate: string;
  duration_ms: number;
  timestamp: string;
  run_id?: string;
}

export interface KnowledgeEntryRecord {
  id: string;
  project_id: string;
  type: string;
  content?: string;
  created_at?: string;
  tags?: string;
  weight?: number;
}

export interface FailurePatternRecord {
  project_id: string;
  signature: string;
  occurrences?: number;
  first_seen?: string;
  last_seen?: string;
  source?: string;
  severity?: string;
  detail?: string;
  remediation_status?: string;
}

export interface SessionReportRecord {
  id: string;
  project_id: string;
  started_at?: string;
  completed_at?: string;
  total_issues?: number;
  blockers?: number;
  anomalies?: number;
  error_patterns?: number;
  outcome?: string;
  source_file?: string;
}

export interface SessionIssueRecord {
  id: string;
  session_id: string;
  project_id: string;
  severity: string;
  category: string;
  title?: string;
  detail?: string;
  story?: string;
  phase?: string;
  occurred_at?: string;
  remediation?: string;
}

export interface SyncState {
  last_synced_at: string | null;
}

export interface RemediationRecord {
  id: string;
  project_id: string;
  failure_signature: string;
  playbook_id?: string;
  status?: string;
  priority?: string;
  title: string;
  description?: string;
  steps?: string;
  result?: string;
  auto_applied?: number;
}

export interface PlaybookRecord {
  id: string;
  name: string;
  description?: string;
  category: string;
  trigger_pattern: string;
  steps: string;
  auto_applicable?: number;
}

// ── Schema ───────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT,
  platform TEXT DEFAULT 'claude',
  framework_version TEXT,
  health_status TEXT DEFAULT 'unknown',
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT,
  duration_ms INTEGER,
  details TEXT,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS perf_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  gate TEXT NOT NULL,
  duration_ms INTEGER,
  timestamp TEXT NOT NULL,
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL,
  content TEXT,
  created_at TEXT,
  tags TEXT,
  weight REAL DEFAULT 0.5,
  synced_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS failure_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  signature TEXT NOT NULL,
  occurrences INTEGER DEFAULT 1,
  first_seen TEXT,
  last_seen TEXT,
  source TEXT,
  severity TEXT,
  detail TEXT,
  remediation_status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  snapshot_date TEXT NOT NULL,
  forge_runs INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,
  gate_pass_rate REAL DEFAULT 0,
  security_findings_critical INTEGER DEFAULT 0,
  security_findings_high INTEGER DEFAULT 0,
  test_coverage REAL DEFAULT 0,
  avg_cost_usd REAL DEFAULT 0,
  trend TEXT DEFAULT 'stable'
);

CREATE TABLE IF NOT EXISTS session_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  started_at TEXT,
  completed_at TEXT,
  total_issues INTEGER DEFAULT 0,
  blockers INTEGER DEFAULT 0,
  anomalies INTEGER DEFAULT 0,
  error_patterns INTEGER DEFAULT 0,
  outcome TEXT,
  source_file TEXT,
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_issues (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES session_reports(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT,
  detail TEXT,
  story TEXT,
  phase TEXT,
  occurred_at TEXT,
  remediation TEXT
);

CREATE TABLE IF NOT EXISTS remediations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  failure_signature TEXT NOT NULL,
  playbook_id TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  steps TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  result TEXT,
  auto_applied INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  trigger_pattern TEXT NOT NULL,
  steps TEXT NOT NULL,
  auto_applicable INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_project ON telemetry_events(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_project ON perf_entries(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_failure_project ON failure_patterns(project_id, last_seen);
CREATE INDEX IF NOT EXISTS idx_kpi_project_date ON kpi_snapshots(project_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_session_project ON session_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_session ON session_issues(session_id);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON session_issues(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_remediation_project ON remediations(project_id, status);
CREATE INDEX IF NOT EXISTS idx_remediation_sig ON remediations(failure_signature);
CREATE INDEX IF NOT EXISTS idx_playbook_pattern ON playbooks(trigger_pattern);

CREATE TABLE IF NOT EXISTS optimization_experiments (
  id TEXT PRIMARY KEY,
  skill_name TEXT NOT NULL,
  scenario_description TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  total_iterations INTEGER DEFAULT 0,
  best_iteration INTEGER DEFAULT 0,
  baseline_score REAL,
  best_score REAL,
  improvement_pct REAL DEFAULT 0,
  status TEXT DEFAULT 'running',
  config TEXT
);

CREATE TABLE IF NOT EXISTS optimization_iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id TEXT NOT NULL REFERENCES optimization_experiments(id),
  iteration_number INTEGER NOT NULL,
  mutation_strategy TEXT NOT NULL,
  mutation_detail TEXT,
  gate_verdict TEXT,
  gate_pass_count INTEGER DEFAULT 0,
  gate_fail_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  token_estimate INTEGER DEFAULT 0,
  composite_score REAL,
  kept INTEGER DEFAULT 0,
  prompt_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_optexp_skill ON optimization_experiments(skill_name);
CREATE INDEX IF NOT EXISTS idx_optiter_experiment ON optimization_iterations(experiment_id, iteration_number);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  task_description TEXT NOT NULL,
  task_keywords TEXT NOT NULL,
  agent_selected TEXT NOT NULL,
  outcome TEXT,
  score REAL,
  duration_ms INTEGER,
  cost_usd REAL,
  timestamp TEXT NOT NULL,
  project_id TEXT
);

CREATE TABLE IF NOT EXISTS agent_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  avg_cost_usd REAL DEFAULT 0,
  last_updated TEXT,
  UNIQUE(agent_name, task_type)
);

CREATE INDEX IF NOT EXISTS idx_routing_timestamp ON routing_decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_routing_agent ON routing_decisions(agent_selected);
CREATE INDEX IF NOT EXISTS idx_agent_perf ON agent_performance(agent_name, task_type);

CREATE TABLE IF NOT EXISTS certification_runs (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  overall_score REAL NOT NULL,
  total_findings INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  categories_json TEXT
);

CREATE TABLE IF NOT EXISTS certification_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES certification_runs(id),
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file TEXT,
  line INTEGER,
  recommendation TEXT
);

CREATE INDEX IF NOT EXISTS idx_cert_runs ON certification_runs(completed_at);
CREATE INDEX IF NOT EXISTS idx_cert_findings ON certification_findings(run_id, severity);
`;

// Unique index needs special handling (CREATE UNIQUE INDEX IF NOT EXISTS)
const UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_sig ON failure_patterns(project_id, signature);
`;

// ── Database initialization ──────────────────────────────────────

/**
 * Open or create the dashboard SQLite database.
 * Creates all tables and indexes if they don't exist.
 */
export function initDatabase(dbPath: string): Database.Database {
  const log = getLogger();
  const dir = dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  db.exec(SCHEMA_SQL);
  db.exec(UNIQUE_INDEX_SQL);

  log.info('dashboard-db', 'initialized', { path: dbPath });
  return db;
}

// ── CRUD Operations ──────────────────────────────────────────────

/**
 * Insert or update a project record.
 */
export function upsertProject(db: Database.Database, project: ProjectRecord): void {
  const stmt = db.prepare(`
    INSERT INTO projects (id, path, name, platform, framework_version, health_status, updated_at)
    VALUES (@id, @path, @name, @platform, @framework_version, @health_status, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      path = @path,
      name = @name,
      platform = COALESCE(@platform, platform),
      framework_version = COALESCE(@framework_version, framework_version),
      health_status = COALESCE(@health_status, health_status),
      updated_at = datetime('now')
  `);

  stmt.run({
    id: project.id,
    path: project.path,
    name: project.name,
    platform: project.platform || 'claude',
    framework_version: project.framework_version || null,
    health_status: project.health_status || 'unknown',
  });
}

/**
 * Bulk insert telemetry events, skipping duplicates by event ID.
 * Returns the number of newly inserted events.
 */
export function insertTelemetryEvents(
  db: Database.Database,
  projectId: string,
  events: TelemetryEventRecord[],
): number {
  if (events.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO telemetry_events (id, project_id, event_type, timestamp, status, duration_ms, details)
    VALUES (@id, @project_id, @event_type, @timestamp, @status, @duration_ms, @details)
  `);

  let inserted = 0;
  const insertMany = db.transaction((evts: TelemetryEventRecord[]) => {
    for (const evt of evts) {
      const result = stmt.run({
        id: evt.id,
        project_id: projectId,
        event_type: evt.event_type,
        timestamp: evt.timestamp,
        status: evt.status || null,
        duration_ms: evt.duration_ms || null,
        details: evt.details || null,
      });
      if (result.changes > 0) inserted++;
    }
  });

  insertMany(events);
  return inserted;
}

/**
 * Append performance entries for a project.
 * Returns the number of inserted entries.
 */
export function insertPerfEntries(
  db: Database.Database,
  projectId: string,
  entries: PerfEntryRecord[],
): number {
  if (entries.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT INTO perf_entries (project_id, gate, duration_ms, timestamp, run_id)
    VALUES (@project_id, @gate, @duration_ms, @timestamp, @run_id)
  `);

  const insertMany = db.transaction((ents: PerfEntryRecord[]) => {
    for (const entry of ents) {
      stmt.run({
        project_id: projectId,
        gate: entry.gate,
        duration_ms: entry.duration_ms,
        timestamp: entry.timestamp,
        run_id: entry.run_id || null,
      });
    }
  });

  insertMany(entries);
  return entries.length;
}

/**
 * Upsert failure patterns by (project_id, signature).
 * Increments occurrences and updates last_seen on conflict.
 */
export function insertFailurePatterns(
  db: Database.Database,
  projectId: string,
  patterns: FailurePatternRecord[],
): number {
  if (patterns.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT INTO failure_patterns (project_id, signature, occurrences, first_seen, last_seen, source, severity, detail, remediation_status)
    VALUES (@project_id, @signature, @occurrences, @first_seen, @last_seen, @source, @severity, @detail, @remediation_status)
    ON CONFLICT(project_id, signature) DO UPDATE SET
      occurrences = occurrences + @occurrences,
      last_seen = CASE WHEN @last_seen > last_seen THEN @last_seen ELSE last_seen END,
      severity = COALESCE(@severity, severity),
      detail = COALESCE(@detail, detail)
  `);

  const insertMany = db.transaction((pats: FailurePatternRecord[]) => {
    for (const pat of pats) {
      stmt.run({
        project_id: projectId,
        signature: pat.signature,
        occurrences: pat.occurrences || 1,
        first_seen: pat.first_seen || new Date().toISOString(),
        last_seen: pat.last_seen || new Date().toISOString(),
        source: pat.source || null,
        severity: pat.severity || null,
        detail: pat.detail || null,
        remediation_status: pat.remediation_status || 'open',
      });
    }
  });

  insertMany(patterns);
  return patterns.length;
}

/**
 * Bulk insert knowledge entries, skipping duplicates by ID.
 * Returns the number of newly inserted entries.
 */
export function insertKnowledgeEntries(
  db: Database.Database,
  projectId: string,
  entries: KnowledgeEntryRecord[],
): number {
  if (entries.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO knowledge_entries (id, project_id, type, content, created_at, tags, weight)
    VALUES (@id, @project_id, @type, @content, @created_at, @tags, @weight)
  `);

  let inserted = 0;
  const insertMany = db.transaction((ents: KnowledgeEntryRecord[]) => {
    for (const entry of ents) {
      const result = stmt.run({
        id: entry.id,
        project_id: projectId,
        type: entry.type,
        content: entry.content || null,
        created_at: entry.created_at || null,
        tags: entry.tags || null,
        weight: entry.weight ?? 0.5,
      });
      if (result.changes > 0) inserted++;
    }
  });

  insertMany(entries);
  return inserted;
}

/**
 * Get the last sync timestamp for a project.
 */
export function getProjectSyncState(db: Database.Database, projectId: string): SyncState {
  const row = db.prepare('SELECT last_synced_at FROM projects WHERE id = ?').get(projectId) as
    | { last_synced_at: string | null }
    | undefined;

  return { last_synced_at: row?.last_synced_at || null };
}

/**
 * Update the last_synced_at timestamp for a project.
 */
export function updateSyncTimestamp(db: Database.Database, projectId: string): void {
  db.prepare("UPDATE projects SET last_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(
    projectId,
  );
}

// ── Phase 3: Session Import CRUD ──────────────────────────────────

/**
 * Insert a session report. Skips if already imported (by ID).
 * Returns true if inserted, false if duplicate.
 */
export function insertSessionReport(db: Database.Database, report: SessionReportRecord): boolean {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO session_reports (id, project_id, started_at, completed_at, total_issues, blockers, anomalies, error_patterns, outcome, source_file)
    VALUES (@id, @project_id, @started_at, @completed_at, @total_issues, @blockers, @anomalies, @error_patterns, @outcome, @source_file)
  `);

  const result = stmt.run({
    id: report.id,
    project_id: report.project_id,
    started_at: report.started_at || null,
    completed_at: report.completed_at || null,
    total_issues: report.total_issues ?? 0,
    blockers: report.blockers ?? 0,
    anomalies: report.anomalies ?? 0,
    error_patterns: report.error_patterns ?? 0,
    outcome: report.outcome || null,
    source_file: report.source_file || null,
  });

  return result.changes > 0;
}

/**
 * Bulk insert session issues, skipping duplicates by ID.
 * Returns the count of newly inserted issues.
 */
export function insertSessionIssues(db: Database.Database, issues: SessionIssueRecord[]): number {
  if (issues.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO session_issues (id, session_id, project_id, severity, category, title, detail, story, phase, occurred_at, remediation)
    VALUES (@id, @session_id, @project_id, @severity, @category, @title, @detail, @story, @phase, @occurred_at, @remediation)
  `);

  let inserted = 0;
  const insertMany = db.transaction((items: SessionIssueRecord[]) => {
    for (const issue of items) {
      const result = stmt.run({
        id: issue.id,
        session_id: issue.session_id,
        project_id: issue.project_id,
        severity: issue.severity,
        category: issue.category,
        title: issue.title || null,
        detail: issue.detail || null,
        story: issue.story || null,
        phase: issue.phase || null,
        occurred_at: issue.occurred_at || null,
        remediation: issue.remediation || null,
      });
      if (result.changes > 0) inserted++;
    }
  });

  insertMany(issues);
  return inserted;
}

/**
 * Get session reports for a project.
 */
export function getSessionReports(
  db: Database.Database,
  projectId?: string,
  limit: number = 20,
): Array<SessionReportRecord & { imported_at: string }> {
  const sql = projectId
    ? 'SELECT * FROM session_reports WHERE project_id = ? ORDER BY completed_at DESC LIMIT ?'
    : 'SELECT * FROM session_reports ORDER BY completed_at DESC LIMIT ?';
  const params = projectId ? [projectId, limit] : [limit];
  return db.prepare(sql).all(...params) as Array<SessionReportRecord & { imported_at: string }>;
}

/**
 * Get session issues, optionally filtered.
 */
export function getSessionIssues(
  db: Database.Database,
  options?: { sessionId?: string; projectId?: string; severity?: string; category?: string; limit?: number },
): SessionIssueRecord[] {
  let sql = 'SELECT * FROM session_issues WHERE 1=1';
  const params: Record<string, unknown> = {};

  if (options?.sessionId) {
    sql += ' AND session_id = @sessionId';
    params.sessionId = options.sessionId;
  }
  if (options?.projectId) {
    sql += ' AND project_id = @projectId';
    params.projectId = options.projectId;
  }
  if (options?.severity) {
    sql += ' AND UPPER(severity) = @severity';
    params.severity = options.severity.toUpperCase();
  }
  if (options?.category) {
    sql += ' AND UPPER(category) = @category';
    params.category = options.category.toUpperCase();
  }

  sql += ' ORDER BY occurred_at DESC';
  sql += ` LIMIT ${options?.limit || 100}`;

  return db.prepare(sql).all(params) as SessionIssueRecord[];
}

/**
 * Get cross-project failure pattern correlations.
 * Finds signatures that appear in 2+ projects.
 */
export function getCrossProjectPatterns(
  db: Database.Database,
): Array<{
  signature: string;
  project_count: number;
  total_occurrences: number;
  projects: string;
  severity: string;
  last_seen: string;
}> {
  return db.prepare(`
    SELECT
      f.signature,
      COUNT(DISTINCT f.project_id) as project_count,
      SUM(f.occurrences) as total_occurrences,
      GROUP_CONCAT(DISTINCT p.name) as projects,
      MAX(f.severity) as severity,
      MAX(f.last_seen) as last_seen
    FROM failure_patterns f
    JOIN projects p ON p.id = f.project_id
    WHERE f.remediation_status = 'open'
    GROUP BY f.signature
    HAVING COUNT(DISTINCT f.project_id) >= 2
    ORDER BY project_count DESC, total_occurrences DESC
  `).all() as Array<{
    signature: string;
    project_count: number;
    total_occurrences: number;
    projects: string;
    severity: string;
    last_seen: string;
  }>;
}

/**
 * Get recurring issue categories across sessions.
 */
export function getRecurringIssueCategories(
  db: Database.Database,
  projectId?: string,
): Array<{
  category: string;
  severity: string;
  count: number;
  projects: number;
  recent_title: string;
}> {
  const filter = projectId ? 'WHERE si.project_id = ?' : '';
  const params = projectId ? [projectId] : [];

  return db.prepare(`
    SELECT
      si.category,
      si.severity,
      COUNT(*) as count,
      COUNT(DISTINCT si.project_id) as projects,
      (SELECT title FROM session_issues WHERE category = si.category ORDER BY occurred_at DESC LIMIT 1) as recent_title
    FROM session_issues si
    ${filter}
    GROUP BY si.category, si.severity
    ORDER BY count DESC
  `).all(...params) as Array<{
    category: string;
    severity: string;
    count: number;
    projects: number;
    recent_title: string;
  }>;
}

// ── Phase 2: Advanced Queries ──────────────────────────────────

/**
 * Get detailed information for a single project by name or ID.
 */
export function getProjectDetail(
  db: Database.Database,
  nameOrId: string,
): {
  project: { id: string; name: string; path: string; platform: string; framework_version: string | null; health_status: string; last_synced_at: string | null; created_at: string };
  event_counts: Record<string, number>;
  recent_events: Array<{ event_type: string; status: string; timestamp: string; duration_ms: number | null }>;
  failure_patterns: Array<{ signature: string; occurrences: number; severity: string; last_seen: string; remediation_status: string }>;
  perf_stats: Array<{ gate: string; count: number; avg_ms: number; max_ms: number }>;
  knowledge_count: number;
} | null {
  // Find project by name or ID
  const project = db.prepare(
    'SELECT * FROM projects WHERE id = @q OR name = @q'
  ).get({ q: nameOrId }) as Record<string, unknown> | undefined;

  if (!project) return null;

  const projectId = project.id as string;

  // Event counts by type
  const eventRows = db.prepare(
    'SELECT event_type, COUNT(*) as cnt FROM telemetry_events WHERE project_id = ? GROUP BY event_type'
  ).all(projectId) as Array<{ event_type: string; cnt: number }>;

  const event_counts: Record<string, number> = {};
  for (const row of eventRows) {
    event_counts[row.event_type] = row.cnt;
  }

  // Recent events (last 10)
  const recent_events = db.prepare(
    'SELECT event_type, status, timestamp, duration_ms FROM telemetry_events WHERE project_id = ? ORDER BY timestamp DESC LIMIT 10'
  ).all(projectId) as Array<{ event_type: string; status: string; timestamp: string; duration_ms: number | null }>;

  // Failure patterns
  const failure_patterns = db.prepare(
    'SELECT signature, occurrences, severity, last_seen, remediation_status FROM failure_patterns WHERE project_id = ? ORDER BY occurrences DESC'
  ).all(projectId) as Array<{ signature: string; occurrences: number; severity: string; last_seen: string; remediation_status: string }>;

  // Perf stats by gate
  const perf_stats = db.prepare(
    'SELECT gate, COUNT(*) as count, ROUND(AVG(duration_ms)) as avg_ms, MAX(duration_ms) as max_ms FROM perf_entries WHERE project_id = ? GROUP BY gate ORDER BY avg_ms DESC'
  ).all(projectId) as Array<{ gate: string; count: number; avg_ms: number; max_ms: number }>;

  // Knowledge count
  const kRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM knowledge_entries WHERE project_id = ?'
  ).get(projectId) as { cnt: number };

  return {
    project: {
      id: projectId,
      name: project.name as string,
      path: project.path as string,
      platform: project.platform as string,
      framework_version: project.framework_version as string | null,
      health_status: project.health_status as string,
      last_synced_at: project.last_synced_at as string | null,
      created_at: project.created_at as string,
    },
    event_counts,
    recent_events,
    failure_patterns,
    perf_stats,
    knowledge_count: kRow.cnt,
  };
}

/**
 * Get failure patterns across all projects, optionally filtered.
 */
export function getFailurePatterns(
  db: Database.Database,
  options?: { severity?: string; projectName?: string; limit?: number },
): Array<{
  project_name: string;
  signature: string;
  occurrences: number;
  severity: string;
  last_seen: string;
  detail: string | null;
  remediation_status: string;
}> {
  let sql = `
    SELECT
      p.name as project_name,
      f.signature,
      f.occurrences,
      f.severity,
      f.last_seen,
      f.detail,
      f.remediation_status
    FROM failure_patterns f
    JOIN projects p ON p.id = f.project_id
    WHERE 1=1
  `;
  const params: Record<string, unknown> = {};

  if (options?.severity) {
    sql += ' AND LOWER(f.severity) = @severity';
    params.severity = options.severity.toLowerCase();
  }
  if (options?.projectName) {
    sql += ' AND p.name = @projectName';
    params.projectName = options.projectName;
  }

  sql += ' ORDER BY f.occurrences DESC, f.last_seen DESC';
  sql += ` LIMIT ${options?.limit || 50}`;

  return db.prepare(sql).all(params) as Array<{
    project_name: string;
    signature: string;
    occurrences: number;
    severity: string;
    last_seen: string;
    detail: string | null;
    remediation_status: string;
  }>;
}

/**
 * Get project rankings by a metric.
 */
export function getProjectRankings(
  db: Database.Database,
  metric: 'events' | 'failures' | 'cost' | 'perf',
  limit: number = 10,
): Array<{
  rank: number;
  name: string;
  value: number;
  label: string;
}> {
  let sql: string;
  let label: string;

  switch (metric) {
    case 'events':
      sql = `
        SELECT p.name, COALESCE(COUNT(te.id), 0) as value
        FROM projects p
        LEFT JOIN telemetry_events te ON te.project_id = p.id
        GROUP BY p.id ORDER BY value DESC LIMIT ?
      `;
      label = 'events';
      break;
    case 'failures':
      sql = `
        SELECT p.name, COALESCE(SUM(f.occurrences), 0) as value
        FROM projects p
        LEFT JOIN failure_patterns f ON f.project_id = p.id AND f.remediation_status = 'open'
        GROUP BY p.id ORDER BY value DESC LIMIT ?
      `;
      label = 'open failures';
      break;
    case 'cost':
      sql = `
        SELECT p.name, COALESCE(ROUND(SUM(
          CASE WHEN te.details IS NOT NULL
            THEN json_extract(te.details, '$.cost_usd')
            ELSE 0
          END
        ), 4), 0) as value
        FROM projects p
        LEFT JOIN telemetry_events te ON te.project_id = p.id AND te.event_type = 'forge_run'
        GROUP BY p.id ORDER BY value DESC LIMIT ?
      `;
      label = 'USD spent';
      break;
    case 'perf':
      sql = `
        SELECT p.name, COALESCE(ROUND(AVG(pe.duration_ms)), 0) as value
        FROM projects p
        LEFT JOIN perf_entries pe ON pe.project_id = p.id
        GROUP BY p.id HAVING COUNT(pe.id) > 0 ORDER BY value DESC LIMIT ?
      `;
      label = 'avg ms';
      break;
  }

  const rows = db.prepare(sql).all(limit) as Array<{ name: string; value: number }>;
  return rows.map((row, i) => ({ rank: i + 1, name: row.name, value: row.value, label }));
}

/**
 * Compute KPI metrics for a project (or all projects).
 */
export function computeProjectKpis(
  db: Database.Database,
  projectId?: string,
): {
  total_forge_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  total_gate_passes: number;
  total_gate_failures: number;
  gate_pass_rate: number;
  security_critical: number;
  security_high: number;
  avg_duration_ms: number;
  avg_cost_usd: number;
  total_knowledge: number;
  open_failures: number;
} {
  const projectFilter = projectId ? 'AND te.project_id = ?' : '';
  const params = projectId ? [projectId] : [];

  // Forge run stats
  const forgeRows = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status IN ('fail', 'error') THEN 1 ELSE 0 END) as failed,
      ROUND(AVG(duration_ms)) as avg_duration,
      ROUND(AVG(CASE WHEN details IS NOT NULL THEN json_extract(details, '$.cost_usd') ELSE 0 END), 4) as avg_cost
    FROM telemetry_events te
    WHERE te.event_type = 'forge_run' ${projectFilter}
  `).get(...params) as Record<string, number | null>;

  // Gate stats from details JSON
  const gateRows = db.prepare(`
    SELECT
      SUM(CASE WHEN details IS NOT NULL THEN COALESCE(json_extract(details, '$.gate_passes'), 0) ELSE 0 END) as passes,
      SUM(CASE WHEN details IS NOT NULL THEN COALESCE(json_extract(details, '$.gate_failures'), 0) ELSE 0 END) as failures,
      SUM(CASE WHEN details IS NOT NULL THEN COALESCE(json_extract(details, '$.security_findings.critical'), 0) ELSE 0 END) as sec_critical,
      SUM(CASE WHEN details IS NOT NULL THEN COALESCE(json_extract(details, '$.security_findings.high'), 0) ELSE 0 END) as sec_high
    FROM telemetry_events te
    WHERE te.event_type = 'forge_run' ${projectFilter}
  `).get(...params) as Record<string, number | null>;

  // Knowledge count
  const knowledgeFilter = projectId ? 'WHERE project_id = ?' : '';
  const kRow = db.prepare(`SELECT COUNT(*) as cnt FROM knowledge_entries ${knowledgeFilter}`).get(...params) as { cnt: number };

  // Open failures
  const failFilter = projectId ? 'WHERE project_id = ? AND remediation_status = \'open\'' : 'WHERE remediation_status = \'open\'';
  const fRow = db.prepare(`SELECT COALESCE(SUM(occurrences), 0) as cnt FROM failure_patterns ${failFilter}`).get(...params) as { cnt: number };

  const totalRuns = forgeRows.total ?? 0;
  const successfulRuns = forgeRows.successful ?? 0;
  const failedRuns = forgeRows.failed ?? 0;
  const gatePasses = gateRows.passes ?? 0;
  const gateFailures = gateRows.failures ?? 0;
  const gateTotal = gatePasses + gateFailures;

  return {
    total_forge_runs: totalRuns,
    successful_runs: successfulRuns,
    failed_runs: failedRuns,
    success_rate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    total_gate_passes: gatePasses,
    total_gate_failures: gateFailures,
    gate_pass_rate: gateTotal > 0 ? gatePasses / gateTotal : 0,
    security_critical: gateRows.sec_critical ?? 0,
    security_high: gateRows.sec_high ?? 0,
    avg_duration_ms: forgeRows.avg_duration ?? 0,
    avg_cost_usd: forgeRows.avg_cost ?? 0,
    total_knowledge: kRow.cnt,
    open_failures: fRow.cnt,
  };
}

/**
 * Compute health assessment for all projects.
 */
export function computeHealthReport(
  db: Database.Database,
): Array<{
  name: string;
  id: string;
  score: number;
  grade: string;
  issues: string[];
}> {
  const projects = db.prepare('SELECT id, name FROM projects ORDER BY name').all() as Array<{ id: string; name: string }>;

  return projects.map((p) => {
    let score = 100;
    const issues: string[] = [];

    // Check for open critical/high failures
    const criticals = db.prepare(
      "SELECT COALESCE(SUM(occurrences), 0) as cnt FROM failure_patterns WHERE project_id = ? AND severity IN ('critical', 'error') AND remediation_status = 'open'"
    ).get(p.id) as { cnt: number };
    if (criticals.cnt > 0) {
      score -= Math.min(40, criticals.cnt * 10);
      issues.push(`${criticals.cnt} critical/error failure(s)`);
    }

    const highs = db.prepare(
      "SELECT COALESCE(SUM(occurrences), 0) as cnt FROM failure_patterns WHERE project_id = ? AND severity = 'warning' AND remediation_status = 'open'"
    ).get(p.id) as { cnt: number };
    if (highs.cnt > 0) {
      score -= Math.min(20, highs.cnt * 5);
      issues.push(`${highs.cnt} warning(s)`);
    }

    // Check for recent forge run failures
    const recentFails = db.prepare(
      "SELECT COUNT(*) as cnt FROM telemetry_events WHERE project_id = ? AND event_type = 'forge_run' AND status IN ('fail', 'error') AND timestamp > datetime('now', '-7 days')"
    ).get(p.id) as { cnt: number };
    if (recentFails.cnt > 0) {
      score -= Math.min(20, recentFails.cnt * 10);
      issues.push(`${recentFails.cnt} failed forge run(s) in last 7d`);
    }

    // Check stale sync
    const project = db.prepare('SELECT last_synced_at FROM projects WHERE id = ?').get(p.id) as { last_synced_at: string | null };
    if (!project.last_synced_at) {
      score -= 10;
      issues.push('never synced');
    }

    // No telemetry at all
    const evtCount = db.prepare('SELECT COUNT(*) as cnt FROM telemetry_events WHERE project_id = ?').get(p.id) as { cnt: number };
    if (evtCount.cnt === 0) {
      score -= 5;
      issues.push('no telemetry data');
    }

    score = Math.max(0, score);
    let grade: string;
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    return { name: p.name, id: p.id, score, grade, issues };
  });
}

/**
 * Get a summary of all projects with event counts.
 */
export function getProjectSummaries(
  db: Database.Database,
): Array<{
  id: string;
  name: string;
  path: string;
  health_status: string;
  last_synced_at: string | null;
  event_count: number;
  failure_count: number;
}> {
  const rows = db
    .prepare(
      `
    SELECT
      p.id,
      p.name,
      p.path,
      p.health_status,
      p.last_synced_at,
      COALESCE(te.cnt, 0) as event_count,
      COALESCE(fp.cnt, 0) as failure_count
    FROM projects p
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM telemetry_events GROUP BY project_id) te ON te.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM failure_patterns WHERE remediation_status = 'open' GROUP BY project_id) fp ON fp.project_id = p.id
    ORDER BY p.name
  `,
    )
    .all() as Array<{
    id: string;
    name: string;
    path: string;
    health_status: string;
    last_synced_at: string | null;
    event_count: number;
    failure_count: number;
  }>;

  return rows;
}

// ── Phase 6: Remediation CRUD ──────────────────────────────────

/**
 * Insert or update a playbook.
 */
export function upsertPlaybook(db: Database.Database, playbook: PlaybookRecord): void {
  db.prepare(`
    INSERT INTO playbooks (id, name, description, category, trigger_pattern, steps, auto_applicable, updated_at)
    VALUES (@id, @name, @description, @category, @trigger_pattern, @steps, @auto_applicable, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = @name,
      description = @description,
      category = @category,
      trigger_pattern = @trigger_pattern,
      steps = @steps,
      auto_applicable = @auto_applicable,
      updated_at = datetime('now')
  `).run({
    id: playbook.id,
    name: playbook.name,
    description: playbook.description || null,
    category: playbook.category,
    trigger_pattern: playbook.trigger_pattern,
    steps: playbook.steps,
    auto_applicable: playbook.auto_applicable ?? 0,
  });
}

/**
 * Get all playbooks, optionally filtered by category.
 */
export function getPlaybooks(
  db: Database.Database,
  category?: string,
): Array<PlaybookRecord & { success_count: number; failure_count: number; created_at: string }> {
  const sql = category
    ? 'SELECT * FROM playbooks WHERE category = ? ORDER BY name'
    : 'SELECT * FROM playbooks ORDER BY name';
  const params = category ? [category] : [];
  return db.prepare(sql).all(...params) as Array<PlaybookRecord & { success_count: number; failure_count: number; created_at: string }>;
}

/**
 * Find playbooks matching a failure signature.
 */
export function matchPlaybooks(
  db: Database.Database,
  signature: string,
): Array<PlaybookRecord & { success_count: number; failure_count: number }> {
  return db.prepare(`
    SELECT * FROM playbooks
    WHERE ? LIKE '%' || trigger_pattern || '%'
       OR trigger_pattern LIKE '%' || ? || '%'
       OR ? GLOB trigger_pattern
    ORDER BY success_count DESC
  `).all(signature, signature, signature) as Array<PlaybookRecord & { success_count: number; failure_count: number }>;
}

/**
 * Create a remediation record.
 */
export function insertRemediation(db: Database.Database, remediation: RemediationRecord): void {
  db.prepare(`
    INSERT OR IGNORE INTO remediations (id, project_id, failure_signature, playbook_id, status, priority, title, description, steps, auto_applied)
    VALUES (@id, @project_id, @failure_signature, @playbook_id, @status, @priority, @title, @description, @steps, @auto_applied)
  `).run({
    id: remediation.id,
    project_id: remediation.project_id,
    failure_signature: remediation.failure_signature,
    playbook_id: remediation.playbook_id || null,
    status: remediation.status || 'pending',
    priority: remediation.priority || 'medium',
    title: remediation.title,
    description: remediation.description || null,
    steps: remediation.steps || null,
    auto_applied: remediation.auto_applied ?? 0,
  });
}

/**
 * Update remediation status.
 */
export function updateRemediationStatus(
  db: Database.Database,
  id: string,
  status: string,
  result?: string,
): void {
  const now = new Date().toISOString();
  if (status === 'in_progress') {
    db.prepare('UPDATE remediations SET status = ?, started_at = ? WHERE id = ?').run(status, now, id);
  } else if (status === 'completed' || status === 'failed') {
    db.prepare('UPDATE remediations SET status = ?, completed_at = ?, result = ? WHERE id = ?').run(status, now, result || null, id);
  } else {
    db.prepare('UPDATE remediations SET status = ? WHERE id = ?').run(status, id);
  }
}

/**
 * Get remediations, optionally filtered.
 */
export function getRemediations(
  db: Database.Database,
  options?: { projectId?: string; status?: string; limit?: number },
): Array<RemediationRecord & { project_name: string; created_at: string; started_at: string | null; completed_at: string | null }> {
  let sql = `
    SELECT r.*, p.name as project_name
    FROM remediations r
    JOIN projects p ON p.id = r.project_id
    WHERE 1=1
  `;
  const params: Record<string, unknown> = {};

  if (options?.projectId) {
    sql += ' AND r.project_id = @projectId';
    params.projectId = options.projectId;
  }
  if (options?.status) {
    sql += ' AND r.status = @status';
    params.status = options.status;
  }

  sql += ' ORDER BY r.created_at DESC';
  sql += ` LIMIT ${options?.limit || 50}`;

  return db.prepare(sql).all(params) as Array<RemediationRecord & { project_name: string; created_at: string; started_at: string | null; completed_at: string | null }>;
}

/**
 * Get remediation statistics.
 */
export function getRemediationStats(
  db: Database.Database,
): {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  auto_applied: number;
  avg_resolution_hours: number;
} {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN auto_applied = 1 THEN 1 ELSE 0 END) as auto_applied,
      AVG(CASE
        WHEN status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
        THEN (julianday(completed_at) - julianday(started_at)) * 24
        ELSE NULL
      END) as avg_hours
    FROM remediations
  `).get() as Record<string, number | null>;

  return {
    total: row.total ?? 0,
    pending: row.pending ?? 0,
    in_progress: row.in_progress ?? 0,
    completed: row.completed ?? 0,
    failed: row.failed ?? 0,
    auto_applied: row.auto_applied ?? 0,
    avg_resolution_hours: row.avg_hours ?? 0,
  };
}

/**
 * Record playbook outcome (success or failure).
 */
export function recordPlaybookOutcome(db: Database.Database, playbookId: string, success: boolean): void {
  if (success) {
    db.prepare('UPDATE playbooks SET success_count = success_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(playbookId);
  } else {
    db.prepare('UPDATE playbooks SET failure_count = failure_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(playbookId);
  }
}

/**
 * Update failure pattern remediation_status.
 */
export function updateFailureRemediationStatus(
  db: Database.Database,
  projectId: string,
  signature: string,
  status: string,
): void {
  db.prepare(
    'UPDATE failure_patterns SET remediation_status = ? WHERE project_id = ? AND signature = ?'
  ).run(status, projectId, signature);
}

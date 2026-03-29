import Database from "better-sqlite3";
import path from "path";
import { mkdir } from "fs/promises";
import type { Confidence, EvidenceSource, KnowledgeEntry, KnowledgeScope } from "../knowledge/memory-gate.js";

let db: Database.Database | null = null;

/**
 * Initialize SQLite database with schema.
 */
export async function initDatabase(
  dbPath?: string
): Promise<Database.Database> {
  const resolvedPath =
    dbPath ||
    process.env.SKILLFOUNDRY_DB_PATH ||
    path.join(import.meta.dirname, "..", "..", "data", "skillfoundry.db");

  await mkdir(path.dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath, {});
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS known_quirks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      framework TEXT NOT NULL,
      version_range TEXT NOT NULL DEFAULT '*',
      quirk TEXT NOT NULL,
      fix TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL CHECK(confidence IN ('verified', 'observed')),
      evidence_source TEXT NOT NULL,
      evidence_summary TEXT NOT NULL DEFAULT '',
      discovered_at TEXT NOT NULL,
      discovered_in TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quirks_framework ON known_quirks(framework);
    CREATE INDEX IF NOT EXISTS idx_quirks_confidence ON known_quirks(confidence);

    CREATE TABLE IF NOT EXISTS fleet_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      last_assessed_at TEXT,
      last_harvest_at TEXT NOT NULL DEFAULT (datetime('now')),
      assessment_score REAL,
      test_count INTEGER NOT NULL DEFAULT 0,
      platforms TEXT NOT NULL DEFAULT '[]',
      framework_version TEXT,
      has_forge_sessions INTEGER NOT NULL DEFAULT 0,
      has_memory_bank INTEGER NOT NULL DEFAULT 0,
      instruction_file_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(app_path)
    );

    CREATE INDEX IF NOT EXISTS idx_fleet_app ON fleet_health(app_name);

    CREATE TABLE IF NOT EXISTS session_recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('decision', 'correction', 'error', 'fact', 'pattern')),
      scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project', 'universal')),
      content TEXT NOT NULL,
      context TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recordings_app ON session_recordings(app_name);
    CREATE INDEX IF NOT EXISTS idx_recordings_type ON session_recordings(entry_type);
    CREATE INDEX IF NOT EXISTS idx_recordings_scope ON session_recordings(scope);

    CREATE TABLE IF NOT EXISTS harvest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      apps_scanned INTEGER NOT NULL DEFAULT 0,
      apps_with_data INTEGER NOT NULL DEFAULT 0,
      total_logs_processed INTEGER NOT NULL DEFAULT 0,
      new_quirks_found INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed'))
    );

    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      session_date TEXT,
      harvested_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_commands INTEGER,
      total_failures INTEGER,
      error_signature TEXT,
      forge_log_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_app ON session_logs(app_name);

    CREATE TABLE IF NOT EXISTS dynamic_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      domain TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'guardrails_pending', 'testing', 'certified', 'failed')),
      input_schema TEXT NOT NULL DEFAULT '{}',
      output_schema TEXT NOT NULL DEFAULT '{}',
      scope TEXT NOT NULL DEFAULT '[]',
      out_of_scope TEXT NOT NULL DEFAULT '[]',
      guardrails TEXT NOT NULL DEFAULT '[]',
      test_results TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      language TEXT NOT NULL DEFAULT 'en',
      target_models TEXT NOT NULL DEFAULT '[]',
      compliance_frameworks TEXT NOT NULL DEFAULT '[]',
      version TEXT NOT NULL DEFAULT '1.0.0',
      exported_content TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      certified_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_skills_status ON dynamic_skills(status);
    CREATE INDEX IF NOT EXISTS idx_skills_name ON dynamic_skills(name);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      platform TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_date TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      user_message_count INTEGER NOT NULL DEFAULT 0,
      assistant_message_count INTEGER NOT NULL DEFAULT 0,
      tool_use_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      duration_minutes REAL,
      file_path TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      parsed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_path, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_transcripts_app ON session_transcripts(app_name);
    CREATE INDEX IF NOT EXISTS idx_transcripts_platform ON session_transcripts(platform);
    CREATE INDEX IF NOT EXISTS idx_transcripts_date ON session_transcripts(session_date);

    CREATE TABLE IF NOT EXISTS platform_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      platform TEXT NOT NULL,
      session_id TEXT,
      insight_type TEXT NOT NULL CHECK(insight_type IN ('error', 'fix', 'pattern', 'correction', 'tool_failure', 'dependency_issue', 'security_finding', 'performance_issue')),
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
      content TEXT NOT NULL,
      context TEXT,
      file_reference TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
      harvested_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_path, platform, content)
    );

    CREATE INDEX IF NOT EXISTS idx_insights_app ON platform_insights(app_name);
    CREATE INDEX IF NOT EXISTS idx_insights_type ON platform_insights(insight_type);
    CREATE INDEX IF NOT EXISTS idx_insights_severity ON platform_insights(severity);
    CREATE INDEX IF NOT EXISTS idx_insights_platform ON platform_insights(platform);

    CREATE TABLE IF NOT EXISTS project_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN (
        'scratchpad', 'memory_bank', 'genesis_prd', 'story',
        'claude_md', 'agent_protocol', 'known_deviations',
        'anti_patterns', 'backup_snapshot'
      )),
      artifact_path TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      content_size_bytes INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      harvested_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(app_path, artifact_type, artifact_path)
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_app ON project_artifacts(app_name);
    CREATE INDEX IF NOT EXISTS idx_artifacts_type ON project_artifacts(artifact_type);

    CREATE TABLE IF NOT EXISTS deviation_rules (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      pattern_description TEXT NOT NULL,
      prevention TEXT NOT NULL,
      responsible_agent TEXT,
      detection_regex TEXT,
      file_glob TEXT,
      severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
      active INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'catalog',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deviation_category ON deviation_rules(category);
    CREATE INDEX IF NOT EXISTS idx_deviation_severity ON deviation_rules(severity);

    CREATE TABLE IF NOT EXISTS correction_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_hash TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      project_count INTEGER NOT NULL DEFAULT 1,
      projects TEXT NOT NULL DEFAULT '[]',
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      auto_rule_generated INTEGER NOT NULL DEFAULT 0,
      generated_rule_id TEXT
    );

    CREATE TABLE IF NOT EXISTS project_health_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_path TEXT NOT NULL,
      run_id INTEGER NOT NULL,
      scan_date TEXT NOT NULL DEFAULT (datetime('now')),
      security_critical INTEGER NOT NULL DEFAULT 0,
      security_high INTEGER NOT NULL DEFAULT 0,
      security_medium INTEGER NOT NULL DEFAULT 0,
      security_low INTEGER NOT NULL DEFAULT 0,
      contract_frontend_calls INTEGER NOT NULL DEFAULT 0,
      contract_backend_routes INTEGER NOT NULL DEFAULT 0,
      contract_matched INTEGER NOT NULL DEFAULT 0,
      contract_mismatches INTEGER NOT NULL DEFAULT 0,
      deviation_violations INTEGER NOT NULL DEFAULT 0,
      import_errors INTEGER NOT NULL DEFAULT 0,
      health_grade TEXT,
      health_score REAL,
      UNIQUE(app_name, run_id)
    );

    CREATE INDEX IF NOT EXISTS idx_health_app ON project_health_scores(app_name);
    CREATE INDEX IF NOT EXISTS idx_health_date ON project_health_scores(scan_date);

    CREATE TABLE IF NOT EXISTS nightly_harvest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
      apps_scanned INTEGER NOT NULL DEFAULT 0,
      sessions_parsed INTEGER NOT NULL DEFAULT 0,
      insights_extracted INTEGER NOT NULL DEFAULT 0,
      new_quirks INTEGER NOT NULL DEFAULT 0,
      security_findings INTEGER NOT NULL DEFAULT 0,
      contract_mismatches INTEGER NOT NULL DEFAULT 0,
      report_path TEXT,
      error_message TEXT
    );
  `);

  // Migrations: add columns to existing tables
  try {
    db.exec(`ALTER TABLE known_quirks ADD COLUMN scope TEXT NOT NULL DEFAULT 'universal' CHECK(scope IN ('project', 'universal'))`);
  } catch { /* column already exists */ }

  return db;
}

/**
 * Get the database instance (must call initDatabase first).
 */
export function getDatabase(): Database.Database {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

// ─── Quirk Operations ───────────────────────────────────────────────────────

export function insertQuirk(entry: KnowledgeEntry): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO known_quirks (framework, version_range, quirk, fix, confidence, evidence_source, evidence_summary, discovered_at, discovered_in, scope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    entry.framework,
    entry.versionRange,
    entry.quirk,
    entry.fix,
    entry.confidence,
    entry.evidenceSource,
    entry.evidenceSummary,
    entry.discoveredAt,
    entry.discoveredIn || null,
    entry.scope || "universal"
  );
  return result.lastInsertRowid as number;
}

export function queryQuirks(filters?: {
  framework?: string;
  confidence?: Confidence;
  limit?: number;
}): KnowledgeEntry[] {
  const db = getDatabase();
  let sql = "SELECT * FROM known_quirks WHERE 1=1";
  const params: unknown[] = [];

  if (filters?.framework) {
    sql += " AND framework = ?";
    params.push(filters.framework);
  }
  if (filters?.confidence) {
    sql += " AND confidence = ?";
    params.push(filters.confidence);
  }

  sql += " ORDER BY created_at DESC";

  if (filters?.limit) {
    sql += " LIMIT ?";
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToEntry);
}

export function promoteQuirk(
  id: number,
  evidenceSource: EvidenceSource,
  evidenceSummary: string
): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    UPDATE known_quirks
    SET confidence = 'verified', evidence_source = ?, evidence_summary = ?, updated_at = datetime('now')
    WHERE id = ? AND confidence = 'observed'
  `).run(evidenceSource, evidenceSummary, id);
  return result.changes > 0;
}

export function quirkExists(framework: string, quirk: string): boolean {
  const db = getDatabase();
  const row = db.prepare(
    "SELECT 1 FROM known_quirks WHERE framework = ? AND quirk = ? LIMIT 1"
  ).get(framework, quirk);
  return !!row;
}

function rowToEntry(row: Record<string, unknown>): KnowledgeEntry {
  return {
    framework: row.framework as string,
    versionRange: row.version_range as string,
    quirk: row.quirk as string,
    fix: row.fix as string,
    confidence: row.confidence as Confidence,
    evidenceSource: row.evidence_source as EvidenceSource,
    evidenceSummary: row.evidence_summary as string,
    discoveredAt: row.discovered_at as string,
    discoveredIn: row.discovered_in as string | undefined,
    scope: (row.scope as KnowledgeScope) || "universal",
  };
}

// ─── Harvest Run Operations ─────────────────────────────────────────────────

export function startHarvestRun(): number {
  const db = getDatabase();
  const result = db.prepare(
    "INSERT INTO harvest_runs (started_at) VALUES (datetime('now'))"
  ).run();
  return result.lastInsertRowid as number;
}

export function completeHarvestRun(
  runId: number,
  stats: { appsScanned: number; appsWithData: number; totalLogs: number; newQuirks: number }
): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE harvest_runs
    SET completed_at = datetime('now'), apps_scanned = ?, apps_with_data = ?,
        total_logs_processed = ?, new_quirks_found = ?, status = 'completed'
    WHERE id = ?
  `).run(stats.appsScanned, stats.appsWithData, stats.totalLogs, stats.newQuirks, runId);
}

export function insertSessionLog(data: {
  appName: string;
  platform: string;
  sessionDate?: string;
  totalCommands?: number;
  totalFailures?: number;
  errorSignature?: string;
  forgeLogCount: number;
}): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO session_logs (app_name, platform, session_date, total_commands, total_failures, error_signature, forge_log_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.appName,
    data.platform,
    data.sessionDate || null,
    data.totalCommands || null,
    data.totalFailures || null,
    data.errorSignature || null,
    data.forgeLogCount
  );
}

// ─── Dynamic Skill Operations ───────────────────────────────────────────────

import type { DynamicSkill } from "../agents/skill-factory.js";

export function insertDynamicSkill(skill: DynamicSkill): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO dynamic_skills
    (id, name, description, domain, risk_level, status, input_schema, output_schema,
     scope, out_of_scope, guardrails, test_results, tags, language, target_models,
     compliance_frameworks, version, exported_content, created_at, certified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    skill.id,
    skill.name,
    skill.description,
    skill.domain,
    skill.riskLevel,
    skill.status,
    JSON.stringify(skill.inputSchema),
    JSON.stringify(skill.outputSchema),
    JSON.stringify(skill.scope),
    JSON.stringify(skill.outOfScope),
    JSON.stringify(skill.guardrails),
    skill.testResults ? JSON.stringify(skill.testResults) : null,
    JSON.stringify(skill.tags),
    skill.language,
    JSON.stringify(skill.targetModels),
    JSON.stringify(skill.complianceFrameworks),
    skill.version,
    skill.exportedContent,
    skill.createdAt,
    skill.certifiedAt
  );
}

export function getCertifiedSkills(): DynamicSkill[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM dynamic_skills WHERE status = 'certified' ORDER BY created_at DESC"
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToDynamicSkill);
}

export function getDynamicSkill(nameOrId: string): DynamicSkill | null {
  const db = getDatabase();
  const row = db.prepare(
    "SELECT * FROM dynamic_skills WHERE id = ? OR name = ? LIMIT 1"
  ).get(nameOrId, nameOrId) as Record<string, unknown> | undefined;
  return row ? rowToDynamicSkill(row) : null;
}

export function listDynamicSkills(): DynamicSkill[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM dynamic_skills ORDER BY created_at DESC"
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToDynamicSkill);
}

function rowToDynamicSkill(row: Record<string, unknown>): DynamicSkill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    domain: row.domain as DynamicSkill["domain"],
    riskLevel: row.risk_level as DynamicSkill["riskLevel"],
    status: row.status as DynamicSkill["status"],
    inputSchema: JSON.parse(row.input_schema as string),
    outputSchema: JSON.parse(row.output_schema as string),
    scope: JSON.parse(row.scope as string),
    outOfScope: JSON.parse(row.out_of_scope as string),
    guardrails: JSON.parse(row.guardrails as string),
    testResults: row.test_results ? JSON.parse(row.test_results as string) : null,
    tags: JSON.parse(row.tags as string),
    language: row.language as string,
    targetModels: JSON.parse(row.target_models as string),
    complianceFrameworks: JSON.parse(row.compliance_frameworks as string),
    version: row.version as string,
    exportedContent: row.exported_content as string | null,
    createdAt: row.created_at as string,
    certifiedAt: row.certified_at as string | null,
  };
}

// ─── Fleet Health Operations ──────────────────────────────────────────────

export interface FleetHealthRecord {
  appName: string;
  appPath: string;
  lastAssessedAt: string | null;
  lastHarvestAt: string;
  assessmentScore: number | null;
  testCount: number;
  platforms: string[];
  frameworkVersion: string | null;
  hasForgeSession: boolean;
  hasMemoryBank: boolean;
  instructionFileCount: number;
}

export function upsertFleetHealth(record: FleetHealthRecord): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO fleet_health (app_name, app_path, last_assessed_at, assessment_score, test_count,
      platforms, framework_version, has_forge_sessions, has_memory_bank, instruction_file_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_path) DO UPDATE SET
      last_harvest_at = datetime('now'),
      last_assessed_at = COALESCE(excluded.last_assessed_at, fleet_health.last_assessed_at),
      assessment_score = COALESCE(excluded.assessment_score, fleet_health.assessment_score),
      test_count = excluded.test_count,
      platforms = excluded.platforms,
      framework_version = excluded.framework_version,
      has_forge_sessions = excluded.has_forge_sessions,
      has_memory_bank = excluded.has_memory_bank,
      instruction_file_count = excluded.instruction_file_count
  `).run(
    record.appName,
    record.appPath,
    record.lastAssessedAt,
    record.assessmentScore,
    record.testCount,
    JSON.stringify(record.platforms),
    record.frameworkVersion,
    record.hasForgeSession ? 1 : 0,
    record.hasMemoryBank ? 1 : 0,
    record.instructionFileCount
  );
}

export function getFleetHealth(): FleetHealthRecord[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT * FROM fleet_health ORDER BY app_name").all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    appName: r.app_name as string,
    appPath: r.app_path as string,
    lastAssessedAt: r.last_assessed_at as string | null,
    lastHarvestAt: r.last_harvest_at as string,
    assessmentScore: r.assessment_score as number | null,
    testCount: r.test_count as number,
    platforms: JSON.parse(r.platforms as string),
    frameworkVersion: r.framework_version as string | null,
    hasForgeSession: !!(r.has_forge_sessions as number),
    hasMemoryBank: !!(r.has_memory_bank as number),
    instructionFileCount: r.instruction_file_count as number,
  }));
}

// ─── Session Recording Operations ─────────────────────────────────────────

export interface SessionRecording {
  id?: number;
  appName: string;
  appPath: string;
  entryType: "decision" | "correction" | "error" | "fact" | "pattern";
  scope: KnowledgeScope;
  content: string;
  context?: string;
  tags: string[];
  recordedAt?: string;
  sessionId?: string;
}

export function insertSessionRecording(recording: SessionRecording): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO session_recordings (app_name, app_path, entry_type, scope, content, context, tags, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recording.appName,
    recording.appPath,
    recording.entryType,
    recording.scope,
    recording.content,
    recording.context || null,
    JSON.stringify(recording.tags),
    recording.sessionId || null
  );
  return result.lastInsertRowid as number;
}

export function querySessionRecordings(filters?: {
  appName?: string;
  entryType?: string;
  scope?: KnowledgeScope;
  limit?: number;
}): SessionRecording[] {
  const db = getDatabase();
  let sql = "SELECT * FROM session_recordings WHERE 1=1";
  const params: unknown[] = [];

  if (filters?.appName) { sql += " AND app_name = ?"; params.push(filters.appName); }
  if (filters?.entryType) { sql += " AND entry_type = ?"; params.push(filters.entryType); }
  if (filters?.scope) { sql += " AND scope = ?"; params.push(filters.scope); }

  sql += " ORDER BY recorded_at DESC";
  if (filters?.limit) { sql += " LIMIT ?"; params.push(filters.limit); }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    appName: r.app_name as string,
    appPath: r.app_path as string,
    entryType: r.entry_type as SessionRecording["entryType"],
    scope: r.scope as KnowledgeScope,
    content: r.content as string,
    context: r.context as string | undefined,
    tags: JSON.parse(r.tags as string),
    recordedAt: r.recorded_at as string,
    sessionId: r.session_id as string | undefined,
  }));
}

// ─── Session Transcript Operations ─────────────────────────────────────────

export interface SessionTranscriptRecord {
  appName: string;
  appPath: string;
  platform: string;
  sessionId: string;
  sessionDate: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolUseCount: number;
  errorCount: number;
  durationMinutes: number | null;
  filePath: string;
  fileSizeBytes: number;
}

export function upsertSessionTranscript(record: SessionTranscriptRecord): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO session_transcripts (app_name, app_path, platform, session_id, session_date,
      message_count, user_message_count, assistant_message_count, tool_use_count, error_count,
      duration_minutes, file_path, file_size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_path, session_id) DO UPDATE SET
      message_count = excluded.message_count,
      user_message_count = excluded.user_message_count,
      assistant_message_count = excluded.assistant_message_count,
      tool_use_count = excluded.tool_use_count,
      error_count = excluded.error_count,
      duration_minutes = excluded.duration_minutes,
      file_size_bytes = excluded.file_size_bytes,
      parsed_at = datetime('now')
  `).run(
    record.appName, record.appPath, record.platform, record.sessionId,
    record.sessionDate, record.messageCount, record.userMessageCount,
    record.assistantMessageCount, record.toolUseCount, record.errorCount,
    record.durationMinutes, record.filePath, record.fileSizeBytes
  );
}

export function getSessionTranscripts(filters?: {
  appName?: string;
  platform?: string;
  limit?: number;
}): SessionTranscriptRecord[] {
  const db = getDatabase();
  let sql = "SELECT * FROM session_transcripts WHERE 1=1";
  const params: unknown[] = [];
  if (filters?.appName) { sql += " AND app_name = ?"; params.push(filters.appName); }
  if (filters?.platform) { sql += " AND platform = ?"; params.push(filters.platform); }
  sql += " ORDER BY session_date DESC";
  if (filters?.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  return db.prepare(sql).all(...params) as SessionTranscriptRecord[];
}

export function transcriptExists(appPath: string, sessionId: string): boolean {
  const db = getDatabase();
  const row = db.prepare(
    "SELECT 1 FROM session_transcripts WHERE app_path = ? AND session_id = ? LIMIT 1"
  ).get(appPath, sessionId);
  return !!row;
}

// ─── Platform Insight Operations ──────────────────────────────────────────

export interface PlatformInsightRecord {
  appName: string;
  appPath: string;
  platform: string;
  sessionId: string | null;
  insightType: "error" | "fix" | "pattern" | "correction" | "tool_failure" | "dependency_issue" | "security_finding" | "performance_issue";
  severity: "critical" | "high" | "medium" | "low" | "info";
  content: string;
  context: string | null;
  fileReference: string | null;
  tags: string[];
}

export function insertPlatformInsight(insight: PlatformInsightRecord): boolean {
  const db = getDatabase();
  try {
    db.prepare(`
      INSERT INTO platform_insights (app_name, app_path, platform, session_id, insight_type,
        severity, content, context, file_reference, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_path, platform, content) DO NOTHING
    `).run(
      insight.appName, insight.appPath, insight.platform, insight.sessionId,
      insight.insightType, insight.severity, insight.content, insight.context,
      insight.fileReference, JSON.stringify(insight.tags)
    );
    return true;
  } catch {
    return false;
  }
}

export function queryPlatformInsights(filters?: {
  appName?: string;
  platform?: string;
  insightType?: string;
  severity?: string;
  limit?: number;
}): PlatformInsightRecord[] {
  const db = getDatabase();
  let sql = "SELECT * FROM platform_insights WHERE 1=1";
  const params: unknown[] = [];
  if (filters?.appName) { sql += " AND app_name = ?"; params.push(filters.appName); }
  if (filters?.platform) { sql += " AND platform = ?"; params.push(filters.platform); }
  if (filters?.insightType) { sql += " AND insight_type = ?"; params.push(filters.insightType); }
  if (filters?.severity) { sql += " AND severity = ?"; params.push(filters.severity); }
  sql += " ORDER BY discovered_at DESC";
  if (filters?.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    appName: r.app_name as string,
    appPath: r.app_path as string,
    platform: r.platform as string,
    sessionId: r.session_id as string | null,
    insightType: r.insight_type as PlatformInsightRecord["insightType"],
    severity: r.severity as PlatformInsightRecord["severity"],
    content: r.content as string,
    context: r.context as string | null,
    fileReference: r.file_reference as string | null,
    tags: JSON.parse(r.tags as string),
  }));
}

// ─── Project Artifact Operations ─────────────────────────────────────────

export type ProjectArtifactType =
  | "scratchpad" | "memory_bank" | "genesis_prd" | "story"
  | "claude_md" | "agent_protocol" | "known_deviations"
  | "anti_patterns" | "backup_snapshot";

export interface ProjectArtifactRecord {
  appName: string;
  appPath: string;
  artifactType: ProjectArtifactType;
  artifactPath: string;
  title: string | null;
  content: string;
  contentSizeBytes: number;
  metadata: Record<string, unknown>;
}

export function upsertProjectArtifact(artifact: ProjectArtifactRecord): boolean {
  const db = getDatabase();
  try {
    db.prepare(`
      INSERT INTO project_artifacts (app_name, app_path, artifact_type, artifact_path,
        title, content, content_size_bytes, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_path, artifact_type, artifact_path) DO UPDATE SET
        content = excluded.content,
        content_size_bytes = excluded.content_size_bytes,
        metadata = excluded.metadata,
        harvested_at = datetime('now')
    `).run(
      artifact.appName, artifact.appPath, artifact.artifactType, artifact.artifactPath,
      artifact.title, artifact.content, artifact.contentSizeBytes,
      JSON.stringify(artifact.metadata)
    );
    return true;
  } catch {
    return false;
  }
}

export function queryProjectArtifacts(filters?: {
  appName?: string;
  artifactType?: ProjectArtifactType;
  limit?: number;
}): ProjectArtifactRecord[] {
  const db = getDatabase();
  let sql = "SELECT * FROM project_artifacts WHERE 1=1";
  const params: unknown[] = [];
  if (filters?.appName) { sql += " AND app_name = ?"; params.push(filters.appName); }
  if (filters?.artifactType) { sql += " AND artifact_type = ?"; params.push(filters.artifactType); }
  sql += " ORDER BY harvested_at DESC";
  if (filters?.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    appName: r.app_name as string,
    appPath: r.app_path as string,
    artifactType: r.artifact_type as ProjectArtifactType,
    artifactPath: r.artifact_path as string,
    title: r.title as string | null,
    content: r.content as string,
    contentSizeBytes: r.content_size_bytes as number,
    metadata: JSON.parse(r.metadata as string),
  }));
}

export function getArtifactStats(): Record<string, { count: number; totalBytes: number }> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT artifact_type, COUNT(*) as count, SUM(content_size_bytes) as total_bytes
    FROM project_artifacts GROUP BY artifact_type
  `).all() as Array<{ artifact_type: string; count: number; total_bytes: number }>;
  const stats: Record<string, { count: number; totalBytes: number }> = {};
  for (const r of rows) {
    stats[r.artifact_type] = { count: r.count, totalBytes: r.total_bytes };
  }
  return stats;
}

// ─── Nightly Harvest Run Operations ───────────────────────────────────────

export function startNightlyHarvestRun(): number {
  const db = getDatabase();
  const result = db.prepare(
    "INSERT INTO nightly_harvest_runs (started_at) VALUES (datetime('now'))"
  ).run();
  return result.lastInsertRowid as number;
}

export function completeNightlyHarvestRun(
  runId: number,
  stats: {
    appsScanned: number;
    sessionsParsed: number;
    insightsExtracted: number;
    newQuirks: number;
    securityFindings: number;
    contractMismatches: number;
    reportPath: string | null;
  }
): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE nightly_harvest_runs SET
      completed_at = datetime('now'), status = 'completed',
      apps_scanned = ?, sessions_parsed = ?, insights_extracted = ?,
      new_quirks = ?, security_findings = ?, contract_mismatches = ?, report_path = ?
    WHERE id = ?
  `).run(
    stats.appsScanned, stats.sessionsParsed, stats.insightsExtracted,
    stats.newQuirks, stats.securityFindings, stats.contractMismatches,
    stats.reportPath, runId
  );
}

export function failNightlyHarvestRun(runId: number, error: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE nightly_harvest_runs SET completed_at = datetime('now'), status = 'failed', error_message = ?
    WHERE id = ?
  `).run(error, runId);
}

// ─── Deviation Rule Operations ───────────────────────────────────────────

export interface DeviationRule {
  id: string;
  category: string;
  patternDescription: string;
  prevention: string;
  responsibleAgent: string | null;
  detectionRegex: string | null;
  fileGlob: string | null;
  severity: string;
  active: boolean;
  source: string;
}

export function upsertDeviationRule(rule: DeviationRule): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO deviation_rules (id, category, pattern_description, prevention,
      responsible_agent, detection_regex, file_glob, severity, active, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      pattern_description = excluded.pattern_description,
      prevention = excluded.prevention,
      responsible_agent = excluded.responsible_agent,
      detection_regex = excluded.detection_regex,
      file_glob = excluded.file_glob,
      severity = excluded.severity,
      active = excluded.active,
      updated_at = datetime('now')
  `).run(
    rule.id, rule.category, rule.patternDescription, rule.prevention,
    rule.responsibleAgent, rule.detectionRegex, rule.fileGlob,
    rule.severity, rule.active ? 1 : 0, rule.source
  );
}

export function getDeviationRules(filters?: {
  category?: string;
  severity?: string;
  active?: boolean;
}): DeviationRule[] {
  const db = getDatabase();
  let sql = "SELECT * FROM deviation_rules WHERE 1=1";
  const params: unknown[] = [];
  if (filters?.category) { sql += " AND category = ?"; params.push(filters.category); }
  if (filters?.severity) { sql += " AND severity = ?"; params.push(filters.severity); }
  if (filters?.active !== undefined) { sql += " AND active = ?"; params.push(filters.active ? 1 : 0); }
  sql += " ORDER BY category, id";
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    category: r.category as string,
    patternDescription: r.pattern_description as string,
    prevention: r.prevention as string,
    responsibleAgent: r.responsible_agent as string | null,
    detectionRegex: r.detection_regex as string | null,
    fileGlob: r.file_glob as string | null,
    severity: r.severity as string,
    active: r.active === 1,
    source: r.source as string,
  }));
}

export function getDeviationRuleCount(): number {
  const db = getDatabase();
  return (db.prepare("SELECT COUNT(*) as c FROM deviation_rules WHERE active = 1").get() as { c: number }).c;
}

// ─── Correction Pattern Operations ───────────────────────────────────────

export interface CorrectionPattern {
  patternHash: string;
  description: string;
  occurrenceCount: number;
  projectCount: number;
  projects: string[];
  autoRuleGenerated: boolean;
  generatedRuleId: string | null;
}

export function upsertCorrectionPattern(pattern: CorrectionPattern): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO correction_patterns (pattern_hash, description, occurrence_count,
      project_count, projects, auto_rule_generated, generated_rule_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pattern_hash) DO UPDATE SET
      occurrence_count = excluded.occurrence_count,
      project_count = excluded.project_count,
      projects = excluded.projects,
      last_seen = datetime('now'),
      auto_rule_generated = excluded.auto_rule_generated,
      generated_rule_id = excluded.generated_rule_id
  `).run(
    pattern.patternHash, pattern.description, pattern.occurrenceCount,
    pattern.projectCount, JSON.stringify(pattern.projects),
    pattern.autoRuleGenerated ? 1 : 0, pattern.generatedRuleId
  );
}

export function getCorrectionPatterns(minOccurrences = 1): CorrectionPattern[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM correction_patterns WHERE occurrence_count >= ? ORDER BY occurrence_count DESC"
  ).all(minOccurrences) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    patternHash: r.pattern_hash as string,
    description: r.description as string,
    occurrenceCount: r.occurrence_count as number,
    projectCount: r.project_count as number,
    projects: JSON.parse(r.projects as string),
    autoRuleGenerated: r.auto_rule_generated === 1,
    generatedRuleId: r.generated_rule_id as string | null,
  }));
}

// ─── Project Health Score Operations ─────────────────────────────────────

export interface ProjectHealthScore {
  appName: string;
  appPath: string;
  runId: number;
  scanDate: string;
  securityCritical: number;
  securityHigh: number;
  securityMedium: number;
  securityLow: number;
  contractFrontendCalls: number;
  contractBackendRoutes: number;
  contractMatched: number;
  contractMismatches: number;
  deviationViolations: number;
  importErrors: number;
  healthGrade: string | null;
  healthScore: number | null;
}

export function upsertProjectHealthScore(score: ProjectHealthScore): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO project_health_scores (app_name, app_path, run_id, scan_date,
      security_critical, security_high, security_medium, security_low,
      contract_frontend_calls, contract_backend_routes, contract_matched, contract_mismatches,
      deviation_violations, import_errors, health_grade, health_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(app_name, run_id) DO UPDATE SET
      security_critical = excluded.security_critical,
      security_high = excluded.security_high,
      security_medium = excluded.security_medium,
      security_low = excluded.security_low,
      contract_frontend_calls = excluded.contract_frontend_calls,
      contract_backend_routes = excluded.contract_backend_routes,
      contract_matched = excluded.contract_matched,
      contract_mismatches = excluded.contract_mismatches,
      deviation_violations = excluded.deviation_violations,
      import_errors = excluded.import_errors,
      health_grade = excluded.health_grade,
      health_score = excluded.health_score
  `).run(
    score.appName, score.appPath, score.runId, score.scanDate,
    score.securityCritical, score.securityHigh, score.securityMedium, score.securityLow,
    score.contractFrontendCalls, score.contractBackendRoutes,
    score.contractMatched, score.contractMismatches,
    score.deviationViolations, score.importErrors,
    score.healthGrade, score.healthScore
  );
}

export function getProjectHealthHistory(appName: string, limit = 10): ProjectHealthScore[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT * FROM project_health_scores WHERE app_name = ? ORDER BY scan_date DESC LIMIT ?"
  ).all(appName, limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    appName: r.app_name as string,
    appPath: r.app_path as string,
    runId: r.run_id as number,
    scanDate: r.scan_date as string,
    securityCritical: r.security_critical as number,
    securityHigh: r.security_high as number,
    securityMedium: r.security_medium as number,
    securityLow: r.security_low as number,
    contractFrontendCalls: r.contract_frontend_calls as number,
    contractBackendRoutes: r.contract_backend_routes as number,
    contractMatched: r.contract_matched as number,
    contractMismatches: r.contract_mismatches as number,
    deviationViolations: r.deviation_violations as number,
    importErrors: r.import_errors as number,
    healthGrade: r.health_grade as string | null,
    healthScore: r.health_score as number | null,
  }));
}

export function getFleetHealthSummary(): Array<{
  appName: string;
  healthGrade: string | null;
  healthScore: number | null;
  scanDate: string;
}> {
  const db = getDatabase();
  return db.prepare(`
    SELECT app_name, health_grade, health_score, scan_date
    FROM project_health_scores
    WHERE id IN (SELECT MAX(id) FROM project_health_scores GROUP BY app_name)
    ORDER BY health_score ASC
  `).all() as Array<{
    appName: string;
    healthGrade: string | null;
    healthScore: number | null;
    scanDate: string;
  }>;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  db?.close();
  db = null;
}

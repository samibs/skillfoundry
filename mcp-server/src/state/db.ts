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

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  db?.close();
  db = null;
}

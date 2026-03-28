import Database from "better-sqlite3";
import path from "path";
import { mkdir } from "fs/promises";
import type { Confidence, EvidenceSource, KnowledgeEntry } from "../knowledge/memory-gate.js";

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
  `);

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
    INSERT INTO known_quirks (framework, version_range, quirk, fix, confidence, evidence_source, evidence_summary, discovered_at, discovered_in)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    entry.discoveredIn || null
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

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  db?.close();
  db = null;
}

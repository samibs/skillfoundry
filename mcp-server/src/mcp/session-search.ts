/**
 * Session Search — Full-text search across session history using SQLite FTS5.
 *
 * Inspired by Hermes Agent's full-text session search. Indexes all tool
 * responses and session recordings into an FTS5 virtual table for instant
 * keyword search across conversation history.
 *
 * Addresses the "I fixed this before but can't find where" problem by
 * making ALL past tool interactions searchable, not just curated knowledge.
 */

import { getDatabase } from "../state/db.js";

// ── Schema ────────────────────────────────────────────────────────────

/**
 * Create FTS5 virtual tables for full-text search.
 * Must be called after initDatabase().
 */
export function ensureSearchTables(): void {
  const db = getDatabase();

  // FTS5 index for tool response history
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_response_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      response_summary TEXT NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tool_log_session ON tool_response_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_log_tool ON tool_response_log(tool_name);
  `);

  // FTS5 virtual table for full-text search
  // content= uses external content from tool_response_log
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tool_response_fts USING fts5(
      tool_name,
      response_summary,
      content='tool_response_log',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `);

  // FTS5 for session recordings (knowledge base entries)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS session_recordings_fts USING fts5(
      content,
      context,
      tags,
      app_name,
      content='session_recordings',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `);

  // Triggers to keep FTS in sync with base tables
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS tool_log_ai AFTER INSERT ON tool_response_log BEGIN
      INSERT INTO tool_response_fts(rowid, tool_name, response_summary)
      VALUES (new.id, new.tool_name, new.response_summary);
    END;

    CREATE TRIGGER IF NOT EXISTS recordings_ai AFTER INSERT ON session_recordings BEGIN
      INSERT INTO session_recordings_fts(rowid, content, context, tags, app_name)
      VALUES (new.id, new.content, COALESCE(new.context, ''), new.tags, new.app_name);
    END;
  `);
}

// ── Indexing ──────────────────────────────────────────────────────────

/**
 * Log a tool response for full-text indexing.
 * Called from the handler's tracked() wrapper.
 *
 * Stores a truncated summary (first 2000 chars) to keep the DB manageable.
 */
export function indexToolResponse(
  sessionId: string,
  toolName: string,
  responseText: string,
  isError: boolean,
): void {
  try {
    const db = getDatabase();
    // Store first 2000 chars as searchable summary
    const summary = responseText.length > 2000
      ? responseText.slice(0, 2000)
      : responseText;

    db.prepare(`
      INSERT INTO tool_response_log (session_id, tool_name, response_summary, is_error)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, toolName, summary, isError ? 1 : 0);
  } catch {
    // Silently skip if tables don't exist yet
  }
}

/**
 * Rebuild FTS indexes from existing data.
 * Useful after bulk imports or if FTS gets out of sync.
 */
export function rebuildSearchIndexes(): { toolResponses: number; recordings: number } {
  const db = getDatabase();

  // Rebuild tool response FTS
  db.exec("INSERT INTO tool_response_fts(tool_response_fts) VALUES('rebuild')");

  // Rebuild session recordings FTS
  db.exec("INSERT INTO session_recordings_fts(session_recordings_fts) VALUES('rebuild')");

  const toolCount = (db.prepare("SELECT COUNT(*) as c FROM tool_response_log").get() as { c: number }).c;
  const recCount = (db.prepare("SELECT COUNT(*) as c FROM session_recordings").get() as { c: number }).c;

  return { toolResponses: toolCount, recordings: recCount };
}

// ── Search ────────────────────────────────────────────────────────────

export interface SearchResult {
  source: "tool_response" | "session_recording";
  id: number;
  /** Matched text snippet with highlights */
  snippet: string;
  /** Tool name or app name */
  origin: string;
  /** Relevance score (lower = more relevant in FTS5) */
  rank: number;
  /** When this was recorded */
  createdAt: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  /** FTS5 query string (supports AND, OR, NOT, quotes, prefix*) */
  query: string;
  /** Search scope: "all", "tools", "recordings" */
  scope?: "all" | "tools" | "recordings";
  /** Filter by tool name (for tool responses) */
  toolName?: string;
  /** Filter by app name (for session recordings) */
  appName?: string;
  /** Max results (default: 20) */
  limit?: number;
}

/**
 * Full-text search across all session history.
 *
 * Query syntax (FTS5):
 * - Simple words: "prisma migration" — matches both words
 * - Quoted phrases: '"contract mismatch"' — exact phrase
 * - Prefix: "auth*" — matches auth, authentication, authorize
 * - Boolean: "prisma AND migration NOT seed"
 * - Column filter: "tool_name:sf_build"
 */
export function searchHistory(options: SearchOptions): SearchResult[] {
  const db = getDatabase();
  const results: SearchResult[] = [];
  const limit = options.limit || 20;

  // Sanitize query for FTS5 (escape special chars that aren't operators)
  const safeQuery = options.query
    .replace(/[{}[\]()^~\\]/g, " ")
    .trim();

  if (!safeQuery) return [];

  // Search tool responses
  if (options.scope !== "recordings") {
    try {
      let sql = `
        SELECT
          trl.id,
          snippet(tool_response_fts, 1, '»', '«', '...', 40) as snippet,
          trl.tool_name,
          rank,
          trl.created_at,
          trl.is_error,
          trl.session_id
        FROM tool_response_fts
        JOIN tool_response_log trl ON trl.id = tool_response_fts.rowid
        WHERE tool_response_fts MATCH ?
      `;
      const params: unknown[] = [safeQuery];

      if (options.toolName) {
        sql += " AND trl.tool_name = ?";
        params.push(options.toolName);
      }

      sql += " ORDER BY rank LIMIT ?";
      params.push(limit);

      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

      for (const row of rows) {
        results.push({
          source: "tool_response",
          id: row.id as number,
          snippet: row.snippet as string,
          origin: row.tool_name as string,
          rank: row.rank as number,
          createdAt: row.created_at as string,
          metadata: {
            sessionId: row.session_id,
            isError: row.is_error === 1,
          },
        });
      }
    } catch {
      // FTS table might not exist yet
    }
  }

  // Search session recordings
  if (options.scope !== "tools") {
    try {
      let sql = `
        SELECT
          sr.id,
          snippet(session_recordings_fts, 0, '»', '«', '...', 40) as snippet,
          sr.app_name,
          rank,
          sr.recorded_at,
          sr.entry_type,
          sr.scope,
          sr.tags
        FROM session_recordings_fts
        JOIN session_recordings sr ON sr.id = session_recordings_fts.rowid
        WHERE session_recordings_fts MATCH ?
      `;
      const params: unknown[] = [safeQuery];

      if (options.appName) {
        sql += " AND sr.app_name = ?";
        params.push(options.appName);
      }

      sql += " ORDER BY rank LIMIT ?";
      params.push(limit);

      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

      for (const row of rows) {
        results.push({
          source: "session_recording",
          id: row.id as number,
          snippet: row.snippet as string,
          origin: row.app_name as string,
          rank: row.rank as number,
          createdAt: row.recorded_at as string,
          metadata: {
            entryType: row.entry_type,
            scope: row.scope,
            tags: row.tags,
          },
        });
      }
    } catch {
      // FTS table might not exist yet
    }
  }

  // Sort combined results by relevance
  results.sort((a, b) => a.rank - b.rank);
  return results.slice(0, limit);
}

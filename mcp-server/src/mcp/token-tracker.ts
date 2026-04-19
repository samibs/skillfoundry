/**
 * Token Tracker — persistent per-session and daily token usage tracking.
 *
 * Addresses the core insight from the video: 98.5% of tokens go to rereading
 * old conversation history. By tracking output tokens from MCP tool responses,
 * we can measure and optimize the framework's contribution to that cost.
 *
 * Uses SQLite for persistence (survives server restarts).
 * Integrates with the existing cost-router for pricing.
 */

import { getDatabase } from "../state/db.js";
import { MODELS, type ModelTier } from "../agents/cost-router.js";

// ── Schema ────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 3.5;

export function ensureTokenTrackingTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      output_tokens INTEGER NOT NULL,
      output_chars INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
    CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_token_usage_tool ON token_usage(tool_name);
  `);
}

// ── Session Management ────────────────────────────────────────────────

let currentSessionId: string = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let sessionStartTime: number = Date.now();

export function getSessionId(): string {
  return currentSessionId;
}

export function resetSession(): void {
  currentSessionId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStartTime = Date.now();
}

// ── Tracking ──────────────────────────────────────────────────────────

export interface TokenTracker {
  toolName: string;
  outputTokens: number;
  outputChars: number;
  durationMs: number;
}

/**
 * Record token usage for a tool invocation.
 * Called automatically by the handler wrapper.
 */
export function trackToolInvocation(
  toolName: string,
  responseText: string,
  durationMs: number,
): TokenTracker {
  const outputChars = responseText.length;
  const outputTokens = Math.ceil(outputChars / CHARS_PER_TOKEN);

  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO token_usage (session_id, tool_name, output_tokens, output_chars, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(currentSessionId, toolName, outputTokens, outputChars, durationMs);
  } catch {
    // DB not initialized yet — silently skip (metrics table may not exist)
  }

  return { toolName, outputTokens, outputChars, durationMs };
}

// ── Queries ───────────────────────────────────────────────────────────

export interface SessionTokenReport {
  sessionId: string;
  sessionDurationMinutes: number;
  totalOutputTokens: number;
  totalInvocations: number;
  estimatedCostUsd: number;
  byTool: Array<{
    toolName: string;
    invocations: number;
    totalOutputTokens: number;
    avgOutputTokens: number;
  }>;
  budgetWarning: string | null;
}

/**
 * Get token usage report for the current session.
 */
export function getSessionTokenReport(): SessionTokenReport {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT
      tool_name,
      COUNT(*) as invocations,
      SUM(output_tokens) as total_tokens,
      AVG(output_tokens) as avg_tokens
    FROM token_usage
    WHERE session_id = ?
    GROUP BY tool_name
    ORDER BY total_tokens DESC
  `).all(currentSessionId) as Array<Record<string, unknown>>;

  let totalTokens = 0;
  let totalInvocations = 0;
  const byTool = rows.map((r) => {
    const tokens = r.total_tokens as number;
    const invocs = r.invocations as number;
    totalTokens += tokens;
    totalInvocations += invocs;
    return {
      toolName: r.tool_name as string,
      invocations: invocs,
      totalOutputTokens: tokens,
      avgOutputTokens: Math.round(r.avg_tokens as number),
    };
  });

  // Estimate cost at Sonnet tier (most common for tool responses read by the LLM)
  // Output tokens from tools become INPUT tokens on re-read — use input pricing
  const estimatedCostUsd = (totalTokens / 1_000_000) * MODELS.sonnet.inputCostPer1M;

  const sessionMinutes = Math.round((Date.now() - sessionStartTime) / 60_000);

  // Budget warnings
  let budgetWarning: string | null = null;
  if (totalTokens > 500_000) {
    budgetWarning = "CRITICAL: Session has generated 500K+ output tokens. Start a new conversation to avoid exponential context cost.";
  } else if (totalTokens > 200_000) {
    budgetWarning = "WARNING: Session approaching high token usage (200K+). Consider using concise:true on skill calls or starting fresh.";
  } else if (totalTokens > 100_000) {
    budgetWarning = "NOTE: Session at 100K+ tokens. Use concise:true on familiar skills to reduce context bloat.";
  }

  return {
    sessionId: currentSessionId,
    sessionDurationMinutes: sessionMinutes,
    totalOutputTokens: totalTokens,
    totalInvocations,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    byTool,
    budgetWarning,
  };
}

export interface DailyTokenReport {
  date: string;
  totalOutputTokens: number;
  totalInvocations: number;
  estimatedCostUsd: number;
  topTools: Array<{
    toolName: string;
    totalOutputTokens: number;
    invocations: number;
  }>;
  sessions: number;
}

/**
 * Get token usage for a specific day (defaults to today).
 */
export function getDailyTokenReport(date?: string): DailyTokenReport {
  const db = getDatabase();
  const targetDate = date || new Date().toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT
      tool_name,
      COUNT(*) as invocations,
      SUM(output_tokens) as total_tokens
    FROM token_usage
    WHERE date(created_at) = ?
    GROUP BY tool_name
    ORDER BY total_tokens DESC
    LIMIT 10
  `).all(targetDate) as Array<Record<string, unknown>>;

  let totalTokens = 0;
  let totalInvocations = 0;
  const topTools = rows.map((r) => {
    const tokens = r.total_tokens as number;
    totalTokens += tokens;
    totalInvocations += r.invocations as number;
    return {
      toolName: r.tool_name as string,
      totalOutputTokens: tokens,
      invocations: r.invocations as number,
    };
  });

  const sessionCount = db.prepare(`
    SELECT COUNT(DISTINCT session_id) as sessions
    FROM token_usage
    WHERE date(created_at) = ?
  `).get(targetDate) as { sessions: number } | undefined;

  const estimatedCostUsd = (totalTokens / 1_000_000) * MODELS.sonnet.inputCostPer1M;

  return {
    date: targetDate,
    totalOutputTokens: totalTokens,
    totalInvocations,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    topTools,
    sessions: sessionCount?.sessions ?? 0,
  };
}

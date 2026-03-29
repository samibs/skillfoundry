import { getDatabase, initDatabase } from "./db.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvocationRecord {
  agentName: string;
  toolName: string;
  projectPath: string;
  status: "success" | "error";
  duration: number;
  inputTokens?: number;
  outputTokens?: number;
  modelTier?: string;
  error?: string;
}

export interface AgentMetrics {
  agentName: string;
  totalInvocations: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgDuration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastInvokedAt: string;
}

export interface MetricsSummary {
  totalInvocations: number;
  totalSuccess: number;
  totalErrors: number;
  successRate: number;
  avgDuration: number;
  topAgents: AgentMetrics[];
  byModelTier: Record<string, { invocations: number; tokens: number }>;
  since: string;
}

// ─── Schema ─────────────────────────────────────────────────────────────────

export function ensureMetricsTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      project_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      duration INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      model_tier TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_invocations_agent ON invocations(agent_name);
    CREATE INDEX IF NOT EXISTS idx_invocations_created ON invocations(created_at);
  `);
}

// ─── Recording ──────────────────────────────────────────────────────────────

export function recordInvocation(record: InvocationRecord): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO invocations (agent_name, tool_name, project_path, status, duration, input_tokens, output_tokens, model_tier, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.agentName,
    record.toolName,
    record.projectPath,
    record.status,
    record.duration,
    record.inputTokens || null,
    record.outputTokens || null,
    record.modelTier || null,
    record.error || null
  );
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function getAgentMetrics(
  agentName?: string,
  since?: string
): AgentMetrics[] {
  const db = getDatabase();
  let sql = `
    SELECT
      agent_name,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
      AVG(duration) as avg_duration,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      MAX(created_at) as last_invoked_at
    FROM invocations
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (agentName) {
    sql += " AND agent_name = ?";
    params.push(agentName);
  }
  if (since) {
    sql += " AND created_at >= ?";
    params.push(since);
  }

  sql += " GROUP BY agent_name ORDER BY total DESC";

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    agentName: r.agent_name as string,
    totalInvocations: r.total as number,
    successCount: r.success_count as number,
    errorCount: r.error_count as number,
    successRate: (r.total as number) > 0
      ? (r.success_count as number) / (r.total as number)
      : 0,
    avgDuration: Math.round(r.avg_duration as number),
    totalInputTokens: r.total_input_tokens as number,
    totalOutputTokens: r.total_output_tokens as number,
    lastInvokedAt: r.last_invoked_at as string,
  }));
}

export function getMetricsSummary(since?: string): MetricsSummary {
  const agentMetrics = getAgentMetrics(undefined, since);

  let totalInvocations = 0;
  let totalSuccess = 0;
  let totalErrors = 0;
  let totalDuration = 0;

  for (const a of agentMetrics) {
    totalInvocations += a.totalInvocations;
    totalSuccess += a.successCount;
    totalErrors += a.errorCount;
    totalDuration += a.avgDuration * a.totalInvocations;
  }

  // By model tier
  const db = getDatabase();
  let tierSql = `
    SELECT model_tier, COUNT(*) as invocations,
           COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) as tokens
    FROM invocations WHERE model_tier IS NOT NULL
  `;
  const tierParams: unknown[] = [];
  if (since) {
    tierSql += " AND created_at >= ?";
    tierParams.push(since);
  }
  tierSql += " GROUP BY model_tier";

  const tierRows = db.prepare(tierSql).all(...tierParams) as Array<Record<string, unknown>>;
  const byModelTier: Record<string, { invocations: number; tokens: number }> = {};
  for (const r of tierRows) {
    byModelTier[r.model_tier as string] = {
      invocations: r.invocations as number,
      tokens: r.tokens as number,
    };
  }

  return {
    totalInvocations,
    totalSuccess,
    totalErrors,
    successRate: totalInvocations > 0 ? totalSuccess / totalInvocations : 0,
    avgDuration: totalInvocations > 0 ? Math.round(totalDuration / totalInvocations) : 0,
    topAgents: agentMetrics.slice(0, 10),
    byModelTier,
    since: since || "all-time",
  };
}

// Bridge layer — thin adapter between VS Code extension and sf_cli core modules.
// All quality logic lives in sf_cli. This layer wraps it for VS Code consumption.
//
// Execution mode:
// - sf-runner.mjs (ESM wrapper) is called via child_process.execFile for operations
//   that need sf_cli core modules (gates, dep scanning, reports, metrics).
// - JSONL data files are read directly for passive data (telemetry, audit, perf).
//
// The runner script handles the ESM/CJS boundary — the extension stays CJS (esbuild).

import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

// Types re-exported for the extension to use without importing sf_cli directly
export interface GateResult {
  tier: string;
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'running';
  detail: string;
  durationMs: number;
}

export interface GateRunSummary {
  gates: GateResult[];
  verdict: string;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  totalMs?: number;
}

export interface TelemetryEvent {
  id: string;
  schema_version: number;
  event_type: string;
  timestamp: string;
  session_id: string;
  duration_ms: number;
  status: 'pass' | 'warn' | 'fail' | 'error';
  details: Record<string, unknown>;
}

export interface TelemetryAggregation {
  total_runs: number;
  successful_runs: number;
  partial_runs: number;
  failed_runs: number;
  gate_pass_rate: number;
  avg_security_findings: { critical: number; high: number; medium: number; low: number };
  avg_tests_created: number;
  avg_rework_cycles: number;
  avg_duration_ms: number;
  avg_cost_usd: number;
  total_cost_usd: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  window: number;
}

export interface DependencyFinding {
  name: string;
  version: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  cve: string;
  title: string;
  advisory_url: string;
  package_manager: string;
}

export interface CombinedDepReport {
  reports: Array<{
    package_manager: string;
    total_dependencies: number;
    vulnerable_count: number;
    findings: DependencyFinding[];
    scanner_available: boolean;
    error: string | null;
  }>;
  total_vulnerable: number;
  summary: { critical: number; high: number; moderate: number; low: number };
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

export interface QualityReport {
  generated_at: string;
  project_name: string;
  window: number;
  summary: {
    total_runs: number;
    verdict: string;
    gate_pass_rate: number;
    trend: string;
  };
  security: {
    total_findings: { critical: number; high: number; medium: number; low: number };
    top_findings: string[];
  };
  dependencies: {
    total_vulnerable: number;
    summary: { critical: number; high: number; moderate: number; low: number };
  };
  gates: Array<{ tier: string; pass_rate: number; avg_duration_ms: number }>;
  baselines: Record<string, { value: number; source: string; metric: string }>;
  recommendations: string[];
}

export interface IndustryBaselines {
  [key: string]: { value: number; source: string; metric: string };
}

// Memory entry from knowledge JSONL files
export interface KnowledgeEntry {
  id: string;
  type: string;
  content: string;
  created_at: string;
  weight?: number;
  tags?: string[];
}

// Audit entry from audit.jsonl
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  gate: string;
  verdict: 'pass' | 'fail' | 'warn' | 'skip';
  reason: string;
  duration_ms: number;
  story_file?: string;
}

// Perf stats from perf-tracker
export interface PerfStats {
  gate: string;
  count: number;
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

// Forge state from forge-state.json
export interface ForgeState {
  status: string;
  phase: string;
  current_story?: string;
  stories_completed: number;
  stories_total: number;
  started_at: string;
  updated_at: string;
}

// ── JSONL helpers ──────────────────────────────────────────────────

function readJsonlFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: T[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as T);
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * SfBridge — Single interface between VS Code extension and sf_cli.
 *
 * Active operations (gates, dep scan, reports) use sf-runner.mjs subprocess.
 * Passive data (telemetry, audit, perf, memory) reads JSONL directly.
 */
export class SfBridge {
  private sfDir: string;
  private runnerPath: string | null;

  constructor(private workDir: string) {
    this.sfDir = path.join(workDir, '.skillfoundry');
    this.runnerPath = this.findRunner();
  }

  /** Find sf-runner.mjs — the ESM wrapper for sf_cli core modules */
  private findRunner(): string | null {
    const candidates = [
      // Development: extension is inside skillfoundry/skillfoundry-vscode/
      path.resolve(__dirname, '..', '..', 'sf_cli', 'bin', 'sf-runner.mjs'),
      // Installed: sf_cli is sibling to workspace
      path.resolve(this.workDir, 'sf_cli', 'bin', 'sf-runner.mjs'),
      // npm global install: node_modules/skillfoundry/sf_cli/bin/
      path.resolve(__dirname, '..', '..', '..', 'skillfoundry', 'sf_cli', 'bin', 'sf-runner.mjs'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /** Run sf-runner.mjs with given args, parse JSON output */
  private runRunner(args: string[], timeoutMs: number = 120_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.runnerPath) {
        reject(new Error('sf-runner.mjs not found — sf_cli not installed'));
        return;
      }

      // Validate runner path exists before exec
      if (!fs.existsSync(this.runnerPath)) {
        reject(new Error(`sf-runner.mjs not found at ${this.runnerPath}`));
        return;
      }

      const fullArgs = [this.runnerPath, '--workdir', this.workDir, ...args];

      execFile('node', fullArgs, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf-8',
      }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message || 'Runner failed';
          reject(new Error(msg));
          return;
        }

        const output = stdout.trim();
        if (!output) {
          reject(new Error('Runner returned empty output'));
          return;
        }

        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error(`Runner returned invalid JSON: ${output.slice(0, 200)}`));
        }
      });
    });
  }

  /** Check if the runner (sf_cli) is available for active operations */
  isAvailable(): boolean {
    return this.runnerPath !== null;
  }

  /** Check if data directory exists */
  hasDataDir(): boolean {
    return fs.existsSync(this.sfDir);
  }

  /** Get the resolved runner path (for diagnostics) */
  getSfCliPath(): string {
    return this.runnerPath || '(no sf-runner.mjs found — file mode only)';
  }

  /** Get the workspace directory */
  getWorkDir(): string {
    return this.workDir;
  }

  // ── Telemetry (file-based) ────────────────────────────────────

  async getMetrics(window: number = 10): Promise<TelemetryAggregation | null> {
    // Try runner first (uses sf_cli's aggregateMetrics with baselines)
    if (this.runnerPath) {
      try {
        const result = await this.runRunner(['--metrics', '--window', String(window)]) as {
          aggregation: Record<string, unknown>;
        };
        if (result?.aggregation) {
          const agg = result.aggregation as Record<string, unknown>;
          return {
            total_runs: (agg.total_runs as number) || 0,
            successful_runs: (agg.successful_runs as number) || 0,
            partial_runs: (agg.partial_runs as number) || 0,
            failed_runs: (agg.failed_runs as number) || 0,
            gate_pass_rate: (agg.avg_gate_pass_rate as number) || (agg.gate_pass_rate as number) || 0,
            avg_security_findings: (agg.total_security_findings as { critical: number; high: number; medium: number; low: number }) ||
              { critical: 0, high: 0, medium: 0, low: 0 },
            avg_tests_created: (agg.total_tests_created as number) || 0,
            avg_rework_cycles: (agg.total_rework_cycles as number) || 0,
            avg_duration_ms: (agg.avg_duration_ms as number) || 0,
            avg_cost_usd: (agg.avg_cost_usd as number) || 0,
            total_cost_usd: 0,
            trend: (agg.trend as 'improving' | 'declining' | 'stable' | 'insufficient_data') || 'insufficient_data',
            window: (agg.window as number) || window,
          };
        }
      } catch {
        // Fall through to file-based
      }
    }

    // Fallback: file-based telemetry parsing
    const events = readJsonlFile<TelemetryEvent>(path.join(this.sfDir, 'telemetry.jsonl'));
    if (events.length === 0) return null;

    const runs = events
      .filter((e) => e.event_type === 'forge_run' || e.event_type === 'pipeline_run')
      .slice(-window);

    if (runs.length === 0) return null;

    const successful = runs.filter((r) => r.status === 'pass').length;
    const failed = runs.filter((r) => r.status === 'fail' || r.status === 'error').length;
    const partial = runs.filter((r) => r.status === 'warn').length;

    const durations = runs.map((r) => r.duration_ms).filter((d) => d > 0);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const gateEvents = events.filter((e) => e.event_type === 'gate_run').slice(-window * 7);
    const gatePassed = gateEvents.filter((e) => e.status === 'pass').length;
    const gatePassRate = gateEvents.length > 0 ? gatePassed / gateEvents.length : 0;

    const secFindings = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of runs) {
      const d = r.details || {};
      secFindings.critical += (d.security_critical as number) || 0;
      secFindings.high += (d.security_high as number) || 0;
      secFindings.medium += (d.security_medium as number) || 0;
      secFindings.low += (d.security_low as number) || 0;
    }
    const n = runs.length || 1;

    const costs = runs.map((r) => (r.details?.cost_usd as number) || 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);

    const tests = runs.map((r) => (r.details?.tests_created as number) || 0);
    const avgTests = tests.reduce((a, b) => a + b, 0) / n;

    let trend: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
    if (runs.length >= 4) {
      const half = Math.floor(runs.length / 2);
      const firstHalf = runs.slice(0, half).filter((r) => r.status === 'pass').length / half;
      const secondHalf = runs.slice(half).filter((r) => r.status === 'pass').length / (runs.length - half);
      if (secondHalf > firstHalf + 0.1) trend = 'improving';
      else if (secondHalf < firstHalf - 0.1) trend = 'declining';
      else trend = 'stable';
    }

    return {
      total_runs: runs.length,
      successful_runs: successful,
      partial_runs: partial,
      failed_runs: failed,
      gate_pass_rate: gatePassRate,
      avg_security_findings: {
        critical: Math.round(secFindings.critical / n * 10) / 10,
        high: Math.round(secFindings.high / n * 10) / 10,
        medium: Math.round(secFindings.medium / n * 10) / 10,
        low: Math.round(secFindings.low / n * 10) / 10,
      },
      avg_tests_created: avgTests,
      avg_rework_cycles: 0,
      avg_duration_ms: avgDuration,
      avg_cost_usd: totalCost / n,
      total_cost_usd: totalCost,
      trend,
      window: runs.length,
    };
  }

  async getEvents(): Promise<{ events: TelemetryEvent[]; skipped: number }> {
    const events = readJsonlFile<TelemetryEvent>(path.join(this.sfDir, 'telemetry.jsonl'));
    return { events, skipped: 0 };
  }

  async getBaselines(): Promise<IndustryBaselines> {
    return {};
  }

  // ── Gates (via sf-runner.mjs) ────────────────────────────────────

  async runGate(tier: string, target?: string): Promise<GateResult | null> {
    try {
      const args = ['--gate', tier];
      if (target) args.push('--target', target);
      const result = await this.runRunner(args, 60_000) as GateResult;
      return result;
    } catch (err) {
      console.error(`[SfBridge] runGate(${tier}) failed:`, (err as Error).message);
      return null;
    }
  }

  async runAllGates(target?: string): Promise<GateRunSummary | null> {
    try {
      const args = ['--gate-all'];
      if (target) args.push('--target', target);
      const result = await this.runRunner(args, 180_000) as GateRunSummary;
      return result;
    } catch (err) {
      console.error(`[SfBridge] runAllGates failed:`, (err as Error).message);
      return null;
    }
  }

  // ── Dependencies (via sf-runner.mjs) ──────────────────────────────

  async scanDependencies(): Promise<CombinedDepReport | null> {
    try {
      const result = await this.runRunner(['--scan-deps'], 120_000) as CombinedDepReport;
      return result;
    } catch (err) {
      console.error(`[SfBridge] scanDependencies failed:`, (err as Error).message);
      return null;
    }
  }

  // ── Reports (via sf-runner.mjs) ────────────────────────────────────

  async generateReport(window: number = 10): Promise<QualityReport | null> {
    try {
      const result = await this.runRunner(['--report', '--window', String(window)]) as {
        report: QualityReport;
      };
      return result?.report || null;
    } catch (err) {
      console.error(`[SfBridge] generateReport failed:`, (err as Error).message);
      return null;
    }
  }

  async formatReportMarkdown(report: QualityReport): Promise<string> {
    // If we got here, report was generated by the runner — try to get markdown
    try {
      const result = await this.runRunner(['--report', '--window', String(report.window || 10)]) as {
        markdown: string;
      };
      return result?.markdown || '# No report data available';
    } catch {
      return '# Report formatting requires sf_cli';
    }
  }

  // ── Audit Log (file-based) ──────────────────────────────────

  async getRecentAuditEntries(count: number = 50): Promise<AuditEntry[]> {
    const entries = readJsonlFile<AuditEntry>(path.join(this.sfDir, 'audit.jsonl'));
    return entries.slice(-count);
  }

  async getAuditSummary(): Promise<{ total_entries: number; by_verdict: Record<string, number>; by_gate: Record<string, number> } | null> {
    const entries = readJsonlFile<AuditEntry>(path.join(this.sfDir, 'audit.jsonl'));
    if (entries.length === 0) return null;

    const by_verdict: Record<string, number> = {};
    const by_gate: Record<string, number> = {};

    for (const entry of entries) {
      by_verdict[entry.verdict] = (by_verdict[entry.verdict] || 0) + 1;
      by_gate[entry.gate] = (by_gate[entry.gate] || 0) + 1;
    }

    return { total_entries: entries.length, by_verdict, by_gate };
  }

  // ── Performance (file-based) ──────────────────────────────────

  async getPerfStats(): Promise<PerfStats[]> {
    const entries = readJsonlFile<{ gate: string; duration_ms: number; timestamp: string }>(
      path.join(this.sfDir, 'perf.jsonl'),
    );
    if (entries.length === 0) return [];

    const byGate = new Map<string, number[]>();
    for (const entry of entries) {
      if (!byGate.has(entry.gate)) byGate.set(entry.gate, []);
      byGate.get(entry.gate)!.push(entry.duration_ms);
    }

    const stats: PerfStats[] = [];
    for (const [gate, durations] of byGate) {
      const sorted = [...durations].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      stats.push({
        gate,
        count: sorted.length,
        min_ms: sorted[0],
        max_ms: sorted[sorted.length - 1],
        avg_ms: Math.round(sum / sorted.length),
        p50_ms: percentile(sorted, 50),
        p95_ms: percentile(sorted, 95),
        p99_ms: percentile(sorted, 99),
      });
    }

    return stats.sort((a, b) => a.gate.localeCompare(b.gate));
  }

  async checkP95(threshold: number = 500): Promise<{ passed: boolean; violations: Array<{ gate: string; p95_ms: number }> }> {
    const stats = await this.getPerfStats();
    const violations: Array<{ gate: string; p95_ms: number }> = [];

    for (const stat of stats) {
      if (stat.gate === 'T3') continue;
      if (stat.count < 5) continue;
      if (stat.p95_ms > threshold) {
        violations.push({ gate: stat.gate, p95_ms: stat.p95_ms });
      }
    }

    return { passed: violations.length === 0, violations };
  }

  // ── Quality Benchmark ──────────────────────────────────────────

  async runBenchmark(): Promise<{ total: number; correct: number; accuracy_pct: number; duration_ms: number } | null> {
    return null;
  }

  // ── Forge State (file-based) ───────────────────────────────────

  getForgeState(): ForgeState | null {
    const statePath = path.join(this.sfDir, 'forge-state.json');
    if (!fs.existsSync(statePath)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      return raw as ForgeState;
    } catch {
      return null;
    }
  }

  // ── Memory (file-based) ────────────────────────────────────────

  recallMemory(query?: string): KnowledgeEntry[] {
    try {
      const knowledgeDir = path.join(this.workDir, 'memory_bank', 'knowledge');
      if (!fs.existsSync(knowledgeDir)) return [];

      const files = fs.readdirSync(knowledgeDir).filter((f: string) => f.endsWith('.jsonl'));
      const entries: KnowledgeEntry[] = [];

      for (const file of files) {
        const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const raw = JSON.parse(line);
            if (typeof raw.id !== 'string' || typeof raw.content !== 'string') continue;
            const entry: KnowledgeEntry = {
              id: raw.id,
              type: typeof raw.type === 'string' ? raw.type : 'unknown',
              content: raw.content,
              created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
              weight: typeof raw.weight === 'number' ? raw.weight : 0.5,
              tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string') : [],
            };
            if (query) {
              const q = query.toLowerCase();
              const matches = entry.content.toLowerCase().includes(q) ||
                (entry.tags || []).some((t: string) => t.toLowerCase().includes(q));
              if (!matches) continue;
            }
            entries.push(entry);
          } catch {
            continue;
          }
        }
      }

      return entries.sort((a, b) => (b.weight || 0.5) - (a.weight || 0.5));
    } catch {
      return [];
    }
  }
}

// Bridge layer — thin adapter between VS Code extension and sf_cli core modules.
// All quality logic lives in sf_cli. This layer wraps it for VS Code consumption.

import * as path from 'path';

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

/**
 * SfBridge — Single interface between VS Code extension and sf_cli core modules.
 * All methods return result objects (never throw). Extension handles display.
 */
export class SfBridge {
  private sfCliPath: string;

  constructor(private workDir: string) {
    // sf_cli is a sibling directory to the extension, or in the workspace
    this.sfCliPath = this.findSfCli();
  }

  private findSfCli(): string {
    // Look for sf_cli relative to extension install location first (safe),
    // then workspace (validated). Prefer __dirname-relative to avoid
    // loading arbitrary modules from attacker-controlled workspace paths.
    const candidates = [
      path.resolve(__dirname, '..', '..', 'sf_cli', 'src'),
      path.resolve(this.workDir, 'sf_cli', 'src'),
    ];
    for (const candidate of candidates) {
      try {
        const resolved = path.resolve(candidate);
        require.resolve(path.join(resolved, 'core', 'telemetry.js'));
        return resolved;
      } catch {
        continue;
      }
    }
    return path.resolve(__dirname, '..', '..', 'sf_cli', 'src');
  }

  /** Check if sf_cli is available */
  isAvailable(): boolean {
    try {
      require.resolve(path.join(this.sfCliPath, 'core', 'telemetry.js'));
      return true;
    } catch {
      return false;
    }
  }

  /** Get the workspace directory */
  getWorkDir(): string {
    return this.workDir;
  }

  // ── Telemetry ─────────────────────────────────────────────

  getMetrics(window: number = 10): TelemetryAggregation | null {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'telemetry.js'));
      return mod.aggregateMetrics(this.workDir, window);
    } catch {
      return null;
    }
  }

  getEvents(): { events: TelemetryEvent[]; skipped: number } {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'telemetry.js'));
      return mod.readEvents(this.workDir);
    } catch {
      return { events: [], skipped: 0 };
    }
  }

  getBaselines(): IndustryBaselines {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'telemetry.js'));
      return mod.INDUSTRY_BASELINES;
    } catch {
      return {};
    }
  }

  // ── Gates ─────────────────────────────────────────────────

  runGate(tier: string, target?: string): GateResult | null {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'gates.js'));
      return mod.runSingleGate(tier.toUpperCase(), this.workDir, target || '.');
    } catch {
      return null;
    }
  }

  async runAllGates(target?: string): Promise<GateRunSummary | null> {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'gates.js'));
      return await mod.runAllGates({ workDir: this.workDir, target: target || '.' });
    } catch {
      return null;
    }
  }

  // ── Dependencies ──────────────────────────────────────────

  scanDependencies(): CombinedDepReport | null {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'dependency-scanner.js'));
      return mod.runDependencyScan(this.workDir);
    } catch {
      return null;
    }
  }

  // ── Reports ───────────────────────────────────────────────

  generateReport(window: number = 10): QualityReport | null {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'report-generator.js'));
      return mod.generateReport(this.workDir, window);
    } catch {
      return null;
    }
  }

  formatReportMarkdown(report: QualityReport): string {
    try {
      const mod = require(path.join(this.sfCliPath, 'core', 'report-generator.js'));
      return mod.formatReportMarkdown(report);
    } catch {
      return '# Report generation failed';
    }
  }

  // ── Memory ────────────────────────────────────────────────

  recallMemory(query?: string): KnowledgeEntry[] {
    try {
      const fs = require('fs');
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
            // Runtime validation: ensure required fields are correct types
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

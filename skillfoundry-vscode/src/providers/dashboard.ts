// Quality Dashboard — TreeDataProvider for the sidebar showing project overview + metrics.
// Shows useful info from whatever data is available: config, agents, knowledge, telemetry.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SfBridge, TelemetryAggregation } from '../bridge';

export class DashboardProvider implements vscode.TreeDataProvider<DashboardItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DashboardItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private metrics: TelemetryAggregation | null = null;

  constructor(private bridge: SfBridge) {}

  refresh(): void {
    this.bridge.getMetrics().then((metrics) => {
      this.metrics = metrics;
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  getTreeItem(element: DashboardItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DashboardItem): DashboardItem[] {
    if (element) return [];

    const items: DashboardItem[] = [];
    const workDir = this.bridge.getWorkDir();

    // ── Project Info (from config.toml) ──────────────────────
    const configPath = path.join(workDir, '.skillfoundry', 'config.toml');
    if (fs.existsSync(configPath)) {
      try {
        const config = fs.readFileSync(configPath, 'utf-8');
        const provider = config.match(/^provider\s*=\s*"(.+)"/m)?.[1] || 'unknown';
        const model = config.match(/^model\s*=\s*"(.+)"/m)?.[1] || 'unknown';
        const budget = config.match(/^monthly_budget_usd\s*=\s*(\d+)/m)?.[1];

        items.push(new DashboardItem('Provider', `${provider} (${model})`, 'info'));
        if (budget) {
          items.push(new DashboardItem('Monthly Budget', `$${budget}`, 'info'));
        }
      } catch {
        // skip
      }
    }

    // ── Agent Count ──────────────────────────────────────────
    const agentsDir = path.join(workDir, 'agents');
    if (fs.existsSync(agentsDir)) {
      try {
        const agents = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
        items.push(new DashboardItem('Agents', `${agents.length} registered`, 'info'));
      } catch {
        // skip
      }
    }

    // ── Platform Count ───────────────────────────────────────
    const platforms = ['.claude/commands', '.cursor/rules', '.copilot/custom-agents', '.agents/skills', '.gemini/skills'];
    const activePlatforms = platforms.filter((p) => fs.existsSync(path.join(workDir, p)));
    if (activePlatforms.length > 0) {
      items.push(new DashboardItem('Platforms', `${activePlatforms.length} active`, 'info'));
    }

    // ── Knowledge Entries ────────────────────────────────────
    const knowledgeDir = path.join(workDir, 'memory_bank', 'knowledge');
    if (fs.existsSync(knowledgeDir)) {
      try {
        const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));
        let totalEntries = 0;
        for (const file of files) {
          const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf-8');
          totalEntries += content.split('\n').filter((l) => l.trim()).length;
        }
        if (totalEntries > 0) {
          items.push(new DashboardItem('Knowledge', `${totalEntries} entries`, 'info'));
        }
      } catch {
        // skip
      }
    }

    // ── Version ──────────────────────────────────────────────
    const versionFile = path.join(workDir, '.version');
    if (fs.existsSync(versionFile)) {
      try {
        const version = fs.readFileSync(versionFile, 'utf-8').trim();
        items.push(new DashboardItem('Version', `v${version}`, 'info'));
      } catch {
        // skip
      }
    }

    // ── Separator ────────────────────────────────────────────
    if (items.length > 0 && this.metrics) {
      items.push(new DashboardItem('─── Telemetry ───', '', 'info'));
    }

    // ── Telemetry Metrics (when available) ───────────────────
    if (this.metrics && this.metrics.total_runs > 0) {
      const m = this.metrics;
      const trendIcon = m.trend === 'improving' ? '$(arrow-up)' : m.trend === 'declining' ? '$(arrow-down)' : '$(dash)';

      items.push(
        new DashboardItem('Gate Pass Rate', `${(m.gate_pass_rate * 100).toFixed(1)}%`, m.gate_pass_rate >= 0.9 ? 'pass' : m.gate_pass_rate >= 0.7 ? 'warn' : 'fail'),
        new DashboardItem('Total Runs', `${m.total_runs} (${m.successful_runs} passed)`, 'info'),
        new DashboardItem('Trend', `${m.trend} ${trendIcon}`, m.trend === 'improving' ? 'pass' : m.trend === 'declining' ? 'warn' : 'info'),
        new DashboardItem('Security', `${m.avg_security_findings.critical}C ${m.avg_security_findings.high}H ${m.avg_security_findings.medium}M`, m.avg_security_findings.critical > 0 ? 'fail' : m.avg_security_findings.high > 0 ? 'warn' : 'pass'),
        new DashboardItem('Avg Cost', `$${m.avg_cost_usd.toFixed(2)}/run`, 'info'),
        new DashboardItem('Tests Created', `${m.avg_tests_created.toFixed(0)} avg/run`, 'info'),
      );
    }

    // ── Audit Summary ────────────────────────────────────────
    const auditPath = path.join(workDir, '.skillfoundry', 'audit.jsonl');
    if (fs.existsSync(auditPath)) {
      try {
        const content = fs.readFileSync(auditPath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim()).length;
        if (lines > 0) {
          items.push(new DashboardItem('Audit Log', `${lines} entries`, 'info'));
        }
      } catch {
        // skip
      }
    }

    // ── Test Count (from sf_cli) ─────────────────────────────
    const testDirs = ['src/__tests__', 'sf_cli/src/__tests__', 'tests', '__tests__'];
    for (const testDir of testDirs) {
      const fullPath = path.join(workDir, testDir);
      if (fs.existsSync(fullPath)) {
        try {
          const testFiles = fs.readdirSync(fullPath).filter((f) =>
            f.endsWith('.test.ts') || f.endsWith('.test.js') || f.endsWith('.spec.ts') || f.endsWith('.spec.js'),
          );
          if (testFiles.length > 0) {
            items.push(new DashboardItem('Test Files', `${testFiles.length} in ${testDir}`, 'info'));
            break; // show first found only
          }
        } catch {
          // skip
        }
      }
    }

    if (items.length === 0) {
      items.push(new DashboardItem('SkillFoundry', 'Extension active — run /forge to start', 'info'));
    }

    return items;
  }

  getMetrics(): TelemetryAggregation | null {
    return this.metrics;
  }
}

export class DashboardItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly value: string,
    public readonly status: 'pass' | 'fail' | 'warn' | 'info',
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.tooltip = `${label}: ${value}`;
    this.iconPath = new vscode.ThemeIcon(
      status === 'pass' ? 'pass' :
      status === 'fail' ? 'error' :
      status === 'warn' ? 'warning' :
      'info',
    );
  }
}

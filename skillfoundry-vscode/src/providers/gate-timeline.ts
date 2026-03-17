// Gate Timeline — TreeDataProvider showing T0-T7 gate results with status icons.
// Shows results from: manual gate run > audit.jsonl history > gate tier reference.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SfBridge, GateResult, GateRunSummary, AuditEntry } from '../bridge';

const GATE_REFERENCE = [
  { tier: 'T0', name: 'Correctness Contracts', desc: 'Fuzzy-matches acceptance criteria against test content' },
  { tier: 'T1', name: 'Banned Patterns', desc: 'TODO, FIXME, HACK, @ts-ignore, hardcoded secrets' },
  { tier: 'T2', name: 'Type Check', desc: 'tsc --noEmit (TypeScript) or equivalent' },
  { tier: 'T3', name: 'Tests', desc: 'Runs test suite, checks for test file existence' },
  { tier: 'T4', name: 'Security', desc: 'Semgrep SAST + regex fallback, dependency audit' },
  { tier: 'T5', name: 'Build', desc: 'Full build verification (tsc, esbuild, etc.)' },
  { tier: 'T6', name: 'Scope', desc: 'Story scope validation — diff stays within boundaries' },
  { tier: 'T7', name: 'Deploy Pre-Flight', desc: 'DB migrations, CORS, env vars, API contracts, endpoint smoke test' },
];

export class GateTimelineProvider implements vscode.TreeDataProvider<GateTimelineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GateTimelineItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private lastRun: GateRunSummary | null = null;

  constructor(private bridge: SfBridge) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setLastRun(summary: GateRunSummary): void {
    this.lastRun = summary;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GateTimelineItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GateTimelineItem): Promise<GateTimelineItem[]> {
    if (element) {
      if (element.gateResult?.detail) {
        return element.gateResult.detail
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 5)
          .map((line) => new GateTimelineItem(line.trim(), 'info'));
      }
      return [];
    }

    // Priority 1: Manual gate run results
    if (this.lastRun) {
      return this.buildFromGateRun(this.lastRun);
    }

    // Priority 2: Audit log entries
    const auditEntries = await this.bridge.getRecentAuditEntries(20);
    if (auditEntries.length > 0) {
      return this.buildFromAudit(auditEntries);
    }

    // Priority 3: Gate reference (always shows something useful)
    return this.buildGateReference();
  }

  private buildFromGateRun(run: GateRunSummary): GateTimelineItem[] {
    const items = run.gates.map((gate) => {
      const item = new GateTimelineItem(`${gate.tier} ${gate.name}`, gate.status, gate);
      item.description = `${gate.status.toUpperCase()} (${gate.durationMs}ms)`;
      return item;
    });

    const verdict = new GateTimelineItem(
      `Verdict: ${run.verdict}`,
      run.failed > 0 ? 'fail' : run.warned > 0 ? 'warn' : 'pass',
    );
    verdict.description = `${run.passed}P ${run.failed}F ${run.warned}W ${run.skipped}S`;
    items.push(verdict);
    return items;
  }

  private buildFromAudit(entries: AuditEntry[]): GateTimelineItem[] {
    const items: GateTimelineItem[] = [];
    items.push(new GateTimelineItem('Recent Gate Activity (audit log)', 'info'));

    const byGate = new Map<string, AuditEntry>();
    for (const entry of entries) {
      byGate.set(entry.gate, entry);
    }

    for (const [gate, entry] of [...byGate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const item = new GateTimelineItem(
        `${gate}: ${entry.verdict.toUpperCase()}`,
        entry.verdict === 'pass' ? 'pass' : entry.verdict === 'fail' ? 'fail' : entry.verdict === 'warn' ? 'warn' : 'skip',
      );
      item.description = `${entry.duration_ms}ms — ${new Date(entry.timestamp).toLocaleTimeString()}`;
      item.tooltip = entry.reason || `${gate} ${entry.verdict}`;
      items.push(item);
    }

    const passed = entries.filter((e) => e.verdict === 'pass').length;
    const failed = entries.filter((e) => e.verdict === 'fail').length;
    items.push(new GateTimelineItem(`${entries.length} entries: ${passed}P ${failed}F`, failed > 0 ? 'warn' : 'pass'));
    return items;
  }

  private buildGateReference(): GateTimelineItem[] {
    const items: GateTimelineItem[] = [];
    items.push(new GateTimelineItem('Anvil Quality Gates (8 tiers)', 'info'));

    for (const gate of GATE_REFERENCE) {
      const item = new GateTimelineItem(`${gate.tier} — ${gate.name}`, 'info');
      item.description = gate.desc;
      item.tooltip = `${gate.tier}: ${gate.name}\n${gate.desc}`;
      items.push(item);
    }

    items.push(new GateTimelineItem('Run "SkillFoundry: Run All Gates" or /forge to see results', 'info'));
    return items;
  }
}

export class GateTimelineItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly status: string,
    public readonly gateResult?: GateResult,
  ) {
    super(
      label,
      gateResult?.detail ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    this.iconPath = new vscode.ThemeIcon(
      status === 'pass' ? 'pass' :
      status === 'fail' ? 'error' :
      status === 'warn' ? 'warning' :
      status === 'skip' ? 'circle-slash' :
      'info',
    );
    this.tooltip = gateResult?.detail || label;
  }
}

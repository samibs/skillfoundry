// Gate Timeline — TreeDataProvider showing T0-T6 gate results with status icons.
// Shows results from the last manual gate run, or from audit.jsonl history.

import * as vscode from 'vscode';
import { SfBridge, GateResult, GateRunSummary, AuditEntry } from '../bridge';

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
      // Show detail for expanded gate
      if (element.gateResult?.detail) {
        return element.gateResult.detail
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 5)
          .map((line) => new GateTimelineItem(line.trim(), 'info'));
      }
      return [];
    }

    // If we have a manual gate run, show that
    if (this.lastRun) {
      return this.buildFromGateRun(this.lastRun);
    }

    // Otherwise, try to show recent audit log entries
    const auditEntries = await this.bridge.getRecentAuditEntries(20);
    if (auditEntries.length > 0) {
      return this.buildFromAudit(auditEntries);
    }

    return [new GateTimelineItem('No gate results yet. Run "SkillFoundry: Run All Gates" or /forge', 'info')];
  }

  private buildFromGateRun(run: GateRunSummary): GateTimelineItem[] {
    const items = run.gates.map((gate) => {
      const item = new GateTimelineItem(
        `${gate.tier} ${gate.name}`,
        gate.status,
        gate,
      );
      item.description = `${gate.status.toUpperCase()} (${gate.durationMs}ms)`;
      return item;
    });

    // Add verdict summary
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

    // Header
    items.push(new GateTimelineItem('Recent Gate Activity (from audit log)', 'info'));

    // Group by most recent per gate tier
    const byGate = new Map<string, AuditEntry>();
    for (const entry of entries) {
      byGate.set(entry.gate, entry); // last one wins (most recent)
    }

    for (const [gate, entry] of [...byGate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const item = new GateTimelineItem(
        `${gate}: ${entry.verdict.toUpperCase()}`,
        entry.verdict === 'pass' ? 'pass' :
        entry.verdict === 'fail' ? 'fail' :
        entry.verdict === 'warn' ? 'warn' : 'skip',
      );
      item.description = `${entry.duration_ms}ms — ${new Date(entry.timestamp).toLocaleTimeString()}`;
      item.tooltip = entry.reason || `${gate} ${entry.verdict}`;
      items.push(item);
    }

    // Summary
    const passed = entries.filter((e) => e.verdict === 'pass').length;
    const failed = entries.filter((e) => e.verdict === 'fail').length;
    const summary = new GateTimelineItem(
      `${entries.length} entries: ${passed}P ${failed}F`,
      failed > 0 ? 'warn' : 'pass',
    );
    items.push(summary);

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

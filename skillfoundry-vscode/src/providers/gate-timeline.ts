// Gate Timeline — TreeDataProvider showing T0-T6 gate results with status icons.

import * as vscode from 'vscode';
import { SfBridge, GateResult, GateRunSummary } from '../bridge';

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

  getChildren(element?: GateTimelineItem): GateTimelineItem[] {
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

    if (!this.lastRun) {
      return [new GateTimelineItem('No gate results yet. Run "SkillFoundry: Run All Gates"', 'info')];
    }

    const items = this.lastRun.gates.map((gate) => {
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
      `Verdict: ${this.lastRun.verdict}`,
      this.lastRun.failed > 0 ? 'fail' : this.lastRun.warned > 0 ? 'warn' : 'pass',
    );
    verdict.description = `${this.lastRun.passed}P ${this.lastRun.failed}F ${this.lastRun.warned}W ${this.lastRun.skipped}S`;
    items.push(verdict);

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

// Dependency CVE Tree — TreeDataProvider showing vulnerable dependencies grouped by severity.

import * as vscode from 'vscode';
import { SfBridge, CombinedDepReport, DependencyFinding } from '../bridge';

export class DependencyProvider implements vscode.TreeDataProvider<DepTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DepTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private report: CombinedDepReport | null = null;

  constructor(private bridge: SfBridge) {}

  refresh(): void {
    this.report = null;
    this._onDidChangeTreeData.fire(undefined);
  }

  setReport(report: CombinedDepReport): void {
    this.report = report;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DepTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DepTreeItem): DepTreeItem[] {
    if (!this.report) {
      return [new DepTreeItem('Run "SkillFoundry: Scan Dependencies" to check for CVEs', 'info')];
    }

    if (element && element.severity) {
      // Show findings for this severity group
      const findings = this.getAllFindings().filter((f) => f.severity === element.severity);
      return findings.map((f) => {
        const item = new DepTreeItem(
          `${f.name}@${f.version}`,
          f.severity,
        );
        item.description = f.cve || f.title;
        item.tooltip = `${f.title}\n${f.cve}\n${f.advisory_url}`;
        if (f.advisory_url && (f.advisory_url.startsWith('https://') || f.advisory_url.startsWith('http://'))) {
          item.command = {
            command: 'vscode.open',
            title: 'Open Advisory',
            arguments: [vscode.Uri.parse(f.advisory_url)],
          };
        }
        return item;
      });
    }

    if (this.report.total_vulnerable === 0) {
      return [new DepTreeItem(`No vulnerabilities found (${this.report.verdict})`, 'pass')];
    }

    // Group by severity
    const groups: DepTreeItem[] = [];
    const s = this.report.summary;

    if (s.critical > 0) groups.push(new DepTreeItem(`Critical (${s.critical})`, 'critical', 'critical'));
    if (s.high > 0) groups.push(new DepTreeItem(`High (${s.high})`, 'high', 'high'));
    if (s.moderate > 0) groups.push(new DepTreeItem(`Moderate (${s.moderate})`, 'moderate', 'moderate'));
    if (s.low > 0) groups.push(new DepTreeItem(`Low (${s.low})`, 'low', 'low'));

    // Verdict summary
    const verdictItem = new DepTreeItem(
      `Verdict: ${this.report.verdict} (${this.report.total_vulnerable} vulnerable)`,
      this.report.verdict === 'FAIL' ? 'fail' : this.report.verdict === 'WARN' ? 'warn' : 'pass',
    );
    groups.push(verdictItem);

    return groups;
  }

  private getAllFindings(): DependencyFinding[] {
    if (!this.report) return [];
    return this.report.reports.flatMap((r) => r.findings);
  }
}

export class DepTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly status: string,
    public readonly severity?: string,
  ) {
    super(
      label,
      severity ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    this.iconPath = new vscode.ThemeIcon(
      status === 'pass' ? 'pass' :
      status === 'fail' || status === 'critical' ? 'error' :
      status === 'warn' || status === 'high' ? 'warning' :
      status === 'moderate' ? 'info' :
      status === 'low' ? 'circle-outline' :
      'info',
    );
  }
}

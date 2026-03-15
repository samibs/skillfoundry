// Quality Dashboard — TreeDataProvider for the sidebar showing key metrics.

import * as vscode from 'vscode';
import { SfBridge, TelemetryAggregation } from '../bridge';

export class DashboardProvider implements vscode.TreeDataProvider<DashboardItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DashboardItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private metrics: TelemetryAggregation | null = null;

  constructor(private bridge: SfBridge) {}

  refresh(): void {
    this.metrics = this.bridge.getMetrics();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: DashboardItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DashboardItem): DashboardItem[] {
    if (element) return [];

    if (!this.metrics) {
      this.metrics = this.bridge.getMetrics();
    }

    if (!this.metrics || this.metrics.total_runs === 0) {
      return [
        new DashboardItem('No telemetry data', 'Run /forge to start collecting metrics', 'info'),
      ];
    }

    const m = this.metrics;
    const trendIcon = m.trend === 'improving' ? '$(arrow-up)' : m.trend === 'declining' ? '$(arrow-down)' : '$(dash)';

    return [
      new DashboardItem('Gate Pass Rate', `${(m.gate_pass_rate * 100).toFixed(1)}%`, m.gate_pass_rate >= 0.9 ? 'pass' : m.gate_pass_rate >= 0.7 ? 'warn' : 'fail'),
      new DashboardItem('Total Runs', `${m.total_runs} (${m.successful_runs} passed)`, 'info'),
      new DashboardItem('Trend', `${m.trend} ${trendIcon}`, m.trend === 'improving' ? 'pass' : m.trend === 'declining' ? 'warn' : 'info'),
      new DashboardItem('Security', `${m.avg_security_findings.critical}C ${m.avg_security_findings.high}H ${m.avg_security_findings.medium}M`, m.avg_security_findings.critical > 0 ? 'fail' : m.avg_security_findings.high > 0 ? 'warn' : 'pass'),
      new DashboardItem('Avg Cost', `$${m.avg_cost_usd.toFixed(2)}/run`, 'info'),
      new DashboardItem('Avg Duration', `${(m.avg_duration_ms / 1000).toFixed(1)}s`, 'info'),
      new DashboardItem('Tests Created', `${m.avg_tests_created.toFixed(0)} avg/run`, 'info'),
      new DashboardItem('Window', `Last ${m.window} runs`, 'info'),
    ];
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

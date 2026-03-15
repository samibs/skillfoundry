// Status Bar — Shows gate pass rate and clickable actions in the VS Code status bar.

import * as vscode from 'vscode';
import { SfBridge } from '../bridge';

export class StatusBarManager {
  private passRateItem: vscode.StatusBarItem;

  constructor(private bridge: SfBridge) {
    this.passRateItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.passRateItem.command = 'skillfoundry.metrics';
    this.passRateItem.tooltip = 'SkillFoundry — Click to view metrics';
  }

  refresh(): void {
    const metrics = this.bridge.getMetrics();

    if (!metrics || metrics.total_runs === 0) {
      this.passRateItem.text = '$(shield) SF';
      this.passRateItem.tooltip = 'SkillFoundry — No telemetry data yet';
      this.passRateItem.show();
      return;
    }

    const pct = (metrics.gate_pass_rate * 100).toFixed(0);
    const icon = metrics.gate_pass_rate >= 0.9 ? '$(pass)' :
                 metrics.gate_pass_rate >= 0.7 ? '$(warning)' :
                 '$(error)';

    this.passRateItem.text = `${icon} SF: ${pct}%`;
    this.passRateItem.tooltip = `SkillFoundry — Gate pass rate: ${pct}% (${metrics.total_runs} runs, trend: ${metrics.trend})`;

    if (metrics.gate_pass_rate < 0.7) {
      this.passRateItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (metrics.gate_pass_rate < 0.9) {
      this.passRateItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.passRateItem.backgroundColor = undefined;
    }

    this.passRateItem.show();
  }

  dispose(): void {
    this.passRateItem.dispose();
  }
}

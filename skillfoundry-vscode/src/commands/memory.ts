// Memory commands — Recall knowledge entries via QuickPick, create PRDs.

import * as vscode from 'vscode';
import { SfBridge } from '../bridge';

export function registerMemoryCommands(
  context: vscode.ExtensionContext,
  bridge: SfBridge,
  outputChannel: vscode.OutputChannel,
): void {

  // Memory Recall
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.memory', async () => {
      const query = await vscode.window.showInputBox({
        placeHolder: 'Search memory (e.g., "auth", "security", "decision")',
        prompt: 'Enter search query for memory recall (leave empty for all)',
      });
      if (query === undefined) return; // cancelled

      const entries = bridge.recallMemory(query || undefined);

      if (entries.length === 0) {
        vscode.window.showInformationMessage('No matching memory entries found.');
        return;
      }

      const items = entries.slice(0, 50).map((entry) => ({
        label: `$(${entry.type === 'decision' ? 'milestone' : entry.type === 'error' ? 'error' : entry.type === 'fact' ? 'info' : 'note'}) ${entry.type}`,
        description: `w=${(entry.weight || 0.5).toFixed(2)}`,
        detail: entry.content.slice(0, 200),
        entry,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${entries.length} entries found — select to view`,
        matchOnDetail: true,
      });

      if (selected) {
        // Show full entry in output channel
        outputChannel.appendLine('');
        outputChannel.appendLine(`━━━ Memory Entry: ${selected.entry.id} ━━━`);
        outputChannel.appendLine(`Type: ${selected.entry.type}`);
        outputChannel.appendLine(`Weight: ${selected.entry.weight || 0.5}`);
        outputChannel.appendLine(`Created: ${selected.entry.created_at}`);
        outputChannel.appendLine(`Tags: ${(selected.entry.tags || []).join(', ')}`);
        outputChannel.appendLine(`Content: ${selected.entry.content}`);
        outputChannel.appendLine('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        outputChannel.show(true);
      }
    }),
  );

  // Create PRD
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.prd', async () => {
      const idea = await vscode.window.showInputBox({
        placeHolder: 'Describe the feature (e.g., "user authentication with OAuth2")',
        prompt: 'Feature idea for the PRD',
      });
      if (!idea) return;

      // Validate input: reject shell metacharacters to prevent command injection
      if (/[;|&$`\\!{}()\[\]<>\n\r]/.test(idea)) {
        vscode.window.showErrorMessage('SkillFoundry: Feature description contains invalid characters. Use only letters, numbers, spaces, hyphens, and basic punctuation.');
        return;
      }

      // Create PRD in terminal using sf CLI with env var to avoid shell interpolation
      const terminal = vscode.window.createTerminal({
        name: 'SkillFoundry PRD',
        cwd: bridge.getWorkDir(),
        env: { SF_PRD_IDEA: idea },
      });
      terminal.show();
      terminal.sendText('sf prd "$SF_PRD_IDEA"');
    }),
  );

  // View Metrics (opens output with formatted metrics)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.metrics', async () => {
      const metrics = await bridge.getMetrics();
      if (!metrics || metrics.total_runs === 0) {
        vscode.window.showInformationMessage('No telemetry data yet. Run /forge to start collecting metrics.');
        return;
      }

      outputChannel.appendLine('');
      outputChannel.appendLine('━━━ Quality Metrics ━━━');
      outputChannel.appendLine(`  Total Runs: ${metrics.total_runs}`);
      outputChannel.appendLine(`  Gate Pass Rate: ${(metrics.gate_pass_rate * 100).toFixed(1)}%`);
      outputChannel.appendLine(`  Trend: ${metrics.trend}`);
      outputChannel.appendLine(`  Avg Cost: $${metrics.avg_cost_usd.toFixed(2)}/run`);
      outputChannel.appendLine(`  Security: ${metrics.avg_security_findings.critical}C ${metrics.avg_security_findings.high}H ${metrics.avg_security_findings.medium}M ${metrics.avg_security_findings.low}L avg`);
      outputChannel.appendLine(`  Tests Created: ${metrics.avg_tests_created.toFixed(0)} avg/run`);
      outputChannel.appendLine(`  Avg Duration: ${(metrics.avg_duration_ms / 1000).toFixed(1)}s`);
      outputChannel.appendLine('━━━━━━━━━━━━━━━━━━━━━━━');
      outputChannel.show(true);
    }),
  );

  // View Report
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.report', async () => {
      const report = await bridge.generateReport();
      if (!report || report.summary.total_runs === 0) {
        vscode.window.showInformationMessage('No telemetry data for report generation.');
        return;
      }

      const markdown = await bridge.formatReportMarkdown(report);

      // Show in a webview panel
      const panel = vscode.window.createWebviewPanel(
        'sfReport',
        'SkillFoundry Quality Report',
        vscode.ViewColumn.One,
        { enableScripts: false },
      );

      panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; line-height: 1.6; }
    h1 { color: var(--vscode-textLink-foreground); }
    h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 8px; text-align: left; }
    th { background: var(--vscode-editor-selectionBackground); }
    pre { background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;
    }),
  );

  // Scan Dependencies
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.scanDeps', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'SkillFoundry: Scanning dependencies...', cancellable: false },
        async () => {
          const report = await bridge.scanDependencies();
          if (!report) {
            vscode.window.showErrorMessage('Dependency scan failed. Ensure sf_cli is built (cd sf_cli && npm run build).');
            return;
          }

          outputChannel.appendLine(`[${new Date().toISOString()}] Dependency scan: ${report.verdict} (${report.total_vulnerable} vulnerable)`);
          outputChannel.show(true);

          if (report.total_vulnerable > 0) {
            vscode.window.showWarningMessage(`SkillFoundry: ${report.total_vulnerable} vulnerable dependencies found (${report.summary.critical}C ${report.summary.high}H).`);
          } else {
            vscode.window.showInformationMessage('SkillFoundry: No vulnerable dependencies found.');
          }

          return report;
        },
      );
    }),
  );

  // Benchmark
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.benchmark', async () => {
      const terminal = vscode.window.createTerminal({ name: 'SkillFoundry Benchmark', cwd: bridge.getWorkDir() });
      terminal.show();
      terminal.sendText('sf benchmark');
    }),
  );

  // Manage Hooks
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.hook', async () => {
      const action = await vscode.window.showQuickPick(['Install Hooks', 'Uninstall Hooks', 'Check Status'], {
        placeHolder: 'Git hook management',
      });
      if (!action) return;

      const cmd = action === 'Install Hooks' ? 'sf hook install' :
                  action === 'Uninstall Hooks' ? 'sf hook uninstall' :
                  'sf hook status';

      const terminal = vscode.window.createTerminal({ name: 'SkillFoundry Hooks', cwd: bridge.getWorkDir() });
      terminal.show();
      terminal.sendText(cmd);
    }),
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

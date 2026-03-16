// Gate commands — Run single or all quality gates from VS Code.

import * as vscode from 'vscode';
import { SfBridge } from '../bridge';
import { GateTimelineProvider } from '../providers/gate-timeline';
import { DiagnosticsManager } from '../providers/diagnostics';

const GATE_TIERS = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

export function registerGateCommands(
  context: vscode.ExtensionContext,
  bridge: SfBridge,
  gateTimeline: GateTimelineProvider,
  diagnostics: DiagnosticsManager,
  outputChannel: vscode.OutputChannel,
): void {

  // Run All Gates
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.gateAll', async () => {
      outputChannel.appendLine(`[${new Date().toISOString()}] Running all gates...`);
      outputChannel.show(true);

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'SkillFoundry: Running all gates...', cancellable: false },
        async () => {
          const summary = await bridge.runAllGates();
          if (!summary) {
            vscode.window.showErrorMessage('SkillFoundry: Gate execution failed. Ensure sf_cli is built (cd sf_cli && npm run build).');
            return;
          }

          gateTimeline.setLastRun(summary);
          diagnostics.updateFromGateResults(summary.gates);

          for (const gate of summary.gates) {
            outputChannel.appendLine(`  ${gate.tier} ${gate.name}: ${gate.status.toUpperCase()} (${gate.durationMs}ms)`);
          }
          outputChannel.appendLine(`  Verdict: ${summary.verdict}`);

          if (summary.failed > 0) {
            vscode.window.showWarningMessage(`SkillFoundry: ${summary.failed} gate(s) failed. Check Gate Timeline.`);
          } else {
            vscode.window.showInformationMessage(`SkillFoundry: All gates passed (${summary.passed}P ${summary.warned}W).`);
          }
        },
      );
    }),
  );

  // Run Single Gate (with tier selection)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.gate', async (tier?: string) => {
      const selectedTier = tier || await vscode.window.showQuickPick(GATE_TIERS, {
        placeHolder: 'Select gate tier to run',
      });
      if (!selectedTier) return;

      outputChannel.appendLine(`[${new Date().toISOString()}] Running gate ${selectedTier}...`);

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `SkillFoundry: Running ${selectedTier}...`, cancellable: false },
        async () => {
          const result = await bridge.runGate(selectedTier);
          if (!result) {
            vscode.window.showErrorMessage('SkillFoundry: Gate execution failed. Check Output > SkillFoundry for details.');
            return;
          }

          outputChannel.appendLine(`  ${result.tier} ${result.name}: ${result.status.toUpperCase()} (${result.durationMs}ms)`);
          if (result.detail) outputChannel.appendLine(`  ${result.detail.split('\n')[0]}`);

          if (result.status === 'fail') {
            vscode.window.showWarningMessage(`SkillFoundry: ${result.tier} ${result.name} FAILED`);
          } else {
            vscode.window.showInformationMessage(`SkillFoundry: ${result.tier} ${result.name} ${result.status.toUpperCase()}`);
          }
        },
      );
    }),
  );

  // Run Gate on Current File
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.gateFile', async (uri?: vscode.Uri, tier?: string) => {
      const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showWarningMessage('SkillFoundry: No file selected.');
        return;
      }

      const selectedTier = tier || await vscode.window.showQuickPick(['T1', 'T4', 'T1+T4'], {
        placeHolder: `Select gate for ${fileUri.fsPath.split('/').pop()}`,
      });
      if (!selectedTier) return;

      const tiers = selectedTier === 'T1+T4' ? ['T1', 'T4'] : [selectedTier];
      const relativePath = vscode.workspace.asRelativePath(fileUri);

      outputChannel.appendLine(`[${new Date().toISOString()}] Running ${selectedTier} on ${relativePath}...`);

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `SkillFoundry: ${selectedTier} on ${relativePath}`, cancellable: false },
        async () => {
          for (const t of tiers) {
            const result = await bridge.runGate(t, relativePath);
            if (result) {
              diagnostics.updateForFile(fileUri, result);
              outputChannel.appendLine(`  ${result.tier}: ${result.status.toUpperCase()}`);
            }
          }
        },
      );
    }),
  );
}

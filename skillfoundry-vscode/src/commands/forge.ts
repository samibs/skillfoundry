// Forge command — Start the forge pipeline in an integrated terminal.
// Forge is too heavy for direct import (multi-turn AI loops), so it runs in a terminal.
// Progress is shown via a notification + ForgeMonitor sidebar (watches forge-state.json).

import * as vscode from 'vscode';
import { SfBridge } from '../bridge';
import { ForgeMonitorProvider } from '../providers/forge-monitor';

export function registerForgeCommands(
  context: vscode.ExtensionContext,
  bridge: SfBridge,
  forgeMonitor: ForgeMonitorProvider,
  outputChannel: vscode.OutputChannel,
): void {

  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.forge', async () => {
      const prdFiles = await vscode.workspace.findFiles('genesis/*.md', '**/node_modules/**');
      if (prdFiles.length === 0) {
        const create = await vscode.window.showWarningMessage(
          'No PRDs found in genesis/. Create one first.',
          'Create PRD',
        );
        if (create) {
          vscode.commands.executeCommand('skillfoundry.prd');
        }
        return;
      }

      const options = ['Full Pipeline', 'Full Pipeline (Blitz/TDD)', 'Dry Run'];
      const choice = await vscode.window.showQuickPick(options, {
        placeHolder: `Forge ${prdFiles.length} PRD(s) — select mode`,
      });
      if (!choice) return;

      const flag = choice === 'Full Pipeline (Blitz/TDD)' ? ' --blitz' :
                   choice === 'Dry Run' ? ' --dry-run' : '';

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `SkillFoundry Forge — ${choice}`,
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Launching pipeline...' });

          forgeMonitor.startWatching();

          const terminal = vscode.window.createTerminal({
            name: 'SkillFoundry Forge',
            cwd: bridge.getWorkDir(),
            env: bridge.getCredentials(),
          });
          terminal.show();
          terminal.sendText(`sf forge${flag}`);

          outputChannel.appendLine(`[${new Date().toISOString()}] Forge started (${choice})`);

          await new Promise<void>((resolve) => {
            const closeListener = vscode.window.onDidCloseTerminal((t) => {
              if (t === terminal) {
                closeListener.dispose();
                cancelListener.dispose();
                resolve();
              }
            });

            const cancelListener = token.onCancellationRequested(() => {
              terminal.dispose();
              closeListener.dispose();
              cancelListener.dispose();
              resolve();
            });
          });

          forgeMonitor.stopWatching();
          forgeMonitor.refresh();
          outputChannel.appendLine(`[${new Date().toISOString()}] Forge finished (${choice})`);
          progress.report({ message: 'Done. See Forge Monitor for results.' });
        },
      );
    }),
  );
}

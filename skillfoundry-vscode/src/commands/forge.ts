// Forge command — Start the forge pipeline in an integrated terminal.
// Forge is too heavy for direct import (multi-turn AI loops), so it runs in a terminal.

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

      // Start watching forge state for progress
      forgeMonitor.startWatching();

      // Run forge in integrated terminal
      const terminal = vscode.window.createTerminal({
        name: 'SkillFoundry Forge',
        cwd: bridge.getWorkDir(),
      });
      terminal.show();
      terminal.sendText(`sf forge${flag}`);

      outputChannel.appendLine(`[${new Date().toISOString()}] Forge started (${choice})`);

      // Listen for terminal close to stop watching
      const disposeListener = vscode.window.onDidCloseTerminal((t) => {
        if (t === terminal) {
          forgeMonitor.stopWatching();
          forgeMonitor.refresh();
          outputChannel.appendLine(`[${new Date().toISOString()}] Forge terminal closed`);
          disposeListener.dispose();
        }
      });
    }),
  );
}

// Example onboarding command — scaffold the Todo-API PRD and run the forge
// pipeline, watched live. This is the fastest path from a fresh install to a
// first successful, *observed* pipeline run. No mode choice, no provider choice:
// everything needed to succeed is a default, not a question.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SfBridge } from '../bridge';
import { ForgeMonitorProvider } from '../providers/forge-monitor';

export function registerExampleCommand(
  context: vscode.ExtensionContext,
  bridge: SfBridge,
  forgeMonitor: ForgeMonitorProvider,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.runExample', async () => {
      const workDir = bridge.getWorkDir();
      const genesisDir = path.join(workDir, 'genesis');
      const target = path.join(genesisDir, 'todo-api.md');

      // 1. Scaffold the bundled example PRD into genesis/ (idempotent — never
      //    overwrites a PRD the user already has).
      let scaffolded = false;
      if (!fs.existsSync(target)) {
        const bundled = vscode.Uri.joinPath(
          context.extensionUri, 'resources', 'example-prd', 'todo-api.md',
        );
        try {
          const prd = await vscode.workspace.fs.readFile(bundled);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(genesisDir));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(target), prd);
          scaffolded = true;
        } catch (err) {
          vscode.window.showErrorMessage(
            `SkillFoundry: could not scaffold the example PRD — ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return;
        }
      }

      outputChannel.appendLine(
        `[${new Date().toISOString()}] Example project: ${
          scaffolded ? 'scaffolded' : 'reused existing'
        } genesis/todo-api.md`,
      );

      // 2. Open the PRD so the user sees what is about to be built.
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      await vscode.window.showTextDocument(doc, { preview: true });

      // 3. Reveal the Forge Monitor and start watching BEFORE launch, so the
      //    gates light up live — the whole point of running the example.
      forgeMonitor.startWatching();
      try {
        await vscode.commands.executeCommand('sf.forge.focus');
      } catch {
        // View focus is best-effort; the run continues regardless.
      }

      // 4. Launch the default pipeline in a terminal. No "Full / Blitz / Dry Run"
      //    prompt on the happy path — the example always runs the full pipeline.
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'SkillFoundry — building the example Todo API',
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: 'Launching forge pipeline…' });

          const terminal = vscode.window.createTerminal({
            name: 'SkillFoundry Forge — Example',
            cwd: workDir,
            env: bridge.getCredentials(),
          });
          terminal.show();
          terminal.sendText('sf forge');

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
          progress.report({ message: 'Done. See the Forge Monitor for gate results.' });
        },
      );
    }),
  );
}

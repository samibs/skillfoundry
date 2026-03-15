// SkillFoundry VS Code Extension — Entry Point
// Provides quality gates, telemetry dashboard, dependency scanning,
// and forge pipeline monitoring directly in VS Code.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SfBridge } from './bridge';
import { DashboardProvider } from './providers/dashboard';
import { GateTimelineProvider } from './providers/gate-timeline';
import { DependencyProvider } from './providers/dependency';
import { ForgeMonitorProvider } from './providers/forge-monitor';
import { DiagnosticsManager } from './providers/diagnostics';
import { SfCodeLensProvider } from './providers/codelens';
import { StatusBarManager } from './providers/statusbar';
import { registerGateCommands } from './commands/gate';
import { registerForgeCommands } from './commands/forge';
import { registerMemoryCommands } from './commands/memory';

export function activate(context: vscode.ExtensionContext): void {
  const workDir = getWorkDir();
  if (!workDir) {
    // No workspace — register placeholder commands that show a message
    registerPlaceholderCommands(context);
    return;
  }

  // Check for .skillfoundry/config.toml to confirm SF is installed
  const configPath = path.join(workDir, '.skillfoundry', 'config.toml');
  if (!fs.existsSync(configPath)) {
    vscode.window.showInformationMessage(
      'SkillFoundry not detected in this workspace. Run the install script or `npx skillfoundry init` to set up.',
    );
    registerPlaceholderCommands(context);
    return;
  }

  // Initialize bridge
  const bridge = new SfBridge(workDir);

  // Output channel for all SF logs
  const outputChannel = vscode.window.createOutputChannel('SkillFoundry');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine(`[${new Date().toISOString()}] SkillFoundry extension activated`);
  outputChannel.appendLine(`  Workspace: ${workDir}`);
  outputChannel.appendLine(`  sf_cli available: ${bridge.isAvailable()}`);

  // ── Providers ──────────────────────────────────────────────

  // Sidebar: Quality Dashboard
  const dashboardProvider = new DashboardProvider(bridge);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sf.dashboard', dashboardProvider),
  );

  // Sidebar: Gate Timeline
  const gateTimelineProvider = new GateTimelineProvider(bridge);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sf.gates', gateTimelineProvider),
  );

  // Sidebar: Dependencies
  const dependencyProvider = new DependencyProvider(bridge);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sf.dependencies', dependencyProvider),
  );

  // Sidebar: Forge Monitor
  const forgeMonitorProvider = new ForgeMonitorProvider(workDir);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sf.forge', forgeMonitorProvider),
  );

  // Inline diagnostics from gate findings
  const diagnosticsManager = new DiagnosticsManager();
  context.subscriptions.push(diagnosticsManager);

  // CodeLens for gate actions
  const codeLensProvider = new SfCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'csharp' },
      ],
      codeLensProvider,
    ),
  );

  // Status bar
  const statusBarManager = new StatusBarManager(bridge);
  context.subscriptions.push(statusBarManager);
  statusBarManager.refresh();

  // ── Commands ───────────────────────────────────────────────

  registerGateCommands(context, bridge, gateTimelineProvider, diagnosticsManager, outputChannel);
  registerForgeCommands(context, bridge, forgeMonitorProvider, outputChannel);
  registerMemoryCommands(context, bridge, outputChannel);

  // Refresh command — refreshes all providers
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.refresh', () => {
      dashboardProvider.refresh();
      gateTimelineProvider.refresh();
      dependencyProvider.refresh();
      forgeMonitorProvider.refresh();
      statusBarManager.refresh();
      outputChannel.appendLine(`[${new Date().toISOString()}] Dashboard refreshed`);
    }),
  );

  // ── File Watcher ───────────────────────────────────────────

  const config = vscode.workspace.getConfiguration('skillfoundry');
  if (config.get<boolean>('autoRefresh', true)) {
    const telemetryPattern = new vscode.RelativePattern(workDir, '.skillfoundry/telemetry.jsonl');
    const watcher = vscode.workspace.createFileSystemWatcher(telemetryPattern);

    // Debounce refresh to avoid rapid updates
    let refreshTimeout: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        dashboardProvider.refresh();
        statusBarManager.refresh();
      }, 2000);
    };

    watcher.onDidChange(debouncedRefresh);
    watcher.onDidCreate(debouncedRefresh);
    context.subscriptions.push(watcher);
  }

  // Initial dashboard load
  dashboardProvider.refresh();
}

export function deactivate(): void {
  // Cleanup is handled by disposables registered in context.subscriptions
}

function getWorkDir(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  return folders[0].uri.fsPath;
}

function registerPlaceholderCommands(context: vscode.ExtensionContext): void {
  const commands = [
    'skillfoundry.gateAll', 'skillfoundry.gate', 'skillfoundry.gateFile',
    'skillfoundry.forge', 'skillfoundry.metrics', 'skillfoundry.report',
    'skillfoundry.benchmark', 'skillfoundry.hook', 'skillfoundry.memory',
    'skillfoundry.prd', 'skillfoundry.scanDeps', 'skillfoundry.refresh',
  ];
  for (const cmd of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => {
        vscode.window.showInformationMessage(
          'SkillFoundry not detected. Run the install script or `npx skillfoundry init` in this workspace first.',
        );
      }),
    );
  }
}

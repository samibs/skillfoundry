// SkillFoundry VS Code Extension — Entry Point
// Provides quality gates, telemetry dashboard, dependency scanning,
// and forge pipeline monitoring directly in VS Code.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
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
import { registerSetupCommand, runSetupWizard, secretKeyFor, envVarFor } from './commands/setup';

export function activate(context: vscode.ExtensionContext): void {
  const workDir = getWorkDir();

  // Output channel available even when no workspace/install detected
  const outputChannel = vscode.window.createOutputChannel('SkillFoundry');
  context.subscriptions.push(outputChannel);

  if (!workDir) {
    registerPlaceholderCommands(context);
    return;
  }

  // Detect SkillFoundry installation:
  // 1. Primary: .skillfoundry/config.toml (new installs)
  // 2. Fallback: platform folders from older installs (.claude/commands, agents/, etc.)
  const configPath = path.join(workDir, '.skillfoundry', 'config.toml');
  const hasConfigToml = fs.existsSync(configPath);
  const hasLegacyInstall = (
    fs.existsSync(path.join(workDir, '.claude', 'commands')) ||
    fs.existsSync(path.join(workDir, '.copilot', 'custom-agents')) ||
    fs.existsSync(path.join(workDir, '.cursor', 'rules')) ||
    fs.existsSync(path.join(workDir, '.agents', 'skills')) ||
    fs.existsSync(path.join(workDir, '.gemini', 'skills'))
  ) && fs.existsSync(path.join(workDir, 'agents'));

  if (!hasConfigToml && !hasLegacyInstall) {
    registerPlaceholderCommands(context);
    registerSetupCommand(context, workDir, outputChannel);

    vscode.window.showInformationMessage(
      'SkillFoundry not detected. Run Setup to configure your API key and workspace.',
      'Setup Now',
    ).then((action) => {
      if (action === 'Setup Now') {
        vscode.commands.executeCommand('skillfoundry.setup');
      }
    });
    return;
  }

  // Prompt to update if legacy install lacks config.toml
  if (!hasConfigToml && hasLegacyInstall) {
    vscode.window.showInformationMessage(
      'SkillFoundry detected (legacy install). Run `update.sh` to enable full VS Code integration.',
    );
  }

  // Initialize bridge
  const bridge = new SfBridge(workDir);

  outputChannel.appendLine(`[${new Date().toISOString()}] SkillFoundry extension activated`);
  outputChannel.appendLine(`  Workspace: ${workDir}`);
  outputChannel.appendLine(`  sf_cli path: ${bridge.getSfCliPath()}`);
  outputChannel.appendLine(`  sf_cli available: ${bridge.isAvailable()}`);

  // Load stored API key and inject into bridge subprocess env
  loadAndInjectCredentials(context, configPath, bridge, outputChannel);

  // Check sf CLI on PATH; offer npm install if missing
  checkAndOfferSfCli(bridge, outputChannel);

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

  registerSetupCommand(context, workDir, outputChannel);
  registerGateCommands(context, bridge, gateTimelineProvider, diagnosticsManager, outputChannel);
  registerForgeCommands(context, bridge, forgeMonitorProvider, outputChannel);
  registerMemoryCommands(context, bridge, outputChannel);

  // Open Last Report command — opens .skillfoundry/report.html in browser
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.openReport', () => {
      const reportPath = path.join(workDir, '.skillfoundry', 'report.html');
      if (fs.existsSync(reportPath)) {
        vscode.env.openExternal(vscode.Uri.file(reportPath));
      } else {
        vscode.window.showInformationMessage(
          'No report found. Run `sf report --html` to generate one.',
        );
      }
    }),
  );

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

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
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
  // Note: skillfoundry.setup is NOT in this list — it is registered separately
  // so the wizard runs even when no SkillFoundry install is detected.
  const commands = [
    'skillfoundry.gateAll', 'skillfoundry.gate', 'skillfoundry.gateFile',
    'skillfoundry.forge', 'skillfoundry.metrics', 'skillfoundry.report',
    'skillfoundry.benchmark', 'skillfoundry.hook', 'skillfoundry.memory',
    'skillfoundry.prd', 'skillfoundry.scanDeps', 'skillfoundry.openReport',
    'skillfoundry.refresh',
  ];
  for (const cmd of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => {
        vscode.window.showInformationMessage(
          'SkillFoundry not detected. Run SkillFoundry: Setup or `npx skillfoundry init` first.',
        );
      }),
    );
  }
}

/**
 * Read provider from config.toml, load stored key from SecretStorage,
 * and inject into bridge subprocess env so `sf` commands have credentials.
 */
function loadAndInjectCredentials(
  context: vscode.ExtensionContext,
  configPath: string,
  bridge: SfBridge,
  outputChannel: vscode.OutputChannel,
): void {
  let providerId = 'anthropic';
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const match = raw.match(/provider\s*=\s*"([^"]+)"/);
    if (match) providerId = match[1];
  } catch {
    // config.toml missing or unreadable — default to anthropic
  }

  context.secrets.get(secretKeyFor(providerId)).then((key) => {
    if (key) {
      bridge.setCredential(envVarFor(providerId), key);
      outputChannel.appendLine(
        `[${new Date().toISOString()}] Credentials loaded for provider: ${providerId}`,
      );
    } else {
      outputChannel.appendLine(
        `[${new Date().toISOString()}] No stored key for ${providerId}. Run SkillFoundry: Setup to add one.`,
      );
    }
  });
}

/**
 * Check if the `sf` binary is on PATH.
 * If not, and the bridge runner is also missing, offer npm install.
 */
function checkAndOfferSfCli(bridge: SfBridge, outputChannel: vscode.OutputChannel): void {
  execFile('sf', ['--version'], { timeout: 5000 }, (err) => {
    const sfOnPath = !err;
    outputChannel.appendLine(
      `[${new Date().toISOString()}] sf CLI on PATH: ${sfOnPath}`,
    );

    if (!sfOnPath && !bridge.isAvailable()) {
      vscode.window.showWarningMessage(
        'SkillFoundry CLI (sf) not found. Gate runs and forge require it.',
        'Install via npm',
        'Not Now',
      ).then((action) => {
        if (action === 'Install via npm') {
          const terminal = vscode.window.createTerminal({ name: 'SkillFoundry Install' });
          terminal.show();
          terminal.sendText('npm install -g skillfoundry');
        }
      });
    }
  });
}

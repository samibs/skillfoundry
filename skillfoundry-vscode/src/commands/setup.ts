// Setup command — API key wizard for first-time configuration.
// Keys are stored in VS Code SecretStorage, never written to disk.
// config.toml is written with provider name only (no key).

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PROVIDERS: Array<{ label: string; id: string; envVar: string; placeholder: string }> = [
  {
    label: 'Anthropic Claude',
    id: 'anthropic',
    envVar: 'SF_ANTHROPIC_API_KEY',
    placeholder: 'sk-ant-api03-...',
  },
  {
    label: 'OpenAI',
    id: 'openai',
    envVar: 'SF_OPENAI_API_KEY',
    placeholder: 'sk-proj-...',
  },
];

export function secretKeyFor(providerId: string): string {
  return `skillfoundry.${providerId}.apiKey`;
}

export function envVarFor(providerId: string): string {
  return PROVIDERS.find(p => p.id === providerId)?.envVar ?? 'SF_ANTHROPIC_API_KEY';
}

export async function runSetupWizard(
  context: vscode.ExtensionContext,
  workDir: string,
  outputChannel: vscode.OutputChannel,
): Promise<boolean> {
  const providerChoice = await vscode.window.showQuickPick(
    PROVIDERS.map(p => ({ label: p.label, description: p.id })),
    { placeHolder: 'Select AI provider', title: 'SkillFoundry Setup (1 of 2)' },
  );
  if (!providerChoice) return false;

  const provider = PROVIDERS.find(p => p.id === providerChoice.description)!;

  const apiKey = await vscode.window.showInputBox({
    prompt: `Paste your ${provider.label} API key`,
    placeHolder: provider.placeholder,
    password: true,
    title: 'SkillFoundry Setup (2 of 2)',
    validateInput: (v) => (v.trim().length < 20 ? 'Key appears too short' : undefined),
  });
  if (!apiKey) return false;

  await context.secrets.store(secretKeyFor(provider.id), apiKey.trim());

  const sfDir = path.join(workDir, '.skillfoundry');
  if (!fs.existsSync(sfDir)) fs.mkdirSync(sfDir, { recursive: true });

  const configPath = path.join(sfDir, 'config.toml');
  fs.writeFileSync(configPath, `[core]\nprovider = "${provider.id}"\n`, 'utf-8');

  outputChannel.appendLine(
    `[${new Date().toISOString()}] Setup complete: provider=${provider.id}, key stored in SecretStorage`,
  );

  const action = await vscode.window.showInformationMessage(
    `SkillFoundry configured with ${provider.label}. Reload window to activate.`,
    'Reload Window',
  );
  if (action === 'Reload Window') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }

  return true;
}

export function registerSetupCommand(
  context: vscode.ExtensionContext,
  workDir: string,
  outputChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfoundry.setup', () =>
      runSetupWizard(context, workDir, outputChannel),
    ),
  );
}

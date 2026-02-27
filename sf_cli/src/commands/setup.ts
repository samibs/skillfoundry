import { createInterface } from 'node:readline';
import type { SlashCommand, SessionContext } from '../types.js';
import {
  loadCredentials,
  setCredential,
  removeCredential,
  getCredentialsPath,
  injectCredentials,
  hasAnyCredentials,
  PROVIDER_KEY_URLS,
} from '../core/credentials.js';
import {
  AVAILABLE_PROVIDERS,
  detectAvailableProviders,
} from '../core/provider.js';

// ---------------------------------------------------------------------------
// Non-interactive setup (called from the `sf setup` CLI subcommand)
// ---------------------------------------------------------------------------

export interface SetupOptions {
  provider?: string;
  key?: string;
  authToken?: string;
  remove?: boolean;
  list?: boolean;
}

export function runSetupNonInteractive(opts: SetupOptions): string {
  if (opts.list) {
    return listConfiguredProviders();
  }

  if (opts.remove && opts.provider) {
    removeCredential(opts.provider);
    return `Removed credentials for ${opts.provider}.`;
  }

  if (!opts.provider) {
    return (
      'Error: --provider is required.\n' +
      'Usage: sf setup --provider anthropic --key sk-ant-...\n' +
      `Available providers: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`
    );
  }

  if (!AVAILABLE_PROVIDERS[opts.provider]) {
    return (
      `Unknown provider: ${opts.provider}\n` +
      `Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`
    );
  }

  if (opts.authToken && opts.provider === 'anthropic') {
    setCredential(opts.provider, 'auth_token', opts.authToken);
    injectCredentials();
    return `Saved auth_token for ${opts.provider} to ${getCredentialsPath()}`;
  }

  if (!opts.key) {
    return (
      'Error: --key is required.\n' +
      `Get your key at: ${PROVIDER_KEY_URLS[opts.provider] || 'provider website'}`
    );
  }

  const isLocal = opts.provider === 'ollama' || opts.provider === 'lmstudio';
  const field = isLocal ? 'base_url' : 'api_key';
  setCredential(opts.provider, field, opts.key);
  injectCredentials();
  return `Saved ${field} for ${opts.provider} to ${getCredentialsPath()}`;
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function listConfiguredProviders(): string {
  const store = loadCredentials();
  const available = detectAvailableProviders();
  const lines = ['Configured Providers', ''];

  for (const [key, info] of Object.entries(AVAILABLE_PROVIDERS)) {
    const hasCred =
      store[key] &&
      Object.values(store[key] as Record<string, string>).some((v) => v);
    const hasEnv = available.includes(key);
    let status: string;
    if (key === 'ollama' || key === 'lmstudio') {
      status = 'always available (local)';
    } else if (hasEnv && hasCred) {
      status = 'configured (env + stored)';
    } else if (hasEnv) {
      status = 'configured (env var)';
    } else if (hasCred) {
      status = 'configured (stored credential)';
    } else {
      status = 'not configured';
    }

    lines.push(`  ${key}: ${info.name} — ${status}`);
    if (!hasEnv && !hasCred && key !== 'ollama' && key !== 'lmstudio') {
      lines.push(
        `    Get key: ${PROVIDER_KEY_URLS[key] || 'N/A'}`,
      );
    }
  }

  lines.push('');
  lines.push(`Credential file: ${getCredentialsPath()}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Interactive first-run setup (launched from index.tsx when no credentials)
// ---------------------------------------------------------------------------

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Check if user input is an exit/quit command.
 */
function isQuitInput(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return ['q', 'quit', 'exit', '/exit', '/quit'].includes(normalized);
}

/**
 * Interactive setup wizard. Called at startup when no credentials are detected.
 * Returns 'configured' | 'skipped' | 'quit'.
 */
export async function runInteractiveSetup(): Promise<'configured' | 'skipped' | 'quit'> {
  if (hasAnyCredentials()) return 'configured';

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('');
    console.log('  SkillFoundry CLI — First-Run Setup');
    console.log('  ===================================');
    console.log('');
    console.log('  No API key detected. Choose a provider to get started:');
    console.log('');

    const localProviders = ['ollama', 'lmstudio'];
    const providers = Object.entries(AVAILABLE_PROVIDERS).filter(
      ([k]) => !localProviders.includes(k),
    );

    for (let i = 0; i < providers.length; i++) {
      const [key, info] = providers[i];
      const url = PROVIDER_KEY_URLS[key] || '';
      console.log(`    ${i + 1}) ${info.name}`);
      console.log(`       Get key: ${url}`);
    }
    console.log(`    ${providers.length + 1}) Ollama (local, no key needed)`);
    console.log(`    ${providers.length + 2}) LM Studio (local, no key needed)`);
    console.log(`    ${providers.length + 3}) Skip (configure later with sf setup)`);
    console.log('');
    console.log('  Type q or /exit to quit.');
    console.log('');

    const choice = await prompt(rl, '  Select provider [1]: ');

    // Quit
    if (isQuitInput(choice)) {
      console.log('');
      console.log('  Goodbye.');
      rl.close();
      return 'quit';
    }

    const idx = parseInt(choice || '1', 10) - 1;

    // Skip
    if (idx === providers.length + 2 || isNaN(idx) || idx < 0) {
      console.log('');
      console.log('  Skipped. Run `sf setup --provider <name> --key <key>` later.');
      console.log('  Or use /setup inside the REPL.');
      console.log('');
      rl.close();
      return 'skipped';
    }

    // Ollama
    if (idx === providers.length) {
      console.log('');
      console.log('  Ollama selected — no API key needed.');
      console.log('  Make sure Ollama is running: https://ollama.com/download');
      console.log('');
      rl.close();
      return 'configured';
    }

    // LM Studio
    if (idx === providers.length + 1) {
      console.log('');
      console.log('  LM Studio selected — no API key needed.');
      console.log('  Make sure LM Studio is running: https://lmstudio.ai/docs');
      console.log('');
      rl.close();
      return 'configured';
    }

    // Cloud provider
    const [providerKey, providerInfo] = providers[idx];
    const keyUrl = PROVIDER_KEY_URLS[providerKey] || '';

    console.log('');
    console.log(`  Selected: ${providerInfo.name}`);
    if (keyUrl) {
      console.log(`  Get your API key at: ${keyUrl}`);
    }
    console.log('');

    const apiKey = await prompt(rl, '  Paste your API key (or q to quit): ');
    rl.close();

    if (isQuitInput(apiKey)) {
      console.log('');
      console.log('  Goodbye.');
      return 'quit';
    }

    if (!apiKey.trim()) {
      console.log('  No key entered. Run `sf setup` later to configure.');
      return 'skipped';
    }

    setCredential(providerKey, 'api_key', apiKey.trim());
    injectCredentials();

    console.log('');
    console.log(`  Saved! ${providerInfo.name} is ready.`);
    console.log(`  Credential stored at: ${getCredentialsPath()}`);
    console.log('');

    return 'configured';
  } catch {
    rl.close();
    return 'quit';
  }
}

// ---------------------------------------------------------------------------
// Slash command (interactive in REPL)
// ---------------------------------------------------------------------------

export const setupCommand: SlashCommand = {
  name: 'setup',
  description: 'Configure API keys for providers',
  usage: '/setup [list|<provider> <key>|remove <provider>]',
  execute: async (args: string, _session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0] || '';

    // /setup (no args) — show status and instructions
    if (!sub) {
      return (
        listConfiguredProviders() +
        '\n\n' +
        'Set a key: `/setup <provider> <api-key>`\n' +
        'Remove:    `/setup remove <provider>`\n' +
        'Or run `sf setup` from the terminal for full options.'
      );
    }

    // /setup list
    if (sub === 'list') {
      return listConfiguredProviders();
    }

    // /setup remove <provider>
    if (sub === 'remove') {
      const provider = parts[1];
      if (!provider || !AVAILABLE_PROVIDERS[provider]) {
        return (
          'Usage: /setup remove <provider>\n' +
          `Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`
        );
      }
      removeCredential(provider);
      return `Removed stored credentials for ${provider}.`;
    }

    // /setup <provider> <key>
    const provider = sub;
    const key = parts[1];

    if (!AVAILABLE_PROVIDERS[provider]) {
      return (
        `Unknown provider: ${provider}\n` +
        `Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`
      );
    }

    if (!key) {
      const url = PROVIDER_KEY_URLS[provider] || 'the provider website';
      return `Usage: /setup ${provider} <api-key>\nGet your key at: ${url}`;
    }

    const field = (provider === 'ollama' || provider === 'lmstudio') ? 'base_url' : 'api_key';
    setCredential(provider, field, key);
    injectCredentials();

    return (
      `Saved ${field} for ${provider}. Provider is now ready to use.\n` +
      `Credential stored at: ${getCredentialsPath()}`
    );
  },
};

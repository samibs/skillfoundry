import type { SlashCommand, SessionContext } from '../types.js';
import { AVAILABLE_PROVIDERS, detectAvailableProviders } from '../core/provider.js';
import { saveConfig } from '../core/config.js';

export const providerCommand: SlashCommand = {
  name: 'provider',
  description: 'List, switch, or show current provider',
  usage: '/provider [list|set <name>]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0] || 'list';

    if (sub === 'list') {
      const available = detectAvailableProviders();
      const lines = ['**Available Providers**', ''];

      for (const [key, info] of Object.entries(AVAILABLE_PROVIDERS)) {
        const isActive = key === session.config.provider;
        const hasKey = available.includes(key);
        const status = isActive ? ' (active)' : hasKey ? ' (ready)' : ' (no key)';
        const marker = isActive ? '>' : ' ';
        lines.push(`  ${marker} ${key}: ${info.name} [${info.defaultModel}]${status}`);
      }

      lines.push('');
      lines.push('Switch: /provider set <name>');
      return lines.join('\n');
    }

    if (sub === 'set') {
      const name = parts[1];
      if (!name) {
        return 'Usage: /provider set <name>\nAvailable: ' + Object.keys(AVAILABLE_PROVIDERS).join(', ');
      }

      const info = AVAILABLE_PROVIDERS[name];
      if (!info) {
        return `Unknown provider: ${name}\nAvailable: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`;
      }

      // Check if API key is available
      const available = detectAvailableProviders();
      if (!available.includes(name) && name !== 'ollama') {
        return (
          `No API key found for ${name}.\n\n` +
          `To configure, run one of:\n` +
          `  sf setup --provider ${name} --key <your-key>\n` +
          `  export ${info.envKey}=<your-key>\n` +
          `Or use /setup ${name} <key> in this session.`
        );
      }

      // Update config
      const newConfig = { ...session.config, provider: name, model: info.defaultModel };
      saveConfig(session.workDir, newConfig);

      return `Switched to ${info.name} (${info.defaultModel}). Config saved.`;
    }

    return `Current: ${session.config.provider}:${session.config.model}\nSub-commands: list, set <name>`;
  },
};

import type { SlashCommand, SessionContext } from '../types.js';
import { saveConfig } from '../core/config.js';

const EDITABLE_KEYS = [
  'provider', 'engine', 'model', 'fallback_provider', 'fallback_engine',
  'monthly_budget_usd', 'run_budget_usd', 'memory_sync_enabled', 'memory_sync_remote',
  'route_local_first', 'local_provider', 'local_model', 'context_window',
];

export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Show or update configuration',
  usage: '/config [key] [value]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    let parts = args.trim().split(/\s+/);
    // Support both "/config model gpt-4o" and "/config set model gpt-4o"
    if (parts[0] === 'set' || parts[0] === 'get') {
      parts = parts.slice(1);
    }
    const key = parts[0];
    const value = parts.slice(1).join(' ');

    // No args: show all config
    if (!key) {
      const lines = ['**Configuration** (.skillfoundry/config.toml)', ''];
      for (const [k, v] of Object.entries(session.config)) {
        lines.push(`  ${k} = ${JSON.stringify(v)}`);
      }
      lines.push('');
      lines.push('Edit: /config <key> <value>');
      return lines.join('\n');
    }

    // Key only: show that value
    if (!value) {
      const configRecord = session.config as unknown as Record<string, unknown>;
      if (key in configRecord) {
        return `${key} = ${JSON.stringify(configRecord[key])}`;
      }
      return `Unknown config key: ${key}\nAvailable: ${EDITABLE_KEYS.join(', ')}`;
    }

    // Key + value: update
    if (!EDITABLE_KEYS.includes(key)) {
      return `Cannot set: ${key}\nEditable keys: ${EDITABLE_KEYS.join(', ')}`;
    }

    const configRecord = session.config as unknown as Record<string, unknown>;
    const currentVal = configRecord[key];

    // Type coercion
    let parsed: unknown;
    if (typeof currentVal === 'number') {
      parsed = parseFloat(value);
      if (isNaN(parsed as number)) {
        return `Invalid number: ${value}`;
      }
    } else if (typeof currentVal === 'boolean') {
      parsed = value === 'true' || value === '1' || value === 'yes';
    } else {
      parsed = value;
    }

    configRecord[key] = parsed;
    saveConfig(session.workDir, session.config);

    return `Set ${key} = ${JSON.stringify(parsed)}. Config saved.`;
  },
};

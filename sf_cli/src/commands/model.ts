import type { SlashCommand, SessionContext } from '../types.js';
import { AVAILABLE_PROVIDERS } from '../core/provider.js';
import { saveConfig } from '../core/config.js';

// Well-known models per provider (user can still set any model string)
const KNOWN_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-20250514',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  xai: ['grok-3', 'grok-3-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  ollama: ['llama3.1', 'llama3.2', 'qwen2.5-coder', 'deepseek-coder-v2', 'codellama'],
  lmstudio: ['qwen2.5-coder-7b', 'deepseek-coder-v2'],
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'List or switch the AI model',
  usage: '/model [model-name]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const modelName = args.trim();

    // No args: show current model and list known models for the active provider
    if (!modelName) {
      const provider = session.config.provider;
      const providerInfo = AVAILABLE_PROVIDERS[provider];
      const known = KNOWN_MODELS[provider] || [];
      const current = session.config.model;

      const lines = [
        `**Current Model**: ${current}`,
        `**Provider**: ${providerInfo?.name || provider}`,
        '',
      ];

      if (known.length > 0) {
        lines.push('**Known models for this provider:**');
        lines.push('');
        for (const m of known) {
          const marker = m === current ? ' (active)' : '';
          lines.push(`  ${m}${marker}`);
        }
      }

      lines.push('');
      lines.push('Switch: `/model <model-name>`');
      lines.push('You can use any model string your provider supports.');
      return lines.join('\n');
    }

    // Set model
    const newConfig = { ...session.config, model: modelName };
    saveConfig(session.workDir, newConfig);

    // Update the live session config
    session.config.model = modelName;

    const provider = session.config.provider;
    const known = KNOWN_MODELS[provider] || [];
    const isKnown = known.includes(modelName);

    let response = `Model switched to **${modelName}**. Config saved.`;
    if (!isKnown && known.length > 0) {
      response += `\n\nNote: "${modelName}" is not in the known models list for ${provider}. If your provider supports it, it will work.`;
    }

    return response;
  },
};

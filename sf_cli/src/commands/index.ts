import type { SlashCommand } from '../types.js';
import { helpCommand } from './help.js';
import { statusCommand } from './status.js';
import { planCommand } from './plan.js';
import { applyCommand, gatesCommand } from './apply.js';
import { forgeCommand } from './forge.js';
import { providerCommand } from './provider.js';
import { configCommand } from './config.js';
import { costCommand } from './cost.js';
import { memoryCommand, lessonsCommand } from './memory.js';

const registry = new Map<string, SlashCommand>();

export function registerCommand(cmd: SlashCommand): void {
  registry.set(cmd.name, cmd);
}

export function getCommand(name: string): SlashCommand | undefined {
  return registry.get(name);
}

export function getAllCommands(): SlashCommand[] {
  return Array.from(registry.values());
}

export function parseSlashCommand(
  input: string,
): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { name: trimmed.slice(1), args: '' };
  }
  return {
    name: trimmed.slice(1, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export function initCommands(): void {
  registerCommand(helpCommand);
  registerCommand(statusCommand);
  registerCommand(planCommand);
  registerCommand(applyCommand);
  registerCommand(gatesCommand);
  registerCommand(forgeCommand);
  registerCommand(providerCommand);
  registerCommand(configCommand);
  registerCommand(costCommand);
  registerCommand(memoryCommand);
  registerCommand(lessonsCommand);
}

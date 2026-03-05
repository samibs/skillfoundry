import { helpCommand } from './help.js';
import { statusCommand } from './status.js';
import { planCommand } from './plan.js';
import { applyCommand, gatesCommand } from './apply.js';
import { forgeCommand } from './forge.js';
import { providerCommand } from './provider.js';
import { configCommand } from './config.js';
import { costCommand } from './cost.js';
import { memoryCommand, lessonsCommand } from './memory.js';
import { setupCommand } from './setup.js';
import { agentCommand } from './agent.js';
import { teamCommand } from './team.js';
import { modelCommand } from './model.js';
const registry = new Map();
export function registerCommand(cmd) {
    registry.set(cmd.name, cmd);
}
export function getCommand(name) {
    return registry.get(name);
}
export function getAllCommands() {
    return Array.from(registry.values());
}
export function parseSlashCommand(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/'))
        return null;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
        return { name: trimmed.slice(1), args: '' };
    }
    return {
        name: trimmed.slice(1, spaceIdx),
        args: trimmed.slice(spaceIdx + 1).trim(),
    };
}
export function initCommands() {
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
    registerCommand(setupCommand);
    registerCommand(agentCommand);
    registerCommand(teamCommand);
    registerCommand(modelCommand);
}
//# sourceMappingURL=index.js.map
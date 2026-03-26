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
import { gateCommand } from './gate.js';
import { hookCommand } from './hook.js';
import { reportCommand } from './report.js';
import { benchmarkCommand } from './benchmark.js';
import { metricsCommand } from './metrics.js';
import { runtimeCommand } from './runtime.js';
import { prdReviewCommand } from './prd-review.js';
import { publishCommand } from './publish.js';
import { upgradeCommand } from './upgrade.js';
import { auditCommand } from './audit.js';
import { dashboardCommand } from './dashboard.js';
import { optimizeCommand } from './optimize.js';
import { boostCommand } from './boost.js';
import { routeCommand } from './route.js';
import { tokensCommand } from './tokens.js';
import { certifyCommand } from './certify.js';
import { domainCommand } from './domain.js';
import { generateCommand } from './generate.js';
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
    registerCommand(gateCommand);
    registerCommand(hookCommand);
    registerCommand(reportCommand);
    registerCommand(benchmarkCommand);
    registerCommand(metricsCommand);
    registerCommand(runtimeCommand);
    registerCommand(prdReviewCommand);
    registerCommand(publishCommand);
    registerCommand(upgradeCommand);
    registerCommand(auditCommand);
    registerCommand(dashboardCommand);
    registerCommand(optimizeCommand);
    registerCommand(boostCommand);
    registerCommand(routeCommand);
    registerCommand(tokensCommand);
    registerCommand(certifyCommand);
    registerCommand(domainCommand);
    registerCommand(generateCommand);
}
//# sourceMappingURL=index.js.map
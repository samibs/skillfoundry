// ASCII art banner displayed on CLI startup.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { getFrameworkRoot, getFrameworkVersion } from './framework.js';
import { getAllAgentNames } from './agent-registry.js';
import { colors, symbols } from '../utils/theme.js';
const c1 = chalk.hex(colors.accent); // bright cyan — top
const c2 = chalk.hex(colors.accent);
const c3 = chalk.hex('#4488ff'); // transition blue — middle
const c4 = chalk.hex('#4488ff');
const c5 = chalk.hex(colors.secondary); // muted purple — bottom
const c6 = chalk.hex(colors.secondary);
const BANNER_LINES = [
    c1(' ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗ ██████╗ ██╗   ██╗'),
    c2(' ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝'),
    c3(' ███████╗█████╔╝ ██║██║     ██║     █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║  ██║██████╔╝ ╚████╔╝'),
    c4(' ╚════██║██╔═██╗ ██║██║     ██║     ██╔══╝  ██║   ██║██║   ██║██║╚██╗██║██║  ██║██╔══██╗  ╚██╔╝'),
    c5(' ███████║██║  ██╗██║███████╗███████╗██║     ╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝██║  ██║   ██║'),
    c6(' ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝   ╚═╝'),
];
/** IDE platforms the installers target (README "Supported Platforms"). */
const PLATFORM_COUNT = 6;
/**
 * Build the stats line from live sources rather than hardcoded numbers, which had
 * drifted (the banner claimed 56 agents / 63 skills / 5 platforms long after the
 * registry, skill set and platform list grew). A count that cannot be read is
 * omitted rather than guessed.
 */
export function getBannerStats(frameworkRoot) {
    const stats = [`${getAllAgentNames().length} Agents`];
    try {
        const root = frameworkRoot ?? getFrameworkRoot();
        const skills = readdirSync(join(root, '.claude', 'commands')).filter((f) => f.endsWith('.md'));
        if (skills.length > 0)
            stats.push(`${skills.length} Skills`);
    }
    catch {
        // Framework root or skills directory unavailable — leave the count out
    }
    stats.push('The Forge', `${PLATFORM_COUNT} Platforms`);
    return stats;
}
/**
 * Print the SkillFoundry ASCII banner to stdout.
 */
export function printBanner() {
    let version = '2.0.0';
    try {
        version = getFrameworkVersion();
    }
    catch {
        // Use fallback
    }
    console.log('');
    for (const line of BANNER_LINES) {
        console.log(line);
    }
    console.log('');
    console.log(chalk.hex(colors.textSecondary)('  ' + getBannerStats().join(`  ${symbols.bullet}  `)) +
        '  ' +
        chalk.hex(colors.warning)(`v${version}`));
    console.log(chalk.hex(colors.borderDim)(' ' + symbols.lineHeavy.repeat(96)));
    console.log('');
}
//# sourceMappingURL=banner.js.map
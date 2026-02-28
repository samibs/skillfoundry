// ASCII art banner displayed on CLI startup.

import chalk from 'chalk';
import { getFrameworkVersion } from './framework.js';
import { colors, symbols } from '../utils/theme.js';

const c1 = chalk.hex(colors.accent);       // bright cyan — top
const c2 = chalk.hex(colors.accent);
const c3 = chalk.hex('#4488ff');            // transition blue — middle
const c4 = chalk.hex('#4488ff');
const c5 = chalk.hex(colors.secondary);    // muted purple — bottom
const c6 = chalk.hex(colors.secondary);

const BANNER_LINES = [
  c1(' ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗ ██████╗ ██╗   ██╗'),
  c2(' ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝'),
  c3(' ███████╗█████╔╝ ██║██║     ██║     █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║  ██║██████╔╝ ╚████╔╝'),
  c4(' ╚════██║██╔═██╗ ██║██║     ██║     ██╔══╝  ██║   ██║██║   ██║██║╚██╗██║██║  ██║██╔══██╗  ╚██╔╝'),
  c5(' ███████║██║  ██╗██║███████╗███████╗██║     ╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝██║  ██║   ██║'),
  c6(' ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝   ╚═╝'),
];

/**
 * Print the SkillFoundry ASCII banner to stdout.
 */
export function printBanner(): void {
  let version = '2.0.0';
  try {
    version = getFrameworkVersion();
  } catch {
    // Use fallback
  }

  console.log('');
  for (const line of BANNER_LINES) {
    console.log(line);
  }
  console.log('');
  console.log(
    chalk.hex(colors.textSecondary)(
      `  56 Agents  ${symbols.bullet}  63 Skills  ${symbols.bullet}  The Forge  ${symbols.bullet}  5 Platforms`,
    ) +
      '  ' +
      chalk.hex(colors.warning)(`v${version}`),
  );
  console.log(chalk.hex(colors.borderDim)(' ' + symbols.lineHeavy.repeat(96)));
  console.log('');
}

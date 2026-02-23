import chalk from 'chalk';

export const theme = {
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  dim: chalk.dim,
  bold: chalk.bold,
  provider: chalk.blue,
  cost: chalk.magenta,
} as const;

export function statusColor(status: string): (text: string) => string {
  switch (status) {
    case 'pass':
    case 'ok':
    case 'success':
    case 'COMPLETED':
    case 'IDLE':
      return theme.success;
    case 'warn':
    case 'warning':
    case 'VALIDATED':
      return theme.warning;
    case 'fail':
    case 'error':
    case 'block':
    case 'FAILED':
      return theme.error;
    default:
      return theme.info;
  }
}

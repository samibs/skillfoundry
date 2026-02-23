import chalk from 'chalk';

// ─── Color Palette ──────────────────────────────────────────
// Hex strings used by both Ink components (color prop) and chalk wrappers.
export const colors = {
  // Primary accent — bright cyan/teal
  accent: '#00d4ff',
  accentDim: '#0099bb',

  // Secondary — muted blue/purple
  secondary: '#6e7dff',
  secondaryDim: '#4a5599',

  // Semantic
  success: '#00ff87',
  successDim: '#00b35f',
  warning: '#ffaa00',
  warningDim: '#cc8800',
  error: '#ff3333',
  errorDim: '#cc2222',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Surfaces / borders
  borderPrimary: '#00d4ff',
  borderDim: '#334455',
  borderSuccess: '#00ff87',
  borderWarning: '#ffaa00',
  borderError: '#ff3333',

  // Role-specific (messages)
  roleUser: '#00d4ff',
  roleAssistant: '#00ff87',
  roleSystem: '#ffaa00',
  roleTool: '#b48eff',
} as const;

// ─── Unicode Symbols ────────────────────────────────────────
// Rich Unicode only — no emoji.
export const symbols = {
  // Status indicators
  pass: '\u2713',       // ✓
  fail: '\u2717',       // ✗
  warn: '\u25C6',       // ◆
  skip: '\u2500',       // ─
  running: '\u25CB',    // ○

  // Navigation / structural
  prompt: '\u25B8',     // ▸
  promptDim: '\u25B9',  // ▹
  bullet: '\u25CF',     // ●
  diamond: '\u25C6',    // ◆
  chevron: '\u27EB',    // ⟫
  arrow: '\u2192',      // →

  // Tool icons
  bash: '\u25B8',       // ▸
  read: '\u25C9',       // ◉
  write: '\u25C8',      // ◈
  glob: '\u2736',       // ✶
  grep: '\u2263',       // ≣
  tool: '\u25A0',       // ■

  // Dividers
  lineLight: '\u2500',  // ─
  lineHeavy: '\u2501',  // ━

  // Gate pipeline
  gatePipe: '\u2503',   // ┃
  gateArrow: '\u2523',  // ┣
  gateLast: '\u2517',   // ┗
  gatePass: '\u25C9',   // ◉
  gateFail: '\u2717',   // ✗
  gateWarn: '\u25C6',   // ◆
} as const;

// ─── Custom Border Styles ───────────────────────────────────
// Ink Box accepts BoxStyle objects: { topLeft, top, topRight, right, bottomRight, bottom, bottomLeft, left }
export const borders = {
  // Heavy top, single sides — primary containers (Header)
  header: {
    topLeft: '\u250F',    // ┏
    top: '\u2501',        // ━
    topRight: '\u2513',   // ┓
    right: '\u2502',      // │
    bottomRight: '\u2518',// ┘
    bottom: '\u2500',     // ─
    bottomLeft: '\u2514', // └
    left: '\u2502',       // │
  },

  // Double border — high-importance prompts (Approval, Permission)
  double: {
    topLeft: '\u2554',    // ╔
    top: '\u2550',        // ═
    topRight: '\u2557',   // ╗
    right: '\u2551',      // ║
    bottomRight: '\u255D',// ╝
    bottom: '\u2550',     // ═
    bottomLeft: '\u255A', // ╚
    left: '\u2551',       // ║
  },

  // Round — input area (softer, user-facing)
  input: {
    topLeft: '\u256D',    // ╭
    top: '\u2500',        // ─
    topRight: '\u256E',   // ╮
    right: '\u2502',      // │
    bottomRight: '\u256F',// ╯
    bottom: '\u2500',     // ─
    bottomLeft: '\u2570', // ╰
    left: '\u2502',       // │
  },

  // Single — cards, diffs, tool results (subtle)
  card: {
    topLeft: '\u250C',    // ┌
    top: '\u2500',        // ─
    topRight: '\u2510',   // ┐
    right: '\u2502',      // │
    bottomRight: '\u2518',// ┘
    bottom: '\u2500',     // ─
    bottomLeft: '\u2514', // └
    left: '\u2502',       // │
  },
} as const;

// ─── Chalk Wrappers ────────────────────────────────────────
export const theme = {
  accent: chalk.hex(colors.accent),
  accentDim: chalk.hex(colors.accentDim),
  secondary: chalk.hex(colors.secondary),
  success: chalk.hex(colors.success),
  warning: chalk.hex(colors.warning),
  error: chalk.hex(colors.error),
  dim: chalk.dim,
  bold: chalk.bold,
  muted: chalk.hex(colors.textMuted),
  text: chalk.hex(colors.textPrimary),
  textSec: chalk.hex(colors.textSecondary),
  provider: chalk.hex(colors.secondary),
  cost: chalk.hex(colors.warning),
  info: chalk.hex(colors.accent),
} as const;

// ─── Status Color Helper ───────────────────────────────────
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
      return theme.accent;
  }
}

// ─── Helpers ────────────────────────────────────────────────
export function divider(char: string = symbols.lineLight, width: number = 80): string {
  return char.repeat(width);
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

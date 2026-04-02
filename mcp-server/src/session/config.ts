/**
 * Session configuration for SkillFoundry MCP Agent Server.
 * Controls turn limits, token budgets, compaction thresholds, and persistence.
 */

export interface SessionConfig {
  /** Maximum number of turns before the session is stopped. */
  maxTurns: number;
  /** Maximum total token budget (input + output) before the session is stopped. */
  maxBudgetTokens: number;
  /** Number of turns after which the session should be compacted. */
  compactAfterTurns: number;
  /** Directory where session state is persisted. */
  persistDirectory: string;
}

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_MAX_BUDGET_TOKENS = 100_000;
const DEFAULT_COMPACT_AFTER = 30;
const DEFAULT_SESSION_DIR = '.sf_sessions';

/**
 * Creates a SessionConfig by reading environment variables with sensible defaults.
 *
 * Environment variables:
 *   SKILLFOUNDRY_MAX_TURNS        — max turns (default: 50)
 *   SKILLFOUNDRY_MAX_BUDGET_TOKENS — max token budget (default: 100000)
 *   SKILLFOUNDRY_COMPACT_AFTER    — compact after N turns (default: 30)
 *   SKILLFOUNDRY_SESSION_DIR      — persistence directory (default: '.sf_sessions')
 *
 * @returns SessionConfig populated from env or defaults.
 */
export function createSessionConfig(): SessionConfig {
  const parseIntEnv = (key: string, fallback: number): number => {
    const raw = process.env[key];
    if (raw === undefined || raw === '') {
      return fallback;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  };

  return {
    maxTurns: parseIntEnv('SKILLFOUNDRY_MAX_TURNS', DEFAULT_MAX_TURNS),
    maxBudgetTokens: parseIntEnv('SKILLFOUNDRY_MAX_BUDGET_TOKENS', DEFAULT_MAX_BUDGET_TOKENS),
    compactAfterTurns: parseIntEnv('SKILLFOUNDRY_COMPACT_AFTER', DEFAULT_COMPACT_AFTER),
    persistDirectory: process.env['SKILLFOUNDRY_SESSION_DIR'] || DEFAULT_SESSION_DIR,
  };
}

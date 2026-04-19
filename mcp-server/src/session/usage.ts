/**
 * Token usage tracking for SkillFoundry sessions.
 * All functions are pure — they return new objects, never mutate inputs.
 */

export interface UsageSummary {
  /** Total input tokens consumed across all turns. */
  inputTokens: number;
  /** Total output tokens consumed across all turns. */
  outputTokens: number;
  /** Combined input + output tokens. */
  totalTokens: number;
  /** Number of turns recorded. */
  turnCount: number;
}

/**
 * Creates a zeroed UsageSummary.
 *
 * @returns A new UsageSummary with all counters at zero.
 */
export function createUsageSummary(): UsageSummary {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    turnCount: 0,
  };
}

/**
 * Records a turn's token usage and returns a NEW UsageSummary (no mutation).
 *
 * @param usage - The current usage summary.
 * @param inputTokens - Input tokens consumed in this turn.
 * @param outputTokens - Output tokens consumed in this turn.
 * @returns A new UsageSummary with the turn added.
 */
export function addTurn(
  usage: UsageSummary,
  inputTokens: number,
  outputTokens: number,
): UsageSummary {
  const newInput = usage.inputTokens + inputTokens;
  const newOutput = usage.outputTokens + outputTokens;
  return {
    inputTokens: newInput,
    outputTokens: newOutput,
    totalTokens: newInput + newOutput,
    turnCount: usage.turnCount + 1,
  };
}

/**
 * Estimates the token count for a given text using a whitespace-split heuristic.
 * Each word is estimated at ~1.3 tokens on average (accounts for subword tokenization).
 *
 * @param text - The text to estimate tokens for.
 * @returns Estimated token count (rounded up to nearest integer).
 */
export function estimateTokens(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  const words = text.trim().split(/\s+/);
  return Math.ceil(words.length * 1.3);
}

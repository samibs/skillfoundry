/**
 * STORY-013: PRD Review CLI Command
 *
 * Implements `sf prd review <path>` — scores a PRD on four dimensions
 * (completeness, specificity, consistency, scope) and outputs color-coded
 * per-dimension results with actionable improvement suggestions.
 *
 * Flags:
 *   --json        Output raw JSON instead of formatted text
 *   --threshold N Minimum score per dimension for pass (default: 6)
 *   --verbose     Include raw LLM justifications in full
 *   --no-cache    Force fresh scoring (bypass in-memory cache)
 *
 * Exit codes: 0 = all dimensions pass, 1 = any dimension fails / error
 */
import type { SlashCommand, PrdScore, PrdDimensionScore } from '../types.js';
/**
 * Render a Unicode progress bar for the given score.
 * Each filled cell = '█', empty = '░'. 10 cells total.
 * @param score - Integer 1–10.
 * @returns 10-character progress bar string.
 */
export declare function renderProgressBar(score: number): string;
/**
 * Format a single dimension block for human-readable output.
 * @param name - Dimension label (e.g., 'COMPLETENESS').
 * @param dim - PrdDimensionScore for this dimension.
 * @param threshold - Minimum passing score.
 * @returns Formatted multi-line string for this dimension.
 */
export declare function formatDimension(name: string, dim: PrdDimensionScore, threshold: number): string;
/**
 * Format the full PRD review result for human-readable terminal output.
 * @param score - Full PrdScore from the scorer.
 * @param filePath - Path to the PRD file (for display).
 * @param threshold - Minimum passing score per dimension.
 * @param latencyMs - Time taken for scoring in milliseconds.
 * @returns Formatted review output string.
 */
export declare function formatReviewOutput(score: PrdScore, filePath: string, threshold: number, latencyMs: number): string;
/**
 * Return [dimensionName, score] pairs for dimensions scoring below threshold.
 * @param score - Full PrdScore.
 * @param threshold - Minimum passing score.
 * @returns Array of [name, score] tuples for failing dimensions.
 */
export declare function getDimensionsBelow(score: PrdScore, threshold: number): [string, number][];
/**
 * Parse `prd review` subcommand arguments.
 * @param args - Raw argument string from the slash command dispatcher.
 * @returns Parsed options.
 */
export declare function parsePrdReviewArgs(args: string): {
    filePath: string;
    json: boolean;
    threshold: number;
    verbose: boolean;
    noCache: boolean;
};
export declare const prdReviewCommand: SlashCommand;

export declare const TEMPERATURE_DECAY: readonly [0.7, 0.4, 0.1];
export interface RepairResult {
    repaired: string;
    fixes: string[];
    wasRepaired: boolean;
}
/**
 * Repair malformed JSON: close unclosed brackets/braces,
 * remove trailing commas, strip markdown fences around JSON.
 */
export declare function repairJSON(raw: string): RepairResult;
/**
 * Detect and close unclosed markdown code fences.
 * Handles ``` with optional language identifier.
 */
export declare function repairCodeBlocks(raw: string): RepairResult;
/**
 * Orchestrator: attempt JSON repair, then code block repair.
 * Logs all repairs to session log.
 */
export declare function repairLLMOutput(raw: string): RepairResult;
/**
 * Validate that a string is parseable JSON.
 */
export declare function isValidJSON(text: string): boolean;
export interface TemperatureDecayOptions {
    /** Function that calls the LLM and returns the response text */
    callLLM: (temperature: number) => Promise<string>;
    /** Temperature sequence to try (default: [0.7, 0.4, 0.1]) */
    temperatures?: readonly number[];
    /** Whether to attempt structural repair before retrying */
    attemptRepair?: boolean;
    /** Validator function: returns true if output is acceptable */
    validate?: (output: string) => boolean;
}
export interface TemperatureDecayResult {
    output: string;
    temperature: number;
    attempt: number;
    repaired: boolean;
    fixes: string[];
}
/**
 * Retry an LLM call with progressively lower temperatures when output is malformed.
 * On each failed attempt:
 *   1. Try to repair the output structurally
 *   2. If repair succeeds and validates, return it
 *   3. Otherwise, retry with next lower temperature
 *   4. After all attempts, return the best repair or throw
 */
export declare function withTemperatureDecay(opts: TemperatureDecayOptions): Promise<TemperatureDecayResult>;

/**
 * STORY-012: LLM-Powered PRD Quality Scorer
 *
 * Evaluates PRDs on four dimensions (completeness, specificity, consistency,
 * scope) using structured tool_use output from the configured LLM provider.
 * Scores are integers 1-10 per dimension. pass = true when ALL scores >= 6.
 *
 * Features:
 * - Anthropic tool_use for structured JSON extraction (temperature 0)
 * - Retry once on parse/validation failure with an explicit JSON instruction
 * - In-memory cache with 5-minute TTL to avoid redundant LLM calls
 * - Non-PRD file detection: rejects files missing frontmatter or required sections
 */
import type { ProviderAdapter, PrdScore, PrdDimensionScore } from '../types.js';
/**
 * Build the user-turn scoring prompt by injecting prdContent.
 * @param prdContent - Raw text of the PRD.
 * @returns The full prompt string to send as the user message.
 */
export declare function buildScoringPrompt(prdContent: string): string;
export declare const SCORE_PRD_TOOL: {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: {
            completeness: {
                type: string;
                description: string;
                properties: {
                    score: {
                        type: string;
                        minimum: number;
                        maximum: number;
                        description: string;
                    };
                    justification: {
                        type: string;
                        minLength: number;
                        description: string;
                    };
                };
                required: string[];
            };
            specificity: {
                type: string;
                description: string;
                properties: {
                    score: {
                        type: string;
                        minimum: number;
                        maximum: number;
                        description: string;
                    };
                    justification: {
                        type: string;
                        minLength: number;
                        description: string;
                    };
                };
                required: string[];
            };
            consistency: {
                type: string;
                description: string;
                properties: {
                    score: {
                        type: string;
                        minimum: number;
                        maximum: number;
                        description: string;
                    };
                    justification: {
                        type: string;
                        minLength: number;
                        description: string;
                    };
                };
                required: string[];
            };
            scope: {
                type: string;
                description: string;
                properties: {
                    score: {
                        type: string;
                        minimum: number;
                        maximum: number;
                        description: string;
                    };
                    justification: {
                        type: string;
                        minLength: number;
                        description: string;
                    };
                };
                required: string[];
            };
            suggestions: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
                minItems: number;
                maxItems: number;
            };
        };
        required: string[];
    };
};
interface ValidatedScoringResponse {
    completeness: PrdDimensionScore;
    specificity: PrdDimensionScore;
    consistency: PrdDimensionScore;
    scope: PrdDimensionScore;
    suggestions: string[];
}
/**
 * Validate and parse the raw tool_use input from the LLM into a ValidatedScoringResponse.
 * Throws a descriptive error on any validation failure — callers catch and retry.
 * @param raw - Arbitrary object from the LLM tool_use input.
 * @returns Validated scoring dimensions and suggestions.
 */
export declare function validateScoringResponse(raw: unknown): ValidatedScoringResponse;
/**
 * Detect whether the file content looks like a PRD.
 * A PRD must have at least a markdown heading AND contain at least one of
 * the canonical section markers used across the SkillFoundry PRD template.
 * @param content - Raw file content.
 * @returns true when the file appears to be a PRD.
 */
export declare function isPrdContent(content: string): boolean;
/**
 * Clear all entries from the score cache. Useful in tests.
 */
export declare function clearScoreCache(): void;
/**
 * Thrown when the file does not appear to be a PRD.
 */
export declare class PrdNotDetectedError extends Error {
    constructor(prdPath: string);
}
/**
 * Thrown when the LLM response cannot be parsed/validated after the retry attempt.
 */
export declare class PrdScoringError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Score a single PRD file using the configured LLM provider.
 *
 * Reads the file, validates it looks like a PRD, calls the LLM with a
 * structured tool_use prompt, validates the response, and returns a PrdScore.
 * Results are cached for 5 minutes by file path. Retries once on parse failure.
 *
 * @param prdContent - Raw text content of the PRD (caller responsible for reading).
 * @param prdPath - Absolute path to the PRD file (used for cache key and result).
 * @param provider - ProviderAdapter instance (must implement streamWithTools).
 * @param model - Model identifier string from SfConfig.model.
 * @returns Fully populated PrdScore.
 * @throws PrdNotDetectedError when the file content does not look like a PRD.
 * @throws PrdScoringError when LLM scoring fails after one retry.
 */
export declare function scorePrd(prdContent: string, prdPath: string, provider: ProviderAdapter, model: string): Promise<PrdScore>;
/**
 * Score a PRD by reading its content from disk.
 *
 * Convenience wrapper around scorePrd() that handles file reading and
 * existence checks. Preferred entry point for pipeline integration.
 *
 * @param prdPath - Absolute path to the PRD file.
 * @param provider - ProviderAdapter instance.
 * @param model - Model identifier string.
 * @returns Fully populated PrdScore.
 * @throws Error when the file does not exist.
 * @throws PrdNotDetectedError when the file content does not look like a PRD.
 * @throws PrdScoringError when LLM scoring fails after one retry.
 */
export declare function scorePrdFile(prdPath: string, provider: ProviderAdapter, model: string): Promise<PrdScore>;
/**
 * Score multiple PRD files sequentially.
 * One LLM call per PRD to avoid context confusion and ensure independent evaluations.
 *
 * @param prdPaths - Array of absolute paths to PRD files.
 * @param provider - ProviderAdapter instance.
 * @param model - Model identifier string.
 * @returns Array of PrdScore results in the same order as prdPaths.
 * @throws Aggregates per-file errors into a PrdScoringError after all files are attempted.
 */
export declare function scoreMultiplePrds(prdPaths: string[], provider: ProviderAdapter, model: string): Promise<PrdScore[]>;
/**
 * Class wrapper around the functional scorer API.
 * Provided for callers that prefer an object-oriented interface.
 *
 * @example
 * const scorer = new PrdScorer(provider, config.model);
 * const result = await scorer.score('/path/to/my-feature.md');
 */
export declare class PrdScorer {
    private readonly provider;
    private readonly model;
    constructor(provider: ProviderAdapter, model: string);
    /**
     * Score a single PRD file.
     * @param prdPath - Absolute path to the PRD file.
     * @returns PrdScore result.
     */
    score(prdPath: string): Promise<PrdScore>;
    /**
     * Score multiple PRD files sequentially.
     * @param prdPaths - Array of absolute paths to PRD files.
     * @returns Array of PrdScore results in input order.
     */
    scoreMultiple(prdPaths: string[]): Promise<PrdScore[]>;
}
export {};

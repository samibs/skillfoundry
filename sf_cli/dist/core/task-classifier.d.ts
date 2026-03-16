export type TaskComplexity = 'simple' | 'complex';
export interface ClassificationResult {
    complexity: TaskComplexity;
    confidence: 'high' | 'medium' | 'low';
    matchedKeywords: string[];
    taskType?: string;
}
/**
 * Classify a user prompt as simple or complex based on keyword matching.
 * Returns the classification, confidence level, and matched keywords.
 *
 * - If only simple keywords match → simple (high confidence)
 * - If only complex keywords match → complex (high confidence)
 * - If both match → complex (medium confidence, safety-first)
 * - If neither match → complex (low confidence, default to cloud)
 */
export declare function classifyTask(prompt: string): ClassificationResult;
export interface RoutingDecision {
    provider: string;
    model: string;
    reason: string;
    complexity: TaskComplexity;
    savedLocally: boolean;
    jurisdictionBlocked?: boolean;
}
export interface RoutingConfig {
    /** Whether local-first routing is enabled */
    routeLocalFirst: boolean;
    /** The cloud provider to use for complex tasks */
    cloudProvider: string;
    /** The cloud model to use */
    cloudModel: string;
    /** The local provider for simple tasks */
    localProvider: string;
    /** The local model to use */
    localModel: string;
    /** Whether the local provider is currently healthy */
    localHealthy: boolean;
    /** Jurisdiction mode: none, eu, strict */
    dataJurisdiction?: 'none' | 'eu' | 'strict';
    /** Per-task-type routing overrides */
    routingRules?: Record<string, 'local' | 'cloud' | 'auto'>;
}
export declare class JurisdictionError extends Error {
    readonly jurisdiction: string;
    readonly taskType: string | undefined;
    readonly complexity: TaskComplexity;
    constructor(jurisdiction: string, taskType: string | undefined, complexity: TaskComplexity);
}
/**
 * Select which provider/model to use based on task complexity, jurisdiction, and routing rules.
 *
 * Decision priority:
 * 1. Routing rules (explicit per-task-type overrides)
 * 2. Jurisdiction guards (block cloud if restricted)
 * 3. Complexity-based routing (simple→local, complex→cloud)
 */
export declare function selectProvider(prompt: string, config: RoutingConfig): RoutingDecision;
export interface QualityCheckResult {
    passed: boolean;
    reason: string;
}
/**
 * Lightweight quality check for local model output.
 * No LLM calls — purely heuristic-based.
 *
 * Checks:
 * 1. Non-empty response
 * 2. No refusal patterns (model declined the task)
 * 3. Response length proportional to prompt complexity
 */
export declare function checkOutputQuality(prompt: string, response: string): QualityCheckResult;

export type TaskComplexity = 'simple' | 'complex';
export interface ClassificationResult {
    complexity: TaskComplexity;
    confidence: 'high' | 'medium' | 'low';
    matchedKeywords: string[];
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
}
/**
 * Select which provider/model to use based on task complexity and routing config.
 *
 * When route_local_first is enabled:
 * - Simple tasks → local provider (if healthy)
 * - Complex tasks → cloud provider
 * - If local is unhealthy → cloud for everything
 *
 * When route_local_first is disabled:
 * - Always use the configured provider (no routing)
 */
export declare function selectProvider(prompt: string, config: RoutingConfig): RoutingDecision;

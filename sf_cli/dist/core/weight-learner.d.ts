export declare const WEIGHT_CONFIG: {
    readonly retrieval_boost: 0.05;
    readonly validation_pass_boost: 0.03;
    readonly validation_fail_penalty: 0.1;
    readonly decay_per_week: 0.01;
    readonly weight_floor: 0.1;
    readonly weight_ceiling: 1;
    readonly max_retrieval_count: 100;
};
export interface WeightUpdate {
    id: string;
    file: string;
    old_weight: number;
    new_weight: number;
    reason: string;
}
export interface WeightLearningResult {
    entries_scanned: number;
    entries_updated: number;
    updates: WeightUpdate[];
    errors: string[];
}
/**
 * Record a retrieval event for an entry — boosts its weight.
 */
export declare function recordRetrieval(workDir: string, entryId: string): WeightUpdate | null;
/**
 * Update weights based on test validation results.
 * Entries linked to passing tests get boosted; failing tests get penalized.
 */
export declare function runValidationUpdate(workDir: string): WeightUpdate[];
/**
 * Apply time-based decay to entries that haven't been retrieved recently.
 * Entries that haven't been retrieved in the last N weeks lose weight.
 */
export declare function runDecay(workDir: string, now?: Date): WeightUpdate[];
/**
 * Run the full weight learning cycle: validation updates + decay.
 */
export declare function runWeightLearning(workDir: string): WeightLearningResult;

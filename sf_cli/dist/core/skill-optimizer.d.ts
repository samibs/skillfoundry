/**
 * Skill Optimizer — Autoresearch-inspired mutation loop for agent prompts.
 *
 * Pattern: mutate prompt → evaluate → compare → keep or revert → iterate.
 *
 * Uses deterministic mutation strategies (no LLM calls) to optimize
 * agent skill prompts based on structural prompt engineering principles.
 */
import type Database from 'better-sqlite3';
export interface Section {
    heading: string;
    body: string;
}
export interface SkillFile {
    frontmatter: string;
    body: string;
    path: string;
}
export interface MutationResult {
    mutated: string;
    description: string;
    strategy: string;
}
export interface MutationStrategy {
    name: string;
    description: string;
    apply: (body: string, rng?: () => number) => MutationResult | null;
}
export interface GateResult {
    gate: string;
    status: 'pass' | 'warn' | 'fail' | 'skip';
    detail?: string;
}
export interface IterationResult {
    iteration: number;
    strategy: string;
    mutationDetail: string;
    gateResults: GateResult[];
    gatePassCount: number;
    gateFailCount: number;
    durationMs: number;
    tokenEstimate: number;
    compositeScore: number;
    kept: boolean;
    promptHash: string;
}
export interface OptimizationConfig {
    skillPath: string;
    scenario: string;
    maxIterations: number;
    timeBudgetMs: number;
    strategies?: string[];
    dryRun?: boolean;
}
export interface ExperimentResult {
    experimentId: string;
    skillName: string;
    totalIterations: number;
    baseline: IterationResult;
    best: IterationResult;
    iterations: IterationResult[];
    improvementPct: number;
    strategyWins: Record<string, number>;
    strategyLosses: Record<string, number>;
    durationMs: number;
    bestPrompt: string;
}
export interface OptimizationExperimentRecord {
    id: string;
    skill_name: string;
    scenario_description: string;
    started_at: string;
    completed_at?: string;
    total_iterations: number;
    best_iteration: number;
    baseline_score: number;
    best_score: number;
    improvement_pct: number;
    status: string;
    config?: string;
}
export interface OptimizationIterationRecord {
    id?: number;
    experiment_id: string;
    iteration_number: number;
    mutation_strategy: string;
    mutation_detail?: string;
    gate_verdict?: string;
    gate_pass_count: number;
    gate_fail_count: number;
    duration_ms: number;
    token_estimate: number;
    composite_score: number;
    kept: number;
    prompt_hash?: string;
}
/**
 * Parse a skill file into frontmatter and body.
 */
export declare function parseSkillFile(filePath: string): SkillFile;
/**
 * Reassemble a skill file from frontmatter and body.
 */
export declare function reassembleSkillFile(skill: SkillFile): string;
/**
 * Split a markdown body into sections delimited by ## headings.
 */
export declare function parseSections(body: string): Section[];
/**
 * Reassemble sections into a markdown body.
 */
export declare function reassembleSections(sections: Section[]): string;
/**
 * Compute a composite score from gate results, duration, and token count.
 * Score range: 0.0 to 1.0 (higher is better).
 *
 * Weights: gate quality 70%, duration efficiency 15%, token efficiency 15%.
 */
export declare function computeCompositeScore(gateResults: GateResult[], durationMs: number, tokenEstimate: number): number;
/**
 * Estimate token count from text (chars / 4 approximation).
 */
export declare function estimateTokens(text: string): number;
/**
 * Simple hash for prompt content (for dedup/tracking).
 */
export declare function hashPrompt(text: string): string;
/**
 * Strategy 1: Swap two non-first ## sections.
 */
export declare const reorderSections: MutationStrategy;
/**
 * Strategy 2: Toggle bold emphasis on instruction keywords.
 */
export declare const toggleEmphasis: MutationStrategy;
/**
 * Strategy 3: Convert bullet list to numbered list or vice versa.
 */
export declare const listTypeSwap: MutationStrategy;
/**
 * Strategy 4: Replace passive/hedging with direct imperatives.
 */
export declare const sharpenInstructions: MutationStrategy;
/**
 * Strategy 5: Remove optional/supplementary sections (Examples, Notes, References).
 */
export declare const toggleOptionalSection: MutationStrategy;
/**
 * Strategy 6: Consolidate multiple constraint lists into one.
 */
export declare const consolidateConstraints: MutationStrategy;
/**
 * Strategy 7: Swap bullet-to-prose for the first suitable section.
 */
export declare const formatSwap: MutationStrategy;
/**
 * Strategy 8: Remove redundant sentences.
 */
export declare const pruneRedundancy: MutationStrategy;
export declare function getAllStrategies(): MutationStrategy[];
export declare function getStrategyByName(name: string): MutationStrategy | undefined;
/**
 * Simulate gate evaluation for a skill prompt.
 * In production this would invoke the real Anvil gates.
 * For now, it evaluates structural quality heuristics.
 */
export declare function evaluateSkillPrompt(body: string): GateResult[];
/**
 * Run a full optimization experiment on a skill file.
 */
export declare function runExperiment(config: OptimizationConfig): ExperimentResult;
export declare function insertExperiment(db: Database.Database, record: OptimizationExperimentRecord): void;
export declare function insertIteration(db: Database.Database, record: OptimizationIterationRecord): void;
export declare function getExperimentResults(db: Database.Database, experimentId: string): {
    experiment: OptimizationExperimentRecord;
    iterations: OptimizationIterationRecord[];
} | null;
export declare function getRecentExperiments(db: Database.Database, limit?: number): OptimizationExperimentRecord[];
/**
 * Persist a full experiment result to the database.
 */
export declare function persistExperiment(db: Database.Database, result: ExperimentResult, scenario: string): void;
export declare function formatExperimentReport(result: ExperimentResult): string;
export declare function formatStrategyList(): string;

/**
 * STORY-011: Quality Benchmark Suite
 *
 * 50 test scenarios (25 bad + 25 good AI outputs) to measure framework
 * classification accuracy. Each scenario is a code snippet with an expected
 * gate verdict. The benchmark runner evaluates each scenario against the
 * gate system and reports accuracy.
 *
 * Scenarios are static fixtures — no LLM calls, deterministic in CI.
 */
export type ScenarioCategory = 'banned_pattern' | 'security' | 'type_error' | 'test_missing' | 'build_failure' | 'clean';
export interface BenchmarkScenario {
    id: string;
    name: string;
    category: ScenarioCategory;
    /** The code snippet or file content to evaluate */
    content: string;
    /** Which gate tier should catch this */
    target_gate: string;
    /** Expected verdict: 'fail' for bad code, 'pass' for good code */
    expected_verdict: 'pass' | 'fail' | 'warn';
    /** Description of what's wrong (for bad scenarios) or why it's clean */
    description: string;
}
export interface BenchmarkResult {
    scenario_id: string;
    expected: string;
    actual: string;
    correct: boolean;
    gate_tier: string;
    duration_ms: number;
}
export interface BenchmarkSummary {
    total: number;
    correct: number;
    incorrect: number;
    accuracy_pct: number;
    by_category: Record<string, {
        total: number;
        correct: number;
    }>;
    results: BenchmarkResult[];
    duration_ms: number;
}
export declare const ALL_SCENARIOS: BenchmarkScenario[];
/**
 * Evaluate a single scenario against a pattern-matching classifier.
 * This is a deterministic, offline classifier — no LLM calls.
 */
export declare function evaluateScenario(scenario: BenchmarkScenario): BenchmarkResult;
/**
 * Run all benchmark scenarios and return the summary.
 */
export declare function runBenchmark(scenarios?: BenchmarkScenario[]): BenchmarkSummary;
/**
 * Format benchmark summary as human-readable text.
 */
export declare function formatBenchmarkSummary(summary: BenchmarkSummary): string;

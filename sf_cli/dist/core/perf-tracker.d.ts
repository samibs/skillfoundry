/**
 * STORY-014: P95 Gate Latency Enforcement
 *
 * Records gate execution times and enforces P95 <500ms per gate tier.
 * Storage: `.skillfoundry/perf.jsonl` (JSONL append-only).
 * Enforcement: CI can run `sf benchmark --perf` to check P95 regressions.
 */
import type { GateResult } from './gates.js';
export interface PerfEntry {
    gate: string;
    duration_ms: number;
    timestamp: string;
    run_id?: string;
}
export interface PerfStats {
    gate: string;
    count: number;
    min_ms: number;
    max_ms: number;
    avg_ms: number;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
}
export interface PerfCheckResult {
    passed: boolean;
    stats: PerfStats[];
    violations: {
        gate: string;
        p95_ms: number;
        threshold_ms: number;
    }[];
}
/**
 * Record a gate execution time.
 */
export declare function recordGatePerf(workDir: string, result: GateResult, runId?: string): void;
/**
 * Record multiple gate results at once.
 */
export declare function recordGateResults(workDir: string, results: GateResult[], runId?: string): void;
/**
 * Read all perf entries from the log.
 */
export declare function readPerfLog(workDir: string): PerfEntry[];
/**
 * Compute performance statistics per gate tier.
 */
export declare function computePerfStats(entries: PerfEntry[]): PerfStats[];
/**
 * Check P95 gate latency against threshold.
 * T3 (tests) is excluded from the check since test duration depends on suite size.
 */
export declare function checkP95(workDir: string, thresholdMs?: number, minSamples?: number): PerfCheckResult;
/**
 * Format perf check result as human-readable text.
 */
export declare function formatPerfResult(result: PerfCheckResult): string;

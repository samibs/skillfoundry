/**
 * Represents the outcome of a single quality gate.
 */
export type GateStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'running';
/**
 * Detailed result of a specific quality gate tier execution.
 */
export interface GateResult {
    tier: string;
    name: string;
    status: GateStatus;
    detail: string;
    durationMs: number;
}
/**
 * Aggregated summary of a complete quality gate run across all tiers.
 */
export interface GateRunSummary {
    gates: GateResult[];
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
    totalMs: number;
    verdict: 'PASS' | 'WARN' | 'FAIL';
}
export interface GateOptions {
    workDir: string;
    target?: string;
    storyFile?: string;
    onGateStart?: (tier: string, name: string) => void;
    onGateComplete?: (result: GateResult) => void;
    /** Run gates in parallel phases (T0+T1+T2 → T3 → T4+T5 → T6). Default false. */
    parallel?: boolean;
}
/**
 * Executes all quality gate tiers (T0-T7) for a given target.
 * Supports both sequential and parallel execution phases.
 * @param options - Configuration including work directory, target, and callbacks
 * @returns Promise resolving to a summary of all gate results
 */
export declare function runAllGates(options: GateOptions): Promise<GateRunSummary>;
export declare function runSingleGate(tier: string, workDir: string, target?: string, storyFile?: string): GateResult;

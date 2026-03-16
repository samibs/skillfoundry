export type GateStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'running';
export interface GateResult {
    tier: string;
    name: string;
    status: GateStatus;
    detail: string;
    durationMs: number;
}
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
export declare function runAllGates(options: GateOptions): Promise<GateRunSummary>;
export declare function runSingleGate(tier: string, workDir: string, target?: string, storyFile?: string): GateResult;

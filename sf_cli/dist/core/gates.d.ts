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
}
export declare function runAllGates(options: GateOptions): Promise<GateRunSummary>;
export declare function runSingleGate(tier: string, workDir: string, target?: string, storyFile?: string): GateResult;

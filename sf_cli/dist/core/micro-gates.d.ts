import type { SfConfig, SfPolicy, MicroGateResult, MicroGateVerdict, MicroGateFinding } from '../types.js';
export declare function parseMicroGateResponse(content: string): {
    verdict: MicroGateVerdict;
    findings: MicroGateFinding[];
    summary: string;
};
/**
 * Run post-story micro-gates (MG1 security + MG2 standards).
 * Called after each story implementation, before the T1 gate.
 */
export declare function runPostStoryGates(storyFile: string, storyContent: string, options: {
    config: SfConfig;
    policy: SfPolicy;
    workDir: string;
}): Promise<MicroGateResult[]>;
/**
 * Run pre-TEMPER cross-story review gate (MG3).
 * Called once after all stories complete, before T1-T6.
 * Advisory only — findings are warnings, not blockers.
 */
export declare function runPreTemperGate(completedStories: string[], options: {
    config: SfConfig;
    policy: SfPolicy;
    workDir: string;
}): Promise<MicroGateResult>;
/**
 * Format micro-gate findings as text for the fixer prompt.
 * Only includes FAIL/WARN gates — PASS gates are omitted.
 */
export declare function formatFindingsForFixer(results: MicroGateResult[]): string;

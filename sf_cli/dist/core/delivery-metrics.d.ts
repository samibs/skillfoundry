import { type EvidenceEntry } from './delivery-evidence.js';
import { type WorkerHandoff } from './delivery-context.js';
import type { DeliveryBudgetLevel } from './delivery-budget.js';
import type { TestScope } from './delivery-policy.js';
/** Per-task efficiency record (§7). */
export interface TaskEfficiency {
    taskId: string;
    agent?: string;
    budget: DeliveryBudgetLevel | null;
    validationScope: TestScope | null;
    /** Wall-clock seconds spent on validation commands, where measured. */
    validationSeconds: number | null;
    /** Number of distinct validation commands executed. */
    validationCommands: number;
    /** Commands executed more than once against the same repository state. */
    repeatedCommands: number;
    evidenceReused: number;
    evidenceGenerated: number;
    /** Seconds of validation avoided by reuse, summed from the reused entries' own durations. */
    secondsSavedByReuse: number | null;
    /** Repository-wide runs a scoped run made unnecessary. */
    repoWideRunsAvoided: number;
    /**
     * Model/token usage, when the provider reports it. `null` means unknown — never
     * estimated. See `budget.ts` for the cost ledger that does track real spend.
     */
    tokensUsed: number | null;
    unresolvedGaps: number;
}
/** Mission-level aggregate. */
export interface DeliveryEfficiencyReport {
    mission: string;
    tasks: TaskEfficiency[];
    totals: {
        tasks: number;
        validationCommands: number;
        repeatedCommands: number;
        evidenceReused: number;
        evidenceGenerated: number;
        /** reused / (reused + generated); null when nothing has been recorded yet. */
        evidenceReuseRate: number | null;
        /** Total measured validation seconds; null when any worker did not measure. */
        validationSeconds: number | null;
        secondsSavedByReuse: number | null;
        repoWideRunsAvoided: number;
    };
    /** Validations currently claimed by a worker, i.e. dedup in effect right now. */
    activeClaims: number;
    /** Observations worth acting on — not advice, just what the numbers show. */
    observations: string[];
}
/** Build the per-task record for one worker handoff. */
export declare function taskEfficiency(handoff: WorkerHandoff, entries: Record<string, EvidenceEntry>): TaskEfficiency;
/**
 * Build the mission efficiency report (§7).
 *
 * Everything here is derived from recorded handoffs and the evidence store — no estimates
 * and no modelled savings.
 */
export declare function buildEfficiencyReport(workDir: string, mission?: string): DeliveryEfficiencyReport;
/** Render the report as plain lines, for `$cost` and the CLI. */
export declare function formatEfficiencyReport(report: DeliveryEfficiencyReport): string[];

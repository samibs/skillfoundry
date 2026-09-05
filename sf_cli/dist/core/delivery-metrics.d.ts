import { type EvidenceEntry } from './delivery-evidence.js';
import { type WorkerHandoff } from './delivery-context.js';
import { type UsageEntry } from './budget.js';
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
     * Model/token usage attributed to this task's execution window, read from the real
     * usage ledger (`budget.ts`). `null` means the provider reported nothing — never
     * estimated, because a fabricated count poisons every ratio computed from it.
     */
    tokensUsed: number | null;
    /** Real USD cost over the same window, or null when unknown. */
    costUsd: number | null;
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
        /** Real tokens attributed across all tasks; null when no provider usage was recorded. */
        tokensUsed: number | null;
        /** Real USD across all tasks; null when unknown. */
        costUsd: number | null;
    };
    /** Validations currently claimed by a worker, i.e. dedup in effect right now. */
    activeClaims: number;
    /** Observations worth acting on — not advice, just what the numbers show. */
    observations: string[];
}
/**
 * Attribute recorded model usage to a task's execution window.
 *
 * The usage ledger timestamps every provider call but does not tag it with a task, so the
 * attribution is by time: calls between the worker's start and its handoff. That is an
 * honest approximation for sequential work and is stated as such; when two workers overlap
 * in one process their windows overlap too, so the figure is shared rather than exact.
 *
 * @returns Tokens and cost, or nulls when the window covers no recorded call.
 */
export declare function attributeUsage(entries: UsageEntry[], windowStart: string, windowEnd: string): {
    tokens: number | null;
    costUsd: number | null;
};
/** Build the per-task record for one worker handoff. */
export declare function taskEfficiency(handoff: WorkerHandoff, entries: Record<string, EvidenceEntry>, usage?: UsageEntry[]): TaskEfficiency;
/**
 * Build the mission efficiency report (§7).
 *
 * Everything here is derived from recorded handoffs and the evidence store — no estimates
 * and no modelled savings.
 */
export declare function buildEfficiencyReport(workDir: string, mission?: string): DeliveryEfficiencyReport;
/** Render the report as plain lines, for `$cost` and the CLI. */
export declare function formatEfficiencyReport(report: DeliveryEfficiencyReport): string[];

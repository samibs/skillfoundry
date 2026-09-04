import { checkCompletion } from './delivery.js';
import type { DeliveryBudget, DeliveryBudgetLevel } from './delivery-budget.js';
import type { TestScope } from './delivery-policy.js';
import type { ValidationKind, EvidenceEntry } from './delivery-evidence.js';
import { type ImpactAnalysis } from './delivery-impact.js';
import { type WorkerHandoff } from './delivery-context.js';
/**
 * Determine what a task has actually changed.
 *
 * Prefers the committed range when a base is known, and falls back to the working tree so
 * an in-progress task still gets a real answer rather than an empty set — an empty set
 * would make every change look trivially LOW.
 */
export declare function detectChangedFiles(workDir: string, baseRef?: string): string[];
/** Everything the runner decided before a task starts (§12, `$go` startup). */
export interface TaskPlan {
    taskId: string;
    budget: DeliveryBudget;
    scope: TestScope;
    scopeReasons: string[];
    changedFiles: string[];
    impact: ImpactAnalysis;
    /** Human-readable summary of the blast radius. */
    impactSummary: string;
    baseCommit: string | null;
}
/** Inputs for {@link planTask}. */
export interface PlanTaskInput {
    taskId: string;
    /** Task, story or PRD text, used for keyword classification. */
    text?: string;
    /** Baseline the task branched from, for changed-file detection. */
    baseRef?: string;
    /** Explicit budget from the task or PRD. */
    budgetOverride?: DeliveryBudgetLevel;
    /** Explicit test scope from the task. */
    scopeOverride?: TestScope;
    acceptanceCriteria?: string[];
    /** Skip the import-graph scan. Impact is then reported as unmeasured, not as zero. */
    skipImpact?: boolean;
}
/**
 * Plan a task before implementation begins (§12).
 *
 * This is the `$go` startup sequence in code: detect what changed, classify the budget,
 * measure real dependency impact, and derive the test scope from all three. It does no
 * expensive discovery of its own beyond the cached import graph.
 */
export declare function planTask(workDir: string, input: PlanTaskInput): TaskPlan;
/** What happened when a validation was requested. */
export interface ValidationOutcome {
    action: 'REUSED' | 'EXECUTED' | 'SKIPPED_HELD' | 'BLOCKED_KNOWN_FAILURE';
    kind: ValidationKind;
    command: string;
    scope?: TestScope;
    passed: boolean;
    /** Seconds actually spent. Zero when reused — which is the saving. */
    durationSeconds: number;
    /** Seconds the reused evidence originally cost, when known. */
    secondsSaved: number | null;
    reason: string;
    exitCode: number | null;
    /** Bounded tail of output, for diagnosis. Empty when reused. */
    outputTail: string;
    evidenceKey: string;
    evidence?: EvidenceEntry;
}
/** Inputs for {@link runValidation}. */
export interface RunValidationInput {
    kind: ValidationKind;
    /** Argv form, so nothing is passed through a shell. */
    command: string;
    args?: string[];
    scope?: TestScope;
    /**
     * Files this validation's result depends on. The narrower and more honest this is, the
     * more often the evidence survives an unrelated edit. Omit for repository-wide checks.
     */
    scopeFiles?: string[];
    changedFiles?: string[];
    /** Owner for deduplication — the agent or task that would run it. */
    owner: string;
    taskId: string;
    budget?: DeliveryBudgetLevel;
    timeoutMs?: number;
    cwd?: string;
}
/**
 * Run a validation — or don't, when it is already answered.
 *
 * This is the function that converts the policy into saved compute. It consults evidence
 * and the deduplication claim first, executes only when genuinely needed, and records the
 * result so the next caller can reuse it.
 *
 * A `WAIT` is returned rather than blocking: the caller is another agent in a wave, and
 * making it sleep would trade duplicated compute for idle compute.
 */
export declare function runValidation(workDir: string, input: RunValidationInput): ValidationOutcome;
/** The result of an in-process validation that was either reused or actually run. */
export interface ReuseOutcome<T> {
    action: 'REUSED' | 'EXECUTED' | 'SKIPPED_HELD' | 'BLOCKED_KNOWN_FAILURE';
    /** The value the work produced. Absent when reused — that is the point. */
    value?: T;
    passed: boolean;
    durationSeconds: number;
    secondsSaved: number | null;
    reason: string;
    evidenceKey: string;
    evidence?: EvidenceEntry;
}
/**
 * Wrap an **in-process** validation with evidence reuse and deduplication.
 *
 * Not everything expensive is a subprocess. `runAllGates` is a function call, and running
 * it eight tiers deep against an unchanged tree costs just as much as re-running a shell
 * command would. This gives such work the same treatment.
 *
 * The caller supplies a stable `command` label — it is the identity of the work, not
 * something that gets executed — and a `passed` predicate, since an in-process result has
 * no exit code.
 *
 * @param execute - Runs the real work. Called only when the answer is not already known.
 * @param passed - Decides whether the produced value counts as a pass worth recording.
 */
export declare function runOrReuse<T>(workDir: string, spec: {
    kind: ValidationKind;
    /** Stable identity for this work, e.g. `gates:T0-T7`. Never executed. */
    command: string;
    scope?: TestScope;
    scopeFiles?: string[];
    changedFiles?: string[];
    owner: string;
    taskId: string;
    budget?: DeliveryBudgetLevel;
}, execute: () => Promise<T>, passed: (value: T) => boolean): Promise<ReuseOutcome<T>>;
/** A validation the caller wants run as part of a task. */
export interface PlannedValidation {
    kind: ValidationKind;
    command: string;
    args?: string[];
    scopeFiles?: string[];
    /** Minimum test scope at which this validation applies. Skipped below it. */
    minScope?: TestScope;
    cwd?: string;
}
/** The result of executing a planned task. */
export interface TaskExecution {
    plan: TaskPlan;
    outcomes: ValidationOutcome[];
    /** Budget after any evidence-driven escalation. */
    finalBudget: DeliveryBudgetLevel;
    /** Scope after any evidence-driven escalation. */
    finalScope: TestScope;
    escalations: string[];
    totalSeconds: number;
    secondsSaved: number | null;
    reused: number;
    executed: number;
    allPassed: boolean;
}
/**
 * Execute a task's validations under its delivery budget (§13, `$forge`).
 *
 * Validations below the selected scope are not run at all. Failures are diagnosed for
 * escalation signals — a failure naming files outside the change, or safety-sensitive
 * output — and the budget or scope is raised only on that evidence, never reflexively.
 *
 * Execution stops at the first genuine failure: running the remaining checks against a
 * known-broken tree produces noise, not evidence.
 */
export declare function executeTask(workDir: string, plan: TaskPlan, validations: PlannedValidation[], opts?: {
    owner?: string;
}): TaskExecution;
/**
 * Record a finished task as a worker handoff (§10).
 *
 * Called once a task completes, so the integrator can consume what was proven instead of
 * repeating the investigation.
 */
export declare function completeTask(workDir: string, execution: TaskExecution, opts?: {
    mission?: string;
    worktree?: string;
    resultCommit?: string;
    unresolvedGaps?: string[];
}): WorkerHandoff;
/** Whether a completed task satisfies its stop conditions (§8). */
export declare function taskIsComplete(workDir: string, execution: TaskExecution, opts?: {
    acceptanceCriteriaProven?: number;
    acceptanceCriteriaTotal?: number;
    diffInspected?: boolean;
    securityChecksRun?: boolean;
    blockers?: string[];
}): ReturnType<typeof checkCompletion>;
/** True when the layer is active — callers use this to fall back to unconditional runs. */
export declare function deliveryRunnerEnabled(workDir: string): boolean;

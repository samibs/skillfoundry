import type { DeliveryBudgetLevel } from './delivery-budget.js';
/** Validation breadth, cheapest first. */
export declare const TEST_SCOPES: readonly ["smoke", "targeted", "affected", "integration", "full"];
export type TestScope = (typeof TEST_SCOPES)[number];
/** Runtime guard for the scope vocabulary. */
export declare function isTestScope(value: unknown): value is TestScope;
/** The broader of two scopes. */
export declare function maxScope(a: TestScope, b: TestScope): TestScope;
/** True when `a` is at least as broad as `b`. */
export declare function scopeAtLeast(a: TestScope, b: TestScope): boolean;
/** One step in the execution policy for a budget. */
export interface PolicyStep {
    /** Stable identifier, used by orchestrators and logs. */
    id: string;
    /** What the agent does at this step. */
    description: string;
    /** False when the step only applies if the project supports it (e.g. a type checker). */
    conditional?: boolean;
}
/** The full execution policy derived from a delivery budget. */
export interface ExecutionPolicy {
    budget: DeliveryBudgetLevel;
    steps: PolicyStep[];
    /** The starting test scope before change-specific adjustment. */
    baseTestScope: TestScope;
    /** Whether repository-wide validation is permitted at worker level at all. */
    allowRepoWideAtWorker: boolean;
    /** Whether an explicit implementation plan is required before writing code. */
    requiresPlan: boolean;
    /** Whether security-sensitive checks are mandatory and non-skippable. */
    requiresSecurityChecks: boolean;
    /** Whether acceptance criteria must be individually verified. */
    requiresAcceptanceVerification: boolean;
    /** Whether a regression pass is required before completion. */
    requiresRegression: boolean;
}
/** The execution policy for a budget level. */
export declare function policyFor(level: DeliveryBudgetLevel): ExecutionPolicy;
/** Inputs to a scope decision. Every field is optional; decide with what is known. */
export interface ScopeInput {
    budget: DeliveryBudgetLevel;
    /** Repo-relative paths actually changed. */
    changedFiles?: string[];
    /** Acceptance criteria the tests must prove. */
    acceptanceCriteria?: string[];
    /** Explicit scope from the task. Honored unless it would under-test a HIGH budget. */
    override?: TestScope;
    /**
     * Files that depend on the changed files, when a dependency analysis is available.
     * A wide dependency fan-out justifies `affected` over `targeted`.
     */
    dependents?: string[];
    /** True when this is the integration gate rather than a worker (§11). */
    isIntegrationGate?: boolean;
}
/** A scope decision, with the reasoning recorded (§5 requires the agent to explain why). */
export interface ScopeDecision {
    scope: TestScope;
    /** Ordered reasons that produced this scope. */
    reasons: string[];
    /** Scopes deliberately not run, and why — the efficiency that was actually banked. */
    avoided: Array<{
        scope: TestScope;
        why: string;
    }>;
    /** True when an override was refused for under-testing a high-risk change. */
    overrideRefused?: boolean;
}
/**
 * Choose the narrowest test scope that can still prove the acceptance criteria (§5).
 *
 * Never returns `full` from the budget alone. `full` is reached only by an explicit
 * override, or at the integration gate for a HIGH-risk change — the two cases where
 * repository-wide cost is actually justified.
 */
export declare function selectTestScope(input: ScopeInput): ScopeDecision;
/**
 * Decide whether a failing narrow scope justifies a broader one (§5).
 *
 * The rule agents get wrong: a targeted test failing, being diagnosed and fixed does
 * **not** justify escalating to the full suite. Escalation requires evidence that the
 * change reaches further than the narrow scope covers.
 *
 * @param current - The scope that failed.
 * @param signals.failureOutsideChangedFiles - The failure names files the change did not touch.
 * @param signals.newDependentsDiscovered - Dependency analysis revealed additional impact.
 * @param signals.fixedWithinScope - The failure was diagnosed and fixed inside the same scope.
 * @returns The broader scope and why, or null to stay where you are.
 */
export declare function escalateTestScope(current: TestScope, signals: {
    failureOutsideChangedFiles?: boolean;
    newDependentsDiscovered?: number;
    fixedWithinScope?: boolean;
}): {
    scope: TestScope;
    reason: string;
} | null;
/** One completion criterion and whether it is met. */
export interface CompletionCriterion {
    id: string;
    met: boolean;
    detail: string;
    /** False when the criterion does not apply at this budget. */
    applicable: boolean;
}
/** The objective completion verdict for a task. */
export interface DeliveryComplete {
    complete: boolean;
    budget: DeliveryBudgetLevel;
    criteria: CompletionCriterion[];
    /** Criteria that are applicable and unmet. Empty when `complete`. */
    outstanding: string[];
    /**
     * Work an agent might be tempted to continue with, and why it must not without an
     * explicit request. This is what converts "I could keep looking" into "I am done".
     */
    stopGuidance: string[];
}
/** Observable facts about a task, from which completion is derived. */
export interface CompletionInput {
    budget: DeliveryBudgetLevel;
    implementationComplete: boolean;
    /** Acceptance criteria proven by evidence, and the total expected. */
    acceptanceCriteriaProven?: number;
    acceptanceCriteriaTotal?: number;
    /** The scope that actually ran and passed. */
    validationPassedAtScope?: TestScope;
    /** The scope the policy required. */
    requiredScope: TestScope;
    /** Unresolved blockers, if any. */
    blockers?: string[];
    /** True once the diff has been inspected. */
    diffInspected: boolean;
    /** True once required evidence has been recorded. */
    evidenceRecorded: boolean;
    /** True when security checks ran, for budgets that require them. */
    securityChecksRun?: boolean;
}
/**
 * Decide objectively whether a task is done (§8).
 *
 * `DeliveryComplete` is derived from evidence, not from an agent's sense of thoroughness.
 * Once every applicable criterion is met, further inspection is not diligence — it is
 * unbilled rework of an already-proven change.
 */
export declare function evaluateCompletion(input: CompletionInput): DeliveryComplete;
/**
 * The minimum validation a budget demands, for the integration gate to reason about.
 *
 * @param budgets - Budgets of every contribution being integrated.
 * @returns The scope the aggregate integration must reach.
 */
export declare function aggregateRequiredScope(budgets: DeliveryBudgetLevel[]): {
    budget: DeliveryBudgetLevel;
    scope: TestScope;
    reason: string;
};
/** True when the given budget permits skipping a repository-wide run at worker level. */
export declare function mayDeferRepoWideValidation(level: DeliveryBudgetLevel): boolean;

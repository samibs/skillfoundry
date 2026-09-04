/** How much validation effort a change justifies. */
export declare const DELIVERY_BUDGETS: readonly ["LOW", "MEDIUM", "HIGH"];
export type DeliveryBudgetLevel = (typeof DELIVERY_BUDGETS)[number];
/** Runtime guard for the budget vocabulary. */
export declare function isDeliveryBudgetLevel(value: unknown): value is DeliveryBudgetLevel;
/** True when `a` demands at least as much validation as `b`. */
export declare function atLeast(a: DeliveryBudgetLevel, b: DeliveryBudgetLevel): boolean;
/** The higher of two budgets. */
export declare function maxBudget(a: DeliveryBudgetLevel, b: DeliveryBudgetLevel): DeliveryBudgetLevel;
/** What drove the classification. Recorded so a budget is never unexplained. */
export type BudgetSource = 'EXPLICIT_OVERRIDE' | 'SAFETY_CRITICAL_PATH' | 'SAFETY_CRITICAL_KEYWORD' | 'LOW_RISK_PATH' | 'LOW_RISK_KEYWORD' | 'CHANGE_BREADTH' | 'DEFAULT' | 'ESCALATION';
/** One recorded budget escalation (§9). */
export interface BudgetEscalation {
    from: DeliveryBudgetLevel;
    to: DeliveryBudgetLevel;
    /** Why the original budget was insufficient. */
    reason: string;
    /** Evidence that triggered it — a failing command, a discovered path, a scan result. */
    evidence: string[];
    at: string;
}
/** The budget assigned to a task, and why. */
export interface DeliveryBudget {
    level: DeliveryBudgetLevel;
    /** Human-readable justification. Never empty. */
    reason: string;
    source: BudgetSource;
    /** True when a task or PRD set the level explicitly rather than it being derived. */
    overridden: boolean;
    createdAt: string;
    /** Escalations applied since creation, oldest first. */
    escalations: BudgetEscalation[];
    /**
     * True when safety-critical signals were detected. A safety-critical task cannot be
     * downgraded below HIGH by an override (§19).
     */
    safetyCritical: boolean;
    /** The signals that matched, for auditability. */
    signals: string[];
}
/** Everything the classifier may consider. All fields optional — classify with what exists. */
export interface ClassificationInput {
    /** The task, story or PRD text. */
    text?: string;
    /** Repo-relative paths the change is expected to touch. */
    changedFiles?: string[];
    /**
     * Explicit level from the task or PRD. Honored except where it would downgrade a
     * safety-critical task (§19).
     */
    override?: DeliveryBudgetLevel;
    /** Default when nothing else matches. Defaults to MEDIUM. */
    defaultLevel?: DeliveryBudgetLevel;
    /**
     * Permit an override to lower a safety-critical classification. Off by default; a
     * caller must opt in deliberately, and the decision is logged either way.
     */
    allowUnsafeOverride?: boolean;
}
/**
 * Assign a delivery budget deterministically.
 *
 * Evaluation order is fixed, and safety-critical signals are checked first so nothing can
 * mask them:
 *
 *   1. safety-critical path or keyword  → HIGH (an override cannot lower this)
 *   2. explicit override                → the requested level
 *   3. broad change (many files)        → at least MEDIUM
 *   4. low-risk signals, narrow change  → LOW
 *   5. otherwise                        → the default (MEDIUM)
 *
 * @returns The budget, with the matched signals and a reason recorded.
 */
export declare function classifyDeliveryBudget(input: ClassificationInput): DeliveryBudget;
/** Why an escalation was refused, or the budget it produced. */
export interface EscalationResult {
    applied: boolean;
    budget: DeliveryBudget;
    /** Set when the escalation was rejected. */
    refusedReason?: string;
}
/**
 * Raise a delivery budget on evidence (§9).
 *
 * A budget may be exceeded when the work turns out to be riskier than it looked — a
 * compile failure outside the touched area, a discovered auth dependency, a migration
 * that turns out to be required. It may never be *lowered* here: reducing validation
 * after the fact is how proven-necessary checks get skipped.
 *
 * @param to - The new level. Must be strictly higher than the current one.
 * @param reason - Why the original budget was insufficient.
 * @param evidence - Concrete evidence, e.g. a failing command or a discovered path.
 * @returns The updated budget, or the original with `refusedReason` when the escalation
 *          is not a raise or carries no evidence.
 */
export declare function escalateBudget(budget: DeliveryBudget, to: DeliveryBudgetLevel, reason: string, evidence: string[]): EscalationResult;
/**
 * Suggest an escalation from observed evidence, without applying it.
 *
 * Used by the policy engine and `$tester` when a narrower scope reveals broader impact.
 *
 * @param currentLevel - The budget in force.
 * @param observations - Free-text observations: failing output, newly discovered paths.
 * @returns The suggested level and the signals behind it, or null when nothing warrants a raise.
 */
export declare function suggestEscalation(currentLevel: DeliveryBudgetLevel, observations: {
    failureOutput?: string;
    discoveredFiles?: string[];
}): {
    to: DeliveryBudgetLevel;
    reason: string;
    evidence: string[];
} | null;
/** One-line summary for logs and reports. */
export declare function describeBudget(budget: DeliveryBudget): string;

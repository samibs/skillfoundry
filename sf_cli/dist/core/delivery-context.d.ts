import type { DeliveryBudgetLevel } from './delivery-budget.js';
import type { TestScope } from './delivery-policy.js';
/** How far a fact can be trusted without re-deriving it. */
export declare const FACT_CONFIDENCES: readonly ["AUTHORITATIVE", "INFERRED", "ASSUMPTION"];
export type FactConfidence = (typeof FACT_CONFIDENCES)[number];
/** Runtime guard for the confidence vocabulary. */
export declare function isFactConfidence(value: unknown): value is FactConfidence;
/** One established fact about the mission. */
export interface MissionFact {
    /** Stable identifier, e.g. `architecture.summary`, `services.affected`. */
    key: string;
    value: string;
    confidence: FactConfidence;
    /** Where it came from: a PRD, a command, an agent's analysis. */
    source: string;
    /** Files this fact depends on. A change to any of them invalidates it. */
    dependsOn: string[];
    at: string;
    /** Set when the fact no longer holds. Invalidated facts are kept, not deleted (§14). */
    invalidated?: boolean;
    invalidatedReason?: string;
}
/** Compact evidence a finished worker hands to the integrator (§10). */
export interface WorkerHandoff {
    taskId: string;
    worktree: string;
    baseCommit: string;
    resultCommit: string;
    changedFiles: string[];
    budget: DeliveryBudgetLevel;
    validationScope: TestScope;
    /** Commands actually executed, not a narrative. */
    testsExecuted: string[];
    /** Evidence keys this worker produced. */
    evidenceGenerated: string[];
    /** Evidence keys this worker reused instead of regenerating. */
    evidenceReused: string[];
    unresolvedGaps: string[];
    at: string;
}
/** The shared context document. */
export interface MissionContext {
    mission: string;
    repository: string;
    /** Baseline the mission was planned against. */
    baseCommit: string | null;
    /** Tree hash when the context was last updated, for staleness checks. */
    treeSha: string | null;
    facts: MissionFact[];
    handoffs: WorkerHandoff[];
    updatedAt: string;
}
/** Read the shared context, creating an empty one for the mission when absent. */
export declare function loadContext(workDir: string, mission?: string): MissionContext;
/** Persist the shared context. */
export declare function saveContext(workDir: string, context: MissionContext): void;
/**
 * Record a fact so other workers do not re-derive it.
 *
 * Re-recording the same key replaces the previous value, and an upgrade in confidence is
 * kept: once an inference is confirmed authoritatively, it should stop being re-checked.
 *
 * @param dependsOn - Files the fact depends on. Supply them: without them the fact can
 *        only be invalidated wholesale, which wastes the sharing it was meant to enable.
 */
export declare function recordFact(workDir: string, mission: string, fact: Omit<MissionFact, 'at' | 'invalidated' | 'invalidatedReason'>): MissionFact;
/** Read a fact by key. Invalidated facts are returned so callers can see they lapsed. */
export declare function getFact(workDir: string, mission: string, key: string): MissionFact | null;
/** Every fact currently holding, optionally filtered by confidence. */
export declare function validFacts(workDir: string, mission: string, confidence?: FactConfidence): MissionFact[];
/**
 * Invalidate facts that depended on changed files (§14).
 *
 * Facts are marked, not deleted: a worker that acted on a now-lapsed fact needs to be
 * able to see that it lapsed, and why.
 *
 * @returns The keys invalidated.
 */
export declare function invalidateFactsForFiles(workDir: string, mission: string, changedFiles: string[]): string[];
/** Whether an agent should spend effort re-deriving something. */
export interface RediscoveryVerdict {
    rediscover: boolean;
    reason: string;
    /** The existing fact, when one is being reused. */
    fact?: MissionFact;
}
/**
 * Decide whether a fact must be re-derived (§6).
 *
 * An agent must prefer facts already established in the mission. It re-derives only when
 * the repository state changed, the fact lapsed, the fact is merely an assumption, or
 * safety requires independent verification.
 *
 * @param opts.safetyCritical - Force verification regardless of what is on record. A
 *        HIGH-risk change does not inherit another agent's assumptions.
 */
export declare function shouldRediscover(workDir: string, mission: string, key: string, opts?: {
    safetyCritical?: boolean;
}): RediscoveryVerdict;
/**
 * Record a finished worker's compact handoff (§10).
 *
 * The handoff exists so the integrator can decide what still needs proving without
 * repeating the worker's investigation — the worker reports what it did and what it
 * proved, not how it got there.
 */
export declare function recordHandoff(workDir: string, mission: string, handoff: Omit<WorkerHandoff, 'at'>): WorkerHandoff;
/** Handoffs recorded so far, oldest first. */
export declare function listHandoffs(workDir: string, mission: string): WorkerHandoff[];
/** The union of every file changed across a set of handoffs. */
export declare function aggregateChangedFiles(handoffs: WorkerHandoff[]): string[];
/** A readable snapshot of what the mission already knows. */
export interface ContextSummary {
    mission: string;
    baseCommit: string | null;
    authoritative: number;
    inferred: number;
    assumptions: number;
    invalidated: number;
    handoffs: number;
    evidenceReused: number;
    evidenceGenerated: number;
    /** True when the repository has moved since the context was written. */
    stale: boolean;
}
/** Summarise the shared context for `$context` and reports. */
export declare function summarizeContext(workDir: string, mission: string): ContextSummary;

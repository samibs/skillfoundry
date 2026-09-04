import { type Ledger, type LedgerMission, type Dependency } from './mission-ledger.js';
import { type CollisionReport } from './mission-provenance.js';
/** Whether an agent may modify the working tree it occupies. */
export type AgentMode = 'READ_ONLY' | 'WRITE';
/** Lifecycle of a registered worker. */
export type AgentStatus = 'ACTIVE' | 'COMPLETED' | 'RELEASED' | 'FAILED';
/** A registered agent, persisted at `.ai/agents/<name>.json`. */
export interface AgentRecord {
    /** Unique name, conventionally `<platform>-<role>-<work-item>` (§8). */
    name: string;
    platform: string;
    role: string;
    workItem: string;
    mode: AgentMode;
    repository?: string;
    branch?: string;
    worktree?: string;
    /** The exact SHA the worker started from — never a moving branch name (§11). */
    baseSha?: string;
    status: AgentStatus;
    startedAt: string;
    endedAt?: string;
}
/**
 * Validate an agent name.
 *
 * @throws {Error} When the name is empty, over-long, or contains path separators.
 */
export declare function assertAgentName(name: string): void;
/** Absolute path of the agent registry directory. */
export declare function agentsDir(workDir: string): string;
/** Absolute path of one agent's registration. */
export declare function agentPath(workDir: string, name: string): string;
/** Read one agent registration, or null when it is not registered. */
export declare function readAgent(workDir: string, name: string): AgentRecord | null;
/** Every registered agent, in name order. A corrupt record is skipped, not fatal. */
export declare function listAgents(workDir: string): AgentRecord[];
/** Agents currently holding a claim on the repository. */
export declare function activeAgents(workDir: string): AgentRecord[];
/** Why a registration was refused. */
export interface RegistrationResult {
    registered: boolean;
    agent?: AgentRecord;
    blockers: string[];
}
/**
 * Register an agent, refusing any registration that would let two writers share a tree.
 *
 * The worktree-exclusivity check is the load-bearing one (§1 rule 1, §12): a worktree
 * has exactly one owning write agent. Two writers in one directory corrupt each other's
 * work in a way no later merge can untangle.
 *
 * @param spec - Agent identity and the tree it intends to occupy.
 * @param opts.force - Register despite blockers. Blockers are still returned.
 * @returns The registration outcome, including refusal reasons.
 * @throws {Error} When the agent name or work item is malformed.
 */
export declare function registerAgent(workDir: string, spec: Omit<AgentRecord, 'status' | 'startedAt' | 'endedAt'>, opts?: {
    force?: boolean;
}): RegistrationResult;
/**
 * Mark an agent finished and release its worktree claim (§13).
 *
 * @returns The updated record, or null when the agent was never registered.
 */
export declare function releaseAgent(workDir: string, name: string, status?: Exclude<AgentStatus, 'ACTIVE'>): AgentRecord | null;
/** Worktrees claimed by more than one ACTIVE write agent — always a corruption risk. */
export declare function sharedWorktreeViolations(workDir: string): Array<{
    worktree: string;
    agents: string[];
}>;
/** The global dependency graph across every registered work item. */
export interface DependencyGraph {
    /** Work item → its outgoing dependencies. */
    nodes: Map<string, Dependency[]>;
    /** Dependency cycles, each listed as the participating work items. */
    cycles: string[][];
    /** Edges pointing at work items that are not registered. */
    danglingEdges: Array<{
        from: string;
        to: string;
    }>;
}
/**
 * Build the dependency graph across ALL selected work, not per PRD (§6).
 *
 * Dependencies routinely cross PRD boundaries; a per-PRD graph schedules work in
 * filename order and deadlocks on the first cross-PRD edge.
 */
export declare function buildDependencyGraph(ledger: Ledger): DependencyGraph;
/** Why one work item is not currently wave-eligible. */
export interface EligibilityVerdict {
    workItem: string;
    eligible: boolean;
    reasons: string[];
}
/**
 * Decide whether a work item may enter the next wave (§7).
 *
 * HARD dependencies must be satisfied. SOFT dependencies may proceed against a stable
 * contract, and INTEGRATION dependencies allow independent implementation — so neither
 * blocks dispatch, but both remain visible in the graph so the orchestrator sees what
 * it is accepting.
 */
export declare function evaluateEligibility(ledger: Ledger, workItem: string): EligibilityVerdict;
/** A proposed wave plus everything the orchestrator needs to accept or adjust it. */
export interface WavePlan {
    /** Work items safe to dispatch together. */
    items: string[];
    /** Eligible items held back because they would collide with an included item. */
    deferred: Array<{
        workItem: string;
        reason: string;
    }>;
    /** Items that are not eligible at all, with reasons. */
    ineligible: EligibilityVerdict[];
    /** Collision reports between every included pair that shares files. */
    collisions: CollisionReport[];
    /** Dependency cycles found — these must be broken before anything can be scheduled. */
    cycles: string[][];
}
/**
 * Compute the next executable wave (§7, §14).
 *
 * Eligible items are admitted one at a time; any item that would collide with one
 * already admitted is deferred to a later wave rather than dispatched alongside it.
 * That is the point: write collisions are detected before dispatch, not resolved as
 * merge conflicts afterwards.
 *
 * A dependency cycle yields an empty wave — scheduling anything inside a cycle would
 * be arbitrary, so the cycle is reported for a human to break.
 *
 * @param opts.maxItems - Cap on wave width, for cost or capacity reasons.
 * @param opts.only - Restrict planning to these work items.
 */
export declare function planWave(workDir: string, opts?: {
    maxItems?: number;
    only?: string[];
}): WavePlan;
/**
 * Order work items for serial integration (§33).
 *
 * Integration follows dependency order, never worker completion time — merging a
 * dependent contribution before its prerequisite produces a tree that never existed
 * in any worker's worktree.
 *
 * @returns Work items in an order where every dependency precedes its dependent.
 */
export declare function integrationOrder(ledger: Ledger, workItems: string[]): string[];
/** A summary of orchestration health, for `/mission wave status`. */
export interface OrchestrationSummary {
    active_wave?: string;
    baseline_sha?: string;
    active_agents: number;
    shared_worktree_violations: Array<{
        worktree: string;
        agents: string[];
    }>;
    unresolved_items: string[];
    dangling_dependencies: Array<{
        from: string;
        to: string;
    }>;
    cycles: string[][];
}
/** Summarise the orchestration plane, surfacing anything that blocks the next wave. */
export declare function orchestrationSummary(workDir: string): OrchestrationSummary;
/** Convenience accessor for a work item's execution block. */
export declare function executionOf(ledger: Ledger, workItem: string): LedgerMission['execution'] | null;

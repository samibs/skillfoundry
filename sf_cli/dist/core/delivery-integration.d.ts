import { type ValidationKind, type EvidenceEntry } from './delivery-evidence.js';
import { type TestScope } from './delivery-policy.js';
import { type WorkerHandoff } from './delivery-context.js';
import type { DeliveryBudgetLevel } from './delivery-budget.js';
/** The result of checking one worker's handoff against the repository. */
export interface HandoffVerification {
    taskId: string;
    trusted: boolean;
    /** Reasons the handoff cannot be taken at face value. */
    problems: string[];
}
/**
 * Verify a worker's handoff before trusting its evidence (§11 steps 1-2).
 *
 * A handoff is only worth consuming if its commits exist and its claimed base is a real
 * ancestor. An untrusted handoff does not fail integration — it means the integrator must
 * re-prove that worker's change rather than inherit it.
 */
export declare function verifyHandoff(workDir: string, handoff: WorkerHandoff): HandoffVerification;
/** A validation the gate intends to run, or deliberately skip. */
export interface GateValidation {
    kind: ValidationKind;
    command: string;
    scope?: TestScope;
    action: 'RUN' | 'REUSE' | 'FIX_FIRST' | 'WAIT';
    reason: string;
    evidence?: EvidenceEntry;
}
/** The gate's plan: what to run, what to reuse, and why. */
export interface IntegrationPlan {
    /** Handoffs whose evidence may be inherited. */
    trustedHandoffs: string[];
    /** Handoffs the gate must re-prove, with reasons. */
    untrustedHandoffs: HandoffVerification[];
    /** Union of every file changed by the integrated contributions. */
    aggregateChangedFiles: string[];
    /** Files the integration itself touched — conflict resolutions and merge fixups. */
    integrationChangedFiles: string[];
    /** Evidence keys dropped because integration touched their files. */
    invalidatedEvidence: string[];
    /** Mission facts dropped for the same reason. */
    invalidatedFacts: string[];
    /** The highest budget among contributions, and the scope it demands. */
    requiredBudget: DeliveryBudgetLevel;
    requiredScope: TestScope;
    scopeReason: string;
    /** Per-validation decisions. */
    validations: GateValidation[];
    /** Worker-level runs the gate did not repeat, and why — the efficiency actually banked. */
    deduplicated: Array<{
        taskId: string;
        scope: TestScope;
        why: string;
    }>;
    /** True when the working tree is dirty, which makes any result unattributable. */
    workingTreeDirty: boolean;
}
/** What the gate needs in order to plan. */
export interface IntegrationGateInput {
    handoffs: WorkerHandoff[];
    /** Validations the integration policy requires at this level. */
    requiredValidations: Array<{
        kind: ValidationKind;
        command: string;
        scope?: TestScope;
    }>;
    /** Files changed by the integration itself — conflict resolutions, merge fixups. */
    integrationChangedFiles?: string[];
    mission?: string;
    /** Identifier used when claiming validations, so dedup attributes them correctly. */
    owner?: string;
}
/**
 * Plan the integration gate (§11).
 *
 * Steps, in order: verify handoffs → aggregate changed files → invalidate what the
 * integration disturbed → reuse what survives → compute the required final scope → decide
 * which validations genuinely still need to run.
 *
 * Nothing is executed here. The plan is returned so the caller can inspect it, and so the
 * decisions are auditable rather than buried inside an execution loop.
 */
export declare function planIntegrationGate(workDir: string, input: IntegrationGateInput): IntegrationPlan;
/**
 * Decide whether the gate must re-run a worker's own validation (§10).
 *
 * The integrator re-validates a worker only when there is a concrete reason: the source
 * moved after the worker proved it, the handoff cannot be trusted, integration touched
 * the same files, or the integration policy demands a broader level than the worker ran.
 *
 * @returns The reasons to re-validate. Empty means inherit the worker's evidence.
 */
export declare function reasonsToRevalidate(workDir: string, handoff: WorkerHandoff, plan: IntegrationPlan): string[];
/** A rendered summary of what the gate will do, for reports and logs. */
export declare function describeIntegrationPlan(plan: IntegrationPlan): string[];

import type { DeliveryEfficiencyConfig, SfConfig } from '../types.js';
import { escalateBudget, suggestEscalation, type ClassificationInput, type DeliveryBudget, type DeliveryBudgetLevel } from './delivery-budget.js';
import { type ScopeInput, type ScopeDecision, type CompletionInput, type DeliveryComplete, type ExecutionPolicy } from './delivery-policy.js';
import { type EvidenceQuery, type ValidationDecision, type RecordEvidenceInput, type EvidenceEntry } from './delivery-evidence.js';
/** Resolve the effective settings, filling defaults for a config written before this layer. */
export declare function deliverySettings(config: SfConfig): DeliveryEfficiencyConfig;
/** Load the effective settings straight from a workspace. */
export declare function loadDeliverySettings(workDir: string): DeliveryEfficiencyConfig;
/** True when the layer is active for this workspace. */
export declare function isDeliveryEfficiencyEnabled(workDir: string): boolean;
/**
 * Classify a task's delivery budget, honoring configuration (§1, §20).
 *
 * When the layer is disabled every task is HIGH: the pre-existing behavior was to apply
 * the fullest validation regardless of risk, and that is what "disabled" must mean.
 */
export declare function assignBudget(workDir: string, input: ClassificationInput): DeliveryBudget;
/** The execution policy for a budget (§2). */
export declare function executionPolicy(budget: DeliveryBudgetLevel): ExecutionPolicy;
export { escalateBudget, suggestEscalation };
/**
 * Choose a test scope, honoring configuration (§5, §20).
 *
 * `test_scope_policy = "always-full"` restores unconditional repository-wide testing for
 * teams that want it, and disabling the layer does the same.
 */
export declare function chooseTestScope(workDir: string, input: ScopeInput): ScopeDecision;
/**
 * Decide whether a validation must actually run (§3, §4).
 *
 * With reuse off, a valid prior result is ignored and the command runs again. With dedup
 * off, two workers may run the same expensive validation concurrently. Both remain
 * available because a team may legitimately want the redundancy while it builds trust in
 * the layer.
 */
export declare function shouldRunValidation(workDir: string, query: EvidenceQuery, owner: string): ValidationDecision;
/**
 * Record a validation result.
 *
 * Recording happens even when reuse is disabled: the data is what `$cost` reports on, and
 * a team can enable reuse later against evidence already collected.
 */
export declare function saveValidationEvidence(workDir: string, input: RecordEvidenceInput): EvidenceEntry | null;
/**
 * Evaluate the stop condition (§8).
 *
 * With `stop_when_proven = false` the criteria are still evaluated and reported, but the
 * verdict never says "complete" — an operator who wants an agent to keep going keeps that
 * option, without losing the diagnostic.
 */
export declare function checkCompletion(workDir: string, input: CompletionInput): DeliveryComplete;

// Delivery Efficiency — the config-aware facade.
//
// Every gate the layer applies is switchable, and all of the switching lives here rather
// than being scattered through call sites. That matters for §23: with
// `delivery_efficiency.enabled = false`, every function below degrades to the behavior
// SkillFoundry had before this layer existed — full scope, no reuse, no dedup, no early
// stop — so an existing project keeps working unchanged.
import { loadConfig, DEFAULT_DELIVERY_EFFICIENCY } from './config.js';
import { classifyDeliveryBudget, escalateBudget, suggestEscalation, } from './delivery-budget.js';
import { selectTestScope, evaluateCompletion, policyFor, } from './delivery-policy.js';
import { decideValidation, recordEvidence, lookupEvidence, claimValidation, evidenceKey, } from './delivery-evidence.js';
import { getLogger } from '../utils/logger.js';
/** Resolve the effective settings, filling defaults for a config written before this layer. */
export function deliverySettings(config) {
    return { ...DEFAULT_DELIVERY_EFFICIENCY, ...(config.delivery_efficiency ?? {}) };
}
/** Load the effective settings straight from a workspace. */
export function loadDeliverySettings(workDir) {
    return deliverySettings(loadConfig(workDir));
}
/** True when the layer is active for this workspace. */
export function isDeliveryEfficiencyEnabled(workDir) {
    return loadDeliverySettings(workDir).enabled;
}
// ── Budget ────────────────────────────────────────────────────────────────────
/**
 * Classify a task's delivery budget, honoring configuration (§1, §20).
 *
 * When the layer is disabled every task is HIGH: the pre-existing behavior was to apply
 * the fullest validation regardless of risk, and that is what "disabled" must mean.
 */
export function assignBudget(workDir, input) {
    const settings = loadDeliverySettings(workDir);
    if (!settings.enabled) {
        return {
            level: 'HIGH',
            reason: 'Delivery efficiency is disabled; every task receives full validation.',
            source: 'DEFAULT',
            overridden: false,
            createdAt: new Date().toISOString(),
            escalations: [],
            safetyCritical: false,
            signals: [],
        };
    }
    const budget = classifyDeliveryBudget({
        ...input,
        defaultLevel: input.defaultLevel ?? settings.default_budget,
    });
    getLogger().info('delivery', 'budget_selected', {
        level: budget.level, source: budget.source, safetyCritical: budget.safetyCritical,
    });
    return budget;
}
/** The execution policy for a budget (§2). */
export function executionPolicy(budget) {
    return policyFor(budget);
}
export { escalateBudget, suggestEscalation };
// ── Test scope ────────────────────────────────────────────────────────────────
/**
 * Choose a test scope, honoring configuration (§5, §20).
 *
 * `test_scope_policy = "always-full"` restores unconditional repository-wide testing for
 * teams that want it, and disabling the layer does the same.
 */
export function chooseTestScope(workDir, input) {
    const settings = loadDeliverySettings(workDir);
    if (!settings.enabled || settings.test_scope_policy === 'always-full') {
        const why = settings.enabled
            ? 'test_scope_policy is "always-full"'
            : 'delivery efficiency is disabled';
        return {
            scope: 'full',
            reasons: [`Repository-wide scope because ${why}.`],
            avoided: [],
        };
    }
    return selectTestScope(input);
}
// ── Evidence ──────────────────────────────────────────────────────────────────
/**
 * Decide whether a validation must actually run (§3, §4).
 *
 * With reuse off, a valid prior result is ignored and the command runs again. With dedup
 * off, two workers may run the same expensive validation concurrently. Both remain
 * available because a team may legitimately want the redundancy while it builds trust in
 * the layer.
 */
export function shouldRunValidation(workDir, query, owner) {
    const settings = loadDeliverySettings(workDir);
    if (!settings.enabled) {
        return { action: 'RUN', reason: 'Delivery efficiency is disabled; every validation runs.' };
    }
    if (!settings.evidence_reuse && !settings.validation_deduplication) {
        return { action: 'RUN', reason: 'Evidence reuse and validation deduplication are both disabled.' };
    }
    if (!settings.evidence_reuse) {
        // Dedup only. `decideValidation` short-circuits on reusable evidence *before* taking a
        // claim, so routing through it here would silently disable deduplication too. Claim
        // directly instead: the result is never reused, but two workers still never run the
        // same expensive validation concurrently.
        const claim = claimValidation(workDir, evidenceKey(query.kind, query.command, query.scope), owner);
        if (!claim.granted) {
            return { action: 'WAIT', reason: claim.reason, claim };
        }
        return {
            action: 'RUN',
            reason: 'Evidence reuse is disabled; running regardless of any prior evidence.',
            claim,
        };
    }
    if (!settings.validation_deduplication) {
        // Reuse only: consult evidence, but never block on another worker's claim.
        const lookup = lookupEvidence(workDir, query);
        if (lookup.status === 'REUSABLE') {
            getLogger().info('delivery', 'validation_skipped_already_proven', { kind: query.kind });
            return { action: 'REUSE', reason: lookup.reason, evidence: lookup.entry };
        }
        if (lookup.status === 'FAILED_PREVIOUSLY') {
            return { action: 'FIX_FIRST', reason: lookup.reason, evidence: lookup.entry };
        }
        return { action: 'RUN', reason: lookup.reason };
    }
    return decideValidation(workDir, query, owner);
}
/**
 * Record a validation result.
 *
 * Recording happens even when reuse is disabled: the data is what `$cost` reports on, and
 * a team can enable reuse later against evidence already collected.
 */
export function saveValidationEvidence(workDir, input) {
    if (!loadDeliverySettings(workDir).enabled)
        return null;
    return recordEvidence(workDir, input);
}
// ── Completion ────────────────────────────────────────────────────────────────
/**
 * Evaluate the stop condition (§8).
 *
 * With `stop_when_proven = false` the criteria are still evaluated and reported, but the
 * verdict never says "complete" — an operator who wants an agent to keep going keeps that
 * option, without losing the diagnostic.
 */
export function checkCompletion(workDir, input) {
    const settings = loadDeliverySettings(workDir);
    const verdict = evaluateCompletion(input);
    if (!settings.enabled || !settings.stop_when_proven) {
        return {
            ...verdict,
            complete: false,
            stopGuidance: [
                settings.enabled
                    ? 'stop_when_proven is disabled; completion is reported but not enforced.'
                    : 'Delivery efficiency is disabled; completion is reported but not enforced.',
            ],
        };
    }
    return verdict;
}
//# sourceMappingURL=delivery.js.map
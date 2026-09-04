// Delivery Efficiency — the integration gate.
//
// Parallel implementation is not parallel validation. Three workers changing three
// unrelated features should not each run the full suite; the expensive repository-wide
// pass belongs here, once, over the aggregate change.
//
//   Worker A → targeted    ┐
//   Worker B → targeted    ├→ integration gate → repository-wide validation ONCE
//   Worker C → targeted    ┘
//
// The gate does not re-run what the workers already proved, unless integration itself
// changed the files that evidence depended on.
import { revParse, isAncestor, changedFilesBetween, workingTreeStatus, } from './mission-git.js';
import { invalidateForFiles, decideValidation, } from './delivery-evidence.js';
import { aggregateRequiredScope, scopeAtLeast, } from './delivery-policy.js';
import { invalidateFactsForFiles, aggregateChangedFiles } from './delivery-context.js';
import { getLogger } from '../utils/logger.js';
/**
 * Verify a worker's handoff before trusting its evidence (§11 steps 1-2).
 *
 * A handoff is only worth consuming if its commits exist and its claimed base is a real
 * ancestor. An untrusted handoff does not fail integration — it means the integrator must
 * re-prove that worker's change rather than inherit it.
 */
export function verifyHandoff(workDir, handoff) {
    const problems = [];
    const base = revParse(workDir, handoff.baseCommit);
    const result = revParse(workDir, handoff.resultCommit);
    if (!base)
        problems.push(`Base commit ${handoff.baseCommit} cannot be resolved`);
    if (!result)
        problems.push(`Result commit ${handoff.resultCommit} cannot be resolved`);
    if (base && result && !isAncestor(workDir, base, result)) {
        problems.push(`Claimed base ${handoff.baseCommit.slice(0, 8)} is not an ancestor of ${handoff.resultCommit.slice(0, 8)} — the handoff misstates its baseline`);
    }
    if (base && result) {
        const actual = changedFilesBetween(workDir, base, result);
        const claimed = new Set(handoff.changedFiles);
        const undeclared = actual.filter((f) => !claimed.has(f));
        if (undeclared.length > 0) {
            problems.push(`${undeclared.length} file(s) changed but not declared in the handoff: ${undeclared.slice(0, 5).join(', ')}`);
        }
    }
    if (handoff.evidenceGenerated.length === 0 && handoff.testsExecuted.length === 0) {
        problems.push('Handoff records no executed validation and no generated evidence');
    }
    return { taskId: handoff.taskId, trusted: problems.length === 0, problems };
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
export function planIntegrationGate(workDir, input) {
    const mission = input.mission ?? 'default';
    const owner = input.owner ?? 'integration-gate';
    // 1-2. Which handoffs can be trusted at all.
    const verifications = input.handoffs.map((h) => verifyHandoff(workDir, h));
    const trusted = verifications.filter((v) => v.trusted).map((v) => v.taskId);
    const untrusted = verifications.filter((v) => !v.trusted);
    // 4. The aggregate blast radius, including anything integration itself touched.
    const fromWorkers = aggregateChangedFiles(input.handoffs);
    const integrationChanges = input.integrationChangedFiles ?? [];
    const aggregate = [...new Set([...fromWorkers, ...integrationChanges])].sort();
    // 5. Integration's own edits invalidate evidence and facts that depended on them.
    // Worker-declared changes do not: those files were already at this content when the
    // worker proved them, so re-invalidating would discard exactly the evidence we want.
    const invalidatedEvidence = integrationChanges.length > 0
        ? invalidateForFiles(workDir, integrationChanges)
        : [];
    const invalidatedFacts = integrationChanges.length > 0
        ? invalidateFactsForFiles(workDir, mission, integrationChanges)
        : [];
    // 7. The scope the aggregate demands — driven by the riskiest contribution.
    const budgets = input.handoffs.map((h) => h.budget);
    const required = aggregateRequiredScope(budgets);
    // 8. Decide each validation: reuse what is still proven, run only what is missing.
    const validations = [];
    for (const v of input.requiredValidations) {
        const query = {
            kind: v.kind,
            command: v.command,
            scope: v.scope,
            changedFiles: aggregate,
        };
        const decision = decideValidation(workDir, query, owner);
        validations.push({
            kind: v.kind,
            command: v.command,
            scope: v.scope,
            action: decision.action,
            reason: decision.reason,
            evidence: decision.evidence,
        });
    }
    // What the gate deliberately did not repeat.
    const deduplicated = input.handoffs
        .filter((h) => trusted.includes(h.taskId) && !scopeAtLeast(h.validationScope, required.scope))
        .map((h) => ({
        taskId: h.taskId,
        scope: h.validationScope,
        why: `Worker already proved its change at "${h.validationScope}"; the gate covers the ` +
            `aggregate at "${required.scope}" once instead of re-running per worker.`,
    }));
    const status = workingTreeStatus(workDir);
    getLogger().info('delivery', 'integration_gate_planned', {
        handoffs: input.handoffs.length,
        trusted: trusted.length,
        aggregateFiles: aggregate.length,
        reused: validations.filter((v) => v.action === 'REUSE').length,
        toRun: validations.filter((v) => v.action === 'RUN').length,
    });
    return {
        trustedHandoffs: trusted,
        untrustedHandoffs: untrusted,
        aggregateChangedFiles: aggregate,
        integrationChangedFiles: integrationChanges,
        invalidatedEvidence,
        invalidatedFacts,
        requiredBudget: required.budget,
        requiredScope: required.scope,
        scopeReason: required.reason,
        validations,
        deduplicated,
        workingTreeDirty: !status.clean,
    };
}
/**
 * Decide whether the gate must re-run a worker's own validation (§10).
 *
 * The integrator re-validates a worker only when there is a concrete reason: the source
 * moved after the worker proved it, the handoff cannot be trusted, integration touched
 * the same files, or the integration policy demands a broader level than the worker ran.
 *
 * @returns The reasons to re-validate. Empty means inherit the worker's evidence.
 */
export function reasonsToRevalidate(workDir, handoff, plan) {
    const reasons = [];
    if (!plan.trustedHandoffs.includes(handoff.taskId)) {
        const problems = plan.untrustedHandoffs.find((v) => v.taskId === handoff.taskId)?.problems ?? [];
        reasons.push(`Handoff is not trustworthy: ${problems.join('; ')}`);
    }
    const integrationTouched = handoff.changedFiles.filter((f) => plan.integrationChangedFiles.includes(f));
    for (const key of handoff.evidenceGenerated) {
        if (plan.invalidatedEvidence.includes(key)) {
            reasons.push(`Evidence ${key} was invalidated by integration changes`);
        }
    }
    const result = revParse(workDir, handoff.resultCommit);
    if (result && result !== handoff.resultCommit) {
        reasons.push('Result commit no longer resolves to the same object — the source moved after validation');
    }
    if (!scopeAtLeast(handoff.validationScope, plan.requiredScope) && plan.requiredBudget === 'HIGH') {
        reasons.push(`Integration policy requires "${plan.requiredScope}" for a HIGH-risk aggregate; this worker ran "${handoff.validationScope}"`);
    }
    if (integrationTouched.length > 0 && reasons.length === 0) {
        reasons.push(`Integration modified ${integrationTouched.length} file(s) this worker also changed`);
    }
    return reasons;
}
/** A rendered summary of what the gate will do, for reports and logs. */
export function describeIntegrationPlan(plan) {
    const lines = [];
    lines.push(`Handoffs trusted: ${plan.trustedHandoffs.length}, re-prove: ${plan.untrustedHandoffs.length}`);
    lines.push(`Aggregate changed files: ${plan.aggregateChangedFiles.length}`);
    lines.push(`Required: ${plan.requiredBudget} budget → "${plan.requiredScope}" scope`);
    lines.push(`  ${plan.scopeReason}`);
    const reuse = plan.validations.filter((v) => v.action === 'REUSE');
    const run = plan.validations.filter((v) => v.action === 'RUN');
    lines.push(`Validations: ${run.length} to run, ${reuse.length} reused`);
    for (const v of reuse)
        lines.push(`  REUSE ${v.kind}: ${v.reason}`);
    for (const v of run)
        lines.push(`  RUN   ${v.kind}: ${v.reason}`);
    if (plan.deduplicated.length > 0) {
        lines.push(`Worker runs not repeated: ${plan.deduplicated.length}`);
    }
    if (plan.invalidatedEvidence.length > 0) {
        lines.push(`Evidence invalidated by integration: ${plan.invalidatedEvidence.length}`);
    }
    if (plan.workingTreeDirty) {
        lines.push('WARNING: working tree is dirty — validation results cannot be attributed to a commit');
    }
    return lines;
}
//# sourceMappingURL=delivery-integration.js.map
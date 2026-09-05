// Delivery Efficiency — the risk-based execution policy.
//
// The delivery budget says how much validation a change is worth. This module turns that
// into concrete decisions: which steps run, which test scope applies, and — the part most
// agents get wrong — when the task is *finished*.
//
// The failure mode being closed here is not under-testing. It is an agent that keeps
// inspecting, re-testing and re-reviewing a change that was already proven correct three
// steps ago, because nothing ever told it to stop.

import type { DeliveryBudgetLevel } from './delivery-budget.js';
import { atLeast, maxBudget } from './delivery-budget.js';
import { getLogger } from '../utils/logger.js';

// ── Test scope (§5) ───────────────────────────────────────────────────────────

/** Validation breadth, cheapest first. */
export const TEST_SCOPES = ['smoke', 'targeted', 'affected', 'integration', 'full'] as const;

export type TestScope = (typeof TEST_SCOPES)[number];

/** Runtime guard for the scope vocabulary. */
export function isTestScope(value: unknown): value is TestScope {
  return typeof value === 'string' && (TEST_SCOPES as readonly string[]).includes(value);
}

const SCOPE_RANK: Record<TestScope, number> = {
  smoke: 0, targeted: 1, affected: 2, integration: 3, full: 4,
};

/** The broader of two scopes. */
export function maxScope(a: TestScope, b: TestScope): TestScope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/** True when `a` is at least as broad as `b`. */
export function scopeAtLeast(a: TestScope, b: TestScope): boolean {
  return SCOPE_RANK[a] >= SCOPE_RANK[b];
}

// ── Execution policy (§2) ─────────────────────────────────────────────────────

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

const LOW_POLICY: ExecutionPolicy = {
  budget: 'LOW',
  steps: [
    { id: 'inspect-relevant', description: 'Inspect only the files the change touches' },
    { id: 'implement', description: 'Implement the change' },
    { id: 'typecheck', description: 'Compile or type-check', conditional: true },
    { id: 'smoke', description: 'Run targeted smoke tests' },
    { id: 'diff-review', description: 'Inspect the diff once' },
    { id: 'stop', description: 'Stop — do not broaden without evidence' },
  ],
  baseTestScope: 'smoke',
  allowRepoWideAtWorker: false,
  requiresPlan: false,
  requiresSecurityChecks: false,
  requiresAcceptanceVerification: false,
  requiresRegression: false,
};

const MEDIUM_POLICY: ExecutionPolicy = {
  budget: 'MEDIUM',
  steps: [
    { id: 'scoped-analysis', description: 'Scoped repository analysis — the affected module, not the repository' },
    { id: 'implement', description: 'Implement the change' },
    { id: 'targeted-tests', description: 'Run targeted tests for the changed behavior' },
    { id: 'affected-build', description: 'Build the affected package or project' },
    { id: 'diff-review', description: 'Focused diff review' },
    { id: 'acceptance', description: 'Verify each acceptance criterion' },
    { id: 'stop', description: 'Stop — broaden only on evidence of wider impact' },
  ],
  baseTestScope: 'targeted',
  allowRepoWideAtWorker: false,
  requiresPlan: false,
  requiresSecurityChecks: false,
  requiresAcceptanceVerification: true,
  requiresRegression: false,
};

const HIGH_POLICY: ExecutionPolicy = {
  budget: 'HIGH',
  steps: [
    { id: 'plan', description: 'Write an explicit implementation plan before touching code' },
    { id: 'dependency-analysis', description: 'Analyse dependencies and blast radius' },
    { id: 'implement', description: 'Implement the change' },
    { id: 'targeted-tests', description: 'Run targeted tests' },
    { id: 'integration-tests', description: 'Run integration tests where available', conditional: true },
    { id: 'security-checks', description: 'Run security-sensitive checks — never skippable' },
    { id: 'broader-build', description: 'Build broadly enough to cover the blast radius' },
    { id: 'acceptance', description: 'Verify each acceptance criterion' },
    { id: 'regression', description: 'Run regression checks' },
    { id: 'final-review', description: 'Final review' },
  ],
  baseTestScope: 'integration',
  allowRepoWideAtWorker: true,
  requiresPlan: true,
  requiresSecurityChecks: true,
  requiresAcceptanceVerification: true,
  requiresRegression: true,
};

/** The execution policy for a budget level. */
export function policyFor(level: DeliveryBudgetLevel): ExecutionPolicy {
  switch (level) {
    case 'LOW': return LOW_POLICY;
    case 'MEDIUM': return MEDIUM_POLICY;
    case 'HIGH': return HIGH_POLICY;
  }
}

// ── Test scope selection (§5) ─────────────────────────────────────────────────

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
  avoided: Array<{ scope: TestScope; why: string }>;
  /** True when an override was refused for under-testing a high-risk change. */
  overrideRefused?: boolean;
}

/** Fan-out beyond which a change is no longer plausibly local. */
const WIDE_DEPENDENCY_FANOUT = 15;

/**
 * Choose the narrowest test scope that can still prove the acceptance criteria (§5).
 *
 * Never returns `full` from the budget alone. `full` is reached only by an explicit
 * override, or at the integration gate for a HIGH-risk change — the two cases where
 * repository-wide cost is actually justified.
 */
export function selectTestScope(input: ScopeInput): ScopeDecision {
  const reasons: string[] = [];
  const avoided: ScopeDecision['avoided'] = [];
  const base = policyFor(input.budget).baseTestScope;

  let scope = base;
  reasons.push(`${input.budget} budget starts at "${base}"`);

  // Dependency fan-out is the strongest signal that targeted tests are not enough.
  const fanout = input.dependents?.length ?? 0;
  if (fanout >= WIDE_DEPENDENCY_FANOUT && scopeAtLeast('affected', scope)) {
    scope = maxScope(scope, 'affected');
    reasons.push(`${fanout} dependent file(s) exceed the ${WIDE_DEPENDENCY_FANOUT}-file fan-out bound — widened to "affected"`);
  } else if (fanout > 0) {
    avoided.push({
      scope: 'affected',
      why: `only ${fanout} dependent file(s) — narrower tests still cover the blast radius`,
    });
  }

  // The integration gate is where repository-wide cost is paid, once (§11).
  if (input.isIntegrationGate) {
    const gateScope: TestScope = input.budget === 'HIGH' ? 'full' : 'integration';
    scope = maxScope(scope, gateScope);
    reasons.push(`integration gate for a ${input.budget} change runs "${gateScope}" once, instead of per worker`);
  } else {
    avoided.push({
      scope: 'full',
      why: 'worker-level validation is scoped; repository-wide validation belongs to the integration gate',
    });
  }

  // An override may broaden freely, but must not under-test a high-risk change.
  if (input.override) {
    if (input.budget === 'HIGH' && !scopeAtLeast(input.override, 'targeted')) {
      reasons.push(`override "${input.override}" refused: a HIGH-risk change cannot be proven by "${input.override}" alone`);
      getLogger().warn('delivery', 'test_scope_override_refused', {
        requested: input.override, budget: input.budget,
      });
      return { scope, reasons, avoided, overrideRefused: true };
    }
    reasons.push(`explicit override to "${input.override}"`);
    scope = input.override;
  }

  // Acceptance criteria that name integration behavior need integration tests.
  if (input.acceptanceCriteria?.some((ac) => /\b(end-to-end|e2e|integration|across services|full flow)\b/i.test(ac))) {
    scope = maxScope(scope, 'integration');
    reasons.push('an acceptance criterion names integration behavior');
  }

  getLogger().info('delivery', 'test_scope_selected', { scope, budget: input.budget, fanout });
  return { scope, reasons, avoided };
}

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
export function escalateTestScope(
  current: TestScope,
  signals: {
    failureOutsideChangedFiles?: boolean;
    newDependentsDiscovered?: number;
    fixedWithinScope?: boolean;
  },
): { scope: TestScope; reason: string } | null {
  if (signals.failureOutsideChangedFiles) {
    const next = maxScope(current, 'affected');
    if (next !== current) {
      return { scope: next, reason: 'a failure named files outside the change — the blast radius is wider than assumed' };
    }
  }

  if ((signals.newDependentsDiscovered ?? 0) >= WIDE_DEPENDENCY_FANOUT) {
    const next = maxScope(current, 'integration');
    if (next !== current) {
      return {
        scope: next,
        reason: `${signals.newDependentsDiscovered} newly discovered dependents exceed the fan-out bound`,
      };
    }
  }

  // Fixed inside the scope, nothing pointing outward: the narrow scope proved the change.
  if (signals.fixedWithinScope) return null;

  return null;
}

// ── Stop conditions (§8) ──────────────────────────────────────────────────────

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
export function evaluateCompletion(input: CompletionInput): DeliveryComplete {
  const policy = policyFor(input.budget);
  const criteria: CompletionCriterion[] = [];

  criteria.push({
    id: 'implementation-complete',
    applicable: true,
    met: input.implementationComplete,
    detail: input.implementationComplete ? 'Implementation finished' : 'Implementation is not finished',
  });

  const total = input.acceptanceCriteriaTotal ?? 0;
  const proven = input.acceptanceCriteriaProven ?? 0;
  criteria.push({
    id: 'acceptance-proven',
    applicable: policy.requiresAcceptanceVerification && total > 0,
    met: total > 0 && proven >= total,
    detail: total > 0 ? `${proven}/${total} acceptance criteria proven` : 'No acceptance criteria recorded',
  });

  const validationMet = Boolean(
    input.validationPassedAtScope && scopeAtLeast(input.validationPassedAtScope, input.requiredScope),
  );
  criteria.push({
    id: 'validation-passed',
    applicable: true,
    met: validationMet,
    detail: input.validationPassedAtScope
      ? `Passed at "${input.validationPassedAtScope}" (required "${input.requiredScope}")`
      : `No validation recorded (required "${input.requiredScope}")`,
  });

  criteria.push({
    id: 'security-checks',
    applicable: policy.requiresSecurityChecks,
    met: Boolean(input.securityChecksRun),
    detail: input.securityChecksRun
      ? 'Security-sensitive checks ran'
      : 'Security checks are mandatory at HIGH and cannot be skipped',
  });

  const blockers = input.blockers ?? [];
  criteria.push({
    id: 'no-blockers',
    applicable: true,
    met: blockers.length === 0,
    detail: blockers.length === 0 ? 'No unresolved blockers' : `Blocked: ${blockers.join('; ')}`,
  });

  criteria.push({
    id: 'diff-inspected',
    applicable: true,
    met: input.diffInspected,
    detail: input.diffInspected ? 'Diff inspected' : 'Diff has not been inspected',
  });

  criteria.push({
    id: 'evidence-recorded',
    applicable: true,
    met: input.evidenceRecorded,
    detail: input.evidenceRecorded ? 'Evidence recorded' : 'Required evidence has not been recorded',
  });

  const outstanding = criteria.filter((c) => c.applicable && !c.met).map((c) => `${c.id}: ${c.detail}`);
  const complete = outstanding.length === 0;

  const stopGuidance = complete
    ? [
        'The change is proven. Do not re-read the same unchanged diff.',
        'Do not broaden test scope without evidence of wider impact.',
        'Do not perform opportunistic refactoring or cleanup that was not requested.',
        'Do not re-run a validation that already passed against this repository state.',
      ]
    : [];

  if (complete) {
    getLogger().info('delivery', 'delivery_complete', {
      budget: input.budget, scope: input.validationPassedAtScope,
    });
  }

  return { complete, budget: input.budget, criteria, outstanding, stopGuidance };
}

/**
 * The minimum validation a budget demands, for the integration gate to reason about.
 *
 * @param budgets - Budgets of every contribution being integrated.
 * @returns The scope the aggregate integration must reach.
 */
export function aggregateRequiredScope(budgets: DeliveryBudgetLevel[]): {
  budget: DeliveryBudgetLevel;
  scope: TestScope;
  reason: string;
} {
  if (budgets.length === 0) {
    return { budget: 'LOW', scope: 'smoke', reason: 'No contributions to integrate' };
  }
  const highest = budgets.reduce((a, b) => maxBudget(a, b), 'LOW' as DeliveryBudgetLevel);
  const decision = selectTestScope({ budget: highest, isIntegrationGate: true });
  return {
    budget: highest,
    scope: decision.scope,
    reason:
      `Highest contribution budget is ${highest} across ${budgets.length} contribution(s); ` +
      `the integration gate runs "${decision.scope}" once rather than per worker.`,
  };
}

/** True when the given budget permits skipping a repository-wide run at worker level. */
export function mayDeferRepoWideValidation(level: DeliveryBudgetLevel): boolean {
  return !policyFor(level).allowRepoWideAtWorker || !atLeast(level, 'HIGH');
}

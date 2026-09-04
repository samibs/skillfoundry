import { describe, it, expect, vi } from 'vitest';
import {
  classifyDeliveryBudget, escalateBudget, suggestEscalation, describeBudget,
  isDeliveryBudgetLevel, atLeast, maxBudget, DELIVERY_BUDGETS,
  type DeliveryBudget,
} from '../core/delivery-budget.js';
import {
  policyFor, selectTestScope, escalateTestScope, evaluateCompletion,
  aggregateRequiredScope, maxScope, scopeAtLeast, isTestScope, TEST_SCOPES,
} from '../core/delivery-policy.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

/** A budget object for escalation tests, without going through classification. */
function budgetAt(level: 'LOW' | 'MEDIUM' | 'HIGH'): DeliveryBudget {
  return {
    level, reason: 'test', source: 'DEFAULT', overridden: false,
    createdAt: new Date().toISOString(), escalations: [], safetyCritical: false, signals: [],
  };
}

describe('vocabulary guards', () => {
  it('recognises every declared level and scope', () => {
    for (const b of DELIVERY_BUDGETS) expect(isDeliveryBudgetLevel(b)).toBe(true);
    for (const s of TEST_SCOPES) expect(isTestScope(s)).toBe(true);
  });

  it('rejects invented levels', () => {
    expect(isDeliveryBudgetLevel('URGENT')).toBe(false);
    expect(isTestScope('everything')).toBe(false);
  });

  it('orders budgets and scopes', () => {
    expect(atLeast('HIGH', 'LOW')).toBe(true);
    expect(atLeast('LOW', 'HIGH')).toBe(false);
    expect(maxBudget('LOW', 'MEDIUM')).toBe('MEDIUM');
    expect(maxScope('smoke', 'integration')).toBe('integration');
    expect(scopeAtLeast('full', 'targeted')).toBe(true);
  });
});

describe('LOW classification (§1)', () => {
  it('classifies a stylesheet tweak as LOW', () => {
    const b = classifyDeliveryBudget({
      text: 'adjust the padding and colour of the header',
      changedFiles: ['src/styles/header.css'],
    });
    expect(b.level).toBe('LOW');
    expect(b.safetyCritical).toBe(false);
  });

  it('classifies a documentation change as LOW', () => {
    const b = classifyDeliveryBudget({ text: 'fix a typo in the readme', changedFiles: ['README.md'] });
    expect(b.level).toBe('LOW');
  });

  it('classifies an isolated DTO rename as LOW', () => {
    const b = classifyDeliveryBudget({
      text: 'rename the displayName field on the user DTO',
      changedFiles: ['src/dto/user.ts'],
    });
    expect(b.level).toBe('LOW');
  });

  it('records a reason and the matched signals', () => {
    const b = classifyDeliveryBudget({ text: 'fix a typo', changedFiles: ['docs/guide.md'] });
    expect(b.reason.length).toBeGreaterThan(0);
    expect(b.signals.length).toBeGreaterThan(0);
    expect(describeBudget(b)).toContain('LOW');
  });
});

describe('MEDIUM classification (§1)', () => {
  it('defaults ordinary feature work to MEDIUM', () => {
    const b = classifyDeliveryBudget({
      text: 'add a GET endpoint that returns paginated orders',
      changedFiles: ['src/api/orders.ts', 'src/services/orders.ts'],
    });
    expect(b.level).toBe('MEDIUM');
    expect(b.source).toBe('DEFAULT');
  });

  it('lifts a broad change out of LOW even when every file looks benign', () => {
    const files = Array.from({ length: 12 }, (_, i) => `docs/page-${i}.md`);
    const b = classifyDeliveryBudget({ text: 'documentation refresh', changedFiles: files });
    expect(b.level).toBe('MEDIUM');
    expect(b.source).toBe('CHANGE_BREADTH');
  });

  it('honours a configured default of LOW for unremarkable work', () => {
    const b = classifyDeliveryBudget({ text: 'tweak the ordering', defaultLevel: 'LOW' });
    expect(b.level).toBe('LOW');
  });
});

describe('HIGH classification (§1, §19)', () => {
  it.each([
    ['authentication', 'rework the login flow and session token handling', 'src/auth/session.ts'],
    ['cryptography', 'change the password hashing algorithm', 'src/security/hash.ts'],
    ['migration', 'add a migration that drops the legacy column', 'db/migrations/003_drop.sql'],
    ['concurrency', 'fix a race condition in the transaction handler', 'src/tx/manager.ts'],
    ['deployment', 'update the production deployment rollout', '.github/workflows/deploy.yml'],
    ['financial', 'correct the invoice refund calculation', 'src/billing/refund.ts'],
  ])('classifies %s work as HIGH', (_label, text, file) => {
    const b = classifyDeliveryBudget({ text, changedFiles: [file] });
    expect(b.level).toBe('HIGH');
    expect(b.safetyCritical).toBe(true);
  });

  it('classifies on path alone, even when the text sounds trivial', () => {
    const b = classifyDeliveryBudget({
      text: 'tiny tweak, just a one-line change',
      changedFiles: ['src/auth/token-validator.ts'],
    });
    expect(b.level).toBe('HIGH');
    expect(b.signals.join(' ')).toMatch(/authentication/);
  });

  it('classifies on text alone, with no files known yet', () => {
    const b = classifyDeliveryBudget({ text: 'rotate the signing key used for JWTs' });
    expect(b.level).toBe('HIGH');
  });

  it('is not fooled by a low-risk file extension on a safety-critical path', () => {
    const b = classifyDeliveryBudget({
      text: 'update config',
      changedFiles: ['deploy/terraform/main.tf', 'src/secrets/config.json'],
    });
    expect(b.level).toBe('HIGH');
  });
});

describe('explicit override (§1)', () => {
  it('honours an override on ordinary work', () => {
    const b = classifyDeliveryBudget({ text: 'add a field to the response', override: 'HIGH' });
    expect(b.level).toBe('HIGH');
    expect(b.overridden).toBe(true);
    expect(b.source).toBe('EXPLICIT_OVERRIDE');
  });

  it('lets an override lower a non-safety-critical classification', () => {
    const b = classifyDeliveryBudget({
      text: 'add a GET endpoint',
      changedFiles: ['src/api/orders.ts'],
      override: 'LOW',
    });
    expect(b.level).toBe('LOW');
    expect(b.overridden).toBe(true);
  });

  it('REFUSES an override that would downgrade safety-critical work (§19)', () => {
    const b = classifyDeliveryBudget({
      text: 'small change to the authorization middleware',
      changedFiles: ['src/auth/middleware.ts'],
      override: 'LOW',
    });
    expect(b.level).toBe('HIGH');
    expect(b.overridden).toBe(false);
    expect(b.reason).toMatch(/refused/i);
    expect(b.reason).toMatch(/never bypass/i);
  });

  it('allows the downgrade only with a deliberate opt-in', () => {
    const b = classifyDeliveryBudget({
      text: 'small change to the authorization middleware',
      changedFiles: ['src/auth/middleware.ts'],
      override: 'LOW',
      allowUnsafeOverride: true,
    });
    expect(b.level).toBe('LOW');
  });

  it('still lets an override raise a safety-critical task', () => {
    const b = classifyDeliveryBudget({
      text: 'authentication change', changedFiles: ['src/auth/x.ts'], override: 'HIGH',
    });
    expect(b.level).toBe('HIGH');
  });
});

describe('escalation (§9)', () => {
  it('raises the budget on evidence', () => {
    const r = escalateBudget(budgetAt('LOW'), 'MEDIUM', 'compile failure outside the touched area', [
      'tsc error in src/unrelated/service.ts',
    ]);
    expect(r.applied).toBe(true);
    expect(r.budget.level).toBe('MEDIUM');
    expect(r.budget.escalations).toHaveLength(1);
    expect(r.budget.escalations[0].from).toBe('LOW');
    expect(r.budget.source).toBe('ESCALATION');
  });

  it('refuses an escalation with no evidence — arbitrary escalation is the same waste', () => {
    const r = escalateBudget(budgetAt('LOW'), 'HIGH', 'feels risky', []);
    expect(r.applied).toBe(false);
    expect(r.refusedReason).toMatch(/requires concrete evidence/);
  });

  it('refuses to lower a budget mid-task', () => {
    const r = escalateBudget(budgetAt('HIGH'), 'LOW', 'turned out simple', ['tests passed']);
    expect(r.applied).toBe(false);
    expect(r.refusedReason).toMatch(/never lowered/);
  });

  it('accumulates escalation history', () => {
    const first = escalateBudget(budgetAt('LOW'), 'MEDIUM', 'wider impact', ['e1']);
    const second = escalateBudget(first.budget, 'HIGH', 'auth discovered', ['e2']);
    expect(second.budget.escalations.map((e) => e.to)).toEqual(['MEDIUM', 'HIGH']);
  });

  it('suggests HIGH when safety-sensitive impact appears mid-run', () => {
    const s = suggestEscalation('MEDIUM', {
      failureOutput: 'FAIL src/session.test.ts — authorization check rejected the token',
    });
    expect(s?.to).toBe('HIGH');
    expect(s?.evidence.length).toBeGreaterThan(0);
  });

  it('suggests MEDIUM when a LOW change reaches further than expected', () => {
    const s = suggestEscalation('LOW', {
      discoveredFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
    });
    expect(s?.to).toBe('MEDIUM');
  });

  it('suggests nothing when the change stayed within its bounds', () => {
    expect(suggestEscalation('MEDIUM', { discoveredFiles: ['a.ts'] })).toBeNull();
  });
});

describe('execution policy (§2)', () => {
  it('keeps LOW away from repository-wide validation', () => {
    const p = policyFor('LOW');
    expect(p.baseTestScope).toBe('smoke');
    expect(p.allowRepoWideAtWorker).toBe(false);
    expect(p.requiresPlan).toBe(false);
  });

  it('gives MEDIUM targeted tests and acceptance verification, not repo-wide runs', () => {
    const p = policyFor('MEDIUM');
    expect(p.baseTestScope).toBe('targeted');
    expect(p.allowRepoWideAtWorker).toBe(false);
    expect(p.requiresAcceptanceVerification).toBe(true);
  });

  it('makes HIGH plan first and never skip security checks', () => {
    const p = policyFor('HIGH');
    expect(p.requiresPlan).toBe(true);
    expect(p.requiresSecurityChecks).toBe(true);
    expect(p.requiresRegression).toBe(true);
    expect(p.steps[0].id).toBe('plan');
  });
});

describe('test scope selection (§5, §16)', () => {
  it('never chooses full from the budget alone', () => {
    for (const budget of DELIVERY_BUDGETS) {
      expect(selectTestScope({ budget }).scope).not.toBe('full');
    }
  });

  it('starts LOW at smoke and MEDIUM at targeted', () => {
    expect(selectTestScope({ budget: 'LOW' }).scope).toBe('smoke');
    expect(selectTestScope({ budget: 'MEDIUM' }).scope).toBe('targeted');
  });

  it('explains why the scope was chosen', () => {
    const d = selectTestScope({ budget: 'MEDIUM' });
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.reasons[0]).toMatch(/MEDIUM budget starts at "targeted"/);
  });

  it('records what it deliberately did not run', () => {
    const d = selectTestScope({ budget: 'LOW' });
    expect(d.avoided.some((a) => a.scope === 'full')).toBe(true);
  });

  it('widens to affected on a large dependency fan-out', () => {
    const d = selectTestScope({
      budget: 'MEDIUM',
      dependents: Array.from({ length: 20 }, (_, i) => `dep-${i}`),
    });
    expect(d.scope).toBe('affected');
    expect(d.reasons.join(' ')).toMatch(/fan-out/);
  });

  it('stays targeted on a small fan-out and says so', () => {
    const d = selectTestScope({ budget: 'MEDIUM', dependents: ['a.ts', 'b.ts'] });
    expect(d.scope).toBe('targeted');
    expect(d.avoided.some((a) => a.scope === 'affected')).toBe(true);
  });

  it('pays repository-wide cost at the integration gate, not per worker', () => {
    const worker = selectTestScope({ budget: 'HIGH' });
    const gate = selectTestScope({ budget: 'HIGH', isIntegrationGate: true });
    expect(worker.scope).toBe('integration');
    expect(gate.scope).toBe('full');
    expect(gate.reasons.join(' ')).toMatch(/instead of per worker/);
  });

  it('widens when an acceptance criterion names integration behavior', () => {
    const d = selectTestScope({
      budget: 'LOW',
      acceptanceCriteria: ['the end-to-end checkout flow still completes'],
    });
    expect(scopeAtLeast(d.scope, 'integration')).toBe(true);
  });

  it('honours a broadening override', () => {
    const d = selectTestScope({ budget: 'LOW', override: 'affected' });
    expect(d.scope).toBe('affected');
  });

  it('REFUSES an override that would under-test a HIGH change (§19)', () => {
    const d = selectTestScope({ budget: 'HIGH', override: 'smoke' });
    expect(d.overrideRefused).toBe(true);
    expect(d.scope).toBe('integration');
    expect(d.reasons.join(' ')).toMatch(/cannot be proven by "smoke"/);
  });
});

describe('test scope escalation (§5)', () => {
  it('does NOT escalate after a failure was diagnosed and fixed in scope', () => {
    expect(escalateTestScope('targeted', { fixedWithinScope: true })).toBeNull();
  });

  it('escalates when a failure names files outside the change', () => {
    const r = escalateTestScope('targeted', { failureOutsideChangedFiles: true });
    expect(r?.scope).toBe('affected');
    expect(r?.reason).toMatch(/wider than assumed/);
  });

  it('escalates on a large newly discovered fan-out', () => {
    const r = escalateTestScope('targeted', { newDependentsDiscovered: 40 });
    expect(r?.scope).toBe('integration');
  });

  it('does not escalate past what the signal justifies', () => {
    expect(escalateTestScope('full', { failureOutsideChangedFiles: true })).toBeNull();
  });
});

describe('stop conditions (§8)', () => {
  const proven = {
    budget: 'MEDIUM' as const,
    implementationComplete: true,
    acceptanceCriteriaProven: 2,
    acceptanceCriteriaTotal: 2,
    validationPassedAtScope: 'targeted' as const,
    requiredScope: 'targeted' as const,
    blockers: [],
    diffInspected: true,
    evidenceRecorded: true,
  };

  it('reports complete once every applicable criterion is met', () => {
    const v = evaluateCompletion(proven);
    expect(v.complete).toBe(true);
    expect(v.outstanding).toEqual([]);
  });

  it('tells the agent explicitly to stop', () => {
    const v = evaluateCompletion(proven);
    expect(v.stopGuidance.join(' ')).toMatch(/Do not re-read the same unchanged diff/);
    expect(v.stopGuidance.join(' ')).toMatch(/opportunistic refactoring/);
  });

  it('is not complete while an acceptance criterion is unproven', () => {
    const v = evaluateCompletion({ ...proven, acceptanceCriteriaProven: 1 });
    expect(v.complete).toBe(false);
    expect(v.outstanding.join(' ')).toMatch(/acceptance-proven/);
  });

  it('is not complete when validation ran narrower than required', () => {
    const v = evaluateCompletion({ ...proven, validationPassedAtScope: 'smoke' });
    expect(v.complete).toBe(false);
    expect(v.outstanding.join(' ')).toMatch(/validation-passed/);
  });

  it('is not complete while a blocker stands', () => {
    const v = evaluateCompletion({ ...proven, blockers: ['flaky dependency'] });
    expect(v.complete).toBe(false);
  });

  it('requires security checks at HIGH and cannot be talked out of it (§19)', () => {
    const v = evaluateCompletion({
      ...proven, budget: 'HIGH', requiredScope: 'integration',
      validationPassedAtScope: 'integration', securityChecksRun: false,
    });
    expect(v.complete).toBe(false);
    expect(v.outstanding.join(' ')).toMatch(/security-checks/);
  });

  it('completes at HIGH once security checks have run', () => {
    const v = evaluateCompletion({
      ...proven, budget: 'HIGH', requiredScope: 'integration',
      validationPassedAtScope: 'integration', securityChecksRun: true,
    });
    expect(v.complete).toBe(true);
  });

  it('does not demand acceptance verification at LOW', () => {
    const v = evaluateCompletion({
      budget: 'LOW', implementationComplete: true,
      validationPassedAtScope: 'smoke', requiredScope: 'smoke',
      diffInspected: true, evidenceRecorded: true,
    });
    expect(v.complete).toBe(true);
    expect(v.criteria.find((c) => c.id === 'acceptance-proven')?.applicable).toBe(false);
  });
});

describe('aggregate scope for integration (§11)', () => {
  it('is driven by the riskiest contribution', () => {
    const r = aggregateRequiredScope(['LOW', 'MEDIUM', 'HIGH']);
    expect(r.budget).toBe('HIGH');
    expect(r.scope).toBe('full');
    expect(r.reason).toMatch(/rather than per worker/);
  });

  it('does not demand a full suite for an all-LOW wave', () => {
    const r = aggregateRequiredScope(['LOW', 'LOW']);
    expect(r.budget).toBe('LOW');
    expect(r.scope).not.toBe('full');
  });

  it('handles an empty wave', () => {
    expect(aggregateRequiredScope([]).scope).toBe('smoke');
  });
});

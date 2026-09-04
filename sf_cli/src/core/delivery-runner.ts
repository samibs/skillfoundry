// Delivery Efficiency — the runtime integration.
//
// Everything else in this layer decides things. This is where those decisions actually
// bite: the single entry point a pipeline calls instead of running an expensive validation
// directly.
//
//   runValidation(...)  →  REUSE (skip it) | WAIT (someone else is running it) |
//                          FIX_FIRST (known-broken) | RUN (execute, then record)
//
// Without this, the layer is advice. With it, a forge run that changed two CSS files stops
// invoking the eight-tier gate suite for the third time against an unchanged tree.
//
// It composes with `gate-cache.ts` rather than duplicating it: the gate cache makes an
// invoked run cheaper per file; this decides whether to invoke the run at all.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { revParse, changedFilesBetween, workingTreeStatus } from './mission-git.js';
import {
  assignBudget, chooseTestScope, shouldRunValidation, saveValidationEvidence, checkCompletion,
  loadDeliverySettings,
} from './delivery.js';
import type { DeliveryBudget, DeliveryBudgetLevel } from './delivery-budget.js';
import { suggestEscalation, escalateBudget } from './delivery-budget.js';
import type { TestScope } from './delivery-policy.js';
import { escalateTestScope } from './delivery-policy.js';
import type { ValidationKind, EvidenceEntry } from './delivery-evidence.js';
import { evidenceKey, releaseValidation } from './delivery-evidence.js';
import { measureImpact, describeImpact, type ImpactAnalysis } from './delivery-impact.js';
import { recordHandoff, type WorkerHandoff } from './delivery-context.js';
import { getLogger } from '../utils/logger.js';

// ── Changed-file detection ────────────────────────────────────────────────────

/**
 * Determine what a task has actually changed.
 *
 * Prefers the committed range when a base is known, and falls back to the working tree so
 * an in-progress task still gets a real answer rather than an empty set — an empty set
 * would make every change look trivially LOW.
 */
export function detectChangedFiles(workDir: string, baseRef?: string): string[] {
  const files = new Set<string>();

  if (baseRef) {
    const base = revParse(workDir, baseRef);
    const head = revParse(workDir, 'HEAD');
    if (base && head && base !== head) {
      for (const f of changedFilesBetween(workDir, base, head)) files.add(f);
    }
  }

  // Uncommitted work counts: it is exactly what the current task is doing. `all` is
  // essential here — the default porcelain output collapses an untracked directory to a
  // single `src/` entry, which would classify a new auth module as an unknown path and
  // leave impact analysis with nothing to trace.
  const status = workingTreeStatus(workDir, { untrackedFiles: 'all' });
  for (const path of status.paths) {
    if (path) files.add(path);
  }

  return [...files].sort();
}

// ── Task planning ─────────────────────────────────────────────────────────────

/** Everything the runner decided before a task starts (§12, `$go` startup). */
export interface TaskPlan {
  taskId: string;
  budget: DeliveryBudget;
  scope: TestScope;
  scopeReasons: string[];
  changedFiles: string[];
  impact: ImpactAnalysis;
  /** Human-readable summary of the blast radius. */
  impactSummary: string;
  baseCommit: string | null;
}

/** Inputs for {@link planTask}. */
export interface PlanTaskInput {
  taskId: string;
  /** Task, story or PRD text, used for keyword classification. */
  text?: string;
  /** Baseline the task branched from, for changed-file detection. */
  baseRef?: string;
  /** Explicit budget from the task or PRD. */
  budgetOverride?: DeliveryBudgetLevel;
  /** Explicit test scope from the task. */
  scopeOverride?: TestScope;
  acceptanceCriteria?: string[];
  /** Skip the import-graph scan. Impact is then reported as unmeasured, not as zero. */
  skipImpact?: boolean;
}

/**
 * Plan a task before implementation begins (§12).
 *
 * This is the `$go` startup sequence in code: detect what changed, classify the budget,
 * measure real dependency impact, and derive the test scope from all three. It does no
 * expensive discovery of its own beyond the cached import graph.
 */
export function planTask(workDir: string, input: PlanTaskInput): TaskPlan {
  const changedFiles = detectChangedFiles(workDir, input.baseRef);

  const budget = assignBudget(workDir, {
    text: input.text,
    changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    override: input.budgetOverride,
  });

  const impact: ImpactAnalysis = input.skipImpact
    ? {
        changedFiles, dependents: [], depthReached: 0, truncated: false,
        unresolvedImports: 0, unknownFiles: [],
      }
    : measureImpact(workDir, changedFiles);

  const decision = chooseTestScope(workDir, {
    budget: budget.level,
    changedFiles,
    acceptanceCriteria: input.acceptanceCriteria,
    override: input.scopeOverride,
    dependents: impact.dependents,
  });

  getLogger().info('delivery', 'task_planned', {
    taskId: input.taskId,
    budget: budget.level,
    scope: decision.scope,
    changed: changedFiles.length,
    dependents: impact.dependents.length,
  });

  return {
    taskId: input.taskId,
    budget,
    scope: decision.scope,
    scopeReasons: decision.reasons,
    changedFiles,
    impact,
    impactSummary: input.skipImpact ? 'impact not measured (skipped)' : describeImpact(impact),
    baseCommit: input.baseRef ? revParse(workDir, input.baseRef) : revParse(workDir, 'HEAD'),
  };
}

// ── Validation execution ──────────────────────────────────────────────────────

/** What happened when a validation was requested. */
export interface ValidationOutcome {
  action: 'REUSED' | 'EXECUTED' | 'SKIPPED_HELD' | 'BLOCKED_KNOWN_FAILURE';
  kind: ValidationKind;
  command: string;
  scope?: TestScope;
  passed: boolean;
  /** Seconds actually spent. Zero when reused — which is the saving. */
  durationSeconds: number;
  /** Seconds the reused evidence originally cost, when known. */
  secondsSaved: number | null;
  reason: string;
  exitCode: number | null;
  /** Bounded tail of output, for diagnosis. Empty when reused. */
  outputTail: string;
  evidenceKey: string;
  evidence?: EvidenceEntry;
}

/** Inputs for {@link runValidation}. */
export interface RunValidationInput {
  kind: ValidationKind;
  /** Argv form, so nothing is passed through a shell. */
  command: string;
  args?: string[];
  scope?: TestScope;
  /**
   * Files this validation's result depends on. The narrower and more honest this is, the
   * more often the evidence survives an unrelated edit. Omit for repository-wide checks.
   */
  scopeFiles?: string[];
  changedFiles?: string[];
  /** Owner for deduplication — the agent or task that would run it. */
  owner: string;
  taskId: string;
  budget?: DeliveryBudgetLevel;
  timeoutMs?: number;
  cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const TAIL_CHARS = 4_000;

/**
 * Run a validation — or don't, when it is already answered.
 *
 * This is the function that converts the policy into saved compute. It consults evidence
 * and the deduplication claim first, executes only when genuinely needed, and records the
 * result so the next caller can reuse it.
 *
 * A `WAIT` is returned rather than blocking: the caller is another agent in a wave, and
 * making it sleep would trade duplicated compute for idle compute.
 */
export function runValidation(workDir: string, input: RunValidationInput): ValidationOutcome {
  const key = evidenceKey(input.kind, input.command, input.scope);
  const decision = shouldRunValidation(
    workDir,
    {
      kind: input.kind,
      command: input.command,
      scope: input.scope,
      changedFiles: input.changedFiles,
    },
    input.owner,
  );

  if (decision.action === 'REUSE') {
    return {
      action: 'REUSED', kind: input.kind, command: input.command, scope: input.scope,
      passed: true, durationSeconds: 0,
      secondsSaved: decision.evidence?.durationSeconds ?? null,
      reason: decision.reason, exitCode: decision.evidence?.exitCode ?? 0,
      outputTail: '', evidenceKey: key, evidence: decision.evidence,
    };
  }

  if (decision.action === 'FIX_FIRST') {
    return {
      action: 'BLOCKED_KNOWN_FAILURE', kind: input.kind, command: input.command, scope: input.scope,
      passed: false, durationSeconds: 0, secondsSaved: null,
      reason: decision.reason, exitCode: decision.evidence?.exitCode ?? null,
      outputTail: '', evidenceKey: key, evidence: decision.evidence,
    };
  }

  if (decision.action === 'WAIT') {
    return {
      action: 'SKIPPED_HELD', kind: input.kind, command: input.command, scope: input.scope,
      passed: false, durationSeconds: 0, secondsSaved: null,
      reason: decision.reason, exitCode: null, outputTail: '', evidenceKey: key,
    };
  }

  // RUN — execute, then record whatever happened.
  const started = Date.now();
  let exitCode: number | null = 0;
  let output = '';

  try {
    output = execFileSync(input.command, input.args ?? [], {
      cwd: resolve(input.cwd ?? workDir),
      encoding: 'utf-8',
      timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as { status?: number | null; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    exitCode = typeof e.status === 'number' ? e.status : null;
    output =
      (typeof e.stdout === 'string' ? e.stdout : (e.stdout?.toString() ?? '')) +
      (typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? '')) +
      (exitCode === null ? `\n${e.message ?? 'command failed'}` : '');
  } finally {
    releaseValidation(workDir, key);
  }

  const durationSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
  const passed = exitCode === 0;

  const evidence = saveValidationEvidence(workDir, {
    kind: input.kind,
    command: input.command,
    scope: input.scope,
    result: passed ? 'PASS' : 'FAIL',
    exitCode,
    durationSeconds,
    scopeFiles: input.scopeFiles,
    changedFiles: input.changedFiles,
    producedBy: input.taskId,
    producedByAgent: input.owner,
    budget: input.budget,
  });

  return {
    action: 'EXECUTED', kind: input.kind, command: input.command, scope: input.scope,
    passed, durationSeconds, secondsSaved: null,
    reason: decision.reason, exitCode,
    outputTail: output.slice(-TAIL_CHARS),
    evidenceKey: key,
    evidence: evidence ?? undefined,
  };
}

/** The result of an in-process validation that was either reused or actually run. */
export interface ReuseOutcome<T> {
  action: 'REUSED' | 'EXECUTED' | 'SKIPPED_HELD' | 'BLOCKED_KNOWN_FAILURE';
  /** The value the work produced. Absent when reused — that is the point. */
  value?: T;
  passed: boolean;
  durationSeconds: number;
  secondsSaved: number | null;
  reason: string;
  evidenceKey: string;
  evidence?: EvidenceEntry;
}

/**
 * Wrap an **in-process** validation with evidence reuse and deduplication.
 *
 * Not everything expensive is a subprocess. `runAllGates` is a function call, and running
 * it eight tiers deep against an unchanged tree costs just as much as re-running a shell
 * command would. This gives such work the same treatment.
 *
 * The caller supplies a stable `command` label — it is the identity of the work, not
 * something that gets executed — and a `passed` predicate, since an in-process result has
 * no exit code.
 *
 * @param execute - Runs the real work. Called only when the answer is not already known.
 * @param passed - Decides whether the produced value counts as a pass worth recording.
 */
export async function runOrReuse<T>(
  workDir: string,
  spec: {
    kind: ValidationKind;
    /** Stable identity for this work, e.g. `gates:T0-T7`. Never executed. */
    command: string;
    scope?: TestScope;
    scopeFiles?: string[];
    changedFiles?: string[];
    owner: string;
    taskId: string;
    budget?: DeliveryBudgetLevel;
  },
  execute: () => Promise<T>,
  passed: (value: T) => boolean,
): Promise<ReuseOutcome<T>> {
  const key = evidenceKey(spec.kind, spec.command, spec.scope);
  const decision = shouldRunValidation(
    workDir,
    { kind: spec.kind, command: spec.command, scope: spec.scope, changedFiles: spec.changedFiles },
    spec.owner,
  );

  if (decision.action === 'REUSE') {
    // Only a genuine skip if the recorded result can be handed back. Without a payload the
    // caller would have to re-run to reconstruct it, which would save nothing — so that
    // case is reported as EXECUTED-needed rather than dressed up as a reuse.
    const recorded = decision.evidence?.payload as T | undefined;
    if (recorded !== undefined) {
      getLogger().info('delivery', 'validation_skipped_already_proven', {
        kind: spec.kind, command: spec.command,
      });
      return {
        action: 'REUSED', value: recorded, passed: true, durationSeconds: 0,
        secondsSaved: decision.evidence?.durationSeconds ?? null,
        reason: decision.reason, evidenceKey: key, evidence: decision.evidence,
      };
    }
  }
  if (decision.action === 'FIX_FIRST') {
    return {
      action: 'BLOCKED_KNOWN_FAILURE', passed: false, durationSeconds: 0, secondsSaved: null,
      reason: decision.reason, evidenceKey: key, evidence: decision.evidence,
    };
  }
  if (decision.action === 'WAIT') {
    return {
      action: 'SKIPPED_HELD', passed: false, durationSeconds: 0, secondsSaved: null,
      reason: decision.reason, evidenceKey: key,
    };
  }

  const started = Date.now();
  let value: T;
  try {
    value = await execute();
  } finally {
    releaseValidation(workDir, key);
  }

  const durationSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
  const ok = passed(value);

  const evidence = saveValidationEvidence(workDir, {
    kind: spec.kind, command: spec.command, scope: spec.scope,
    result: ok ? 'PASS' : 'FAIL', durationSeconds,
    scopeFiles: spec.scopeFiles, changedFiles: spec.changedFiles,
    producedBy: spec.taskId, producedByAgent: spec.owner, budget: spec.budget,
    // Inline the result so the next caller can reuse it instead of re-running the work.
    payload: value,
  });

  return {
    action: 'EXECUTED', value, passed: ok, durationSeconds, secondsSaved: null,
    reason: decision.reason, evidenceKey: key, evidence: evidence ?? undefined,
  };
}

// ── Task execution ────────────────────────────────────────────────────────────

/** A validation the caller wants run as part of a task. */
export interface PlannedValidation {
  kind: ValidationKind;
  command: string;
  args?: string[];
  scopeFiles?: string[];
  /** Minimum test scope at which this validation applies. Skipped below it. */
  minScope?: TestScope;
  cwd?: string;
}

/** The result of executing a planned task. */
export interface TaskExecution {
  plan: TaskPlan;
  outcomes: ValidationOutcome[];
  /** Budget after any evidence-driven escalation. */
  finalBudget: DeliveryBudgetLevel;
  /** Scope after any evidence-driven escalation. */
  finalScope: TestScope;
  escalations: string[];
  totalSeconds: number;
  secondsSaved: number | null;
  reused: number;
  executed: number;
  allPassed: boolean;
}

const SCOPE_RANK: Record<TestScope, number> = {
  smoke: 0, targeted: 1, affected: 2, integration: 3, full: 4,
};

/**
 * Execute a task's validations under its delivery budget (§13, `$forge`).
 *
 * Validations below the selected scope are not run at all. Failures are diagnosed for
 * escalation signals — a failure naming files outside the change, or safety-sensitive
 * output — and the budget or scope is raised only on that evidence, never reflexively.
 *
 * Execution stops at the first genuine failure: running the remaining checks against a
 * known-broken tree produces noise, not evidence.
 */
export function executeTask(
  workDir: string,
  plan: TaskPlan,
  validations: PlannedValidation[],
  opts: { owner?: string } = {},
): TaskExecution {
  const owner = opts.owner ?? plan.taskId;
  const outcomes: ValidationOutcome[] = [];
  const escalations: string[] = [];

  let budget = plan.budget;
  let scope = plan.scope;

  const applicable = validations.filter(
    (v) => !v.minScope || SCOPE_RANK[scope] >= SCOPE_RANK[v.minScope],
  );

  for (const v of applicable) {
    const outcome = runValidation(workDir, {
      kind: v.kind, command: v.command, args: v.args, scope,
      scopeFiles: v.scopeFiles, changedFiles: plan.changedFiles,
      owner, taskId: plan.taskId, budget: budget.level, cwd: v.cwd,
    });
    outcomes.push(outcome);

    if (outcome.action === 'EXECUTED' && !outcome.passed) {
      // A failure is the one moment escalation is justified — if the evidence supports it.
      const budgetSignal = suggestEscalation(budget.level, { failureOutput: outcome.outputTail });
      if (budgetSignal) {
        const result = escalateBudget(budget, budgetSignal.to, budgetSignal.reason, budgetSignal.evidence);
        if (result.applied) {
          budget = result.budget;
          escalations.push(`budget → ${budgetSignal.to}: ${budgetSignal.reason}`);
        }
      }

      const namesOutside = plan.changedFiles.length > 0 &&
        /\b(FAIL|error|Error)\b/.test(outcome.outputTail) &&
        !plan.changedFiles.some((f) => outcome.outputTail.includes(f));

      const scopeSignal = escalateTestScope(scope, {
        failureOutsideChangedFiles: namesOutside,
        newDependentsDiscovered: plan.impact.dependents.length,
      });
      if (scopeSignal) {
        scope = scopeSignal.scope;
        escalations.push(`scope → ${scopeSignal.scope}: ${scopeSignal.reason}`);
      }

      break;
    }

    if (outcome.action === 'BLOCKED_KNOWN_FAILURE') break;
  }

  const totalSeconds = Number(outcomes.reduce((n, o) => n + o.durationSeconds, 0).toFixed(2));
  const savedValues = outcomes.filter((o) => o.action === 'REUSED').map((o) => o.secondsSaved);
  const secondsSaved = savedValues.length === 0
    ? 0
    : savedValues.some((v) => v === null)
      ? null
      : Number(savedValues.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)!.toFixed(2));

  return {
    plan,
    outcomes,
    finalBudget: budget.level,
    finalScope: scope,
    escalations,
    totalSeconds,
    secondsSaved,
    reused: outcomes.filter((o) => o.action === 'REUSED').length,
    executed: outcomes.filter((o) => o.action === 'EXECUTED').length,
    allPassed: outcomes.every((o) => o.action === 'REUSED' || (o.action === 'EXECUTED' && o.passed)),
  };
}

/**
 * Record a finished task as a worker handoff (§10).
 *
 * Called once a task completes, so the integrator can consume what was proven instead of
 * repeating the investigation.
 */
export function completeTask(
  workDir: string,
  execution: TaskExecution,
  opts: {
    mission?: string;
    worktree?: string;
    resultCommit?: string;
    unresolvedGaps?: string[];
  } = {},
): WorkerHandoff {
  const { plan } = execution;

  return recordHandoff(workDir, opts.mission ?? 'default', {
    taskId: plan.taskId,
    worktree: opts.worktree ?? resolve(workDir),
    baseCommit: plan.baseCommit ?? '',
    resultCommit: opts.resultCommit ?? revParse(workDir, 'HEAD') ?? '',
    changedFiles: plan.changedFiles,
    budget: execution.finalBudget,
    validationScope: execution.finalScope,
    testsExecuted: execution.outcomes.filter((o) => o.action === 'EXECUTED').map((o) => o.command),
    evidenceGenerated: execution.outcomes.filter((o) => o.action === 'EXECUTED').map((o) => o.evidenceKey),
    evidenceReused: execution.outcomes.filter((o) => o.action === 'REUSED').map((o) => o.evidenceKey),
    validationSeconds: execution.totalSeconds,
    unresolvedGaps: opts.unresolvedGaps ?? [],
  });
}

/** Whether a completed task satisfies its stop conditions (§8). */
export function taskIsComplete(
  workDir: string,
  execution: TaskExecution,
  opts: {
    acceptanceCriteriaProven?: number;
    acceptanceCriteriaTotal?: number;
    diffInspected?: boolean;
    securityChecksRun?: boolean;
    blockers?: string[];
  } = {},
): ReturnType<typeof checkCompletion> {
  return checkCompletion(workDir, {
    budget: execution.finalBudget,
    implementationComplete: true,
    acceptanceCriteriaProven: opts.acceptanceCriteriaProven,
    acceptanceCriteriaTotal: opts.acceptanceCriteriaTotal,
    validationPassedAtScope: execution.allPassed ? execution.finalScope : undefined,
    requiredScope: execution.plan.scope,
    blockers: opts.blockers ?? execution.outcomes
      .filter((o) => o.action === 'SKIPPED_HELD' || o.action === 'BLOCKED_KNOWN_FAILURE')
      .map((o) => `${o.kind}: ${o.reason}`),
    diffInspected: opts.diffInspected ?? false,
    evidenceRecorded: execution.outcomes.some((o) => o.action === 'EXECUTED' || o.action === 'REUSED'),
    securityChecksRun: opts.securityChecksRun,
  });
}

/** True when the layer is active — callers use this to fall back to unconditional runs. */
export function deliveryRunnerEnabled(workDir: string): boolean {
  return loadDeliverySettings(workDir).enabled;
}

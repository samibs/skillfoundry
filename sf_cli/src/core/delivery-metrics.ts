// Delivery Efficiency — measurement.
//
// The metric being approximated is:
//
//   accepted useful change / execution cost
//
// Not token count. Optimising tokens alone rewards an agent that thinks less and ships
// worse. What this tracks instead are the observable proxies for wasted engineering:
// repeated commands, duplicated scans, repository-wide runs that a scoped run would have
// settled, and evidence regenerated when it was already valid.
//
// Values the system cannot observe stay `null`. A fabricated token count is worse than an
// absent one, because it silently poisons every ratio computed from it.

import { loadEvidenceStore, activeClaims, type EvidenceEntry } from './delivery-evidence.js';
import { loadContext, type WorkerHandoff } from './delivery-context.js';
import { loadUsage, type UsageEntry } from './budget.js';
import type { DeliveryBudgetLevel } from './delivery-budget.js';
import type { TestScope } from './delivery-policy.js';

/** Per-task efficiency record (§7). */
export interface TaskEfficiency {
  taskId: string;
  agent?: string;
  budget: DeliveryBudgetLevel | null;
  validationScope: TestScope | null;
  /** Wall-clock seconds spent on validation commands, where measured. */
  validationSeconds: number | null;
  /** Number of distinct validation commands executed. */
  validationCommands: number;
  /** Commands executed more than once against the same repository state. */
  repeatedCommands: number;
  evidenceReused: number;
  evidenceGenerated: number;
  /** Seconds of validation avoided by reuse, summed from the reused entries' own durations. */
  secondsSavedByReuse: number | null;
  /** Repository-wide runs a scoped run made unnecessary. */
  repoWideRunsAvoided: number;
  /**
   * Model/token usage attributed to this task's execution window, read from the real
   * usage ledger (`budget.ts`). `null` means the provider reported nothing — never
   * estimated, because a fabricated count poisons every ratio computed from it.
   */
  tokensUsed: number | null;
  /** Real USD cost over the same window, or null when unknown. */
  costUsd: number | null;
  unresolvedGaps: number;
}

/** Mission-level aggregate. */
export interface DeliveryEfficiencyReport {
  mission: string;
  tasks: TaskEfficiency[];
  totals: {
    tasks: number;
    validationCommands: number;
    repeatedCommands: number;
    evidenceReused: number;
    evidenceGenerated: number;
    /** reused / (reused + generated); null when nothing has been recorded yet. */
    evidenceReuseRate: number | null;
    /** Total measured validation seconds; null when any worker did not measure. */
    validationSeconds: number | null;
    secondsSavedByReuse: number | null;
    repoWideRunsAvoided: number;
    /** Real tokens attributed across all tasks; null when no provider usage was recorded. */
    tokensUsed: number | null;
    /** Real USD across all tasks; null when unknown. */
    costUsd: number | null;
  };
  /** Validations currently claimed by a worker, i.e. dedup in effect right now. */
  activeClaims: number;
  /** Observations worth acting on — not advice, just what the numbers show. */
  observations: string[];
}

/** Scopes that constitute a repository-wide run. */
const REPO_WIDE_SCOPES: readonly TestScope[] = ['integration', 'full'];

/**
 * Attribute recorded model usage to a task's execution window.
 *
 * The usage ledger timestamps every provider call but does not tag it with a task, so the
 * attribution is by time: calls between the worker's start and its handoff. That is an
 * honest approximation for sequential work and is stated as such; when two workers overlap
 * in one process their windows overlap too, so the figure is shared rather than exact.
 *
 * @returns Tokens and cost, or nulls when the window covers no recorded call.
 */
export function attributeUsage(
  entries: UsageEntry[],
  windowStart: string,
  windowEnd: string,
): { tokens: number | null; costUsd: number | null } {
  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { tokens: null, costUsd: null };

  const inWindow = entries.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return Number.isFinite(t) && t >= start && t <= end;
  });
  if (inWindow.length === 0) return { tokens: null, costUsd: null };

  return {
    tokens: inWindow.reduce((n, e) => n + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0),
    costUsd: Number(inWindow.reduce((n, e) => n + (e.costUsd ?? 0), 0).toFixed(6)),
  };
}

/** Sum durations of the evidence entries a handoff reused. */
function reusedSeconds(reusedKeys: string[], entries: Record<string, EvidenceEntry>): number | null {
  const known = reusedKeys
    .map((k) => entries[k]?.durationSeconds)
    .filter((d): d is number => typeof d === 'number');

  // Partial data would understate the saving and read as precision we do not have.
  if (known.length === 0) return reusedKeys.length === 0 ? 0 : null;
  if (known.length < reusedKeys.length) return null;
  return Number(known.reduce((a, b) => a + b, 0).toFixed(2));
}

/** Build the per-task record for one worker handoff. */
export function taskEfficiency(
  handoff: WorkerHandoff,
  entries: Record<string, EvidenceEntry>,
  usage: UsageEntry[] = [],
): TaskEfficiency {
  const commands = new Set(handoff.testsExecuted);
  const repeated = handoff.testsExecuted.length - commands.size;

  // A scoped worker run avoids one repository-wide run per worker; the gate pays it once.
  const repoWideAvoided = REPO_WIDE_SCOPES.includes(handoff.validationScope) ? 0 : 1;

  // Attribute real provider usage to the window this worker was active in. `startedAt`
  // falls back to the handoff time, which yields an empty window and therefore null —
  // the correct answer when the span is unknown.
  const attributed = attributeUsage(usage, handoff.startedAt ?? handoff.at, handoff.at);

  return {
    taskId: handoff.taskId,
    budget: handoff.budget,
    validationScope: handoff.validationScope,
    validationSeconds: handoff.validationSeconds ?? null,
    validationCommands: commands.size,
    repeatedCommands: repeated,
    evidenceReused: handoff.evidenceReused.length,
    evidenceGenerated: handoff.evidenceGenerated.length,
    secondsSavedByReuse: reusedSeconds(handoff.evidenceReused, entries),
    repoWideRunsAvoided: repoWideAvoided,
    tokensUsed: attributed.tokens,
    costUsd: attributed.costUsd,
    unresolvedGaps: handoff.unresolvedGaps.length,
  };
}

/**
 * Build the mission efficiency report (§7).
 *
 * Everything here is derived from recorded handoffs and the evidence store — no estimates
 * and no modelled savings.
 */
export function buildEfficiencyReport(workDir: string, mission: string = 'default'): DeliveryEfficiencyReport {
  const ctx = loadContext(workDir, mission);
  const entries = loadEvidenceStore(workDir).entries;
  const usage = loadUsage(workDir).entries ?? [];
  const tasks = ctx.handoffs.map((h) => taskEfficiency(h, entries, usage));

  const validationCommands = tasks.reduce((n, t) => n + t.validationCommands, 0);
  const repeatedCommands = tasks.reduce((n, t) => n + t.repeatedCommands, 0);
  const evidenceReused = tasks.reduce((n, t) => n + t.evidenceReused, 0);
  const evidenceGenerated = tasks.reduce((n, t) => n + t.evidenceGenerated, 0);
  const repoWideRunsAvoided = tasks.reduce((n, t) => n + t.repoWideRunsAvoided, 0);

  const measured = tasks.map((t) => t.validationSeconds);
  const validationSeconds = tasks.length === 0
    ? 0
    : measured.some((v) => v === null)
      ? null
      : Number(measured.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)!.toFixed(2));

  const denominator = evidenceReused + evidenceGenerated;
  const evidenceReuseRate = denominator > 0 ? Number((evidenceReused / denominator).toFixed(3)) : null;

  const savedValues = tasks.map((t) => t.secondsSavedByReuse);
  const secondsSavedByReuse = savedValues.some((v) => v === null)
    ? null
    : Number(savedValues.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)!.toFixed(2));

  const tokenValues = tasks.map((t) => t.tokensUsed).filter((v): v is number => v !== null);
  const costValues = tasks.map((t) => t.costUsd).filter((v): v is number => v !== null);
  const tokensUsed = tokenValues.length > 0 ? tokenValues.reduce((a, b) => a + b, 0) : null;
  const costUsd = costValues.length > 0
    ? Number(costValues.reduce((a, b) => a + b, 0).toFixed(6))
    : null;

  const observations: string[] = [];
  if (repeatedCommands > 0) {
    observations.push(
      `${repeatedCommands} command(s) were executed more than once within a single task — a repeat against unchanged state proves nothing new.`,
    );
  }
  if (evidenceReuseRate !== null && evidenceReuseRate < 0.2 && denominator >= 5) {
    observations.push(
      `Evidence reuse is ${(evidenceReuseRate * 100).toFixed(0)}%. Either scoped file sets are too broad to survive edits, or agents are not consulting the store before running.`,
    );
  }
  const repoWideWorkers = tasks.filter((t) => t.validationScope && REPO_WIDE_SCOPES.includes(t.validationScope));
  if (repoWideWorkers.length > 1) {
    observations.push(
      `${repoWideWorkers.length} workers each ran a repository-wide scope. That cost belongs at the integration gate, once.`,
    );
  }
  const lowBudgetBroad = tasks.filter(
    (t) => t.budget === 'LOW' && t.validationScope && REPO_WIDE_SCOPES.includes(t.validationScope),
  );
  if (lowBudgetBroad.length > 0) {
    observations.push(
      `${lowBudgetBroad.length} LOW-budget task(s) ran a repository-wide scope. A LOW change should not trigger the full suite without escalation evidence.`,
    );
  }
  if (tasks.length === 0) {
    observations.push('No worker handoffs recorded yet — nothing to measure.');
  }

  return {
    mission,
    tasks,
    totals: {
      tasks: tasks.length,
      validationCommands,
      repeatedCommands,
      evidenceReused,
      evidenceGenerated,
      evidenceReuseRate,
      validationSeconds,
      secondsSavedByReuse,
      repoWideRunsAvoided,
      tokensUsed,
      costUsd,
    },
    activeClaims: activeClaims(workDir).length,
    observations,
  };
}

/** Render the report as plain lines, for `$cost` and the CLI. */
export function formatEfficiencyReport(report: DeliveryEfficiencyReport): string[] {
  const lines: string[] = [];
  const t = report.totals;

  lines.push(`Mission: ${report.mission}`);
  lines.push(`Tasks: ${t.tasks}`);
  lines.push(`Validation commands: ${t.validationCommands}`);
  lines.push(`Repeated commands: ${t.repeatedCommands}`);
  lines.push(`Evidence reused / generated: ${t.evidenceReused} / ${t.evidenceGenerated}`);
  lines.push(
    `Evidence reuse rate: ${t.evidenceReuseRate === null ? 'unknown' : `${(t.evidenceReuseRate * 100).toFixed(0)}%`}`,
  );
  lines.push(
    `Validation seconds spent: ${t.validationSeconds === null ? 'unknown (not measured by every worker)' : t.validationSeconds}`,
  );
  lines.push(
    `Validation seconds saved by reuse: ${t.secondsSavedByReuse === null ? 'unknown (durations not recorded for every reused entry)' : t.secondsSavedByReuse}`,
  );
  lines.push(`Repository-wide runs avoided at worker level: ${t.repoWideRunsAvoided}`);
  lines.push(`Validations currently claimed by a worker: ${report.activeClaims}`);
  lines.push(
    `Model tokens attributed: ${t.tokensUsed === null ? 'unknown (provider reported none)' : t.tokensUsed}`,
  );
  lines.push(
    `Model cost attributed: ${t.costUsd === null ? 'unknown' : `$${t.costUsd.toFixed(4)}`}`,
  );

  if (report.tasks.length > 0) {
    lines.push('');
    lines.push('Per task:');
    for (const task of report.tasks) {
      lines.push(
        `  ${task.taskId.padEnd(16)} ${(task.budget ?? '—').padEnd(7)} ${(task.validationScope ?? '—').padEnd(12)} ` +
        `cmds ${String(task.validationCommands).padStart(3)}  reused ${String(task.evidenceReused).padStart(3)}  ` +
        `generated ${String(task.evidenceGenerated).padStart(3)}` +
        (task.unresolvedGaps > 0 ? `  gaps ${task.unresolvedGaps}` : ''),
      );
    }
  }

  if (report.observations.length > 0) {
    lines.push('');
    lines.push('Observations:');
    for (const o of report.observations) lines.push(`  · ${o}`);
  }
  return lines;
}

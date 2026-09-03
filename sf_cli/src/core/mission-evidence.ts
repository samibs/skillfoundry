// Governed Mission Protocol — evidence, test economy, process lifecycle (§15-§19, §41-§42).
//
// Three failure modes this module exists to close, all of which currently score as PASS
// in most AI pipelines:
//
//   1. "Tests pass" while the test host never terminated. Assertions passing with a
//      hung runner is not a clean validation (§17).
//   2. A failure caused by a broken environment reported as a product defect, which
//      leads an agent to "fix" working code (§41).
//   3. "Probably pre-existing" asserted without a baseline run to prove it (§42).
//
// Evidence records are bounded and machine-readable. Raw logs live outside git under
// `.skillfoundry/mission-logs/` and are referenced by path — megabytes of successful
// test output never enter the ledger or the model's context (§15, §47).

import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { redactText } from './redact.js';
import { evidenceDir, assertMissionId } from './mission-ledger.js';
import { environmentFingerprint } from './mission-attestation.js';
import { revParse } from './mission-git.js';
import { getLogger } from '../utils/logger.js';

/** Where raw command logs are kept — outside `.ai/`, outside git (§15). */
export const RAW_LOG_DIR = join('.skillfoundry', 'mission-logs');

/** The evidence kinds a mission closeout expects (§48). */
export const EVIDENCE_KINDS = [
  'acceptance', 'tests', 'validation', 'security', 'provenance', 'closeout', 'baseline',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Runtime guard for the evidence-kind vocabulary. */
export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return typeof value === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(value);
}

/** Fields stamped onto every evidence record so it stays traceable (§15). */
export interface EvidenceEnvelope {
  mission_id: string;
  kind: EvidenceKind;
  recorded_at_utc: string;
  /** Repository SHA the evidence was produced against. */
  source_sha: string | null;
  environment: string;
  /** SHA-256 of the payload, so tampering after acceptance is detectable. */
  payload_hash: string;
}

/** A persisted evidence record: envelope plus an arbitrary bounded payload. */
export interface EvidenceRecord<T = unknown> extends EvidenceEnvelope {
  payload: T;
}

const MAX_PAYLOAD_BYTES = 256 * 1024;

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = join(filePath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
    renameSync(tmp, filePath);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best-effort */ }
    }
    throw err;
  }
}

/**
 * Persist a bounded evidence record to `.ai/evidence/<MISSION-ID>/<kind>.json`.
 *
 * The payload is redacted before it is written — no secret value ever reaches
 * evidence, and no evidence file is created empty just to satisfy the directory
 * shape (§11, §48).
 *
 * @param workDir - Repository root.
 * @param missionId - Registered mission.
 * @param kind - Which evidence file to write.
 * @param payload - Machine-readable evidence body.
 * @returns The repo-relative path of the written file, ready to attach to the ledger.
 * @throws {Error} When the payload exceeds the bound — evidence must reference large
 *         artifacts, not embed them.
 */
export function writeEvidence<T>(
  workDir: string,
  missionId: string,
  kind: EvidenceKind,
  payload: T,
): string {
  assertMissionId(missionId);
  if (!isEvidenceKind(kind)) {
    throw new Error(`Unknown evidence kind "${kind}". Allowed: ${EVIDENCE_KINDS.join(', ')}`);
  }

  const redacted = JSON.parse(redactText(JSON.stringify(payload), true)) as T;
  const serialized = JSON.stringify(redacted);

  if (Buffer.byteLength(serialized, 'utf-8') > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Evidence payload for ${missionId}/${kind} is ${Buffer.byteLength(serialized, 'utf-8')} bytes ` +
      `(limit ${MAX_PAYLOAD_BYTES}). Evidence must reference large artifacts by path, not embed them (§15).`,
    );
  }

  const record: EvidenceRecord<T> = {
    mission_id: missionId,
    kind,
    recorded_at_utc: new Date().toISOString(),
    source_sha: revParse(workDir, 'HEAD'),
    environment: environmentFingerprint(),
    payload_hash: createHash('sha256').update(serialized).digest('hex'),
    payload: redacted,
  };

  const dir = evidenceDir(workDir, missionId);
  const filePath = join(dir, `${kind}.json`);
  writeJsonAtomic(filePath, record);

  getLogger().info('mission', 'evidence_written', { missionId, kind, bytes: serialized.length });
  return relative(resolve(workDir), filePath);
}

/** Read a persisted evidence record, or null when absent or unreadable. */
export function readEvidence<T = unknown>(
  workDir: string,
  missionId: string,
  kind: EvidenceKind,
): EvidenceRecord<T> | null {
  const filePath = join(evidenceDir(workDir, missionId), `${kind}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as EvidenceRecord<T>;
  } catch {
    return null;
  }
}

// ── Process lifecycle (§17, §18) ──────────────────────────────────────────────

/** Liveness classification for a long-running validation (§18). */
export type ProcessState = 'RUNNING' | 'RUNNING_QUIET' | 'STALLED' | 'FAILED' | 'COMPLETED';

/** Inputs for {@link classifyProcessState}. */
export interface LivenessSignals {
  /** Is the process still alive? */
  alive: boolean;
  /** Exit code once the process finished. */
  exitCode?: number | null;
  /** Milliseconds since the process last wrote to stdout or stderr. */
  msSinceOutput: number;
  /** Milliseconds since the process started. */
  elapsedMs: number;
  /** Typical duration for this command, when history is available. */
  historicalDurationMs?: number;
  /** The hard timeout after which the run is abandoned. */
  timeoutMs: number;
}

/**
 * Classify a running validation without killing it for being quiet (§18).
 *
 * Sparse output is not a hang. A compile step or an integration suite can legitimately
 * produce nothing for minutes; killing it wastes the most expensive validation in the
 * pipeline and produces no evidence at all.
 *
 * @returns `RUNNING_QUIET` when the process is alive but silent and still inside its
 *          expected envelope; `STALLED` only once it exceeds both the quiet threshold
 *          and its historical duration, or the hard timeout.
 */
export function classifyProcessState(signals: LivenessSignals): ProcessState {
  if (!signals.alive) {
    if (signals.exitCode === 0) return 'COMPLETED';
    return 'FAILED';
  }

  if (signals.elapsedMs >= signals.timeoutMs) return 'STALLED';

  const QUIET_THRESHOLD_MS = 60_000;
  if (signals.msSinceOutput < QUIET_THRESHOLD_MS) return 'RUNNING';

  // Quiet, but still within the time this command normally takes: not stalled.
  const budget = signals.historicalDurationMs
    ? signals.historicalDurationMs * 2
    : signals.timeoutMs;

  return signals.elapsedMs > budget ? 'STALLED' : 'RUNNING_QUIET';
}

/** Whether surviving processes could be checked, and what was found (§17). */
export type OrphanCheck = 'CLEAN' | 'ORPHANS_DETECTED' | 'UNSUPPORTED';

/** The complete record of one validation run. */
export interface CommandEvidence {
  command: string;
  args: string[];
  cwd: string;
  exit_code: number | null;
  /** Signal that terminated the process, when it did not exit on its own. */
  signal: string | null;
  /** True only when the process exited on its own within the timeout (§17). */
  normal_termination: boolean;
  timed_out: boolean;
  duration_seconds: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  /** Did the process group still hold live members after the child exited? */
  orphan_check: OrphanCheck;
  orphan_detail?: string;
  /** Path to the full log, outside git. Referenced, never inlined (§15). */
  raw_artifact: string;
  /** Bounded tail of output, redacted. Only what a reader needs to act. */
  output_tail: string;
  source_sha: string | null;
  environment: string;
}

/** Options for {@link runValidatedCommand}. */
export interface RunOptions {
  command: string;
  args: string[];
  cwd: string;
  /** Hard timeout. The process group is terminated when it elapses. */
  timeoutMs?: number;
  /** Label used to name the raw log file. */
  label?: string;
  /** Extra environment for the child. Values are never written to evidence. */
  env?: Record<string, string>;
  /** Lines of output kept in the bounded tail. */
  tailLines?: number;
}

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_TAIL_LINES = 60;
const ORPHAN_GRACE_MS = 250;
/** Bounded wait for stdio to flush after the child exits (see runValidatedCommand). */
const STDIO_DRAIN_MS = 300;

/** Counts extracted from a runner's summary line. */
type TestCounts = { passed?: number; failed?: number; skipped?: number };

const COUNT_PATTERNS: Array<{ re: RegExp; map: (m: RegExpMatchArray) => TestCounts }> = [
  // vitest / jest: "Tests  12 passed | 1 failed | 2 skipped"
  { re: /\bTests\s+.*?(\d+)\s+passed(?:.*?(\d+)\s+failed)?(?:.*?(\d+)\s+skipped)?/i,
    map: (m) => ({ passed: +m[1], failed: m[2] ? +m[2] : 0, skipped: m[3] ? +m[3] : 0 }) },
  // dotnet test: "Passed! - Failed: 0, Passed: 42, Skipped: 1"
  { re: /Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+)/i,
    map: (m) => ({ failed: +m[1], passed: +m[2], skipped: +m[3] }) },
  // go test / cargo: "test result: ok. 42 passed; 0 failed"
  { re: /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed/i,
    map: (m) => ({ passed: +m[1], failed: +m[2] }) },
  // pytest: "5 passed, 1 failed, 2 skipped" — last, since it is the loosest pattern.
  { re: /(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/i,
    map: (m) => ({ passed: +m[1], failed: m[2] ? +m[2] : 0, skipped: m[3] ? +m[3] : 0 }) },
];

/**
 * Parse pass/fail/skip counts from common test-runner output.
 *
 * Matching is line-wise and skips vitest's "Test Files" line, which otherwise wins over
 * the real "Tests" line and under-reports a 296-test run as 8. Evidence that misstates
 * what was validated is worse than evidence that reports nothing.
 */
function parseTestCounts(output: string): TestCounts {
  const lines = output.split('\n').filter((l) => !/\bTest\s+Files\b/i.test(l));

  // A summary is usually near the end; scan backwards so the final tally wins.
  for (let i = lines.length - 1; i >= 0; i--) {
    for (const { re, map } of COUNT_PATTERNS) {
      const m = lines[i].match(re);
      if (m) return map(m);
    }
  }
  return {};
}

/**
 * Check whether the child's process group still holds live members.
 *
 * POSIX only. `process.kill(-pgid, 0)` sends no signal but throws ESRCH when the group
 * is empty — so a successful call means something in the group survived the child.
 */
function checkOrphans(pgid: number): { check: OrphanCheck; detail?: string } {
  if (process.platform === 'win32') {
    return { check: 'UNSUPPORTED', detail: 'Process-group orphan detection is not available on Windows' };
  }
  try {
    process.kill(-pgid, 0);
    return {
      check: 'ORPHANS_DETECTED',
      detail: `Process group ${pgid} still has live members after the child exited — owned processes were not cleaned up (§17)`,
    };
  } catch {
    return { check: 'CLEAN' };
  }
}

/**
 * Run a validation command and record whether it terminated normally (§16, §17).
 *
 * The child is started in its own process group so a timeout kills the whole tree
 * rather than orphaning children, and so surviving members are detectable afterwards.
 * A run whose assertions passed but whose host had to be killed is reported with
 * `normal_termination: false` — the caller must not score that as a clean validation.
 *
 * @returns Bounded evidence. The full log is written under `.skillfoundry/mission-logs/`
 *          and referenced by `raw_artifact`.
 */
export async function runValidatedCommand(opts: RunOptions): Promise<CommandEvidence> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tailLines = opts.tailLines ?? DEFAULT_TAIL_LINES;
  const cwd = resolve(opts.cwd);
  const started = Date.now();

  const logDir = join(cwd, RAW_LOG_DIR);
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const label = (opts.label ?? opts.command).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 40);
  const logPath = join(logDir, `${label}-${started}.log`);

  const chunks: string[] = [];
  let timedOut = false;

  const child = spawn(opts.command, opts.args, {
    cwd,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group: the timeout kills the whole tree, and survivors are detectable.
    detached: process.platform !== 'win32',
  });

  const pgid = child.pid ?? -1;

  child.stdout?.on('data', (d: Buffer) => chunks.push(d.toString()));
  child.stderr?.on('data', (d: Buffer) => chunks.push(d.toString()));

  // Resolve on 'exit' (the command itself finished), not 'close'. 'close' additionally
  // waits for every stdio pipe to shut, and a surviving grandchild holds those pipes
  // open — precisely the orphan case this function exists to detect. Waiting for
  // 'close' would hang here for as long as the orphan lives.
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; spawnError?: Error }>(
    (resolvePromise) => {
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (process.platform !== 'win32' && pgid > 0) process.kill(-pgid, 'SIGTERM');
          else child.kill('SIGTERM');
        } catch { /* already gone */ }

        // Escalate if SIGTERM is ignored.
        setTimeout(() => {
          try {
            if (process.platform !== 'win32' && pgid > 0) process.kill(-pgid, 'SIGKILL');
            else child.kill('SIGKILL');
          } catch { /* already gone */ }
        }, 5_000);
      }, timeoutMs);

      child.on('error', (err) => {
        clearTimeout(timer);
        resolvePromise({ code: null, signal: null, spawnError: err });
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolvePromise({ code, signal });
      });
    },
  );

  // Give the pipes a bounded moment to flush trailing output after exit. Bounded, so a
  // held-open pipe delays the evidence by milliseconds rather than by the orphan's life.
  await Promise.race([
    new Promise<void>((r) => child.once('close', () => r())),
    new Promise<void>((r) => setTimeout(r, STDIO_DRAIN_MS)),
  ]);

  const durationSeconds = (Date.now() - started) / 1000;
  const rawOutput = result.spawnError
    ? `${result.spawnError.message}\n${chunks.join('')}`
    : chunks.join('');
  const redacted = redactText(rawOutput, true);

  try {
    writeFileSync(logPath, redacted, 'utf-8');
  } catch (err) {
    getLogger().warn('mission', 'raw_log_write_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Give any survivors a moment to exit before declaring them orphans.
  await new Promise((r) => setTimeout(r, ORPHAN_GRACE_MS));
  const orphans = pgid > 0 && !result.spawnError
    ? checkOrphans(pgid)
    : { check: 'UNSUPPORTED' as OrphanCheck, detail: 'Child was never spawned' };

  const lines = redacted.split('\n');
  const outputTail = lines.slice(-tailLines).join('\n');

  const evidence: CommandEvidence = {
    command: opts.command,
    args: opts.args,
    cwd,
    exit_code: result.code,
    signal: result.signal ?? null,
    // Normal termination requires: exited on its own, not via signal, not timed out.
    normal_termination: !timedOut && result.signal === null && result.code !== null && !result.spawnError,
    timed_out: timedOut,
    duration_seconds: Number(durationSeconds.toFixed(2)),
    ...parseTestCounts(redacted),
    orphan_check: orphans.check,
    orphan_detail: orphans.detail,
    raw_artifact: relative(cwd, logPath),
    output_tail: outputTail,
    source_sha: revParse(cwd, 'HEAD'),
    environment: environmentFingerprint(),
  };

  getLogger().info('mission', 'command_validated', {
    command: opts.command,
    exit_code: evidence.exit_code,
    normal_termination: evidence.normal_termination,
    orphan_check: evidence.orphan_check,
  });

  return evidence;
}

/**
 * Decide whether a run counts as a clean validation (§17).
 *
 * Assertions passing is necessary but not sufficient. A zero exit code paired with a
 * killed host or surviving orphan processes is reported as not-clean, with the reason.
 *
 * @param opts.expectTests - The run was supposed to execute tests. A zero exit with no
 *        detectable test counts is then reported as not-clean: a mistyped command, a
 *        filter matching nothing, or a runner that never started all exit 0 and would
 *        otherwise be recorded as a PASS that proves nothing.
 */
export function isCleanValidation(
  evidence: CommandEvidence,
  opts: { expectTests?: boolean } = {},
): { clean: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (opts.expectTests && evidence.passed === undefined && evidence.failed === undefined) {
    reasons.push(
      'No test results were detected in the output — a zero exit code here proves nothing. ' +
      'Verify the command actually ran the suite (a mistyped command, an empty filter, or a ' +
      'runner that never started all exit 0).',
    );
  }
  if (opts.expectTests && evidence.passed === 0 && (evidence.failed ?? 0) === 0) {
    reasons.push('The runner reported zero tests executed — an empty suite is not a validation.');
  }

  if (evidence.exit_code !== 0) {
    reasons.push(`Exit code ${evidence.exit_code ?? 'null'}`);
  }
  if (!evidence.normal_termination) {
    reasons.push(
      evidence.timed_out
        ? `Timed out after ${evidence.duration_seconds}s and had to be killed — assertions passing does not make this a clean validation`
        : `Process did not terminate normally (signal ${evidence.signal ?? 'unknown'})`,
    );
  }
  if (evidence.orphan_check === 'ORPHANS_DETECTED') {
    reasons.push(evidence.orphan_detail ?? 'Owned processes survived the run');
  }
  if ((evidence.failed ?? 0) > 0) {
    reasons.push(`${evidence.failed} failing test(s)`);
  }

  return { clean: reasons.length === 0, reasons };
}

// ── Failure classification (§41) ──────────────────────────────────────────────

/** Where a failure actually originates. Never modify product code for the last five. */
export type FailureClass =
  | 'PRODUCT_DEFECT'
  | 'TEST_DEFECT'
  | 'ENVIRONMENT_DEFECT'
  | 'WORKTREE_DEFECT'
  | 'REPOSITORY_SNAPSHOT_INCOMPLETE'
  | 'INFRASTRUCTURE_DEFECT'
  | 'EXTERNAL_DEPENDENCY'
  | 'AUTHORIZATION_FAILURE'
  | 'UNCLASSIFIED';

/** A classification suggestion with the signal that produced it. */
export interface FailureClassification {
  classification: FailureClass;
  /** The matched signal, quoted from the output. */
  signal: string;
  /** Whether the caller should confirm before acting on this. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  guidance: string;
}

const FAILURE_SIGNALS: Array<{ re: RegExp; cls: FailureClass; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; guidance: string }> = [
  { re: /command not found|spawn\s+\S+\s+ENOENT|ENOENT.*spawn|is not recognized as an internal or external command/i,
    cls: 'ENVIRONMENT_DEFECT', confidence: 'HIGH',
    guidance: 'A required binary is missing from PATH. Fix or report the environment — do not modify product code (§41).' },
  { re: /No such file or directory.*\.(csproj|sln|json|toml|lock)/i,
    cls: 'REPOSITORY_SNAPSHOT_INCOMPLETE', confidence: 'HIGH',
    guidance: 'A project file the build needs is absent. The working copy is incomplete — re-create the worktree rather than reconstructing the file.' },
  { re: /not a git repository|fatal: this operation must be run in a work tree/i,
    cls: 'WORKTREE_DEFECT', confidence: 'HIGH',
    guidance: 'The worker is not in a valid git worktree. Re-attest before writing (§4).' },
  { re: /Cannot find module|ModuleNotFoundError|ImportError|could not be resolved/i,
    cls: 'ENVIRONMENT_DEFECT', confidence: 'MEDIUM',
    guidance: 'A dependency is missing. Verify install state before concluding the code is wrong — this is frequently an uninstalled package, not a defect.' },
  { re: /ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up/i,
    cls: 'EXTERNAL_DEPENDENCY', confidence: 'HIGH',
    guidance: 'A network dependency was unreachable. Classify as EXTERNAL_VALIDATION_REQUIRED rather than a product failure.' },
  { re: /401 Unauthorized|403 Forbidden|permission denied|EACCES|authentication failed/i,
    cls: 'AUTHORIZATION_FAILURE', confidence: 'HIGH',
    guidance: 'Access was refused. Do not weaken authentication or authorization to proceed (§1 rule 8).' },
  { re: /out of memory|OOMKilled|ENOSPC|no space left on device|Killed\b/i,
    cls: 'INFRASTRUCTURE_DEFECT', confidence: 'HIGH',
    guidance: 'The host ran out of a resource. Re-run with adequate capacity — the result proves nothing about the product.' },
  { re: /AssertionError|expect\(.*\)\.|assert\s|Expected .* but (got|received)/i,
    cls: 'PRODUCT_DEFECT', confidence: 'MEDIUM',
    guidance: 'An assertion failed. Confirm the test itself is correct before changing product code — a wrong test is a TEST_DEFECT.' },
];

/**
 * Suggest where a failure originates, from the command output (§41).
 *
 * This is deliberately a suggestion, not a verdict: the cost of misclassifying an
 * environment failure as a product defect is an agent "fixing" working code. When no
 * signal matches, the result is `UNCLASSIFIED` — never a guess.
 *
 * @param output - Combined stdout/stderr, or the bounded tail.
 */
export function classifyFailure(output: string, exitCode: number | null): FailureClassification {
  for (const { re, cls, confidence, guidance } of FAILURE_SIGNALS) {
    const m = output.match(re);
    if (m) {
      return { classification: cls, signal: m[0].slice(0, 200), confidence, guidance };
    }
  }

  return {
    classification: 'UNCLASSIFIED',
    signal: `exit code ${exitCode ?? 'null'}`,
    confidence: 'LOW',
    guidance: 'No known failure signal matched. Inspect the raw log before classifying — do not default to PRODUCT_DEFECT.',
  };
}

// ── Baseline evidence for "pre-existing" claims (§42) ─────────────────────────

/** The verdict on a claim that a failure predates the mission. */
export interface PreExistingVerdict {
  /** True only when a baseline run at the baseline SHA reproduced the same failure. */
  substantiated: boolean;
  reason: string;
  baseline_sha?: string;
  baseline_artifact?: string;
}

/**
 * Adjudicate a "this was already broken" claim (§42).
 *
 * An unsupported claim is the single most damaging thing an agent can say during
 * remediation, because it converts a self-inflicted regression into an accepted
 * condition. Accepted baseline evidence outranks the claim; without it, the answer is
 * "not substantiated".
 *
 * @param baseline - Evidence from running the same test at the baseline SHA, if any.
 * @param failureSignature - Stable signature of the current failure (see
 *        {@link failureSignature}).
 */
export function adjudicatePreExisting(
  baseline: CommandEvidence | null,
  failureSignature: string,
): PreExistingVerdict {
  if (!baseline) {
    return {
      substantiated: false,
      reason:
        'No baseline run was recorded. A "pre-existing" claim requires the same test, in the same environment, ' +
        'at the accepted baseline SHA (§42). Until that exists, treat the failure as caused by this mission.',
    };
  }

  const baselineSignature = failureSignatureOf(baseline);
  if (baselineSignature === failureSignature) {
    return {
      substantiated: true,
      reason: 'The same failure signature reproduces at the baseline SHA — the failure predates this mission.',
      baseline_sha: baseline.source_sha ?? undefined,
      baseline_artifact: baseline.raw_artifact,
    };
  }

  return {
    substantiated: false,
    reason:
      `The baseline run produced a different failure signature (${baselineSignature.slice(0, 16)} vs ${failureSignature.slice(0, 16)}). ` +
      'The current failure is not the pre-existing one.',
    baseline_sha: baseline.source_sha ?? undefined,
    baseline_artifact: baseline.raw_artifact,
  };
}

/**
 * Stable signature of a failure, for comparing runs and detecting no-progress retries.
 *
 * Built from the exit code plus the normalized error lines — absolute paths, line
 * numbers, timings and hex addresses are stripped so the same defect hashes the same
 * across machines and runs.
 */
export function failureSignatureOf(evidence: CommandEvidence): string {
  return failureSignature(evidence.output_tail, evidence.exit_code);
}

/** Compute a failure signature from raw output. */
export function failureSignature(output: string, exitCode: number | null): string {
  const normalized = output
    .split('\n')
    .filter((l) => /error|fail|exception|assert|panic|traceback/i.test(l))
    .map((l) =>
      l
        .replace(/(\/[\w.\-]+)+/g, '<path>')
        .replace(/:\d+(:\d+)?/g, ':<n>')
        .replace(/0x[0-9a-f]+/gi, '<addr>')
        .replace(/\d+(\.\d+)?\s*(ms|s|sec|seconds)/gi, '<dur>')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .slice(0, 20)
    .join('\n');

  return createHash('sha256').update(`${exitCode ?? 'null'}::${normalized}`).digest('hex');
}

// ── Bounded retries (§19) ─────────────────────────────────────────────────────

/** One recorded retry attempt. */
export interface RetryAttempt {
  attempt: number;
  failure_signature: string;
  state_changed: boolean;
  justification: string;
  at_utc: string;
}

/** The decision on whether another attempt is warranted. */
export interface RetryDecision {
  allowed: boolean;
  reason: string;
  attempts: number;
  /** True when repeated attempts produce identical evidence — stop and report (§19). */
  no_progress: boolean;
}

/**
 * Bounded retry governance (§19).
 *
 * Prevents the fail → retry → fail loop that burns a budget without changing state.
 * A retry is allowed only while attempts remain AND the previous attempt either
 * changed state or produced a different failure. Identical evidence twice is
 * `NO_PROGRESS`: stop and report the blocker.
 */
export class RetryTracker {
  private readonly attempts: RetryAttempt[] = [];

  /**
   * @param maxAttempts - Hard ceiling on attempts, including the first.
   */
  constructor(private readonly maxAttempts: number = 3) {
    if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1');
  }

  /**
   * Record an attempt's outcome.
   *
   * @param signature - Failure signature from {@link failureSignature}.
   * @param stateChanged - Did anything observable change since the last attempt?
   * @param justification - Why this retry was justified.
   */
  record(signature: string, stateChanged: boolean, justification: string): void {
    this.attempts.push({
      attempt: this.attempts.length + 1,
      failure_signature: signature,
      state_changed: stateChanged,
      justification,
      at_utc: new Date().toISOString(),
    });
  }

  /** Decide whether another attempt is warranted. */
  shouldRetry(): RetryDecision {
    const count = this.attempts.length;

    if (count === 0) {
      return { allowed: true, reason: 'No attempt recorded yet', attempts: 0, no_progress: false };
    }
    if (count >= this.maxAttempts) {
      return {
        allowed: false,
        reason: `Retry budget exhausted after ${count} attempt(s). Report the blocker rather than retrying (§19).`,
        attempts: count,
        no_progress: false,
      };
    }

    const last = this.attempts[count - 1];
    const previous = this.attempts[count - 2];

    if (previous && previous.failure_signature === last.failure_signature && !last.state_changed) {
      return {
        allowed: false,
        reason:
          'NO_PROGRESS: two consecutive attempts produced identical evidence with no state change. ' +
          'Stop and report the blocker (§19).',
        attempts: count,
        no_progress: true,
      };
    }

    return {
      allowed: true,
      reason: 'Previous attempt changed state or produced different evidence',
      attempts: count,
      no_progress: false,
    };
  }

  /** All recorded attempts, for inclusion in evidence. */
  history(): RetryAttempt[] {
    return [...this.attempts];
  }
}

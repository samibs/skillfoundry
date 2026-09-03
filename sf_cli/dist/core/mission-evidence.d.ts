/** Where raw command logs are kept — outside `.ai/`, outside git (§15). */
export declare const RAW_LOG_DIR: string;
/** The evidence kinds a mission closeout expects (§48). */
export declare const EVIDENCE_KINDS: readonly ["acceptance", "tests", "validation", "security", "provenance", "closeout", "baseline"];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
/** Runtime guard for the evidence-kind vocabulary. */
export declare function isEvidenceKind(value: unknown): value is EvidenceKind;
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
export declare function writeEvidence<T>(workDir: string, missionId: string, kind: EvidenceKind, payload: T): string;
/** Read a persisted evidence record, or null when absent or unreadable. */
export declare function readEvidence<T = unknown>(workDir: string, missionId: string, kind: EvidenceKind): EvidenceRecord<T> | null;
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
export declare function classifyProcessState(signals: LivenessSignals): ProcessState;
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
export declare function runValidatedCommand(opts: RunOptions): Promise<CommandEvidence>;
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
export declare function isCleanValidation(evidence: CommandEvidence, opts?: {
    expectTests?: boolean;
}): {
    clean: boolean;
    reasons: string[];
};
/** Where a failure actually originates. Never modify product code for the last five. */
export type FailureClass = 'PRODUCT_DEFECT' | 'TEST_DEFECT' | 'ENVIRONMENT_DEFECT' | 'WORKTREE_DEFECT' | 'REPOSITORY_SNAPSHOT_INCOMPLETE' | 'INFRASTRUCTURE_DEFECT' | 'EXTERNAL_DEPENDENCY' | 'AUTHORIZATION_FAILURE' | 'UNCLASSIFIED';
/** A classification suggestion with the signal that produced it. */
export interface FailureClassification {
    classification: FailureClass;
    /** The matched signal, quoted from the output. */
    signal: string;
    /** Whether the caller should confirm before acting on this. */
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    guidance: string;
}
/**
 * Suggest where a failure originates, from the command output (§41).
 *
 * This is deliberately a suggestion, not a verdict: the cost of misclassifying an
 * environment failure as a product defect is an agent "fixing" working code. When no
 * signal matches, the result is `UNCLASSIFIED` — never a guess.
 *
 * @param output - Combined stdout/stderr, or the bounded tail.
 */
export declare function classifyFailure(output: string, exitCode: number | null): FailureClassification;
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
export declare function adjudicatePreExisting(baseline: CommandEvidence | null, failureSignature: string): PreExistingVerdict;
/**
 * Stable signature of a failure, for comparing runs and detecting no-progress retries.
 *
 * Built from the exit code plus the normalized error lines — absolute paths, line
 * numbers, timings and hex addresses are stripped so the same defect hashes the same
 * across machines and runs.
 */
export declare function failureSignatureOf(evidence: CommandEvidence): string;
/** Compute a failure signature from raw output. */
export declare function failureSignature(output: string, exitCode: number | null): string;
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
export declare class RetryTracker {
    private readonly maxAttempts;
    private readonly attempts;
    /**
     * @param maxAttempts - Hard ceiling on attempts, including the first.
     */
    constructor(maxAttempts?: number);
    /**
     * Record an attempt's outcome.
     *
     * @param signature - Failure signature from {@link failureSignature}.
     * @param stateChanged - Did anything observable change since the last attempt?
     * @param justification - Why this retry was justified.
     */
    record(signature: string, stateChanged: boolean, justification: string): void;
    /** Decide whether another attempt is warranted. */
    shouldRetry(): RetryDecision;
    /** All recorded attempts, for inclusion in evidence. */
    history(): RetryAttempt[];
}

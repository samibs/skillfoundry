import type { TestScope } from './delivery-policy.js';
import type { DeliveryBudgetLevel } from './delivery-budget.js';
/**
 * Bump when the validity rules change, so evidence recorded under older semantics is
 * ignored rather than trusted. Mirrors `GATE_LOGIC_VERSION`.
 */
export declare const EVIDENCE_LOGIC_VERSION = "1";
/** Kinds of validation whose result is worth reusing. */
export declare const VALIDATION_KINDS: readonly ["build", "test", "lint", "typecheck", "security-scan", "dependency-scan", "static-analysis", "repo-scan", "architecture-discovery", "changed-file-analysis"];
export type ValidationKind = (typeof VALIDATION_KINDS)[number];
/** Runtime guard for the validation vocabulary. */
export declare function isValidationKind(value: unknown): value is ValidationKind;
/** A recorded validation result plus everything needed to judge whether it still holds. */
export interface EvidenceEntry {
    /** Deterministic key: kind + command + scope + logic version. */
    key: string;
    kind: ValidationKind;
    /** The exact command that produced this, for auditability and re-execution. */
    command: string;
    /** Test scope, when the validation was a test run. */
    scope?: TestScope;
    /** Repository root this was produced in. */
    repository: string;
    /** Commit the run was based on. */
    baseCommit: string | null;
    /** Repository tree hash at the time of the run. */
    treeSha: string | null;
    /**
     * Content hashes of the files this evidence depends on. Empty means the evidence is
     * repository-wide and validity is judged by `treeSha` instead — the conservative path.
     */
    fileHashes: Record<string, string>;
    /** Files the producing task had changed, for reporting. */
    changedFiles: string[];
    result: 'PASS' | 'FAIL';
    /** Exit code where one applies. */
    exitCode?: number | null;
    /** Wall-clock duration, used by `$cost` to price what reuse saved. */
    durationSeconds?: number;
    /** Task or mission that produced it. */
    producedBy: string;
    /** Agent that produced it. */
    producedByAgent?: string;
    /** Delivery budget in force when it was produced. */
    budget?: DeliveryBudgetLevel;
    createdAt: string;
    /** Path to a full log, referenced rather than inlined. */
    artifact?: string;
}
/** The on-disk evidence store. */
export interface EvidenceStore {
    version: string;
    updatedAt: string;
    entries: Record<string, EvidenceEntry>;
}
/** Read the evidence store, returning an empty one when absent or unreadable. */
export declare function loadEvidenceStore(workDir: string): EvidenceStore;
/** Persist the evidence store. */
export declare function saveEvidenceStore(workDir: string, store: EvidenceStore): void;
/**
 * Deterministic identity for a validation.
 *
 * Two runs share a key when they are the same kind of check, the same command and the
 * same scope. Whether the *result* still applies is a separate question, answered by the
 * file hashes.
 */
export declare function evidenceKey(kind: ValidationKind, command: string, scope?: TestScope): string;
/**
 * Hash the files a validation depended on.
 *
 * A file that cannot be read is recorded as `<missing>` rather than skipped, so its later
 * appearance invalidates the evidence instead of going unnoticed.
 */
export declare function hashScopeFiles(workDir: string, files: string[]): Record<string, string>;
/** What a caller supplies when recording a validation result. */
export interface RecordEvidenceInput {
    kind: ValidationKind;
    command: string;
    scope?: TestScope;
    result: 'PASS' | 'FAIL';
    exitCode?: number | null;
    durationSeconds?: number;
    /**
     * Files this validation's result depends on. Supply the narrowest honest set: the
     * narrower it is, the more often the evidence survives an unrelated change.
     * Omit for repository-wide validation, which is then bound to the tree hash.
     */
    scopeFiles?: string[];
    changedFiles?: string[];
    producedBy: string;
    producedByAgent?: string;
    budget?: DeliveryBudgetLevel;
    artifact?: string;
}
/**
 * Record a validation result so a later task can reuse it.
 *
 * Failures are recorded too: knowing a command failed against this exact state is as
 * useful as knowing it passed, and stops a second worker repeating it blindly.
 */
export declare function recordEvidence(workDir: string, input: RecordEvidenceInput): EvidenceEntry;
/** Why a lookup did or did not yield reusable evidence. */
export type EvidenceStatus = 'REUSABLE' | 'INVALIDATED' | 'MISS' | 'FAILED_PREVIOUSLY';
/** The verdict of an evidence lookup. */
export interface EvidenceLookup {
    status: EvidenceStatus;
    entry?: EvidenceEntry;
    /** Human-readable justification, suitable for a report. */
    reason: string;
    /** Files whose content changed since the evidence was recorded. */
    invalidatedBy?: string[];
}
/** A lookup query. */
export interface EvidenceQuery {
    kind: ValidationKind;
    command: string;
    scope?: TestScope;
    /**
     * Files the caller's change touches. Evidence is invalidated when any of these appears
     * in its recorded scope, even if content hashing would not catch it.
     */
    changedFiles?: string[];
    /** Maximum acceptable age. Omit for no age limit — content, not clock, decides validity. */
    maxAgeMs?: number;
}
/**
 * Decide whether an existing validation still proves what the caller needs (§3).
 *
 * Validity is judged by content, not by time:
 *
 *   - scoped evidence  → every recorded file must still hash the same
 *   - repo-wide evidence → the repository tree hash must be unchanged (conservative)
 *
 * A previous FAIL is reported as `FAILED_PREVIOUSLY` rather than reused as a pass — the
 * caller needs to know the command is known-broken at this state, not skip it.
 */
export declare function lookupEvidence(workDir: string, query: EvidenceQuery): EvidenceLookup;
/**
 * Drop evidence invalidated by a set of changed files (§3).
 *
 * Called after an integration merges contributions, so the gate does not reuse anything
 * the merge affected.
 *
 * @returns The keys removed.
 */
export declare function invalidateForFiles(workDir: string, changedFiles: string[]): string[];
/** Remove every recorded validation. */
export declare function clearEvidence(workDir: string): void;
/** The outcome of trying to claim an expensive validation. */
export interface ValidationClaim {
    granted: boolean;
    key: string;
    /** Who currently holds the claim, when it was not granted. */
    heldBy?: string;
    heldSince?: string;
    reason: string;
}
/**
 * Claim the right to run an expensive validation (§4).
 *
 * Three workers changing three unrelated features must not each run the full suite. The
 * first to claim a given validation runs it; the others are told who holds it and should
 * wait for the resulting evidence rather than duplicating the work.
 *
 * The claim is an exclusive file creation (`wx`), which is atomic on POSIX, so two
 * processes racing cannot both win. A stale claim past its TTL is reclaimed, so a crashed
 * worker cannot deadlock the wave.
 *
 * @param owner - Identifier of the claiming agent or task.
 * @param ttlMs - How long the claim is honored before being treated as abandoned.
 */
export declare function claimValidation(workDir: string, key: string, owner: string, ttlMs?: number): ValidationClaim;
/** Release a claim once the validation has finished and its evidence is recorded. */
export declare function releaseValidation(workDir: string, key: string): void;
/** Claims currently held, for `$cost` reporting and orchestrator diagnostics. */
export declare function activeClaims(workDir: string): Array<{
    key: string;
    owner: string;
    at: string;
}>;
/** What an agent should do about a validation it is considering. */
export interface ValidationDecision {
    action: 'REUSE' | 'RUN' | 'WAIT' | 'FIX_FIRST';
    reason: string;
    evidence?: EvidenceEntry;
    claim?: ValidationClaim;
}
/**
 * The single call an agent makes before running an expensive validation.
 *
 * Combines reuse and deduplication so callers cannot accidentally implement one without
 * the other:
 *
 *   REUSE     — already proven against this exact state; skip it
 *   FIX_FIRST — already failed against this exact state; re-running proves nothing
 *   WAIT      — another worker is running it; consume its evidence
 *   RUN       — genuinely needed, and the claim is yours
 *
 * @param owner - The agent or task that would run it.
 */
export declare function decideValidation(workDir: string, query: EvidenceQuery, owner: string): ValidationDecision;
/** Stable digest of a set of changed files, for grouping evidence across workers. */
export declare function changedFilesDigest(files: string[]): string;

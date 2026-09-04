import type { ProvenanceRecord } from './mission-ledger.js';
/** How the local baseline relates to the authoritative remote branch. */
export type Freshness = 'CURRENT' | 'ADVANCED' | 'STALE' | 'DIVERGED' | 'UNKNOWN';
/** Why the authoritative branch moved. Classification precedes any reset (§2). */
export type AdvancementClass = 'EXPECTED_ADVANCEMENT' | 'SAFE_FORWARD_ADVANCEMENT' | 'PARALLEL_PUBLICATION' | 'COLLIDING_ADVANCEMENT' | 'BASELINE_DRIFT' | 'UNEXPLAINED_DRIFT' | 'NOT_APPLICABLE';
/** The result of comparing the local baseline against the remote. */
export interface BaselineReport {
    branch: string | null;
    local_sha: string | null;
    local_tree: string | null;
    remote_ref: string | null;
    remote_sha: string | null;
    expected_sha?: string;
    freshness: Freshness;
    advancement: AdvancementClass;
    /** Commits on the remote that the local baseline does not have. */
    behind_by: number;
    /** Commits local has that the remote does not. */
    ahead_by: number;
    /** Files changed on the remote since the merge base — the collision surface. */
    remote_changed_files: string[];
    notes: string[];
}
/**
 * Classify the local baseline against the authoritative remote branch.
 *
 * Never fetches on its own — a network write is not implied by a read (§13). Pass
 * `fetch: true` only where the mission authorizes it.
 *
 * @param workDir - Repository root.
 * @param opts.branch - Branch to compare. Defaults to the checked-out branch.
 * @param opts.remote - Remote name. Defaults to `origin`.
 * @param opts.expectedSha - The baseline the mission was planned against, if known.
 * @param opts.fetch - Run `git fetch --all --prune` first.
 */
export declare function classifyBaseline(workDir: string, opts?: {
    branch?: string;
    remote?: string;
    expectedSha?: string;
    fetch?: boolean;
}): BaselineReport;
/** How a finished worker relates to a baseline that moved while it worked. */
export type WorkerStaleness = 'CURRENT' | 'STALE_BUT_PATCH_EQUIVALENT' | 'STALE_WITH_COLLISION' | 'OBSOLETE' | 'UNKNOWN';
/** The read-only reconciliation verdict for a finished worker. */
export interface StalenessReport {
    classification: WorkerStaleness;
    worker_sha: string;
    worker_changed_files: string[];
    /** Files this worker touched that also moved on the target — the real collision set. */
    colliding_files: string[];
    already_integrated: boolean;
    reason: string;
}
/**
 * Reconcile a finished worker against the current target, read-only (§23).
 *
 * Never merges, resets, or rewrites. A shared file is not automatically a hard
 * collision, and a stale worker is never blindly integrated — the caller decides
 * after reading this verdict.
 *
 * @param workerSha - The worker's commit.
 * @param targetRef - The branch or SHA the contribution would land on.
 */
export declare function classifyWorkerStaleness(workDir: string, workerSha: string, targetRef: string): StalenessReport;
/** The verified provenance chain plus the reasoning behind each classification. */
export interface ProvenanceVerification {
    record: ProvenanceRecord;
    /** True when the contribution is proven present and the chain is complete. */
    proven: boolean;
    blockers: string[];
}
/**
 * Verify that a worker's contribution survives in the integration tree (§22).
 *
 * `LOST` and `UNKNOWN` block acceptance — the ledger refuses `INTEGRATION_VALIDATED`
 * for either. That is deliberate: the failure mode this catches is an integration
 * that reports success while a contribution was silently dropped by a conflict
 * resolution or a stale merge.
 *
 * @param workerSha - The original worker commit.
 * @param integrationRef - The tree the contribution should now be part of.
 * @param opts.authorizedSupersedes - Files a later authorized change was permitted to
 *        overwrite. Without this, an overwritten file counts as LOST.
 */
export declare function verifyProvenance(workDir: string, workerSha: string, integrationRef: string, opts?: {
    authorizedSupersedes?: string[];
}): ProvenanceVerification;
/** The result of verifying that a push actually landed on the remote. */
export interface PublicationVerification {
    verified: boolean;
    remote_ref: string;
    remote_sha: string | null;
    remote_tree: string | null;
    expected_sha: string;
    /** Contribution files confirmed present at the remote SHA. */
    contribution_present: boolean;
    blockers: string[];
}
/**
 * Verify a publication against the remote (§37).
 *
 * A successful `git push` is not proof. This re-reads the remote ref and confirms both
 * the SHA and the contribution content. Anything short of that is `PUBLICATION_FAILED`.
 *
 * @param opts.fetch - Fetch before reading the remote ref. Defaults to true, since a
 *        stale remote-tracking ref would let a failed push read as verified.
 */
export declare function verifyPublication(workDir: string, opts: {
    branch: string;
    expectedSha: string;
    remote?: string;
    missionFiles?: string[];
    fetch?: boolean;
}): PublicationVerification;
/** How two workers' write manifests relate. */
export type CollisionClass = 'NONE' | 'SOFT_OVERLAP' | 'SHARED_HOTSPOT' | 'DEPENDENCY' | 'HARD_COLLISION';
/** The relationship between two planned workers. */
export interface CollisionReport {
    worker_a: string;
    worker_b: string;
    classification: CollisionClass;
    shared_files: string[];
    hotspots: string[];
    recommendation: string;
}
/**
 * Classify the collision risk between two planned write manifests (§7).
 *
 * Run before parallel workers write, not after they conflict.
 *
 * @param manifestA - Files worker A expects to change (repo-relative).
 * @param manifestB - Files worker B expects to change.
 * @param opts.dependency - True when B consumes something A produces.
 */
export declare function analyzeCollision(workerA: string, manifestA: string[], workerB: string, manifestB: string[], opts?: {
    dependency?: boolean;
}): CollisionReport;

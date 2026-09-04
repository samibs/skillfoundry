/** Agent identifiers the protocol recognises. `human` covers direct developer work. */
export declare const AGENT_KINDS: readonly ["claude", "codex", "copilot", "cursor", "grok", "gemini", "human", "unknown"];
export type AgentKind = (typeof AGENT_KINDS)[number];
/** Runtime guard for the agent taxonomy. */
export declare function isAgentKind(value: unknown): value is AgentKind;
/**
 * A worker's attested execution environment, written to
 * `.ai/attestations/<MISSION-ID>-<worker>.json`.
 */
export interface Attestation {
    mission_id: string;
    worker: string;
    agent: AgentKind;
    timestamp_utc: string;
    repository_top_level: string;
    worktree_path: string;
    native_worktree_registered: boolean;
    branch: string | null;
    head_sha: string | null;
    base_sha: string | null;
    tree_sha: string | null;
    working_tree_clean: boolean;
    commit_capability_verified: boolean;
    required_assets_present: boolean;
    /** Bounded, non-identifying hash of the toolchain. Never contains secrets (§11). */
    environment_fingerprint: string;
    status: 'PASS' | 'FAIL';
    /** Why the attestation failed. Empty on PASS. */
    blockers: string[];
    /** Non-blocking observations, e.g. a missing remote on a local-only repo. */
    warnings: string[];
}
/** Inputs for {@link attestWorker}. */
export interface AttestOptions {
    missionId: string;
    /** Short worker name; becomes part of the attestation filename. */
    worker: string;
    agent: AgentKind;
    /** Baseline the worker branched from. Recorded as `base_sha` when resolvable. */
    baseRef?: string;
    /**
     * Files that must exist before the worker may write — for example the story file
     * or a config the mission depends on. A missing asset is an ENVIRONMENT_DEFECT,
     * not a reason to modify product code (§41).
     */
    requiredAssets?: string[];
    /**
     * Allow attestation from the repository's main checkout instead of a linked
     * worktree. Single-worker missions legitimately run in place; parallel waves must
     * not (§1 rule 4).
     */
    allowMainWorktree?: boolean;
    /** Permit a dirty tree. Off by default — §1 rule 13 forbids a dirty baseline. */
    allowDirty?: boolean;
}
/**
 * Build a bounded fingerprint of the execution environment.
 *
 * Only coarse, non-identifying facts are hashed: node version, platform, arch, kernel
 * release, and the CI provider when present. No paths, usernames, tokens, or env
 * values are included, so the fingerprint is safe to commit.
 */
export declare function environmentFingerprint(): string;
/** Absolute path where a worker's attestation is stored. */
export declare function attestationPath(workDir: string, missionId: string, worker: string): string;
/**
 * Collect and persist a worker attestation.
 *
 * Every field is read from git or the process — nothing is taken on the worker's word.
 * The attestation is written whether it passes or fails, because a recorded FAIL is
 * itself the evidence that explains why a mission stopped.
 *
 * @param workDir - The directory the worker intends to write in.
 * @param opts - Mission, worker identity, and the environment constraints to enforce.
 * @returns The attestation, including `status` and the blockers behind a FAIL.
 * @throws {Error} When the mission ID or worker name is malformed.
 */
export declare function attestWorker(workDir: string, opts: AttestOptions): Attestation;
/** Read one attestation, or null when it has not been written. */
export declare function readAttestation(workDir: string, missionId: string, worker: string): Attestation | null;
/** Every attestation recorded for a mission, in filename order. */
export declare function listAttestations(workDir: string, missionId: string): Attestation[];
/** The verdict of the pre-write attestation gate. */
export interface AttestationGate {
    allowed: boolean;
    reason: string;
    attestation?: Attestation;
}
/**
 * Enforce "no source writes before attestation" (§4).
 *
 * Call this before a worker's first product write. It fails closed: an absent,
 * unreadable, or FAIL attestation all block equally, because none of them prove the
 * worker is in a sound environment.
 *
 * @param worker - When omitted, any PASS attestation for the mission unblocks.
 */
export declare function gateOnAttestation(workDir: string, missionId: string, worker?: string): AttestationGate;
/**
 * Report whether an attestation still describes the current environment.
 *
 * An attestation taken an hour and forty commits ago no longer proves anything about
 * where the worker is now.
 *
 * @returns Drift reasons. Empty means the attestation still holds.
 */
export declare function attestationDrift(workDir: string, attestation: Attestation): string[];
/** Repo-relative path of an attestation, for recording in the ledger. */
export declare function relativeAttestationPath(workDir: string, missionId: string, worker: string): string;

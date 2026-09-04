/** Root of the governed-mission artifact tree, relative to the repository root. */
export declare const AI_DIR = ".ai";
export declare const LEDGER_FILE = "ledger.json";
export declare const GAPS_FILE = "gaps.json";
export declare const ATTESTATIONS_DIR = "attestations";
export declare const PATCHES_DIR = "patches";
export declare const EVIDENCE_DIR = "evidence";
export declare const DECISIONS_DIR = "decisions";
export declare const DESIGN_DIR = "design";
export declare const AGENTS_DIR = "agents";
export declare const PROCESSES_DIR = "processes";
export declare const LOGS_DIR = "logs";
export declare const APP_CATALOG_FILE = "app-catalog.json";
/** Current on-disk ledger schema version. Bump when the document shape changes. */
export declare const LEDGER_SCHEMA_VERSION = "1.0";
/**
 * Validate a mission ID before it is used as a filename or object key.
 *
 * @throws {Error} When the ID is empty, over-long, or contains path separators.
 */
export declare function assertMissionId(missionId: string): void;
/** Absolute path to the `.ai` directory for a repository root. */
export declare function aiDir(workDir: string): string;
/** Absolute path to `.ai/ledger.json`. */
export declare function ledgerPath(workDir: string): string;
/** Absolute path to `.ai/gaps.json`. */
export declare function gapsPath(workDir: string): string;
/** Absolute path to a mission's evidence directory. */
export declare function evidenceDir(workDir: string, missionId: string): string;
/**
 * The controlled status vocabulary. Ambiguous ad-hoc statuses are rejected at the
 * type level and, for untyped callers, at runtime by {@link isMissionStatus}.
 */
export declare const MISSION_STATUSES: readonly ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTATION_GAP", "BLOCKED_BY_STORY", "BLOCKED_BY_AUTHORIZATION", "BLOCKED_BY_INFRASTRUCTURE", "EVIDENCE_PARTIAL", "EXTERNAL_VALIDATION_REQUIRED", "FAIL", "PASS", "COMPLETE", "INTEGRATION_READY", "INTEGRATION_VALIDATED", "PUBLISHED", "NOT_APPLICABLE"];
export type MissionStatus = (typeof MISSION_STATUSES)[number];
/** Runtime guard for the status taxonomy. */
export declare function isMissionStatus(value: unknown): value is MissionStatus;
/** The five independent lifecycle dimensions tracked per mission (§29). */
export declare const LEDGER_DIMENSIONS: readonly ["implementation_status", "acceptance_status", "integration_status", "publication_status", "external_validation_status"];
export type LedgerDimension = (typeof LEDGER_DIMENSIONS)[number];
/** Runtime guard for a lifecycle dimension name. */
export declare function isLedgerDimension(value: unknown): value is LedgerDimension;
/** Dispositions an acceptance criterion may end with. No AC may be left undecided. */
export declare const AC_DISPOSITIONS: readonly ["PASS", "FAIL", "IMPLEMENTATION_GAP", "EVIDENCE_PARTIAL", "EXTERNAL_VALIDATION_REQUIRED", "BLOCKED_BY_STORY", "BLOCKED_BY_AUTHORIZATION", "BLOCKED_BY_INFRASTRUCTURE", "NOT_APPLICABLE"];
export type AcDisposition = (typeof AC_DISPOSITIONS)[number];
/** One row of the requirement traceability matrix. */
export interface AcceptanceCriterion {
    /** Stable identifier from the authoritative story, e.g. "AC1". */
    id: string;
    /** The requirement text, verbatim from the authoritative source. */
    requirement: string;
    /** Final disposition. Every AC must carry one in the final report. */
    disposition: AcDisposition;
    /** Evidence paths supporting the disposition, relative to the repository root. */
    evidence: string[];
    /** Free-text note; required when the disposition is not PASS. */
    note?: string;
}
/** How a contribution reached the integration tree. */
export type IntegrationMethod = 'DIRECT_ANCESTRY' | 'PROVEN_PATCH_EQUIVALENT_CHERRY_PICK' | 'MERGE' | 'REBASE' | 'UNKNOWN';
/** Whether the worker's contribution actually survives in the final tree. */
export type FinalTreeContribution = 'PRESERVED' | 'SUPERSEDED_BY_AUTHORIZED_CHANGE' | 'LOST' | 'UNKNOWN';
/** The provenance chain recorded for an integrated contribution. */
export interface ProvenanceRecord {
    /** Tip of the contribution — the worker's final commit. */
    original_sha: string;
    /** Base of a multi-commit contribution, when one was verified as a range. */
    base_sha?: string;
    /** `base..tip`, when the contribution spans more than one commit. */
    contribution_range?: string;
    integration_sha?: string;
    integration_method: IntegrationMethod;
    stable_patch_id?: string;
    changed_file_manifest: string[];
    /**
     * Control-plane files skipped during verification because the mission tooling
     * rewrites them after the commit that carries them (the ledger cannot contain its
     * own future). Recorded so the exclusion is visible rather than silent.
     */
    excluded_artifacts?: string[];
    final_tree_contribution: FinalTreeContribution;
    verified_at_utc: string;
    notes?: string;
}
/** Work-item execution states. `IMPLEMENTED` is not `VERIFIED` (§17). */
export declare const EXECUTION_STATUSES: readonly ["PLANNED", "READY", "BLOCKED", "IN_PROGRESS", "IMPLEMENTED", "TESTING", "PASSED", "FAILED", "INTEGRATION_READY", "INTEGRATED", "VERIFIED", "REJECTED"];
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
/** Runtime guard for the execution vocabulary — no "mostly working" (§17). */
export declare function isExecutionStatus(value: unknown): value is ExecutionStatus;
/**
 * Dependency strength (§6).
 *
 * HARD        — dependent work must not start.
 * SOFT        — may start against a stable documented contract.
 * INTEGRATION — may proceed independently; completion needs combined verification.
 */
export declare const DEPENDENCY_KINDS: readonly ["HARD", "SOFT", "INTEGRATION"];
export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];
/** Runtime guard for dependency strength. */
export declare function isDependencyKind(value: unknown): value is DependencyKind;
/** One edge in the global dependency graph. */
export interface Dependency {
    /** Work item this one depends on. */
    on: string;
    kind: DependencyKind;
}
/** Scheduling and ownership facts for a work item. */
export interface ExecutionBlock {
    /** Wave this item was dispatched in, once scheduled. */
    wave?: string;
    /** Unique agent name that owns the write (§8). */
    agent?: string;
    branch?: string;
    worktree?: string;
    /** The exact SHA the worker branched from — never a moving branch name (§11). */
    base_sha?: string;
    /** Parent PRD and story, for traceability back to the requirement (§5). */
    prd?: string;
    story?: string;
    dependencies: Dependency[];
    /** Files the worker declared it would change, for collision analysis (§14). */
    write_manifest: string[];
    status: ExecutionStatus;
    /** Failure codes and reasons. Recorded, never disguised as partial success (§35). */
    blockers: string[];
}
/** Failure codes for recorded blockers (§35). */
export declare const FAILURE_CODES: readonly ["REQUIREMENT_GAP", "DEPENDENCY_BLOCKED", "WORKTREE_INVALID", "BASELINE_DRIFT", "WRITE_COLLISION", "PATCH_CONFLICT", "BUILD_FAILURE", "TEST_FAILURE", "ENVIRONMENT_FAILURE", "PORT_CONFLICT", "PROCESS_CLEANUP_FAILURE", "SECURITY_FAILURE", "INTEGRATION_CONFLICT"];
export type FailureCode = (typeof FAILURE_CODES)[number];
/** Runtime guard for the failure-code vocabulary. */
export declare function isFailureCode(value: unknown): value is FailureCode;
/** A dispatched execution wave (§7). */
export interface Wave {
    /** Work items dispatched together because nothing blocks them. */
    items: string[];
    created_at_utc: string;
    completed_at_utc?: string;
}
/** One recorded integration of a contribution into the authoritative tree (§33). */
export interface IntegrationEntry {
    work_item: string;
    wave?: string;
    integration_sha: string;
    method: IntegrationMethod;
    integrated_at_utc: string;
    /** Baseline SHA after this integration, for the next wave's planning. */
    resulting_baseline_sha?: string;
}
/** The authoritative baseline the current wave was planned against (§34). */
export interface LedgerBaseline {
    branch: string;
    sha: string;
    tree?: string;
    resolved_at_utc: string;
}
/** One mission's authoritative engineering state. */
export interface LedgerMission {
    title: string;
    implementation_status: MissionStatus;
    acceptance_status: MissionStatus;
    integration_status: MissionStatus;
    publication_status: MissionStatus;
    external_validation_status: MissionStatus;
    worker_sha?: string;
    integration_sha?: string;
    published_sha?: string;
    published_tree?: string;
    stable_patch_id?: string;
    /** Repo-relative evidence paths. Never inline blobs — references only (§15). */
    evidence: string[];
    /** Repo-relative path to the mission's patch guide (§14). */
    patch_guide?: string;
    /** Repo-relative paths to worker attestations (§4). */
    attestations: string[];
    acceptance_criteria: AcceptanceCriterion[];
    provenance?: ProvenanceRecord;
    /** Scheduling plane — see {@link ExecutionBlock}. */
    execution: ExecutionBlock;
    /** IDs of open entries in `.ai/gaps.json` that block this mission. */
    remaining_gaps: string[];
    created_at_utc: string;
    updated_at_utc: string;
}
/** The `.ai/ledger.json` document. */
export interface Ledger {
    schema_version: string;
    project: string;
    authoritative_branch: string;
    authoritative_sha?: string;
    authoritative_tree?: string;
    updated_at_utc: string;
    missions: Record<string, LedgerMission>;
    /** Exact baseline the current wave was planned against (§11, §34). */
    baseline?: LedgerBaseline;
    /** The wave currently dispatched. Only one wave runs at a time (§7). */
    active_wave?: string;
    waves: Record<string, Wave>;
    integrations: IntegrationEntry[];
}
/** Categories of unresolved work. `UNKNOWN` is never silently promoted to `PASS`. */
export type GapType = 'EXTERNAL_VALIDATION' | 'IMPLEMENTATION' | 'EVIDENCE' | 'INFRASTRUCTURE' | 'AUTHORIZATION' | 'SECURITY' | 'DOCUMENTATION';
/** One explicitly tracked unresolved gap. */
export interface Gap {
    id: string;
    mission: string;
    type: GapType;
    description: string;
    status: 'OPEN' | 'CLOSED';
    blocks_acceptance: boolean;
    evidence: string[];
    created_at_utc: string;
    closed_at_utc?: string;
}
/** The `.ai/gaps.json` document. */
export interface GapsDocument {
    schema_version: string;
    updated_at_utc: string;
    gaps: Gap[];
}
/**
 * Create the `.ai/` artifact tree.
 *
 * Only directories are created. Empty placeholder files are never written — §48
 * forbids creating files purely to satisfy the directory shape.
 *
 * @param workDir - Repository root.
 * @returns Absolute paths of the directories that now exist.
 */
export declare function initAiTree(workDir: string): string[];
/** True when the repository already carries a ledger. */
export declare function ledgerExists(workDir: string): boolean;
/**
 * Read `.ai/ledger.json`.
 *
 * @returns The ledger, or null when it does not exist.
 * @throws {Error} When the file exists but is not valid JSON — a corrupt ledger is a
 *         hard failure, never silently replaced with an empty one.
 */
export declare function readLedger(workDir: string): Ledger | null;
/** Write the ledger, stamping `updated_at_utc`. */
export declare function writeLedger(workDir: string, ledger: Ledger): void;
/**
 * Create a ledger for a repository, or return the existing one untouched.
 *
 * @param workDir - Repository root.
 * @param project - Project name recorded in the ledger.
 * @param authoritativeBranch - The branch that publication targets.
 */
export declare function initLedger(workDir: string, project: string, authoritativeBranch?: string): Ledger;
/**
 * Register a mission, or return it if already present.
 *
 * A new mission starts at `NOT_STARTED` on every dimension. Nothing is assumed.
 */
export declare function upsertMission(workDir: string, missionId: string, title: string): LedgerMission;
/** Read one mission, or null when it is not registered. */
export declare function getMission(workDir: string, missionId: string): LedgerMission | null;
/**
 * Apply a mutation to a mission and persist the ledger.
 *
 * @throws {Error} When the mission is not registered.
 */
export declare function updateMission(workDir: string, missionId: string, mutate: (mission: LedgerMission) => void): LedgerMission;
/** The outcome of attempting a lifecycle promotion. */
export interface PromotionResult {
    accepted: boolean;
    dimension: LedgerDimension;
    from: MissionStatus;
    to: MissionStatus;
    /** Reasons the promotion was refused. Empty when `accepted` is true. */
    blockers: string[];
}
/**
 * Set one lifecycle dimension, refusing any status the evidence does not support.
 *
 * @param workDir - Repository root.
 * @param missionId - Registered mission ID.
 * @param dimension - Which lifecycle dimension to set.
 * @param status - Target status from the controlled taxonomy.
 * @param opts.force - Record the status despite missing evidence. Reserved for
 *        human override; the blockers are still returned so the caller can log them.
 * @returns The promotion result, including refusal reasons.
 * @throws {Error} When the mission is unknown or the status is illegal for the dimension.
 */
export declare function setDimension(workDir: string, missionId: string, dimension: LedgerDimension, status: MissionStatus, opts?: {
    force?: boolean;
}): PromotionResult;
/**
 * Attach an evidence reference to a mission.
 *
 * Only a repo-relative path that exists is recorded — a dangling evidence reference
 * would let the ledger claim proof it does not have.
 *
 * @param evidencePath - Absolute or repo-relative path to the evidence artifact.
 * @throws {Error} When the path does not exist or escapes the repository.
 */
export declare function attachEvidence(workDir: string, missionId: string, evidencePath: string): string;
/** Record or replace the acceptance-criteria matrix for a mission (§5). */
export declare function setAcceptanceCriteria(workDir: string, missionId: string, criteria: AcceptanceCriterion[]): void;
/** Record the provenance chain for an integrated contribution (§22). */
export declare function setProvenance(workDir: string, missionId: string, record: ProvenanceRecord): void;
/** Read `.ai/gaps.json`, returning an empty document when the file is absent. */
export declare function readGaps(workDir: string): GapsDocument;
/** Persist the gaps document. */
export declare function writeGaps(workDir: string, doc: GapsDocument): void;
/**
 * Open a gap and, when it blocks acceptance, link it to the mission.
 *
 * @returns The created gap, with a generated `GAP-NNN` ID.
 */
export declare function openGap(workDir: string, input: {
    mission: string;
    type: GapType;
    description: string;
    blocks_acceptance: boolean;
    evidence?: string[];
}): Gap;
/**
 * Close a gap and unlink it from its mission.
 *
 * @returns The closed gap, or null when the ID is unknown.
 */
export declare function closeGap(workDir: string, gapId: string): Gap | null;
/** Open gaps for a mission, or across the whole project when `missionId` is omitted. */
export declare function openGaps(workDir: string, missionId?: string): Gap[];
/** Outcome of an execution-status transition. */
export interface ExecutionTransition {
    accepted: boolean;
    from: ExecutionStatus;
    to: ExecutionStatus;
    blockers: string[];
}
/**
 * Move a work item along the execution axis (§17, §18).
 *
 * Terminal transitions are cross-checked against the governance plane, so the scheduler
 * cannot mark work INTEGRATED that the evidence gate has not validated.
 *
 * @param opts.force - Record the transition anyway. Blockers are still returned.
 * @throws {Error} When the mission is unknown or the status is outside the vocabulary.
 */
export declare function setExecutionStatus(workDir: string, missionId: string, status: ExecutionStatus, opts?: {
    force?: boolean;
}): ExecutionTransition;
/** Assign scheduling and ownership facts to a work item (§8, §11, §16). */
export declare function setExecutionPlan(workDir: string, missionId: string, plan: Partial<Omit<ExecutionBlock, 'status' | 'blockers'>>): ExecutionBlock;
/**
 * Record a blocker against a work item (§35).
 *
 * Failures are recorded, never disguised as partial success. Recording one also drops
 * the item to BLOCKED unless it has already failed outright.
 */
export declare function recordBlocker(workDir: string, missionId: string, code: FailureCode, detail: string): void;
/** Clear a work item's blockers once they are genuinely resolved. */
export declare function clearBlockers(workDir: string, missionId: string): void;
/** Record the exact authoritative baseline the current plan was built against (§11, §34). */
export declare function setBaseline(workDir: string, baseline: Omit<LedgerBaseline, 'resolved_at_utc'>): void;
/**
 * Dispatch a wave: record its members, stamp each item, and make it the active wave (§7).
 *
 * Only one wave is active at a time — dispatching a new one while another is unfinished
 * is refused, because overlapping waves reintroduce exactly the collisions wave planning
 * exists to prevent.
 *
 * @throws {Error} When a member is unknown, or another wave is still open.
 */
export declare function dispatchWave(workDir: string, waveId: string, items: string[]): Wave;
/** Work items in a wave that are not yet resolved (§39). */
export declare function unresolvedWaveItems(workDir: string, waveId: string): string[];
/**
 * Close a wave (§39).
 *
 * A wave completes only when every item is INTEGRATED, BLOCKED, REJECTED or VERIFIED.
 * No worker may remain ambiguously IN_PROGRESS.
 *
 * @returns The unresolved items when the wave cannot close; empty on success.
 */
export declare function completeWave(workDir: string, waveId: string): string[];
/** Append an integration record and advance the recorded baseline (§33). */
export declare function recordIntegration(workDir: string, entry: Omit<IntegrationEntry, 'integrated_at_utc'>): void;
/** A discrepancy between the ledger and provable repository state. */
export interface LedgerDiscrepancy {
    mission: string;
    field: string;
    claim: string;
    reality: string;
}
/**
 * Compare ledger claims against the filesystem.
 *
 * Truth order §49: the repository tree and immutable evidence outrank the ledger. When
 * they disagree, the ledger is stale and must be corrected — reality is never rewritten
 * to match the ledger.
 *
 * @returns Every claim the repository cannot substantiate.
 */
export declare function reconcileLedger(workDir: string): LedgerDiscrepancy[];

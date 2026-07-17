/** Current on-disk schema version. Bump when the document shape changes. */
export declare const STATE_SCHEMA_VERSION = 1;
/** Default threshold above which a string field spills to disk (8 KiB). */
export declare const DEFAULT_MAX_FIELD_BYTES: number;
/**
 * Build status for the whole run. Only the deterministic gate barrier may set
 * `PASSING` via {@link StateKernel.setBuildStatus} — see §4.2 determinism boundary.
 */
export type BuildStatus = 'PASSING' | 'FAILING' | 'UNKNOWN';
/**
 * Pointer left in a slice when a large string field was spilled to disk (FR-002).
 * `ref` is a run-dir-relative path; `hash` is the content SHA-256; `bytes` is the
 * original UTF-8 byte length.
 */
export interface SpilledRef {
    __spilled: true;
    ref: string;
    hash: string;
    bytes: number;
}
/** Type guard for a spilled-field pointer. */
export declare function isSpilledRef(value: unknown): value is SpilledRef;
/** An owner-scoped partition of run state. Extra keys are agent-defined data. */
export interface StateSlice {
    /** Monotonic version, incremented on every committed write. */
    version: number;
    /** The single agent id permitted to write this slice (write authority). */
    owner: string;
    [key: string]: unknown;
}
/** Run-wide metadata. `build_status` is gate-controlled. */
export interface ProjectMetadata {
    target?: string;
    build_status: BuildStatus;
    [key: string]: unknown;
}
/** The full state document persisted at `<runDir>/state/state.json`. */
export interface StateDocument {
    schema_version: number;
    run_id: string;
    project_metadata: ProjectMetadata;
    slices: Record<string, StateSlice>;
}
/** Thrown when a slice commit carries a version that no longer matches disk (FR-009). */
export declare class StaleVersionError extends Error {
    readonly slice: string;
    readonly expected: number;
    readonly actual: number;
    constructor(slice: string, expected: number, actual: number);
}
/** Thrown when an agent writes a slice it does not own (write authority, FR-009). */
export declare class WriteAuthorityError extends Error {
    readonly slice: string;
    readonly owner: string;
    readonly attemptedBy: string;
    constructor(slice: string, owner: string, attemptedBy: string);
}
/** Thrown when an oversized field cannot be spilled to disk (the only reject path, FR-002). */
export declare class SpillError extends Error {
    constructor(field: string, cause: unknown);
}
export interface StateKernelOptions {
    /** Fields whose UTF-8 length exceeds this spill to disk. Defaults to 8 KiB. */
    maxFieldBytes?: number;
}
/**
 * Manages one run's authoritative state document on disk.
 *
 * Construct via {@link StateKernel.create} (fresh run) or {@link StateKernel.open}
 * (existing run). Every method reads and writes the on-disk document so the file is
 * always the source of truth — there is no in-memory copy that can diverge.
 */
export declare class StateKernel {
    private readonly runDir;
    private readonly stateDir;
    private readonly statePath;
    private readonly tmpPath;
    private readonly artifactsDir;
    private readonly maxFieldBytes;
    private constructor();
    /**
     * Initialize a fresh state document for `runId` under `runDir` and return its kernel.
     * Creates `state/` and `state/artifacts/`. Throws if state already exists — use
     * {@link StateKernel.open} to reattach to an existing run.
     *
     * @param runDir - The run directory (e.g. `.skillfoundry/runs/<id>`).
     * @param runId - Unique run identifier stored in the document.
     * @param metadata - Optional initial project metadata (build_status defaults to UNKNOWN).
     */
    static create(runDir: string, runId: string, metadata?: Partial<ProjectMetadata>, options?: StateKernelOptions): StateKernel;
    /**
     * Reattach to an existing run's state document (crash recovery / resume).
     * Throws if no state document is present.
     */
    static open(runDir: string, options?: StateKernelOptions): StateKernel;
    /** Whether a state document exists for this run directory. */
    static exists(runDir: string): boolean;
    /** Read and parse the authoritative state document from disk. */
    load(): StateDocument;
    /** Return a copy of a single slice, or `undefined` if it does not exist yet. */
    getSlice(name: string): StateSlice | undefined;
    /** Current run build status. */
    getBuildStatus(): BuildStatus;
    /**
     * Commit `data` to `name` as `owner`, guarded by optimistic concurrency (FR-009).
     *
     * - The slice is writable only by its `owner` (throws {@link WriteAuthorityError}).
     * - `expectedVersion` must equal the slice's current version (0 for a new slice),
     *   else {@link StaleVersionError} is thrown so the caller can rebase and retry.
     * - Oversized string fields in `data` spill to disk before the commit (FR-002).
     *
     * @returns The newly committed slice, including its incremented `version`.
     */
    commitSlice(name: string, owner: string, data: Record<string, unknown>, expectedVersion: number): StateSlice;
    /**
     * Read-modify-write a slice with automatic rebase on contention (FR-009 recovery).
     *
     * Re-reads the current slice, applies `mutator` to produce the new data, and commits.
     * On {@link StaleVersionError} it re-reads and retries up to `maxAttempts` (default 3)
     * before rethrowing — a losing writer never silently drops its update.
     *
     * @param name - Slice name.
     * @param owner - Writing agent id (must own the slice if it exists).
     * @param mutator - Given the current slice data (`{}` if new), returns the next data.
     * @param maxAttempts - Max CAS attempts before escalating (default 3).
     */
    updateSlice(name: string, owner: string, mutator: (current: Record<string, unknown>) => Record<string, unknown>, maxAttempts?: number): StateSlice;
    /**
     * Set the run build status. This is the ONLY way `PASSING` reaches the document and
     * is reserved for the deterministic gate barrier (§4.2 determinism boundary). Agents
     * write metrics into their own slices; they cannot self-certify the build.
     */
    setBuildStatus(status: BuildStatus): void;
    /** Read a spilled artifact's raw content back given its {@link SpilledRef}. */
    readArtifact(ref: SpilledRef): string;
    /** Absolute path to this run's state.json (for logging / inspection). */
    get path(): string;
    /**
     * Replace any top-level string field longer than `maxFieldBytes` with a spilled
     * pointer, writing the content to `state/artifacts/<sha256>`. Non-string and
     * within-limit fields pass through unchanged. Throws {@link SpillError} if the
     * disk write fails — the only path that rejects a commit (FR-002).
     */
    private spillOversized;
    /** Atomically write the document: stage to a temp file, then rename into place. */
    private persist;
}

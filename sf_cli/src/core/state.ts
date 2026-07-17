// Project State Kernel — the durable, versioned, single source of truth for a run.
//
// One state document per run lives at `<runDir>/state/state.json`. It is partitioned
// into owner-scoped slices (coder_state, tester_state, …). The kernel enforces three
// invariants from the AgentOS PRD (genesis/2026-07-17-agentos-state-kernel.md):
//
//   FR-002  References not blobs — oversized string fields spill to disk transparently
//           (`state/artifacts/<sha256>`) and are replaced with a {ref,hash,bytes} pointer.
//           A write is rejected only if the spill itself fails.
//   FR-009  Write authority + versioning — each slice has a single owning agent and a
//           monotonic version. A stale-version commit is rejected (optimistic
//           concurrency); `updateSlice` rebases and retries. Cross-slice writes are
//           independent.
//   §4.2    Determinism boundary — only `setBuildStatus` (called by the gate barrier)
//           may mark the run PASSING. An agent-authored slice can never self-certify.
//
// The document on disk is authoritative: every read/write goes through it, and writes
// are atomic (temp + rename on the same filesystem) so a crash leaves the last valid
// state.json intact.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/** Current on-disk schema version. Bump when the document shape changes. */
export const STATE_SCHEMA_VERSION = 1;

/** Default threshold above which a string field spills to disk (8 KiB). */
export const DEFAULT_MAX_FIELD_BYTES = 8 * 1024;

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
export function isSpilledRef(value: unknown): value is SpilledRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __spilled?: unknown }).__spilled === true
  );
}

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
export class StaleVersionError extends Error {
  constructor(
    readonly slice: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Stale write to slice "${slice}": expected version ${expected}, current is ${actual}. Re-read and rebase.`,
    );
    this.name = 'StaleVersionError';
  }
}

/** Thrown when an agent writes a slice it does not own (write authority, FR-009). */
export class WriteAuthorityError extends Error {
  constructor(
    readonly slice: string,
    readonly owner: string,
    readonly attemptedBy: string,
  ) {
    super(
      `Agent "${attemptedBy}" may not write slice "${slice}" owned by "${owner}".`,
    );
    this.name = 'WriteAuthorityError';
  }
}

/** Thrown when an oversized field cannot be spilled to disk (the only reject path, FR-002). */
export class SpillError extends Error {
  constructor(field: string, cause: unknown) {
    super(`Failed to spill oversized field "${field}" to disk: ${String(cause)}`);
    this.name = 'SpillError';
  }
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
export class StateKernel {
  private readonly stateDir: string;
  private readonly statePath: string;
  private readonly tmpPath: string;
  private readonly artifactsDir: string;
  private readonly maxFieldBytes: number;

  private constructor(
    private readonly runDir: string,
    options: StateKernelOptions = {},
  ) {
    this.stateDir = join(runDir, 'state');
    this.statePath = join(this.stateDir, 'state.json');
    this.tmpPath = join(this.stateDir, 'state.json.tmp');
    this.artifactsDir = join(this.stateDir, 'artifacts');
    this.maxFieldBytes = options.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES;
  }

  /**
   * Initialize a fresh state document for `runId` under `runDir` and return its kernel.
   * Creates `state/` and `state/artifacts/`. Throws if state already exists — use
   * {@link StateKernel.open} to reattach to an existing run.
   *
   * @param runDir - The run directory (e.g. `.skillfoundry/runs/<id>`).
   * @param runId - Unique run identifier stored in the document.
   * @param metadata - Optional initial project metadata (build_status defaults to UNKNOWN).
   */
  static create(
    runDir: string,
    runId: string,
    metadata: Partial<ProjectMetadata> = {},
    options: StateKernelOptions = {},
  ): StateKernel {
    const kernel = new StateKernel(runDir, options);
    if (existsSync(kernel.statePath)) {
      throw new Error(
        `State already exists at ${kernel.statePath}. Use StateKernel.open() instead.`,
      );
    }
    mkdirSync(kernel.artifactsDir, { recursive: true });
    const doc: StateDocument = {
      schema_version: STATE_SCHEMA_VERSION,
      run_id: runId,
      project_metadata: { build_status: 'UNKNOWN', ...metadata },
      slices: {},
    };
    kernel.persist(doc);
    logger.info('persist', 'state_kernel_init', { runId, path: kernel.statePath });
    return kernel;
  }

  /**
   * Reattach to an existing run's state document (crash recovery / resume).
   * Throws if no state document is present.
   */
  static open(runDir: string, options: StateKernelOptions = {}): StateKernel {
    const kernel = new StateKernel(runDir, options);
    if (!existsSync(kernel.statePath)) {
      throw new Error(`No state document found at ${kernel.statePath}.`);
    }
    // Ensure the artifacts dir exists even for older runs.
    mkdirSync(kernel.artifactsDir, { recursive: true });
    return kernel;
  }

  /** Whether a state document exists for this run directory. */
  static exists(runDir: string): boolean {
    return existsSync(join(runDir, 'state', 'state.json'));
  }

  /** Read and parse the authoritative state document from disk. */
  load(): StateDocument {
    const raw = readFileSync(this.statePath, 'utf-8');
    return JSON.parse(raw) as StateDocument;
  }

  /** Return a copy of a single slice, or `undefined` if it does not exist yet. */
  getSlice(name: string): StateSlice | undefined {
    const slice = this.load().slices[name];
    return slice ? { ...slice } : undefined;
  }

  /** Current run build status. */
  getBuildStatus(): BuildStatus {
    return this.load().project_metadata.build_status;
  }

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
  commitSlice(
    name: string,
    owner: string,
    data: Record<string, unknown>,
    expectedVersion: number,
  ): StateSlice {
    const doc = this.load();
    const existing = doc.slices[name];
    const currentVersion = existing ? existing.version : 0;

    if (existing && existing.owner !== owner) {
      throw new WriteAuthorityError(name, existing.owner, owner);
    }
    if (expectedVersion !== currentVersion) {
      throw new StaleVersionError(name, expectedVersion, currentVersion);
    }

    const spilled = this.spillOversized(data);
    const nextSlice: StateSlice = {
      ...spilled,
      owner,
      version: currentVersion + 1,
    };
    doc.slices[name] = nextSlice;
    this.persist(doc);
    return { ...nextSlice };
  }

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
  updateSlice(
    name: string,
    owner: string,
    mutator: (current: Record<string, unknown>) => Record<string, unknown>,
    maxAttempts = 3,
  ): StateSlice {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existing = this.getSlice(name);
      const currentVersion = existing?.version ?? 0;
      // Strip control fields before handing data to the mutator.
      const currentData: Record<string, unknown> = { ...existing };
      delete currentData.version;
      delete currentData.owner;
      const nextData = mutator(currentData);
      try {
        return this.commitSlice(name, owner, nextData, currentVersion);
      } catch (err) {
        if (err instanceof StaleVersionError) {
          lastError = err;
          logger.warn('persist', 'state_cas_retry', {
            slice: name,
            attempt,
            maxAttempts,
          });
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `updateSlice exhausted ${maxAttempts} attempts on slice "${name}" due to contention: ${String(lastError)}`,
    );
  }

  /**
   * Set the run build status. This is the ONLY way `PASSING` reaches the document and
   * is reserved for the deterministic gate barrier (§4.2 determinism boundary). Agents
   * write metrics into their own slices; they cannot self-certify the build.
   */
  setBuildStatus(status: BuildStatus): void {
    const doc = this.load();
    doc.project_metadata.build_status = status;
    this.persist(doc);
  }

  /** Read a spilled artifact's raw content back given its {@link SpilledRef}. */
  readArtifact(ref: SpilledRef): string {
    return readFileSync(join(this.runDir, ref.ref), 'utf-8');
  }

  /** Absolute path to this run's state.json (for logging / inspection). */
  get path(): string {
    return this.statePath;
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Replace any top-level string field longer than `maxFieldBytes` with a spilled
   * pointer, writing the content to `state/artifacts/<sha256>`. Non-string and
   * within-limit fields pass through unchanged. Throws {@link SpillError} if the
   * disk write fails — the only path that rejects a commit (FR-002).
   */
  private spillOversized(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > this.maxFieldBytes) {
        const hash = createHash('sha256').update(value, 'utf8').digest('hex');
        const artifactPath = join(this.artifactsDir, hash);
        try {
          if (!existsSync(artifactPath)) {
            writeFileSync(artifactPath, value, 'utf-8');
          }
        } catch (err) {
          throw new SpillError(key, err);
        }
        const ref: SpilledRef = {
          __spilled: true,
          ref: join('state', 'artifacts', hash),
          hash: `sha256:${hash}`,
          bytes: Buffer.byteLength(value, 'utf8'),
        };
        out[key] = ref;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /** Atomically write the document: stage to a temp file, then rename into place. */
  private persist(doc: StateDocument): void {
    const json = JSON.stringify(doc, null, 2);
    writeFileSync(this.tmpPath, json, 'utf-8');
    renameSync(this.tmpPath, this.statePath);
  }
}

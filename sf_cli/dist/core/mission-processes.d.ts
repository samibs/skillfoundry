/** One runnable service within an application. */
export interface CatalogService {
    name: string;
    /** Path to the service, relative to the application repository. */
    path: string;
    /** Ports this service binds. Reserved so two agents do not fight over one. */
    ports: number[];
}
/** One application the agents may operate on. */
export interface CatalogApplication {
    name: string;
    repository: string;
    services: CatalogService[];
}
/** The `.ai/app-catalog.json` document. */
export interface AppCatalog {
    schema_version: string;
    updated_at_utc: string;
    applications: CatalogApplication[];
}
/** Absolute path of the application catalog. */
export declare function catalogPath(workDir: string): string;
/** Read the catalog, returning an empty one when it does not exist. */
export declare function readCatalog(workDir: string): AppCatalog;
/** Persist the catalog. */
export declare function writeCatalog(workDir: string, catalog: AppCatalog): void;
/**
 * Add or replace an application entry.
 *
 * @throws {Error} When a port is outside the valid range, or the entry is incomplete.
 */
export declare function upsertApplication(workDir: string, app: CatalogApplication): AppCatalog;
/** A port claimed by more than one service (§35 PORT_CONFLICT). */
export interface PortConflict {
    port: number;
    claimants: string[];
}
/**
 * Find ports claimed by more than one service (§19).
 *
 * Two agents starting services on the same port produce a failure that looks like a
 * product bug — one service silently fails to bind — so the conflict is surfaced from
 * the catalog before anything starts.
 */
export declare function detectPortConflicts(catalog: AppCatalog): PortConflict[];
/** Look up which service owns a port, so an agent never guesses runtime topology. */
export declare function serviceForPort(catalog: AppCatalog, port: number): {
    application: string;
    service: CatalogService;
} | null;
/** Lifecycle of an owned process. */
export type ProcessStatus = 'RUNNING' | 'STOPPED' | 'ORPHANED' | 'UNKNOWN';
/** One process started by an agent, owned until explicitly transferred. */
export interface ProcessRecord {
    pid: number;
    command: string;
    args: string[];
    cwd: string;
    ports: number[];
    /** Owning agent name — a process without an owner cannot be safely cleaned up. */
    agent: string;
    workItem: string;
    startedAt: string;
    status: ProcessStatus;
    /**
     * Identity fingerprint captured at registration: a normalized snapshot of the
     * process command line. Compared before any signal is sent, so a recycled PID that
     * now belongs to something else is never killed.
     */
    identity?: string;
    stoppedAt?: string;
}
/** Absolute path of an agent's process registry file. */
export declare function processesPath(workDir: string, agent: string): string;
/**
 * Read the live command line of a PID, for ownership verification.
 *
 * @returns A normalized command string, or null when the process no longer exists.
 */
export declare function readProcessIdentity(pid: number): string | null;
/** True when a PID exists and the caller may signal it. */
export declare function isProcessAlive(pid: number): boolean;
/** Every process recorded for an agent. */
export declare function listProcesses(workDir: string, agent: string): ProcessRecord[];
/** Every process recorded across every agent. */
export declare function listAllProcesses(workDir: string): ProcessRecord[];
/**
 * Record a process as owned by an agent (§20).
 *
 * Applies to dev servers, test watchers, Docker containers, browser automation,
 * background workers, and databases launched for tests — anything that outlives a
 * single command and could otherwise be orphaned.
 *
 * @returns The stored record, including the captured identity fingerprint.
 * @throws {Error} When the work item id is malformed.
 */
export declare function registerProcess(workDir: string, record: Omit<ProcessRecord, 'startedAt' | 'status' | 'identity'>): ProcessRecord;
/** Why a stop attempt succeeded, was skipped, or was refused. */
export interface StopOutcome {
    pid: number;
    command: string;
    /** `stopped` | `already-exited` | `refused` | `failed` */
    result: 'stopped' | 'already-exited' | 'refused' | 'failed';
    detail: string;
}
/**
 * Verify a recorded PID still refers to the process the agent started.
 *
 * PIDs are recycled. Without this check, cleaning up a long-finished dev server can
 * terminate whatever process inherited its number — on a shared developer machine that
 * is somebody else's work.
 *
 * @returns `{ safe, reason }`. `safe` is false whenever identity cannot be confirmed.
 */
export declare function verifyProcessOwnership(record: ProcessRecord): {
    safe: boolean;
    reason: string;
};
/**
 * Stop the processes an agent owns, and only those (§21).
 *
 * Each PID is ownership-verified before any signal is sent; a PID that fails
 * verification is refused and reported rather than killed. Children are signalled
 * before their parent so a supervisor cannot respawn them.
 *
 * @param opts.force - Escalate to SIGKILL after the grace period.
 * @param opts.graceMs - Milliseconds to wait after SIGTERM before escalating.
 * @returns One outcome per recorded process.
 */
export declare function stopOwnedProcesses(workDir: string, agent: string, opts?: {
    force?: boolean;
    graceMs?: number;
}): Promise<StopOutcome[]>;
/**
 * Processes still running that should not be (§21).
 *
 * A worker cannot report clean completion while owned orphan processes remain, so this
 * is what the completion gate consults.
 *
 * @param agent - Restrict to one agent; otherwise every registered agent is checked.
 */
export declare function orphanedProcesses(workDir: string, agent?: string): ProcessRecord[];
/** Drop stopped process records, keeping anything still alive for investigation. */
export declare function pruneProcessRecords(workDir: string, agent: string): number;

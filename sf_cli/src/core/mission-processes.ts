// Governed Mission Protocol — application catalog and process ownership.
//
// Implements MULTI_AGENT_PROTOCOL §19-§21. The rule that matters most:
//
//   §21  Never broadly kill "all node", "all dotnet", "all python", "all docker".
//        Verify ownership first.
//
// On a developer machine running several projects at once, a blanket `pkill node` taken
// by one agent destroys another team's dev server, another agent's test host, and the
// user's own editor tooling. So every process an agent starts is recorded with enough
// identity to prove, later, that the PID still refers to the same process — PIDs are
// recycled, and killing a recycled PID is exactly the accident this guards against.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { aiDir, PROCESSES_DIR, APP_CATALOG_FILE, assertMissionId } from './mission-ledger.js';
import { getLogger } from '../utils/logger.js';

// ── Application / repository / port catalog (§19) ─────────────────────────────

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
export function catalogPath(workDir: string): string {
  return join(aiDir(workDir), APP_CATALOG_FILE);
}

function nowUtc(): string {
  return new Date().toISOString();
}

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

/** Read the catalog, returning an empty one when it does not exist. */
export function readCatalog(workDir: string): AppCatalog {
  const p = catalogPath(workDir);
  if (!existsSync(p)) {
    return { schema_version: '1.0', updated_at_utc: nowUtc(), applications: [] };
  }
  try {
    const doc = JSON.parse(readFileSync(p, 'utf-8')) as AppCatalog;
    doc.applications ??= [];
    return doc;
  } catch (err) {
    throw new Error(
      `.ai/app-catalog.json is corrupt: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Persist the catalog. */
export function writeCatalog(workDir: string, catalog: AppCatalog): void {
  catalog.updated_at_utc = nowUtc();
  writeJsonAtomic(catalogPath(workDir), catalog);
}

/**
 * Add or replace an application entry.
 *
 * @throws {Error} When a port is outside the valid range, or the entry is incomplete.
 */
export function upsertApplication(workDir: string, app: CatalogApplication): AppCatalog {
  if (!app.name || !app.repository) {
    throw new Error('A catalog application requires both a name and a repository path');
  }
  for (const service of app.services) {
    for (const port of service.ports) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Service "${service.name}": invalid port ${port}`);
      }
    }
  }

  const catalog = readCatalog(workDir);
  const idx = catalog.applications.findIndex((a) => a.name === app.name);
  if (idx === -1) catalog.applications.push(app);
  else catalog.applications[idx] = app;

  writeCatalog(workDir, catalog);
  return catalog;
}

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
export function detectPortConflicts(catalog: AppCatalog): PortConflict[] {
  const byPort = new Map<number, string[]>();

  for (const app of catalog.applications) {
    for (const service of app.services) {
      for (const port of service.ports) {
        byPort.set(port, [...(byPort.get(port) ?? []), `${app.name}/${service.name}`]);
      }
    }
  }

  return [...byPort.entries()]
    .filter(([, claimants]) => claimants.length > 1)
    .map(([port, claimants]) => ({ port, claimants }))
    .sort((a, b) => a.port - b.port);
}

/** Look up which service owns a port, so an agent never guesses runtime topology. */
export function serviceForPort(
  catalog: AppCatalog,
  port: number,
): { application: string; service: CatalogService } | null {
  for (const app of catalog.applications) {
    for (const service of app.services) {
      if (service.ports.includes(port)) return { application: app.name, service };
    }
  }
  return null;
}

// ── Process ownership (§20) ───────────────────────────────────────────────────

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
export function processesPath(workDir: string, agent: string): string {
  return join(aiDir(workDir), PROCESSES_DIR, `${agent}.json`);
}

/**
 * Read the live command line of a PID, for ownership verification.
 *
 * @returns A normalized command string, or null when the process no longer exists.
 */
export function readProcessIdentity(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  // Linux: /proc is authoritative and needs no subprocess.
  const procFile = `/proc/${pid}/cmdline`;
  if (existsSync(procFile)) {
    try {
      const raw = readFileSync(procFile, 'utf-8');
      const normalized = raw.replace(/\0/g, ' ').trim();
      return normalized.length > 0 ? normalized : null;
    } catch {
      return null;
    }
  }

  if (process.platform === 'win32') return null;

  // macOS and other POSIX: fall back to ps.
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** True when a PID exists and the caller may signal it. */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Every process recorded for an agent. */
export function listProcesses(workDir: string, agent: string): ProcessRecord[] {
  const p = processesPath(workDir, agent);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as ProcessRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Every process recorded across every agent. */
export function listAllProcesses(workDir: string): ProcessRecord[] {
  const dir = join(aiDir(workDir), PROCESSES_DIR);
  if (!existsSync(dir)) return [];

  const out: ProcessRecord[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) continue;
    out.push(...listProcesses(workDir, file.replace(/\.json$/, '')));
  }
  return out;
}

function saveProcesses(workDir: string, agent: string, records: ProcessRecord[]): void {
  writeJsonAtomic(processesPath(workDir, agent), records);
}

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
export function registerProcess(
  workDir: string,
  record: Omit<ProcessRecord, 'startedAt' | 'status' | 'identity'>,
): ProcessRecord {
  assertMissionId(record.workItem);

  const stored: ProcessRecord = {
    ...record,
    cwd: resolve(record.cwd),
    startedAt: nowUtc(),
    status: 'RUNNING',
    identity: readProcessIdentity(record.pid) ?? undefined,
  };

  const records = listProcesses(workDir, record.agent).filter((r) => r.pid !== record.pid);
  records.push(stored);
  saveProcesses(workDir, record.agent, records);

  getLogger().info('mission', 'process_registered', {
    agent: record.agent, pid: record.pid, command: record.command,
  });
  return stored;
}

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
export function verifyProcessOwnership(record: ProcessRecord): { safe: boolean; reason: string } {
  if (!isProcessAlive(record.pid)) {
    return { safe: false, reason: 'Process is no longer running' };
  }

  const current = readProcessIdentity(record.pid);
  if (!record.identity) {
    return {
      safe: false,
      reason: 'No identity fingerprint was recorded at registration — ownership cannot be proven, refusing to signal',
    };
  }
  if (current === null) {
    return { safe: false, reason: 'Could not read the current command line — ownership cannot be proven' };
  }
  if (current !== record.identity) {
    return {
      safe: false,
      reason: `PID ${record.pid} now runs a different command ("${current.slice(0, 80)}") — the PID was recycled, refusing to kill`,
    };
  }

  return { safe: true, reason: 'Identity fingerprint matches the recorded process' };
}

/** Direct children of a PID, read from /proc. Used to stop a tree bottom-up. */
function childPids(pid: number): number[] {
  if (process.platform === 'win32' || !existsSync('/proc')) return [];

  const children: number[] = [];
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      const statFile = `/proc/${entry}/stat`;
      if (!existsSync(statFile)) continue;
      try {
        const stat = readFileSync(statFile, 'utf-8');
        // Field 4 is PPID, but the comm field (2) may contain spaces or parens.
        const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        if (parseInt(afterComm[1], 10) === pid) children.push(parseInt(entry, 10));
      } catch {
        // The process exited while we were reading — nothing to do.
      }
    }
  } catch {
    return [];
  }
  return children;
}

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
export async function stopOwnedProcesses(
  workDir: string,
  agent: string,
  opts: { force?: boolean; graceMs?: number } = {},
): Promise<StopOutcome[]> {
  const graceMs = opts.graceMs ?? 2_000;
  const records = listProcesses(workDir, agent);
  const outcomes: StopOutcome[] = [];

  for (const record of records) {
    if (record.status === 'STOPPED') {
      outcomes.push({ pid: record.pid, command: record.command, result: 'already-exited', detail: 'Previously stopped' });
      continue;
    }

    const ownership = verifyProcessOwnership(record);
    if (!ownership.safe) {
      const exited = !isProcessAlive(record.pid);
      outcomes.push({
        pid: record.pid,
        command: record.command,
        result: exited ? 'already-exited' : 'refused',
        detail: ownership.reason,
      });
      record.status = exited ? 'STOPPED' : 'UNKNOWN';
      if (exited) record.stoppedAt = nowUtc();
      continue;
    }

    // Children first, so a supervisor does not restart them after the parent dies.
    const targets = [...childPids(record.pid), record.pid];
    for (const pid of targets) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }

    await new Promise((r) => setTimeout(r, graceMs));

    if (isProcessAlive(record.pid) && opts.force) {
      for (const pid of targets) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    const stillAlive = isProcessAlive(record.pid);
    record.status = stillAlive ? 'ORPHANED' : 'STOPPED';
    if (!stillAlive) record.stoppedAt = nowUtc();

    outcomes.push({
      pid: record.pid,
      command: record.command,
      result: stillAlive ? 'failed' : 'stopped',
      detail: stillAlive
        ? `PROCESS_CLEANUP_FAILURE: still running after SIGTERM${opts.force ? ' and SIGKILL' : ''}`
        : `Stopped (${targets.length} process(es) in tree)`,
    });
  }

  saveProcesses(workDir, agent, records);
  getLogger().info('mission', 'processes_stopped', {
    agent, total: outcomes.length, stopped: outcomes.filter((o) => o.result === 'stopped').length,
  });

  return outcomes;
}

/**
 * Processes still running that should not be (§21).
 *
 * A worker cannot report clean completion while owned orphan processes remain, so this
 * is what the completion gate consults.
 *
 * @param agent - Restrict to one agent; otherwise every registered agent is checked.
 */
export function orphanedProcesses(workDir: string, agent?: string): ProcessRecord[] {
  const records = agent ? listProcesses(workDir, agent) : listAllProcesses(workDir);
  return records.filter((r) => r.status !== 'STOPPED' && isProcessAlive(r.pid));
}

/** Drop stopped process records, keeping anything still alive for investigation. */
export function pruneProcessRecords(workDir: string, agent: string): number {
  const records = listProcesses(workDir, agent);
  const kept = records.filter((r) => r.status !== 'STOPPED');
  saveProcesses(workDir, agent, kept);
  return records.length - kept.length;
}

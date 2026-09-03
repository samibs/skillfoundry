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
/** Absolute path of the application catalog. */
export function catalogPath(workDir) {
    return join(aiDir(workDir), APP_CATALOG_FILE);
}
function nowUtc() {
    return new Date().toISOString();
}
function writeJsonAtomic(filePath, value) {
    const dir = join(filePath, '..');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
        renameSync(tmp, filePath);
    }
    catch (err) {
        if (existsSync(tmp)) {
            try {
                unlinkSync(tmp);
            }
            catch { /* best-effort */ }
        }
        throw err;
    }
}
/** Read the catalog, returning an empty one when it does not exist. */
export function readCatalog(workDir) {
    const p = catalogPath(workDir);
    if (!existsSync(p)) {
        return { schema_version: '1.0', updated_at_utc: nowUtc(), applications: [] };
    }
    try {
        const doc = JSON.parse(readFileSync(p, 'utf-8'));
        doc.applications ??= [];
        return doc;
    }
    catch (err) {
        throw new Error(`.ai/app-catalog.json is corrupt: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/** Persist the catalog. */
export function writeCatalog(workDir, catalog) {
    catalog.updated_at_utc = nowUtc();
    writeJsonAtomic(catalogPath(workDir), catalog);
}
/**
 * Add or replace an application entry.
 *
 * @throws {Error} When a port is outside the valid range, or the entry is incomplete.
 */
export function upsertApplication(workDir, app) {
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
    if (idx === -1)
        catalog.applications.push(app);
    else
        catalog.applications[idx] = app;
    writeCatalog(workDir, catalog);
    return catalog;
}
/**
 * Find ports claimed by more than one service (§19).
 *
 * Two agents starting services on the same port produce a failure that looks like a
 * product bug — one service silently fails to bind — so the conflict is surfaced from
 * the catalog before anything starts.
 */
export function detectPortConflicts(catalog) {
    const byPort = new Map();
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
export function serviceForPort(catalog, port) {
    for (const app of catalog.applications) {
        for (const service of app.services) {
            if (service.ports.includes(port))
                return { application: app.name, service };
        }
    }
    return null;
}
/** Absolute path of an agent's process registry file. */
export function processesPath(workDir, agent) {
    return join(aiDir(workDir), PROCESSES_DIR, `${agent}.json`);
}
/**
 * Read the live command line of a PID, for ownership verification.
 *
 * @returns A normalized command string, or null when the process no longer exists.
 */
export function readProcessIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return null;
    // Linux: /proc is authoritative and needs no subprocess.
    const procFile = `/proc/${pid}/cmdline`;
    if (existsSync(procFile)) {
        try {
            const raw = readFileSync(procFile, 'utf-8');
            const normalized = raw.replace(/\0/g, ' ').trim();
            return normalized.length > 0 ? normalized : null;
        }
        catch {
            return null;
        }
    }
    if (process.platform === 'win32')
        return null;
    // macOS and other POSIX: fall back to ps.
    try {
        const out = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
            encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'],
        });
        const trimmed = out.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    catch {
        return null;
    }
}
/** True when a PID exists and the caller may signal it. */
export function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        // EPERM means the process exists but belongs to another user.
        return err.code === 'EPERM';
    }
}
/** Every process recorded for an agent. */
export function listProcesses(workDir, agent) {
    const p = processesPath(workDir, agent);
    if (!existsSync(p))
        return [];
    try {
        const parsed = JSON.parse(readFileSync(p, 'utf-8'));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
/** Every process recorded across every agent. */
export function listAllProcesses(workDir) {
    const dir = join(aiDir(workDir), PROCESSES_DIR);
    if (!existsSync(dir))
        return [];
    const out = [];
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.json'))
            continue;
        out.push(...listProcesses(workDir, file.replace(/\.json$/, '')));
    }
    return out;
}
function saveProcesses(workDir, agent, records) {
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
export function registerProcess(workDir, record) {
    assertMissionId(record.workItem);
    const stored = {
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
/**
 * Verify a recorded PID still refers to the process the agent started.
 *
 * PIDs are recycled. Without this check, cleaning up a long-finished dev server can
 * terminate whatever process inherited its number — on a shared developer machine that
 * is somebody else's work.
 *
 * @returns `{ safe, reason }`. `safe` is false whenever identity cannot be confirmed.
 */
export function verifyProcessOwnership(record) {
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
function childPids(pid) {
    if (process.platform === 'win32' || !existsSync('/proc'))
        return [];
    const children = [];
    try {
        for (const entry of readdirSync('/proc')) {
            if (!/^\d+$/.test(entry))
                continue;
            const statFile = `/proc/${entry}/stat`;
            if (!existsSync(statFile))
                continue;
            try {
                const stat = readFileSync(statFile, 'utf-8');
                // Field 4 is PPID, but the comm field (2) may contain spaces or parens.
                const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
                if (parseInt(afterComm[1], 10) === pid)
                    children.push(parseInt(entry, 10));
            }
            catch {
                // The process exited while we were reading — nothing to do.
            }
        }
    }
    catch {
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
export async function stopOwnedProcesses(workDir, agent, opts = {}) {
    const graceMs = opts.graceMs ?? 2_000;
    const records = listProcesses(workDir, agent);
    const outcomes = [];
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
            if (exited)
                record.stoppedAt = nowUtc();
            continue;
        }
        // Children first, so a supervisor does not restart them after the parent dies.
        const targets = [...childPids(record.pid), record.pid];
        for (const pid of targets) {
            try {
                process.kill(pid, 'SIGTERM');
            }
            catch { /* already gone */ }
        }
        await new Promise((r) => setTimeout(r, graceMs));
        if (isProcessAlive(record.pid) && opts.force) {
            for (const pid of targets) {
                try {
                    process.kill(pid, 'SIGKILL');
                }
                catch { /* already gone */ }
            }
            await new Promise((r) => setTimeout(r, 250));
        }
        const stillAlive = isProcessAlive(record.pid);
        record.status = stillAlive ? 'ORPHANED' : 'STOPPED';
        if (!stillAlive)
            record.stoppedAt = nowUtc();
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
export function orphanedProcesses(workDir, agent) {
    const records = agent ? listProcesses(workDir, agent) : listAllProcesses(workDir);
    return records.filter((r) => r.status !== 'STOPPED' && isProcessAlive(r.pid));
}
/** Drop stopped process records, keeping anything still alive for investigation. */
export function pruneProcessRecords(workDir, agent) {
    const records = listProcesses(workDir, agent);
    const kept = records.filter((r) => r.status !== 'STOPPED');
    saveProcesses(workDir, agent, kept);
    return records.length - kept.length;
}
//# sourceMappingURL=mission-processes.js.map
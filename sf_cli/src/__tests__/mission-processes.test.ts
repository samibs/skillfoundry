import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  readCatalog, writeCatalog, upsertApplication, detectPortConflicts, serviceForPort,
  registerProcess, listProcesses, listAllProcesses, stopOwnedProcesses,
  orphanedProcesses, pruneProcessRecords, verifyProcessOwnership,
  isProcessAlive, readProcessIdentity, processesPath,
} from '../core/mission-processes.js';
import { initLedger, upsertMission, initAiTree } from '../core/mission-ledger.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

const POSIX = process.platform !== 'win32';

let repo: string;
const spawned: ChildProcess[] = [];

/** Start a real long-lived child so ownership checks operate on a genuine PID. */
function startSleeper(seconds = 30): ChildProcess {
  const child = spawn('sleep', [String(seconds)], { stdio: 'ignore', detached: false });
  spawned.push(child);
  return child;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-mission-proc-'));
  initAiTree(repo);
  initLedger(repo, 'demo', 'main');
  upsertMission(repo, 'AF-101', 'Demo');
});

afterEach(() => {
  for (const child of spawned) {
    try { if (child.pid) process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  spawned.length = 0;
  rmSync(repo, { recursive: true, force: true });
});

describe('application catalog (§19)', () => {
  it('returns an empty catalog before anything is registered', () => {
    const catalog = readCatalog(repo);
    expect(catalog.applications).toEqual([]);
  });

  it('records applications, services and their ports', () => {
    const catalog = upsertApplication(repo, {
      name: 'ExampleApp',
      repository: '/apps/example',
      services: [
        { name: 'frontend', path: 'frontend', ports: [4200] },
        { name: 'backend', path: 'backend', ports: [5063, 7024] },
      ],
    });

    expect(catalog.applications.length).toBe(1);
    expect(existsSync(join(repo, '.ai', 'app-catalog.json'))).toBe(true);
    expect(readCatalog(repo).applications[0].services[1].ports).toEqual([5063, 7024]);
  });

  it('replaces an existing application rather than duplicating it', () => {
    upsertApplication(repo, { name: 'App', repository: '/a', services: [] });
    upsertApplication(repo, {
      name: 'App', repository: '/a',
      services: [{ name: 'api', path: 'api', ports: [8080] }],
    });
    const catalog = readCatalog(repo);
    expect(catalog.applications.length).toBe(1);
    expect(catalog.applications[0].services.length).toBe(1);
  });

  it('rejects an out-of-range port', () => {
    expect(() => upsertApplication(repo, {
      name: 'App', repository: '/a',
      services: [{ name: 'api', path: 'api', ports: [99999] }],
    })).toThrow(/invalid port/);
  });

  it('requires a name and repository', () => {
    expect(() => upsertApplication(repo, { name: '', repository: '/a', services: [] }))
      .toThrow(/requires both a name and a repository/);
  });

  it('detects a port claimed by two services (PORT_CONFLICT)', () => {
    upsertApplication(repo, {
      name: 'AppA', repository: '/a', services: [{ name: 'web', path: '.', ports: [4200] }],
    });
    upsertApplication(repo, {
      name: 'AppB', repository: '/b', services: [{ name: 'web', path: '.', ports: [4200] }],
    });

    const conflicts = detectPortConflicts(readCatalog(repo));
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].port).toBe(4200);
    expect(conflicts[0].claimants.sort()).toEqual(['AppA/web', 'AppB/web']);
  });

  it('reports no conflict for disjoint ports', () => {
    upsertApplication(repo, {
      name: 'AppA', repository: '/a', services: [{ name: 'web', path: '.', ports: [4200] }],
    });
    upsertApplication(repo, {
      name: 'AppB', repository: '/b', services: [{ name: 'api', path: '.', ports: [5063] }],
    });
    expect(detectPortConflicts(readCatalog(repo))).toEqual([]);
  });

  it('resolves which service owns a port, so agents never guess topology', () => {
    upsertApplication(repo, {
      name: 'ExampleApp', repository: '/apps/example',
      services: [{ name: 'backend', path: 'backend', ports: [5063] }],
    });

    const found = serviceForPort(readCatalog(repo), 5063);
    expect(found?.application).toBe('ExampleApp');
    expect(found?.service.name).toBe('backend');
    expect(serviceForPort(readCatalog(repo), 9999)).toBeNull();
  });

  it('throws on a corrupt catalog rather than silently resetting it', () => {
    writeFileSync(join(repo, '.ai', 'app-catalog.json'), '{ not json', 'utf-8');
    expect(() => readCatalog(repo)).toThrow(/corrupt/);
  });
});

describe('process identity', () => {
  it('reports no identity for a PID that does not exist', () => {
    expect(readProcessIdentity(0)).toBeNull();
    expect(readProcessIdentity(-1)).toBeNull();
  });

  it.runIf(POSIX)('reads the command line of a live process', () => {
    const child = startSleeper();
    const identity = readProcessIdentity(child.pid!);
    expect(identity).toBeTruthy();
    expect(identity).toMatch(/sleep/);
  });

  it.runIf(POSIX)('tracks liveness accurately', () => {
    const child = startSleeper();
    expect(isProcessAlive(child.pid!)).toBe(true);
    process.kill(child.pid!, 'SIGKILL');
  });

  it('treats an invalid PID as not alive', () => {
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-5)).toBe(false);
  });
});

describe('process ownership registry (§20)', () => {
  it('records the owner, ports and identity fingerprint', () => {
    const record = registerProcess(repo, {
      pid: process.pid, command: 'node', args: ['server.js'],
      cwd: repo, ports: [4200], agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    expect(record.agent).toBe('codex-backend-AF-101');
    expect(record.status).toBe('RUNNING');
    expect(record.ports).toEqual([4200]);
    expect(existsSync(processesPath(repo, 'codex-backend-AF-101'))).toBe(true);
  });

  it('rejects a malformed work item id', () => {
    expect(() => registerProcess(repo, {
      pid: process.pid, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'a-b-c', workItem: '../escape',
    })).toThrow(/Invalid mission ID/);
  });

  it('replaces a record for the same PID rather than duplicating', () => {
    const base = {
      pid: process.pid, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    };
    registerProcess(repo, base);
    registerProcess(repo, { ...base, ports: [9000] });

    const records = listProcesses(repo, 'codex-backend-AF-101');
    expect(records.length).toBe(1);
    expect(records[0].ports).toEqual([9000]);
  });

  it('aggregates processes across every agent', () => {
    registerProcess(repo, {
      pid: process.pid, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });
    registerProcess(repo, {
      pid: process.pid, command: 'ng', args: ['serve'], cwd: repo, ports: [4200],
      agent: 'cursor-frontend-AF-101', workItem: 'AF-101',
    });

    expect(listAllProcesses(repo).length).toBe(2);
    expect(listProcesses(repo, 'nobody')).toEqual([]);
  });
});

describe('ownership verification (§21 — never kill what you do not own)', () => {
  it('refuses to signal a PID whose identity was never captured', () => {
    const record = {
      pid: process.pid, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'a-b-c', workItem: 'AF-101', startedAt: new Date().toISOString(),
      status: 'RUNNING' as const,
    };
    const verdict = verifyProcessOwnership(record);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/No identity fingerprint/);
  });

  it.runIf(POSIX)('refuses to signal a recycled PID running a different command', () => {
    const child = startSleeper();
    const record = registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    // Simulate PID reuse: the fingerprint no longer matches what is running.
    const tampered = { ...record, identity: 'some totally different command line' };
    const verdict = verifyProcessOwnership(tampered);

    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/PID was recycled, refusing to kill/);
  });

  it.runIf(POSIX)('confirms ownership when the fingerprint matches', () => {
    const child = startSleeper();
    const record = registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });
    expect(verifyProcessOwnership(record).safe).toBe(true);
  });

  it('reports a dead process as unsafe to signal', () => {
    const record = {
      pid: 999_999_999, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'a-b-c', workItem: 'AF-101', startedAt: new Date().toISOString(),
      status: 'RUNNING' as const, identity: 'node server.js',
    };
    const verdict = verifyProcessOwnership(record);
    expect(verdict.safe).toBe(false);
    expect(verdict.reason).toMatch(/no longer running/);
  });
});

describe('targeted cleanup (§21)', () => {
  it.runIf(POSIX)('stops a process the agent genuinely owns', async () => {
    const child = startSleeper();
    registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    const outcomes = await stopOwnedProcesses(repo, 'codex-backend-AF-101', { graceMs: 300 });
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].result).toBe('stopped');
    expect(isProcessAlive(child.pid!)).toBe(false);
    expect(listProcesses(repo, 'codex-backend-AF-101')[0].status).toBe('STOPPED');
  });

  it.runIf(POSIX)('refuses a PID that no longer matches, and says why', async () => {
    const child = startSleeper();
    registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    // Tamper with the stored fingerprint to mimic PID reuse.
    const path = processesPath(repo, 'codex-backend-AF-101');
    const records = JSON.parse(readFileSync(path, 'utf-8'));
    records[0].identity = 'a completely unrelated process';
    writeFileSync(path, JSON.stringify(records), 'utf-8');

    const outcomes = await stopOwnedProcesses(repo, 'codex-backend-AF-101', { graceMs: 200 });
    expect(outcomes[0].result).toBe('refused');
    expect(outcomes[0].detail).toMatch(/recycled/);
    // The unrelated process was left strictly alone.
    expect(isProcessAlive(child.pid!)).toBe(true);
  });

  it('reports an already-exited process without attempting to signal it', async () => {
    registerProcess(repo, {
      pid: 999_999_999, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    const outcomes = await stopOwnedProcesses(repo, 'codex-backend-AF-101', { graceMs: 100 });
    expect(outcomes[0].result).toBe('already-exited');
  });

  it('is a no-op for an agent with nothing registered', async () => {
    expect(await stopOwnedProcesses(repo, 'nobody-here-x', { graceMs: 50 })).toEqual([]);
  });
});

describe('orphan reporting (§21)', () => {
  it.runIf(POSIX)('lists a still-running owned process as an orphan', () => {
    const child = startSleeper();
    registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });

    const orphans = orphanedProcesses(repo, 'codex-backend-AF-101');
    expect(orphans.length).toBe(1);
    expect(orphans[0].pid).toBe(child.pid);
  });

  it.runIf(POSIX)('stops reporting it once cleanup succeeded', async () => {
    const child = startSleeper();
    registerProcess(repo, {
      pid: child.pid!, command: 'sleep', args: ['30'], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });
    await stopOwnedProcesses(repo, 'codex-backend-AF-101', { graceMs: 300 });
    expect(orphanedProcesses(repo, 'codex-backend-AF-101')).toEqual([]);
  });

  it('reports nothing when no process was ever registered', () => {
    expect(orphanedProcesses(repo)).toEqual([]);
  });
});

describe('record pruning', () => {
  it('drops stopped records and keeps anything still alive', async () => {
    registerProcess(repo, {
      pid: 999_999_999, command: 'node', args: [], cwd: repo, ports: [],
      agent: 'codex-backend-AF-101', workItem: 'AF-101',
    });
    await stopOwnedProcesses(repo, 'codex-backend-AF-101', { graceMs: 50 });

    expect(pruneProcessRecords(repo, 'codex-backend-AF-101')).toBe(1);
    expect(listProcesses(repo, 'codex-backend-AF-101')).toEqual([]);
  });
});

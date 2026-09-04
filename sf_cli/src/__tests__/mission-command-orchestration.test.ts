import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { missionCommand } from '../commands/mission.js';
import { getMission, readLedger } from '../core/mission-ledger.js';
import { readAgent } from '../core/mission-orchestration.js';
import type { SessionContext } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let root: string;
let repo: string;
let session: SessionContext;

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

async function run(args: string): Promise<string> {
  const out = await missionCommand.execute(args, session);
  // eslint-disable-next-line no-control-regex
  return String(out ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'sf-mission-orch-cmd-'));
  repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# demo\n', 'utf-8');
  g(repo, 'add', '.');
  g(repo, 'commit', '-m', 'initial');

  session = { workDir: repo } as SessionContext;
  await run('init AF-101 --title "Repository model"');
  await run('init AF-201 --title "Fingerprinting"');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('/mission set-baseline', () => {
  it('pins the exact SHA rather than a moving branch name', async () => {
    const out = await run('set-baseline --branch main');
    expect(out).toContain('Baseline recorded');
    expect(readLedger(repo)!.baseline!.sha).toBe(g(repo, 'rev-parse', 'HEAD'));
  });
});

describe('/mission plan', () => {
  it('records dependencies and the write manifest', async () => {
    const out = await run('plan AF-201 --depends "AF-101:HARD" --writes "src/a.ts,src/b.ts" --prd PRD-01 --story STORY-002');

    expect(out).toContain('AF-101(HARD)');
    expect(out).toContain('2 file(s)');
    expect(out).toContain('Not wave-eligible');

    const exec = getMission(repo, 'AF-201')!.execution;
    expect(exec.dependencies).toEqual([{ on: 'AF-101', kind: 'HARD' }]);
    expect(exec.write_manifest).toEqual(['src/a.ts', 'src/b.ts']);
    expect(exec.prd).toBe('PRD-01');
  });

  it('rejects an unknown dependency kind', async () => {
    expect(await run('plan AF-201 --depends "AF-101:PROBABLY"')).toContain('unknown kind');
  });

  it('reports an independent item as wave-eligible', async () => {
    expect(await run('plan AF-101 --writes "src/a.ts"')).toContain('Wave-eligible');
  });
});

describe('/mission agent', () => {
  it('registers a worker and syncs the ledger execution block', async () => {
    const wt = join(root, 'wt-101');
    g(repo, 'worktree', 'add', '-b', 'agent/AF-101', wt, 'main');

    const out = await run(`agent register codex-backend-AF-101 --item AF-101 --mode WRITE --worktree ${wt} --branch agent/AF-101`);
    expect(out).toContain('Agent registered');
    expect(out).toContain('codex');

    expect(readAgent(repo, 'codex-backend-AF-101')!.status).toBe('ACTIVE');
    expect(getMission(repo, 'AF-101')!.execution.agent).toBe('codex-backend-AF-101');
    expect(getMission(repo, 'AF-101')!.execution.base_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('refuses a second writer in the same worktree', async () => {
    const wt = join(root, 'wt-shared');
    g(repo, 'worktree', 'add', '-b', 'agent/shared', wt, 'main');

    await run(`agent register codex-backend-AF-101 --item AF-101 --worktree ${wt}`);
    const out = await run(`agent register claude-backend-AF-201 --item AF-201 --worktree ${wt}`);

    expect(out).toContain('registration refused');
    expect(out).toContain('never share a working directory');
  });

  it('lists agents and flags a forced shared-worktree violation', async () => {
    const wt = join(root, 'wt-v');
    g(repo, 'worktree', 'add', '-b', 'agent/v', wt, 'main');
    await run(`agent register codex-backend-AF-101 --item AF-101 --worktree ${wt}`);
    await run(`agent register claude-backend-AF-201 --item AF-201 --worktree ${wt} --force`);

    const out = await run('agent list');
    expect(out).toContain('SHARED WORKTREE VIOLATION');
    expect(out).toContain('codex-backend-AF-101');
  });

  it('refuses release while owned processes are still running', async () => {
    await run('agent register codex-backend-AF-101 --item AF-101 --mode READ_ONLY');
    await run(`proc register --pid ${process.pid} --agent codex-backend-AF-101 --item AF-101 --command "node server.js"`);

    const out = await run('agent release codex-backend-AF-101');
    expect(out).toContain('Release refused');
    expect(out).toContain('§21');
  });

  it('rejects a malformed agent name', async () => {
    expect(await run('agent register ../evil --item AF-101')).toContain('Invalid agent name');
  });

  it('explains that anonymous subagents are prohibited when none are registered', async () => {
    expect(await run('agent list')).toContain('Anonymous subagents are prohibited');
  });
});

describe('/mission wave', () => {
  it('plans a collision-free wave and defers the colliding item', async () => {
    await run('plan AF-101 --writes "src/routes.ts"');
    await run('plan AF-201 --writes "src/routes.ts"');

    const out = await run('wave plan');
    expect(out).toContain('Dispatch (1)');
    expect(out).toContain('Deferred to a later wave (1)');
    expect(out).toContain('HARD_COLLISION');
  });

  it('dispatches a wave and refuses a second while it is open', async () => {
    await run('plan AF-101 --writes "src/a.ts"');
    await run('plan AF-201 --writes "src/b.ts"');

    expect(await run('wave dispatch WAVE-01 --items "AF-101"')).toContain('Wave WAVE-01 dispatched');
    expect(await run('wave dispatch WAVE-02 --items "AF-201"')).toContain('still active');
  });

  it('refuses to close a wave with work ambiguously in flight (§39)', async () => {
    await run('wave dispatch WAVE-01 --items "AF-101,AF-201"');
    await run('exec AF-101 IN_PROGRESS');

    const out = await run('wave complete WAVE-01');
    expect(out).toContain('cannot close');
    expect(out).toContain('ambiguously IN_PROGRESS');
  });

  it('closes once every item is resolved', async () => {
    await run('wave dispatch WAVE-01 --items "AF-101"');
    await run('block AF-101 DEPENDENCY_BLOCKED --detail "upstream missing"');
    expect(await run('wave complete WAVE-01')).toContain('Wave WAVE-01 complete');
  });

  it('surfaces a dependency cycle instead of scheduling arbitrarily', async () => {
    await run('plan AF-101 --depends "AF-201:HARD"');
    await run('plan AF-201 --depends "AF-101:HARD"');

    const out = await run('wave plan');
    expect(out).toContain('Dependency cycle');
    expect(out).toContain('AF-101');
  });

  it('orders integration by dependency, not completion time', async () => {
    await run('plan AF-201 --depends "AF-101:HARD"');
    const out = await run('wave order --items "AF-201,AF-101"');
    expect(out.indexOf('AF-101')).toBeLessThan(out.indexOf('AF-201'));
    expect(out).toContain('not worker completion time');
  });

  it('reports orchestration status including dangling dependencies', async () => {
    await run('plan AF-101 --depends "AF-999:HARD"');
    const out = await run('wave status');
    expect(out).toContain('Dangling dependencies');
    expect(out).toContain('AF-101 → AF-999');
  });
});

describe('/mission exec', () => {
  it('refuses INTEGRATION_READY without a worker commit (§32)', async () => {
    const out = await run('exec AF-101 INTEGRATION_READY');
    expect(out).toContain('Refused');
    expect(out).toContain('requires a worker commit');
  });

  it('advances once a commit exists', async () => {
    writeFileSync(join(repo, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    g(repo, 'add', 'src.ts');
    g(repo, 'commit', '-m', 'feat: x');
    await run('commit AF-101');

    expect(await run('exec AF-101 INTEGRATION_READY')).toContain('INTEGRATION_READY');
  });

  it('rejects a vague status', async () => {
    expect(await run('exec AF-101 almost-done')).toContain('Unknown execution status');
  });
});

describe('/mission block', () => {
  it('records a failure code and drops the item to BLOCKED', async () => {
    const out = await run('block AF-101 ENVIRONMENT_FAILURE --detail "dotnet SDK missing"');
    expect(out).toContain('ENVIRONMENT_FAILURE');
    expect(out).toContain('not disguised as partial success');
    expect(getMission(repo, 'AF-101')!.execution.status).toBe('BLOCKED');
  });

  it('rejects an invented failure code', async () => {
    expect(await run('block AF-101 SOMETHING_ODD --detail x')).toContain('Unknown failure code');
  });

  it('clears blockers on request', async () => {
    await run('block AF-101 TEST_FAILURE --detail "red"');
    expect(await run('block AF-101 --clear')).toContain('Blockers cleared');
    expect(getMission(repo, 'AF-101')!.execution.blockers).toEqual([]);
  });
});

describe('/mission catalog', () => {
  it('registers services and their ports', async () => {
    const out = await run('catalog add ExampleApp --repository /apps/example --services "frontend:frontend:4200,backend:backend:5063"');
    expect(out).toContain('frontend');
    expect(out).toContain('4200');
    expect(existsSync(join(repo, '.ai', 'app-catalog.json'))).toBe(true);
  });

  it('flags a port claimed twice', async () => {
    await run('catalog add AppA --repository /a --services "web:.:4200"');
    const out = await run('catalog add AppB --repository /b --services "web:.:4200"');
    expect(out).toContain('PORT_CONFLICT');
    expect(out).toContain('4200');
  });

  it('resolves a port back to its owning service', async () => {
    await run('catalog add ExampleApp --repository /a --services "backend:backend:5063"');
    expect(await run('catalog port 5063')).toContain('ExampleApp/backend');
    expect(await run('catalog port 9999')).toContain('not claimed');
  });

  it('explains the catalog rule when empty', async () => {
    expect(await run('catalog list')).toContain('before starting or killing services');
  });
});

describe('/mission proc', () => {
  it('registers an owned process with an identity fingerprint', async () => {
    const out = await run(`proc register --pid ${process.pid} --agent codex-backend-AF-101 --item AF-101 --command "node server.js" --ports 4200`);
    expect(out).toContain('Process registered');
    expect(out).toContain('codex-backend-AF-101');
    expect(out).toContain('captured');
  });

  it('lists owned processes', async () => {
    await run(`proc register --pid ${process.pid} --agent codex-backend-AF-101 --item AF-101 --command "node server.js"`);
    const out = await run('proc list');
    expect(out).toContain(String(process.pid));
    expect(out).toContain('codex-backend-AF-101');
  });

  it('explains the ownership rule when nothing is registered', async () => {
    expect(await run('proc list')).toContain('must have an owner');
  });

  it('reports no orphans on a clean slate', async () => {
    expect(await run('proc orphans')).toContain('No owned process outlived its agent');
  });

  it('reports a dead PID as already-exited rather than killing anything', async () => {
    await run('proc register --pid 999999999 --agent codex-backend-AF-101 --item AF-101 --command "node ghost.js"');
    const out = await run('proc stop codex-backend-AF-101');
    expect(out).toContain('already-exited');
    expect(out).toContain('Broad machine-wide killing is prohibited');
  });

  it('requires the full registration arguments', async () => {
    expect(await run('proc register --pid 123')).toContain('Usage: /mission proc register');
  });
});

describe('/mission integrate', () => {
  it('requires provenance before recording an integration', async () => {
    expect(await run('integrate AF-101')).toContain('No provenance record');
  });

  it('records the integration and advances the execution status', async () => {
    writeFileSync(join(repo, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    g(repo, 'add', 'src.ts');
    g(repo, 'commit', '-m', 'feat: x');

    await run('commit AF-101');
    await run('provenance AF-101 --integration main');

    // Governance must validate before the scheduler may say INTEGRATED.
    const out = await run('integrate AF-101');
    expect(out).toContain('Integration recorded');
    expect(out).toContain('PRESERVED');
    expect(out).toContain('Execution status NOT advanced');

    expect(readLedger(repo)!.integrations.length).toBe(1);
  });
});

describe('usage', () => {
  it('documents the orchestration surface', async () => {
    const out = await run('help');
    expect(out).toContain('Multi-agent orchestration');
    expect(out).toContain('Runtime ownership');
    expect(out).toContain('Parallel implementation is not parallel merging');
  });
});

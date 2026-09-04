import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { missionCommand } from '../commands/mission.js';
import { getMission, readLedger } from '../core/mission-ledger.js';
import type { SessionContext } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let repo: string;
let session: SessionContext;

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** Run the command and strip ANSI so assertions read against plain text. */
async function run(args: string): Promise<string> {
  const out = await missionCommand.execute(args, session);
  // eslint-disable-next-line no-control-regex
  return String(out ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-mission-cmd-'));
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# demo\n', 'utf-8');
  g(repo, 'add', '.');
  g(repo, 'commit', '-m', 'initial');

  session = { workDir: repo } as SessionContext;
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('argument parsing', () => {
  it('honours quoted flag values', async () => {
    await run('init STORY-001 --title "Multi word mission title"');
    expect(getMission(repo, 'STORY-001')!.title).toBe('Multi word mission title');
  });

  it('honours --flag=value form', async () => {
    await run('init STORY-001 --title=Compact');
    expect(getMission(repo, 'STORY-001')!.title).toBe('Compact');
  });
});

describe('/mission init', () => {
  it('scaffolds the ledger, artifact tree, and a populated patch guide', async () => {
    const out = await run('init STORY-001 --title "Add login"');

    expect(out).toContain('Mission STORY-001 registered');
    expect(existsSync(join(repo, '.ai', 'ledger.json'))).toBe(true);
    for (const d of ['attestations', 'patches', 'evidence', 'decisions', 'design']) {
      expect(existsSync(join(repo, '.ai', d))).toBe(true);
    }

    const guide = readFileSync(join(repo, '.ai', 'patches', 'STORY-001.md'), 'utf-8');
    expect(guide).toContain('# STORY-001 Patch Guide');
    expect(guide).toContain('Add login');
    // The scaffold carries real baseline values, not empty placeholders.
    expect(guide).toMatch(/SHA: `[0-9a-f]{40}`/);
    expect(guide).toMatch(/Tree: `[0-9a-f]{40}`/);
  });

  it('rejects a mission id that would escape .ai/', async () => {
    const out = await run('init ../../etc/passwd');
    expect(out).toContain('Invalid mission ID');
  });

  it('requires a mission id', async () => {
    expect(await run('init')).toContain('Usage: /mission init');
  });
});

describe('/mission attest and gate', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('blocks writes before anything is attested', async () => {
    expect(await run('gate STORY-001')).toContain('WRITES BLOCKED');
  });

  it('fails attestation in the main checkout by default', async () => {
    const out = await run('attest STORY-001 --worker w1 --agent claude');
    expect(out).toContain('FAIL');
    expect(out).toContain('main checkout');
    expect(await run('gate STORY-001')).toContain('WRITES BLOCKED');
  });

  it('authorizes writes after a passing attestation', async () => {
    const out = await run('attest STORY-001 --worker w1 --agent claude --allow-main');
    expect(out).toContain('PASS');
    expect(await run('gate STORY-001')).toContain('WRITES AUTHORIZED');
    expect(getMission(repo, 'STORY-001')!.implementation_status).toBe('IN_PROGRESS');
    expect(getMission(repo, 'STORY-001')!.attestations.length).toBe(1);
  });

  it('records an unrecognised agent as unknown rather than inventing one', async () => {
    await run('attest STORY-001 --worker w1 --agent llama-9000 --allow-main');
    const att = JSON.parse(readFileSync(join(repo, '.ai', 'attestations', 'STORY-001-w1.json'), 'utf-8'));
    expect(att.agent).toBe('unknown');
  });
});

describe('/mission commit', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('records the worker SHA, stable patch id and changed-file manifest', async () => {
    writeFileSync(join(repo, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    g(repo, 'add', '.');
    g(repo, 'commit', '-m', 'feat: x');

    const out = await run('commit STORY-001');
    expect(out).toContain('Stable patch ID');
    expect(out).toContain('src.ts');

    const mission = getMission(repo, 'STORY-001')!;
    expect(mission.worker_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(mission.stable_patch_id).toBeTruthy();
  });

  it('reports an unresolvable ref instead of guessing', async () => {
    expect(await run('commit STORY-001 --sha nope')).toContain('Could not resolve');
  });
});

describe('/mission evidence', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('runs a command, records bounded evidence and attaches it', async () => {
    const out = await run('evidence STORY-001 --kind tests --run "node -e console.log(\'Tests  3 passed\')"');

    expect(out).toContain('CLEAN VALIDATION');
    expect(out).toContain('Normal termination');
    expect(existsSync(join(repo, '.ai', 'evidence', 'STORY-001', 'tests.json'))).toBe(true);
    expect(getMission(repo, 'STORY-001')!.evidence)
      .toContain(join('.ai', 'evidence', 'STORY-001', 'tests.json'));
  });

  it('reports a failing run as NOT clean and classifies the failure', async () => {
    const out = await run('evidence STORY-001 --kind tests --run "node -e process.exit(1)"');
    expect(out).toContain('NOT A CLEAN VALIDATION');
    expect(out).toContain('Failure classification');
  });

  it('imports a payload from a file', async () => {
    writeFileSync(join(repo, 'sec.json'), JSON.stringify({ findings: [] }), 'utf-8');
    const out = await run('evidence STORY-001 --kind security --file sec.json');
    expect(out).toContain('Evidence recorded');
    expect(existsSync(join(repo, '.ai', 'evidence', 'STORY-001', 'security.json'))).toBe(true);
  });

  it('flags a zero-exit test run that ran no tests', async () => {
    const out = await run('evidence STORY-001 --kind tests --run "node -e console.log(1)"');
    expect(out).toContain('NOT A CLEAN VALIDATION');
    expect(out).toContain('No test results were detected');
  });

  it('rejects an unknown evidence kind', async () => {
    const out = await run('evidence STORY-001 --kind vibes --run "node -e 0"');
    expect(out).toContain('Unknown evidence kind');
  });

  it('requires either --run or --file', async () => {
    expect(await run('evidence STORY-001 --kind tests')).toContain('Provide either --run');
  });
});

describe('monorepo support', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('resolves the ledger from a package subdirectory, not the cwd', async () => {
    mkdirSync(join(repo, 'packages', 'api'), { recursive: true });
    const sub = { workDir: join(repo, 'packages', 'api') } as SessionContext;

    const out = String(await missionCommand.execute('status', sub)).replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toContain('STORY-001');
    // The ledger stays at the repository root — no second .ai/ tree is created.
    expect(existsSync(join(repo, 'packages', 'api', '.ai'))).toBe(false);
  });

  it('runs a validation command in --cwd while recording evidence at the root', async () => {
    mkdirSync(join(repo, 'packages', 'api'), { recursive: true });
    writeFileSync(join(repo, 'packages', 'api', 'marker.txt'), 'here\n', 'utf-8');

    const out = await run('evidence STORY-001 --kind tests --cwd packages/api --run "ls marker.txt"');
    expect(out).toContain('CLEAN VALIDATION');

    const record = JSON.parse(readFileSync(join(repo, '.ai', 'evidence', 'STORY-001', 'tests.json'), 'utf-8'));
    // The raw artifact path is normalised to be resolvable from the repository root.
    expect(record.payload.raw_artifact).toContain('packages/api');
    expect(existsSync(join(repo, record.payload.raw_artifact))).toBe(true);
  });

  it('rejects a --cwd that does not exist', async () => {
    expect(await run('evidence STORY-001 --kind tests --cwd nope --run "ls"'))
      .toContain('--cwd directory does not exist');
  });
});

describe('/mission ac', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('loads a criteria matrix from JSON', async () => {
    writeFileSync(join(repo, 'ac.json'), JSON.stringify([
      { id: 'AC1', requirement: 'Login works', disposition: 'PASS', evidence: [] },
      { id: 'AC2', requirement: 'Staging run', disposition: 'EXTERNAL_VALIDATION_REQUIRED', evidence: [] },
    ]), 'utf-8');

    const out = await run('ac STORY-001 --file ac.json');
    expect(out).toContain('AC1');
    expect(out).toContain('EXTERNAL_VALIDATION_REQUIRED');
    expect(getMission(repo, 'STORY-001')!.acceptance_criteria.length).toBe(2);
  });

  it('rejects a disposition outside the vocabulary', async () => {
    writeFileSync(join(repo, 'ac.json'), JSON.stringify([
      { id: 'AC1', requirement: 'x', disposition: 'looks good', evidence: [] },
    ]), 'utf-8');
    expect(await run('ac STORY-001 --file ac.json')).toContain('unknown disposition');
  });
});

describe('/mission set — evidence gating at the CLI', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('refuses an unproven promotion and explains what is missing', async () => {
    const out = await run('set STORY-001 implementation_status COMPLETE');
    expect(out).toContain('Refused');
    expect(out).toContain('never claim more than evidence proves');
    expect(getMission(repo, 'STORY-001')!.implementation_status).toBe('NOT_STARTED');
  });

  it('records a forced promotion together with the bypassed claims', async () => {
    const out = await run('set STORY-001 implementation_status COMPLETE --force');
    expect(out).toContain('FORCED');
    expect(getMission(repo, 'STORY-001')!.implementation_status).toBe('COMPLETE');
  });

  it('rejects an unknown dimension and lists the legal ones', async () => {
    const out = await run('set STORY-001 vibes_status PASS');
    expect(out).toContain('Unknown dimension');
    expect(out).toContain('implementation_status');
  });

  it('rejects a status that belongs to another phase', async () => {
    expect(await run('set STORY-001 publication_status PASS')).toContain('not valid for publication_status');
  });
});

describe('/mission gap', () => {
  beforeEach(async () => { await run('init STORY-001 --title "Demo"'); });

  it('opens, lists and closes a gap', async () => {
    const opened = await run('gap open --mission STORY-001 --type EXTERNAL_VALIDATION --desc "Needs staging" --blocks');
    expect(opened).toContain('GAP-001 opened');
    expect(opened).toContain('BLOCKS ACCEPTANCE');

    expect(await run('gap list')).toContain('GAP-001');
    expect(await run('gap close GAP-001')).toContain('GAP-001 closed');
    expect(await run('gap list')).toContain('No open gaps');
  });

  it('requires a mission and description to open one', async () => {
    expect(await run('gap open --mission STORY-001')).toContain('Usage: /mission gap open');
  });
});

describe('/mission collide', () => {
  it('escalates a shared architectural primitive to HARD_COLLISION', async () => {
    const out = await run('collide --a "w1:src/routes.ts,src/a.ts" --b "w2:src/routes.ts"');
    expect(out).toContain('HARD_COLLISION');
    expect(out).toContain('SERIALIZE');
    expect(out).toContain('architectural hotspot');
  });

  it('reports NONE for disjoint manifests', async () => {
    const out = await run('collide --a "w1:src/a.ts" --b "w2:src/b.ts"');
    expect(out).toContain('NONE');
  });
});

describe('/mission verify — Definition of Done', () => {
  it('reports every unmet gate and an explicit disposition', async () => {
    await run('init STORY-001 --title "Demo"');
    const out = await run('verify STORY-001');

    expect(out).toContain('Definition of Done');
    expect(out).toContain('Worker attestation recorded');
    expect(out).toContain('Normal termination proven');
    expect(out).toContain('Disposition:');
    expect(out).toContain('NOT_INTEGRATION_READY');
  });

  it('reaches COMPLETE — INTEGRATION_READY once every gate is satisfied', async () => {
    await run('init STORY-001 --title "Demo"');
    await run('attest STORY-001 --worker w1 --agent claude --allow-main');

    writeFileSync(join(repo, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    g(repo, 'add', '.');
    g(repo, 'commit', '-m', 'feat: x');

    await run('commit STORY-001');
    await run('evidence STORY-001 --kind tests --run "node -e console.log(1)"');

    writeFileSync(join(repo, 'ac.json'), JSON.stringify([
      { id: 'AC1', requirement: 'x', disposition: 'PASS', evidence: [] },
    ]), 'utf-8');
    await run('ac STORY-001 --file ac.json');
    await run('set STORY-001 implementation_status COMPLETE');

    const out = await run('verify STORY-001');
    expect(out).toContain('COMPLETE — INTEGRATION_READY');
  });
});

describe('/mission report', () => {
  it('renders a structured report with every AC retained', async () => {
    await run('init STORY-001 --title "Add login"');
    writeFileSync(join(repo, 'ac.json'), JSON.stringify([
      { id: 'AC1', requirement: 'Login works', disposition: 'PASS', evidence: [] },
      { id: 'AC2', requirement: 'Audit log', disposition: 'IMPLEMENTATION_GAP', evidence: [], note: 'deferred' },
    ]), 'utf-8');
    await run('ac STORY-001 --file ac.json');

    const out = await run('report STORY-001');
    expect(out).toContain('# STORY-001 — Implementation Report');
    // §5: no AC may disappear from the final report.
    expect(out).toContain('AC1');
    expect(out).toContain('AC2');
    expect(out).toContain('IMPLEMENTATION_GAP');
    expect(out).toContain('## Recommendation');
  });

  it('writes the report to a file when --out is given', async () => {
    await run('init STORY-001 --title "Demo"');
    const out = await run('report STORY-001 --out docs/report.md');
    expect(out).toContain('Report written');
    expect(readFileSync(join(repo, 'docs', 'report.md'), 'utf-8')).toContain('# STORY-001');
  });
});

describe('/mission reconcile (§49)', () => {
  it('is quiet when the ledger is substantiated', async () => {
    await run('init STORY-001 --title "Demo"');
    expect(await run('reconcile')).toContain('claims are substantiated');
  });

  it('flags a forced claim the repository cannot back up', async () => {
    await run('init STORY-001 --title "Demo"');
    await run('set STORY-001 implementation_status COMPLETE --force');

    const out = await run('reconcile');
    expect(out).toContain('unsubstantiated claim');
    expect(out).toContain('The ledger is stale');
    expect(out).toContain('never rewrite reality');
  });
});

describe('/mission status and help', () => {
  it('explains how to start when no ledger exists', async () => {
    expect(await run('status')).toContain('No .ai/ledger.json');
  });

  it('shows every lifecycle dimension once missions exist', async () => {
    await run('init STORY-001 --title "Demo"');
    const out = await run('status');
    expect(out).toContain('STORY-001');
    expect(out).toContain('IMPL');
    expect(out).toContain('PUBLICATION');
  });

  it('prints usage for an unknown subcommand', async () => {
    const out = await run('flibbertigibbet');
    expect(out).toContain('Unknown subcommand');
    expect(out).toContain('Governed Development Mission Protocol');
  });
});

describe('non-git guard', () => {
  it('refuses to run governed subcommands outside a repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'sf-mission-plain-'));
    try {
      const out = await missionCommand.execute('init STORY-001', { workDir: plain } as SessionContext);
      expect(String(out)).toContain('Not a git repository');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('baseline', () => {
  it('reports UNKNOWN freshness with no remote, without failing', async () => {
    const out = await run('baseline');
    expect(out).toContain('Freshness:');
    expect(out).toContain('UNKNOWN');
    expect(out).toContain('No "origin" remote');
  });
});

describe('provenance', () => {
  it('proves PRESERVED for a contribution present in the tree', async () => {
    await run('init STORY-001 --title "Demo"');
    writeFileSync(join(repo, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    g(repo, 'add', '.');
    g(repo, 'commit', '-m', 'feat: x');
    await run('commit STORY-001');

    const out = await run('provenance STORY-001 --integration main');
    expect(out).toContain('PROVENANCE PASS');
    expect(out).toContain('PRESERVED');
    expect(out).toContain('DIRECT_ANCESTRY');
    expect(getMission(repo, 'STORY-001')!.provenance?.final_tree_contribution).toBe('PRESERVED');
  });

  it('blocks when the contribution is not in the integration tree', async () => {
    // The ledger belongs to the baseline, so it survives a branch switch — a worker
    // branch that carries the only copy would take the governance record with it.
    await run('init STORY-001 --title "Demo"');
    g(repo, 'add', '.ai');
    g(repo, 'commit', '-m', 'chore: register mission');

    g(repo, 'checkout', '-b', 'feature');
    writeFileSync(join(repo, 'feature.ts'), 'export const y = 2;\n', 'utf-8');
    g(repo, 'add', 'feature.ts');
    g(repo, 'commit', '-m', 'feat: y');
    const workerSha = g(repo, 'rev-parse', 'HEAD');

    g(repo, 'checkout', '-f', 'main');

    const out = await run(`provenance STORY-001 --worker ${workerSha} --integration main`);
    expect(out).toContain('PROVENANCE BLOCKED');
    expect(out).toContain('LOST');
  });

  it('requires a worker SHA', async () => {
    await run('init STORY-001 --title "Demo"');
    expect(await run('provenance STORY-001')).toContain('No worker SHA');
  });
});

describe('publish-check (§37)', () => {
  it('reports PUBLICATION_FAILED when the remote ref is absent', async () => {
    await run('init STORY-001 --title "Demo"');
    const out = await run('publish-check STORY-001 --branch main --no-fetch');
    expect(out).toContain('PUBLICATION_FAILED');
  });
});

describe('ledger document', () => {
  it('records the project and authoritative branch', async () => {
    await run('init STORY-001 --title "Demo" --project acme --branch main');
    const ledger = readLedger(repo)!;
    expect(ledger.project).toBe('acme');
    expect(ledger.authoritative_branch).toBe('main');
    expect(ledger.schema_version).toBe('1.0');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { deliveryCommand } from '../commands/delivery.js';
import { costCommand } from '../commands/cost.js';
import {
  assignBudget, chooseTestScope, shouldRunValidation, checkCompletion,
  loadDeliverySettings, deliverySettings,
} from '../core/delivery.js';
import { recordEvidence } from '../core/delivery-evidence.js';
import { DEFAULT_DELIVERY_EFFICIENCY, loadConfig } from '../core/config.js';
import type { SessionContext, SfConfig } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let repo: string;
let session: SessionContext;

function g(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim();
}

function write(rel: string, content: string): void {
  const abs = join(repo, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

/** Run /delivery and strip ANSI so assertions read against plain text. */
async function run(args: string): Promise<string> {
  const out = await deliveryCommand.execute(args, session);
  // eslint-disable-next-line no-control-regex
  return String(out ?? '').replace(/\x1b\[[0-9;]*m/g, '');
}

/** Write a [delivery_efficiency] section into the workspace config. */
function configure(toml: string): void {
  mkdirSync(join(repo, '.skillfoundry'), { recursive: true });
  writeFileSync(join(repo, '.skillfoundry', 'config.toml'), toml, 'utf-8');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-delivery-cmd-'));
  g('init', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
  write('.gitignore', '.skillfoundry/\n');
  write('src/a.ts', 'export const a = 1;\n');
  g('add', '.');
  g('commit', '-m', 'initial');
  session = { workDir: repo, messages: [], config: {} as SfConfig } as SessionContext;
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('/delivery budget', () => {
  it('classifies and shows the execution policy', async () => {
    const out = await run('budget "fix a typo in the readme" --files README.md');
    expect(out).toContain('LOW');
    expect(out).toContain('Execution policy');
    expect(out).toContain('smoke');
  });

  it('marks safety-critical work and says the checks cannot be skipped', async () => {
    const out = await run('budget "update the login session handling" --files src/auth/session.ts');
    expect(out).toContain('HIGH');
    expect(out).toContain('Safety-critical');
    expect(out).toContain('cannot be skipped');
  });

  it('refuses a downgrade override on safety-critical work', async () => {
    const out = await run('budget "auth tweak" --files src/auth/x.ts --override LOW');
    expect(out).toContain('HIGH');
    expect(out).toMatch(/refused/i);
  });

  it('rejects an unknown override', async () => {
    expect(await run('budget "x" --override URGENT')).toContain('Unknown override');
  });

  it('requires task text or files', async () => {
    expect(await run('budget')).toContain('Usage: /delivery budget');
  });
});

describe('/delivery scope', () => {
  it('explains the scope decision and what it avoided', async () => {
    const out = await run('scope --budget MEDIUM');
    expect(out).toContain('targeted');
    expect(out).toContain('Why');
    expect(out).toContain('Not run');
  });

  it('widens at the integration gate rather than per worker', async () => {
    const out = await run('scope --budget HIGH --gate');
    expect(out).toContain('full');
    expect(out).toContain('instead of per worker');
  });

  it('refuses an override that would under-test a HIGH change', async () => {
    const out = await run('scope --budget HIGH --override smoke');
    expect(out).toContain('Override refused');
  });

  it('rejects an unknown scope', async () => {
    expect(await run('scope --budget LOW --override everything')).toContain('Unknown scope');
  });

  it('requires a budget', async () => {
    expect(await run('scope')).toContain('--budget is required');
  });
});

describe('/delivery check and evidence', () => {
  it('says RUN on a first encounter, then REUSE once proven', async () => {
    const first = await run('check --kind test --command "npm test" --files src/a.ts');
    expect(first).toContain('RUN');

    recordEvidence(repo, {
      kind: 'test', command: 'npm test', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });

    const second = await run('check --kind test --command "npm test" --files src/a.ts');
    expect(second).toContain('REUSE');
    expect(second).toContain('already proven');
  });

  it('reports FIX_FIRST rather than re-running a known failure', async () => {
    recordEvidence(repo, {
      kind: 'build', command: 'npm run build', result: 'FAIL', exitCode: 1,
      scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    expect(await run('check --kind build --command "npm run build"')).toContain('FIX_FIRST');
  });

  it('lists and clears the evidence store', async () => {
    recordEvidence(repo, { kind: 'lint', command: 'eslint .', result: 'PASS', producedBy: 'T' });
    expect(await run('evidence list')).toContain('lint');
    expect(await run('evidence clear')).toContain('cleared');
    expect(await run('evidence list')).toContain('No validation evidence');
  });

  it('rejects an unknown validation kind', async () => {
    expect(await run('check --kind vibes --command "x"')).toContain('Unknown validation kind');
  });
});

describe('/delivery complete', () => {
  it('reports outstanding criteria when the task is not done', async () => {
    const out = await run('complete --budget MEDIUM --implemented');
    expect(out).toContain('NOT COMPLETE');
    expect(out).toContain('validation-passed');
  });

  it('reports complete and tells the agent to stop', async () => {
    const out = await run(
      'complete --budget MEDIUM --implemented --diff-inspected --evidence-recorded ' +
      '--ac-proven 2 --ac-total 2 --passed-at targeted --required-scope targeted',
    );
    expect(out).toContain('DELIVERY COMPLETE');
    expect(out).toContain('Do not re-read the same unchanged diff');
  });

  it('will not complete a HIGH task without security checks', async () => {
    const out = await run(
      'complete --budget HIGH --implemented --diff-inspected --evidence-recorded ' +
      '--ac-proven 1 --ac-total 1 --passed-at integration --required-scope integration',
    );
    expect(out).toContain('NOT COMPLETE');
    expect(out).toContain('security-checks');
  });
});

describe('/delivery status, context, gate, efficiency', () => {
  it('shows the effective settings', async () => {
    const out = await run('status');
    expect(out).toContain('Delivery Efficiency');
    expect(out).toContain('Default budget');
    expect(out).toContain('MEDIUM');
  });

  it('reports an empty mission context', async () => {
    expect(await run('context')).toContain('Mission context');
  });

  it('says there is nothing to integrate with no handoffs', async () => {
    expect(await run('gate')).toContain('No worker handoffs');
  });

  it('emits machine-readable efficiency data', async () => {
    const out = await run('efficiency --json');
    const parsed = JSON.parse(out);
    expect(parsed.totals.tasks).toBe(0);
  });

  it('prints usage for an unknown subcommand', async () => {
    const out = await run('flibbertigibbet');
    expect(out).toContain('Unknown subcommand');
    expect(out).toContain('Delivery Efficiency');
    expect(out).toMatch(/necessary to prove the change correct/);
  });

  it('refuses outside a git repository, since evidence is anchored to repo state', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'sf-plain-'));
    try {
      const out = String(await deliveryCommand.execute('status', { workDir: plain } as SessionContext));
      expect(out).toContain('Not a git repository');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('works from a package subdirectory, resolving to the repository root', async () => {
    mkdirSync(join(repo, 'packages', 'api'), { recursive: true });
    const sub = { workDir: join(repo, 'packages', 'api') } as SessionContext;
    const out = String(await deliveryCommand.execute('status', sub)).replace(/\x1b\[[0-9;]*m/g, '');
    expect(out).toContain('Delivery Efficiency');
    expect(existsSync(join(repo, 'packages', 'api', '.skillfoundry'))).toBe(false);
  });
});

describe('$cost efficiency view (§7, §15)', () => {
  it('renders the efficiency report', async () => {
    const out = String(await costCommand.execute('--efficiency', session));
    expect(out).toContain('Delivery Efficiency');
    expect(out).toContain('Evidence reuse rate');
  });

  it('emits JSON on request', async () => {
    const out = String(await costCommand.execute('--efficiency --json', session));
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe('configuration and backward compatibility (§20, §23)', () => {
  it('defaults to enabled with safe settings', () => {
    expect(DEFAULT_DELIVERY_EFFICIENCY.enabled).toBe(true);
    expect(DEFAULT_DELIVERY_EFFICIENCY.default_budget).toBe('MEDIUM');
    expect(DEFAULT_DELIVERY_EFFICIENCY.test_scope_policy).toBe('risk-based');
  });

  it('fills defaults for a config written before this layer existed', () => {
    configure('provider = "anthropic"\n');
    const settings = loadDeliverySettings(repo);
    expect(settings.enabled).toBe(true);
    expect(settings.default_budget).toBe('MEDIUM');
  });

  it('reads a partial [delivery_efficiency] table without losing other defaults', () => {
    configure('[delivery_efficiency]\ndefault_budget = "LOW"\n');
    const settings = loadDeliverySettings(repo);
    expect(settings.default_budget).toBe('LOW');
    expect(settings.evidence_reuse).toBe(true);
  });

  it('ignores invalid values rather than adopting them', () => {
    configure('[delivery_efficiency]\ndefault_budget = "URGENT"\ntest_scope_policy = "guess"\n');
    const settings = loadDeliverySettings(repo);
    expect(settings.default_budget).toBe('MEDIUM');
    expect(settings.test_scope_policy).toBe('risk-based');
  });

  it('does not disturb existing config fields', () => {
    configure('provider = "openai"\nmonthly_budget_usd = 99\n');
    const config = loadConfig(repo);
    expect(config.monthly_budget_usd).toBe(99);
    expect(config.delivery_efficiency?.enabled).toBe(true);
  });

  describe('when disabled, behavior matches the pre-existing framework', () => {
    beforeEach(() => configure('[delivery_efficiency]\nenabled = false\n'));

    it('treats every task as HIGH', () => {
      const b = assignBudget(repo, { text: 'fix a typo', changedFiles: ['README.md'] });
      expect(b.level).toBe('HIGH');
      expect(b.reason).toMatch(/disabled/);
    });

    it('runs the full scope', () => {
      expect(chooseTestScope(repo, { budget: 'LOW' }).scope).toBe('full');
    });

    it('never reuses evidence', () => {
      recordEvidence(repo, {
        kind: 'test', command: 'npm test', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
      });
      expect(shouldRunValidation(repo, { kind: 'test', command: 'npm test' }, 'w').action).toBe('RUN');
    });

    it('reports completion but never enforces the stop', () => {
      const v = checkCompletion(repo, {
        budget: 'LOW', implementationComplete: true, validationPassedAtScope: 'smoke',
        requiredScope: 'smoke', diffInspected: true, evidenceRecorded: true,
      });
      expect(v.complete).toBe(false);
      expect(v.stopGuidance.join(' ')).toMatch(/disabled/);
    });
  });

  it('always-full restores unconditional repository-wide testing', () => {
    configure('[delivery_efficiency]\ntest_scope_policy = "always-full"\n');
    const d = chooseTestScope(repo, { budget: 'LOW' });
    expect(d.scope).toBe('full');
    expect(d.reasons.join(' ')).toMatch(/always-full/);
  });

  it('reuse off still deduplicates concurrent runs', () => {
    configure('[delivery_efficiency]\nevidence_reuse = false\n');
    recordEvidence(repo, {
      kind: 'test', command: 'npm test', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    expect(shouldRunValidation(repo, { kind: 'test', command: 'npm test' }, 'w1').action).toBe('RUN');
    expect(shouldRunValidation(repo, { kind: 'test', command: 'npm test' }, 'w2').action).toBe('WAIT');
  });

  it('dedup off still reuses valid evidence', () => {
    configure('[delivery_efficiency]\nvalidation_deduplication = false\n');
    recordEvidence(repo, {
      kind: 'test', command: 'npm test', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    expect(shouldRunValidation(repo, { kind: 'test', command: 'npm test' }, 'w1').action).toBe('REUSE');
  });

  it('merges partial settings onto defaults', () => {
    const merged = deliverySettings({ delivery_efficiency: { enabled: false } } as unknown as SfConfig);
    expect(merged.enabled).toBe(false);
    expect(merged.evidence_reuse).toBe(true);
  });
});

describe('adapter consumption of the shared policy (§17, §22)', () => {
  const root = resolve(__dirname, '..', '..', '..');
  const policyPath = join(root, 'agents', '_delivery-efficiency.md');

  const adapters = [
    'CLAUDE.md',
    'AGENTS.md',
    '.github/copilot-instructions.md',
    '.cursor/rules/delivery-efficiency.md',
    '.gemini/skills/delivery-efficiency.md',
    '.agents/skills/delivery-efficiency/SKILL.md',
  ];

  it('the canonical policy exists and states the governing principle', () => {
    expect(existsSync(policyPath)).toBe(true);
    const policy = readFileSync(policyPath, 'utf-8');
    expect(policy).toMatch(/Do not perform more engineering activity than is necessary/);
    expect(policy).toMatch(/shorter execution is not automatically better/);
  });

  it.each(adapters)('%s references the canonical policy', (file) => {
    const content = readFileSync(join(root, file), 'utf-8');
    expect(content).toContain('agents/_delivery-efficiency.md');
  });

  it.each(adapters)('%s communicates the required behaviors', (file) => {
    const content = readFileSync(join(root, file), 'utf-8').toLowerCase();
    // The behavioral contract every adapter must convey, however it words it.
    expect(content).toMatch(/delivery budget/);
    expect(content).toMatch(/reuse|reusing/);
    expect(content).toMatch(/scope/);
    expect(content).toMatch(/escalat/);
    expect(content).toMatch(/stop/);
  });

  it.each(adapters)('%s does NOT duplicate the full policy text', (file) => {
    const content = readFileSync(join(root, file), 'utf-8');
    const policy = readFileSync(policyPath, 'utf-8');
    // The canonical policy's own section headings must not be copied wholesale.
    const headings = policy.match(/^## .+$/gm) ?? [];
    const copied = headings.filter((h) => content.includes(h));
    expect(copied.length).toBeLessThan(3);
  });

  it.each(adapters)('%s names the non-negotiable safety constraints', (file) => {
    const content = readFileSync(join(root, file), 'utf-8').toLowerCase();
    expect(content).toMatch(/authenticat|authoriz/);
    expect(content).toMatch(/high/);
  });

  it.each(['go', 'forge', 'context', 'cost', 'tester', 'delivery'])(
    'the $%s skill references the canonical policy',
    (skill) => {
      const content = readFileSync(join(root, '.claude', 'commands', `${skill}.md`), 'utf-8');
      expect(content).toContain('agents/_delivery-efficiency.md');
    },
  );
});

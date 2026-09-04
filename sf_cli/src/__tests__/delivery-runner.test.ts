import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  extractImports, resolveImport, buildImportGraph, analyzeImpact, measureImpact, describeImpact,
} from '../core/delivery-impact.js';
import {
  detectChangedFiles, planTask, runValidation, runOrReuse, executeTask, completeTask,
  taskIsComplete, deliveryRunnerEnabled,
} from '../core/delivery-runner.js';
import { loadEvidenceStore, recordEvidence, claimValidation, evidenceKey } from '../core/delivery-evidence.js';
import { listHandoffs } from '../core/delivery-context.js';
import { buildEfficiencyReport } from '../core/delivery-metrics.js';
import { deliveryCommand } from '../commands/delivery.js';
import { forgeCommand } from '../commands/forge.js';
import type { SessionContext, SfConfig } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let repo: string;

function g(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim();
}

function write(rel: string, content: string): void {
  const abs = join(repo, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

function commit(message: string): string {
  g('add', '.');
  g('commit', '-m', message);
  return g('rev-parse', 'HEAD');
}

function configure(toml: string): void {
  mkdirSync(join(repo, '.skillfoundry'), { recursive: true });
  writeFileSync(join(repo, '.skillfoundry', 'config.toml'), toml, 'utf-8');
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-runner-'));
  g('init', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
  write('.gitignore', '.skillfoundry/\n');
  commit('empty');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('import extraction', () => {
  it('finds every ES and CommonJS import form', () => {
    const src = `
      import a from './a.js';
      import { b } from "./b";
      import './side-effect';
      export { c } from './c';
      const d = await import('./d');
      const e = require('./e');
      import type { T } from './types';
    `;
    const found = extractImports(src, '.ts');
    expect(found).toEqual(expect.arrayContaining(['./a.js', './b', './side-effect', './c', './d', './e', './types']));
  });

  it('finds python relative imports', () => {
    const found = extractImports('from .models import User\nimport os\n', '.py');
    expect(found).toContain('.models');
  });

  it('returns nothing for a file with no imports', () => {
    expect(extractImports('export const x = 1;\n', '.ts')).toEqual([]);
  });
});

describe('import resolution', () => {
  const known = new Set(['src/a.ts', 'src/b/index.ts', 'src/c.tsx', 'src/util.py', 'src/pkg/__init__.py']);

  it('resolves a relative specifier without an extension', () => {
    expect(resolveImport(repo, 'src/main.ts', './a', known)).toBe('src/a.ts');
  });

  it("resolves TypeScript's .js-for-.ts convention", () => {
    expect(resolveImport(repo, 'src/main.ts', './a.js', known)).toBe('src/a.ts');
  });

  it('resolves a directory index', () => {
    expect(resolveImport(repo, 'src/main.ts', './b', known)).toBe('src/b/index.ts');
  });

  it('resolves a parent-relative specifier', () => {
    expect(resolveImport(repo, 'src/b/index.ts', '../a', known)).toBe('src/a.ts');
  });

  it('resolves a python relative import', () => {
    expect(resolveImport(repo, 'src/main.py', '.util', known)).toBe('src/util.py');
  });

  it('returns null for a bare package specifier rather than guessing', () => {
    expect(resolveImport(repo, 'src/main.ts', 'react', known)).toBeNull();
    expect(resolveImport(repo, 'src/main.ts', '@scope/pkg', known)).toBeNull();
  });

  it('returns null for a relative path that does not exist', () => {
    expect(resolveImport(repo, 'src/main.ts', './nope', known)).toBeNull();
  });
});

describe('import graph and impact (§5 dependency impact)', () => {
  /** A small dependency chain: leaf ← mid ← top, plus an unrelated island. */
  function seedGraph(): void {
    write('src/leaf.ts', 'export const leaf = 1;\n');
    write('src/mid.ts', "import { leaf } from './leaf.js';\nexport const mid = leaf;\n");
    write('src/top.ts', "import { mid } from './mid.js';\nexport const top = mid;\n");
    write('src/island.ts', "import react from 'react';\nexport const island = 1;\n");
    commit('seed graph');
  }

  it('builds a reverse dependency map', () => {
    seedGraph();
    const graph = buildImportGraph(repo);
    expect(graph.dependents['src/leaf.ts']).toEqual(['src/mid.ts']);
    expect(graph.dependents['src/mid.ts']).toEqual(['src/top.ts']);
    expect(graph.fileCount).toBeGreaterThanOrEqual(4);
  });

  it('counts a bare package import as unresolved rather than silently ignoring it', () => {
    seedGraph();
    expect(buildImportGraph(repo).unresolvedImports).toBeGreaterThan(0);
  });

  it('walks dependents transitively', () => {
    seedGraph();
    const impact = measureImpact(repo, ['src/leaf.ts']);
    expect(impact.dependents).toEqual(['src/mid.ts', 'src/top.ts']);
    expect(impact.changedFiles).toEqual(['src/leaf.ts']);
  });

  it('reports no dependents for an island', () => {
    seedGraph();
    expect(measureImpact(repo, ['src/island.ts']).dependents).toEqual([]);
  });

  it('honours a depth limit and says when it truncated', () => {
    seedGraph();
    const impact = measureImpact(repo, ['src/leaf.ts'], { depth: 1 });
    expect(impact.dependents).toEqual(['src/mid.ts']);
    expect(impact.truncated).toBe(true);
    expect(describeImpact(impact)).toMatch(/depth limit/);
  });

  it('flags changed files the graph does not know about', () => {
    seedGraph();
    const impact = measureImpact(repo, ['docs/new-thing.md']);
    expect(impact.unknownFiles).toContain('docs/new-thing.md');
    expect(describeImpact(impact)).toMatch(/not in the import graph/);
  });

  it('caches the graph against the tree hash and reuses it', () => {
    seedGraph();
    buildImportGraph(repo);
    expect(existsSync(join(repo, '.skillfoundry', 'delivery-import-graph.json'))).toBe(true);

    const reused = buildImportGraph(repo);
    expect(reused.dependents['src/leaf.ts']).toEqual(['src/mid.ts']);
  });

  it('rebuilds after the tree changes', () => {
    seedGraph();
    buildImportGraph(repo);

    write('src/extra.ts', "import { leaf } from './leaf.js';\n");
    commit('add another dependent');

    expect(buildImportGraph(repo).dependents['src/leaf.ts']).toEqual(['src/extra.ts', 'src/mid.ts']);
  });

  it('does not walk node_modules or dist', () => {
    seedGraph();
    write('node_modules/pkg/index.ts', "import './x';\n");
    write('dist/bundle.js', "require('./y');\n");
    const graph = buildImportGraph(repo, { force: true });
    expect(Object.values(graph.dependents).flat().some((f) => f.startsWith('node_modules'))).toBe(false);
  });

  it('handles an empty analysis without dependents', () => {
    const impact = analyzeImpact(
      { version: '1', treeSha: null, dependents: {}, fileCount: 0, unresolvedImports: 0, builtAt: '' },
      [],
    );
    expect(impact.dependents).toEqual([]);
  });
});

describe('changed-file detection', () => {
  it('detects uncommitted work', () => {
    write('src/new.ts', 'export const x = 1;\n');
    expect(detectChangedFiles(repo)).toContain('src/new.ts');
  });

  it('detects a committed range against a base', () => {
    const base = g('rev-parse', 'HEAD');
    write('src/committed.ts', 'export const y = 1;\n');
    commit('add file');
    expect(detectChangedFiles(repo, base)).toContain('src/committed.ts');
  });

  it('returns nothing on a clean tree with no base', () => {
    expect(detectChangedFiles(repo)).toEqual([]);
  });
});

describe('planTask (§12 — $go startup)', () => {
  it('classifies, measures impact and derives a scope in one step', () => {
    write('src/styles.css', 'body { color: red; }\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'adjust the header colour' });

    expect(plan.budget.level).toBe('LOW');
    expect(plan.scope).toBe('smoke');
    expect(plan.changedFiles).toContain('src/styles.css');
    expect(plan.scopeReasons.join(' ')).toMatch(/LOW budget starts at "smoke"/);
  });

  it('classifies safety-critical work as HIGH from the changed path alone', () => {
    write('src/auth/session.ts', 'export const s = 1;\n');
    const plan = planTask(repo, { taskId: 'T-2', text: 'small tweak' });
    expect(plan.budget.level).toBe('HIGH');
    expect(plan.budget.safetyCritical).toBe(true);
  });

  it('widens the scope on a measured fan-out, not a supplied guess', () => {
    write('src/core.ts', 'export const core = 1;\n');
    for (let i = 0; i < 20; i++) {
      write(`src/consumer-${i}.ts`, "import { core } from './core.js';\n");
    }
    commit('wide fan-out');
    write('src/core.ts', 'export const core = 2;\n');

    const plan = planTask(repo, { taskId: 'T-3', text: 'change the core value' });
    expect(plan.impact.dependents.length).toBeGreaterThanOrEqual(20);
    expect(plan.scope).toBe('affected');
    expect(plan.scopeReasons.join(' ')).toMatch(/fan-out/);
  });

  it('reports impact as unmeasured rather than zero when skipped', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-4', skipImpact: true });
    expect(plan.impactSummary).toMatch(/not measured/);
  });
});

describe('runValidation (§3, §4 at runtime)', () => {
  it('executes and records evidence on a first run', () => {
    const outcome = runValidation(repo, {
      kind: 'test', command: 'node', args: ['-e', 'process.exit(0)'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    });

    expect(outcome.action).toBe('EXECUTED');
    expect(outcome.passed).toBe(true);
    expect(outcome.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(Object.keys(loadEvidenceStore(repo).entries)).toHaveLength(1);
  });

  it('reuses on a second identical run, spending no time', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const spec = {
      kind: 'test' as const, command: 'node', args: ['-e', 'process.exit(0)'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    };
    runValidation(repo, spec);
    const second = runValidation(repo, spec);

    expect(second.action).toBe('REUSED');
    expect(second.durationSeconds).toBe(0);
    expect(second.secondsSaved).not.toBeNull();
  });

  it('re-runs after a scoped file changes', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const spec = {
      kind: 'test' as const, command: 'node', args: ['-e', 'process.exit(0)'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    };
    runValidation(repo, spec);
    write('src/a.ts', 'export const a = 2;\n');
    expect(runValidation(repo, spec).action).toBe('EXECUTED');
  });

  it('records a failure and then refuses to re-run it unchanged', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const spec = {
      kind: 'build' as const, command: 'node', args: ['-e', 'process.exit(3)'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    };
    const first = runValidation(repo, spec);
    expect(first.action).toBe('EXECUTED');
    expect(first.passed).toBe(false);
    expect(first.exitCode).toBe(3);

    const second = runValidation(repo, spec);
    expect(second.action).toBe('BLOCKED_KNOWN_FAILURE');
  });

  it('reports a held claim rather than blocking the caller', () => {
    claimValidation(repo, evidenceKey('test', 'node'), 'other-worker');
    const outcome = runValidation(repo, {
      kind: 'test', command: 'node', args: ['-e', '0'], owner: 'w1', taskId: 'T-1',
    });
    expect(outcome.action).toBe('SKIPPED_HELD');
    expect(outcome.reason).toMatch(/other-worker/);
  });

  it('releases its claim so a later run is not blocked by itself', () => {
    const spec = {
      kind: 'lint' as const, command: 'node', args: ['-e', 'process.exit(1)'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    };
    write('src/a.ts', 'x\n');
    runValidation(repo, spec);
    write('src/a.ts', 'y\n');
    expect(runValidation(repo, spec).action).toBe('EXECUTED');
  });

  it('captures output for diagnosis when a command fails', () => {
    const outcome = runValidation(repo, {
      kind: 'test', command: 'node', args: ['-e', 'console.error("boom"); process.exit(1)'],
      owner: 'w1', taskId: 'T-1',
    });
    expect(outcome.outputTail).toContain('boom');
  });
});

describe('runOrReuse (in-process work)', () => {
  it('executes, then genuinely returns the recorded result on reuse', async () => {
    write('src/a.ts', 'export const a = 1;\n');
    let calls = 0;
    const work = async () => { calls++; return { verdict: 'PASS', gates: 8 }; };
    const spec = {
      kind: 'static-analysis' as const, command: 'gates:T0-T7',
      scopeFiles: ['src/a.ts'], owner: 'forge', taskId: 'T-1',
    };

    const first = await runOrReuse(repo, spec, work, (v) => v.verdict === 'PASS');
    expect(first.action).toBe('EXECUTED');
    expect(calls).toBe(1);

    const second = await runOrReuse(repo, spec, work, (v) => v.verdict === 'PASS');
    expect(second.action).toBe('REUSED');
    expect(second.value).toEqual({ verdict: 'PASS', gates: 8 });
    // The work was genuinely not repeated — this is the saving, not a relabelled re-run.
    expect(calls).toBe(1);
  });

  it('re-executes after the scoped file changes', async () => {
    write('src/a.ts', 'export const a = 1;\n');
    let calls = 0;
    const work = async () => { calls++; return { verdict: 'PASS' }; };
    const spec = {
      kind: 'static-analysis' as const, command: 'gates', scopeFiles: ['src/a.ts'],
      owner: 'forge', taskId: 'T-1',
    };

    await runOrReuse(repo, spec, work, () => true);
    write('src/a.ts', 'export const a = 2;\n');
    await runOrReuse(repo, spec, work, () => true);
    expect(calls).toBe(2);
  });

  it('falls through to execution when the result is too large to inline', async () => {
    write('src/a.ts', 'export const a = 1;\n');
    let calls = 0;
    const huge = { blob: 'x'.repeat(80 * 1024) };
    const work = async () => { calls++; return huge; };
    const spec = {
      kind: 'static-analysis' as const, command: 'big', scopeFiles: ['src/a.ts'],
      owner: 'forge', taskId: 'T-1',
    };

    await runOrReuse(repo, spec, work, () => true);
    const second = await runOrReuse(repo, spec, work, () => true);
    // Nothing reusable was stored, so the work runs again rather than returning nothing.
    expect(second.action).toBe('EXECUTED');
    expect(calls).toBe(2);
  });

  it('records a failing in-process result as FAIL', async () => {
    write('src/a.ts', 'export const a = 1;\n');
    const spec = {
      kind: 'static-analysis' as const, command: 'gates-fail', scopeFiles: ['src/a.ts'],
      owner: 'forge', taskId: 'T-1',
    };
    const first = await runOrReuse(repo, spec, async () => ({ verdict: 'FAIL' }), (v) => v.verdict === 'PASS');
    expect(first.passed).toBe(false);

    const second = await runOrReuse(repo, spec, async () => ({ verdict: 'FAIL' }), (v) => v.verdict === 'PASS');
    expect(second.action).toBe('BLOCKED_KNOWN_FAILURE');
  });
});

describe('executeTask (§13 — $forge)', () => {
  it('runs only validations at or below the selected scope', () => {
    write('src/styles.css', 'body {}\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'tweak the padding' });
    expect(plan.scope).toBe('smoke');

    const exec = executeTask(repo, plan, [
      { kind: 'typecheck', command: 'node', args: ['-e', '0'] },
      { kind: 'test', command: 'node', args: ['-e', '0'], minScope: 'integration' },
    ]);

    // The integration-only validation was never invoked at smoke scope.
    expect(exec.outcomes).toHaveLength(1);
    expect(exec.outcomes[0].kind).toBe('typecheck');
    expect(exec.allPassed).toBe(true);
  });

  it('stops at the first genuine failure instead of running the rest against a broken tree', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });

    const exec = executeTask(repo, plan, [
      { kind: 'build', command: 'node', args: ['-e', 'process.exit(1)'] },
      { kind: 'test', command: 'node', args: ['-e', '0'] },
    ]);

    expect(exec.outcomes).toHaveLength(1);
    expect(exec.allPassed).toBe(false);
  });

  it('escalates the budget when a failure names safety-sensitive impact', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    expect(plan.budget.level).toBe('MEDIUM');

    const exec = executeTask(repo, plan, [{
      kind: 'test',
      command: 'node',
      args: ['-e', 'console.error("FAIL: authorization check rejected the token"); process.exit(1)'],
    }]);

    expect(exec.finalBudget).toBe('HIGH');
    expect(exec.escalations.join(' ')).toMatch(/budget → HIGH/);
  });

  it('does NOT escalate when a validation simply passes', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const exec = executeTask(repo, plan, [{ kind: 'test', command: 'node', args: ['-e', '0'] }]);

    expect(exec.escalations).toEqual([]);
    expect(exec.finalBudget).toBe('MEDIUM');
    expect(exec.finalScope).toBe(plan.scope);
  });

  it('counts reused vs executed and measures time', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const validations = [{ kind: 'test' as const, command: 'node', args: ['-e', '0'], scopeFiles: ['src/a.ts'] }];

    const first = executeTask(repo, plan, validations);
    expect(first.executed).toBe(1);
    expect(first.reused).toBe(0);

    const second = executeTask(repo, plan, validations);
    expect(second.reused).toBe(1);
    expect(second.executed).toBe(0);
    expect(second.totalSeconds).toBe(0);
  });
});

describe('completeTask and stop conditions end to end', () => {
  it('records a handoff carrying budget, scope and measured seconds', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const exec = executeTask(repo, plan, [{ kind: 'test', command: 'node', args: ['-e', '0'] }]);

    const handoff = completeTask(repo, exec, { mission: 'm1' });
    expect(handoff.taskId).toBe('T-1');
    expect(handoff.budget).toBe('MEDIUM');
    expect(handoff.validationScope).toBe('targeted');
    expect(handoff.validationSeconds).toBeGreaterThanOrEqual(0);
    expect(listHandoffs(repo, 'm1')).toHaveLength(1);
  });

  it('feeds measured seconds into the efficiency report instead of unknown', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const exec = executeTask(repo, plan, [{ kind: 'test', command: 'node', args: ['-e', '0'] }]);
    completeTask(repo, exec, { mission: 'm1' });

    const report = buildEfficiencyReport(repo, 'm1');
    expect(report.totals.validationSeconds).not.toBeNull();
  });

  it('is not complete until the diff has been inspected', () => {
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const exec = executeTask(repo, plan, [{ kind: 'test', command: 'node', args: ['-e', '0'] }]);

    expect(taskIsComplete(repo, exec, { acceptanceCriteriaProven: 1, acceptanceCriteriaTotal: 1 }).complete).toBe(false);

    const done = taskIsComplete(repo, exec, {
      acceptanceCriteriaProven: 1, acceptanceCriteriaTotal: 1, diffInspected: true,
    });
    expect(done.complete).toBe(true);
    expect(done.stopGuidance.join(' ')).toMatch(/Do not re-read/);
  });

  it('treats a held validation as a blocker rather than silent success', () => {
    claimValidation(repo, evidenceKey('test', 'node', 'targeted'), 'other-worker');
    write('src/a.ts', 'export const a = 1;\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'add an endpoint' });
    const exec = executeTask(repo, plan, [{ kind: 'test', command: 'node', args: ['-e', '0'] }]);

    const verdict = taskIsComplete(repo, exec, { diffInspected: true });
    expect(verdict.complete).toBe(false);
    expect(verdict.outstanding.join(' ')).toMatch(/no-blockers/);
  });
});

describe('backward compatibility at runtime', () => {
  it('reports disabled and treats everything as HIGH/full', () => {
    configure('[delivery_efficiency]\nenabled = false\n');
    expect(deliveryRunnerEnabled(repo)).toBe(false);

    write('README.md', '# hi\n');
    const plan = planTask(repo, { taskId: 'T-1', text: 'fix a typo' });
    expect(plan.budget.level).toBe('HIGH');
    expect(plan.scope).toBe('full');
  });

  it('never reuses when disabled, so behavior matches the old framework', () => {
    configure('[delivery_efficiency]\nenabled = false\n');
    write('src/a.ts', 'export const a = 1;\n');
    const spec = {
      kind: 'test' as const, command: 'node', args: ['-e', '0'],
      scopeFiles: ['src/a.ts'], owner: 'w1', taskId: 'T-1',
    };
    runValidation(repo, spec);
    expect(runValidation(repo, spec).action).toBe('EXECUTED');
  });
});

describe('/delivery plan and impact subcommands', () => {
  async function run(args: string): Promise<string> {
    const out = await deliveryCommand.execute(args, { workDir: repo } as SessionContext);
    // eslint-disable-next-line no-control-regex
    return String(out ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  }

  it('plans a task, showing budget, scope and impact together', async () => {
    write('src/styles.css', 'body {}\n');
    const out = await run('plan T-1 --text "tweak the header padding"');
    expect(out).toContain('Task plan — T-1');
    expect(out).toContain('LOW');
    expect(out).toContain('smoke');
    expect(out).toContain('Why this scope');
  });

  it('flags safety-critical work in the plan', async () => {
    write('src/auth/session.ts', 'export const s = 1;\n');
    const out = await run('plan T-2 --text "small tweak"');
    expect(out).toContain('HIGH');
    expect(out).toContain('safety-critical');
  });

  it('rejects an unknown override', async () => {
    expect(await run('plan T-1 --override URGENT')).toContain('Unknown budget');
  });

  it('reports measured dependents', async () => {
    write('src/leaf.ts', 'export const leaf = 1;\n');
    write('src/mid.ts', "import { leaf } from './leaf.js';\n");
    commit('graph');

    const out = await run('impact --files src/leaf.ts');
    expect(out).toContain('Dependents (1)');
    expect(out).toContain('src/mid.ts');
  });

  it('says plainly when a change reaches nothing', async () => {
    write('src/island.ts', 'export const x = 1;\n');
    commit('island');
    const out = await run('impact --files src/island.ts');
    expect(out).toContain('Dependents (0)');
    expect(out).toContain('does not reach other modules');
  });

  it('asks for input when there is nothing to analyse', async () => {
    expect(await run('impact')).toContain('No changed files detected');
  });
});

describe('$forge gate reuse (§13 runtime integration)', () => {
  /** A minimal project forge can scan without the gates erroring out. */
  function seedProject(): void {
    write('genesis/TEMPLATE.md', '# template\n');
    write('src/index.ts', 'export const x = 1;\n');
    commit('seed project');
  }

  it('reuses the gate summary on a second dry run against an unchanged tree', async () => {
    seedProject();
    const session = { workDir: repo, messages: [], config: {} as SfConfig } as SessionContext;

    const first = String(await forgeCommand.execute('--dry-run', session));
    expect(first).toContain('Quality Gates');
    expect(first).not.toContain('reused:');

    // Nothing changed, so the recorded summary is handed back rather than re-derived.
    // A bare fixture has no test runner, so the gates legitimately fail. The point stands:
    // the recorded summary is handed back instead of being re-derived.
    const second = String(await forgeCommand.execute('--dry-run', session));
    expect(second).toMatch(/reused: already (proven|failed) against this tree/);

    // And the verdict is identical — reuse returns the real result, not a placeholder.
    const verdictOf = (s: string) => /VERDICT: (\w+)/.exec(s)?.[1];
    expect(verdictOf(second)).toBe(verdictOf(first));
  }, 60_000);

  it('does not reuse a failing result as a pass', async () => {
    seedProject();
    const session = { workDir: repo, messages: [], config: {} as SfConfig } as SessionContext;
    await forgeCommand.execute('--dry-run', session);

    const second = String(await forgeCommand.execute('--dry-run', session));
    // The reuse is explicit about being a recorded failure, never dressed up as proven.
    expect(second).toContain('already failed against this tree');
    expect(second).not.toContain('already proven against this tree');
  }, 60_000);

  it('re-runs the gates after the tree changes', async () => {
    seedProject();
    const session = { workDir: repo, messages: [], config: {} as SfConfig } as SessionContext;

    await forgeCommand.execute('--dry-run', session);
    write('src/index.ts', 'export const x = 2;\n');
    commit('change source');

    const after = String(await forgeCommand.execute('--dry-run', session));
    expect(after).not.toContain('reused:');
  }, 60_000);

  it('does not reuse when the layer is disabled', async () => {
    seedProject();
    configure('[delivery_efficiency]\nenabled = false\n');
    const session = { workDir: repo, messages: [], config: {} as SfConfig } as SessionContext;

    await forgeCommand.execute('--dry-run', session);
    const second = String(await forgeCommand.execute('--dry-run', session));
    expect(second).not.toContain('reused:');
  }, 60_000);
});

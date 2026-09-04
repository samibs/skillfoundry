import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  recordEvidence, lookupEvidence, decideValidation, invalidateForFiles, clearEvidence,
  claimValidation, releaseValidation, activeClaims, evidenceKey, loadEvidenceStore,
  isValidationKind, VALIDATION_KINDS, changedFilesDigest,
} from '../core/delivery-evidence.js';
import {
  recordFact, getFact, shouldRediscover, invalidateFactsForFiles, validFacts,
  recordHandoff, listHandoffs, aggregateChangedFiles, summarizeContext,
  type WorkerHandoff,
} from '../core/delivery-context.js';
import {
  planIntegrationGate, verifyHandoff, reasonsToRevalidate, describeIntegrationPlan,
} from '../core/delivery-integration.js';
import { buildEfficiencyReport } from '../core/delivery-metrics.js';

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

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-delivery-'));
  g('init', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
  // Real SkillFoundry projects gitignore .skillfoundry/; without it the evidence store
  // would land in every commit and pollute changed-file analysis.
  write('.gitignore', '.skillfoundry/\n');
  write('src/a.ts', 'export const a = 1;\n');
  write('src/b.ts', 'export const b = 1;\n');
  commit('initial');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('validation vocabulary', () => {
  it('recognises the declared kinds only', () => {
    for (const k of VALIDATION_KINDS) expect(isValidationKind(k)).toBe(true);
    expect(isValidationKind('vibes')).toBe(false);
  });

  it('produces a stable key for the same command and scope', () => {
    expect(evidenceKey('test', 'npm test', 'targeted')).toBe(evidenceKey('test', 'npm test', 'targeted'));
    expect(evidenceKey('test', 'npm test', 'targeted')).not.toBe(evidenceKey('test', 'npm test', 'full'));
  });

  it('digests a changed-file set order-independently', () => {
    expect(changedFilesDigest(['b.ts', 'a.ts'])).toBe(changedFilesDigest(['a.ts', 'b.ts']));
  });
});

describe('evidence reuse (§3)', () => {
  it('reuses a passing result when nothing it depended on changed', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test -- src/a', scope: 'targeted', result: 'PASS',
      scopeFiles: ['src/a.ts'], producedBy: 'TASK-1', durationSeconds: 42,
    });

    const lookup = lookupEvidence(repo, { kind: 'test', command: 'npm test -- src/a', scope: 'targeted' });
    expect(lookup.status).toBe('REUSABLE');
    expect(lookup.reason).toMatch(/already proven/);
    expect(lookup.entry?.durationSeconds).toBe(42);
  });

  it('reports a miss when nothing was recorded', () => {
    const lookup = lookupEvidence(repo, { kind: 'build', command: 'npm run build' });
    expect(lookup.status).toBe('MISS');
  });

  it('does not reuse a previous FAIL as a pass', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test', result: 'FAIL', exitCode: 1,
      scopeFiles: ['src/a.ts'], producedBy: 'TASK-1',
    });
    const lookup = lookupEvidence(repo, { kind: 'test', command: 'npm test' });
    expect(lookup.status).toBe('FAILED_PREVIOUSLY');
    expect(lookup.reason).toMatch(/already failed/);
  });

  it('refuses evidence recorded in a different repository', () => {
    const store = loadEvidenceStore(repo);
    recordEvidence(repo, {
      kind: 'lint', command: 'eslint .', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    const other = loadEvidenceStore(repo);
    const key = Object.keys(other.entries)[0];
    other.entries[key].repository = '/somewhere/else';
    writeFileSync(join(repo, '.skillfoundry', 'delivery-evidence.json'), JSON.stringify(other), 'utf-8');
    expect(store).toBeDefined();

    expect(lookupEvidence(repo, { kind: 'lint', command: 'eslint .' }).status).toBe('INVALIDATED');
  });

  it('honours an explicit age limit', () => {
    recordEvidence(repo, {
      kind: 'security-scan', command: 'semgrep', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    const lookup = lookupEvidence(repo, { kind: 'security-scan', command: 'semgrep', maxAgeMs: -1 });
    expect(lookup.status).toBe('INVALIDATED');
    expect(lookup.reason).toMatch(/old/);
  });
});

describe('evidence invalidation (§3)', () => {
  it('invalidates after a file it depended on changes', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test -- src/a', scope: 'targeted', result: 'PASS',
      scopeFiles: ['src/a.ts'], producedBy: 'TASK-1',
    });

    write('src/a.ts', 'export const a = 2; // changed\n');

    const lookup = lookupEvidence(repo, { kind: 'test', command: 'npm test -- src/a', scope: 'targeted' });
    expect(lookup.status).toBe('INVALIDATED');
    expect(lookup.invalidatedBy).toContain('src/a.ts');
  });

  it('PRESERVES evidence when an unrelated file changes', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test -- src/a', scope: 'targeted', result: 'PASS',
      scopeFiles: ['src/a.ts'], producedBy: 'TASK-1',
    });

    write('src/b.ts', 'export const b = 99; // unrelated\n');

    const lookup = lookupEvidence(repo, {
      kind: 'test', command: 'npm test -- src/a', scope: 'targeted', changedFiles: ['src/b.ts'],
    });
    expect(lookup.status).toBe('REUSABLE');
  });

  it('invalidates when a scoped file is deleted', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    rmSync(join(repo, 'src/a.ts'));
    expect(lookupEvidence(repo, { kind: 'test', command: 'npm test' }).status).toBe('INVALIDATED');
  });

  it('binds repository-wide evidence to the tree hash, conservatively', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test', scope: 'full', result: 'PASS', producedBy: 'TASK-1',
    });
    expect(lookupEvidence(repo, { kind: 'test', command: 'npm test', scope: 'full' }).status).toBe('REUSABLE');

    write('src/b.ts', 'export const b = 3;\n');
    commit('unrelated change');

    const lookup = lookupEvidence(repo, { kind: 'test', command: 'npm test', scope: 'full' });
    expect(lookup.status).toBe('INVALIDATED');
    expect(lookup.reason).toMatch(/tree has changed/);
  });

  it('drops evidence for a set of changed files on demand', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'a', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    recordEvidence(repo, {
      kind: 'test', command: 'b', result: 'PASS', scopeFiles: ['src/b.ts'], producedBy: 'T',
    });

    const removed = invalidateForFiles(repo, ['src/a.ts']);
    expect(removed).toHaveLength(1);
    expect(lookupEvidence(repo, { kind: 'test', command: 'a' }).status).toBe('MISS');
    expect(lookupEvidence(repo, { kind: 'test', command: 'b' }).status).toBe('REUSABLE');
  });

  it('always drops repository-wide evidence on any change', () => {
    recordEvidence(repo, { kind: 'test', command: 'full', scope: 'full', result: 'PASS', producedBy: 'T' });
    expect(invalidateForFiles(repo, ['anything.ts'])).toHaveLength(1);
  });

  it('clears the whole store', () => {
    recordEvidence(repo, { kind: 'test', command: 'x', result: 'PASS', producedBy: 'T' });
    clearEvidence(repo);
    expect(Object.keys(loadEvidenceStore(repo).entries)).toHaveLength(0);
  });
});

describe('duplicate validation prevention (§4)', () => {
  it('grants the first claim and refuses the second', () => {
    const key = evidenceKey('test', 'npm test', 'full');
    const first = claimValidation(repo, key, 'worker-a');
    const second = claimValidation(repo, key, 'worker-b');

    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(second.heldBy).toBe('worker-a');
    expect(second.reason).toMatch(/wait for its evidence/);
  });

  it('is re-entrant for the same owner', () => {
    const key = evidenceKey('test', 'npm test');
    claimValidation(repo, key, 'worker-a');
    expect(claimValidation(repo, key, 'worker-a').granted).toBe(true);
  });

  it('releases the claim so a later worker can run it', () => {
    const key = evidenceKey('build', 'npm run build');
    claimValidation(repo, key, 'worker-a');
    releaseValidation(repo, key);
    expect(claimValidation(repo, key, 'worker-b').granted).toBe(true);
  });

  it('reclaims a stale claim so a crashed worker cannot deadlock the wave', () => {
    const key = evidenceKey('test', 'slow');
    claimValidation(repo, key, 'crashed-worker', 1);
    const later = claimValidation(repo, key, 'worker-b', 0);
    expect(later.granted).toBe(true);
    expect(later.reason).toMatch(/stale/);
  });

  it('lists claims in flight', () => {
    claimValidation(repo, evidenceKey('test', 'x'), 'worker-a');
    const claims = activeClaims(repo);
    expect(claims).toHaveLength(1);
    expect(claims[0].owner).toBe('worker-a');
  });

  it('three workers do not each run the same repository-wide suite', () => {
    const query = { kind: 'test' as const, command: 'npm test', scope: 'full' as const };

    const a = decideValidation(repo, query, 'worker-a');
    const b = decideValidation(repo, query, 'worker-b');
    const c = decideValidation(repo, query, 'worker-c');

    expect(a.action).toBe('RUN');
    expect(b.action).toBe('WAIT');
    expect(c.action).toBe('WAIT');
  });
});

describe('decideValidation (§3 + §4 combined)', () => {
  it('reuses rather than claiming when the answer is already proven', () => {
    recordEvidence(repo, {
      kind: 'test', command: 'npm test -- a', result: 'PASS', scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    const d = decideValidation(repo, { kind: 'test', command: 'npm test -- a' }, 'worker-a');
    expect(d.action).toBe('REUSE');
    expect(activeClaims(repo)).toHaveLength(0);
  });

  it('tells the caller to fix rather than re-run a known failure', () => {
    recordEvidence(repo, {
      kind: 'build', command: 'npm run build', result: 'FAIL', exitCode: 2,
      scopeFiles: ['src/a.ts'], producedBy: 'T',
    });
    const d = decideValidation(repo, { kind: 'build', command: 'npm run build' }, 'worker-a');
    expect(d.action).toBe('FIX_FIRST');
  });
});

describe('mission context and the reasoning budget (§6, §14)', () => {
  it('reuses an authoritative fact rather than rediscovering it', () => {
    recordFact(repo, 'm1', {
      key: 'architecture.summary', value: 'Nest backend + React frontend',
      confidence: 'AUTHORITATIVE', source: 'PRD', dependsOn: [],
    });
    const v = shouldRediscover(repo, 'm1', 'architecture.summary');
    expect(v.rediscover).toBe(false);
    expect(v.reason).toMatch(/already established/);
  });

  it('rediscovers a fact that was never established', () => {
    expect(shouldRediscover(repo, 'm1', 'services.affected').rediscover).toBe(true);
  });

  it('rediscovers an unverified assumption', () => {
    recordFact(repo, 'm1', {
      key: 'db.engine', value: 'probably postgres', confidence: 'ASSUMPTION',
      source: 'guess', dependsOn: [],
    });
    const v = shouldRediscover(repo, 'm1', 'db.engine');
    expect(v.rediscover).toBe(true);
    expect(v.reason).toMatch(/unverified assumption/);
  });

  it('re-verifies an inferred fact for safety-critical work (§19)', () => {
    recordFact(repo, 'm1', {
      key: 'auth.flow', value: 'JWT in a cookie', confidence: 'INFERRED',
      source: 'code reading', dependsOn: [],
    });
    expect(shouldRediscover(repo, 'm1', 'auth.flow').rediscover).toBe(false);
    expect(shouldRediscover(repo, 'm1', 'auth.flow', { safetyCritical: true }).rediscover).toBe(true);
  });

  it('invalidates a fact when a file it depended on changes, keeping the record', () => {
    recordFact(repo, 'm1', {
      key: 'api.routes', value: '4 routes', confidence: 'INFERRED',
      source: 'scan', dependsOn: ['src/a.ts'],
    });
    const invalidated = invalidateFactsForFiles(repo, 'm1', ['src/a.ts']);

    expect(invalidated).toEqual(['api.routes']);
    expect(getFact(repo, 'm1', 'api.routes')?.invalidated).toBe(true);
    expect(validFacts(repo, 'm1')).toHaveLength(0);
    expect(shouldRediscover(repo, 'm1', 'api.routes').rediscover).toBe(true);
  });

  it('leaves facts alone when an unrelated file changes', () => {
    recordFact(repo, 'm1', {
      key: 'api.routes', value: '4 routes', confidence: 'INFERRED', source: 'scan', dependsOn: ['src/a.ts'],
    });
    expect(invalidateFactsForFiles(repo, 'm1', ['src/b.ts'])).toEqual([]);
    expect(validFacts(repo, 'm1')).toHaveLength(1);
  });

  it('summarises facts by confidence', () => {
    recordFact(repo, 'm1', { key: 'a', value: '1', confidence: 'AUTHORITATIVE', source: 's', dependsOn: [] });
    recordFact(repo, 'm1', { key: 'b', value: '2', confidence: 'INFERRED', source: 's', dependsOn: [] });
    recordFact(repo, 'm1', { key: 'c', value: '3', confidence: 'ASSUMPTION', source: 's', dependsOn: [] });

    const s = summarizeContext(repo, 'm1');
    expect(s.authoritative).toBe(1);
    expect(s.inferred).toBe(1);
    expect(s.assumptions).toBe(1);
  });
});

describe('worker handoffs and the integration gate (§10, §11)', () => {
  /** A worker that changed one file and proved it at a narrow scope. */
  function makeWorker(taskId: string, file: string, budget: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): WorkerHandoff {
    const base = g('rev-parse', 'HEAD');
    write(file, `export const x = '${taskId}';\n`);
    const result = commit(`feat: ${taskId}`);
    const key = evidenceKey('test', `npm test -- ${file}`, 'targeted');
    recordEvidence(repo, {
      kind: 'test', command: `npm test -- ${file}`, scope: 'targeted', result: 'PASS',
      scopeFiles: [file], producedBy: taskId, durationSeconds: 10,
    });
    return {
      taskId, worktree: repo, baseCommit: base, resultCommit: result,
      changedFiles: [file], budget, validationScope: 'targeted',
      testsExecuted: [`npm test -- ${file}`], evidenceGenerated: [key],
      evidenceReused: [], unresolvedGaps: [], at: new Date().toISOString(),
    };
  }

  it('verifies a well-formed handoff', () => {
    const h = makeWorker('AF-1', 'src/f1.ts');
    const v = verifyHandoff(repo, h);
    expect(v.trusted).toBe(true);
    expect(v.problems).toEqual([]);
  });

  it('rejects a handoff whose base is not an ancestor of its result', () => {
    const h = makeWorker('AF-1', 'src/f1.ts');
    const v = verifyHandoff(repo, { ...h, baseCommit: h.resultCommit, resultCommit: h.baseCommit });
    expect(v.trusted).toBe(false);
    expect(v.problems.join(' ')).toMatch(/not an ancestor/);
  });

  it('rejects a handoff that under-declares its changed files', () => {
    const h = makeWorker('AF-1', 'src/f1.ts');
    const v = verifyHandoff(repo, { ...h, changedFiles: [] });
    expect(v.trusted).toBe(false);
    expect(v.problems.join(' ')).toMatch(/not declared/);
  });

  it('rejects a handoff that recorded no validation at all', () => {
    const h = makeWorker('AF-1', 'src/f1.ts');
    const v = verifyHandoff(repo, { ...h, testsExecuted: [], evidenceGenerated: [] });
    expect(v.trusted).toBe(false);
    expect(v.problems.join(' ')).toMatch(/no executed validation/);
  });

  it('REUSES worker evidence at the gate instead of re-running it', () => {
    const a = makeWorker('AF-1', 'src/f1.ts');
    const b = makeWorker('AF-2', 'src/f2.ts');
    recordHandoff(repo, 'm1', a);
    recordHandoff(repo, 'm1', b);

    const plan = planIntegrationGate(repo, {
      handoffs: [a, b],
      requiredValidations: [
        { kind: 'test', command: 'npm test -- src/f1.ts', scope: 'targeted' },
        { kind: 'test', command: 'npm test -- src/f2.ts', scope: 'targeted' },
      ],
      mission: 'm1',
    });

    expect(plan.trustedHandoffs).toEqual(['AF-1', 'AF-2']);
    expect(plan.validations.every((v) => v.action === 'REUSE')).toBe(true);
    expect(plan.aggregateChangedFiles).toEqual(['src/f1.ts', 'src/f2.ts']);
  });

  it('re-runs only what integration actually disturbed', () => {
    const a = makeWorker('AF-1', 'src/f1.ts');
    const b = makeWorker('AF-2', 'src/f2.ts');

    // Integration resolves a conflict in f1 — that evidence can no longer be trusted.
    write('src/f1.ts', 'export const x = "merged";\n');
    commit('integration fixup');

    const plan = planIntegrationGate(repo, {
      handoffs: [a, b],
      requiredValidations: [
        { kind: 'test', command: 'npm test -- src/f1.ts', scope: 'targeted' },
        { kind: 'test', command: 'npm test -- src/f2.ts', scope: 'targeted' },
      ],
      integrationChangedFiles: ['src/f1.ts'],
      mission: 'm1',
    });

    const f1 = plan.validations.find((v) => v.command.includes('f1'))!;
    const f2 = plan.validations.find((v) => v.command.includes('f2'))!;
    expect(f1.action).toBe('RUN');
    expect(f2.action).toBe('REUSE');
    expect(plan.invalidatedEvidence.length).toBeGreaterThan(0);
  });

  it('drives the aggregate scope from the riskiest contribution', () => {
    const a = makeWorker('AF-1', 'src/f1.ts', 'LOW');
    const b = makeWorker('AF-2', 'src/f2.ts', 'HIGH');
    const plan = planIntegrationGate(repo, { handoffs: [a, b], requiredValidations: [], mission: 'm1' });

    expect(plan.requiredBudget).toBe('HIGH');
    expect(plan.requiredScope).toBe('full');
    expect(plan.scopeReason).toMatch(/rather than per worker/);
  });

  it('records the worker runs it deliberately did not repeat', () => {
    const a = makeWorker('AF-1', 'src/f1.ts', 'MEDIUM');
    const plan = planIntegrationGate(repo, { handoffs: [a], requiredValidations: [], mission: 'm1' });
    expect(plan.deduplicated).toHaveLength(1);
    expect(plan.deduplicated[0].why).toMatch(/instead of re-running per worker/);
    expect(describeIntegrationPlan(plan).join(' ')).toMatch(/Worker runs not repeated/);
  });

  it('gives concrete reasons to re-validate a worker, or none at all', () => {
    const a = makeWorker('AF-1', 'src/f1.ts');
    const clean = planIntegrationGate(repo, { handoffs: [a], requiredValidations: [], mission: 'm1' });
    expect(reasonsToRevalidate(repo, a, clean)).toEqual([]);

    const untrusted = planIntegrationGate(repo, {
      handoffs: [{ ...a, changedFiles: [] }], requiredValidations: [], mission: 'm1',
    });
    expect(reasonsToRevalidate(repo, { ...a, changedFiles: [] }, untrusted).length).toBeGreaterThan(0);
  });

  it('aggregates changed files across handoffs without duplicates', () => {
    const a = makeWorker('AF-1', 'src/f1.ts');
    const b = makeWorker('AF-2', 'src/f1.ts');
    expect(aggregateChangedFiles([a, b])).toEqual(['src/f1.ts']);
  });

  it('stores and lists handoffs', () => {
    recordHandoff(repo, 'm1', makeWorker('AF-1', 'src/f1.ts'));
    expect(listHandoffs(repo, 'm1')).toHaveLength(1);
  });
});

describe('efficiency metrics (§7)', () => {
  it('reports reuse rate and repository-wide runs avoided', () => {
    const base = g('rev-parse', 'HEAD');
    for (const id of ['AF-1', 'AF-2', 'AF-3']) {
      recordHandoff(repo, 'm1', {
        taskId: id, worktree: repo, baseCommit: base, resultCommit: base,
        changedFiles: [`src/${id}.ts`], budget: 'MEDIUM', validationScope: 'targeted',
        testsExecuted: ['npm test -- x'], evidenceGenerated: ['k1'], evidenceReused: ['k2'],
        unresolvedGaps: [], at: new Date().toISOString(),
      });
    }

    const report = buildEfficiencyReport(repo, 'm1');
    expect(report.totals.tasks).toBe(3);
    expect(report.totals.evidenceReused).toBe(3);
    expect(report.totals.evidenceReuseRate).toBe(0.5);
    // Each worker stayed scoped, so three repository-wide runs were not paid for.
    expect(report.totals.repoWideRunsAvoided).toBe(3);
  });

  it('reports unknown rather than inventing a saving it cannot measure', () => {
    const base = g('rev-parse', 'HEAD');
    recordHandoff(repo, 'm2', {
      taskId: 'AF-1', worktree: repo, baseCommit: base, resultCommit: base,
      changedFiles: [], budget: 'LOW', validationScope: 'smoke',
      testsExecuted: [], evidenceGenerated: [], evidenceReused: ['missing-key'],
      unresolvedGaps: [], at: new Date().toISOString(),
    });
    const report = buildEfficiencyReport(repo, 'm2');
    expect(report.totals.secondsSavedByReuse).toBeNull();
    expect(report.tasks[0].tokensUsed).toBeNull();
  });

  it('flags repeated commands within a task', () => {
    const base = g('rev-parse', 'HEAD');
    recordHandoff(repo, 'm3', {
      taskId: 'AF-1', worktree: repo, baseCommit: base, resultCommit: base,
      changedFiles: [], budget: 'MEDIUM', validationScope: 'targeted',
      testsExecuted: ['npm test', 'npm test', 'npm test'],
      evidenceGenerated: [], evidenceReused: [], unresolvedGaps: [], at: new Date().toISOString(),
    });
    const report = buildEfficiencyReport(repo, 'm3');
    expect(report.totals.repeatedCommands).toBe(2);
    expect(report.observations.join(' ')).toMatch(/executed more than once/);
  });

  it('flags multiple workers each running a repository-wide scope', () => {
    const base = g('rev-parse', 'HEAD');
    for (const id of ['AF-1', 'AF-2']) {
      recordHandoff(repo, 'm4', {
        taskId: id, worktree: repo, baseCommit: base, resultCommit: base,
        changedFiles: [], budget: 'MEDIUM', validationScope: 'full',
        testsExecuted: ['npm test'], evidenceGenerated: [], evidenceReused: [],
        unresolvedGaps: [], at: new Date().toISOString(),
      });
    }
    const report = buildEfficiencyReport(repo, 'm4');
    expect(report.observations.join(' ')).toMatch(/belongs at the integration gate, once/);
  });

  it('says plainly when there is nothing to measure', () => {
    expect(buildEfficiencyReport(repo, 'empty').observations.join(' ')).toMatch(/nothing to measure/);
  });
});

describe('store resilience', () => {
  it('treats a corrupt store as empty rather than failing the run', () => {
    mkdirSync(join(repo, '.skillfoundry'), { recursive: true });
    writeFileSync(join(repo, '.skillfoundry', 'delivery-evidence.json'), '{ not json', 'utf-8');
    expect(Object.keys(loadEvidenceStore(repo).entries)).toHaveLength(0);
  });

  it('discards evidence recorded under different validity rules', () => {
    recordEvidence(repo, { kind: 'test', command: 'x', result: 'PASS', producedBy: 'T' });
    const path = join(repo, '.skillfoundry', 'delivery-evidence.json');
    const store = JSON.parse(require('node:fs').readFileSync(path, 'utf-8'));
    store.version = '0';
    writeFileSync(path, JSON.stringify(store), 'utf-8');

    expect(Object.keys(loadEvidenceStore(repo).entries)).toHaveLength(0);
    expect(existsSync(path)).toBe(true);
  });
});

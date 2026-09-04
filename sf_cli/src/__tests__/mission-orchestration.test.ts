import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  registerAgent, releaseAgent, readAgent, listAgents, activeAgents,
  sharedWorktreeViolations, assertAgentName, buildDependencyGraph,
  evaluateEligibility, planWave, integrationOrder, orchestrationSummary,
} from '../core/mission-orchestration.js';
import {
  initLedger, upsertMission, readLedger, setExecutionPlan, setExecutionStatus,
  recordBlocker, clearBlockers, dispatchWave, completeWave, unresolvedWaveItems,
  setBaseline, recordIntegration, getMission, updateMission, setProvenance,
  setDimension, attachEvidence, setAcceptanceCriteria, reconcileLedger,
  isExecutionStatus, EXECUTION_STATUSES,
} from '../core/mission-ledger.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let root: string;
let repo: string;

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** Register several work items with dependencies and write manifests. */
function seed(items: Array<{ id: string; deps?: Array<[string, 'HARD' | 'SOFT' | 'INTEGRATION']>; writes?: string[] }>): void {
  initLedger(repo, 'demo', 'main');
  for (const item of items) upsertMission(repo, item.id, item.id);
  for (const item of items) {
    setExecutionPlan(repo, item.id, {
      dependencies: (item.deps ?? []).map(([on, kind]) => ({ on, kind })),
      write_manifest: item.writes ?? [],
    });
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sf-mission-orch-'));
  repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# demo\n', 'utf-8');
  g(repo, 'add', '.');
  g(repo, 'commit', '-m', 'initial');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('agent naming (§8)', () => {
  it('accepts the platform-role-workitem convention', () => {
    expect(() => assertAgentName('codex-backend-AF-302')).not.toThrow();
    expect(() => assertAgentName('claude-architect-AF-101')).not.toThrow();
  });

  it('rejects names that would escape the registry directory', () => {
    expect(() => assertAgentName('../evil')).toThrow(/Invalid agent name/);
    expect(() => assertAgentName('a/b')).toThrow(/Invalid agent name/);
    expect(() => assertAgentName('ab')).toThrow(/Invalid agent name/);
  });
});

describe('agent registry (§9)', () => {
  beforeEach(() => { seed([{ id: 'AF-101' }]); });

  it('registers a write agent and records the resolved base SHA', () => {
    const linked = join(root, 'wt-101');
    g(repo, 'worktree', 'add', '-b', 'agent/AF-101', linked, 'main');

    const r = registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked, branch: 'agent/AF-101',
    });

    expect(r.registered).toBe(true);
    expect(r.agent!.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.agent!.status).toBe('ACTIVE');
    expect(existsSync(join(repo, '.ai', 'agents', 'codex-backend-AF-101.json'))).toBe(true);
  });

  it('refuses a second write agent in the same worktree (§1 rule 1)', () => {
    const linked = join(root, 'wt-shared');
    g(repo, 'worktree', 'add', '-b', 'agent/shared', linked, 'main');

    registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });

    const second = registerAgent(repo, {
      name: 'claude-backend-AF-101', platform: 'claude', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });

    expect(second.registered).toBe(false);
    expect(second.blockers.join(' ')).toMatch(/already owned by ACTIVE write agent/);
    expect(second.blockers.join(' ')).toMatch(/never share a working directory/);
  });

  it('allows a read-only agent to inspect an occupied worktree (§12)', () => {
    const linked = join(root, 'wt-ro');
    g(repo, 'worktree', 'add', '-b', 'agent/ro', linked, 'main');

    registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });
    const reader = registerAgent(repo, {
      name: 'copilot-review-AF-101', platform: 'copilot', role: 'review',
      workItem: 'AF-101', mode: 'READ_ONLY', worktree: linked,
    });

    expect(reader.registered).toBe(true);
  });

  it('refuses a write agent pointed at a copied folder (§10)', () => {
    const copied = join(root, 'copied');
    mkdirSync(copied, { recursive: true });

    const r = registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: copied,
    });

    expect(r.registered).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/WORKTREE_INVALID/);
  });

  it('refuses to re-register an already ACTIVE agent', () => {
    registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'READ_ONLY',
    });
    const again = registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'READ_ONLY',
    });
    expect(again.registered).toBe(false);
    expect(again.blockers.join(' ')).toMatch(/already ACTIVE/);
  });

  it('frees the worktree claim when the agent is released (§13)', () => {
    const linked = join(root, 'wt-rel');
    g(repo, 'worktree', 'add', '-b', 'agent/rel', linked, 'main');

    registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });
    releaseAgent(repo, 'codex-backend-AF-101', 'COMPLETED');

    expect(readAgent(repo, 'codex-backend-AF-101')!.status).toBe('COMPLETED');
    expect(activeAgents(repo)).toEqual([]);

    const successor = registerAgent(repo, {
      name: 'claude-backend-AF-101', platform: 'claude', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });
    expect(successor.registered).toBe(true);
  });

  it('detects a shared-worktree violation created by --force', () => {
    const linked = join(root, 'wt-forced');
    g(repo, 'worktree', 'add', '-b', 'agent/forced', linked, 'main');

    registerAgent(repo, {
      name: 'codex-backend-AF-101', platform: 'codex', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    });
    registerAgent(repo, {
      name: 'claude-backend-AF-101', platform: 'claude', role: 'backend',
      workItem: 'AF-101', mode: 'WRITE', worktree: linked,
    }, { force: true });

    const violations = sharedWorktreeViolations(repo);
    expect(violations.length).toBe(1);
    expect(violations[0].agents.sort()).toEqual(['claude-backend-AF-101', 'codex-backend-AF-101']);
  });

  it('returns an empty list when nothing is registered', () => {
    expect(listAgents(repo)).toEqual([]);
    expect(readAgent(repo, 'nobody-here-AF-101')).toBeNull();
  });
});

describe('dependency graph (§6)', () => {
  it('spans PRD boundaries in one graph', () => {
    seed([
      { id: 'AF-101' },
      { id: 'AF-201', deps: [['AF-101', 'HARD']] },
      { id: 'AF-301', deps: [['AF-101', 'SOFT'], ['AF-201', 'INTEGRATION']] },
    ]);

    const graph = buildDependencyGraph(readLedger(repo)!);
    expect(graph.nodes.size).toBe(3);
    expect(graph.cycles).toEqual([]);
    expect(graph.danglingEdges).toEqual([]);
  });

  it('reports edges pointing at unregistered work items', () => {
    seed([{ id: 'AF-101', deps: [['AF-999', 'HARD']] }]);
    const graph = buildDependencyGraph(readLedger(repo)!);
    expect(graph.danglingEdges).toEqual([{ from: 'AF-101', to: 'AF-999' }]);
  });

  it('detects a dependency cycle', () => {
    seed([
      { id: 'AF-101', deps: [['AF-201', 'HARD']] },
      { id: 'AF-201', deps: [['AF-101', 'HARD']] },
    ]);
    const graph = buildDependencyGraph(readLedger(repo)!);
    expect(graph.cycles.length).toBeGreaterThan(0);
  });

  it('rejects a self-dependency at the source', () => {
    seed([{ id: 'AF-101' }]);
    expect(() => setExecutionPlan(repo, 'AF-101', { dependencies: [{ on: 'AF-101', kind: 'HARD' }] }))
      .toThrow(/cannot depend on itself/);
  });

  it('rejects an unknown dependency kind', () => {
    seed([{ id: 'AF-101' }, { id: 'AF-201' }]);
    expect(() => setExecutionPlan(repo, 'AF-201', {
      dependencies: [{ on: 'AF-101', kind: 'MAYBE' as never }],
    })).toThrow(/unknown kind/);
  });
});

describe('eligibility (§7)', () => {
  it('blocks on an unsatisfied HARD dependency', () => {
    seed([{ id: 'AF-101' }, { id: 'AF-201', deps: [['AF-101', 'HARD']] }]);
    const v = evaluateEligibility(readLedger(repo)!, 'AF-201');
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/DEPENDENCY_BLOCKED: HARD dependency AF-101/);
  });

  it('does not block on SOFT or INTEGRATION dependencies', () => {
    seed([
      { id: 'AF-101' },
      { id: 'AF-201', deps: [['AF-101', 'SOFT']] },
      { id: 'AF-301', deps: [['AF-101', 'INTEGRATION']] },
    ]);
    const ledger = readLedger(repo)!;
    expect(evaluateEligibility(ledger, 'AF-201').eligible).toBe(true);
    expect(evaluateEligibility(ledger, 'AF-301').eligible).toBe(true);
  });

  it('unblocks once the prerequisite is INTEGRATED', () => {
    seed([{ id: 'AF-101' }, { id: 'AF-201', deps: [['AF-101', 'HARD']] }]);
    updateMission(repo, 'AF-101', (m) => { m.execution.status = 'INTEGRATED'; });
    expect(evaluateEligibility(readLedger(repo)!, 'AF-201').eligible).toBe(true);
  });

  it('reports a recorded blocker as an eligibility reason', () => {
    seed([{ id: 'AF-101' }]);
    recordBlocker(repo, 'AF-101', 'ENVIRONMENT_FAILURE', 'dotnet SDK missing');
    const v = evaluateEligibility(readLedger(repo)!, 'AF-101');
    expect(v.eligible).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/ENVIRONMENT_FAILURE/);

    clearBlockers(repo, 'AF-101');
    updateMission(repo, 'AF-101', (m) => { m.execution.status = 'PLANNED'; });
    expect(evaluateEligibility(readLedger(repo)!, 'AF-101').eligible).toBe(true);
  });

  it('rejects an unknown failure code', () => {
    seed([{ id: 'AF-101' }]);
    expect(() => recordBlocker(repo, 'AF-101', 'VIBES_OFF' as never, 'x')).toThrow(/Unknown failure code/);
  });
});

describe('wave planning (§7, §14)', () => {
  it('dispatches independent work together', () => {
    seed([
      { id: 'AF-101', writes: ['src/a.ts'] },
      { id: 'AF-201', writes: ['src/b.ts'] },
    ]);
    const plan = planWave(repo);
    expect(plan.items.sort()).toEqual(['AF-101', 'AF-201']);
    expect(plan.deferred).toEqual([]);
  });

  it('defers an item that would collide on an architectural primitive (§14)', () => {
    seed([
      { id: 'AF-101', writes: ['src/routes.ts'] },
      { id: 'AF-201', writes: ['src/routes.ts'] },
    ]);
    const plan = planWave(repo);
    expect(plan.items.length).toBe(1);
    expect(plan.deferred.length).toBe(1);
    expect(plan.deferred[0].reason).toMatch(/HARD_COLLISION/);
    expect(plan.deferred[0].reason).toMatch(/SERIALIZE/);
  });

  it('keeps a small soft overlap in the same wave', () => {
    seed([
      { id: 'AF-101', writes: ['src/a.ts', 'src/shared.ts'] },
      { id: 'AF-201', writes: ['src/shared.ts'] },
    ]);
    const plan = planWave(repo);
    expect(plan.items.length).toBe(2);
    expect(plan.collisions.some((c) => c.classification === 'SOFT_OVERLAP')).toBe(true);
  });

  it('excludes work blocked by a HARD dependency', () => {
    seed([{ id: 'AF-101', writes: ['src/a.ts'] }, { id: 'AF-201', deps: [['AF-101', 'HARD']] }]);
    const plan = planWave(repo);
    expect(plan.items).toEqual(['AF-101']);
    expect(plan.ineligible.map((v) => v.workItem)).toEqual(['AF-201']);
  });

  it('honours a wave width cap', () => {
    seed([
      { id: 'AF-101', writes: ['src/a.ts'] },
      { id: 'AF-201', writes: ['src/b.ts'] },
      { id: 'AF-301', writes: ['src/c.ts'] },
    ]);
    const plan = planWave(repo, { maxItems: 2 });
    expect(plan.items.length).toBe(2);
    expect(plan.deferred.length).toBe(1);
    expect(plan.deferred[0].reason).toMatch(/capped at 2/);
  });

  it('schedules nothing while a cycle exists', () => {
    seed([
      { id: 'AF-101', deps: [['AF-201', 'HARD']] },
      { id: 'AF-201', deps: [['AF-101', 'HARD']] },
    ]);
    const plan = planWave(repo);
    expect(plan.items).toEqual([]);
    expect(plan.cycles.length).toBeGreaterThan(0);
  });

  it('returns an empty plan when there is no ledger', () => {
    const plan = planWave(repo);
    expect(plan.items).toEqual([]);
  });
});

describe('wave lifecycle (§7, §39)', () => {
  beforeEach(() => {
    seed([{ id: 'AF-101', writes: ['src/a.ts'] }, { id: 'AF-201', writes: ['src/b.ts'] }]);
  });

  it('marks members READY and records the active wave', () => {
    dispatchWave(repo, 'WAVE-01', ['AF-101', 'AF-201']);
    const ledger = readLedger(repo)!;
    expect(ledger.active_wave).toBe('WAVE-01');
    expect(ledger.missions['AF-101'].execution.status).toBe('READY');
    expect(ledger.missions['AF-101'].execution.wave).toBe('WAVE-01');
  });

  it('refuses to dispatch a second wave while one is open (§7)', () => {
    dispatchWave(repo, 'WAVE-01', ['AF-101']);
    expect(() => dispatchWave(repo, 'WAVE-02', ['AF-201'])).toThrow(/still active/);
  });

  it('refuses to dispatch an unknown work item', () => {
    expect(() => dispatchWave(repo, 'WAVE-01', ['AF-999'])).toThrow(/Unknown work item/);
  });

  it('will not close while any item is ambiguously in flight (§39)', () => {
    dispatchWave(repo, 'WAVE-01', ['AF-101', 'AF-201']);
    setExecutionStatus(repo, 'AF-101', 'IN_PROGRESS');

    const unresolved = completeWave(repo, 'WAVE-01');
    expect(unresolved.sort()).toEqual(['AF-101', 'AF-201']);
    expect(readLedger(repo)!.active_wave).toBe('WAVE-01');
  });

  it('closes once every item is resolved, freeing the next wave', () => {
    dispatchWave(repo, 'WAVE-01', ['AF-101', 'AF-201']);
    recordBlocker(repo, 'AF-101', 'DEPENDENCY_BLOCKED', 'upstream not ready');
    setExecutionStatus(repo, 'AF-201', 'REJECTED');

    expect(unresolvedWaveItems(repo, 'WAVE-01')).toEqual([]);
    expect(completeWave(repo, 'WAVE-01')).toEqual([]);
    expect(readLedger(repo)!.active_wave).toBeUndefined();
    expect(readLedger(repo)!.waves['WAVE-01'].completed_at_utc).toBeTruthy();
  });
});

describe('execution status gating (§17, §32)', () => {
  beforeEach(() => { seed([{ id: 'AF-101' }]); });

  it('recognises the full vocabulary and nothing else', () => {
    for (const s of EXECUTION_STATUSES) expect(isExecutionStatus(s)).toBe(true);
    expect(isExecutionStatus('almost done')).toBe(false);
    expect(isExecutionStatus('probably fixed')).toBe(false);
  });

  it('refuses INTEGRATION_READY without a worker commit (§32)', () => {
    const t = setExecutionStatus(repo, 'AF-101', 'INTEGRATION_READY');
    expect(t.accepted).toBe(false);
    expect(t.blockers.join(' ')).toMatch(/requires a worker commit/);
  });

  it('allows INTEGRATION_READY once a commit is recorded', () => {
    updateMission(repo, 'AF-101', (m) => { m.worker_sha = 'a'.repeat(40); });
    expect(setExecutionStatus(repo, 'AF-101', 'INTEGRATION_READY').accepted).toBe(true);
  });

  it('refuses INTEGRATION_READY while a blocker stands', () => {
    updateMission(repo, 'AF-101', (m) => { m.worker_sha = 'a'.repeat(40); });
    recordBlocker(repo, 'AF-101', 'TEST_FAILURE', 'suite red');
    const t = setExecutionStatus(repo, 'AF-101', 'INTEGRATION_READY');
    expect(t.accepted).toBe(false);
    expect(t.blockers.join(' ')).toMatch(/TEST_FAILURE/);
  });

  it('refuses INTEGRATED until the governance plane validated it', () => {
    const t = setExecutionStatus(repo, 'AF-101', 'INTEGRATED');
    expect(t.accepted).toBe(false);
    expect(t.blockers.join(' ')).toMatch(/integration_status=INTEGRATION_VALIDATED/);
  });

  it('refuses VERIFIED until acceptance passed — IMPLEMENTED is not VERIFIED (§17)', () => {
    const t = setExecutionStatus(repo, 'AF-101', 'VERIFIED');
    expect(t.accepted).toBe(false);
    expect(t.blockers.join(' ')).toMatch(/IMPLEMENTED is not VERIFIED/);
  });

  it('rejects an invented status', () => {
    expect(() => setExecutionStatus(repo, 'AF-101', 'looks good' as never)).toThrow(/Unknown execution status/);
  });
});

describe('cross-plane reconciliation', () => {
  it('flags a scheduler claim the evidence gate never validated', () => {
    seed([{ id: 'AF-101' }]);
    setExecutionStatus(repo, 'AF-101', 'INTEGRATED', { force: true });

    const discrepancies = reconcileLedger(repo);
    const claim = discrepancies.find((d) => d.field === 'execution.status');
    expect(claim).toBeDefined();
    expect(claim!.reality).toMatch(/not INTEGRATION_VALIDATED/);
  });

  it('flags a dependency on an unregistered work item', () => {
    seed([{ id: 'AF-101', deps: [['AF-999', 'HARD']] }]);
    const d = reconcileLedger(repo).find((x) => x.field === 'execution.dependencies');
    expect(d?.claim).toBe('AF-999');
  });

  it('is silent when both planes agree', () => {
    seed([{ id: 'AF-101' }]);
    setExecutionStatus(repo, 'AF-101', 'IN_PROGRESS');
    expect(reconcileLedger(repo)).toEqual([]);
  });
});

describe('integration order (§33)', () => {
  it('places prerequisites before dependents regardless of input order', () => {
    seed([
      { id: 'AF-101' },
      { id: 'AF-201', deps: [['AF-101', 'HARD']] },
      { id: 'AF-301', deps: [['AF-201', 'HARD']] },
    ]);
    const order = integrationOrder(readLedger(repo)!, ['AF-301', 'AF-101', 'AF-201']);
    expect(order.indexOf('AF-101')).toBeLessThan(order.indexOf('AF-201'));
    expect(order.indexOf('AF-201')).toBeLessThan(order.indexOf('AF-301'));
  });

  it('ignores dependencies outside the selected set', () => {
    seed([{ id: 'AF-101' }, { id: 'AF-201', deps: [['AF-101', 'HARD']] }]);
    expect(integrationOrder(readLedger(repo)!, ['AF-201'])).toEqual(['AF-201']);
  });
});

describe('baseline and integrations (§11, §33, §34)', () => {
  it('records the exact SHA, not a moving branch name', () => {
    seed([{ id: 'AF-101' }]);
    const sha = g(repo, 'rev-parse', 'HEAD');
    setBaseline(repo, { branch: 'main', sha });

    const ledger = readLedger(repo)!;
    expect(ledger.baseline!.sha).toBe(sha);
    expect(ledger.authoritative_sha).toBe(sha);
    expect(ledger.baseline!.resolved_at_utc).toBeTruthy();
  });

  it('advances the baseline when an integration reports a new one', () => {
    seed([{ id: 'AF-101' }]);
    setBaseline(repo, { branch: 'main', sha: 'a'.repeat(40) });
    recordIntegration(repo, {
      work_item: 'AF-101', integration_sha: 'b'.repeat(40),
      method: 'DIRECT_ANCESTRY', resulting_baseline_sha: 'c'.repeat(40),
    });

    const ledger = readLedger(repo)!;
    expect(ledger.integrations.length).toBe(1);
    expect(ledger.baseline!.sha).toBe('c'.repeat(40));
  });
});

describe('orchestration summary', () => {
  it('surfaces cycles, dangling edges and unresolved items', () => {
    seed([
      { id: 'AF-101', writes: ['src/a.ts'], deps: [['AF-999', 'HARD']] },
      { id: 'AF-201', writes: ['src/b.ts'] },
    ]);
    dispatchWave(repo, 'WAVE-01', ['AF-101', 'AF-201']);

    const summary = orchestrationSummary(repo);
    expect(summary.active_wave).toBe('WAVE-01');
    expect(summary.unresolved_items.sort()).toEqual(['AF-101', 'AF-201']);
    expect(summary.dangling_dependencies).toEqual([{ from: 'AF-101', to: 'AF-999' }]);
  });

  it('is safe on a repository with no ledger', () => {
    const summary = orchestrationSummary(repo);
    expect(summary.active_agents).toBe(0);
    expect(summary.unresolved_items).toEqual([]);
  });
});

describe('backward compatibility', () => {
  it('normalises a ledger written before the execution plane existed', () => {
    initLedger(repo, 'demo', 'main');
    upsertMission(repo, 'AF-101', 'Legacy');

    // Simulate an older document: strip the execution block and new collections.
    const path = join(repo, '.ai', 'ledger.json');
    const raw = JSON.parse(execFileSync('cat', [path], { encoding: 'utf-8' }));
    delete raw.missions['AF-101'].execution;
    delete raw.waves;
    delete raw.integrations;
    writeFileSync(path, JSON.stringify(raw, null, 2), 'utf-8');

    const ledger = readLedger(repo)!;
    expect(ledger.missions['AF-101'].execution.status).toBe('PLANNED');
    expect(ledger.waves).toEqual({});
    expect(ledger.integrations).toEqual([]);
    expect(getMission(repo, 'AF-101')!.execution.dependencies).toEqual([]);
  });
});

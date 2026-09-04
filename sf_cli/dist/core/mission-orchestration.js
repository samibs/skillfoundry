// Governed Mission Protocol — agent registry, dependency graph, wave planning.
//
// Implements MULTI_AGENT_PROTOCOL §6-§9 and §33. The central rule:
//
//   Parallelize independent work, serialize dependent or colliding work, and make all
//   execution state recoverable without relying on chat memory.
//
// Two invariants are enforced here rather than trusted to a prompt, because violating
// either corrupts the repository rather than merely producing a bad answer:
//
//   §1 rule 1  Parallel writers never share a working directory.
//   §7         Only work whose HARD dependencies are satisfied is wave-eligible.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aiDir, AGENTS_DIR, readLedger, assertMissionId, } from './mission-ledger.js';
import { analyzeCollision } from './mission-provenance.js';
import { isNativeWorktree, revParse } from './mission-git.js';
import { getLogger } from '../utils/logger.js';
/**
 * Agent names are `<platform>-<role>-<work-item>`, and become filenames — so they are
 * bounded and free of path separators. Anonymous subagents are prohibited during
 * orchestrated execution (§8).
 */
const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
/**
 * Validate an agent name.
 *
 * @throws {Error} When the name is empty, over-long, or contains path separators.
 */
export function assertAgentName(name) {
    if (!AGENT_NAME_PATTERN.test(name)) {
        throw new Error(`Invalid agent name "${name}": expected 3-80 chars of [A-Za-z0-9._-] starting alphanumeric. ` +
            'Convention: <platform>-<role>-<work-item>, e.g. codex-backend-AF-302.');
    }
}
/** Absolute path of the agent registry directory. */
export function agentsDir(workDir) {
    return join(aiDir(workDir), AGENTS_DIR);
}
/** Absolute path of one agent's registration. */
export function agentPath(workDir, name) {
    assertAgentName(name);
    return join(agentsDir(workDir), `${name}.json`);
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
/** Read one agent registration, or null when it is not registered. */
export function readAgent(workDir, name) {
    const p = agentPath(workDir, name);
    if (!existsSync(p))
        return null;
    try {
        return JSON.parse(readFileSync(p, 'utf-8'));
    }
    catch {
        return null;
    }
}
/** Every registered agent, in name order. A corrupt record is skipped, not fatal. */
export function listAgents(workDir) {
    const dir = agentsDir(workDir);
    if (!existsSync(dir))
        return [];
    const out = [];
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.json'))
            continue;
        try {
            out.push(JSON.parse(readFileSync(join(dir, file), 'utf-8')));
        }
        catch {
            // A corrupt registration proves nothing; treat the agent as unregistered.
        }
    }
    return out;
}
/** Agents currently holding a claim on the repository. */
export function activeAgents(workDir) {
    return listAgents(workDir).filter((a) => a.status === 'ACTIVE');
}
/**
 * Register an agent, refusing any registration that would let two writers share a tree.
 *
 * The worktree-exclusivity check is the load-bearing one (§1 rule 1, §12): a worktree
 * has exactly one owning write agent. Two writers in one directory corrupt each other's
 * work in a way no later merge can untangle.
 *
 * @param spec - Agent identity and the tree it intends to occupy.
 * @param opts.force - Register despite blockers. Blockers are still returned.
 * @returns The registration outcome, including refusal reasons.
 * @throws {Error} When the agent name or work item is malformed.
 */
export function registerAgent(workDir, spec, opts = {}) {
    assertAgentName(spec.name);
    assertMissionId(spec.workItem);
    const blockers = [];
    const existing = readAgent(workDir, spec.name);
    if (existing && existing.status === 'ACTIVE') {
        blockers.push(`Agent "${spec.name}" is already ACTIVE (started ${existing.startedAt}). Release it before re-registering.`);
    }
    if (spec.mode === 'WRITE' && spec.worktree) {
        const target = resolve(spec.worktree);
        // §1 rule 1 / §12 — one worktree, one owning write agent.
        const conflict = activeAgents(workDir).find((a) => a.name !== spec.name && a.mode === 'WRITE' && a.worktree && resolve(a.worktree) === target);
        if (conflict) {
            blockers.push(`Worktree ${spec.worktree} is already owned by ACTIVE write agent "${conflict.name}" ` +
                `(work item ${conflict.workItem}). Parallel writers never share a working directory (§1 rule 1).`);
        }
        // §10 — a copied repository directory is not a worktree.
        if (existsSync(target) && !isNativeWorktree(target).registered) {
            blockers.push(`WORKTREE_INVALID: ${spec.worktree} is not registered in \`git worktree list --porcelain\`. ` +
                'Create it with `git worktree add` — a copied folder is not a worktree (§10).');
        }
    }
    if (blockers.length > 0 && !opts.force) {
        getLogger().warn('mission', 'agent_registration_refused', { name: spec.name, blockers: blockers.length });
        return { registered: false, blockers };
    }
    const agent = {
        ...spec,
        // Record the resolved SHA, never a moving branch name (§11).
        baseSha: spec.baseSha ?? (spec.worktree && existsSync(spec.worktree) ? revParse(spec.worktree, 'HEAD') ?? undefined : undefined),
        status: 'ACTIVE',
        startedAt: new Date().toISOString(),
    };
    writeJsonAtomic(agentPath(workDir, spec.name), agent);
    getLogger().info('mission', 'agent_registered', { name: agent.name, mode: agent.mode, workItem: agent.workItem });
    return { registered: true, agent, blockers: opts.force ? blockers : [] };
}
/**
 * Mark an agent finished and release its worktree claim (§13).
 *
 * @returns The updated record, or null when the agent was never registered.
 */
export function releaseAgent(workDir, name, status = 'RELEASED') {
    const agent = readAgent(workDir, name);
    if (!agent)
        return null;
    agent.status = status;
    agent.endedAt = new Date().toISOString();
    writeJsonAtomic(agentPath(workDir, name), agent);
    getLogger().info('mission', 'agent_released', { name, status });
    return agent;
}
/** Worktrees claimed by more than one ACTIVE write agent — always a corruption risk. */
export function sharedWorktreeViolations(workDir) {
    const byTree = new Map();
    for (const agent of activeAgents(workDir)) {
        if (agent.mode !== 'WRITE' || !agent.worktree)
            continue;
        const key = resolve(agent.worktree);
        byTree.set(key, [...(byTree.get(key) ?? []), agent.name]);
    }
    return [...byTree.entries()]
        .filter(([, names]) => names.length > 1)
        .map(([worktree, agents]) => ({ worktree, agents }));
}
/**
 * Build the dependency graph across ALL selected work, not per PRD (§6).
 *
 * Dependencies routinely cross PRD boundaries; a per-PRD graph schedules work in
 * filename order and deadlocks on the first cross-PRD edge.
 */
export function buildDependencyGraph(ledger) {
    const nodes = new Map();
    const danglingEdges = [];
    for (const [id, mission] of Object.entries(ledger.missions)) {
        nodes.set(id, mission.execution.dependencies);
    }
    for (const [id, deps] of nodes) {
        for (const dep of deps) {
            if (!nodes.has(dep.on))
                danglingEdges.push({ from: id, to: dep.on });
        }
    }
    return { nodes, cycles: findCycles(nodes), danglingEdges };
}
/** Detect dependency cycles via depth-first search with an on-stack marker. */
function findCycles(nodes) {
    const cycles = [];
    const state = new Map();
    const stack = [];
    const visit = (id) => {
        const current = state.get(id);
        if (current === 'done')
            return;
        if (current === 'visiting') {
            const start = stack.indexOf(id);
            if (start !== -1)
                cycles.push([...stack.slice(start), id]);
            return;
        }
        state.set(id, 'visiting');
        stack.push(id);
        for (const dep of nodes.get(id) ?? []) {
            if (nodes.has(dep.on))
                visit(dep.on);
        }
        stack.pop();
        state.set(id, 'done');
    };
    for (const id of nodes.keys())
        visit(id);
    return cycles;
}
/** Execution states that mean a dependency is satisfied for scheduling purposes. */
const SATISFIED = ['INTEGRATED', 'VERIFIED'];
/**
 * Decide whether a work item may enter the next wave (§7).
 *
 * HARD dependencies must be satisfied. SOFT dependencies may proceed against a stable
 * contract, and INTEGRATION dependencies allow independent implementation — so neither
 * blocks dispatch, but both remain visible in the graph so the orchestrator sees what
 * it is accepting.
 */
export function evaluateEligibility(ledger, workItem) {
    const mission = ledger.missions[workItem];
    if (!mission) {
        return { workItem, eligible: false, reasons: ['Work item is not registered in the ledger'] };
    }
    const reasons = [];
    const status = mission.execution.status;
    if (SATISFIED.includes(status) || status === 'REJECTED') {
        reasons.push(`Already resolved (${status})`);
    }
    if (status === 'IN_PROGRESS' || status === 'TESTING') {
        reasons.push(`Already dispatched (${status})`);
    }
    if (mission.execution.blockers.length > 0) {
        reasons.push(`Blocked: ${mission.execution.blockers.join('; ')}`);
    }
    for (const dep of mission.execution.dependencies) {
        const target = ledger.missions[dep.on];
        if (!target) {
            reasons.push(`DEPENDENCY_BLOCKED: "${dep.on}" is not registered — unknown dependencies are not assumed away (§6)`);
            continue;
        }
        if (dep.kind === 'HARD' && !SATISFIED.includes(target.execution.status)) {
            reasons.push(`DEPENDENCY_BLOCKED: HARD dependency ${dep.on} is ${target.execution.status}, not INTEGRATED`);
        }
    }
    return { workItem, eligible: reasons.length === 0, reasons };
}
/**
 * Compute the next executable wave (§7, §14).
 *
 * Eligible items are admitted one at a time; any item that would collide with one
 * already admitted is deferred to a later wave rather than dispatched alongside it.
 * That is the point: write collisions are detected before dispatch, not resolved as
 * merge conflicts afterwards.
 *
 * A dependency cycle yields an empty wave — scheduling anything inside a cycle would
 * be arbitrary, so the cycle is reported for a human to break.
 *
 * @param opts.maxItems - Cap on wave width, for cost or capacity reasons.
 * @param opts.only - Restrict planning to these work items.
 */
export function planWave(workDir, opts = {}) {
    const ledger = readLedger(workDir);
    if (!ledger) {
        return { items: [], deferred: [], ineligible: [], collisions: [], cycles: [] };
    }
    const graph = buildDependencyGraph(ledger);
    if (graph.cycles.length > 0) {
        return { items: [], deferred: [], ineligible: [], collisions: [], cycles: graph.cycles };
    }
    const candidates = (opts.only ?? Object.keys(ledger.missions)).filter((id) => ledger.missions[id]);
    const verdicts = candidates.map((id) => evaluateEligibility(ledger, id));
    const eligible = verdicts.filter((v) => v.eligible).map((v) => v.workItem);
    const ineligible = verdicts.filter((v) => !v.eligible);
    // Dependency depth first, then id — deeper prerequisites unblock more downstream work.
    const depth = new Map();
    const computeDepth = (id, seen = new Set()) => {
        if (depth.has(id))
            return depth.get(id);
        if (seen.has(id))
            return 0;
        seen.add(id);
        const deps = ledger.missions[id]?.execution.dependencies ?? [];
        const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((x) => computeDepth(x.on, seen)));
        depth.set(id, d);
        return d;
    };
    eligible.sort((a, b) => computeDepth(a) - computeDepth(b) || a.localeCompare(b));
    const items = [];
    const deferred = [];
    const collisions = [];
    for (const candidate of eligible) {
        if (opts.maxItems !== undefined && items.length >= opts.maxItems) {
            deferred.push({ workItem: candidate, reason: `Wave capped at ${opts.maxItems} item(s)` });
            continue;
        }
        const candidateManifest = ledger.missions[candidate].execution.write_manifest;
        let blockedBy = null;
        for (const admitted of items) {
            const report = analyzeCollision(admitted, ledger.missions[admitted].execution.write_manifest, candidate, candidateManifest);
            if (report.shared_files.length > 0)
                collisions.push(report);
            if (report.classification === 'HARD_COLLISION' || report.classification === 'SHARED_HOTSPOT') {
                blockedBy = report;
                break;
            }
        }
        if (blockedBy) {
            deferred.push({
                workItem: candidate,
                reason: `${blockedBy.classification} with ${blockedBy.worker_a}: ${blockedBy.recommendation}`,
            });
        }
        else {
            items.push(candidate);
        }
    }
    return { items, deferred, ineligible, collisions, cycles: [] };
}
/**
 * Order work items for serial integration (§33).
 *
 * Integration follows dependency order, never worker completion time — merging a
 * dependent contribution before its prerequisite produces a tree that never existed
 * in any worker's worktree.
 *
 * @returns Work items in an order where every dependency precedes its dependent.
 */
export function integrationOrder(ledger, workItems) {
    const selected = new Set(workItems.filter((id) => ledger.missions[id]));
    const ordered = [];
    const state = new Map();
    const visit = (id) => {
        if (state.get(id) === 'done' || state.get(id) === 'visiting')
            return;
        state.set(id, 'visiting');
        for (const dep of ledger.missions[id]?.execution.dependencies ?? []) {
            if (selected.has(dep.on))
                visit(dep.on);
        }
        state.set(id, 'done');
        ordered.push(id);
    };
    for (const id of [...selected].sort())
        visit(id);
    return ordered;
}
/** Summarise the orchestration plane, surfacing anything that blocks the next wave. */
export function orchestrationSummary(workDir) {
    const ledger = readLedger(workDir);
    if (!ledger) {
        return {
            active_agents: 0, shared_worktree_violations: [], unresolved_items: [],
            dangling_dependencies: [], cycles: [],
        };
    }
    const graph = buildDependencyGraph(ledger);
    const wave = ledger.active_wave ? ledger.waves[ledger.active_wave] : undefined;
    const resolved = ['INTEGRATED', 'BLOCKED', 'REJECTED', 'VERIFIED'];
    return {
        active_wave: ledger.active_wave,
        baseline_sha: ledger.baseline?.sha,
        active_agents: activeAgents(workDir).length,
        shared_worktree_violations: sharedWorktreeViolations(workDir),
        unresolved_items: (wave?.items ?? []).filter((id) => !resolved.includes(ledger.missions[id]?.execution.status ?? 'PLANNED')),
        dangling_dependencies: graph.danglingEdges,
        cycles: graph.cycles,
    };
}
/** Convenience accessor for a work item's execution block. */
export function executionOf(ledger, workItem) {
    return ledger.missions[workItem]?.execution ?? null;
}
//# sourceMappingURL=mission-orchestration.js.map
// Delivery Efficiency — shared mission context and worker handoffs.
//
// The waste this closes is repository archaeology: five workers each independently
// discovering the same architecture, re-reading the same PRD, and re-deriving the same
// list of affected services. That work is not free, and after the first time it is not
// engineering — it is rediscovery.
//
// So facts established once are shared, and each fact carries how much it can be trusted:
// an authoritative fact from the task specification is not the same thing as an agent's
// inference, and neither is an unverified assumption. Marking them alike is how a guess
// silently becomes a premise.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { treeSha, revParse } from './mission-git.js';
import { getLogger } from '../utils/logger.js';
const STORE_DIR = '.skillfoundry';
const STORE_FILE = 'delivery-context.json';
/** How far a fact can be trusted without re-deriving it. */
export const FACT_CONFIDENCES = ['AUTHORITATIVE', 'INFERRED', 'ASSUMPTION'];
/** Runtime guard for the confidence vocabulary. */
export function isFactConfidence(value) {
    return typeof value === 'string' && FACT_CONFIDENCES.includes(value);
}
function storePath(workDir) {
    return join(resolve(workDir), STORE_DIR, STORE_FILE);
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
/** Read the shared context, creating an empty one for the mission when absent. */
export function loadContext(workDir, mission = 'default') {
    const p = storePath(workDir);
    if (existsSync(p)) {
        try {
            const parsed = JSON.parse(readFileSync(p, 'utf-8'));
            parsed.facts ??= [];
            parsed.handoffs ??= [];
            if (parsed.mission === mission)
                return parsed;
        }
        catch {
            // A corrupt context proves nothing; start clean rather than failing the run.
        }
    }
    return {
        mission,
        repository: resolve(workDir),
        baseCommit: revParse(workDir, 'HEAD'),
        treeSha: treeSha(workDir, 'HEAD'),
        facts: [],
        handoffs: [],
        updatedAt: new Date().toISOString(),
    };
}
/** Persist the shared context. */
export function saveContext(workDir, context) {
    context.updatedAt = new Date().toISOString();
    writeJsonAtomic(storePath(workDir), context);
}
/**
 * Record a fact so other workers do not re-derive it.
 *
 * Re-recording the same key replaces the previous value, and an upgrade in confidence is
 * kept: once an inference is confirmed authoritatively, it should stop being re-checked.
 *
 * @param dependsOn - Files the fact depends on. Supply them: without them the fact can
 *        only be invalidated wholesale, which wastes the sharing it was meant to enable.
 */
export function recordFact(workDir, mission, fact) {
    const context = loadContext(workDir, mission);
    const stored = { ...fact, at: new Date().toISOString() };
    const idx = context.facts.findIndex((f) => f.key === fact.key);
    if (idx === -1)
        context.facts.push(stored);
    else
        context.facts[idx] = stored;
    saveContext(workDir, context);
    return stored;
}
/** Read a fact by key. Invalidated facts are returned so callers can see they lapsed. */
export function getFact(workDir, mission, key) {
    return loadContext(workDir, mission).facts.find((f) => f.key === key) ?? null;
}
/** Every fact currently holding, optionally filtered by confidence. */
export function validFacts(workDir, mission, confidence) {
    return loadContext(workDir, mission).facts.filter((f) => !f.invalidated && (!confidence || f.confidence === confidence));
}
/**
 * Invalidate facts that depended on changed files (§14).
 *
 * Facts are marked, not deleted: a worker that acted on a now-lapsed fact needs to be
 * able to see that it lapsed, and why.
 *
 * @returns The keys invalidated.
 */
export function invalidateFactsForFiles(workDir, mission, changedFiles) {
    if (changedFiles.length === 0)
        return [];
    const context = loadContext(workDir, mission);
    const changed = new Set(changedFiles);
    const invalidated = [];
    for (const fact of context.facts) {
        if (fact.invalidated)
            continue;
        const hit = fact.dependsOn.filter((f) => changed.has(f));
        if (hit.length > 0) {
            fact.invalidated = true;
            fact.invalidatedReason = `Depends on changed file(s): ${hit.slice(0, 5).join(', ')}`;
            invalidated.push(fact.key);
        }
    }
    if (invalidated.length > 0) {
        saveContext(workDir, context);
        getLogger().info('delivery', 'context_facts_invalidated', { count: invalidated.length });
    }
    return invalidated;
}
/**
 * Decide whether a fact must be re-derived (§6).
 *
 * An agent must prefer facts already established in the mission. It re-derives only when
 * the repository state changed, the fact lapsed, the fact is merely an assumption, or
 * safety requires independent verification.
 *
 * @param opts.safetyCritical - Force verification regardless of what is on record. A
 *        HIGH-risk change does not inherit another agent's assumptions.
 */
export function shouldRediscover(workDir, mission, key, opts = {}) {
    const fact = getFact(workDir, mission, key);
    if (!fact) {
        return { rediscover: true, reason: `"${key}" has not been established yet.` };
    }
    if (fact.invalidated) {
        return { rediscover: true, reason: `"${key}" lapsed: ${fact.invalidatedReason ?? 'invalidated'}.`, fact };
    }
    if (opts.safetyCritical && fact.confidence !== 'AUTHORITATIVE') {
        return {
            rediscover: true,
            reason: `"${key}" is ${fact.confidence} and this change is safety-critical — verify rather than inherit.`,
            fact,
        };
    }
    if (fact.confidence === 'ASSUMPTION') {
        return { rediscover: true, reason: `"${key}" is an unverified assumption, not an established fact.`, fact };
    }
    getLogger().info('delivery', 'rediscovery_avoided', { key, confidence: fact.confidence });
    return {
        rediscover: false,
        reason: `"${key}" is already established (${fact.confidence}, from ${fact.source}). Reuse it.`,
        fact,
    };
}
// ── Handoffs (§10) ────────────────────────────────────────────────────────────
/**
 * Record a finished worker's compact handoff (§10).
 *
 * The handoff exists so the integrator can decide what still needs proving without
 * repeating the worker's investigation — the worker reports what it did and what it
 * proved, not how it got there.
 */
export function recordHandoff(workDir, mission, handoff) {
    const context = loadContext(workDir, mission);
    const stored = { ...handoff, at: new Date().toISOString() };
    const idx = context.handoffs.findIndex((h) => h.taskId === handoff.taskId);
    if (idx === -1)
        context.handoffs.push(stored);
    else
        context.handoffs[idx] = stored;
    saveContext(workDir, context);
    getLogger().info('delivery', 'worker_handoff_recorded', {
        task: handoff.taskId,
        budget: handoff.budget,
        scope: handoff.validationScope,
        reused: handoff.evidenceReused.length,
    });
    return stored;
}
/** Handoffs recorded so far, oldest first. */
export function listHandoffs(workDir, mission) {
    return loadContext(workDir, mission).handoffs;
}
/** The union of every file changed across a set of handoffs. */
export function aggregateChangedFiles(handoffs) {
    return [...new Set(handoffs.flatMap((h) => h.changedFiles))].sort();
}
/** Summarise the shared context for `$context` and reports. */
export function summarizeContext(workDir, mission) {
    const ctx = loadContext(workDir, mission);
    const current = treeSha(workDir, 'HEAD');
    return {
        mission: ctx.mission,
        baseCommit: ctx.baseCommit,
        authoritative: ctx.facts.filter((f) => !f.invalidated && f.confidence === 'AUTHORITATIVE').length,
        inferred: ctx.facts.filter((f) => !f.invalidated && f.confidence === 'INFERRED').length,
        assumptions: ctx.facts.filter((f) => !f.invalidated && f.confidence === 'ASSUMPTION').length,
        invalidated: ctx.facts.filter((f) => f.invalidated).length,
        handoffs: ctx.handoffs.length,
        evidenceReused: ctx.handoffs.reduce((n, h) => n + h.evidenceReused.length, 0),
        evidenceGenerated: ctx.handoffs.reduce((n, h) => n + h.evidenceGenerated.length, 0),
        stale: Boolean(current && ctx.treeSha && current !== ctx.treeSha),
    };
}
//# sourceMappingURL=delivery-context.js.map
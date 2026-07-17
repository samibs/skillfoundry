// Pipeline State — bridges the forge pipeline to the AgentOS State Kernel.
//
// Follow-up 1 (per-story slice streaming): the pipeline creates a run kernel up front
// and streams one slice per story as it finishes, so `.skillfoundry/runs/<id>/state/
// state.json` reflects progress mid-run and is inspectable at any moment — not only at
// the end. The run-level outcome (forge_state + build_status) is recorded through the
// gate barrier at completion.
//
// Everything here is ADVISORY: each entry point is wrapped so a state failure logs a
// warning and never breaks a run (mirrors the codemap pre-flight contract).
import { join, basename } from 'node:path';
import { mkdirSync } from 'node:fs';
import { StateKernel } from './state.js';
import { GateBarrier, fromGateSummary } from './state-gate-barrier.js';
import { getLogger } from '../utils/logger.js';
const log = getLogger();
/** Derive a stable, filesystem-free slice key for a story file. */
export function storySliceName(storyFile) {
    return `story:${basename(storyFile).replace(/\.md$/i, '')}`;
}
/**
 * Create the per-run state kernel under `<runsDir>/<runId>/`. Returns the kernel, or
 * `null` if initialization fails (advisory — the caller continues without state).
 */
export function initRunState(runsDir, runId) {
    try {
        const runStateDir = join(runsDir, runId);
        mkdirSync(runStateDir, { recursive: true });
        const kernel = StateKernel.create(runStateDir, runId);
        log.info('persist', 'run_state_init', { runId, path: kernel.path });
        return kernel;
    }
    catch (err) {
        log.warn('persist', 'run_state_init_failed', { runId, error: String(err) });
        return null;
    }
}
/**
 * Stream one story's outcome to its own slice. A completed story commits its metrics; a
 * failed story marks the slice `FAILED` with a structured error log and flips the run
 * build_status to FAILING (per-slice halt — other story slices are untouched).
 *
 * No-op when `kernel` is null. Never throws.
 */
export function streamStorySlice(kernel, storyFile, outcome) {
    if (!kernel)
        return;
    const slice = storySliceName(storyFile);
    try {
        if (outcome.status === 'failed') {
            const errors = [
                { tier: 'FORGE', name: slice, detail: outcome.reason ?? 'story failed' },
            ];
            kernel.commitSlice(slice, 'forge', { status: 'FAILED', error_logs: errors, cost_usd: outcome.costUsd, turns: outcome.turnCount }, 0);
            kernel.setBuildStatus('FAILING');
        }
        else {
            kernel.commitSlice(slice, 'forge', {
                status: 'completed',
                cost_usd: outcome.costUsd,
                turns: outcome.turnCount,
                tests_missing: outcome.testsMissing ?? false,
            }, 0);
        }
    }
    catch (err) {
        log.warn('persist', 'story_slice_failed', { slice, error: String(err) });
    }
}
/**
 * Record the run-level outcome through the gate barrier: a `forge_state` slice carrying
 * story/gate counts, and — only on a clean gate PASS with zero failed stories — a
 * PASSING build status. On a failing gate the barrier marks the slice FAILED and sets
 * build_status FAILING (determinism boundary — the gate decides, not the agent).
 *
 * No-op when `kernel` is null. Never throws.
 */
export async function recordRunOutcome(kernel, gateSummary, counts) {
    if (!kernel)
        return;
    try {
        const barrier = new GateBarrier(kernel, () => fromGateSummary(gateSummary));
        const outcome = await barrier.commit({
            slice: 'forge_state',
            owner: 'forge',
            data: {
                stories_total: counts.storiesTotal,
                stories_completed: counts.storiesCompleted,
                stories_failed: counts.storiesFailed,
                gates_passed: gateSummary.passed,
                gates_failed: gateSummary.failed,
                gates_warned: gateSummary.warned,
            },
        }, 0);
        if (gateSummary.verdict === 'PASS' && counts.storiesFailed === 0) {
            kernel.setBuildStatus('PASSING');
        }
        log.info('persist', 'run_state_recorded', {
            committed: outcome.committed,
            buildStatus: kernel.getBuildStatus(),
        });
    }
    catch (err) {
        log.warn('persist', 'run_state_record_failed', { error: String(err) });
    }
}
//# sourceMappingURL=pipeline-state.js.map
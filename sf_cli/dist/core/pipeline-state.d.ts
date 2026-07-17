import { StateKernel } from './state.js';
import type { GateRunSummary } from './gates.js';
/** Outcome of a single story, streamed to its own slice. */
export interface StoryOutcome {
    status: 'completed' | 'failed';
    costUsd: number;
    turnCount: number;
    testsMissing?: boolean;
    /** Short reason when failed — becomes a structured error log. */
    reason?: string;
}
/** Run-level counts recorded at completion. */
export interface RunOutcomeCounts {
    storiesTotal: number;
    storiesCompleted: number;
    storiesFailed: number;
}
/** Derive a stable, filesystem-free slice key for a story file. */
export declare function storySliceName(storyFile: string): string;
/**
 * Create the per-run state kernel under `<runsDir>/<runId>/`. Returns the kernel, or
 * `null` if initialization fails (advisory — the caller continues without state).
 */
export declare function initRunState(runsDir: string, runId: string): StateKernel | null;
/**
 * Stream one story's outcome to its own slice. A completed story commits its metrics; a
 * failed story marks the slice `FAILED` with a structured error log and flips the run
 * build_status to FAILING (per-slice halt — other story slices are untouched).
 *
 * No-op when `kernel` is null. Never throws.
 */
export declare function streamStorySlice(kernel: StateKernel | null, storyFile: string, outcome: StoryOutcome): void;
/**
 * Record the run-level outcome through the gate barrier: a `forge_state` slice carrying
 * story/gate counts, and — only on a clean gate PASS with zero failed stories — a
 * PASSING build status. On a failing gate the barrier marks the slice FAILED and sets
 * build_status FAILING (determinism boundary — the gate decides, not the agent).
 *
 * No-op when `kernel` is null. Never throws.
 */
export declare function recordRunOutcome(kernel: StateKernel | null, gateSummary: GateRunSummary, counts: RunOutcomeCounts): Promise<void>;

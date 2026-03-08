import type { MicroGateResult, StoryExecution } from '../types.js';
export interface HarvestInput {
    runId: string;
    workDir: string;
    storiesCompleted: number;
    storiesFailed: number;
    storiesTotal: number;
    totalCostUsd: number;
    gateVerdict: string;
    gateSummary: {
        passed: number;
        failed: number;
        warned: number;
    } | null;
    storyExecutions: Record<string, StoryExecution>;
    microGateResults: MicroGateResult[];
    prdFiles: string[];
}
export interface HarvestResult {
    entriesWritten: number;
}
/**
 * Extracts knowledge entries from a completed pipeline run and appends
 * them to memory_bank/knowledge/*.jsonl files.
 *
 * @param input - Run data collected during the pipeline DEBRIEF phase
 * @returns The number of entries written
 */
export declare function harvestRunMemory(input: HarvestInput): HarvestResult;

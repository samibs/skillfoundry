import type { BufferedEntry } from './memory-buffer.js';
export interface StoryCompletionEvent {
    storyId: string;
    prdId: string;
    filesCreated: string[];
    filesModified: string[];
    testFilesCreated: string[];
    dependenciesAdded: string[];
    patterns: string[];
}
export interface GateFailureEvent {
    gate: string;
    agent: string;
    storyId: string;
    prdId: string;
    reason: string;
    resolution?: string;
}
export interface FixerInterventionEvent {
    storyId: string;
    prdId: string;
    errorType: string;
    errorFile: string;
    errorMessage: string;
    fixApplied: string;
    attempts: number;
    succeeded: boolean;
}
export interface SessionSummaryEvent {
    storiesCompleted: number;
    storiesTotal: number;
    testFilesCreated: number;
    entriesHarvested: number;
    gateVerdict: string;
}
/**
 * Extract knowledge entries from a completed story.
 * Rule: each significant artifact produces a fact or decision entry.
 */
export declare function harvestStoryCompletion(event: StoryCompletionEvent): BufferedEntry[];
/**
 * Extract knowledge entries from a gate failure.
 * Rule: gate failure + resolution = error entry.
 */
export declare function harvestGateFailure(event: GateFailureEvent): BufferedEntry[];
/**
 * Extract knowledge entries from a fixer intervention.
 * Rule: error + fix attempts + outcome = error entry.
 */
export declare function harvestFixerIntervention(event: FixerInterventionEvent): BufferedEntry[];
/**
 * Generate a session summary fact.
 * Rule: always produced at session close.
 */
export declare function harvestSessionSummary(event: SessionSummaryEvent): BufferedEntry;

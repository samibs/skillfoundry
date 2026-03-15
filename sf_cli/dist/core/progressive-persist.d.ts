import type { PipelinePhase } from '../types.js';
export interface StoryDeliverable {
    storyFile: string;
    status: 'completed' | 'failed';
    filesCreated: string[];
    filesModified: string[];
    testFiles: string[];
    commitStub: string;
    decisions: string[];
}
export interface ForgeState {
    runId: string;
    prdId: string;
    startedAt: string;
    updatedAt: string;
    phases: PipelinePhase[];
    stories: Record<string, {
        status: 'pending' | 'running' | 'completed' | 'failed';
        deliverable?: string;
    }>;
    issueCount: number;
}
/**
 * Persist a completed story's deliverables to disk.
 * Creates delivery/{prd-id}/STORY-{N}.md with the file manifest.
 */
export declare function persistStoryDeliverable(workDir: string, prdId: string, deliverable: StoryDeliverable): string;
/**
 * Save or update forge pipeline state.
 * Called after each batch to enable resume.
 */
export declare function saveForgeState(workDir: string, state: ForgeState): string;
/**
 * Load existing forge state for resume.
 */
export declare function loadForgeState(workDir: string): ForgeState | null;
/**
 * Get completion percentage from forge state.
 */
export declare function getCompletionPercentage(state: ForgeState): number;

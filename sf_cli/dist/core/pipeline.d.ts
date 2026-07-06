import type { PipelineOptions, PipelineResult } from '../types.js';
/**
 * Thrown when a PRD fails semantic quality scoring before pipeline entry.
 * The pipeline hard block (FR-015) raises this to halt before story generation.
 */
export declare class PrdQualityBlockError extends Error {
    constructor(message: string);
}
export interface PRDInfo {
    file: string;
    title: string;
    status: string;
    slug: string;
    content: string;
}
/**
 * Scans the project's genesis/ directory for Product Requirements Documents.
 * Extracts title, status, and content for each valid PRD file.
 * @param workDir - The project root directory
 * @returns Array of PRDInfo objects
 */
export declare function scanPRDs(workDir: string): PRDInfo[];
/**
 * Scans the project's docs/stories/ directory to track implementation progress.
 * Groups stories by PRD and counts completed vs. total stories.
 * @param workDir - The project root directory
 * @returns Array of story progress objects
 */
export declare function scanStories(workDir: string): Array<{
    prd: string;
    stories: string[];
    completed: number;
}>;
/**
 * The core execution engine for the SkillFoundry pipeline.
 * Orchestrates the full development lifecycle: PRD discovery, validation,
 * story generation, implementation, quality gates, and final reporting.
 * @param options - Configuration and callbacks for the pipeline run
 * @returns Promise resolving to the complete PipelineResult
 */
export declare function runPipeline(options: PipelineOptions): Promise<PipelineResult>;

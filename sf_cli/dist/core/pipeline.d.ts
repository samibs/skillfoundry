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
export declare function scanPRDs(workDir: string): PRDInfo[];
export declare function scanStories(workDir: string): Array<{
    prd: string;
    stories: string[];
    completed: number;
}>;
export declare function runPipeline(options: PipelineOptions): Promise<PipelineResult>;

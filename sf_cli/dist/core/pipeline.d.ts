import type { PipelineOptions, PipelineResult } from '../types.js';
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

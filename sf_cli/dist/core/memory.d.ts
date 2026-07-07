/** Sentinel project value for knowledge that is intentionally cross-project. */
export declare const UNIVERSAL_PROJECT = "universal";
/**
 * Derive the active project namespace for a workDir. Uses the SF_PROJECT
 * environment override when set, otherwise the workDir's basename. This is the
 * isolation key: memory captured in one project must not surface in another.
 */
export declare function deriveProject(workDir: string): string;
/**
 * Whether a memory entry is visible to the active project. Entries with no
 * project (legacy/unstamped corpus) or the explicit UNIVERSAL_PROJECT sentinel
 * are shared everywhere; a stamped project-specific entry is visible only in
 * its own project — this is what prevents cross-project bleed on recall.
 */
export declare function isVisibleToProject(entry: MemoryEntry, activeProject: string): boolean;
export interface MemoryEntry {
    id: string;
    type: 'fact' | 'decision' | 'error' | 'pattern' | 'preference' | 'lesson';
    content: string;
    tags: string[];
    source?: string;
    created_at: string;
    project?: string;
    confidence?: number;
}
export interface RecallResult {
    entries: MemoryEntry[];
    query: string;
    matchCount: number;
}
export declare function recall(workDir: string, query: string, maxResults?: number, options?: {
    project?: string;
}): RecallResult;
export declare function capture(workDir: string, entry: Omit<MemoryEntry, 'id' | 'created_at'>, targetFile?: string): MemoryEntry;
export declare function captureLesson(workDir: string, content: string, tags: string[], source?: string): MemoryEntry;
export declare function captureDecision(workDir: string, content: string, tags: string[], source?: string): MemoryEntry;
export declare function captureError(workDir: string, content: string, tags: string[], source?: string): MemoryEntry;
export declare function getMemoryStats(workDir: string): {
    totalEntries: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
    recentEntries: MemoryEntry[];
};

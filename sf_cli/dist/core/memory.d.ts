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
export declare function recall(workDir: string, query: string, maxResults?: number): RecallResult;
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

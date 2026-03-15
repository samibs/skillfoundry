export interface BufferedEntry {
    type: 'fact' | 'decision' | 'error';
    content: string;
    tags: string[];
    storyId?: string;
    prdId?: string;
}
export interface FlushResult {
    entriesWritten: number;
    entriesDeduplicated: number;
}
/**
 * Memory buffer that queues knowledge entries during pipeline execution
 * and flushes them to disk periodically or on demand.
 */
export declare class MemoryBuffer {
    private buffer;
    private runId;
    private storiesCompleted;
    private flushInterval;
    private totalWritten;
    private totalDeduped;
    constructor(runId: string, flushInterval?: number);
    /**
     * Add an entry to the buffer. Does not write to disk immediately.
     */
    add(entry: BufferedEntry): void;
    /**
     * Notify that a story completed. Triggers auto-flush if interval met.
     */
    onStoryComplete(workDir: string): FlushResult | null;
    /**
     * Flush all buffered entries to disk. Deduplicates against existing content.
     */
    flush(workDir: string): FlushResult;
    /**
     * Get current buffer size (unflushed entries).
     */
    get pendingCount(): number;
    /**
     * Get cumulative stats.
     */
    getStats(): {
        totalWritten: number;
        totalDeduped: number;
        pending: number;
    };
    private getTargetFile;
    private toCanonical;
    private loadTailContent;
}

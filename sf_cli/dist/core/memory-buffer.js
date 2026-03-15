// Memory buffer — queues knowledge entries during pipeline execution and flushes periodically.
// Prevents knowledge loss on context exhaustion or pipeline crash.
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
const DEFAULT_FLUSH_INTERVAL = 3; // flush every N completed stories
const DEDUP_TAIL_LINES = 50;
/**
 * Memory buffer that queues knowledge entries during pipeline execution
 * and flushes them to disk periodically or on demand.
 */
export class MemoryBuffer {
    buffer = [];
    runId;
    storiesCompleted = 0;
    flushInterval;
    totalWritten = 0;
    totalDeduped = 0;
    constructor(runId, flushInterval) {
        this.runId = runId;
        this.flushInterval = flushInterval ?? DEFAULT_FLUSH_INTERVAL;
    }
    /**
     * Add an entry to the buffer. Does not write to disk immediately.
     */
    add(entry) {
        this.buffer.push(entry);
    }
    /**
     * Notify that a story completed. Triggers auto-flush if interval met.
     */
    onStoryComplete(workDir) {
        this.storiesCompleted++;
        if (this.storiesCompleted % this.flushInterval === 0) {
            return this.flush(workDir);
        }
        return null;
    }
    /**
     * Flush all buffered entries to disk. Deduplicates against existing content.
     */
    flush(workDir) {
        const log = getLogger();
        const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
        if (!existsSync(knowledgeDir)) {
            mkdirSync(knowledgeDir, { recursive: true });
        }
        const now = new Date().toISOString();
        let written = 0;
        let deduped = 0;
        // Group by target file
        const byFile = new Map();
        for (const entry of this.buffer) {
            const file = this.getTargetFile(entry.type);
            const canonical = this.toCanonical(entry, now);
            const existing = byFile.get(file) || [];
            existing.push(canonical);
            byFile.set(file, existing);
        }
        for (const [file, entries] of byFile) {
            const filePath = join(knowledgeDir, file);
            const existingContent = this.loadTailContent(filePath);
            for (const entry of entries) {
                if (existingContent.includes(entry.content)) {
                    deduped++;
                    continue;
                }
                appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
                written++;
            }
        }
        this.totalWritten += written;
        this.totalDeduped += deduped;
        if (written > 0 || deduped > 0) {
            log.info('memory', 'buffer_flushed', {
                written,
                deduped,
                remainingInBuffer: 0,
            });
        }
        // Clear buffer after successful flush
        this.buffer = [];
        return { entriesWritten: written, entriesDeduplicated: deduped };
    }
    /**
     * Get current buffer size (unflushed entries).
     */
    get pendingCount() {
        return this.buffer.length;
    }
    /**
     * Get cumulative stats.
     */
    getStats() {
        return {
            totalWritten: this.totalWritten,
            totalDeduped: this.totalDeduped,
            pending: this.buffer.length,
        };
    }
    getTargetFile(type) {
        switch (type) {
            case 'fact': return 'facts.jsonl';
            case 'decision': return 'decisions.jsonl';
            case 'error': return 'errors.jsonl';
            default: return 'facts.jsonl';
        }
    }
    toCanonical(entry, now) {
        return {
            id: randomUUID(),
            type: entry.type,
            content: entry.content,
            created_at: now,
            created_by: 'memory-buffer',
            session_id: this.runId,
            context: {
                prd_id: entry.prdId || null,
                story_id: entry.storyId || null,
                phase: 'FORGE',
            },
            weight: 0.5,
            validation_count: 0,
            retrieval_count: 0,
            tags: entry.tags,
            reality_anchor: {
                has_tests: false,
                test_file: null,
                test_passing: false,
            },
            lineage: {
                parent_id: null,
                supersedes: [],
                superseded_by: null,
            },
        };
    }
    loadTailContent(filePath) {
        if (!existsSync(filePath))
            return '';
        try {
            const content = readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter((l) => l.trim().length > 0);
            return lines.slice(-DEDUP_TAIL_LINES).join('\n');
        }
        catch {
            return '';
        }
    }
}
//# sourceMappingURL=memory-buffer.js.map
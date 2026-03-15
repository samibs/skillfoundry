// Memory buffer — queues knowledge entries during pipeline execution and flushes periodically.
// Prevents knowledge loss on context exhaustion or pipeline crash.

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';

const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
const DEFAULT_FLUSH_INTERVAL = 3; // flush every N completed stories
const DEDUP_TAIL_LINES = 50;

export interface BufferedEntry {
  type: 'fact' | 'decision' | 'error';
  content: string;
  tags: string[];
  storyId?: string;
  prdId?: string;
}

interface CanonicalEntry {
  id: string;
  type: string;
  content: string;
  created_at: string;
  created_by: string;
  session_id: string;
  context: {
    prd_id: string | null;
    story_id: string | null;
    phase: string;
  };
  weight: number;
  validation_count: number;
  retrieval_count: number;
  tags: string[];
  reality_anchor: {
    has_tests: boolean;
    test_file: string | null;
    test_passing: boolean;
  };
  lineage: {
    parent_id: string | null;
    supersedes: string[];
    superseded_by: string | null;
  };
}

export interface FlushResult {
  entriesWritten: number;
  entriesDeduplicated: number;
}

/**
 * Memory buffer that queues knowledge entries during pipeline execution
 * and flushes them to disk periodically or on demand.
 */
export class MemoryBuffer {
  private buffer: BufferedEntry[] = [];
  private runId: string;
  private storiesCompleted = 0;
  private flushInterval: number;
  private totalWritten = 0;
  private totalDeduped = 0;

  constructor(runId: string, flushInterval?: number) {
    this.runId = runId;
    this.flushInterval = flushInterval ?? DEFAULT_FLUSH_INTERVAL;
  }

  /**
   * Add an entry to the buffer. Does not write to disk immediately.
   */
  add(entry: BufferedEntry): void {
    this.buffer.push(entry);
  }

  /**
   * Notify that a story completed. Triggers auto-flush if interval met.
   */
  onStoryComplete(workDir: string): FlushResult | null {
    this.storiesCompleted++;
    if (this.storiesCompleted % this.flushInterval === 0) {
      return this.flush(workDir);
    }
    return null;
  }

  /**
   * Flush all buffered entries to disk. Deduplicates against existing content.
   */
  flush(workDir: string): FlushResult {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir)) {
      mkdirSync(knowledgeDir, { recursive: true });
    }

    const now = new Date().toISOString();
    let written = 0;
    let deduped = 0;

    // Group by target file
    const byFile = new Map<string, CanonicalEntry[]>();
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
  get pendingCount(): number {
    return this.buffer.length;
  }

  /**
   * Get cumulative stats.
   */
  getStats(): { totalWritten: number; totalDeduped: number; pending: number } {
    return {
      totalWritten: this.totalWritten,
      totalDeduped: this.totalDeduped,
      pending: this.buffer.length,
    };
  }

  private getTargetFile(type: string): string {
    switch (type) {
      case 'fact': return 'facts.jsonl';
      case 'decision': return 'decisions.jsonl';
      case 'error': return 'errors.jsonl';
      default: return 'facts.jsonl';
    }
  }

  private toCanonical(entry: BufferedEntry, now: string): CanonicalEntry {
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

  private loadTailContent(filePath: string): string {
    if (!existsSync(filePath)) return '';
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.slice(-DEDUP_TAIL_LINES).join('\n');
    } catch {
      return '';
    }
  }
}

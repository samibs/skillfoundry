/**
 * STORY-002: Append-Only Audit Log
 *
 * Writes every gate decision to `.skillfoundry/audit.jsonl` as an append-only
 * JSONL file. Entries are immutable — no update or delete operations.
 *
 * Features:
 * - Atomic append via appendFileSync
 * - UUID v4 for each entry
 * - Actor detection from environment (USER, CI vars)
 * - Streaming reader for large logs (10k+ entries)
 * - Optional rotation (archive after threshold)
 */
import type { AuditEntry } from '../types.js';
import type { GateResult } from './gates.js';
/**
 * Detect the current actor identity from environment variables.
 * Checks CI-specific vars first, then falls back to OS user.
 */
export declare function detectActor(): string;
/**
 * Append a single audit entry to the log.
 * Creates the file and directory if they don't exist.
 */
export declare function appendAuditEntry(workDir: string, entry: Omit<AuditEntry, 'id' | 'timestamp' | 'actor'>): void;
/**
 * Convert a GateResult to an audit log entry and append it.
 */
export declare function auditGateResult(workDir: string, result: GateResult, storyFile?: string): void;
/**
 * Read all audit entries synchronously.
 * For small logs (<10k entries). For larger logs use streamAuditEntries.
 */
export declare function readAuditLog(workDir: string): AuditEntry[];
/**
 * Stream audit entries line-by-line for large logs.
 * Calls the callback for each valid entry.
 */
export declare function streamAuditEntries(workDir: string, callback: (entry: AuditEntry) => void): Promise<number>;
/**
 * Count entries in the audit log without loading all into memory.
 */
export declare function countAuditEntries(workDir: string): number;
/**
 * Get recent audit entries (last N).
 */
export declare function getRecentAuditEntries(workDir: string, count?: number): AuditEntry[];
/**
 * Filter audit entries by gate tier and/or verdict.
 */
export declare function filterAuditEntries(workDir: string, filters: {
    gate?: string;
    verdict?: string;
    since?: string;
}): AuditEntry[];
/**
 * Rotate the audit log if it exceeds the threshold.
 * Archives the current log as `audit-{timestamp}.jsonl` and starts fresh.
 */
export declare function rotateAuditLogIfNeeded(workDir: string, threshold?: number): boolean;
export interface AuditSummary {
    total_entries: number;
    by_verdict: Record<string, number>;
    by_gate: Record<string, number>;
    first_entry?: string;
    last_entry?: string;
}
/**
 * Generate a summary of the audit log.
 */
export declare function getAuditSummary(workDir: string): AuditSummary;

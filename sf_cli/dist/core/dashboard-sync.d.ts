/**
 * Dashboard sync orchestrator — reads per-project telemetry, perf, knowledge,
 * and session-monitor data, then aggregates into the central SQLite database.
 */
export interface SyncResult {
    projects_synced: number;
    projects_skipped: number;
    events_added: number;
    perf_entries_added: number;
    knowledge_added: number;
    failures_detected: number;
    sessions_imported: number;
    issues_imported: number;
    inbox_imported: number;
    errors: string[];
}
/**
 * Sync all registered projects into the central dashboard database.
 */
export declare function syncAllProjects(dbPath: string, frameworkDir?: string): SyncResult;
/**
 * Format sync result for CLI output.
 */
export declare function formatSyncResult(result: SyncResult): string;

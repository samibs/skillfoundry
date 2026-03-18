/**
 * Dashboard SQLite database — central aggregation store for multi-project telemetry.
 * Uses better-sqlite3 for synchronous, high-performance SQLite operations.
 * Schema: projects, telemetry_events, perf_entries, knowledge_entries, failure_patterns, kpi_snapshots.
 */
import Database from 'better-sqlite3';
export interface ProjectRecord {
    id: string;
    path: string;
    name: string;
    platform?: string;
    framework_version?: string;
    health_status?: string;
}
export interface TelemetryEventRecord {
    id: string;
    project_id: string;
    event_type: string;
    timestamp: string;
    status?: string;
    duration_ms?: number;
    details?: string;
}
export interface PerfEntryRecord {
    project_id: string;
    gate: string;
    duration_ms: number;
    timestamp: string;
    run_id?: string;
}
export interface KnowledgeEntryRecord {
    id: string;
    project_id: string;
    type: string;
    content?: string;
    created_at?: string;
    tags?: string;
    weight?: number;
}
export interface FailurePatternRecord {
    project_id: string;
    signature: string;
    occurrences?: number;
    first_seen?: string;
    last_seen?: string;
    source?: string;
    severity?: string;
    detail?: string;
    remediation_status?: string;
}
export interface SessionReportRecord {
    id: string;
    project_id: string;
    started_at?: string;
    completed_at?: string;
    total_issues?: number;
    blockers?: number;
    anomalies?: number;
    error_patterns?: number;
    outcome?: string;
    source_file?: string;
}
export interface SessionIssueRecord {
    id: string;
    session_id: string;
    project_id: string;
    severity: string;
    category: string;
    title?: string;
    detail?: string;
    story?: string;
    phase?: string;
    occurred_at?: string;
    remediation?: string;
}
export interface SyncState {
    last_synced_at: string | null;
}
export interface RemediationRecord {
    id: string;
    project_id: string;
    failure_signature: string;
    playbook_id?: string;
    status?: string;
    priority?: string;
    title: string;
    description?: string;
    steps?: string;
    result?: string;
    auto_applied?: number;
}
export interface PlaybookRecord {
    id: string;
    name: string;
    description?: string;
    category: string;
    trigger_pattern: string;
    steps: string;
    auto_applicable?: number;
}
/**
 * Open or create the dashboard SQLite database.
 * Creates all tables and indexes if they don't exist.
 */
export declare function initDatabase(dbPath: string): Database.Database;
/**
 * Insert or update a project record.
 */
export declare function upsertProject(db: Database.Database, project: ProjectRecord): void;
/**
 * Bulk insert telemetry events, skipping duplicates by event ID.
 * Returns the number of newly inserted events.
 */
export declare function insertTelemetryEvents(db: Database.Database, projectId: string, events: TelemetryEventRecord[]): number;
/**
 * Append performance entries for a project.
 * Returns the number of inserted entries.
 */
export declare function insertPerfEntries(db: Database.Database, projectId: string, entries: PerfEntryRecord[]): number;
/**
 * Upsert failure patterns by (project_id, signature).
 * Increments occurrences and updates last_seen on conflict.
 */
export declare function insertFailurePatterns(db: Database.Database, projectId: string, patterns: FailurePatternRecord[]): number;
/**
 * Bulk insert knowledge entries, skipping duplicates by ID.
 * Returns the number of newly inserted entries.
 */
export declare function insertKnowledgeEntries(db: Database.Database, projectId: string, entries: KnowledgeEntryRecord[]): number;
/**
 * Get the last sync timestamp for a project.
 */
export declare function getProjectSyncState(db: Database.Database, projectId: string): SyncState;
/**
 * Update the last_synced_at timestamp for a project.
 */
export declare function updateSyncTimestamp(db: Database.Database, projectId: string): void;
/**
 * Insert a session report. Skips if already imported (by ID).
 * Returns true if inserted, false if duplicate.
 */
export declare function insertSessionReport(db: Database.Database, report: SessionReportRecord): boolean;
/**
 * Bulk insert session issues, skipping duplicates by ID.
 * Returns the count of newly inserted issues.
 */
export declare function insertSessionIssues(db: Database.Database, issues: SessionIssueRecord[]): number;
/**
 * Get session reports for a project.
 */
export declare function getSessionReports(db: Database.Database, projectId?: string, limit?: number): Array<SessionReportRecord & {
    imported_at: string;
}>;
/**
 * Get session issues, optionally filtered.
 */
export declare function getSessionIssues(db: Database.Database, options?: {
    sessionId?: string;
    projectId?: string;
    severity?: string;
    category?: string;
    limit?: number;
}): SessionIssueRecord[];
/**
 * Get cross-project failure pattern correlations.
 * Finds signatures that appear in 2+ projects.
 */
export declare function getCrossProjectPatterns(db: Database.Database): Array<{
    signature: string;
    project_count: number;
    total_occurrences: number;
    projects: string;
    severity: string;
    last_seen: string;
}>;
/**
 * Get recurring issue categories across sessions.
 */
export declare function getRecurringIssueCategories(db: Database.Database, projectId?: string): Array<{
    category: string;
    severity: string;
    count: number;
    projects: number;
    recent_title: string;
}>;
/**
 * Get detailed information for a single project by name or ID.
 */
export declare function getProjectDetail(db: Database.Database, nameOrId: string): {
    project: {
        id: string;
        name: string;
        path: string;
        platform: string;
        framework_version: string | null;
        health_status: string;
        last_synced_at: string | null;
        created_at: string;
    };
    event_counts: Record<string, number>;
    recent_events: Array<{
        event_type: string;
        status: string;
        timestamp: string;
        duration_ms: number | null;
    }>;
    failure_patterns: Array<{
        signature: string;
        occurrences: number;
        severity: string;
        last_seen: string;
        remediation_status: string;
    }>;
    perf_stats: Array<{
        gate: string;
        count: number;
        avg_ms: number;
        max_ms: number;
    }>;
    knowledge_count: number;
} | null;
/**
 * Get failure patterns across all projects, optionally filtered.
 */
export declare function getFailurePatterns(db: Database.Database, options?: {
    severity?: string;
    projectName?: string;
    limit?: number;
}): Array<{
    project_name: string;
    signature: string;
    occurrences: number;
    severity: string;
    last_seen: string;
    detail: string | null;
    remediation_status: string;
}>;
/**
 * Get project rankings by a metric.
 */
export declare function getProjectRankings(db: Database.Database, metric: 'events' | 'failures' | 'cost' | 'perf', limit?: number): Array<{
    rank: number;
    name: string;
    value: number;
    label: string;
}>;
/**
 * Compute KPI metrics for a project (or all projects).
 */
export declare function computeProjectKpis(db: Database.Database, projectId?: string): {
    total_forge_runs: number;
    successful_runs: number;
    failed_runs: number;
    success_rate: number;
    total_gate_passes: number;
    total_gate_failures: number;
    gate_pass_rate: number;
    security_critical: number;
    security_high: number;
    avg_duration_ms: number;
    avg_cost_usd: number;
    total_knowledge: number;
    open_failures: number;
};
/**
 * Compute health assessment for all projects.
 */
export declare function computeHealthReport(db: Database.Database): Array<{
    name: string;
    id: string;
    score: number;
    grade: string;
    issues: string[];
}>;
/**
 * Get a summary of all projects with event counts.
 */
export declare function getProjectSummaries(db: Database.Database): Array<{
    id: string;
    name: string;
    path: string;
    health_status: string;
    last_synced_at: string | null;
    event_count: number;
    failure_count: number;
}>;
/**
 * Insert or update a playbook.
 */
export declare function upsertPlaybook(db: Database.Database, playbook: PlaybookRecord): void;
/**
 * Get all playbooks, optionally filtered by category.
 */
export declare function getPlaybooks(db: Database.Database, category?: string): Array<PlaybookRecord & {
    success_count: number;
    failure_count: number;
    created_at: string;
}>;
/**
 * Find playbooks matching a failure signature.
 */
export declare function matchPlaybooks(db: Database.Database, signature: string): Array<PlaybookRecord & {
    success_count: number;
    failure_count: number;
}>;
/**
 * Create a remediation record.
 */
export declare function insertRemediation(db: Database.Database, remediation: RemediationRecord): void;
/**
 * Update remediation status.
 */
export declare function updateRemediationStatus(db: Database.Database, id: string, status: string, result?: string): void;
/**
 * Get remediations, optionally filtered.
 */
export declare function getRemediations(db: Database.Database, options?: {
    projectId?: string;
    status?: string;
    limit?: number;
}): Array<RemediationRecord & {
    project_name: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}>;
/**
 * Get remediation statistics.
 */
export declare function getRemediationStats(db: Database.Database): {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
    auto_applied: number;
    avg_resolution_hours: number;
};
/**
 * Record playbook outcome (success or failure).
 */
export declare function recordPlaybookOutcome(db: Database.Database, playbookId: string, success: boolean): void;
/**
 * Update failure pattern remediation_status.
 */
export declare function updateFailureRemediationStatus(db: Database.Database, projectId: string, signature: string, status: string): void;

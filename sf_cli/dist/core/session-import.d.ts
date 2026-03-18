/**
 * Session import pipeline — imports session reports, forge logs, and inbox files
 * into the central dashboard database for cross-project analysis.
 *
 * Import sources:
 *   1. .skillfoundry/runs/*-issues.json  (SessionReport format)
 *   2. .skillfoundry/logs/session.log    (forge log events)
 *   3. data/inbox/*.json                 (manually placed session exports)
 */
import type Database from 'better-sqlite3';
export interface ImportResult {
    sessions_imported: number;
    sessions_skipped: number;
    issues_imported: number;
    patterns_extracted: number;
    forge_events_processed: number;
    errors: string[];
}
interface SessionReportJson {
    runId: string;
    startedAt: string;
    completedAt: string;
    issues: Array<{
        id: string;
        severity: string;
        category: string;
        title: string;
        detail: string;
        story?: string;
        phase: string;
        occurredAt: string;
        remediation: string;
        relatedIssues: string[];
    }>;
    anomalies: Array<{
        id: string;
        type: string;
        description: string;
        evidence: string[];
        detectedAt: string;
    }>;
    errorPatterns: Array<{
        signature: string;
        occurrences: number;
        stories: string[];
        firstSeen: string;
        likelyRootCause: string;
    }>;
    summary: {
        totalIssues: number;
        bySeverity: Record<string, number>;
        byCategory: Record<string, number>;
        blockers: number;
        anomalies: number;
        storiesWithIssues: number;
        topRemediations: string[];
    };
}
/**
 * Import a session report JSON into the database.
 * Returns true if imported, false if duplicate.
 */
export declare function importSessionReport(db: Database.Database, projectId: string, report: SessionReportJson, sourceFile?: string): {
    imported: boolean;
    issues: number;
    patterns: number;
};
/**
 * Import a forge run log file. Extracts failure events and converts
 * them to failure patterns.
 */
export declare function importForgeLog(db: Database.Database, projectId: string, logPath: string): {
    events_processed: number;
    patterns_extracted: number;
};
/**
 * Scan a project's .skillfoundry/runs/ for session reports and import them.
 */
export declare function scanProjectSessions(db: Database.Database, projectId: string, projectPath: string): ImportResult;
/**
 * Import files from data/inbox/. Supports:
 *   - *-issues.json (SessionReport format)
 *   - *.log (forge log format)
 *
 * Successfully imported files are moved to data/inbox/imported/.
 */
export declare function importInbox(db: Database.Database, frameworkDir: string, projectIdOverride?: string): ImportResult;
/**
 * Format import result for CLI output.
 */
export declare function formatImportResult(result: ImportResult): string;
export {};

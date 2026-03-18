/**
 * Auto-Remediation Engine — detects actionable failure patterns, matches them
 * to playbooks, and creates (or auto-applies) remediation actions.
 *
 * Features:
 *   - Built-in playbook library for common failure categories
 *   - Pattern-to-playbook matching via signature/category
 *   - Auto-remediation for safe, well-understood fixes
 *   - Remediation lifecycle tracking (pending → in_progress → completed/failed)
 *   - Effectiveness scoring — playbooks track success/failure rates
 *   - CLI and API integration
 */
import { getPlaybooks, getRemediations, getRemediationStats } from './dashboard-db.js';
import type Database from 'better-sqlite3';
export interface RemediationAction {
    id: string;
    project_id: string;
    project_name: string;
    failure_signature: string;
    playbook_id: string | null;
    playbook_name: string | null;
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    steps: string[];
    auto_applicable: boolean;
}
export interface ScanResult {
    actions_created: number;
    actions_skipped: number;
    auto_applied: number;
    errors: string[];
}
export interface ApplyResult {
    remediation_id: string;
    status: 'completed' | 'failed' | 'skipped';
    message: string;
}
/**
 * Seed built-in playbooks into the database.
 */
export declare function seedPlaybooks(db: Database.Database): number;
/**
 * Scan all open failures and generate remediation actions.
 * Matches failure signatures to playbooks and creates pending remediations.
 */
export declare function scanForRemediations(db: Database.Database, options?: {
    projectId?: string;
    autoApply?: boolean;
}): ScanResult;
/**
 * Apply a specific remediation — mark as in-progress or completed.
 */
export declare function applyRemediation(db: Database.Database, remediationId: string, action: 'start' | 'complete' | 'fail' | 'skip', result?: string): ApplyResult;
/**
 * Generate a remediation report with pending actions and stats.
 */
export declare function generateRemediationReport(db: Database.Database, options?: {
    projectId?: string;
}): {
    stats: ReturnType<typeof getRemediationStats>;
    pending_actions: ReturnType<typeof getRemediations>;
    playbook_effectiveness: Array<{
        name: string;
        category: string;
        success_count: number;
        failure_count: number;
        success_rate: number;
    }>;
};
/**
 * Format scan result for CLI display.
 */
export declare function formatScanResult(result: ScanResult): string;
/**
 * Format remediation report for CLI display.
 */
export declare function formatRemediationReport(report: ReturnType<typeof generateRemediationReport>): string;
/**
 * Format list of remediation actions for CLI.
 */
export declare function formatRemediationList(actions: ReturnType<typeof getRemediations>): string;
/**
 * Format playbook list for CLI.
 */
export declare function formatPlaybookList(playbooks: ReturnType<typeof getPlaybooks>): string;
/**
 * Standalone entry: run remediation scan from cron/CLI.
 */
export declare function runRemediationScan(dbPath: string, autoApply?: boolean): ScanResult;

/**
 * Failure pattern detection engine — analyzes imported session data and telemetry
 * for recurring failures, cross-project correlations, and actionable insights.
 */
import type Database from 'better-sqlite3';
export interface DetectedPattern {
    type: 'recurring' | 'cross-project' | 'escalating' | 'category-cluster';
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    affected_projects: string[];
    occurrences: number;
    recommendation: string;
}
export interface PatternReport {
    generated_at: string;
    total_patterns: number;
    critical_count: number;
    high_count: number;
    patterns: DetectedPattern[];
}
/**
 * Run all pattern detection rules against the dashboard database.
 */
export declare function detectPatterns(db: Database.Database, projectId?: string): PatternReport;
/**
 * Format pattern report for CLI output.
 */
export declare function formatPatternReport(report: PatternReport): string;

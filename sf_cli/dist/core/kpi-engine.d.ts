/**
 * KPI Trend Engine — captures periodic snapshots and computes trends.
 *
 * Features:
 *   - Daily KPI snapshot capture per project
 *   - Trend detection: improving / declining / stable
 *   - Change alerts when metrics shift beyond thresholds
 *   - Simple moving-average forecasting
 *   - Cross-project trend aggregation
 */
import type Database from 'better-sqlite3';
export interface KpiSnapshot {
    project_id: string;
    snapshot_date: string;
    forge_runs: number;
    success_rate: number;
    gate_pass_rate: number;
    security_findings_critical: number;
    security_findings_high: number;
    test_coverage: number;
    avg_cost_usd: number;
    trend: string;
}
export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';
export interface MetricTrend {
    metric: string;
    current: number;
    previous: number;
    change: number;
    change_pct: number;
    direction: TrendDirection;
    alert: boolean;
    alert_reason?: string;
}
export interface ProjectTrend {
    project_id: string;
    project_name: string;
    overall_direction: TrendDirection;
    metrics: MetricTrend[];
    snapshot_count: number;
    first_snapshot: string;
    latest_snapshot: string;
}
export interface TrendReport {
    generated_at: string;
    window_days: number;
    projects: ProjectTrend[];
    alerts: TrendAlert[];
    global_summary: {
        projects_improving: number;
        projects_declining: number;
        projects_stable: number;
        avg_success_rate: number;
        avg_success_rate_change: number;
    };
}
export interface TrendAlert {
    project_name: string;
    metric: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    current_value: number;
    previous_value: number;
}
export interface SnapshotResult {
    projects_captured: number;
    projects_skipped: number;
    errors: string[];
}
export interface ForecastPoint {
    date: string;
    value: number;
}
export interface MetricForecast {
    metric: string;
    current: number;
    forecast: ForecastPoint[];
    trend_direction: TrendDirection;
}
/**
 * Capture a KPI snapshot for all projects (or a single project).
 * Designed to be called daily (by cron or manually).
 */
export declare function captureSnapshots(db: Database.Database, projectId?: string): SnapshotResult;
/**
 * Get KPI snapshots for a project within a time window.
 */
export declare function getSnapshots(db: Database.Database, projectId: string, days?: number): KpiSnapshot[];
/**
 * Get the latest snapshot for each project.
 */
export declare function getLatestSnapshots(db: Database.Database): Array<KpiSnapshot & {
    project_name: string;
}>;
/**
 * Compute trends for a single project.
 */
export declare function computeProjectTrend(db: Database.Database, projectId: string, projectName: string, windowDays?: number): ProjectTrend;
/**
 * Generate a full trend report across all projects.
 */
export declare function generateTrendReport(db: Database.Database, windowDays?: number): TrendReport;
/**
 * Simple moving-average forecast for a project metric.
 * Projects the next `forecastDays` points based on recent trend.
 */
export declare function forecastMetric(db: Database.Database, projectId: string, metric: keyof KpiSnapshot, windowDays?: number, forecastDays?: number): MetricForecast;
/**
 * Format trend report for CLI display.
 */
export declare function formatTrendReport(report: TrendReport): string;
/**
 * Format snapshot capture result for CLI.
 */
export declare function formatSnapshotResult(result: SnapshotResult): string;
/**
 * Format forecast for CLI display.
 */
export declare function formatForecast(forecasts: MetricForecast[]): string;
/**
 * Run snapshot capture from cron or CLI.
 */
export declare function runSnapshotCapture(dbPath: string): SnapshotResult;

export interface QualityReport {
    generated_at: string;
    project_name: string;
    window: number;
    date_range: {
        from: string;
        to: string;
    };
    summary: {
        verdict: string;
        total_runs: number;
        success_rate: number;
        gate_pass_rate: number;
        trend: string;
    };
    security: {
        total_findings: number;
        by_severity: {
            critical: number;
            high: number;
            medium: number;
            low: number;
        };
        owasp_coverage: Record<string, number>;
    };
    dependencies: {
        total_vulnerable: number;
        by_severity: {
            critical: number;
            high: number;
            moderate: number;
            low: number;
        };
    };
    gates: Array<{
        tier: string;
        pass_rate: number;
        avg_duration_ms: number;
        top_failure: string;
    }>;
    trends: {
        direction: string;
        gate_pass_rate_delta: number;
        security_findings_delta: number;
    };
    baselines: Array<{
        metric: string;
        project_value: number;
        industry_value: number;
        source: string;
        delta_pct: number;
    }>;
    recommendations: string[];
}
/**
 * Generate a structured quality report from telemetry data.
 */
export declare function generateReport(workDir: string, window?: number): QualityReport;
/**
 * Format report as Markdown.
 */
export declare function formatReportMarkdown(report: QualityReport): string;
/**
 * Format report as JSON string.
 */
export declare function formatReportJson(report: QualityReport): string;

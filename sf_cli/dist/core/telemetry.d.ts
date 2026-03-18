export type TelemetryEventType = 'forge_run' | 'gate_execution' | 'security_scan' | 'dependency_scan' | 'hook_execution' | 'benchmark_run';
export interface TelemetryEvent {
    id: string;
    schema_version: number;
    event_type: TelemetryEventType;
    timestamp: string;
    session_id: string;
    duration_ms: number;
    status: 'pass' | 'warn' | 'fail' | 'error';
    details: Record<string, unknown>;
}
export interface ForgeRunDetails {
    prd_count: number;
    stories_total: number;
    stories_completed: number;
    stories_failed: number;
    gate_passes: number;
    gate_failures: number;
    security_findings: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    dependency_findings: {
        critical: number;
        high: number;
        moderate: number;
        low: number;
    };
    tests_created: number;
    tests_total: number;
    rework_cycles: number;
    circuit_breaker_activated: boolean;
    tokens_used: number;
    cost_usd: number;
}
export interface GateExecutionDetails {
    tier: string;
    gate_name: string;
    story_id: string;
    findings_count: number;
    findings: Array<{
        severity: string;
        file: string;
        message: string;
    }>;
}
export interface SecurityScanDetails {
    scanner: string;
    semgrep_version: string | null;
    owasp_categories_checked: number;
    findings_by_severity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    findings_by_owasp: Record<string, number>;
    top_findings: Array<{
        file: string;
        line: number;
        rule: string;
        severity: string;
    }>;
}
export interface DependencyScanDetails {
    package_manager: string;
    total_dependencies: number;
    vulnerable_count: number;
    findings: Array<{
        name: string;
        version: string;
        severity: string;
        cve: string;
        advisory_url: string;
    }>;
}
export interface HookExecutionDetails {
    hook_type: string;
    gates_run: string[];
    files_checked: number;
    blocked: boolean;
}
export interface BenchmarkRunDetails {
    tasks_count: number;
    governed_results: {
        security_findings: number;
        type_errors: number;
        banned_patterns: number;
        test_pass_rate: number;
    };
    ungoverned_results: {
        security_findings: number;
        type_errors: number;
        banned_patterns: number;
        test_pass_rate: number;
    };
    improvement_pct: {
        security: number;
        type_safety: number;
        patterns: number;
    };
}
export interface TelemetryAggregation {
    window: number;
    total_runs: number;
    successful_runs: number;
    partial_runs: number;
    failed_runs: number;
    avg_gate_pass_rate: number;
    total_security_findings: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    total_dependency_findings: {
        critical: number;
        high: number;
        moderate: number;
        low: number;
    };
    total_tests_created: number;
    total_rework_cycles: number;
    avg_duration_ms: number;
    avg_cost_usd: number;
    trend: 'improving' | 'declining' | 'stable';
}
export declare const INDUSTRY_BASELINES: {
    readonly security_vuln_rate: {
        readonly value: 0.45;
        readonly source: "Veracode 2025";
        readonly metric: "% of AI code with OWASP vulns";
    };
    readonly issue_ratio_vs_human: {
        readonly value: 1.7;
        readonly source: "CodeRabbit 2025";
        readonly metric: "issues per PR vs human baseline";
    };
    readonly code_churn_rate: {
        readonly value: 0.057;
        readonly source: "GitClear 2025";
        readonly metric: "% of new code revised within 2 weeks";
    };
    readonly duplication_rate: {
        readonly value: 0.123;
        readonly source: "GitClear 2025";
        readonly metric: "% of changed lines that are duplicated";
    };
    readonly xss_failure_rate: {
        readonly value: 0.86;
        readonly source: "Veracode 2025";
        readonly metric: "% failing XSS defense";
    };
    readonly security_debt_pct: {
        readonly value: 0.82;
        readonly source: "Veracode 2026";
        readonly metric: "% of companies with security debt";
    };
    readonly dev_trust_in_ai: {
        readonly value: 0.29;
        readonly source: "Stack Overflow 2025";
        readonly metric: "% who trust AI code accuracy";
    };
    readonly ai_pr_security_rate: {
        readonly value: 2.74;
        readonly source: "CodeRabbit 2025";
        readonly metric: "XSS vuln ratio vs human PRs";
    };
};
/**
 * Record a telemetry event. Non-blocking — never throws.
 */
export declare function recordEvent(workDir: string, event_type: TelemetryEventType, session_id: string, status: TelemetryEvent['status'], duration_ms: number, details: Record<string, unknown>): TelemetryEvent | null;
/**
 * Read all telemetry events from the current (non-archived) file.
 * Skips malformed lines gracefully.
 */
export declare function readEvents(workDir: string): {
    events: TelemetryEvent[];
    skipped: number;
};
/**
 * Read events filtered by type.
 */
export declare function readEventsByType(workDir: string, type: TelemetryEventType): TelemetryEvent[];
/**
 * Aggregate telemetry over the last N forge runs.
 */
export declare function aggregateMetrics(workDir: string, window?: number): TelemetryAggregation;
/**
 * Format aggregation as a human-readable CLI output.
 */
export declare function formatMetrics(agg: TelemetryAggregation): string;
/**
 * Read all telemetry events from current file AND rotated archives.
 * Returns events sorted oldest-first across all files.
 */
export declare function readAllEvents(workDir: string): TelemetryEvent[];
/**
 * Format metrics with industry baseline comparison.
 */
export declare function formatMetricsWithBaselines(agg: TelemetryAggregation): string;

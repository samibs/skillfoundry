// Report generator — produces Markdown and JSON quality reports from telemetry data.
// Includes: executive summary, quality trends, security posture, gate performance,
// industry baseline comparisons, and prioritized recommendations.
import { readEvents, aggregateMetrics, INDUSTRY_BASELINES } from './telemetry.js';
// ── Report Generation ───────────────────────────────────────────
/**
 * Generate a structured quality report from telemetry data.
 */
export function generateReport(workDir, window = 10) {
    const { events } = readEvents(workDir);
    const agg = aggregateMetrics(workDir, window);
    const forgeRuns = events
        .filter((e) => e.event_type === 'forge_run')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, window);
    // Date range
    const timestamps = forgeRuns.map((r) => r.timestamp);
    const from = timestamps.length > 0 ? timestamps[timestamps.length - 1] : new Date().toISOString();
    const to = timestamps.length > 0 ? timestamps[0] : new Date().toISOString();
    // Security scan details
    const secScans = events.filter((e) => e.event_type === 'security_scan').slice(-window);
    const owaspCoverage = {};
    for (const scan of secScans) {
        const d = scan.details;
        if (d.findings_by_owasp) {
            for (const [cat, count] of Object.entries(d.findings_by_owasp)) {
                owaspCoverage[cat] = (owaspCoverage[cat] || 0) + count;
            }
        }
    }
    // Dependency scan details
    const depScans = events.filter((e) => e.event_type === 'dependency_scan').slice(-window);
    const depSummary = { critical: 0, high: 0, moderate: 0, low: 0 };
    let depVulnTotal = 0;
    for (const scan of depScans) {
        const d = scan.details;
        depVulnTotal += d.vulnerable_count ?? 0;
        for (const finding of d.findings || []) {
            const f = finding;
            if (f.severity === 'critical')
                depSummary.critical++;
            else if (f.severity === 'high')
                depSummary.high++;
            else if (f.severity === 'moderate')
                depSummary.moderate++;
            else
                depSummary.low++;
        }
    }
    // Gate performance
    const gateEvents = events.filter((e) => e.event_type === 'gate_execution').slice(-window * 7);
    const gatePerf = computeGatePerformance(gateEvents);
    // Trends (compare recent half vs older half)
    const mid = Math.floor(forgeRuns.length / 2);
    const recentRuns = forgeRuns.slice(0, Math.max(mid, 1));
    const olderRuns = forgeRuns.slice(mid);
    const trends = computeTrends(recentRuns, olderRuns);
    // Baselines
    const baselines = computeBaselines(agg);
    // Recommendations
    const recommendations = generateRecommendations(agg, baselines);
    // Verdict
    const successRate = agg.total_runs > 0 ? agg.successful_runs / agg.total_runs : 0;
    let verdict = 'HEALTHY';
    if (successRate < 0.5)
        verdict = 'AT RISK';
    else if (successRate < 0.8)
        verdict = 'NEEDS ATTENTION';
    else if (agg.total_security_findings.critical > 0)
        verdict = 'SECURITY CONCERN';
    // Project name from nearest package.json
    let projectName = 'Unknown Project';
    try {
        const { existsSync: exists, readFileSync: readFile } = require('node:fs');
        const { join: pathJoin } = require('node:path');
        const pkgPath = pathJoin(workDir, 'package.json');
        if (exists(pkgPath)) {
            projectName = JSON.parse(readFile(pkgPath, 'utf-8')).name || projectName;
        }
    }
    catch { /* best effort */ }
    return {
        generated_at: new Date().toISOString(),
        project_name: projectName,
        window: agg.window,
        date_range: { from, to },
        summary: {
            verdict,
            total_runs: agg.total_runs,
            success_rate: successRate,
            gate_pass_rate: agg.avg_gate_pass_rate,
            trend: agg.trend,
        },
        security: {
            total_findings: agg.total_security_findings.critical + agg.total_security_findings.high +
                agg.total_security_findings.medium + agg.total_security_findings.low,
            by_severity: agg.total_security_findings,
            owasp_coverage: owaspCoverage,
        },
        dependencies: {
            total_vulnerable: depVulnTotal,
            by_severity: depSummary,
        },
        gates: gatePerf,
        trends: {
            direction: trends.direction,
            gate_pass_rate_delta: trends.passRateDelta,
            security_findings_delta: trends.securityDelta,
        },
        baselines,
        recommendations,
    };
}
// ── Formatting ──────────────────────────────────────────────────
/**
 * Format report as Markdown.
 */
export function formatReportMarkdown(report) {
    const lines = [];
    lines.push(`# Quality Report — ${report.project_name}`);
    lines.push(`Generated: ${report.generated_at}`);
    lines.push(`Window: Last ${report.window} forge runs (${report.date_range.from.split('T')[0]} to ${report.date_range.to.split('T')[0]})`);
    lines.push('');
    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(`**Verdict: ${report.summary.verdict}** — ${report.summary.total_runs} runs, ${(report.summary.success_rate * 100).toFixed(0)}% success rate, trend: ${report.summary.trend}`);
    lines.push('');
    // Quality Trends
    lines.push('## Quality Trends');
    lines.push('');
    lines.push('| Metric | Value | Trend |');
    lines.push('|--------|-------|-------|');
    lines.push(`| Gate Pass Rate | ${(report.summary.gate_pass_rate * 100).toFixed(1)}% | ${report.trends.direction} (${report.trends.gate_pass_rate_delta > 0 ? '+' : ''}${(report.trends.gate_pass_rate_delta * 100).toFixed(1)}%) |`);
    lines.push(`| Security Findings | ${report.security.total_findings} total | ${report.trends.security_findings_delta > 0 ? '↑' : report.trends.security_findings_delta < 0 ? '↓' : '→'} (${report.trends.security_findings_delta > 0 ? '+' : ''}${report.trends.security_findings_delta}) |`);
    lines.push('');
    // Security Posture
    lines.push('## Security Posture');
    lines.push('');
    lines.push('### SAST Findings');
    lines.push(`- Critical: ${report.security.by_severity.critical}`);
    lines.push(`- High: ${report.security.by_severity.high}`);
    lines.push(`- Medium: ${report.security.by_severity.medium}`);
    lines.push(`- Low: ${report.security.by_severity.low}`);
    lines.push('');
    if (Object.keys(report.security.owasp_coverage).length > 0) {
        lines.push('### OWASP Coverage');
        lines.push('| Category | Findings |');
        lines.push('|----------|----------|');
        for (const [cat, count] of Object.entries(report.security.owasp_coverage)) {
            lines.push(`| ${cat} | ${count} |`);
        }
        lines.push('');
    }
    // Dependencies
    lines.push('### Dependency Vulnerabilities');
    lines.push(`- Total vulnerable: ${report.dependencies.total_vulnerable}`);
    lines.push(`- Critical: ${report.dependencies.by_severity.critical}, High: ${report.dependencies.by_severity.high}, Moderate: ${report.dependencies.by_severity.moderate}`);
    lines.push('');
    // Gate Performance
    if (report.gates.length > 0) {
        lines.push('## Gate Performance');
        lines.push('');
        lines.push('| Gate | Pass Rate | Avg Duration | Top Failure |');
        lines.push('|------|-----------|--------------|-------------|');
        for (const g of report.gates) {
            lines.push(`| ${g.tier} | ${(g.pass_rate * 100).toFixed(0)}% | ${g.avg_duration_ms}ms | ${g.top_failure || 'None'} |`);
        }
        lines.push('');
    }
    // Industry Comparison
    if (report.baselines.length > 0) {
        lines.push('## Industry Comparison');
        lines.push('');
        lines.push('| Metric | Project | Industry Avg | Source | Delta |');
        lines.push('|--------|---------|-------------|--------|-------|');
        for (const b of report.baselines) {
            const delta = b.delta_pct > 0 ? `+${b.delta_pct.toFixed(0)}%` : `${b.delta_pct.toFixed(0)}%`;
            lines.push(`| ${b.metric} | ${b.project_value.toFixed(2)} | ${b.industry_value.toFixed(2)} | ${b.source} | ${delta} |`);
        }
        lines.push('');
    }
    // Recommendations
    if (report.recommendations.length > 0) {
        lines.push('## Recommendations');
        lines.push('');
        for (let i = 0; i < report.recommendations.length; i++) {
            lines.push(`${i + 1}. ${report.recommendations[i]}`);
        }
        lines.push('');
    }
    lines.push('---');
    lines.push('*Generated by SkillFoundry Quality Intelligence*');
    return lines.join('\n');
}
/**
 * Format report as JSON string.
 */
export function formatReportJson(report) {
    return JSON.stringify(report, null, 2);
}
// ── Helper Functions ────────────────────────────────────────────
function computeGatePerformance(gateEvents) {
    const byTier = {};
    for (const evt of gateEvents) {
        const d = evt.details;
        const tier = d.tier || 'unknown';
        if (!byTier[tier])
            byTier[tier] = { passes: 0, total: 0, totalMs: 0, failures: {} };
        byTier[tier].total++;
        byTier[tier].totalMs += evt.duration_ms;
        if (evt.status === 'pass')
            byTier[tier].passes++;
        if (evt.status === 'fail') {
            const reason = (d.gate_name || tier) + ' failure';
            byTier[tier].failures[reason] = (byTier[tier].failures[reason] || 0) + 1;
        }
    }
    return Object.entries(byTier).map(([tier, data]) => {
        const topFailure = Object.entries(data.failures).sort((a, b) => b[1] - a[1])[0];
        return {
            tier,
            pass_rate: data.total > 0 ? data.passes / data.total : 1,
            avg_duration_ms: data.total > 0 ? Math.round(data.totalMs / data.total) : 0,
            top_failure: topFailure ? topFailure[0] : '',
        };
    });
}
function computeTrends(recentRuns, olderRuns) {
    function avgPassRate(runs) {
        let passes = 0, total = 0;
        for (const r of runs) {
            const d = r.details;
            passes += d.gate_passes ?? 0;
            total += (d.gate_passes ?? 0) + (d.gate_failures ?? 0);
        }
        return total > 0 ? passes / total : 0;
    }
    function totalSecFindings(runs) {
        let total = 0;
        for (const r of runs) {
            const d = r.details;
            const sf = d.security_findings;
            if (sf)
                total += (sf.critical ?? 0) + (sf.high ?? 0) + (sf.medium ?? 0) + (sf.low ?? 0);
        }
        return total;
    }
    const recentRate = avgPassRate(recentRuns);
    const olderRate = avgPassRate(olderRuns);
    const recentSec = totalSecFindings(recentRuns);
    const olderSec = totalSecFindings(olderRuns);
    const passRateDelta = recentRate - olderRate;
    const securityDelta = recentSec - olderSec;
    let direction = 'stable';
    if (passRateDelta > 0.05)
        direction = 'improving';
    else if (passRateDelta < -0.05)
        direction = 'declining';
    return { direction, passRateDelta, securityDelta };
}
function computeBaselines(agg) {
    if (agg.total_runs === 0)
        return [];
    const totalSecFindings = agg.total_security_findings.critical + agg.total_security_findings.high +
        agg.total_security_findings.medium + agg.total_security_findings.low;
    const projectVulnRate = totalSecFindings / Math.max(agg.total_runs, 1);
    const gateFailRate = 1 - agg.avg_gate_pass_rate;
    return [
        {
            metric: 'Security findings per run',
            project_value: projectVulnRate,
            industry_value: INDUSTRY_BASELINES.security_vuln_rate.value * 100, // 45%
            source: INDUSTRY_BASELINES.security_vuln_rate.source,
            delta_pct: projectVulnRate > 0 ? ((projectVulnRate - 45) / 45) * 100 : -100,
        },
        {
            metric: 'Gate failure rate',
            project_value: gateFailRate,
            industry_value: 1 - (1 / INDUSTRY_BASELINES.issue_ratio_vs_human.value),
            source: INDUSTRY_BASELINES.issue_ratio_vs_human.source,
            delta_pct: gateFailRate > 0 ? ((gateFailRate - 0.41) / 0.41) * 100 : -100,
        },
    ];
}
function generateRecommendations(agg, baselines) {
    const recs = [];
    if (agg.total_security_findings.critical > 0) {
        recs.push(`Fix ${agg.total_security_findings.critical} CRITICAL security finding(s) immediately — these are deployment blockers.`);
    }
    if (agg.total_security_findings.high > 0) {
        recs.push(`Address ${agg.total_security_findings.high} HIGH severity security finding(s) within 48 hours.`);
    }
    if (agg.total_dependency_findings.critical > 0 || agg.total_dependency_findings.high > 0) {
        recs.push(`Update vulnerable dependencies: ${agg.total_dependency_findings.critical} critical, ${agg.total_dependency_findings.high} high severity CVEs.`);
    }
    if (agg.avg_gate_pass_rate < 0.8) {
        recs.push(`Gate pass rate is ${(agg.avg_gate_pass_rate * 100).toFixed(0)}% — below 80% threshold. Review recurring gate failures.`);
    }
    if (agg.total_rework_cycles > agg.total_runs * 2) {
        recs.push(`High rework: ${agg.total_rework_cycles} fixer cycles across ${agg.total_runs} runs. Improve PRD specificity or coding agent prompts.`);
    }
    if (agg.trend === 'declining') {
        recs.push('Quality trend is DECLINING. Review recent changes for regression sources.');
    }
    if (recs.length === 0) {
        recs.push('All metrics healthy. Continue current practices.');
    }
    return recs;
}
//# sourceMappingURL=report-generator.js.map
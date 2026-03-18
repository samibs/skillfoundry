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
import { getLogger } from '../utils/logger.js';
import { initDatabase, getProjectSummaries, computeProjectKpis, } from './dashboard-db.js';
// ── Alert thresholds ──────────────────────────────────────────
const THRESHOLDS = {
    success_rate_critical: -0.15, // 15% drop = critical
    success_rate_warning: -0.05, // 5% drop = warning
    gate_pass_rate_warning: -0.10, // 10% drop
    security_critical_any: 1, // any new critical finding
    cost_increase_warning: 0.50, // 50% cost increase
    failure_spike: 3, // 3x increase in failures
};
// ── Snapshot capture ──────────────────────────────────────────
/**
 * Capture a KPI snapshot for all projects (or a single project).
 * Designed to be called daily (by cron or manually).
 */
export function captureSnapshots(db, projectId) {
    const log = getLogger();
    const result = { projects_captured: 0, projects_skipped: 0, errors: [] };
    const today = new Date().toISOString().slice(0, 10);
    const projects = projectId
        ? [{ id: projectId, name: '' }]
        : getProjectSummaries(db).map((p) => ({ id: p.id, name: p.name }));
    for (const project of projects) {
        try {
            // Check if snapshot already exists for today
            const existing = db.prepare('SELECT id FROM kpi_snapshots WHERE project_id = ? AND snapshot_date = ?').get(project.id, today);
            if (existing) {
                result.projects_skipped++;
                continue;
            }
            const kpi = computeProjectKpis(db, project.id);
            // Compute trend by comparing to prior snapshot
            const prior = db.prepare('SELECT success_rate FROM kpi_snapshots WHERE project_id = ? ORDER BY snapshot_date DESC LIMIT 1').get(project.id);
            let trend = 'stable';
            if (prior) {
                const delta = kpi.success_rate - prior.success_rate;
                if (delta > 0.02)
                    trend = 'improving';
                else if (delta < -0.02)
                    trend = 'declining';
            }
            else {
                trend = 'insufficient_data';
            }
            db.prepare(`
        INSERT INTO kpi_snapshots (project_id, snapshot_date, forge_runs, success_rate, gate_pass_rate,
          security_findings_critical, security_findings_high, test_coverage, avg_cost_usd, trend)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(project.id, today, kpi.total_forge_runs, kpi.success_rate, kpi.gate_pass_rate, kpi.security_critical, kpi.security_high, 0, // test_coverage — filled by future integration
            kpi.avg_cost_usd, trend);
            result.projects_captured++;
            log.info('kpi-engine', 'snapshot_captured', { project: project.id, date: today, trend });
        }
        catch (err) {
            result.errors.push(`${project.id}: ${String(err)}`);
            log.warn('kpi-engine', 'snapshot_error', { project: project.id, error: String(err) });
        }
    }
    return result;
}
// ── Snapshot queries ──────────────────────────────────────────
/**
 * Get KPI snapshots for a project within a time window.
 */
export function getSnapshots(db, projectId, days = 30) {
    return db.prepare(`
    SELECT * FROM kpi_snapshots
    WHERE project_id = ? AND snapshot_date >= date('now', '-' || ? || ' days')
    ORDER BY snapshot_date ASC
  `).all(projectId, days);
}
/**
 * Get the latest snapshot for each project.
 */
export function getLatestSnapshots(db) {
    return db.prepare(`
    SELECT ks.*, p.name as project_name
    FROM kpi_snapshots ks
    JOIN projects p ON p.id = ks.project_id
    WHERE ks.snapshot_date = (
      SELECT MAX(snapshot_date) FROM kpi_snapshots WHERE project_id = ks.project_id
    )
    ORDER BY p.name
  `).all();
}
// ── Trend computation ──────────────────────────────────────────
/**
 * Compute trend for a single metric by comparing recent window vs prior window.
 */
function computeMetricTrend(metric, recentValues, priorValues, higherIsBetter) {
    if (recentValues.length === 0 || priorValues.length === 0) {
        return {
            metric,
            current: recentValues.length > 0 ? avg(recentValues) : 0,
            previous: priorValues.length > 0 ? avg(priorValues) : 0,
            change: 0,
            change_pct: 0,
            direction: 'insufficient_data',
            alert: false,
        };
    }
    const current = avg(recentValues);
    const previous = avg(priorValues);
    const change = current - previous;
    const changePct = previous !== 0 ? change / Math.abs(previous) : 0;
    let direction;
    const significantChange = Math.abs(changePct) > 0.02;
    if (!significantChange) {
        direction = 'stable';
    }
    else if (higherIsBetter) {
        direction = change > 0 ? 'improving' : 'declining';
    }
    else {
        direction = change < 0 ? 'improving' : 'declining';
    }
    // Check for alert conditions
    let alert = false;
    let alert_reason;
    if (metric === 'success_rate' && changePct <= THRESHOLDS.success_rate_critical) {
        alert = true;
        alert_reason = `Success rate dropped ${(Math.abs(changePct) * 100).toFixed(1)}% — critical threshold breached`;
    }
    else if (metric === 'success_rate' && changePct <= THRESHOLDS.success_rate_warning) {
        alert = true;
        alert_reason = `Success rate declining: ${(changePct * 100).toFixed(1)}%`;
    }
    else if (metric === 'gate_pass_rate' && changePct <= THRESHOLDS.gate_pass_rate_warning) {
        alert = true;
        alert_reason = `Gate pass rate dropped ${(Math.abs(changePct) * 100).toFixed(1)}%`;
    }
    else if (metric === 'security_findings_critical' && current > 0 && change > 0) {
        alert = true;
        alert_reason = `New critical security findings detected (${current})`;
    }
    else if (metric === 'avg_cost_usd' && changePct >= THRESHOLDS.cost_increase_warning) {
        alert = true;
        alert_reason = `Cost increased ${(changePct * 100).toFixed(0)}%`;
    }
    return { metric, current, previous, change, change_pct: changePct, direction, alert, alert_reason };
}
/**
 * Compute trends for a single project.
 */
export function computeProjectTrend(db, projectId, projectName, windowDays = 7) {
    // Get snapshots split into recent half and prior half
    const allSnapshots = db.prepare(`
    SELECT * FROM kpi_snapshots
    WHERE project_id = ? AND snapshot_date >= date('now', '-' || ? || ' days')
    ORDER BY snapshot_date ASC
  `).all(projectId, windowDays * 2);
    const midpoint = Math.floor(allSnapshots.length / 2);
    const prior = allSnapshots.slice(0, midpoint);
    const recent = allSnapshots.slice(midpoint);
    const metricDefs = [
        { key: 'success_rate', name: 'success_rate', higherIsBetter: true },
        { key: 'gate_pass_rate', name: 'gate_pass_rate', higherIsBetter: true },
        { key: 'forge_runs', name: 'forge_runs', higherIsBetter: true },
        { key: 'security_findings_critical', name: 'security_findings_critical', higherIsBetter: false },
        { key: 'security_findings_high', name: 'security_findings_high', higherIsBetter: false },
        { key: 'avg_cost_usd', name: 'avg_cost_usd', higherIsBetter: false },
    ];
    const metrics = metricDefs.map((def) => computeMetricTrend(def.name, recent.map((s) => s[def.key]), prior.map((s) => s[def.key]), def.higherIsBetter));
    // Overall direction: majority vote of non-stable, non-insufficient metrics
    const directionCounts = { improving: 0, declining: 0, stable: 0, insufficient_data: 0 };
    for (const m of metrics) {
        directionCounts[m.direction]++;
    }
    let overall_direction;
    if (allSnapshots.length < 2) {
        overall_direction = 'insufficient_data';
    }
    else if (directionCounts.improving > directionCounts.declining) {
        overall_direction = 'improving';
    }
    else if (directionCounts.declining > directionCounts.improving) {
        overall_direction = 'declining';
    }
    else {
        overall_direction = 'stable';
    }
    return {
        project_id: projectId,
        project_name: projectName,
        overall_direction,
        metrics,
        snapshot_count: allSnapshots.length,
        first_snapshot: allSnapshots.length > 0 ? allSnapshots[0].snapshot_date : '',
        latest_snapshot: allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1].snapshot_date : '',
    };
}
/**
 * Generate a full trend report across all projects.
 */
export function generateTrendReport(db, windowDays = 7) {
    const projects = getProjectSummaries(db);
    const projectTrends = [];
    const alerts = [];
    for (const project of projects) {
        const trend = computeProjectTrend(db, project.id, project.name, windowDays);
        projectTrends.push(trend);
        // Collect alerts
        for (const metric of trend.metrics) {
            if (metric.alert && metric.alert_reason) {
                let severity = 'info';
                if (metric.alert_reason.includes('critical'))
                    severity = 'critical';
                else if (metric.alert_reason.includes('dropped') || metric.alert_reason.includes('declining'))
                    severity = 'warning';
                alerts.push({
                    project_name: project.name,
                    metric: metric.metric,
                    severity,
                    message: metric.alert_reason,
                    current_value: metric.current,
                    previous_value: metric.previous,
                });
            }
        }
    }
    // Sort alerts by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    // Global summary
    const improving = projectTrends.filter((t) => t.overall_direction === 'improving').length;
    const declining = projectTrends.filter((t) => t.overall_direction === 'declining').length;
    const stable = projectTrends.filter((t) => t.overall_direction === 'stable').length;
    const successMetrics = projectTrends
        .map((t) => t.metrics.find((m) => m.metric === 'success_rate'))
        .filter((m) => m !== undefined);
    const avgSuccessRate = successMetrics.length > 0
        ? avg(successMetrics.map((m) => m.current))
        : 0;
    const avgSuccessRateChange = successMetrics.length > 0
        ? avg(successMetrics.map((m) => m.change))
        : 0;
    return {
        generated_at: new Date().toISOString(),
        window_days: windowDays,
        projects: projectTrends,
        alerts,
        global_summary: {
            projects_improving: improving,
            projects_declining: declining,
            projects_stable: stable,
            avg_success_rate: avgSuccessRate,
            avg_success_rate_change: avgSuccessRateChange,
        },
    };
}
// ── Forecasting ──────────────────────────────────────────────
/**
 * Simple moving-average forecast for a project metric.
 * Projects the next `forecastDays` points based on recent trend.
 */
export function forecastMetric(db, projectId, metric, windowDays = 14, forecastDays = 7) {
    const snapshots = getSnapshots(db, projectId, windowDays);
    const values = snapshots.map((s) => s[metric]);
    if (values.length < 2) {
        return {
            metric: metric,
            current: values.length > 0 ? values[values.length - 1] : 0,
            forecast: [],
            trend_direction: 'insufficient_data',
        };
    }
    // Calculate daily rate of change (linear regression slope)
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = avg(values);
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (values[i] - yMean);
        denominator += (i - xMean) ** 2;
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const current = values[values.length - 1];
    // Generate forecast points
    const lastDate = new Date(snapshots[snapshots.length - 1].snapshot_date);
    const forecast = [];
    for (let d = 1; d <= forecastDays; d++) {
        const date = new Date(lastDate);
        date.setDate(date.getDate() + d);
        const value = current + slope * d;
        // Clamp rates to [0, 1]
        const clamped = (metric === 'success_rate' || metric === 'gate_pass_rate' || metric === 'test_coverage')
            ? Math.max(0, Math.min(1, value))
            : Math.max(0, value);
        forecast.push({ date: date.toISOString().slice(0, 10), value: Math.round(clamped * 10000) / 10000 });
    }
    let trend_direction;
    if (Math.abs(slope) < 0.001)
        trend_direction = 'stable';
    else if (slope > 0)
        trend_direction = 'improving';
    else
        trend_direction = 'declining';
    return { metric: metric, current, forecast, trend_direction };
}
// ── CLI formatter ──────────────────────────────────────────────
const LINE = '\u2501';
const THIN = '\u2500';
const ARROW_UP = '\u2191';
const ARROW_DOWN = '\u2193';
const ARROW_RIGHT = '\u2192';
function directionIcon(d) {
    switch (d) {
        case 'improving': return ARROW_UP;
        case 'declining': return ARROW_DOWN;
        case 'stable': return ARROW_RIGHT;
        default: return '?';
    }
}
function directionLabel(d) {
    switch (d) {
        case 'improving': return 'IMPROVING';
        case 'declining': return 'DECLINING';
        case 'stable': return 'STABLE';
        default: return 'NO DATA';
    }
}
function pct(n) {
    return (n * 100).toFixed(1) + '%';
}
/**
 * Format trend report for CLI display.
 */
export function formatTrendReport(report) {
    const lines = [
        'KPI Trend Report',
        LINE.repeat(60),
        `  Window: ${report.window_days} days | Generated: ${report.generated_at.slice(0, 19)}`,
        '',
    ];
    // Global summary
    const gs = report.global_summary;
    lines.push('  Global Summary:');
    lines.push(`    ${ARROW_UP} Improving: ${gs.projects_improving}  ${ARROW_RIGHT} Stable: ${gs.projects_stable}  ${ARROW_DOWN} Declining: ${gs.projects_declining}`);
    lines.push(`    Avg Success Rate: ${pct(gs.avg_success_rate)} (${gs.avg_success_rate_change >= 0 ? '+' : ''}${pct(gs.avg_success_rate_change)})`);
    lines.push('');
    // Alerts
    if (report.alerts.length > 0) {
        lines.push(`  Alerts (${report.alerts.length}):`);
        for (const alert of report.alerts) {
            const sev = alert.severity === 'critical' ? '[CRITICAL]' : alert.severity === 'warning' ? '[WARNING]' : '[INFO]';
            lines.push(`    ${sev} ${alert.project_name}: ${alert.message}`);
        }
        lines.push('');
    }
    // Per-project trends
    if (report.projects.length > 0) {
        const nameWidth = Math.max(20, ...report.projects.map((p) => p.project_name.length)) + 2;
        lines.push('  Project Trends:');
        lines.push(`    ${'Project'.padEnd(nameWidth)} ${'Trend'.padEnd(12)} ${'Success'.padEnd(10)} ${'Gate'.padEnd(10)} ${'Cost'.padEnd(10)} Snapshots`);
        lines.push(`    ${THIN.repeat(nameWidth)} ${THIN.repeat(12)} ${THIN.repeat(10)} ${THIN.repeat(10)} ${THIN.repeat(10)} ${THIN.repeat(9)}`);
        for (const project of report.projects) {
            const successMetric = project.metrics.find((m) => m.metric === 'success_rate');
            const gateMetric = project.metrics.find((m) => m.metric === 'gate_pass_rate');
            const costMetric = project.metrics.find((m) => m.metric === 'avg_cost_usd');
            const icon = directionIcon(project.overall_direction);
            const trendLabel = directionLabel(project.overall_direction);
            const successStr = successMetric ? pct(successMetric.current) : '-';
            const gateStr = gateMetric ? pct(gateMetric.current) : '-';
            const costStr = costMetric ? `$${costMetric.current.toFixed(4)}` : '-';
            lines.push(`    ${project.project_name.padEnd(nameWidth)} ${icon} ${trendLabel.padEnd(10)} ${successStr.padEnd(10)} ${gateStr.padEnd(10)} ${costStr.padEnd(10)} ${project.snapshot_count}`);
        }
    }
    else {
        lines.push('  No project data available. Run: /dashboard snapshot');
    }
    return lines.join('\n');
}
/**
 * Format snapshot capture result for CLI.
 */
export function formatSnapshotResult(result) {
    const lines = [
        'KPI Snapshot Capture',
        LINE.repeat(60),
        `  Projects captured: ${result.projects_captured}`,
        `  Projects skipped:  ${result.projects_skipped} (already captured today)`,
    ];
    if (result.errors.length > 0) {
        lines.push('');
        lines.push(`  Errors (${result.errors.length}):`);
        for (const err of result.errors) {
            lines.push(`    - ${err}`);
        }
    }
    return lines.join('\n');
}
/**
 * Format forecast for CLI display.
 */
export function formatForecast(forecasts) {
    const lines = [
        'KPI Forecast',
        LINE.repeat(60),
    ];
    for (const fc of forecasts) {
        const icon = directionIcon(fc.trend_direction);
        lines.push(`  ${fc.metric}: ${fc.current} ${icon} ${directionLabel(fc.trend_direction)}`);
        if (fc.forecast.length > 0) {
            for (const point of fc.forecast) {
                const val = fc.metric.includes('rate') || fc.metric.includes('coverage')
                    ? pct(point.value)
                    : fc.metric.includes('cost')
                        ? `$${point.value.toFixed(4)}`
                        : String(point.value);
                lines.push(`    ${point.date}: ${val}`);
            }
        }
        else {
            lines.push('    Insufficient data for forecast');
        }
        lines.push('');
    }
    return lines.join('\n');
}
// ── Standalone entry point ────────────────────────────────────
/**
 * Run snapshot capture from cron or CLI.
 */
export function runSnapshotCapture(dbPath) {
    const db = initDatabase(dbPath);
    try {
        return captureSnapshots(db);
    }
    finally {
        db.close();
    }
}
// ── Helpers ────────────────────────────────────────────────────
function avg(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
//# sourceMappingURL=kpi-engine.js.map
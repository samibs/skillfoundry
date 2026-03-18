/**
 * Failure pattern detection engine — analyzes imported session data and telemetry
 * for recurring failures, cross-project correlations, and actionable insights.
 */
import { getLogger } from '../utils/logger.js';
import { getCrossProjectPatterns, getRecurringIssueCategories, getFailurePatterns, } from './dashboard-db.js';
// ── Detection Rules ──────────────────────────────────────────
/**
 * Run all pattern detection rules against the dashboard database.
 */
export function detectPatterns(db, projectId) {
    const log = getLogger();
    const patterns = [];
    // Rule 1: Cross-project failure correlations
    const crossProject = detectCrossProjectPatterns(db);
    patterns.push(...crossProject);
    // Rule 2: High-frequency failure signatures
    const highFreq = detectHighFrequencyFailures(db, projectId);
    patterns.push(...highFreq);
    // Rule 3: Recurring issue category clusters
    const categoryClusters = detectCategoryClusters(db, projectId);
    patterns.push(...categoryClusters);
    // Rule 4: Escalating failures (increasing occurrences over time)
    const escalating = detectEscalatingFailures(db, projectId);
    patterns.push(...escalating);
    // Sort by severity, then occurrences
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    patterns.sort((a, b) => {
        const sDiff = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
        if (sDiff !== 0)
            return sDiff;
        return b.occurrences - a.occurrences;
    });
    const report = {
        generated_at: new Date().toISOString(),
        total_patterns: patterns.length,
        critical_count: patterns.filter((p) => p.severity === 'critical').length,
        high_count: patterns.filter((p) => p.severity === 'high').length,
        patterns,
    };
    log.info('failure-detector', 'analysis_complete', {
        total: report.total_patterns,
        critical: report.critical_count,
        high: report.high_count,
    });
    return report;
}
// ── Rule 1: Cross-project patterns ──────────────────────────
function detectCrossProjectPatterns(db) {
    const crossPatterns = getCrossProjectPatterns(db);
    return crossPatterns.map((cp) => {
        const projects = cp.projects.split(',');
        const isCritical = cp.total_occurrences >= 10 || projects.length >= 3;
        return {
            type: 'cross-project',
            severity: isCritical ? 'critical' : 'high',
            title: `Cross-project failure: ${cp.signature}`,
            detail: `Affects ${cp.project_count} projects (${cp.projects}) with ${cp.total_occurrences} total occurrences`,
            affected_projects: projects,
            occurrences: cp.total_occurrences,
            recommendation: cp.project_count >= 3
                ? `Systemic issue affecting ${cp.project_count} projects. Investigate shared dependencies or common patterns.`
                : `Recurring issue across ${cp.projects}. Check if projects share a common root cause.`,
        };
    });
}
// ── Rule 2: High-frequency failures ──────────────────────────
function detectHighFrequencyFailures(db, projectId) {
    const allFailures = getFailurePatterns(db, {
        projectName: projectId ? getProjectName(db, projectId) : undefined,
        limit: 100,
    });
    const patterns = [];
    for (const f of allFailures) {
        if (f.occurrences < 5)
            continue; // Only flag high-frequency
        const severity = f.occurrences >= 10 ? 'critical'
            : f.occurrences >= 5 ? 'high'
                : 'medium';
        patterns.push({
            type: 'recurring',
            severity,
            title: `Recurring failure: ${f.signature} (x${f.occurrences})`,
            detail: f.detail || `${f.occurrences} occurrences in ${f.project_name}, severity: ${f.severity}`,
            affected_projects: [f.project_name],
            occurrences: f.occurrences,
            recommendation: f.remediation_status === 'open'
                ? `Unresolved with ${f.occurrences} occurrences. Prioritize investigation.`
                : `Marked as ${f.remediation_status}. Verify fix is effective.`,
        });
    }
    return patterns;
}
// ── Rule 3: Category clusters ──────────────────────────────
function detectCategoryClusters(db, projectId) {
    const categories = getRecurringIssueCategories(db, projectId);
    const patterns = [];
    for (const cat of categories) {
        if (cat.count < 3)
            continue; // Only flag clusters
        const severity = cat.severity === 'CRITICAL' ? 'critical'
            : cat.count >= 10 ? 'high'
                : 'medium';
        patterns.push({
            type: 'category-cluster',
            severity,
            title: `${cat.category} cluster: ${cat.count} issues (${cat.severity})`,
            detail: cat.recent_title
                ? `Most recent: "${cat.recent_title}". Affects ${cat.projects} project(s).`
                : `${cat.count} issues across ${cat.projects} project(s).`,
            affected_projects: [], // Category-level, not per-project
            occurrences: cat.count,
            recommendation: getCategoryRecommendation(cat.category),
        });
    }
    return patterns;
}
// ── Rule 4: Escalating failures ──────────────────────────────
function detectEscalatingFailures(db, projectId) {
    // Find failure patterns where last_seen is recent and occurrences are growing
    const filter = projectId ? 'AND f.project_id = ?' : '';
    const params = projectId ? [projectId] : [];
    const rows = db.prepare(`
    SELECT
      f.signature,
      f.occurrences,
      f.first_seen,
      f.last_seen,
      f.severity,
      f.detail,
      p.name as project_name
    FROM failure_patterns f
    JOIN projects p ON p.id = f.project_id
    WHERE f.remediation_status = 'open'
      AND f.occurrences >= 3
      AND f.last_seen > datetime('now', '-7 days')
      ${filter}
    ORDER BY f.occurrences DESC
  `).all(...params);
    const patterns = [];
    for (const row of rows) {
        // Check if the time span between first and last seen is short relative to occurrences
        const firstMs = new Date(row.first_seen).getTime();
        const lastMs = new Date(row.last_seen).getTime();
        const spanDays = Math.max(1, (lastMs - firstMs) / (1000 * 60 * 60 * 24));
        const ratePerDay = row.occurrences / spanDays;
        if (ratePerDay < 1)
            continue; // Not escalating fast enough
        patterns.push({
            type: 'escalating',
            severity: ratePerDay >= 3 ? 'critical' : 'high',
            title: `Escalating: ${row.signature} (${ratePerDay.toFixed(1)}/day)`,
            detail: `${row.occurrences} occurrences over ${spanDays.toFixed(0)} day(s) in ${row.project_name}. ${row.detail || ''}`.trim(),
            affected_projects: [row.project_name],
            occurrences: row.occurrences,
            recommendation: `Failure rate is ${ratePerDay.toFixed(1)}/day and accelerating. Needs immediate attention.`,
        });
    }
    return patterns;
}
// ── Helpers ──────────────────────────────────────────────────
function getProjectName(db, projectId) {
    const row = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    return row?.name;
}
function getCategoryRecommendation(category) {
    const recommendations = {
        BLOCKER: 'Blockers prevent story completion. Review pipeline configuration and prerequisites.',
        TEST_GAP: 'Test gaps indicate insufficient test generation. Review tester agent configuration.',
        BUILD_FAILURE: 'Build failures suggest code quality issues. Check TypeScript config and dependencies.',
        SECURITY: 'Security issues require immediate attention. Run /security audit on affected projects.',
        QUALITY: 'Quality issues indicate code standards drift. Review gate thresholds and lint rules.',
        GATE_FAILURE: 'Gate failures suggest pipeline enforcement is catching issues. Verify fixes address root causes.',
        CIRCUIT_BREAKER: 'Circuit breaker activations indicate repeated failures. Reduce rework cycle limits or fix upstream issues.',
        DEPENDENCY: 'Dependency issues may indicate outdated or vulnerable packages. Run dependency audit.',
        ANOMALY: 'Anomalies suggest unexpected pipeline behavior. Review session reports for contradictions.',
    };
    return recommendations[category] || `Investigate recurring ${category} issues across affected projects.`;
}
/**
 * Format pattern report for CLI output.
 */
export function formatPatternReport(report) {
    if (report.total_patterns === 0) {
        return [
            'Pattern Analysis',
            '\u2501'.repeat(60),
            '  No actionable patterns detected.',
            '  Run /dashboard import to analyze session data.',
        ].join('\n');
    }
    const lines = [
        'Pattern Analysis',
        '\u2501'.repeat(60),
        `  Patterns detected: ${report.total_patterns} (${report.critical_count} critical, ${report.high_count} high)`,
        '',
    ];
    for (const p of report.patterns) {
        const icon = p.severity === 'critical' ? '!!'
            : p.severity === 'high' ? '! '
                : p.severity === 'medium' ? '- '
                    : '  ';
        lines.push(`  ${icon} [${p.severity.toUpperCase()}] ${p.title}`);
        lines.push(`     ${p.detail}`);
        if (p.affected_projects.length > 0) {
            lines.push(`     Projects: ${p.affected_projects.join(', ')}`);
        }
        lines.push(`     Action: ${p.recommendation}`);
        lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=failure-detector.js.map
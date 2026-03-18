// Telemetry engine — tracks quality metrics across forge runs, gate executions, and security scans.
// Persists to .skillfoundry/telemetry.jsonl as append-only JSONL.
// Non-blocking: telemetry failures never break the pipeline.
import { existsSync, mkdirSync, readFileSync, appendFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
const SF_DIR = '.skillfoundry';
const TELEMETRY_FILE = 'telemetry.jsonl';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB rotation threshold
const MAX_ARCHIVES = 2;
// ── Industry Baselines ──────────────────────────────────────────
export const INDUSTRY_BASELINES = {
    security_vuln_rate: { value: 0.45, source: 'Veracode 2025', metric: '% of AI code with OWASP vulns' },
    issue_ratio_vs_human: { value: 1.7, source: 'CodeRabbit 2025', metric: 'issues per PR vs human baseline' },
    code_churn_rate: { value: 0.057, source: 'GitClear 2025', metric: '% of new code revised within 2 weeks' },
    duplication_rate: { value: 0.123, source: 'GitClear 2025', metric: '% of changed lines that are duplicated' },
    xss_failure_rate: { value: 0.86, source: 'Veracode 2025', metric: '% failing XSS defense' },
    security_debt_pct: { value: 0.82, source: 'Veracode 2026', metric: '% of companies with security debt' },
    dev_trust_in_ai: { value: 0.29, source: 'Stack Overflow 2025', metric: '% who trust AI code accuracy' },
    ai_pr_security_rate: { value: 2.74, source: 'CodeRabbit 2025', metric: 'XSS vuln ratio vs human PRs' },
};
// ── Core Functions ──────────────────────────────────────────────
function getTelemetryPath(workDir) {
    return join(workDir, SF_DIR, TELEMETRY_FILE);
}
function ensureDir(workDir) {
    const dir = join(workDir, SF_DIR);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}
/**
 * Rotate telemetry file if it exceeds MAX_FILE_BYTES.
 * Keeps up to MAX_ARCHIVES rotated files.
 */
function rotateIfNeeded(workDir) {
    const filePath = getTelemetryPath(workDir);
    if (!existsSync(filePath))
        return;
    try {
        const { size } = require('node:fs').statSync(filePath);
        if (size < MAX_FILE_BYTES)
            return;
        // Rotate: telemetry.jsonl → telemetry.1.jsonl, telemetry.1.jsonl → telemetry.2.jsonl
        for (let i = MAX_ARCHIVES; i >= 1; i--) {
            const older = join(workDir, SF_DIR, `telemetry.${i}.jsonl`);
            const newer = i === 1 ? filePath : join(workDir, SF_DIR, `telemetry.${i - 1}.jsonl`);
            if (existsSync(newer)) {
                if (i === MAX_ARCHIVES && existsSync(older)) {
                    // Delete oldest archive
                    require('node:fs').unlinkSync(older);
                }
                renameSync(newer, older);
            }
        }
        // Create fresh file
        writeFileSync(filePath, '');
    }
    catch {
        // Non-blocking — rotation failure is not critical
    }
}
/**
 * Record a telemetry event. Non-blocking — never throws.
 */
export function recordEvent(workDir, event_type, session_id, status, duration_ms, details) {
    const log = getLogger();
    try {
        ensureDir(workDir);
        rotateIfNeeded(workDir);
        const event = {
            id: randomUUID(),
            schema_version: 1,
            event_type,
            timestamp: new Date().toISOString(),
            session_id,
            duration_ms,
            status,
            details,
        };
        appendFileSync(getTelemetryPath(workDir), JSON.stringify(event) + '\n');
        return event;
    }
    catch (err) {
        log.warn('telemetry', 'write_failed', { error: String(err) });
        return null;
    }
}
/**
 * Read telemetry events from a single JSONL file.
 * Skips malformed lines gracefully.
 */
function readEventsFromFile(filePath) {
    if (!existsSync(filePath))
        return { events: [], skipped: 0 };
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content)
        return { events: [], skipped: 0 };
    const lines = content.split('\n');
    const events = [];
    let skipped = 0;
    for (const line of lines) {
        if (!line.trim())
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed.id && parsed.event_type && parsed.timestamp) {
                events.push(parsed);
            }
            else {
                skipped++;
            }
        }
        catch {
            skipped++;
        }
    }
    return { events, skipped };
}
/**
 * Read all telemetry events from the current (non-archived) file.
 * Skips malformed lines gracefully.
 */
export function readEvents(workDir) {
    return readEventsFromFile(getTelemetryPath(workDir));
}
/**
 * Read events filtered by type.
 */
export function readEventsByType(workDir, type) {
    const { events } = readEvents(workDir);
    return events.filter((e) => e.event_type === type);
}
/**
 * Aggregate telemetry over the last N forge runs.
 */
export function aggregateMetrics(workDir, window = 10) {
    const { events } = readEvents(workDir);
    // Get forge_run events, most recent first
    const forgeRuns = events
        .filter((e) => e.event_type === 'forge_run')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, window);
    if (forgeRuns.length === 0) {
        return {
            window,
            total_runs: 0,
            successful_runs: 0,
            partial_runs: 0,
            failed_runs: 0,
            avg_gate_pass_rate: 0,
            total_security_findings: { critical: 0, high: 0, medium: 0, low: 0 },
            total_dependency_findings: { critical: 0, high: 0, moderate: 0, low: 0 },
            total_tests_created: 0,
            total_rework_cycles: 0,
            avg_duration_ms: 0,
            avg_cost_usd: 0,
            trend: 'stable',
        };
    }
    let totalGatePasses = 0;
    let totalGateTotal = 0;
    const secFindings = { critical: 0, high: 0, medium: 0, low: 0 };
    const depFindings = { critical: 0, high: 0, moderate: 0, low: 0 };
    let testsCreated = 0;
    let reworkCycles = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let successful = 0;
    let partial = 0;
    let failed = 0;
    for (const run of forgeRuns) {
        const d = run.details;
        if (run.status === 'pass')
            successful++;
        else if (run.status === 'warn')
            partial++;
        else
            failed++;
        const passes = d.gate_passes ?? 0;
        const failures = d.gate_failures ?? 0;
        totalGatePasses += passes;
        totalGateTotal += passes + failures;
        const sf = d.security_findings;
        if (sf) {
            secFindings.critical += sf.critical ?? 0;
            secFindings.high += sf.high ?? 0;
            secFindings.medium += sf.medium ?? 0;
            secFindings.low += sf.low ?? 0;
        }
        const df = d.dependency_findings;
        if (df) {
            depFindings.critical += df.critical ?? 0;
            depFindings.high += df.high ?? 0;
            depFindings.moderate += df.moderate ?? 0;
            depFindings.low += df.low ?? 0;
        }
        testsCreated += d.tests_created ?? 0;
        reworkCycles += d.rework_cycles ?? 0;
        totalDuration += run.duration_ms;
        totalCost += d.cost_usd ?? 0;
    }
    // Trend: compare first half vs second half of window
    const trend = calculateTrend(forgeRuns);
    return {
        window: forgeRuns.length,
        total_runs: forgeRuns.length,
        successful_runs: successful,
        partial_runs: partial,
        failed_runs: failed,
        avg_gate_pass_rate: totalGateTotal > 0 ? totalGatePasses / totalGateTotal : 0,
        total_security_findings: secFindings,
        total_dependency_findings: depFindings,
        total_tests_created: testsCreated,
        total_rework_cycles: reworkCycles,
        avg_duration_ms: totalDuration / forgeRuns.length,
        avg_cost_usd: totalCost / forgeRuns.length,
        trend,
    };
}
/**
 * Compare gate pass rate of recent vs older runs to determine trend.
 */
function calculateTrend(runs) {
    if (runs.length < 4)
        return 'stable';
    const mid = Math.floor(runs.length / 2);
    // runs are sorted newest-first, so recent = first half
    const recent = runs.slice(0, mid);
    const older = runs.slice(mid);
    function avgPassRate(evts) {
        let passes = 0;
        let total = 0;
        for (const e of evts) {
            const d = e.details;
            const p = d.gate_passes ?? 0;
            const f = d.gate_failures ?? 0;
            passes += p;
            total += p + f;
        }
        return total > 0 ? passes / total : 0;
    }
    const recentRate = avgPassRate(recent);
    const olderRate = avgPassRate(older);
    const delta = recentRate - olderRate;
    if (delta > 0.05)
        return 'improving';
    if (delta < -0.05)
        return 'declining';
    return 'stable';
}
/**
 * Format aggregation as a human-readable CLI output.
 */
export function formatMetrics(agg) {
    if (agg.total_runs === 0) {
        return [
            'Quality Metrics',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '  No telemetry data yet. Run /forge to start collecting metrics.',
            '',
            '  Tip: After 5+ forge runs, trend analysis becomes available.',
        ].join('\n');
    }
    const trendArrow = agg.trend === 'improving' ? '↑' : agg.trend === 'declining' ? '↓' : '→';
    const passRatePct = (agg.avg_gate_pass_rate * 100).toFixed(1);
    const durationMin = Math.floor(agg.avg_duration_ms / 60000);
    const durationSec = Math.round((agg.avg_duration_ms % 60000) / 1000);
    const lines = [
        `Quality Metrics (last ${agg.window} runs)`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `  Forge Runs:          ${agg.total_runs} total, ${agg.successful_runs} successful, ${agg.partial_runs} partial, ${agg.failed_runs} failed`,
        `  Gate Pass Rate:      ${passRatePct}%`,
        `  Security Findings:   ${agg.total_security_findings.critical} critical, ${agg.total_security_findings.high} high, ${agg.total_security_findings.medium} medium, ${agg.total_security_findings.low} low`,
        `  Dependency CVEs:     ${agg.total_dependency_findings.critical} critical, ${agg.total_dependency_findings.high} high, ${agg.total_dependency_findings.moderate} moderate`,
        `  Tests Created:       ${agg.total_tests_created} new tests`,
        `  Rework Cycles:       ${agg.total_rework_cycles} fixer attempts`,
        `  Avg Run Duration:    ${durationMin}m ${durationSec}s`,
        `  Avg Run Cost:        $${agg.avg_cost_usd.toFixed(4)}`,
        '',
        `  Trend: ${agg.trend.toUpperCase()} ${trendArrow}`,
    ];
    return lines.join('\n');
}
/**
 * Read all telemetry events from current file AND rotated archives.
 * Returns events sorted oldest-first across all files.
 */
export function readAllEvents(workDir) {
    const allEvents = [];
    // Read rotated archives first (oldest data)
    for (let i = MAX_ARCHIVES; i >= 1; i--) {
        const archivePath = join(workDir, SF_DIR, `telemetry.${i}.jsonl`);
        const { events } = readEventsFromFile(archivePath);
        allEvents.push(...events);
    }
    // Read current file
    const { events } = readEventsFromFile(getTelemetryPath(workDir));
    allEvents.push(...events);
    // Sort oldest-first
    allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return allEvents;
}
/**
 * Format metrics with industry baseline comparison.
 */
export function formatMetricsWithBaselines(agg) {
    const base = formatMetrics(agg);
    if (agg.total_runs === 0)
        return base;
    // Calculate project security vuln rate
    const totalFindings = agg.total_security_findings.critical + agg.total_security_findings.high +
        agg.total_security_findings.medium + agg.total_security_findings.low;
    const projectVulnRate = agg.total_runs > 0 ? totalFindings / agg.total_runs : 0;
    const industryVulnRate = INDUSTRY_BASELINES.security_vuln_rate.value;
    // Gate pass rate as quality proxy (higher = fewer defects)
    const projectDefectRatio = 1 - agg.avg_gate_pass_rate;
    const industryDefectRatio = 1 - (1 / INDUSTRY_BASELINES.issue_ratio_vs_human.value);
    const lines = [
        base,
        '',
        '  vs Industry Baselines:',
        `    Security findings/run: ${projectVulnRate.toFixed(1)} (yours) vs ${(industryVulnRate * 100).toFixed(0)}% vuln rate (${INDUSTRY_BASELINES.security_vuln_rate.source})`,
        `    Gate failure rate:     ${(projectDefectRatio * 100).toFixed(1)}% (yours) vs ${(industryDefectRatio * 100).toFixed(1)}% (derived from ${INDUSTRY_BASELINES.issue_ratio_vs_human.source})`,
    ];
    return lines.join('\n');
}
//# sourceMappingURL=telemetry.js.map
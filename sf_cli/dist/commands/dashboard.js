/**
 * Dashboard CLI command — multi-project overview, drill-down, and analytics.
 *
 * Usage:
 *   sf dashboard                          — Project overview table
 *   sf dashboard sync [--json]            — Force-sync all projects into central DB
 *   sf dashboard status <project>         — Detailed single-project view
 *   sf dashboard failures [--severity X] [--project X]  — Cross-project failure report
 *   sf dashboard top [--by events|failures|cost|perf]   — Project rankings
 *   sf dashboard kpi [--project X]        — Computed KPI metrics
 *   sf dashboard health                   — Health assessment for all projects
 *   sf dashboard import [path]            — Import session files from inbox or path
 *   sf dashboard patterns [--project X]   — Failure pattern analysis
 *   sf dashboard serve [--port N]         — Start web dashboard server
 *   All subcommands support --json for machine-readable output.
 */
import { join, resolve } from 'node:path';
import { syncAllProjects, formatSyncResult } from '../core/dashboard-sync.js';
import { importInbox, scanProjectSessions, formatImportResult } from '../core/session-import.js';
import { detectPatterns, formatPatternReport } from '../core/failure-detector.js';
import { startServer } from '../core/dashboard-server.js';
import { captureSnapshots, generateTrendReport, forecastMetric, formatTrendReport, formatSnapshotResult, formatForecast, } from '../core/kpi-engine.js';
import { scanForRemediations, applyRemediation, generateRemediationReport, seedPlaybooks, formatScanResult as formatRemScanResult, formatRemediationReport, formatRemediationList, formatPlaybookList, } from '../core/remediation-engine.js';
import { initDatabase, getProjectSummaries, getProjectDetail, getFailurePatterns, getProjectRankings, computeProjectKpis, computeHealthReport, getRemediations, getPlaybooks, } from '../core/dashboard-db.js';
const DEFAULT_DB_PATH = 'data/dashboard.db';
const LINE = '\u2501';
const THIN = '\u2500';
// ── Helpers ─────────────────────────────────────────────────────
function getDbPath(workDir) {
    const { existsSync } = require('node:fs');
    let dir = resolve(workDir);
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, '.project-registry'))) {
            return join(dir, DEFAULT_DB_PATH);
        }
        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return join(resolve(workDir), DEFAULT_DB_PATH);
}
function getFrameworkDir(workDir) {
    const { existsSync } = require('node:fs');
    let dir = resolve(workDir);
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, '.project-registry'))) {
            return dir;
        }
        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return resolve(workDir);
}
function parseArgs(args) {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const positional = [];
    const flags = {};
    let subcommand = '';
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('--')) {
            const key = parts[i].slice(2);
            // --json is a boolean flag
            if (key === 'json') {
                flags.json = 'true';
            }
            else if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
                flags[key] = parts[i + 1];
                i++;
            }
            else {
                flags[key] = 'true';
            }
        }
        else if (!subcommand) {
            subcommand = parts[i];
        }
        else {
            positional.push(parts[i]);
        }
    }
    return { subcommand, positional, flags };
}
function withDb(dbPath, fn) {
    let db = null;
    try {
        db = initDatabase(dbPath);
        return fn(db);
    }
    finally {
        if (db)
            db.close();
    }
}
function fmtTimestamp(ts) {
    if (!ts)
        return 'never';
    return ts.replace('T', ' ').slice(0, 19);
}
function pct(n) {
    return (n * 100).toFixed(1) + '%';
}
// ── Subcommand formatters ─────────────────────────────────────────
function formatOverview(dbPath) {
    return withDb(dbPath, (db) => {
        const summaries = getProjectSummaries(db);
        if (summaries.length === 0) {
            return [
                'Dashboard Overview',
                LINE.repeat(60),
                '  No projects synced yet. Run: /dashboard sync',
            ].join('\n');
        }
        const nameWidth = Math.max(20, ...summaries.map((s) => s.name.length)) + 2;
        const header = [
            'Dashboard Overview',
            LINE.repeat(60),
            `  ${'Project'.padEnd(nameWidth)} ${'Health'.padEnd(10)} ${'Events'.padEnd(8)} ${'Failures'.padEnd(10)} Last Sync`,
            `  ${THIN.repeat(nameWidth)} ${THIN.repeat(10)} ${THIN.repeat(8)} ${THIN.repeat(10)} ${THIN.repeat(19)}`,
        ];
        const rows = summaries.map((s) => {
            const syncTime = fmtTimestamp(s.last_synced_at);
            return `  ${s.name.padEnd(nameWidth)} ${(s.health_status || 'unknown').padEnd(10)} ${String(s.event_count).padEnd(8)} ${String(s.failure_count).padEnd(10)} ${syncTime}`;
        });
        return [...header, ...rows, '', `  Total: ${summaries.length} projects`].join('\n');
    });
}
function formatStatus(dbPath, projectName) {
    return withDb(dbPath, (db) => {
        const detail = getProjectDetail(db, projectName);
        if (!detail)
            return `  Project "${projectName}" not found. Run /dashboard sync first.`;
        const p = detail.project;
        const lines = [
            `Project: ${p.name}`,
            LINE.repeat(60),
            `  ID:               ${p.id}`,
            `  Path:             ${p.path}`,
            `  Platform:         ${p.platform}`,
            `  Framework:        ${p.framework_version || 'unknown'}`,
            `  Health:           ${p.health_status}`,
            `  Last synced:      ${fmtTimestamp(p.last_synced_at)}`,
            `  Registered:       ${fmtTimestamp(p.created_at)}`,
            '',
        ];
        // Event counts
        const totalEvents = Object.values(detail.event_counts).reduce((a, b) => a + b, 0);
        lines.push(`  Telemetry Events: ${totalEvents} total`);
        for (const [type, count] of Object.entries(detail.event_counts)) {
            lines.push(`    ${type.padEnd(20)} ${count}`);
        }
        lines.push('');
        // Perf stats
        if (detail.perf_stats.length > 0) {
            lines.push('  Gate Performance:');
            lines.push(`    ${'Gate'.padEnd(20)} ${'Count'.padEnd(8)} ${'Avg ms'.padEnd(10)} Max ms`);
            lines.push(`    ${THIN.repeat(20)} ${THIN.repeat(8)} ${THIN.repeat(10)} ${THIN.repeat(10)}`);
            for (const stat of detail.perf_stats) {
                lines.push(`    ${stat.gate.padEnd(20)} ${String(stat.count).padEnd(8)} ${String(stat.avg_ms).padEnd(10)} ${stat.max_ms}`);
            }
            lines.push('');
        }
        // Failure patterns
        if (detail.failure_patterns.length > 0) {
            lines.push(`  Failure Patterns: ${detail.failure_patterns.length}`);
            for (const f of detail.failure_patterns) {
                const status = f.remediation_status === 'open' ? '[OPEN]' : '[resolved]';
                lines.push(`    ${status} ${f.signature} (x${f.occurrences}, ${f.severity}, last: ${fmtTimestamp(f.last_seen)})`);
            }
            lines.push('');
        }
        // Knowledge
        lines.push(`  Knowledge Entries: ${detail.knowledge_count}`);
        // Recent events
        if (detail.recent_events.length > 0) {
            lines.push('');
            lines.push('  Recent Activity:');
            for (const evt of detail.recent_events.slice(0, 5)) {
                const dur = evt.duration_ms ? ` (${Math.round(evt.duration_ms / 1000)}s)` : '';
                lines.push(`    ${fmtTimestamp(evt.timestamp)}  ${evt.event_type}  ${evt.status}${dur}`);
            }
        }
        return lines.join('\n');
    });
}
function formatFailures(dbPath, flags) {
    return withDb(dbPath, (db) => {
        const patterns = getFailurePatterns(db, {
            severity: flags.severity,
            projectName: flags.project,
            limit: flags.limit ? parseInt(flags.limit, 10) : 50,
        });
        if (patterns.length === 0) {
            return [
                'Failure Report',
                LINE.repeat(60),
                '  No failure patterns found.',
            ].join('\n');
        }
        const nameWidth = Math.max(15, ...patterns.map((p) => p.project_name.length)) + 2;
        const sigWidth = Math.max(25, ...patterns.map((p) => p.signature.length)) + 2;
        const lines = [
            'Failure Report',
            LINE.repeat(60),
            `  ${'Project'.padEnd(nameWidth)} ${'Signature'.padEnd(sigWidth)} ${'Occ'.padEnd(6)} ${'Severity'.padEnd(10)} ${'Status'.padEnd(10)} Last Seen`,
            `  ${THIN.repeat(nameWidth)} ${THIN.repeat(sigWidth)} ${THIN.repeat(6)} ${THIN.repeat(10)} ${THIN.repeat(10)} ${THIN.repeat(19)}`,
        ];
        for (const p of patterns) {
            lines.push(`  ${p.project_name.padEnd(nameWidth)} ${p.signature.padEnd(sigWidth)} ${String(p.occurrences).padEnd(6)} ${(p.severity || '-').padEnd(10)} ${(p.remediation_status || '-').padEnd(10)} ${fmtTimestamp(p.last_seen)}`);
        }
        lines.push('');
        lines.push(`  Total: ${patterns.length} pattern(s)`);
        return lines.join('\n');
    });
}
function formatTop(dbPath, flags) {
    const metric = (flags.by || 'events');
    const validMetrics = ['events', 'failures', 'cost', 'perf'];
    if (!validMetrics.includes(metric)) {
        return `  Invalid metric "${metric}". Use: ${validMetrics.join(', ')}`;
    }
    return withDb(dbPath, (db) => {
        const rankings = getProjectRankings(db, metric, parseInt(flags.limit || '10', 10));
        if (rankings.length === 0) {
            return [
                `Top Projects (by ${metric})`,
                LINE.repeat(60),
                '  No data available. Run: /dashboard sync',
            ].join('\n');
        }
        const nameWidth = Math.max(20, ...rankings.map((r) => r.name.length)) + 2;
        const lines = [
            `Top Projects (by ${metric})`,
            LINE.repeat(60),
            `  ${'#'.padEnd(4)} ${'Project'.padEnd(nameWidth)} Value`,
            `  ${THIN.repeat(4)} ${THIN.repeat(nameWidth)} ${THIN.repeat(20)}`,
        ];
        for (const r of rankings) {
            const valueStr = metric === 'cost'
                ? `$${r.value.toFixed(4)}`
                : metric === 'perf'
                    ? `${r.value} ms`
                    : String(r.value);
            lines.push(`  ${String(r.rank).padEnd(4)} ${r.name.padEnd(nameWidth)} ${valueStr} ${r.label}`);
        }
        return lines.join('\n');
    });
}
function formatKpi(dbPath, flags) {
    return withDb(dbPath, (db) => {
        let projectId;
        const projectName = flags.project;
        if (projectName) {
            const detail = getProjectDetail(db, projectName);
            if (!detail)
                return `  Project "${projectName}" not found.`;
            projectId = detail.project.id;
        }
        const kpi = computeProjectKpis(db, projectId);
        const scope = projectName || 'All Projects';
        const durationMin = Math.floor(kpi.avg_duration_ms / 60000);
        const durationSec = Math.round((kpi.avg_duration_ms % 60000) / 1000);
        const lines = [
            `KPI Summary: ${scope}`,
            LINE.repeat(60),
            `  Forge Runs:          ${kpi.total_forge_runs} total, ${kpi.successful_runs} successful, ${kpi.failed_runs} failed`,
            `  Success Rate:        ${pct(kpi.success_rate)}`,
            `  Gate Pass Rate:      ${pct(kpi.gate_pass_rate)} (${kpi.total_gate_passes} pass / ${kpi.total_gate_failures} fail)`,
            `  Security Findings:   ${kpi.security_critical} critical, ${kpi.security_high} high`,
            `  Avg Run Duration:    ${durationMin}m ${durationSec}s`,
            `  Avg Run Cost:        $${kpi.avg_cost_usd.toFixed(4)}`,
            `  Knowledge Entries:   ${kpi.total_knowledge}`,
            `  Open Failures:       ${kpi.open_failures}`,
        ];
        return lines.join('\n');
    });
}
function formatHealth(dbPath) {
    return withDb(dbPath, (db) => {
        const report = computeHealthReport(db);
        if (report.length === 0) {
            return [
                'Health Assessment',
                LINE.repeat(60),
                '  No projects to assess. Run: /dashboard sync',
            ].join('\n');
        }
        const nameWidth = Math.max(20, ...report.map((r) => r.name.length)) + 2;
        const lines = [
            'Health Assessment',
            LINE.repeat(60),
            `  ${'Project'.padEnd(nameWidth)} ${'Grade'.padEnd(7)} ${'Score'.padEnd(7)} Issues`,
            `  ${THIN.repeat(nameWidth)} ${THIN.repeat(7)} ${THIN.repeat(7)} ${THIN.repeat(30)}`,
        ];
        for (const r of report) {
            const issueStr = r.issues.length > 0 ? r.issues.join(', ') : 'none';
            lines.push(`  ${r.name.padEnd(nameWidth)} ${r.grade.padEnd(7)} ${String(r.score).padEnd(7)} ${issueStr}`);
        }
        // Summary
        const avgScore = report.reduce((sum, r) => sum + r.score, 0) / report.length;
        const critCount = report.filter((r) => r.grade === 'F' || r.grade === 'D').length;
        lines.push('');
        lines.push(`  Average Score: ${avgScore.toFixed(0)}/100`);
        if (critCount > 0) {
            lines.push(`  Projects needing attention: ${critCount}`);
        }
        return lines.join('\n');
    });
}
// ── Help text ─────────────────────────────────────────────────────
function formatHelp() {
    return [
        'Dashboard Commands',
        LINE.repeat(60),
        '  /dashboard                   Overview table of all projects',
        '  /dashboard sync              Sync all projects into central DB',
        '  /dashboard status <project>  Detailed single-project drill-down',
        '  /dashboard failures          Cross-project failure report',
        '  /dashboard top               Project rankings',
        '  /dashboard kpi               KPI summary across all projects',
        '  /dashboard health            Health assessment',
        '  /dashboard import [project]  Import session reports (inbox or project)',
        '  /dashboard patterns          Failure pattern analysis & detection',
        '  /dashboard trend [--days N]  KPI trend report (default: 7 days)',
        '  /dashboard snapshot          Capture KPI snapshots for all projects',
        '  /dashboard forecast <proj>   Metric forecasts for a project',
        '  /dashboard remediate         Remediation report',
        '  /dashboard remediate scan    Scan for new remediation actions',
        '  /dashboard remediate list    List all remediations',
        '  /dashboard remediate apply   Apply a remediation',
        '  /dashboard remediate playbooks  List remediation playbooks',
        '  /dashboard serve [--port N]  Start web dashboard (default: 9400)',
        '',
        '  Flags:',
        '    --json                     Machine-readable JSON output',
        '    --severity <level>         Filter failures (critical/error/warning)',
        '    --project <name>           Filter by project name',
        '    --by <metric>              Ranking metric (events/failures/cost/perf)',
        '    --limit <n>                Limit results',
        '    --port <n>                 Dashboard server port (default: 9400)',
        '    --days <n>                 Trend window in days (default: 7)',
        '    --metric <name>            Forecast metric (success_rate, gate_pass_rate, avg_cost_usd)',
        '    --status <s>               Filter remediations (pending/in_progress/completed/failed)',
        '    --action <a>               Remediation action (start/complete/fail/skip)',
        '    --auto true                Enable auto-apply during remediation scan',
        '    --category <c>             Filter playbooks by category',
    ].join('\n');
}
// ── Main command ─────────────────────────────────────────────────
export const dashboardCommand = {
    name: 'dashboard',
    description: 'Multi-project dashboard — sync, overview, drill-down, import, pattern detection',
    usage: '/dashboard [sync|status|failures|top|kpi|health|import|patterns|trend|snapshot|forecast|serve|help] [--json] [--project X]',
    execute: async (args, session) => {
        const { subcommand, positional, flags } = parseArgs(args);
        const jsonOutput = flags.json === 'true';
        const dbPath = getDbPath(session.workDir);
        const frameworkDir = getFrameworkDir(session.workDir);
        switch (subcommand) {
            case 'sync': {
                const result = syncAllProjects(dbPath, frameworkDir);
                return jsonOutput ? JSON.stringify(result, null, 2) : formatSyncResult(result);
            }
            case 'status': {
                const projectName = positional[0] || flags.project;
                if (!projectName)
                    return '  Usage: /dashboard status <project-name>';
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        const detail = getProjectDetail(db, projectName);
                        return detail ? JSON.stringify(detail, null, 2) : JSON.stringify({ error: 'project not found' });
                    });
                }
                return formatStatus(dbPath, projectName);
            }
            case 'failures': {
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        const patterns = getFailurePatterns(db, {
                            severity: flags.severity,
                            projectName: flags.project,
                            limit: flags.limit ? parseInt(flags.limit, 10) : 50,
                        });
                        return JSON.stringify(patterns, null, 2);
                    });
                }
                return formatFailures(dbPath, flags);
            }
            case 'top': {
                if (jsonOutput) {
                    const metric = (flags.by || 'events');
                    return withDb(dbPath, (db) => {
                        const rankings = getProjectRankings(db, metric, parseInt(flags.limit || '10', 10));
                        return JSON.stringify(rankings, null, 2);
                    });
                }
                return formatTop(dbPath, flags);
            }
            case 'kpi': {
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        let projectId;
                        if (flags.project) {
                            const detail = getProjectDetail(db, flags.project);
                            if (!detail)
                                return JSON.stringify({ error: 'project not found' });
                            projectId = detail.project.id;
                        }
                        const kpi = computeProjectKpis(db, projectId);
                        return JSON.stringify(kpi, null, 2);
                    });
                }
                return formatKpi(dbPath, flags);
            }
            case 'health': {
                if (jsonOutput) {
                    return withDb(dbPath, (db) => JSON.stringify(computeHealthReport(db), null, 2));
                }
                return formatHealth(dbPath);
            }
            case 'import': {
                const importPath = positional[0]; // optional specific path
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        if (importPath) {
                            // Import a specific project's sessions
                            const detail = getProjectDetail(db, importPath);
                            if (detail) {
                                const res = scanProjectSessions(db, detail.project.id, detail.project.path);
                                return JSON.stringify(res, null, 2);
                            }
                            return JSON.stringify({ error: `Project "${importPath}" not found` });
                        }
                        const res = importInbox(db, frameworkDir);
                        return JSON.stringify(res, null, 2);
                    });
                }
                return withDb(dbPath, (db) => {
                    if (importPath) {
                        const detail = getProjectDetail(db, importPath);
                        if (!detail)
                            return `  Project "${importPath}" not found. Run /dashboard sync first.`;
                        const res = scanProjectSessions(db, detail.project.id, detail.project.path);
                        return formatImportResult(res);
                    }
                    const res = importInbox(db, frameworkDir);
                    return formatImportResult(res);
                });
            }
            case 'patterns': {
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        let projectId;
                        if (flags.project) {
                            const detail = getProjectDetail(db, flags.project);
                            if (!detail)
                                return JSON.stringify({ error: 'project not found' });
                            projectId = detail.project.id;
                        }
                        return JSON.stringify(detectPatterns(db, projectId), null, 2);
                    });
                }
                return withDb(dbPath, (db) => {
                    let projectId;
                    if (flags.project) {
                        const detail = getProjectDetail(db, flags.project);
                        if (!detail)
                            return `  Project "${flags.project}" not found.`;
                        projectId = detail.project.id;
                    }
                    return formatPatternReport(detectPatterns(db, projectId));
                });
            }
            case 'trend':
            case 'trends': {
                const days = flags.days ? parseInt(flags.days, 10) : 7;
                if (jsonOutput) {
                    return withDb(dbPath, (db) => {
                        if (flags.project) {
                            const detail = getProjectDetail(db, flags.project);
                            if (!detail)
                                return JSON.stringify({ error: 'project not found' });
                            const { getSnapshots } = require('../core/kpi-engine.js');
                            return JSON.stringify(getSnapshots(db, detail.project.id, days), null, 2);
                        }
                        return JSON.stringify(generateTrendReport(db, days), null, 2);
                    });
                }
                return withDb(dbPath, (db) => formatTrendReport(generateTrendReport(db, days)));
            }
            case 'snapshot': {
                if (jsonOutput) {
                    return withDb(dbPath, (db) => JSON.stringify(captureSnapshots(db), null, 2));
                }
                return withDb(dbPath, (db) => formatSnapshotResult(captureSnapshots(db)));
            }
            case 'forecast': {
                const projectName = positional[0] || flags.project;
                if (!projectName)
                    return '  Usage: /dashboard forecast <project> [--metric success_rate|gate_pass_rate|avg_cost_usd]';
                return withDb(dbPath, (db) => {
                    const detail = getProjectDetail(db, projectName);
                    if (!detail)
                        return `  Project "${projectName}" not found.`;
                    const metrics = ['success_rate', 'gate_pass_rate', 'avg_cost_usd'];
                    if (flags.metric) {
                        const forecasts = [forecastMetric(db, detail.project.id, flags.metric)];
                        return jsonOutput ? JSON.stringify(forecasts, null, 2) : formatForecast(forecasts);
                    }
                    const forecasts = metrics.map((m) => forecastMetric(db, detail.project.id, m));
                    return jsonOutput ? JSON.stringify(forecasts, null, 2) : formatForecast(forecasts);
                });
            }
            case 'remediate': {
                const remAction = positional[0] || 'report';
                switch (remAction) {
                    case 'scan': {
                        const autoApply = flags.auto === 'true';
                        if (jsonOutput) {
                            return withDb(dbPath, (db) => JSON.stringify(scanForRemediations(db, { autoApply }), null, 2));
                        }
                        return withDb(dbPath, (db) => formatRemScanResult(scanForRemediations(db, { autoApply })));
                    }
                    case 'list': {
                        if (jsonOutput) {
                            return withDb(dbPath, (db) => {
                                let projectId;
                                if (flags.project) {
                                    const detail = getProjectDetail(db, flags.project);
                                    if (detail)
                                        projectId = detail.project.id;
                                }
                                return JSON.stringify(getRemediations(db, { projectId, status: flags.status }), null, 2);
                            });
                        }
                        return withDb(dbPath, (db) => {
                            let projectId;
                            if (flags.project) {
                                const detail = getProjectDetail(db, flags.project);
                                if (detail)
                                    projectId = detail.project.id;
                            }
                            return formatRemediationList(getRemediations(db, { projectId, status: flags.status }));
                        });
                    }
                    case 'apply': {
                        const remId = positional[1];
                        if (!remId)
                            return '  Usage: /dashboard remediate apply <remediation-id> [--action start|complete|fail|skip]';
                        const action = (flags.action || 'start');
                        return withDb(dbPath, (db) => {
                            const result = applyRemediation(db, remId, action, flags.result);
                            return jsonOutput ? JSON.stringify(result, null, 2) : `  ${result.status}: ${result.message}`;
                        });
                    }
                    case 'playbooks': {
                        if (jsonOutput) {
                            return withDb(dbPath, (db) => JSON.stringify(getPlaybooks(db, flags.category), null, 2));
                        }
                        return withDb(dbPath, (db) => formatPlaybookList(getPlaybooks(db, flags.category)));
                    }
                    case 'report':
                    default: {
                        if (jsonOutput) {
                            return withDb(dbPath, (db) => {
                                let projectId;
                                if (flags.project) {
                                    const detail = getProjectDetail(db, flags.project);
                                    if (detail)
                                        projectId = detail.project.id;
                                }
                                return JSON.stringify(generateRemediationReport(db, { projectId }), null, 2);
                            });
                        }
                        return withDb(dbPath, (db) => {
                            let projectId;
                            if (flags.project) {
                                const detail = getProjectDetail(db, flags.project);
                                if (detail)
                                    projectId = detail.project.id;
                            }
                            return formatRemediationReport(generateRemediationReport(db, { projectId }));
                        });
                    }
                }
            }
            case 'serve': {
                const port = flags.port ? parseInt(flags.port, 10) : 9400;
                if (isNaN(port) || port < 1 || port > 65535) {
                    return '  Invalid port number. Use: /dashboard serve --port <1-65535>';
                }
                // Auto-prepare: sync, snapshot, seed playbooks, scan remediations
                const prepLines = [];
                try {
                    const syncResult = syncAllProjects(dbPath, frameworkDir);
                    prepLines.push(`  Synced ${syncResult.projects_synced} projects (${syncResult.events_added} events, ${syncResult.knowledge_added} knowledge)`);
                }
                catch {
                    prepLines.push('  Sync: skipped (error)');
                }
                try {
                    const db = initDatabase(dbPath);
                    try {
                        const snapResult = captureSnapshots(db);
                        prepLines.push(`  KPI snapshots: ${snapResult.projects_captured} captured, ${snapResult.projects_skipped} skipped`);
                        seedPlaybooks(db);
                        prepLines.push(`  Playbooks: seeded`);
                        const scanResult = scanForRemediations(db);
                        prepLines.push(`  Remediations: ${scanResult.actions_created} created, ${scanResult.auto_applied} auto-applied`);
                    }
                    finally {
                        db.close();
                    }
                }
                catch {
                    prepLines.push('  Prepare: skipped (error)');
                }
                const server = startServer({
                    port,
                    dbPath,
                    frameworkDir,
                });
                return [
                    'Dashboard Server',
                    LINE.repeat(60),
                    '',
                    '  Preparation:',
                    ...prepLines,
                    '',
                    `  Web dashboard running at: http://127.0.0.1:${server.port}`,
                    '',
                    '  Press Ctrl+C to stop the server.',
                ].join('\n');
            }
            case 'help':
                return formatHelp();
            case '':
                // Default: overview table
                if (jsonOutput) {
                    return withDb(dbPath, (db) => JSON.stringify(getProjectSummaries(db), null, 2));
                }
                return formatOverview(dbPath);
            default:
                return `  Unknown subcommand "${subcommand}". Run /dashboard help for usage.`;
        }
    },
};
//# sourceMappingURL=dashboard.js.map
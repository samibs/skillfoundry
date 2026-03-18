/**
 * Dashboard HTTP server — serves the web dashboard and JSON API endpoints.
 * Uses Node.js built-in http module (zero dependencies).
 *
 * API routes:
 *   GET /api/projects         — Project summaries
 *   GET /api/projects/:id     — Single project detail
 *   GET /api/kpi              — Global KPI metrics
 *   GET /api/kpi?project=X    — Project-specific KPIs
 *   GET /api/failures         — Failure patterns
 *   GET /api/health           — Health report
 *   GET /api/patterns         — Detected failure patterns
 *   GET /api/sessions         — Session reports
 *   GET /api/top?by=X         — Project rankings
 *   POST /api/sync            — Trigger sync
 *   GET /api/trends           — KPI trend report
 *   POST /api/trends/snapshot — Capture KPI snapshots
 *   GET /api/trends/forecast  — Metric forecasts
 *   GET /api/remediations     — Remediation actions
 *   GET /api/remediations/stats — Remediation statistics
 *   GET /api/remediations/report — Full remediation report
 *   POST /api/remediations/scan — Scan for new remediations
 *   POST /api/remediations/:id/apply — Apply a remediation
 *   GET /api/playbooks        — Remediation playbooks
 *   GET /                     — Dashboard HTML
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../utils/logger.js';
import { initDatabase, getProjectSummaries, getProjectDetail, getFailurePatterns, getProjectRankings, computeProjectKpis, computeHealthReport, getSessionReports, getCrossProjectPatterns, getRemediations, getRemediationStats, getPlaybooks, } from './dashboard-db.js';
import { detectPatterns } from './failure-detector.js';
import { syncAllProjects } from './dashboard-sync.js';
import { captureSnapshots, generateTrendReport, getSnapshots, getLatestSnapshots, forecastMetric, } from './kpi-engine.js';
import { scanForRemediations, applyRemediation, generateRemediationReport, } from './remediation-engine.js';
// ── HTML loader ──────────────────────────────────────────────
function loadDashboardHtml(htmlPath) {
    // Try explicit path first
    if (htmlPath && existsSync(htmlPath)) {
        return readFileSync(htmlPath, 'utf-8');
    }
    // Try relative to this module
    const candidates = [
        join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dashboard.html'),
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'web', 'dashboard.html'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return readFileSync(candidate, 'utf-8');
        }
    }
    return '<html><body><h1>Dashboard HTML not found</h1></body></html>';
}
// ── Request helpers ──────────────────────────────────────────
function sendJson(res, data, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
    });
    res.end(body);
}
function sendHtml(res, html) {
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
    });
    res.end(html);
}
function send404(res) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
}
function parseQuery(url) {
    const idx = url.indexOf('?');
    if (idx === -1)
        return {};
    const params = {};
    const qs = url.slice(idx + 1);
    for (const pair of qs.split('&')) {
        const [key, val] = pair.split('=');
        if (key)
            params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    }
    return params;
}
function getPathname(url) {
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.slice(0, idx);
}
// ── Route handler ──────────────────────────────────────────────
function handleRequest(req, res, options, dashboardHtml) {
    const log = getLogger();
    const url = req.url || '/';
    const method = req.method || 'GET';
    const pathname = getPathname(url);
    const query = parseQuery(url);
    // CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }
    // Serve dashboard HTML
    if (pathname === '/' || pathname === '/index.html') {
        sendHtml(res, dashboardHtml);
        return;
    }
    // API routes — all need DB access
    if (!pathname.startsWith('/api/')) {
        send404(res);
        return;
    }
    let db;
    try {
        db = initDatabase(options.dbPath);
    }
    catch (err) {
        sendJson(res, { error: 'Database initialization failed', detail: String(err) }, 500);
        return;
    }
    try {
        routeApi(pathname, method, query, db, options, res);
    }
    catch (err) {
        log.warn('dashboard-server', 'request_error', { url, error: String(err) });
        sendJson(res, { error: 'Internal server error', detail: String(err) }, 500);
    }
    finally {
        db.close();
    }
}
function routeApi(pathname, method, query, db, options, res) {
    // GET /api/projects
    if (pathname === '/api/projects' && method === 'GET') {
        sendJson(res, getProjectSummaries(db));
        return;
    }
    // GET /api/projects/:nameOrId
    const projectMatch = pathname.match(/^\/api\/projects\/(.+)$/);
    if (projectMatch && method === 'GET') {
        const detail = getProjectDetail(db, decodeURIComponent(projectMatch[1]));
        if (!detail) {
            sendJson(res, { error: 'project not found' }, 404);
            return;
        }
        sendJson(res, detail);
        return;
    }
    // GET /api/kpi[?project=X]
    if (pathname === '/api/kpi' && method === 'GET') {
        let projectId;
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (!detail) {
                sendJson(res, { error: 'project not found' }, 404);
                return;
            }
            projectId = detail.project.id;
        }
        sendJson(res, computeProjectKpis(db, projectId));
        return;
    }
    // GET /api/failures[?severity=X&project=X&limit=N]
    if (pathname === '/api/failures' && method === 'GET') {
        sendJson(res, getFailurePatterns(db, {
            severity: query.severity,
            projectName: query.project,
            limit: query.limit ? parseInt(query.limit, 10) : 50,
        }));
        return;
    }
    // GET /api/health
    if (pathname === '/api/health' && method === 'GET') {
        sendJson(res, computeHealthReport(db));
        return;
    }
    // GET /api/patterns[?project=X]
    if (pathname === '/api/patterns' && method === 'GET') {
        let projectId;
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (detail)
                projectId = detail.project.id;
        }
        sendJson(res, detectPatterns(db, projectId));
        return;
    }
    // GET /api/sessions[?project=X&limit=N]
    if (pathname === '/api/sessions' && method === 'GET') {
        let projectId;
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (detail)
                projectId = detail.project.id;
        }
        sendJson(res, getSessionReports(db, projectId, query.limit ? parseInt(query.limit, 10) : 20));
        return;
    }
    // GET /api/top[?by=events|failures|cost|perf&limit=N]
    if (pathname === '/api/top' && method === 'GET') {
        const metric = (query.by || 'events');
        const limit = query.limit ? parseInt(query.limit, 10) : 10;
        sendJson(res, getProjectRankings(db, metric, limit));
        return;
    }
    // GET /api/cross-project
    if (pathname === '/api/cross-project' && method === 'GET') {
        sendJson(res, getCrossProjectPatterns(db));
        return;
    }
    // POST /api/sync
    if (pathname === '/api/sync' && method === 'POST') {
        const result = syncAllProjects(options.dbPath, options.frameworkDir);
        sendJson(res, result);
        return;
    }
    // GET /api/trends[?project=X&days=N]
    if (pathname === '/api/trends' && method === 'GET') {
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (!detail) {
                sendJson(res, { error: 'project not found' }, 404);
                return;
            }
            const days = query.days ? parseInt(query.days, 10) : 30;
            sendJson(res, getSnapshots(db, detail.project.id, days));
            return;
        }
        const days = query.days ? parseInt(query.days, 10) : 7;
        sendJson(res, generateTrendReport(db, days));
        return;
    }
    // POST /api/trends/snapshot — capture KPI snapshots
    if (pathname === '/api/trends/snapshot' && method === 'POST') {
        sendJson(res, captureSnapshots(db));
        return;
    }
    // GET /api/trends/latest — latest snapshot per project
    if (pathname === '/api/trends/latest' && method === 'GET') {
        sendJson(res, getLatestSnapshots(db));
        return;
    }
    // GET /api/trends/forecast[?project=X&metric=Y&days=N]
    if (pathname === '/api/trends/forecast' && method === 'GET') {
        if (!query.project) {
            sendJson(res, { error: 'project parameter required' }, 400);
            return;
        }
        const detail = getProjectDetail(db, query.project);
        if (!detail) {
            sendJson(res, { error: 'project not found' }, 404);
            return;
        }
        const metric = (query.metric || 'success_rate');
        const days = query.days ? parseInt(query.days, 10) : 14;
        sendJson(res, forecastMetric(db, detail.project.id, metric, days));
        return;
    }
    // GET /api/remediations[?project=X&status=X]
    if (pathname === '/api/remediations' && method === 'GET') {
        let projectId;
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (detail)
                projectId = detail.project.id;
        }
        sendJson(res, getRemediations(db, {
            projectId,
            status: query.status,
            limit: query.limit ? parseInt(query.limit, 10) : 50,
        }));
        return;
    }
    // GET /api/remediations/stats
    if (pathname === '/api/remediations/stats' && method === 'GET') {
        sendJson(res, getRemediationStats(db));
        return;
    }
    // GET /api/remediations/report[?project=X]
    if (pathname === '/api/remediations/report' && method === 'GET') {
        let projectId;
        if (query.project) {
            const detail = getProjectDetail(db, query.project);
            if (detail)
                projectId = detail.project.id;
        }
        sendJson(res, generateRemediationReport(db, { projectId }));
        return;
    }
    // POST /api/remediations/scan[?auto=true]
    if (pathname === '/api/remediations/scan' && method === 'POST') {
        const autoApply = query.auto === 'true';
        sendJson(res, scanForRemediations(db, { autoApply }));
        return;
    }
    // POST /api/remediations/:id/apply[?action=start|complete|fail|skip]
    const remediationMatch = pathname.match(/^\/api\/remediations\/(.+)\/apply$/);
    if (remediationMatch && method === 'POST') {
        const action = (query.action || 'start');
        sendJson(res, applyRemediation(db, decodeURIComponent(remediationMatch[1]), action, query.result));
        return;
    }
    // GET /api/playbooks[?category=X]
    if (pathname === '/api/playbooks' && method === 'GET') {
        sendJson(res, getPlaybooks(db, query.category));
        return;
    }
    send404(res);
}
// ── Server lifecycle ──────────────────────────────────────────
/**
 * Start the dashboard HTTP server.
 * Returns a handle to stop it.
 */
export function startServer(options) {
    const log = getLogger();
    const dashboardHtml = loadDashboardHtml(options.htmlPath);
    const server = createServer((req, res) => {
        handleRequest(req, res, options, dashboardHtml);
    });
    server.listen(options.port, '127.0.0.1', () => {
        log.info('dashboard-server', 'started', { port: options.port });
    });
    return {
        port: options.port,
        stop: () => {
            server.close();
            log.info('dashboard-server', 'stopped', {});
        },
    };
}
/**
 * Exported for testing: process a single request against in-memory state.
 */
export { handleRequest, loadDashboardHtml };
//# sourceMappingURL=dashboard-server.js.map
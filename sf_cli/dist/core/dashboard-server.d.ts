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
import { type IncomingMessage, type ServerResponse } from 'node:http';
export interface ServerOptions {
    port: number;
    dbPath: string;
    frameworkDir: string;
    htmlPath?: string;
}
declare function loadDashboardHtml(htmlPath?: string): string;
declare function handleRequest(req: IncomingMessage, res: ServerResponse, options: ServerOptions, dashboardHtml: string): void;
/**
 * Start the dashboard HTTP server.
 * Returns a handle to stop it.
 */
export declare function startServer(options: ServerOptions): {
    stop: () => void;
    port: number;
};
/**
 * Exported for testing: process a single request against in-memory state.
 */
export { handleRequest, loadDashboardHtml };

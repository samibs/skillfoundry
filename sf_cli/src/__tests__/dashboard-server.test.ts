import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { initDatabase, upsertProject, insertTelemetryEvents, insertFailurePatterns } from '../core/dashboard-db.js';
import { startServer } from '../core/dashboard-server.js';
import type Database from 'better-sqlite3';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-dashboard-server-' + process.pid);
const DB_PATH = join(TEST_DIR, 'test.db');
let db: Database.Database;

function fetch(port: number, path: string, method: string = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchJson(port: number, path: string): Promise<{ status: number; data: unknown }> {
  return fetch(port, path).then(({ status, body }) => ({
    status,
    data: JSON.parse(body),
  }));
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  db = initDatabase(DB_PATH);
});

afterEach(() => {
  if (db) db.close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function seedData() {
  upsertProject(db, { id: 'p1', path: '/path/alpha', name: 'alpha' });
  upsertProject(db, { id: 'p2', path: '/path/beta', name: 'beta' });
  insertTelemetryEvents(db, 'p1', [
    { id: 'e1', event_type: 'forge_start', timestamp: '2026-03-01T10:00:00Z', status: 'ok' },
    { id: 'e2', event_type: 'forge_end', timestamp: '2026-03-01T10:30:00Z', status: 'ok', duration_ms: 1800000 },
  ]);
  insertFailurePatterns(db, 'p1', [
    { project_id: 'p1', signature: 'BUILD:tsc', occurrences: 5, last_seen: '2026-03-01T10:15:00Z', severity: 'error' },
  ]);
}

describe('dashboard-server', () => {
  let serverHandle: { stop: () => void; port: number };
  let port: number;

  beforeEach(async () => {
    seedData();
    db.close();

    // Use a random high port to avoid conflicts
    port = 19400 + Math.floor(Math.random() * 1000);
    serverHandle = startServer({
      port,
      dbPath: DB_PATH,
      frameworkDir: TEST_DIR,
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterEach(() => {
    if (serverHandle) serverHandle.stop();
  });

  it('serves dashboard HTML at /', async () => {
    const { status, body } = await fetch(port, '/');
    expect(status).toBe(200);
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('SkillFoundry');
  });

  it('serves dashboard HTML at /index.html', async () => {
    const { status, body } = await fetch(port, '/index.html');
    expect(status).toBe(200);
    expect(body).toContain('<!DOCTYPE html>');
  });

  it('returns 404 for unknown paths', async () => {
    const { status, data } = await fetchJson(port, '/nonexistent');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'not found' });
  });

  it('GET /api/projects returns project list', async () => {
    const { status, data } = await fetchJson(port, '/api/projects');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const projects = data as Array<{ name: string }>;
    expect(projects.length).toBe(2);
    expect(projects.map((p) => p.name)).toContain('alpha');
    expect(projects.map((p) => p.name)).toContain('beta');
  });

  it('GET /api/projects/:name returns project detail', async () => {
    const { status, data } = await fetchJson(port, '/api/projects/alpha');
    expect(status).toBe(200);
    const detail = data as { project: { name: string; id: string } };
    expect(detail.project.name).toBe('alpha');
    expect(detail.project.id).toBe('p1');
  });

  it('GET /api/projects/:name returns 404 for unknown project', async () => {
    const { status, data } = await fetchJson(port, '/api/projects/nonexistent');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'project not found' });
  });

  it('GET /api/kpi returns KPI metrics', async () => {
    const { status, data } = await fetchJson(port, '/api/kpi');
    expect(status).toBe(200);
    const kpi = data as { total_forge_runs: number };
    expect(typeof kpi.total_forge_runs).toBe('number');
  });

  it('GET /api/kpi?project=alpha returns project-specific KPIs', async () => {
    const { status, data } = await fetchJson(port, '/api/kpi?project=alpha');
    expect(status).toBe(200);
    const kpi = data as { total_forge_runs: number };
    expect(typeof kpi.total_forge_runs).toBe('number');
  });

  it('GET /api/kpi?project=nonexistent returns 404', async () => {
    const { status, data } = await fetchJson(port, '/api/kpi?project=nonexistent');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'project not found' });
  });

  it('GET /api/failures returns failure patterns', async () => {
    const { status, data } = await fetchJson(port, '/api/failures');
    expect(status).toBe(200);
    const failures = data as Array<{ signature: string }>;
    expect(Array.isArray(failures)).toBe(true);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures[0].signature).toBe('BUILD:tsc');
  });

  it('GET /api/health returns health report', async () => {
    const { status, data } = await fetchJson(port, '/api/health');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/patterns returns detected patterns', async () => {
    const { status, data } = await fetchJson(port, '/api/patterns');
    expect(status).toBe(200);
    const report = data as { total_patterns: number; patterns: unknown[] };
    expect(typeof report.total_patterns).toBe('number');
    expect(Array.isArray(report.patterns)).toBe(true);
  });

  it('GET /api/sessions returns session reports', async () => {
    const { status, data } = await fetchJson(port, '/api/sessions');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/top returns project rankings', async () => {
    const { status, data } = await fetchJson(port, '/api/top');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/top?by=failures returns failure-based rankings', async () => {
    const { status, data } = await fetchJson(port, '/api/top?by=failures');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/cross-project returns cross-project patterns', async () => {
    const { status, data } = await fetchJson(port, '/api/cross-project');
    expect(status).toBe(200);
    expect(typeof data).toBe('object');
  });

  it('POST /api/sync triggers sync', async () => {
    const { status, data } = await fetchJson(port, '/api/sync');
    // GET should 404 on /api/sync
    expect(status).toBe(404);

    // POST should work (may have errors since no real project structure)
    const postResult = await fetch(port, '/api/sync', 'POST');
    expect(postResult.status).toBe(200);
    const syncData = JSON.parse(postResult.body);
    expect(typeof syncData.projects_synced).toBe('number');
  });

  it('GET /api/trends returns trend report', async () => {
    const { status, data } = await fetchJson(port, '/api/trends');
    expect(status).toBe(200);
    const report = data as { generated_at: string; projects: unknown[]; alerts: unknown[] };
    expect(report.generated_at).toBeTruthy();
    expect(Array.isArray(report.projects)).toBe(true);
    expect(Array.isArray(report.alerts)).toBe(true);
  });

  it('GET /api/trends?project=alpha returns project snapshots', async () => {
    const { status, data } = await fetchJson(port, '/api/trends?project=alpha');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/trends?project=nonexistent returns 404', async () => {
    const { status, data } = await fetchJson(port, '/api/trends?project=nonexistent');
    expect(status).toBe(404);
  });

  it('POST /api/trends/snapshot captures snapshots', async () => {
    const postResult = await fetch(port, '/api/trends/snapshot', 'POST');
    expect(postResult.status).toBe(200);
    const result = JSON.parse(postResult.body);
    expect(typeof result.projects_captured).toBe('number');
  });

  it('GET /api/trends/latest returns latest snapshots', async () => {
    // Capture first
    await fetch(port, '/api/trends/snapshot', 'POST');
    const { status, data } = await fetchJson(port, '/api/trends/latest');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/trends/forecast requires project param', async () => {
    const { status, data } = await fetchJson(port, '/api/trends/forecast');
    expect(status).toBe(400);
  });

  it('GET /api/trends/forecast?project=alpha returns forecast', async () => {
    const { status, data } = await fetchJson(port, '/api/trends/forecast?project=alpha');
    expect(status).toBe(200);
    const forecast = data as { metric: string; forecast: unknown[] };
    expect(forecast.metric).toBeTruthy();
  });

  it('GET /api/remediations returns remediation list', async () => {
    const { status, data } = await fetchJson(port, '/api/remediations');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/remediations/stats returns stats', async () => {
    const { status, data } = await fetchJson(port, '/api/remediations/stats');
    expect(status).toBe(200);
    const stats = data as { total: number; pending: number };
    expect(typeof stats.total).toBe('number');
  });

  it('GET /api/remediations/report returns full report', async () => {
    const { status, data } = await fetchJson(port, '/api/remediations/report');
    expect(status).toBe(200);
    const report = data as { stats: unknown; pending_actions: unknown[] };
    expect(report.stats).toBeTruthy();
    expect(Array.isArray(report.pending_actions)).toBe(true);
  });

  it('POST /api/remediations/scan triggers scan', async () => {
    const postResult = await fetch(port, '/api/remediations/scan', 'POST');
    expect(postResult.status).toBe(200);
    const result = JSON.parse(postResult.body);
    expect(typeof result.actions_created).toBe('number');
  });

  it('GET /api/playbooks returns playbook list', async () => {
    // Trigger scan first to seed playbooks
    await fetch(port, '/api/remediations/scan', 'POST');
    const { status, data } = await fetchJson(port, '/api/playbooks');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    const playbooks = data as Array<{ name: string }>;
    expect(playbooks.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown API routes', async () => {
    const { status, data } = await fetchJson(port, '/api/nonexistent');
    expect(status).toBe(404);
    expect(data).toEqual({ error: 'not found' });
  });

  it('handles CORS preflight', async () => {
    const result = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/projects', method: 'OPTIONS' }, (res) => {
        resolve({ status: res.statusCode!, headers: res.headers });
      });
      req.on('error', reject);
      req.end();
    });

    expect(result.status).toBe(204);
    expect(result.headers['access-control-allow-origin']).toBe('*');
    expect(result.headers['access-control-allow-methods']).toContain('GET');
  });

  it('includes CORS headers on API responses', async () => {
    const result = await new Promise<{ headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/projects', method: 'GET' }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });

    expect(result.headers['access-control-allow-origin']).toBe('*');
  });
});

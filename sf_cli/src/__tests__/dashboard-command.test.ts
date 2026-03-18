import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dashboardCommand } from '../commands/dashboard.js';
import type { SessionContext } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-dashboard-cmd-' + process.pid);
const PROJECT_A = join(TEST_DIR, 'projects', 'proj-a');

function makeSession(workDir: string): SessionContext {
  return {
    workDir,
    config: {} as never,
    policy: {} as never,
    state: {} as never,
    messages: [],
    permissionMode: 'normal' as never,
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
  };
}

beforeEach(() => {
  // Create a minimal framework-like structure
  mkdirSync(join(TEST_DIR, 'data'), { recursive: true });
  mkdirSync(join(PROJECT_A, '.skillfoundry'), { recursive: true });

  writeFileSync(join(TEST_DIR, '.project-registry'), `${PROJECT_A}\n`);
  writeFileSync(join(TEST_DIR, '.project-registry-meta.jsonl'),
    JSON.stringify({ path: PROJECT_A, platform: 'claude', health_status: 'healthy' }) + '\n');

  // Add telemetry data to project (with real details for KPI extraction)
  const events = [
    JSON.stringify({
      id: 'test-evt-1',
      schema_version: 1,
      event_type: 'forge_run',
      timestamp: new Date().toISOString(),
      session_id: 'test',
      duration_ms: 120000,
      status: 'pass',
      details: { gate_passes: 6, gate_failures: 1, security_findings: { critical: 0, high: 1, medium: 0, low: 0 }, cost_usd: 0.5 },
    }),
    JSON.stringify({
      id: 'test-evt-2',
      schema_version: 1,
      event_type: 'forge_run',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      session_id: 'test',
      duration_ms: 60000,
      status: 'fail',
      details: { gate_passes: 2, gate_failures: 5, cost_usd: 0.3 },
    }),
  ];
  writeFileSync(join(PROJECT_A, '.skillfoundry', 'telemetry.jsonl'), events.join('\n') + '\n');

  // Add perf data
  const perf = [
    JSON.stringify({ gate: 'T1-lint', duration_ms: 150, timestamp: new Date().toISOString() }),
  ];
  writeFileSync(join(PROJECT_A, '.skillfoundry', 'perf.jsonl'), perf.join('\n') + '\n');

  // Add session monitor failures
  mkdirSync(join(PROJECT_A, 'logs'), { recursive: true });
  const failures = [
    JSON.stringify({ severity: 'error', signature: 'BUILD:tsc', timestamp: new Date().toISOString(), message: 'TS compile error' }),
  ];
  writeFileSync(join(PROJECT_A, 'logs', 'session-monitor.jsonl'), failures.join('\n') + '\n');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('dashboardCommand', () => {
  it('has correct metadata', () => {
    expect(dashboardCommand.name).toBe('dashboard');
    expect(dashboardCommand.description).toBeTruthy();
    expect(dashboardCommand.usage).toContain('sync');
  });

  it('sync subcommand returns sync summary', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('sync', session);

    expect(output).toContain('Dashboard Sync Complete');
    expect(output).toContain('Projects synced:');
  });

  it('sync --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('sync --json', session);

    const data = JSON.parse(output as string);
    expect(data).toHaveProperty('projects_synced');
    expect(data).toHaveProperty('events_added');
  });

  it('default (no args) shows overview after sync', async () => {
    // First sync to populate
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    // Then view
    const output = await dashboardCommand.execute('', session);
    expect(output).toContain('Dashboard Overview');
    expect(output).toContain('proj-a');
  });

  it('shows "no projects" message when DB is empty', async () => {
    // Clean data dir so no prior sync
    rmSync(join(TEST_DIR, 'data'), { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, 'data'), { recursive: true });

    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('', session);

    expect(output).toContain('No projects synced yet');
  });

  // ── Phase 2: Subcommand tests ──────────────────────────────────

  it('status subcommand shows project detail', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('status proj-a', session);
    expect(output).toContain('Project: proj-a');
    expect(output).toContain('Telemetry Events:');
    expect(output).toContain('forge_run');
  });

  it('status --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('status proj-a --json', session);
    const data = JSON.parse(output as string);
    expect(data.project.name).toBe('proj-a');
    expect(data.event_counts).toBeDefined();
  });

  it('status returns error for unknown project', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('status nonexistent', session);
    expect(output).toContain('not found');
  });

  it('status requires a project name', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('status', session);
    expect(output).toContain('Usage:');
  });

  it('failures subcommand shows failure report', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('failures', session);
    expect(output).toContain('Failure Report');
    expect(output).toContain('BUILD:tsc');
  });

  it('failures --severity filters by severity', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('failures --severity error', session);
    expect(output).toContain('BUILD:tsc');
  });

  it('failures --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('failures --json', session);
    const data = JSON.parse(output as string);
    expect(Array.isArray(data)).toBe(true);
  });

  it('top subcommand shows rankings', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('top', session);
    expect(output).toContain('Top Projects');
    expect(output).toContain('proj-a');
  });

  it('top --by failures ranks by failure count', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('top --by failures', session);
    expect(output).toContain('Top Projects (by failures)');
  });

  it('top rejects invalid metric', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('top --by invalid', session);
    expect(output).toContain('Invalid metric');
  });

  it('kpi subcommand shows KPI summary', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('kpi', session);
    expect(output).toContain('KPI Summary');
    expect(output).toContain('Forge Runs:');
    expect(output).toContain('Success Rate:');
    expect(output).toContain('Gate Pass Rate:');
  });

  it('kpi --project filters to single project', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('kpi --project proj-a', session);
    expect(output).toContain('KPI Summary: proj-a');
  });

  it('kpi --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('kpi --json', session);
    const data = JSON.parse(output as string);
    expect(data).toHaveProperty('total_forge_runs');
    expect(data).toHaveProperty('gate_pass_rate');
  });

  it('health subcommand shows health assessment', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('health', session);
    expect(output).toContain('Health Assessment');
    expect(output).toContain('proj-a');
    expect(output).toContain('Average Score:');
  });

  it('health --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('health --json', session);
    const data = JSON.parse(output as string);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('score');
    expect(data[0]).toHaveProperty('grade');
  });

  it('help subcommand shows usage', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('help', session);
    expect(output).toContain('Dashboard Commands');
    expect(output).toContain('/dashboard sync');
    expect(output).toContain('/dashboard status');
  });

  it('unknown subcommand shows error', async () => {
    const session = makeSession(TEST_DIR);
    const output = await dashboardCommand.execute('foobar', session);
    expect(output).toContain('Unknown subcommand');
  });

  it('overview --json returns valid JSON', async () => {
    const session = makeSession(TEST_DIR);
    await dashboardCommand.execute('sync', session);

    const output = await dashboardCommand.execute('--json', session);
    const data = JSON.parse(output as string);
    expect(Array.isArray(data)).toBe(true);
  });
});

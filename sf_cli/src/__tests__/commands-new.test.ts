import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateCommand } from '../commands/gate.js';
import { reportCommand } from '../commands/report.js';
import { metricsCommand } from '../commands/metrics.js';
import { benchmarkCommand } from '../commands/benchmark.js';
import type { SessionContext, SfConfig, SfPolicy, SfState, Message } from '../types.js';
import type { TelemetryEvent } from '../core/telemetry.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-cmds-new-' + process.pid);

function createSession(overrides?: Partial<SessionContext>): SessionContext {
  return {
    config: { provider: 'anthropic' } as SfConfig,
    policy: {} as SfPolicy,
    state: {} as SfState,
    messages: [] as Message[],
    permissionMode: 'auto' as any,
    workDir: TEST_DIR,
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
    ...overrides,
  };
}

function writeEvent(event: Partial<TelemetryEvent>) {
  const full: TelemetryEvent = {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    schema_version: 1,
    event_type: 'forge_run',
    timestamp: new Date().toISOString(),
    session_id: 'test-session',
    duration_ms: 5000,
    status: 'pass',
    details: {},
    ...event,
  };
  appendFileSync(join(TEST_DIR, '.skillfoundry', 'telemetry.jsonl'), JSON.stringify(full) + '\n');
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, '.skillfoundry'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({ name: 'test-project' }));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('gateCommand', () => {
  it('has correct metadata', () => {
    expect(gateCommand.name).toBe('gate');
    expect(gateCommand.usage).toContain('t0');
  });

  it('rejects unknown tier', async () => {
    const result = await gateCommand.execute('t99', createSession());
    expect(result).toContain('Unknown gate tier');
  });

  it('runs single gate T0', async () => {
    const result = await gateCommand.execute('t0', createSession());
    expect(result).toContain('T0');
    expect(result).toContain('Duration:');
  });
});

describe('metricsCommand', () => {
  it('has correct metadata', () => {
    expect(metricsCommand.name).toBe('metrics');
  });

  it('shows no-data message when empty', async () => {
    const result = await metricsCommand.execute('', createSession());
    expect(result).toContain('No telemetry data');
  });

  it('shows metrics when data exists', async () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: { gate_passes: 7, gate_failures: 0, security_findings: { critical: 0, high: 0, medium: 1, low: 0 }, tests_created: 5, rework_cycles: 0, cost_usd: 0.25 },
    });

    const result = await metricsCommand.execute('', createSession());
    expect(result).toContain('Quality Metrics');
    expect(result).toContain('Gate Pass Rate');
  });

  it('supports --baseline flag', async () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: { gate_passes: 6, gate_failures: 1 },
    });

    const result = await metricsCommand.execute('--baseline', createSession());
    expect(result).toContain('vs Industry Baselines');
  });

  it('supports --json flag', async () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: { gate_passes: 7, gate_failures: 0 } });
    const result = await metricsCommand.execute('--json', createSession());
    const parsed = JSON.parse(result as string);
    expect(parsed.total_runs).toBe(1);
  });

  it('supports --window flag', async () => {
    for (let i = 0; i < 5; i++) {
      writeEvent({ event_type: 'forge_run', status: 'pass', details: { gate_passes: 7 } });
    }
    const result = await metricsCommand.execute('--window 3', createSession());
    expect(result).toContain('last 3 runs');
  });
});

describe('reportCommand', () => {
  it('has correct metadata', () => {
    expect(reportCommand.name).toBe('report');
  });

  it('shows no-data message when empty', async () => {
    const result = await reportCommand.execute('', createSession());
    expect(result).toContain('No telemetry data');
  });

  it('generates markdown report', async () => {
    writeEvent({
      event_type: 'forge_run',
      status: 'pass',
      details: { gate_passes: 7, gate_failures: 0, security_findings: { critical: 0, high: 0, medium: 0, low: 0 } },
    });

    const result = await reportCommand.execute('', createSession());
    expect(result).toContain('# Quality Report');
    expect(result).toContain('Executive Summary');
  });

  it('generates JSON report', async () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });
    const result = await reportCommand.execute('--format json', createSession());
    const parsed = JSON.parse(result as string);
    expect(parsed.generated_at).toBeTruthy();
  });

  it('writes report to file', async () => {
    writeEvent({ event_type: 'forge_run', status: 'pass', details: {} });
    const result = await reportCommand.execute('--output report.md', createSession());
    expect(result).toContain('Report written to');
  });
});

describe('benchmarkCommand', () => {
  it('has correct metadata', () => {
    expect(benchmarkCommand.name).toBe('benchmark');
  });

  it('shows baseline comparison', async () => {
    const result = await benchmarkCommand.execute('', createSession());
    expect(result).toContain('Quality Benchmark');
    expect(result).toContain('With SF Gates');
    expect(result).toContain('Industry Avg');
  });

  it('records benchmark telemetry event', async () => {
    await benchmarkCommand.execute('', createSession());
    const { readEvents } = await import('../core/telemetry.js');
    const { events } = readEvents(TEST_DIR);
    const benchEvents = events.filter((e) => e.event_type === 'benchmark_run');
    expect(benchEvents.length).toBe(1);
  });

  it('requires provider config', async () => {
    const session = createSession({ config: { provider: '' } as SfConfig });
    const result = await benchmarkCommand.execute('', session);
    expect(result).toContain('requires a configured LLM provider');
  });
});

describe('command registration', () => {
  it('all new commands have name, description, usage, execute', () => {
    const commands = [gateCommand, metricsCommand, reportCommand, benchmarkCommand];
    for (const cmd of commands) {
      expect(cmd.name).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.usage).toBeTruthy();
      expect(typeof cmd.execute).toBe('function');
    }
  });
});

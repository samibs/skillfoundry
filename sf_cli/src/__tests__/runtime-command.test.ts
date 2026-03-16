// Tests for `sf runtime status` command.
// Covers: formatted table output, JSON output mode, no-active-pool message,
// pool concurrency/queue display, message count from bus, and subcommand routing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runtimeCommand, setActivePool, getActivePool } from '../commands/runtime.js';
import type { SessionContext } from '../types.js';
import type { PoolStatus } from '../core/agent-pool.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock AgentMessageBus — control message count from test
const mockGetHistory = vi.fn<[], unknown[]>().mockReturnValue([]);

vi.mock('../core/agent-message-bus.js', () => ({
  AgentMessageBus: {
    global: () => ({
      getHistory: mockGetHistory,
    }),
  },
}));

// Mock logger — runtime command doesn't log directly but agent-logger.ts does
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    config: {
      provider: 'anthropic',
      engine: 'messages',
      model: 'claude-sonnet-4-20250514',
      fallback_provider: '',
      fallback_engine: '',
      monthly_budget_usd: 100,
      run_budget_usd: 10,
      memory_sync_enabled: false,
      memory_sync_remote: '',
      route_local_first: false,
      local_provider: '',
      local_model: '',
      context_window: 0,
      log_level: 'info',
    },
    policy: { allow_shell: false, allow_network: false, allow_paths: ['/tmp'], redact: false },
    state: {
      current_state: 'IDLE',
      updated_at: new Date().toISOString(),
      current_prd: '',
      current_story: '',
      last_plan_id: '',
      last_run_id: '',
      recovery: { rollback_available: false, resume_point: '' },
    },
    messages: [],
    permissionMode: 'auto',
    workDir: '/tmp',
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
    ...overrides,
  } as SessionContext;
}

function makePoolStatus(overrides: Partial<PoolStatus> = {}): PoolStatus {
  return {
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    maxConcurrency: 3,
    activeTasks: [],
    queuedTasks: [],
    ...overrides,
  };
}

function makeMockPool(status: PoolStatus): { getStatus: ReturnType<typeof vi.fn> } {
  return { getStatus: vi.fn().mockReturnValue(status) };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('runtimeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHistory.mockReturnValue([]);
    // Ensure no pool is active between tests
    setActivePool(null);
  });

  afterEach(() => {
    setActivePool(null);
  });

  // ── Command metadata ────────────────────────────────────────────────────────

  it('has the correct name and description', () => {
    expect(runtimeCommand.name).toBe('runtime');
    expect(runtimeCommand.description).toContain('pool status');
  });

  // ── No active pool ──────────────────────────────────────────────────────────

  it('returns "No active pipeline session." message when pool is null', async () => {
    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('No active pipeline session.');
  });

  it('returns JSON with active:false when pool is null and --json flag is used', async () => {
    const result = await runtimeCommand.execute('status --json', makeSession());
    const parsed = JSON.parse(result as string);
    expect(parsed.active).toBe(false);
    expect(parsed.message).toBe('No active pipeline session.');
    expect(typeof parsed.messageCount).toBe('number');
    expect(typeof parsed.uptimeSecs).toBe('number');
  });

  // ── Active pool — formatted table output ────────────────────────────────────

  it('displays pool concurrency header when pool is active', async () => {
    const status = makePoolStatus({ running: 2, maxConcurrency: 3, queued: 1 });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Concurrency: 2 / 3 active');
    expect(result).toContain('Queue: 1 pending');
  });

  it('displays completed and failed counts', async () => {
    const status = makePoolStatus({ completed: 14, failed: 1 });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Completed: 14');
    expect(result).toContain('Failed: 1');
  });

  it('displays message count from the bus', async () => {
    const status = makePoolStatus();
    setActivePool(makeMockPool(status) as never);
    mockGetHistory.mockReturnValue(new Array(47).fill({}));

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Messages: 47');
  });

  it('displays active task table when running tasks exist', async () => {
    const now = Date.now();
    const status = makePoolStatus({
      running: 2,
      activeTasks: [
        { taskId: 'task-coder-001', agentId: 'coder-001', startedAt: now - 12_400 },
        { taskId: 'task-tester-002', agentId: 'tester-002', startedAt: now - 5_100 },
      ],
    });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Active Agents');
    expect(result).toContain('coder-001');
    expect(result).toContain('tester-002');
    expect(result).toContain('running');
  });

  it('shows "(none)" when no active tasks', async () => {
    const status = makePoolStatus({ running: 0, activeTasks: [] });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Active Agents: (none)');
  });

  it('displays queued tasks table when queued tasks exist', async () => {
    const now = Date.now();
    const status = makePoolStatus({
      queued: 1,
      queuedTasks: [
        { taskId: 'task-reporter-001', agentId: 'reporter-001', enqueuedAt: now - 8_300 },
      ],
    });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Queued Tasks');
    expect(result).toContain('reporter-001');
  });

  it('omits queued tasks section when queue is empty', async () => {
    const status = makePoolStatus({ queued: 0, queuedTasks: [] });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).not.toContain('Queued Tasks');
  });

  // ── JSON output mode ────────────────────────────────────────────────────────

  it('--json outputs valid JSON with PoolStatus fields', async () => {
    const status = makePoolStatus({ running: 1, queued: 2, completed: 5, failed: 0, maxConcurrency: 3 });
    setActivePool(makeMockPool(status) as never);
    mockGetHistory.mockReturnValue(new Array(10).fill({}));

    const result = await runtimeCommand.execute('status --json', makeSession());
    const parsed = JSON.parse(result as string);

    expect(parsed.active).toBe(true);
    expect(parsed.running).toBe(1);
    expect(parsed.queued).toBe(2);
    expect(parsed.completed).toBe(5);
    expect(parsed.failed).toBe(0);
    expect(parsed.maxConcurrency).toBe(3);
    expect(parsed.messageCount).toBe(10);
    expect(typeof parsed.uptimeSecs).toBe('number');
  });

  it('--json includes activeTasks and queuedTasks arrays', async () => {
    const now = Date.now();
    const status = makePoolStatus({
      activeTasks: [{ taskId: 'task-abc', agentId: 'coder', startedAt: now - 1000 }],
      queuedTasks: [{ taskId: 'task-xyz', agentId: 'tester', enqueuedAt: now - 500 }],
    });
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status --json', makeSession());
    const parsed = JSON.parse(result as string);

    expect(Array.isArray(parsed.activeTasks)).toBe(true);
    expect(Array.isArray(parsed.queuedTasks)).toBe(true);
    expect(parsed.activeTasks[0].taskId).toBe('task-abc');
    expect(parsed.queuedTasks[0].agentId).toBe('tester');
  });

  // ── Default args (empty) ────────────────────────────────────────────────────

  it('treats empty args as "status" subcommand', async () => {
    setActivePool(null);
    const result = await runtimeCommand.execute('', makeSession());
    expect(result).toContain('No active pipeline session.');
  });

  // ── Unknown subcommand ──────────────────────────────────────────────────────

  it('returns error message for unknown subcommand', async () => {
    const result = await runtimeCommand.execute('unknown-subcommand', makeSession());
    expect(result).toContain('Unknown subcommand');
    expect(result).toContain('Usage:');
  });

  // ── setActivePool / getActivePool ───────────────────────────────────────────

  it('setActivePool registers a pool and getActivePool returns it', () => {
    const mockPool = makeMockPool(makePoolStatus());
    setActivePool(mockPool as never);
    expect(getActivePool()).toBe(mockPool);
  });

  it('setActivePool(null) clears the active pool', () => {
    const mockPool = makeMockPool(makePoolStatus());
    setActivePool(mockPool as never);
    setActivePool(null);
    expect(getActivePool()).toBeNull();
  });

  // ── Uptime display ──────────────────────────────────────────────────────────

  it('formatted output includes Uptime field', async () => {
    const status = makePoolStatus();
    setActivePool(makeMockPool(status) as never);

    const result = await runtimeCommand.execute('status', makeSession());
    expect(result).toContain('Uptime:');
  });
});

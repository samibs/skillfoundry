// Tests for AgentPool — concurrency control, FIFO/priority queue, timeout,
// drain, shutdown, error recovery, bus integration, and pool status accuracy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AgentPool, TaskTimeoutError, ShutdownError } from '../core/agent-pool.js';
import type { AgentTask, PoolOptions } from '../core/agent-pool.js';
import { AgentMessageBus } from '../core/agent-message-bus.js';
import type { AgentResult, AgentContext } from '../core/agent.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// We mock createAgentInstance to return a controllable fake agent
const mockAgentExecute = vi.fn<[string, AgentContext], Promise<AgentResult>>();

vi.mock('../core/agent-registry.js', () => ({
  createAgentInstance: vi.fn(() => ({
    execute: mockAgentExecute,
    abort: vi.fn(),
    getState: vi.fn(() => ({ status: 'idle', progress: { current: 0, total: 0, label: '' }, decisions: [], blockers: [], artifacts: [], childAgents: [] })),
    on: vi.fn(),
    off: vi.fn(),
    name: 'mock-agent',
    bus: null,
  })),
}));

// Also suppress ai-runner (used transitively via agent.ts if any real execution leaks)
vi.mock('../core/ai-runner.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    content: 'mock output',
    turnCount: 1,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCostUsd: 0.001,
    aborted: false,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: randomUUID(),
    agentId: 'coder',
    input: 'do something',
    priority: 0,
    correlationId: randomUUID(),
    enqueuedAt: Date.now(),
    ...overrides,
  };
}

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    status: 'completed',
    output: 'done',
    decisions: [],
    artifacts: [],
    tokenUsage: { input: 100, output: 50, cost: 0.001 },
    childResults: new Map(),
    durationMs: 100,
    ...overrides,
  };
}

/**
 * Create a deferred: a promise plus its resolve/reject handles.
 * Used to control when a fake agent completes.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let bus: AgentMessageBus;

beforeEach(() => {
  bus = new AgentMessageBus();
  mockAgentExecute.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Suite: Concurrency limit enforcement
// ---------------------------------------------------------------------------

describe('AgentPool — concurrency limit', () => {
  it('never exceeds maxConcurrency running tasks simultaneously', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 3, taskTimeout: 30_000 });

    const deferreds = Array.from({ length: 5 }, () => deferred<AgentResult>());
    let callCount = 0;

    mockAgentExecute.mockImplementation(() => {
      const idx = callCount++;
      return deferreds[idx].promise;
    });

    const tasks = Array.from({ length: 5 }, () => makeTask());
    const promises = tasks.map((t) => pool.submit(t));

    // Give the microtask queue a turn to dispatch
    await Promise.resolve();

    expect(pool.getStatus().running).toBe(3);
    expect(pool.getStatus().queued).toBe(2);

    // Resolve first running task
    deferreds[0].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    // Pool should now dispatch next queued task
    expect(pool.getStatus().running).toBeLessThanOrEqual(3);

    // Cleanup — resolve all
    for (let i = 1; i < 5; i++) deferreds[i].resolve(makeResult());
    await Promise.allSettled(promises);
  });

  it('respects maxConcurrency=1 (serial execution)', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000 });

    const d1 = deferred<AgentResult>();
    const d2 = deferred<AgentResult>();
    let callCount = 0;

    mockAgentExecute.mockImplementation(() => {
      return callCount++ === 0 ? d1.promise : d2.promise;
    });

    const p1 = pool.submit(makeTask({ id: 'task-1' }));
    const p2 = pool.submit(makeTask({ id: 'task-2' }));

    await Promise.resolve();

    expect(pool.getStatus().running).toBe(1);
    expect(pool.getStatus().queued).toBe(1);

    d1.resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    expect(pool.getStatus().running).toBe(1);
    expect(pool.getStatus().queued).toBe(0);

    d2.resolve(makeResult());
    await Promise.allSettled([p1, p2]);
  });
});

// ---------------------------------------------------------------------------
// Suite: Task completion returns result
// ---------------------------------------------------------------------------

describe('AgentPool — task completion', () => {
  it('resolves submit() promise with the AgentResult on success', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });
    const expected = makeResult({ output: 'feature implemented', durationMs: 250 });
    mockAgentExecute.mockResolvedValueOnce(expected);

    const task = makeTask({ id: 'success-task' });
    const result = await pool.submit(task);

    expect(result.status).toBe('completed');
    expect(result.output).toBe('feature implemented');
  });

  it('increments completed counter after task finishes', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });
    mockAgentExecute.mockResolvedValue(makeResult());

    await pool.submit(makeTask());
    await pool.submit(makeTask());

    expect(pool.getStatus().completed).toBe(2);
    expect(pool.getStatus().failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite: Task failure recovery
// ---------------------------------------------------------------------------

describe('AgentPool — failure recovery', () => {
  it('rejects submit() promise when agent throws', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });
    mockAgentExecute.mockRejectedValueOnce(new Error('agent crashed'));

    await expect(pool.submit(makeTask())).rejects.toThrow('agent crashed');
  });

  it('recovers the concurrency slot after a crash so next task runs', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000 });

    const d2 = deferred<AgentResult>();
    let callCount = 0;

    mockAgentExecute.mockImplementation(() => {
      if (callCount++ === 0) return Promise.reject(new Error('crash'));
      return d2.promise;
    });

    const p1 = pool.submit(makeTask({ id: 'crash-task' }));
    const p2 = pool.submit(makeTask({ id: 'next-task' }));

    await expect(p1).rejects.toThrow('crash');
    await Promise.resolve();
    await Promise.resolve();

    // Slot should be recovered; task-2 should now be running
    expect(pool.getStatus().running).toBe(1);

    d2.resolve(makeResult());
    await expect(p2).resolves.toMatchObject({ status: 'completed' });
  });

  it('increments failed counter when agent throws', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });
    mockAgentExecute.mockRejectedValueOnce(new Error('oops'));

    await expect(pool.submit(makeTask())).rejects.toThrow();
    expect(pool.getStatus().failed).toBe(1);
    expect(pool.getStatus().completed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite: Task timeout
// ---------------------------------------------------------------------------

describe('AgentPool — task timeout', () => {
  it('rejects with TaskTimeoutError when task exceeds taskTimeout', async () => {
    vi.useFakeTimers();
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 1_000 });

    // Agent never resolves
    mockAgentExecute.mockImplementation((_input, ctx) => {
      return new Promise<AgentResult>((resolve) => {
        // Simulate long-running task that checks abort
        const interval = setInterval(() => {
          if (ctx.abortSignal.aborted) {
            clearInterval(interval);
            resolve(makeResult({ status: 'aborted' }));
          }
        }, 50);
      });
    });

    const promise = pool.submit(makeTask({ id: 'slow-task' }));

    // Advance past the 1s timeout
    vi.advanceTimersByTime(1_100);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await expect(promise).rejects.toBeInstanceOf(TaskTimeoutError);
  });

  it('recovers the slot after timeout', async () => {
    vi.useFakeTimers();
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 500 });

    const d2 = deferred<AgentResult>();
    let callCount = 0;

    mockAgentExecute.mockImplementation((_input, ctx) => {
      if (callCount++ === 0) {
        return new Promise<AgentResult>((resolve) => {
          const interval = setInterval(() => {
            if (ctx.abortSignal.aborted) {
              clearInterval(interval);
              resolve(makeResult({ status: 'aborted' }));
            }
          }, 50);
        });
      }
      return d2.promise;
    });

    const p1 = pool.submit(makeTask({ id: 'timeout-task' }));
    const p2 = pool.submit(makeTask({ id: 'next-task' }));

    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    await expect(p1).rejects.toBeInstanceOf(TaskTimeoutError);

    // Slot recovered — task-2 should be running
    expect(pool.getStatus().running).toBe(1);

    d2.resolve(makeResult());
    await expect(p2).resolves.toMatchObject({ status: 'completed' });
  });
});

// ---------------------------------------------------------------------------
// Suite: FIFO ordering within same priority
// ---------------------------------------------------------------------------

describe('AgentPool — FIFO ordering', () => {
  it('executes equal-priority tasks in submission order', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000 });

    const executionOrder: string[] = [];
    const deferreds: ReturnType<typeof deferred<AgentResult>>[] = [];

    mockAgentExecute.mockImplementation(() => {
      const d = deferred<AgentResult>();
      deferreds.push(d);
      return d.promise;
    });

    const task1 = makeTask({ id: 'a', priority: 0 });
    const task2 = makeTask({ id: 'b', priority: 0 });
    const task3 = makeTask({ id: 'c', priority: 0 });

    pool.submit(task1).then(() => executionOrder.push('a'));
    pool.submit(task2).then(() => executionOrder.push('b'));
    pool.submit(task3).then(() => executionOrder.push('c'));

    await Promise.resolve();

    // Only task1 should be running (maxConcurrency=1)
    expect(pool.getStatus().running).toBe(1);
    deferreds[0].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    deferreds[1].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    deferreds[2].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    expect(executionOrder).toEqual(['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Suite: Priority ordering
// ---------------------------------------------------------------------------

describe('AgentPool — priority ordering', () => {
  it('executes higher-priority tasks before lower-priority ones', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000 });

    const executionOrder: string[] = [];
    const deferreds: ReturnType<typeof deferred<AgentResult>>[] = [];

    mockAgentExecute.mockImplementation(() => {
      const d = deferred<AgentResult>();
      deferreds.push(d);
      return d.promise;
    });

    // First task runs immediately (fills the single slot)
    const taskA = makeTask({ id: 'low-priority', priority: 0 });
    // These two are queued; B (priority 5) should run before C (priority 1)
    const taskB = makeTask({ id: 'high-priority', priority: 5 });
    const taskC = makeTask({ id: 'medium-priority', priority: 1 });

    pool.submit(taskA).then(() => executionOrder.push('A'));
    await Promise.resolve();

    // A is now running — queue B and C
    pool.submit(taskB).then(() => executionOrder.push('B'));
    pool.submit(taskC).then(() => executionOrder.push('C'));
    await Promise.resolve();

    // Resolve A to free the slot
    deferreds[0].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    // B (priority 5) should start next
    expect(pool.getStatus().running).toBe(1);
    deferreds[1].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    deferreds[2].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    expect(executionOrder).toEqual(['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// Suite: drain()
// ---------------------------------------------------------------------------

describe('AgentPool — drain()', () => {
  it('resolves immediately when pool is empty', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 3, taskTimeout: 30_000 });
    await expect(pool.drain()).resolves.toBeUndefined();
  });

  it('resolves only after all running and queued tasks complete', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });

    const deferreds = [deferred<AgentResult>(), deferred<AgentResult>(), deferred<AgentResult>()];
    let callCount = 0;

    mockAgentExecute.mockImplementation(() => deferreds[callCount++].promise);

    pool.submit(makeTask());
    pool.submit(makeTask());
    pool.submit(makeTask());

    await Promise.resolve();

    let drained = false;
    const drainPromise = pool.drain().then(() => { drained = true; });

    // Not drained yet
    expect(drained).toBe(false);

    // Resolve all tasks
    deferreds[0].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    deferreds[1].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    deferreds[2].resolve(makeResult());
    await Promise.resolve();
    await Promise.resolve();

    await drainPromise;
    expect(drained).toBe(true);
  });

  it('rejects when drainTimeout is exceeded', async () => {
    vi.useFakeTimers();
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 60_000, drainTimeout: 500 });

    mockAgentExecute.mockImplementation(() => new Promise(() => { /* never resolves */ }));

    pool.submit(makeTask());
    await Promise.resolve();

    const drainPromise = pool.drain();
    vi.advanceTimersByTime(600);
    await Promise.resolve();

    await expect(drainPromise).rejects.toThrow('drain() timed out');
  });
});

// ---------------------------------------------------------------------------
// Suite: shutdown()
// ---------------------------------------------------------------------------

describe('AgentPool — shutdown()', () => {
  it('rejects queued tasks with ShutdownError', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000, drainTimeout: 5_000 });

    const runningDeferred = deferred<AgentResult>();
    mockAgentExecute.mockImplementation(() => runningDeferred.promise);

    // First task occupies the single slot
    pool.submit(makeTask({ id: 'running' }));
    await Promise.resolve();

    // Two tasks are queued
    const queuedP1 = pool.submit(makeTask({ id: 'queued-1' }));
    const queuedP2 = pool.submit(makeTask({ id: 'queued-2' }));

    await Promise.resolve();
    expect(pool.getStatus().queued).toBe(2);

    // Shutdown while tasks are queued
    const shutdownPromise = pool.shutdown();

    await expect(queuedP1).rejects.toBeInstanceOf(ShutdownError);
    await expect(queuedP2).rejects.toBeInstanceOf(ShutdownError);

    // Resolve the running task so shutdown can complete
    runningDeferred.resolve(makeResult());
    await shutdownPromise;
  });

  it('rejects new submissions after shutdown', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000, drainTimeout: 1_000 });
    mockAgentExecute.mockResolvedValue(makeResult());

    await pool.shutdown();

    await expect(pool.submit(makeTask())).rejects.toBeInstanceOf(ShutdownError);
  });

  it('waits for running tasks to complete before resolving', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000, drainTimeout: 5_000 });

    const d = deferred<AgentResult>();
    mockAgentExecute.mockImplementation(() => d.promise);

    pool.submit(makeTask());
    await Promise.resolve();

    expect(pool.getStatus().running).toBe(1);

    const shutdownPromise = pool.shutdown();
    let shutdownComplete = false;
    shutdownPromise.then(() => { shutdownComplete = true; });

    await Promise.resolve();
    expect(shutdownComplete).toBe(false);

    d.resolve(makeResult());
    await shutdownPromise;
    expect(shutdownComplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: Pool status accuracy
// ---------------------------------------------------------------------------

describe('AgentPool — getStatus()', () => {
  it('reports correct running and queued counts', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });

    const deferreds = [deferred<AgentResult>(), deferred<AgentResult>(), deferred<AgentResult>()];
    let callCount = 0;
    mockAgentExecute.mockImplementation(() => deferreds[callCount++].promise);

    pool.submit(makeTask({ id: 't1' }));
    pool.submit(makeTask({ id: 't2' }));
    pool.submit(makeTask({ id: 't3' }));

    await Promise.resolve();

    const status = pool.getStatus();
    expect(status.running).toBe(2);
    expect(status.queued).toBe(1);
    expect(status.maxConcurrency).toBe(2);

    // activeTasks contains task IDs and start times
    expect(status.activeTasks).toHaveLength(2);
    expect(status.activeTasks[0]).toMatchObject({ taskId: 't1', agentId: 'coder' });
    expect(status.activeTasks[0].startedAt).toBeGreaterThan(0);

    // queuedTasks contains t3
    expect(status.queuedTasks).toHaveLength(1);
    expect(status.queuedTasks[0]).toMatchObject({ taskId: 't3', agentId: 'coder' });
    expect(status.queuedTasks[0].enqueuedAt).toBeGreaterThan(0);

    // Cleanup
    deferreds.forEach((d) => d.resolve(makeResult()));
    await Promise.all([pool.submit(makeTask())].map(() => Promise.resolve()));
  });

  it('reflects completed and failed totals accurately', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 3, taskTimeout: 30_000 });

    mockAgentExecute
      .mockResolvedValueOnce(makeResult())
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(makeResult());

    const promises = [
      pool.submit(makeTask()),
      pool.submit(makeTask()),
      pool.submit(makeTask()),
    ];

    await Promise.allSettled(promises);

    const status = pool.getStatus();
    expect(status.completed).toBe(2);
    expect(status.failed).toBe(1);
    expect(status.running).toBe(0);
    expect(status.queued).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite: Bus integration — task:cancel message
// ---------------------------------------------------------------------------

describe('AgentPool — bus integration', () => {
  it('removes a queued task when task:cancel message is received', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 1, taskTimeout: 30_000 });

    const runningDeferred = deferred<AgentResult>();
    mockAgentExecute.mockImplementation(() => runningDeferred.promise);

    const runningTask = makeTask({ id: 'running' });
    const queuedTask = makeTask({ id: 'queued-cancel-me' });

    pool.submit(runningTask);
    await Promise.resolve();

    const queuedPromise = pool.submit(queuedTask);
    await Promise.resolve();

    expect(pool.getStatus().queued).toBe(1);

    // Publish a task:cancel message for the queued task
    bus.publish(AgentMessageBus.buildMessage(
      'test',
      'agent-pool',
      'task:cancel',
      { taskId: 'queued-cancel-me' },
    ));

    await expect(queuedPromise).rejects.toBeInstanceOf(ShutdownError);
    expect(pool.getStatus().queued).toBe(0);

    // Cleanup
    runningDeferred.resolve(makeResult());
    await pool.drain();
  });

  it('publishes status:heartbeat on the configured interval', async () => {
    vi.useFakeTimers();
    const pool = new AgentPool(bus, { maxConcurrency: 2, taskTimeout: 30_000 });

    const heartbeats: unknown[] = [];
    bus.subscribe('status:heartbeat', (msg) => heartbeats.push(msg.payload));

    vi.advanceTimersByTime(5_001);

    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    expect(heartbeats[0]).toMatchObject({
      running: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      maxConcurrency: 2,
    });

    await pool.shutdown();
  });
});

// ---------------------------------------------------------------------------
// Suite: submitBatch()
// ---------------------------------------------------------------------------

describe('AgentPool — submitBatch()', () => {
  it('resolves all task results in submission order', async () => {
    const pool = new AgentPool(bus, { maxConcurrency: 5, taskTimeout: 30_000 });

    const results = [
      makeResult({ output: 'result-0' }),
      makeResult({ output: 'result-1' }),
      makeResult({ output: 'result-2' }),
    ];
    let callCount = 0;
    mockAgentExecute.mockImplementation(() => Promise.resolve(results[callCount++]));

    const tasks = results.map(() => makeTask());
    const batchResults = await pool.submitBatch(tasks);

    expect(batchResults).toHaveLength(3);
    expect(batchResults[0].output).toBe('result-0');
    expect(batchResults[1].output).toBe('result-1');
    expect(batchResults[2].output).toBe('result-2');
  });
});

// ---------------------------------------------------------------------------
// Suite: Performance — 100 tasks with concurrency 5, no deadlock
// ---------------------------------------------------------------------------

describe('AgentPool — performance', () => {
  it('handles 100 tasks with concurrency 5 without deadlock', async () => {
    vi.useRealTimers();
    const pool = new AgentPool(bus, { maxConcurrency: 5, taskTimeout: 30_000 });

    mockAgentExecute.mockImplementation(() =>
      new Promise<AgentResult>((resolve) => {
        // Simulate async work with a tiny delay using setImmediate
        setImmediate(() => resolve(makeResult()));
      }),
    );

    const tasks = Array.from({ length: 100 }, () => makeTask());
    const results = await pool.submitBatch(tasks);

    expect(results).toHaveLength(100);
    expect(results.every((r) => r.status === 'completed')).toBe(true);

    const status = pool.getStatus();
    expect(status.completed).toBe(100);
    expect(status.failed).toBe(0);
    expect(status.running).toBe(0);
    expect(status.queued).toBe(0);

    await pool.shutdown();
  }, 15_000);
});

// ---------------------------------------------------------------------------
// Suite: Pool options validation
// ---------------------------------------------------------------------------

describe('AgentPool — options clamping', () => {
  it('clamps maxConcurrency to minimum of 1', () => {
    const pool = new AgentPool(bus, { maxConcurrency: 0 });
    expect(pool.getStatus().maxConcurrency).toBe(1);
  });

  it('clamps maxConcurrency to maximum of 10', () => {
    const pool = new AgentPool(bus, { maxConcurrency: 100 });
    expect(pool.getStatus().maxConcurrency).toBe(10);
  });

  it('uses default maxConcurrency of 3 when not specified', () => {
    const pool = new AgentPool(bus);
    expect(pool.getStatus().maxConcurrency).toBe(3);
  });
});

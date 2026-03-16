// AgentPool — concurrency-controlled agent execution pool with FIFO priority queue.
// Manages parallel agent execution with configurable concurrency limits, task timeouts,
// drain/shutdown lifecycle, and bus-integrated heartbeat + cancellation support.

import { randomUUID } from 'node:crypto';
import type { AgentResult, AgentContext } from './agent.js';
import type { Agent } from './agent.js';
import { createAgentInstance } from './agent-registry.js';
import { AgentMessageBus } from './agent-message-bus.js';
import { getLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A unit of work submitted to the pool.
 */
export interface AgentTask {
  /** UUID — unique task identifier. */
  id: string;
  /** Agent name from the registry (e.g. 'coder', 'reviewer'). */
  agentId: string;
  /** Task description passed to agent.execute(). */
  input: string;
  /** 0 = normal; higher numbers run before lower within the queue. */
  priority: number;
  /** Links this task to message bus correlation threads. */
  correlationId: string;
  /** Unix milliseconds — when the task was enqueued. */
  enqueuedAt: number;
  /** AgentContext forwarded to the agent. If omitted, a minimal default is used. */
  context?: AgentContext;
}

/**
 * Configuration options for AgentPool.
 */
export interface PoolOptions {
  /** Maximum number of agents executing concurrently. Default: 3. Min: 1. Max: 10. */
  maxConcurrency: number;
  /** Per-task execution timeout in milliseconds. Default: 300_000 (5 min). */
  taskTimeout: number;
  /** Maximum wait for drain() to complete in milliseconds. Default: 60_000. */
  drainTimeout: number;
}

/**
 * Point-in-time snapshot of pool state.
 */
export interface PoolStatus {
  running: number;
  queued: number;
  completed: number;
  failed: number;
  maxConcurrency: number;
  activeTasks: Array<{ taskId: string; agentId: string; startedAt: number }>;
  queuedTasks: Array<{ taskId: string; agentId: string; enqueuedAt: number }>;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a task exceeds its configured taskTimeout.
 */
export class TaskTimeoutError extends Error {
  readonly taskId: string;
  readonly agentId: string;

  constructor(taskId: string, agentId: string, timeoutMs: number) {
    super(`Task ${taskId} (agent: ${agentId}) timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
    this.taskId = taskId;
    this.agentId = agentId;
  }
}

/**
 * Thrown when the pool is shut down and rejects a pending or new submission.
 */
export class ShutdownError extends Error {
  readonly taskId: string;

  constructor(taskId: string) {
    super(`Pool is shutting down — task ${taskId} was cancelled`);
    this.name = 'ShutdownError';
    this.taskId = taskId;
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface QueueEntry {
  task: AgentTask;
  resolve: (result: AgentResult) => void;
  reject: (err: unknown) => void;
}

interface ActiveEntry {
  task: AgentTask;
  startedAt: number;
  agent: Agent;
  abortSignal: { aborted: boolean };
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: PoolOptions = {
  maxConcurrency: 3,
  taskTimeout: 300_000,
  drainTimeout: 60_000,
};

const HEARTBEAT_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// AgentPool
// ---------------------------------------------------------------------------

/**
 * Concurrency-controlled pool for running SkillFoundry agents in parallel.
 *
 * Features:
 * - Semaphore-based concurrency limiting (configurable, default 3)
 * - Priority queue — higher priority tasks run before lower-priority ones
 * - FIFO ordering for tasks with equal priority
 * - Per-task timeout with automatic abort and slot recovery
 * - Crash recovery — if an agent throws, the pool recovers the slot
 * - `drain()` — wait for all queued and running tasks to finish
 * - `shutdown()` — cancel queued tasks and wait for running to complete
 * - Bus integration: publishes `status:heartbeat` every 5s, handles `task:cancel`
 *
 * @example
 * ```typescript
 * const bus = new AgentMessageBus();
 * const pool = new AgentPool(bus, { maxConcurrency: 5 });
 *
 * const result = await pool.submit({
 *   id: randomUUID(),
 *   agentId: 'coder',
 *   input: 'implement login endpoint',
 *   priority: 0,
 *   correlationId: randomUUID(),
 *   enqueuedAt: Date.now(),
 * });
 *
 * await pool.drain();
 * await pool.shutdown();
 * ```
 */
export class AgentPool {
  private readonly bus: AgentMessageBus;
  private readonly options: PoolOptions;

  // Active: tasks currently executing (slot occupied)
  private readonly active: Map<string, ActiveEntry> = new Map();

  // Queue: tasks waiting for a free slot — sorted by priority desc, then enqueuedAt asc
  private readonly queue: QueueEntry[] = [];

  // Counters
  private completedCount = 0;
  private failedCount = 0;

  // Drain waiters — resolved when queue + active both reach zero
  private drainWaiters: Array<() => void> = [];

  // Shutdown state
  private isShuttingDown = false;

  // Bus subscriptions
  private readonly unsubCancelTask: () => void;
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;

  /**
   * Create an AgentPool.
   *
   * @param bus - The message bus to use for heartbeats and task:cancel messages.
   * @param options - Partial overrides for pool behaviour (maxConcurrency, timeouts).
   */
  constructor(bus: AgentMessageBus, options?: Partial<PoolOptions>) {
    this.bus = bus;
    this.options = {
      maxConcurrency: Math.min(10, Math.max(1, options?.maxConcurrency ?? DEFAULT_OPTIONS.maxConcurrency)),
      taskTimeout: options?.taskTimeout ?? DEFAULT_OPTIONS.taskTimeout,
      drainTimeout: options?.drainTimeout ?? DEFAULT_OPTIONS.drainTimeout,
    };

    // Subscribe to task:cancel messages
    this.unsubCancelTask = this.bus.subscribe('task:cancel', (msg) => {
      const taskId = msg.payload['taskId'] as string | undefined;
      if (taskId) {
        this.cancelTask(taskId);
      }
    });

    // Publish heartbeat on a fixed interval
    this.heartbeatTimer = setInterval(() => {
      this.publishHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Allow the process to exit even if the interval is still active
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Submit a single task. Resolves with the AgentResult when the agent completes,
   * or rejects with TaskTimeoutError, ShutdownError, or any error thrown by the agent.
   *
   * @param task - The task descriptor. `id`, `agentId`, `input`, `priority`,
   *               `correlationId`, and `enqueuedAt` must be populated.
   * @returns Promise<AgentResult> that settles when the task finishes.
   */
  submit(task: AgentTask): Promise<AgentResult> {
    if (this.isShuttingDown) {
      return Promise.reject(new ShutdownError(task.id));
    }

    return new Promise<AgentResult>((resolve, reject) => {
      this.enqueue({ task, resolve, reject });
      this.dispatch();
    });
  }

  /**
   * Submit multiple tasks simultaneously. Returns a promise for each task's result
   * in the same order as the input array.
   *
   * @param tasks - Array of task descriptors.
   * @returns Promise.all over all individual submit() calls.
   */
  submitBatch(tasks: AgentTask[]): Promise<AgentResult[]> {
    return Promise.all(tasks.map((t) => this.submit(t)));
  }

  /**
   * Wait until all currently queued and running tasks have finished.
   * Rejects if the drain exceeds `drainTimeout`.
   *
   * @returns Promise<void> that resolves when the pool reaches idle state.
   */
  drain(): Promise<void> {
    if (this.active.size === 0 && this.queue.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.drainWaiters = this.drainWaiters.filter((w) => w !== waiter);
        reject(new Error(`drain() timed out after ${this.options.drainTimeout}ms`));
      }, this.options.drainTimeout);

      if (timer.unref) timer.unref();

      const waiter = () => {
        clearTimeout(timer);
        resolve();
      };

      this.drainWaiters.push(waiter);
    });
  }

  /**
   * Initiate graceful shutdown.
   * - Queued tasks are immediately rejected with ShutdownError
   * - Running tasks are allowed to complete (up to drainTimeout)
   * - New submit() calls are rejected with ShutdownError
   * - Cleans up the heartbeat interval and bus subscription
   *
   * @returns Promise<void> that resolves when all running tasks have settled.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const log = getLogger();
    log.info('agent-pool', 'pool_shutdown_start', {
      running: this.active.size,
      queued: this.queue.length,
    });

    // Reject all queued tasks immediately
    const pending = [...this.queue];
    this.queue.length = 0;
    for (const entry of pending) {
      entry.reject(new ShutdownError(entry.task.id));
    }

    // Wait for running tasks to complete (bounded by drainTimeout)
    if (this.active.size > 0) {
      await Promise.race([
        this.drain(),
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            // Force-abort any still-running tasks
            for (const [, entry] of this.active) {
              entry.abortSignal.aborted = true;
              if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
              entry.agent.abort();
            }
            resolve();
          }, this.options.drainTimeout);
          if (timer.unref) timer.unref();
        }),
      ]);
    }

    // Cleanup
    clearInterval(this.heartbeatTimer);
    this.unsubCancelTask();

    log.info('agent-pool', 'pool_shutdown_complete', {
      completed: this.completedCount,
      failed: this.failedCount,
    });
  }

  /**
   * Returns a point-in-time snapshot of pool state.
   *
   * @returns PoolStatus with running/queued/completed/failed counts and task details.
   */
  getStatus(): PoolStatus {
    return {
      running: this.active.size,
      queued: this.queue.length,
      completed: this.completedCount,
      failed: this.failedCount,
      maxConcurrency: this.options.maxConcurrency,
      activeTasks: Array.from(this.active.values()).map((e) => ({
        taskId: e.task.id,
        agentId: e.task.agentId,
        startedAt: e.startedAt,
      })),
      queuedTasks: this.queue.map((e) => ({
        taskId: e.task.id,
        agentId: e.task.agentId,
        enqueuedAt: e.task.enqueuedAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Private — queue management
  // ---------------------------------------------------------------------------

  /**
   * Insert a QueueEntry in priority order (higher priority first; FIFO within same priority).
   * Uses insertion sort — queue sizes are typically small (<100 entries).
   */
  private enqueue(entry: QueueEntry): void {
    let insertAt = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (entry.task.priority > this.queue[i].task.priority) {
        insertAt = i;
        break;
      }
    }
    this.queue.splice(insertAt, 0, entry);
  }

  /**
   * Attempt to dispatch queued tasks up to the concurrency limit.
   * Safe to call multiple times — exits early if no capacity or queue is empty.
   */
  private dispatch(): void {
    while (this.active.size < this.options.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.run(entry);
    }
  }

  /**
   * Execute a single task. Manages the active map, timeout, and slot recovery.
   */
  private run(entry: QueueEntry): void {
    const { task, resolve, reject } = entry;
    const log = getLogger();
    const abortSignal: { aborted: boolean } = { aborted: false };
    const startedAt = Date.now();

    let agent: Agent;
    try {
      agent = createAgentInstance(task.agentId);
    } catch (err) {
      // Agent instantiation failed — recover slot and reject
      this.failedCount++;
      const message = err instanceof Error ? err.message : String(err);
      log.error('agent-pool', 'task_instantiation_failed', { taskId: task.id, agentId: task.agentId, error: message });
      reject(err);
      this.checkDrainComplete();
      this.dispatch();
      return;
    }

    // Build AgentContext — use provided context or build a minimal default
    const context: AgentContext = task.context ?? this.buildDefaultContext(abortSignal);
    // Always use the task's abortSignal so the pool controls abort
    const contextWithSignal: AgentContext = { ...context, abortSignal };

    const activeEntry: ActiveEntry = {
      task,
      startedAt,
      agent,
      abortSignal,
      timeoutHandle: null,
    };

    this.active.set(task.id, activeEntry);

    log.info('agent-pool', 'task_started', {
      taskId: task.id,
      agentId: task.agentId,
      running: this.active.size,
      queued: this.queue.length,
    });

    // Set per-task timeout
    const timeoutHandle = setTimeout(() => {
      if (!this.active.has(task.id)) return; // Already completed
      abortSignal.aborted = true;
      agent.abort();
      log.warn('agent-pool', 'task_timeout', { taskId: task.id, agentId: task.agentId, timeoutMs: this.options.taskTimeout });
    }, this.options.taskTimeout);

    if (timeoutHandle.unref) timeoutHandle.unref();
    activeEntry.timeoutHandle = timeoutHandle;

    // Execute the agent
    agent.execute(task.input, contextWithSignal)
      .then((result) => {
        clearTimeout(timeoutHandle);
        this.active.delete(task.id);

        if (abortSignal.aborted && result.status !== 'completed') {
          // Aborted via timeout — reject with TaskTimeoutError
          this.failedCount++;
          log.warn('agent-pool', 'task_timed_out', { taskId: task.id, agentId: task.agentId });
          reject(new TaskTimeoutError(task.id, task.agentId, this.options.taskTimeout));
        } else {
          this.completedCount++;
          log.info('agent-pool', 'task_completed', {
            taskId: task.id,
            agentId: task.agentId,
            status: result.status,
            durationMs: result.durationMs,
          });
          resolve(result);
        }

        this.checkDrainComplete();
        this.dispatch();
      })
      .catch((err) => {
        clearTimeout(timeoutHandle);
        this.active.delete(task.id);
        this.failedCount++;

        const message = err instanceof Error ? err.message : String(err);
        log.error('agent-pool', 'task_failed', { taskId: task.id, agentId: task.agentId, error: message });

        reject(err);
        this.checkDrainComplete();
        this.dispatch();
      });
  }

  /**
   * Cancel a specific task by ID.
   * If queued: removes it from the queue and rejects its promise with ShutdownError.
   * If running: aborts the agent (the running promise will settle via the abort path).
   */
  private cancelTask(taskId: string): void {
    const log = getLogger();

    // Check queue first
    const queueIndex = this.queue.findIndex((e) => e.task.id === taskId);
    if (queueIndex !== -1) {
      const [entry] = this.queue.splice(queueIndex, 1);
      log.info('agent-pool', 'task_cancelled_from_queue', { taskId });
      entry.reject(new ShutdownError(taskId));
      this.checkDrainComplete();
      return;
    }

    // Check active
    const activeEntry = this.active.get(taskId);
    if (activeEntry) {
      log.info('agent-pool', 'task_cancel_running', { taskId });
      activeEntry.abortSignal.aborted = true;
      activeEntry.agent.abort();
    }
  }

  /**
   * Check if the pool has reached idle (no active, no queued) and notify drain() waiters.
   */
  private checkDrainComplete(): void {
    if (this.active.size === 0 && this.queue.length === 0) {
      const waiters = [...this.drainWaiters];
      this.drainWaiters = [];
      for (const waiter of waiters) {
        waiter();
      }
    }
  }

  /**
   * Build a minimal AgentContext suitable for running agents when none is provided.
   */
  private buildDefaultContext(abortSignal: { aborted: boolean }): AgentContext {
    return {
      workDir: process.cwd(),
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
      policy: {
        allow_shell: false,
        allow_network: false,
        allow_paths: [process.cwd()],
        redact: false,
      },
      parentAgent: null,
      budgetUsd: 10.0,
      abortSignal,
      delegationDepth: 0,
    };
  }

  /**
   * Publish a status:heartbeat message with current pool state.
   */
  private publishHeartbeat(): void {
    const status = this.getStatus();
    const message = AgentMessageBus.buildMessage(
      'agent-pool',
      '*',
      'status:heartbeat',
      {
        running: status.running,
        queued: status.queued,
        completed: status.completed,
        failed: status.failed,
        maxConcurrency: status.maxConcurrency,
      },
    );
    this.bus.publish(message);
  }
}

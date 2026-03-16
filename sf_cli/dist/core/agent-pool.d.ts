import type { AgentResult, AgentContext } from './agent.js';
import { AgentMessageBus } from './agent-message-bus.js';
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
    activeTasks: Array<{
        taskId: string;
        agentId: string;
        startedAt: number;
    }>;
    queuedTasks: Array<{
        taskId: string;
        agentId: string;
        enqueuedAt: number;
    }>;
}
/**
 * Thrown when a task exceeds its configured taskTimeout.
 */
export declare class TaskTimeoutError extends Error {
    readonly taskId: string;
    readonly agentId: string;
    constructor(taskId: string, agentId: string, timeoutMs: number);
}
/**
 * Thrown when the pool is shut down and rejects a pending or new submission.
 */
export declare class ShutdownError extends Error {
    readonly taskId: string;
    constructor(taskId: string);
}
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
export declare class AgentPool {
    private readonly bus;
    private readonly options;
    private readonly active;
    private readonly queue;
    private completedCount;
    private failedCount;
    private drainWaiters;
    private isShuttingDown;
    private readonly unsubCancelTask;
    private readonly heartbeatTimer;
    /**
     * Create an AgentPool.
     *
     * @param bus - The message bus to use for heartbeats and task:cancel messages.
     * @param options - Partial overrides for pool behaviour (maxConcurrency, timeouts).
     */
    constructor(bus: AgentMessageBus, options?: Partial<PoolOptions>);
    /**
     * Submit a single task. Resolves with the AgentResult when the agent completes,
     * or rejects with TaskTimeoutError, ShutdownError, or any error thrown by the agent.
     *
     * @param task - The task descriptor. `id`, `agentId`, `input`, `priority`,
     *               `correlationId`, and `enqueuedAt` must be populated.
     * @returns Promise<AgentResult> that settles when the task finishes.
     */
    submit(task: AgentTask): Promise<AgentResult>;
    /**
     * Submit multiple tasks simultaneously. Returns a promise for each task's result
     * in the same order as the input array.
     *
     * @param tasks - Array of task descriptors.
     * @returns Promise.all over all individual submit() calls.
     */
    submitBatch(tasks: AgentTask[]): Promise<AgentResult[]>;
    /**
     * Wait until all currently queued and running tasks have finished.
     * Rejects if the drain exceeds `drainTimeout`.
     *
     * @returns Promise<void> that resolves when the pool reaches idle state.
     */
    drain(): Promise<void>;
    /**
     * Initiate graceful shutdown.
     * - Queued tasks are immediately rejected with ShutdownError
     * - Running tasks are allowed to complete (up to drainTimeout)
     * - New submit() calls are rejected with ShutdownError
     * - Cleans up the heartbeat interval and bus subscription
     *
     * @returns Promise<void> that resolves when all running tasks have settled.
     */
    shutdown(): Promise<void>;
    /**
     * Returns a point-in-time snapshot of pool state.
     *
     * @returns PoolStatus with running/queued/completed/failed counts and task details.
     */
    getStatus(): PoolStatus;
    /**
     * Insert a QueueEntry in priority order (higher priority first; FIFO within same priority).
     * Uses insertion sort — queue sizes are typically small (<100 entries).
     */
    private enqueue;
    /**
     * Attempt to dispatch queued tasks up to the concurrency limit.
     * Safe to call multiple times — exits early if no capacity or queue is empty.
     */
    private dispatch;
    /**
     * Execute a single task. Manages the active map, timeout, and slot recovery.
     */
    private run;
    /**
     * Cancel a specific task by ID.
     * If queued: removes it from the queue and rejects its promise with ShutdownError.
     * If running: aborts the agent (the running promise will settle via the abort path).
     */
    private cancelTask;
    /**
     * Check if the pool has reached idle (no active, no queued) and notify drain() waiters.
     */
    private checkDrainComplete;
    /**
     * Build a minimal AgentContext suitable for running agents when none is provided.
     */
    private buildDefaultContext;
    /**
     * Publish a status:heartbeat message with current pool state.
     */
    private publishHeartbeat;
}

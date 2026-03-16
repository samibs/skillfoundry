// AgentPool — concurrency-controlled agent execution pool with FIFO priority queue.
// Manages parallel agent execution with configurable concurrency limits, task timeouts,
// drain/shutdown lifecycle, and bus-integrated heartbeat + cancellation support.
import { createAgentInstance } from './agent-registry.js';
import { AgentMessageBus } from './agent-message-bus.js';
import { getLogger } from '../utils/logger.js';
// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------
/**
 * Thrown when a task exceeds its configured taskTimeout.
 */
export class TaskTimeoutError extends Error {
    taskId;
    agentId;
    constructor(taskId, agentId, timeoutMs) {
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
    taskId;
    constructor(taskId) {
        super(`Pool is shutting down — task ${taskId} was cancelled`);
        this.name = 'ShutdownError';
        this.taskId = taskId;
    }
}
// ---------------------------------------------------------------------------
// Default options
// ---------------------------------------------------------------------------
const DEFAULT_OPTIONS = {
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
    bus;
    options;
    // Active: tasks currently executing (slot occupied)
    active = new Map();
    // Queue: tasks waiting for a free slot — sorted by priority desc, then enqueuedAt asc
    queue = [];
    // Counters
    completedCount = 0;
    failedCount = 0;
    // Drain waiters — resolved when queue + active both reach zero
    drainWaiters = [];
    // Shutdown state
    isShuttingDown = false;
    // Bus subscriptions
    unsubCancelTask;
    heartbeatTimer;
    /**
     * Create an AgentPool.
     *
     * @param bus - The message bus to use for heartbeats and task:cancel messages.
     * @param options - Partial overrides for pool behaviour (maxConcurrency, timeouts).
     */
    constructor(bus, options) {
        this.bus = bus;
        this.options = {
            maxConcurrency: Math.min(10, Math.max(1, options?.maxConcurrency ?? DEFAULT_OPTIONS.maxConcurrency)),
            taskTimeout: options?.taskTimeout ?? DEFAULT_OPTIONS.taskTimeout,
            drainTimeout: options?.drainTimeout ?? DEFAULT_OPTIONS.drainTimeout,
        };
        // Subscribe to task:cancel messages
        this.unsubCancelTask = this.bus.subscribe('task:cancel', (msg) => {
            const taskId = msg.payload['taskId'];
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
    submit(task) {
        if (this.isShuttingDown) {
            return Promise.reject(new ShutdownError(task.id));
        }
        return new Promise((resolve, reject) => {
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
    submitBatch(tasks) {
        return Promise.all(tasks.map((t) => this.submit(t)));
    }
    /**
     * Wait until all currently queued and running tasks have finished.
     * Rejects if the drain exceeds `drainTimeout`.
     *
     * @returns Promise<void> that resolves when the pool reaches idle state.
     */
    drain() {
        if (this.active.size === 0 && this.queue.length === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.drainWaiters = this.drainWaiters.filter((w) => w !== waiter);
                reject(new Error(`drain() timed out after ${this.options.drainTimeout}ms`));
            }, this.options.drainTimeout);
            if (timer.unref)
                timer.unref();
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
    async shutdown() {
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
                new Promise((resolve) => {
                    const timer = setTimeout(() => {
                        // Force-abort any still-running tasks
                        for (const [, entry] of this.active) {
                            entry.abortSignal.aborted = true;
                            if (entry.timeoutHandle)
                                clearTimeout(entry.timeoutHandle);
                            entry.agent.abort();
                        }
                        resolve();
                    }, this.options.drainTimeout);
                    if (timer.unref)
                        timer.unref();
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
    getStatus() {
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
    enqueue(entry) {
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
    dispatch() {
        while (this.active.size < this.options.maxConcurrency && this.queue.length > 0) {
            const entry = this.queue.shift();
            this.run(entry);
        }
    }
    /**
     * Execute a single task. Manages the active map, timeout, and slot recovery.
     */
    run(entry) {
        const { task, resolve, reject } = entry;
        const log = getLogger();
        const abortSignal = { aborted: false };
        const startedAt = Date.now();
        let agent;
        try {
            agent = createAgentInstance(task.agentId);
        }
        catch (err) {
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
        const context = task.context ?? this.buildDefaultContext(abortSignal);
        // Always use the task's abortSignal so the pool controls abort
        const contextWithSignal = { ...context, abortSignal };
        const activeEntry = {
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
            if (!this.active.has(task.id))
                return; // Already completed
            abortSignal.aborted = true;
            agent.abort();
            log.warn('agent-pool', 'task_timeout', { taskId: task.id, agentId: task.agentId, timeoutMs: this.options.taskTimeout });
        }, this.options.taskTimeout);
        if (timeoutHandle.unref)
            timeoutHandle.unref();
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
            }
            else {
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
    cancelTask(taskId) {
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
    checkDrainComplete() {
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
    buildDefaultContext(abortSignal) {
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
                data_jurisdiction: 'none',
                quality_fallback: false,
                routing_rules: {},
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
    publishHeartbeat() {
        const status = this.getStatus();
        const message = AgentMessageBus.buildMessage('agent-pool', '*', 'status:heartbeat', {
            running: status.running,
            queued: status.queued,
            completed: status.completed,
            failed: status.failed,
            maxConcurrency: status.maxConcurrency,
        });
        this.bus.publish(message);
    }
}
//# sourceMappingURL=agent-pool.js.map
/**
 * A single structured log entry for an agent task lifecycle event.
 */
export interface AgentLogEntry {
    /** ISO 8601 timestamp of when the entry was written. */
    timestamp: string;
    /** Severity level. */
    level: 'info' | 'warn' | 'error' | 'debug';
    /** ID of the agent producing this entry (e.g. 'coder-001'). */
    agentId: string;
    /** ID of the task being executed. */
    taskId: string;
    /**
     * Correlation ID linking related messages across agent boundaries.
     * All delegated sub-agents share the same correlationId as their parent.
     */
    correlationId: string;
    /**
     * Lifecycle phase of the entry.
     * - start: agent is beginning task execution
     * - execute: agent is mid-execution (informational)
     * - delegate: agent is delegating to a sub-agent
     * - complete: agent finished successfully
     * - fail: agent failed with an error
     * - abort: agent was externally aborted
     */
    phase: 'start' | 'execute' | 'delegate' | 'complete' | 'fail' | 'abort';
    /** Wall-clock duration from start() to complete/fail/abort in milliseconds. Present on complete/fail/abort phases. */
    durationMs?: number;
    /** Human-readable description of the event. */
    message: string;
    /** Optional arbitrary context (tool calls, token usage, error details, etc.). */
    metadata?: Record<string, unknown>;
}
/**
 * Structured per-agent logger that writes JSONL entries with full task
 * correlation to both the shared SfLogger and a dedicated per-agent log file
 * under `.skillfoundry/logs/agents/`.
 *
 * @example
 * ```typescript
 * const logger = new AgentLogger('coder-001', 'task-uuid', 'correlation-uuid', '/project');
 * logger.start();
 * logger.info('Reading source files', { fileCount: 12 });
 * logger.complete({ linesWritten: 240 });
 * ```
 */
export declare class AgentLogger {
    private readonly agentId;
    private readonly taskId;
    private readonly correlationId;
    private readonly agentLogPath;
    private startTimeMs;
    /**
     * Create an AgentLogger.
     *
     * @param agentId - Identifier of the agent (e.g. 'coder-001').
     * @param taskId - Unique task identifier (UUID).
     * @param correlationId - Correlation ID shared across all agents participating in the same request chain.
     * @param workDir - Project working directory. Defaults to process.cwd(). Logs go to `workDir/.skillfoundry/logs/agents/`.
     */
    constructor(agentId: string, taskId: string, correlationId: string, workDir?: string);
    /**
     * Log the start of task execution. Records the start timestamp for duration tracking.
     * Phase: 'start'.
     */
    start(): void;
    /**
     * Log an informational message during execution.
     * Phase: 'execute'.
     *
     * @param message - Description of the event.
     * @param metadata - Optional structured context (tool calls, file paths, etc.).
     */
    info(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log a warning during execution.
     * Phase: 'execute'.
     *
     * @param message - Warning description.
     * @param metadata - Optional structured context.
     */
    warn(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log an error event during execution without terminating the task.
     * Phase: 'execute'.
     *
     * @param message - Error description.
     * @param metadata - Optional structured context.
     */
    error(message: string, metadata?: Record<string, unknown>): void;
    /**
     * Log successful task completion with wall-clock duration.
     * Phase: 'complete'.
     *
     * @param result - Optional result data to include in metadata (output summary, artifact paths, etc.).
     */
    complete(result?: unknown): void;
    /**
     * Log a task failure with wall-clock duration and full error details.
     * Phase: 'fail'.
     *
     * @param error - The Error that caused the failure. Stack trace is captured in metadata.
     */
    fail(error: Error): void;
    /**
     * Log a task abort (externally triggered cancellation) with wall-clock duration.
     * Phase: 'abort'.
     *
     * @param reason - Human-readable reason for the abort.
     */
    abort(reason: string): void;
    /**
     * Calculate elapsed milliseconds since start() was called.
     * Returns 0 if start() was never called.
     */
    private elapsedMs;
    /**
     * Build the AgentLogEntry and write it to both the shared logger and the
     * per-agent JSONL file.
     */
    private writeEntry;
}

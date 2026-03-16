// AgentLogger — Structured per-agent JSON logging with task correlation IDs.
// Writes JSONL entries to .skillfoundry/logs/agents/ directory via the shared
// SfLogger utility, tagging every entry with agentId, taskId, and correlationId.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../utils/logger.js';
// ---------------------------------------------------------------------------
// AgentLogger
// ---------------------------------------------------------------------------
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
export class AgentLogger {
    agentId;
    taskId;
    correlationId;
    agentLogPath;
    startTimeMs = 0;
    /**
     * Create an AgentLogger.
     *
     * @param agentId - Identifier of the agent (e.g. 'coder-001').
     * @param taskId - Unique task identifier (UUID).
     * @param correlationId - Correlation ID shared across all agents participating in the same request chain.
     * @param workDir - Project working directory. Defaults to process.cwd(). Logs go to `workDir/.skillfoundry/logs/agents/`.
     */
    constructor(agentId, taskId, correlationId, workDir = process.cwd()) {
        this.agentId = agentId;
        this.taskId = taskId;
        this.correlationId = correlationId;
        const agentLogsDir = join(workDir, '.skillfoundry', 'logs', 'agents');
        try {
            if (!existsSync(agentLogsDir)) {
                mkdirSync(agentLogsDir, { recursive: true });
            }
            // One log file per agent+task combination — prevents unbounded single-file growth
            this.agentLogPath = join(agentLogsDir, `${agentId}-${taskId}.jsonl`);
        }
        catch {
            // Graceful degradation: if directory creation fails (e.g., test environments),
            // disable file logging — entries still go to the shared SfLogger
            this.agentLogPath = '';
        }
    }
    /**
     * Log the start of task execution. Records the start timestamp for duration tracking.
     * Phase: 'start'.
     */
    start() {
        this.startTimeMs = Date.now();
        this.writeEntry('info', 'start', 'Task execution started');
    }
    /**
     * Log an informational message during execution.
     * Phase: 'execute'.
     *
     * @param message - Description of the event.
     * @param metadata - Optional structured context (tool calls, file paths, etc.).
     */
    info(message, metadata) {
        this.writeEntry('info', 'execute', message, undefined, metadata);
    }
    /**
     * Log a warning during execution.
     * Phase: 'execute'.
     *
     * @param message - Warning description.
     * @param metadata - Optional structured context.
     */
    warn(message, metadata) {
        this.writeEntry('warn', 'execute', message, undefined, metadata);
    }
    /**
     * Log an error event during execution without terminating the task.
     * Phase: 'execute'.
     *
     * @param message - Error description.
     * @param metadata - Optional structured context.
     */
    error(message, metadata) {
        this.writeEntry('error', 'execute', message, undefined, metadata);
    }
    /**
     * Log successful task completion with wall-clock duration.
     * Phase: 'complete'.
     *
     * @param result - Optional result data to include in metadata (output summary, artifact paths, etc.).
     */
    complete(result) {
        const durationMs = this.elapsedMs();
        const metadata = {};
        if (result !== undefined) {
            metadata['result'] = result;
        }
        this.writeEntry('info', 'complete', 'Task execution completed', durationMs, Object.keys(metadata).length > 0 ? metadata : undefined);
    }
    /**
     * Log a task failure with wall-clock duration and full error details.
     * Phase: 'fail'.
     *
     * @param error - The Error that caused the failure. Stack trace is captured in metadata.
     */
    fail(error) {
        const durationMs = this.elapsedMs();
        this.writeEntry('error', 'fail', `Task execution failed: ${error.message}`, durationMs, {
            errorName: error.name,
            errorMessage: error.message,
            stack: error.stack ?? '',
        });
    }
    /**
     * Log a task abort (externally triggered cancellation) with wall-clock duration.
     * Phase: 'abort'.
     *
     * @param reason - Human-readable reason for the abort.
     */
    abort(reason) {
        const durationMs = this.elapsedMs();
        this.writeEntry('warn', 'abort', `Task aborted: ${reason}`, durationMs, { reason });
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * Calculate elapsed milliseconds since start() was called.
     * Returns 0 if start() was never called.
     */
    elapsedMs() {
        if (this.startTimeMs === 0)
            return 0;
        return Date.now() - this.startTimeMs;
    }
    /**
     * Build the AgentLogEntry and write it to both the shared logger and the
     * per-agent JSONL file.
     */
    writeEntry(level, phase, message, durationMs, metadata) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            agentId: this.agentId,
            taskId: this.taskId,
            correlationId: this.correlationId,
            phase,
            message,
        };
        if (durationMs !== undefined) {
            entry.durationMs = durationMs;
        }
        if (metadata !== undefined) {
            entry.metadata = metadata;
        }
        // Write to shared SfLogger (session.log + run log)
        const sfLog = getLogger();
        const sfData = {
            agentId: this.agentId,
            taskId: this.taskId,
            correlationId: this.correlationId,
            phase,
            message,
        };
        if (durationMs !== undefined)
            sfData['durationMs'] = durationMs;
        if (metadata !== undefined)
            sfData['metadata'] = metadata;
        switch (level) {
            case 'debug':
                sfLog.debug('agent-logger', `agent_${phase}`, sfData);
                break;
            case 'info':
                sfLog.info('agent-logger', `agent_${phase}`, sfData);
                break;
            case 'warn':
                sfLog.warn('agent-logger', `agent_${phase}`, sfData);
                break;
            case 'error':
                sfLog.error('agent-logger', `agent_${phase}`, sfData);
                break;
        }
        // Write to per-agent JSONL file (always, regardless of log threshold)
        try {
            appendFileSync(this.agentLogPath, JSON.stringify(entry) + '\n');
        }
        catch {
            // Logging must never crash the application — best-effort write
        }
    }
}
//# sourceMappingURL=agent-logger.js.map
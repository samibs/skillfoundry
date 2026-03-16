export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'pipeline' | 'runner' | 'gate' | 'microgate' | 'provider' | 'tool' | 'budget' | 'debugger' | 'repair' | 'react' | 'persist' | 'memory' | 'decision' | 'harvest' | 'recall' | 'primer' | 'telemetry' | 'weight-learner' | 'dep-scanner' | 'consent' | 'baseline' | 'embedding' | 'message-bus' | 'gitleaks' | 'agent-pool' | 'checkov' | 'license' | 'prd-scorer' | 'vector-store' | 'security-report' | 'agent-logger' | 'memory-search' | 'prd-review' | 'memory-benchmark';
/**
 * Structured JSONL logger.
 * Writes entries as one JSON object per line to session.log and optionally a per-run log.
 * Uses appendFileSync for crash safety (no buffering).
 */
declare class SfLogger {
    private logsDir;
    private sessionLogPath;
    private runLogPath;
    private threshold;
    constructor(workDir: string, level: LogLevel);
    /**
     * Start a per-run log file. Called at pipeline start.
     * Run log is named to match the runId from .skillfoundry/runs/{runId}.json.
     */
    startRunLog(runId: string): void;
    /**
     * Remove oldest run logs beyond MAX_RUN_LOGS.
     * Called at pipeline start to prevent unbounded growth.
     */
    cleanupOldLogs(): void;
    debug(category: LogCategory, event: string, data?: Record<string, unknown>): void;
    info(category: LogCategory, event: string, data?: Record<string, unknown>): void;
    warn(category: LogCategory, event: string, data?: Record<string, unknown>): void;
    error(category: LogCategory, event: string, data?: Record<string, unknown>): void;
    private write;
    /**
     * Trim session.log when it exceeds MAX_SESSION_LINES.
     * Keeps the newest half of lines.
     */
    private trimSessionLog;
}
/**
 * Initialize the logger singleton. Call once per session with the workDir and log level.
 * Subsequent calls with different parameters re-initialize the logger.
 */
export declare function initLogger(workDir: string, level: LogLevel): SfLogger;
/**
 * Get the logger singleton. Returns a no-op logger if not yet initialized.
 */
export declare function getLogger(): SfLogger;
export {};

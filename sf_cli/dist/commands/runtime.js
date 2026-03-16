// Runtime command — `sf runtime status`
// Displays per-agent state, task queues, pool health, and recent bus messages.
// Reads from AgentPool.getStatus() and AgentMessageBus.global().getHistory().
import { AgentMessageBus } from '../core/agent-message-bus.js';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Format elapsed milliseconds as a human-readable duration string.
 * Examples: "0.4s", "12.4s", "4m 23s", "1h 2m".
 *
 * @param ms - Duration in milliseconds.
 * @returns Formatted duration string.
 */
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const secs = ms / 1000;
    if (secs < 60)
        return `${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.floor(secs % 60);
    if (mins < 60)
        return `${mins}m ${remainSecs}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
}
/**
 * Format process uptime from process.uptime() (seconds) as a human-readable string.
 *
 * @param uptimeSecs - Uptime in seconds from process.uptime().
 * @returns Formatted uptime string.
 */
function formatUptime(uptimeSecs) {
    return formatDuration(Math.floor(uptimeSecs * 1000));
}
/**
 * Pad a string with trailing spaces to reach a target width.
 * Truncates strings that exceed the target width to avoid wrapping.
 *
 * @param str - String to pad.
 * @param width - Target column width.
 * @returns Padded or truncated string.
 */
function col(str, width) {
    if (str.length > width)
        return str.slice(0, width - 1) + '…';
    return str.padEnd(width);
}
/**
 * Render the formatted text table output for `sf runtime status`.
 *
 * @param status - Pool status snapshot from AgentPool.getStatus().
 * @param messageCount - Total message count from the global bus history.
 * @param uptimeSecs - Current process uptime in seconds.
 * @returns Multi-line formatted string suitable for terminal output.
 */
function renderStatusTable(status, messageCount, uptimeSecs) {
    const now = Date.now();
    const lines = [];
    lines.push('');
    lines.push('  Agent Pool Status');
    lines.push('  ' + '─'.repeat(65));
    lines.push(`  Concurrency: ${status.running} / ${status.maxConcurrency} active │ ` +
        `Queue: ${status.queued} pending │ ` +
        `Uptime: ${formatUptime(uptimeSecs)}`);
    lines.push('');
    // Active agents table
    if (status.activeTasks.length > 0) {
        lines.push('  Active Agents');
        lines.push('  ┌' + '─'.repeat(16) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(24) + '┬' + '─'.repeat(12) + '┐');
        lines.push('  │ ' + col('Agent ID', 14) + ' │ ' + col('State', 10) + ' │ ' + col('Current Task', 22) + ' │ ' + col('Duration', 10) + ' │');
        lines.push('  ├' + '─'.repeat(16) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(24) + '┼' + '─'.repeat(12) + '┤');
        for (const task of status.activeTasks) {
            const duration = formatDuration(now - task.startedAt);
            lines.push('  │ ' +
                col(task.agentId, 14) + ' │ ' +
                col('running', 10) + ' │ ' +
                col(task.taskId.slice(0, 22), 22) + ' │ ' +
                col(duration, 10) + ' │');
        }
        lines.push('  └' + '─'.repeat(16) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(24) + '┴' + '─'.repeat(12) + '┘');
        lines.push('');
    }
    else {
        lines.push('  Active Agents: (none)');
        lines.push('');
    }
    // Queued tasks table
    if (status.queuedTasks.length > 0) {
        lines.push('  Queued Tasks');
        lines.push('  ┌' + '─'.repeat(16) + '┬' + '─'.repeat(26) + '┬' + '─'.repeat(12) + '┐');
        lines.push('  │ ' + col('Agent ID', 14) + ' │ ' + col('Task', 24) + ' │ ' + col('Wait', 10) + ' │');
        lines.push('  ├' + '─'.repeat(16) + '┼' + '─'.repeat(26) + '┼' + '─'.repeat(12) + '┤');
        for (const task of status.queuedTasks) {
            const wait = formatDuration(now - task.enqueuedAt);
            lines.push('  │ ' +
                col(task.agentId, 14) + ' │ ' +
                col(task.taskId.slice(0, 24), 24) + ' │ ' +
                col(wait, 10) + ' │');
        }
        lines.push('  └' + '─'.repeat(16) + '┴' + '─'.repeat(26) + '┴' + '─'.repeat(12) + '┘');
        lines.push('');
    }
    lines.push(`  Completed: ${status.completed} │ Failed: ${status.failed} │ Messages: ${messageCount}`);
    lines.push('');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Pool singleton access
// ---------------------------------------------------------------------------
// The pool singleton — set by setActivePool() when a pipeline starts.
// Null when no pipeline is running.
let activePool = null;
/**
 * Register the active AgentPool so the runtime command can read its status.
 * Call this when a pipeline session starts; pass null when it ends.
 *
 * @param pool - The running AgentPool instance, or null to clear.
 */
export function setActivePool(pool) {
    activePool = pool;
}
/**
 * Returns the currently registered AgentPool, or null if no pipeline is active.
 *
 * @returns The active AgentPool or null.
 */
export function getActivePool() {
    return activePool;
}
// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------
/**
 * `sf runtime status` — Show pool status, active/queued agents, and message bus summary.
 *
 * Flags:
 * - `--json`  Output raw JSON matching the PoolStatus schema plus messageCount and uptimeSecs.
 * - `--watch` Refresh every 2 seconds (not supported in non-interactive mode; documented for future use).
 */
export const runtimeCommand = {
    name: 'runtime',
    description: 'Show runtime pool status, active agents, and message bus summary',
    usage: 'runtime status [--json] [--watch]',
    execute: async (args, _session) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        const subcommand = parts[0] ?? 'status';
        if (subcommand !== 'status') {
            return `Unknown subcommand: ${subcommand}\nUsage: ${runtimeCommand.usage}`;
        }
        const jsonOutput = parts.includes('--json');
        const pool = activePool;
        const bus = AgentMessageBus.global();
        const messageCount = bus.getHistory().length;
        const uptimeSecs = process.uptime();
        // No active pipeline
        if (pool === null) {
            if (jsonOutput) {
                return JSON.stringify({
                    active: false,
                    message: 'No active pipeline session.',
                    messageCount,
                    uptimeSecs: Math.floor(uptimeSecs),
                }, null, 2);
            }
            return '\n  No active pipeline session.\n';
        }
        const status = pool.getStatus();
        if (jsonOutput) {
            return JSON.stringify({
                active: true,
                ...status,
                messageCount,
                uptimeSecs: Math.floor(uptimeSecs),
            }, null, 2);
        }
        return renderStatusTable(status, messageCount, uptimeSecs);
    },
};
//# sourceMappingURL=runtime.js.map
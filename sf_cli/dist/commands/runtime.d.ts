import type { SlashCommand } from '../types.js';
import { AgentPool } from '../core/agent-pool.js';
/**
 * Register the active AgentPool so the runtime command can read its status.
 * Call this when a pipeline session starts; pass null when it ends.
 *
 * @param pool - The running AgentPool instance, or null to clear.
 */
export declare function setActivePool(pool: AgentPool | null): void;
/**
 * Returns the currently registered AgentPool, or null if no pipeline is active.
 *
 * @returns The active AgentPool or null.
 */
export declare function getActivePool(): AgentPool | null;
/**
 * `sf runtime status` — Show pool status, active/queued agents, and message bus summary.
 *
 * Flags:
 * - `--json`  Output raw JSON matching the PoolStatus schema plus messageCount and uptimeSecs.
 * - `--watch` Refresh every 2 seconds (not supported in non-interactive mode; documented for future use).
 */
export declare const runtimeCommand: SlashCommand;

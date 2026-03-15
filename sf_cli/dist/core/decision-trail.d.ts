export interface DecisionEntry {
    timestamp: string;
    agent: string;
    action: string;
    considered: string[];
    chosen: string;
    reason: string;
}
/**
 * Ring buffer of agent decision entries.
 * Supports per-agent tracking and global queries.
 */
export declare class DecisionTrail {
    private entries;
    private maxEntries;
    constructor(maxEntries?: number);
    /**
     * Record a decision made by an agent.
     */
    record(agent: string, action: string, considered: string[], chosen: string, reason: string): void;
    /**
     * Get the last N entries (default: 5) across all agents.
     */
    getLast(count?: number): DecisionEntry[];
    /**
     * Get entries for a specific agent.
     */
    getByAgent(agent: string, count?: number): DecisionEntry[];
    /**
     * Get the most recent agent that recorded a decision.
     */
    getLastActiveAgent(): string | null;
    /**
     * Format the decision trail for display (used by /explain last).
     */
    formatForDisplay(entries?: DecisionEntry[]): string;
    /**
     * Total recorded decisions.
     */
    get size(): number;
    /**
     * Clear all entries (for new forge run).
     */
    clear(): void;
}
/**
 * Get or create the session-level decision trail.
 */
export declare function getDecisionTrail(): DecisionTrail;
/**
 * Reset the session trail (for testing or new session).
 */
export declare function resetDecisionTrail(): void;

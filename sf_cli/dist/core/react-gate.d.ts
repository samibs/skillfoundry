export interface ReactGateConfig {
    minimumReads: number;
    gatedAgents: Set<string>;
}
export interface AgentToolStats {
    reads: number;
    writes: number;
    gateBlocked: number;
    firstWriteAt: number | null;
}
/**
 * ReACT Gate — tracks tool calls per agent per story and enforces
 * minimum read operations before allowing writes.
 */
export declare class ReactGate {
    private agentStats;
    private config;
    constructor(config?: Partial<ReactGateConfig>);
    /**
     * Record a tool call and check if it should be allowed.
     * Returns { allowed: true } for reads and non-gated agents.
     * Returns { allowed: false, reason } if a write is attempted without sufficient reads.
     */
    checkToolCall(agentName: string, toolName: string): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Get stats for a specific agent.
     */
    getStats(agentName: string): AgentToolStats | undefined;
    /**
     * Get summary of all agents' ReACT compliance for logging.
     */
    getSummary(): Array<{
        agent: string;
        reads: number;
        writes: number;
        blocked: number;
        compliant: boolean;
    }>;
    /**
     * Reset gate for a new story.
     */
    resetForStory(): void;
    private getOrCreateStats;
}

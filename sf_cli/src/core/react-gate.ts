// ReACT Gate — enforces research-before-acting for code-generating agents.
// Tracks tool call history per agent and blocks file writes until minimum reads are met.

import { getLogger } from '../utils/logger.js';

// Agents that must read before writing
const GATED_AGENTS = new Set([
  'coder',
  'secure-coder',
  'data-architect',
  'refactor',
]);

// Tools classified as "read" operations
const READ_TOOLS = new Set([
  'Read',
  'Grep',
  'Glob',
  'Bash',  // shell reads (ls, cat, git status, etc.)
]);

// Tools classified as "write" operations that require prior reads
const WRITE_TOOLS = new Set([
  'Edit',
  'Write',
  'NotebookEdit',
]);

const DEFAULT_MINIMUM_READS = 2;

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
export class ReactGate {
  private agentStats: Map<string, AgentToolStats> = new Map();
  private config: ReactGateConfig;

  constructor(config?: Partial<ReactGateConfig>) {
    this.config = {
      minimumReads: config?.minimumReads ?? DEFAULT_MINIMUM_READS,
      gatedAgents: config?.gatedAgents ?? GATED_AGENTS,
    };
  }

  /**
   * Record a tool call and check if it should be allowed.
   * Returns { allowed: true } for reads and non-gated agents.
   * Returns { allowed: false, reason } if a write is attempted without sufficient reads.
   */
  checkToolCall(
    agentName: string,
    toolName: string,
  ): { allowed: boolean; reason?: string } {
    // Non-gated agents pass through
    if (!this.config.gatedAgents.has(agentName)) {
      return { allowed: true };
    }

    const stats = this.getOrCreateStats(agentName);

    // Record reads
    if (READ_TOOLS.has(toolName)) {
      stats.reads++;
      return { allowed: true };
    }

    // Check writes against minimum reads
    if (WRITE_TOOLS.has(toolName)) {
      if (stats.reads < this.config.minimumReads) {
        stats.gateBlocked++;
        const log = getLogger();
        log.warn('react', 'write_blocked', {
          agent: agentName,
          tool: toolName,
          reads: stats.reads,
          minimumReads: this.config.minimumReads,
        });
        return {
          allowed: false,
          reason: `ReACT gate: ${agentName} attempted ${toolName} with only ${stats.reads} read(s) ` +
            `(minimum: ${this.config.minimumReads}). Read the target file or search the codebase first.`,
        };
      }

      stats.writes++;
      if (stats.firstWriteAt === null) {
        stats.firstWriteAt = stats.reads;
      }
      return { allowed: true };
    }

    // All other tools pass through
    return { allowed: true };
  }

  /**
   * Get stats for a specific agent.
   */
  getStats(agentName: string): AgentToolStats | undefined {
    return this.agentStats.get(agentName);
  }

  /**
   * Get summary of all agents' ReACT compliance for logging.
   */
  getSummary(): Array<{
    agent: string;
    reads: number;
    writes: number;
    blocked: number;
    compliant: boolean;
  }> {
    const results: Array<{
      agent: string;
      reads: number;
      writes: number;
      blocked: number;
      compliant: boolean;
    }> = [];

    for (const [agent, stats] of this.agentStats) {
      results.push({
        agent,
        reads: stats.reads,
        writes: stats.writes,
        blocked: stats.gateBlocked,
        compliant: stats.gateBlocked === 0 && (stats.writes === 0 || stats.reads >= this.config.minimumReads),
      });
    }

    return results;
  }

  /**
   * Reset gate for a new story.
   */
  resetForStory(): void {
    this.agentStats.clear();
  }

  private getOrCreateStats(agentName: string): AgentToolStats {
    let stats = this.agentStats.get(agentName);
    if (!stats) {
      stats = { reads: 0, writes: 0, gateBlocked: 0, firstWriteAt: null };
      this.agentStats.set(agentName, stats);
    }
    return stats;
  }
}

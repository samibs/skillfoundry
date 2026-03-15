// Decision trail — ring buffer capturing agent reasoning for mid-pipeline introspection.
// Agents record what they considered, chose, and why. Queryable via /explain last.

import { getLogger } from '../utils/logger.js';

export interface DecisionEntry {
  timestamp: string;
  agent: string;
  action: string;
  considered: string[];
  chosen: string;
  reason: string;
}

const DEFAULT_MAX_ENTRIES = 50;

/**
 * Ring buffer of agent decision entries.
 * Supports per-agent tracking and global queries.
 */
export class DecisionTrail {
  private entries: DecisionEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries?: number) {
    this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Record a decision made by an agent.
   */
  record(
    agent: string,
    action: string,
    considered: string[],
    chosen: string,
    reason: string,
  ): void {
    const entry: DecisionEntry = {
      timestamp: new Date().toISOString(),
      agent,
      action,
      considered,
      chosen,
      reason,
    };

    this.entries.push(entry);

    // Evict oldest if over capacity
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    const log = getLogger();
    log.info('decision', 'recorded', { agent, action, chosen });
  }

  /**
   * Get the last N entries (default: 5) across all agents.
   */
  getLast(count = 5): DecisionEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get entries for a specific agent.
   */
  getByAgent(agent: string, count?: number): DecisionEntry[] {
    const agentEntries = this.entries.filter((e) => e.agent === agent);
    return count ? agentEntries.slice(-count) : agentEntries;
  }

  /**
   * Get the most recent agent that recorded a decision.
   */
  getLastActiveAgent(): string | null {
    if (this.entries.length === 0) return null;
    return this.entries[this.entries.length - 1].agent;
  }

  /**
   * Format the decision trail for display (used by /explain last).
   */
  formatForDisplay(entries?: DecisionEntry[]): string {
    const items = entries ?? this.getLast();
    if (items.length === 0) {
      return 'No decisions recorded in this session.';
    }

    const lines: string[] = [];
    lines.push('## Decision Trail');
    lines.push('');

    for (const entry of items) {
      lines.push(`### ${entry.agent} — ${entry.action}`);
      lines.push(`*${entry.timestamp}*`);
      lines.push('');
      if (entry.considered.length > 0) {
        lines.push('**Considered:**');
        for (const c of entry.considered) {
          lines.push(`- ${c}`);
        }
        lines.push('');
      }
      lines.push(`**Chosen:** ${entry.chosen}`);
      lines.push(`**Reason:** ${entry.reason}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Total recorded decisions.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Clear all entries (for new forge run).
   */
  clear(): void {
    this.entries = [];
  }
}

// Singleton for the current session
let _sessionTrail: DecisionTrail | null = null;

/**
 * Get or create the session-level decision trail.
 */
export function getDecisionTrail(): DecisionTrail {
  if (!_sessionTrail) {
    _sessionTrail = new DecisionTrail();
  }
  return _sessionTrail;
}

/**
 * Reset the session trail (for testing or new session).
 */
export function resetDecisionTrail(): void {
  _sessionTrail = null;
}

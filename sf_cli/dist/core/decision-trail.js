// Decision trail — ring buffer capturing agent reasoning for mid-pipeline introspection.
// Agents record what they considered, chose, and why. Queryable via /explain last.
import { getLogger } from '../utils/logger.js';
const DEFAULT_MAX_ENTRIES = 50;
/**
 * Ring buffer of agent decision entries.
 * Supports per-agent tracking and global queries.
 */
export class DecisionTrail {
    entries = [];
    maxEntries;
    constructor(maxEntries) {
        this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    }
    /**
     * Record a decision made by an agent.
     */
    record(agent, action, considered, chosen, reason) {
        const entry = {
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
    getLast(count = 5) {
        return this.entries.slice(-count);
    }
    /**
     * Get entries for a specific agent.
     */
    getByAgent(agent, count) {
        const agentEntries = this.entries.filter((e) => e.agent === agent);
        return count ? agentEntries.slice(-count) : agentEntries;
    }
    /**
     * Get the most recent agent that recorded a decision.
     */
    getLastActiveAgent() {
        if (this.entries.length === 0)
            return null;
        return this.entries[this.entries.length - 1].agent;
    }
    /**
     * Format the decision trail for display (used by /explain last).
     */
    formatForDisplay(entries) {
        const items = entries ?? this.getLast();
        if (items.length === 0) {
            return 'No decisions recorded in this session.';
        }
        const lines = [];
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
    get size() {
        return this.entries.length;
    }
    /**
     * Clear all entries (for new forge run).
     */
    clear() {
        this.entries = [];
    }
}
// Singleton for the current session
let _sessionTrail = null;
/**
 * Get or create the session-level decision trail.
 */
export function getDecisionTrail() {
    if (!_sessionTrail) {
        _sessionTrail = new DecisionTrail();
    }
    return _sessionTrail;
}
/**
 * Reset the session trail (for testing or new session).
 */
export function resetDecisionTrail() {
    _sessionTrail = null;
}
//# sourceMappingURL=decision-trail.js.map
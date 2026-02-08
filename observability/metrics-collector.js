/**
 * Metrics Collector - Collect and aggregate metrics
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MetricsCollector {
  constructor(logsDir = path.join(process.cwd(), 'logs')) {
    this.logsDir = logsDir;
    this.metrics = {
      tokens: { total: 0, byAgent: {}, byAction: {} },
      latency: { total: 0, count: 0, byAgent: {}, byAction: {} },
      errors: { total: 0, byAgent: {}, byType: {}, byAction: {} },
      actions: { total: 0, byAgent: {}, byStatus: {} },
      sessions: new Set(),
    };
  }

  /**
   * Record token usage
   */
  recordTokens(agent, action, tokens) {
    this.metrics.tokens.total += tokens;
    this.metrics.tokens.byAgent[agent] = (this.metrics.tokens.byAgent[agent] || 0) + tokens;
    this.metrics.tokens.byAction[action] = (this.metrics.tokens.byAction[action] || 0) + tokens;
  }

  /**
   * Record latency
   */
  recordLatency(agent, action, ms) {
    this.metrics.latency.total += ms;
    this.metrics.latency.count += 1;

    if (!this.metrics.latency.byAgent[agent]) {
      this.metrics.latency.byAgent[agent] = { total: 0, count: 0 };
    }
    this.metrics.latency.byAgent[agent].total += ms;
    this.metrics.latency.byAgent[agent].count += 1;

    if (!this.metrics.latency.byAction[action]) {
      this.metrics.latency.byAction[action] = { total: 0, count: 0 };
    }
    this.metrics.latency.byAction[action].total += ms;
    this.metrics.latency.byAction[action].count += 1;
  }

  /**
   * Record error
   */
  recordError(agent, action, errorType) {
    this.metrics.errors.total += 1;
    this.metrics.errors.byAgent[agent] = (this.metrics.errors.byAgent[agent] || 0) + 1;
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
    this.metrics.errors.byAction[action] = (this.metrics.errors.byAction[action] || 0) + 1;
  }

  /**
   * Record action
   */
  recordAction(agent, action, status) {
    this.metrics.actions.total += 1;
    this.metrics.actions.byAgent[agent] = (this.metrics.actions.byAgent[agent] || 0) + 1;
    this.metrics.actions.byStatus[status] = (this.metrics.actions.byStatus[status] || 0) + 1;
  }

  /**
   * Record session
   */
  recordSession(sessionId) {
    this.metrics.sessions.add(sessionId);
  }

  /**
   * Get average latency for agent
   */
  getAverageLatency(agent) {
    const agentLatency = this.metrics.latency.byAgent[agent];
    if (!agentLatency || agentLatency.count === 0) {
      return 0;
    }
    return agentLatency.total / agentLatency.count;
  }

  /**
   * Get error rate
   */
  getErrorRate() {
    if (this.metrics.actions.total === 0) {
      return 0;
    }
    return (this.metrics.errors.total / this.metrics.actions.total) * 100;
  }

  /**
   * Get summary
   */
  getSummary() {
    return {
      tokens: {
        total: this.metrics.tokens.total,
        average: this.metrics.actions.total > 0
          ? this.metrics.tokens.total / this.metrics.actions.total
          : 0,
        byAgent: this.metrics.tokens.byAgent,
      },
      latency: {
        average: this.metrics.latency.count > 0
          ? this.metrics.latency.total / this.metrics.latency.count
          : 0,
        byAgent: Object.fromEntries(
          Object.entries(this.metrics.latency.byAgent).map(([agent, data]) => [
            agent,
            data.count > 0 ? data.total / data.count : 0,
          ])
        ),
      },
      errors: {
        total: this.metrics.errors.total,
        rate: this.getErrorRate(),
        byAgent: this.metrics.errors.byAgent,
        byType: this.metrics.errors.byType,
      },
      actions: {
        total: this.metrics.actions.total,
        byAgent: this.metrics.actions.byAgent,
        byStatus: this.metrics.actions.byStatus,
      },
      sessions: {
        total: this.metrics.sessions.size,
      },
    };
  }

  /**
   * Save metrics to file
   */
  async save() {
    const metricsFile = path.join(this.logsDir, 'traces', 'metrics.json');
    await fs.mkdir(path.dirname(metricsFile), { recursive: true });

    const metricsData = {
      ...this.metrics,
      sessions: Array.from(this.metrics.sessions),
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(metricsFile, JSON.stringify(metricsData, null, 2), 'utf-8');
  }

  /**
   * Load metrics from file
   */
  async load() {
    const metricsFile = path.join(this.logsDir, 'traces', 'metrics.json');
    try {
      const content = await fs.readFile(metricsFile, 'utf-8');
      const data = JSON.parse(content);
      this.metrics = {
        ...data,
        sessions: new Set(data.sessions || []),
      };
      delete this.metrics.lastUpdated;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start fresh
    }
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      tokens: { total: 0, byAgent: {}, byAction: {} },
      latency: { total: 0, count: 0, byAgent: {}, byAction: {} },
      errors: { total: 0, byAgent: {}, byType: {}, byAction: {} },
      actions: { total: 0, byAgent: {}, byStatus: {} },
      sessions: new Set(),
    };
  }
}

/**
 * Observability Manager - Unified interface for tracing, metrics, and auditing
 */

import { TraceLogger } from './trace-logger.js';
import { MetricsCollector } from './metrics-collector.js';
import { AuditLogger } from './audit-logger.js';

export class ObservabilityManager {
  constructor(logsDir = 'logs') {
    this.traceLogger = new TraceLogger(logsDir);
    this.metricsCollector = new MetricsCollector(logsDir);
    this.auditLogger = new AuditLogger(logsDir);
  }

  /**
   * Initialize (load existing metrics)
   */
  async initialize() {
    await this.metricsCollector.load();
  }

  /**
   * Start an action trace
   */
  async startAction(agent, action, input = {}) {
    const spanId = await this.traceLogger.startSpan(agent, action, input);
    this.metricsCollector.recordSession(this.traceLogger.sessionId);
    return spanId;
  }

  /**
   * End an action trace
   */
  async endAction(spanId, output = {}, metrics = {}, reflection = {}, status = 'success', error = null) {
    const entry = await this.traceLogger.endSpan(spanId, output, metrics, reflection, status, error);

    // Record metrics
    if (metrics.tokens_used) {
      this.metricsCollector.recordTokens(entry.agent, entry.action, metrics.tokens_used);
    }
    if (entry.duration_ms) {
      this.metricsCollector.recordLatency(entry.agent, entry.action, entry.duration_ms);
    }
    if (status === 'error' || error) {
      this.metricsCollector.recordError(entry.agent, entry.action, error?.type || 'unknown');
    }
    this.metricsCollector.recordAction(entry.agent, entry.action, status);

    // Audit log
    await this.auditLogger.logAgentAction(entry.agent, entry.action, { status }, {
      span_id: spanId,
      trace_id: entry.trace_id,
      session_id: entry.session_id,
    });

    // Save metrics periodically (every 10 actions)
    if (this.metricsCollector.metrics.actions.total % 10 === 0) {
      await this.metricsCollector.save();
    }

    return entry;
  }

  /**
   * Log a decision
   */
  async logDecision(agent, decision, context = {}) {
    await this.traceLogger.logDecision(agent, decision, context);
    await this.auditLogger.logDecision(agent, decision, context);
  }

  /**
   * Log story completion
   */
  async logStoryCompletion(storyId, status, details = {}) {
    return await this.auditLogger.logStoryCompletion(storyId, status, details);
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, details = {}) {
    return await this.auditLogger.logSecurityEvent(eventType, details);
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return this.metricsCollector.getSummary();
  }

  /**
   * Get session trace
   */
  async getSessionTrace(sessionId, date = null) {
    return await this.traceLogger.getSessionTrace(sessionId, date);
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(category, limit = 100) {
    return await this.auditLogger.getAuditTrail(category, limit);
  }

  /**
   * Save all metrics
   */
  async save() {
    await this.metricsCollector.save();
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.traceLogger.sessionId;
  }

  /**
   * Get current trace ID
   */
  getTraceId() {
    return this.traceLogger.traceId;
  }
}

// Singleton instance
let observabilityManager = null;

export function getObservabilityManager(logsDir = 'logs') {
  if (!observabilityManager) {
    observabilityManager = new ObservabilityManager(logsDir);
  }
  return observabilityManager;
}

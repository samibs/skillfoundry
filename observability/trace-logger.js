/**
 * Trace Logger - Structured logging for agent activities
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TraceLogger {
  constructor(logsDir = path.join(process.cwd(), 'logs')) {
    this.logsDir = logsDir;
    this.sessionId = this.generateSessionId();
    this.traceId = this.generateTraceId();
    this.spanCounter = 0;
    this.spans = new Map(); // Track span hierarchy
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateTraceId() {
    return `trace-${uuidv4()}`;
  }

  generateSpanId() {
    this.spanCounter += 1;
    return `span-${this.spanCounter.toString().padStart(3, '0')}`;
  }

  /**
   * Start a new trace span
   */
  async startSpan(agent, action, input = {}) {
    const spanId = this.generateSpanId();
    const entry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: this.traceId,
      span_id: spanId,
      parent_span_id: null,
      agent,
      action,
      input,
      status: 'started',
    };

    // Track span
    this.spans.set(spanId, entry);

    await this.writeTrace(entry);
    return spanId;
  }

  /**
   * End a trace span
   */
  async endSpan(spanId, output = {}, metrics = {}, reflection = {}, status = 'success', error = null) {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span ${spanId} not found`);
    }

    const entry = {
      ...span,
      timestamp: new Date().toISOString(),
      output,
      metrics,
      reflection,
      status,
      error,
      duration_ms: Date.now() - new Date(span.timestamp).getTime(),
    };

    await this.writeTrace(entry);
    this.spans.delete(spanId);
    return entry;
  }

  /**
   * Log a decision
   */
  async logDecision(agent, decision, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: this.traceId,
      type: 'decision',
      agent,
      decision,
      context,
    };

    await this.writeDecision(entry);
    return entry;
  }

  /**
   * Write trace entry to JSONL file
   */
  async writeTrace(entry) {
    const date = new Date().toISOString().split('T')[0];
    const traceDir = path.join(this.logsDir, 'traces', date);
    await fs.mkdir(traceDir, { recursive: true });

    const traceFile = path.join(traceDir, `session-${this.sessionId}.jsonl`);
    await fs.appendFile(traceFile, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /**
   * Write decision entry to JSONL file
   */
  async writeDecision(entry) {
    const date = new Date().toISOString().split('T')[0];
    const traceDir = path.join(this.logsDir, 'traces', date);
    await fs.mkdir(traceDir, { recursive: true });

    const decisionsFile = path.join(traceDir, 'decisions.jsonl');
    await fs.appendFile(decisionsFile, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /**
   * Get session trace
   */
  async getSessionTrace(sessionId, date = null) {
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    const traceFile = path.join(this.logsDir, 'traces', date, `session-${sessionId}.jsonl`);
    try {
      const content = await fs.readFile(traceFile, 'utf-8');
      return content.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

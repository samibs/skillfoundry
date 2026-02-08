# Observability & Tracing System - Implementation Guide

**Version**: 1.0  
**Status**: IMPLEMENTATION  
**Date**: January 25, 2026

---

## Overview

Phase 4 implements comprehensive observability and tracing for Claude AS Framework, enabling full visibility into agent activities, decisions, metrics, and performance.

---

## Architecture

```
logs/
├── traces/
│   ├── 2026-01-25/
│   │   ├── session-abc123.jsonl   # Full session trace
│   │   └── decisions.jsonl        # Key decisions
│   └── metrics.json               # Aggregated metrics
├── audit/
│   ├── story-completion.jsonl     # Story audit trail
│   └── security-events.jsonl      # Security-relevant events
└── dashboards/
    └── metrics-dashboard.html     # Visual dashboard
```

---

## Trace Entry Format

```json
{
  "timestamp": "2026-01-25T12:34:56Z",
  "session_id": "abc123",
  "trace_id": "trace-xyz789",
  "span_id": "span-001",
  "parent_span_id": null,
  "agent": "coder",
  "action": "implement_endpoint",
  "input": {
    "story_id": "STORY-003",
    "endpoint": "/api/v1/auth/refresh"
  },
  "output": {
    "files_created": ["src/routes/auth.py"],
    "lines_added": 45,
    "tests_generated": 3
  },
  "metrics": {
    "tokens_used": 2340,
    "latency_ms": 1250,
    "confidence_score": 0.85
  },
  "reflection": {
    "self_score": 8,
    "concerns": ["Edge case: expired refresh token not tested"]
  },
  "status": "success",
  "error": null
}
```

---

## Components

### 1. Trace Logger
- Structured logging to JSONL files
- Session-based trace organization
- Span-based distributed tracing
- Automatic trace ID generation

### 2. Metrics Collector
- Token usage tracking
- Latency measurement
- Error rate calculation
- Agent performance metrics

### 3. Audit Logger
- Story completion tracking
- Security event logging
- Decision logging
- Compliance audit trail

### 4. Trace Viewer
- Web-based trace visualization
- Session timeline view
- Agent activity filtering
- Metrics dashboard integration

---

## Implementation

### Trace Logger (`observability/trace-logger.js`)

```javascript
class TraceLogger {
  constructor(logsDir = 'logs') {
    this.logsDir = logsDir;
    this.sessionId = this.generateSessionId();
    this.traceId = this.generateTraceId();
    this.spanCounter = 0;
  }

  async log(action) {
    const entry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      trace_id: this.traceId,
      span_id: this.generateSpanId(),
      ...action
    };

    await this.writeTrace(entry);
    return entry.span_id;
  }

  async writeTrace(entry) {
    const date = new Date().toISOString().split('T')[0];
    const traceFile = path.join(this.logsDir, 'traces', date, `session-${this.sessionId}.jsonl`);
    await fs.mkdir(path.dirname(traceFile), { recursive: true });
    await fs.appendFile(traceFile, JSON.stringify(entry) + '\n');
  }
}
```

### Metrics Collector (`observability/metrics-collector.js`)

```javascript
class MetricsCollector {
  constructor() {
    this.metrics = {
      tokens: { total: 0, byAgent: {} },
      latency: { total: 0, count: 0, byAgent: {} },
      errors: { total: 0, byAgent: {}, byType: {} }
    };
  }

  recordTokens(agent, tokens) {
    this.metrics.tokens.total += tokens;
    this.metrics.tokens.byAgent[agent] = (this.metrics.tokens.byAgent[agent] || 0) + tokens;
  }

  recordLatency(agent, ms) {
    this.metrics.latency.total += ms;
    this.metrics.latency.count += 1;
    if (!this.metrics.latency.byAgent[agent]) {
      this.metrics.latency.byAgent[agent] = { total: 0, count: 0 };
    }
    this.metrics.latency.byAgent[agent].total += ms;
    this.metrics.latency.byAgent[agent].count += 1;
  }

  recordError(agent, errorType) {
    this.metrics.errors.total += 1;
    this.metrics.errors.byAgent[agent] = (this.metrics.errors.byAgent[agent] || 0) + 1;
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
  }

  async save() {
    const metricsFile = path.join('logs', 'traces', 'metrics.json');
    await fs.writeFile(metricsFile, JSON.stringify(this.metrics, null, 2));
  }
}
```

### Audit Logger (`observability/audit-logger.js`)

```javascript
class AuditLogger {
  async logStoryCompletion(storyId, status, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'story_completion',
      story_id: storyId,
      status,
      ...details
    };

    await this.writeAudit('story-completion', entry);
  }

  async logSecurityEvent(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'security_event',
      ...event
    };

    await this.writeAudit('security-events', entry);
  }

  async writeAudit(category, entry) {
    const auditFile = path.join('logs', 'audit', `${category}.jsonl`);
    await fs.mkdir(path.dirname(auditFile), { recursive: true });
    await fs.appendFile(auditFile, JSON.stringify(entry) + '\n');
  }
}
```

---

## Integration Points

### With Agents

All agents should:
1. **Start trace** when beginning an action
2. **Record metrics** during execution
3. **Log reflection** after completion
4. **End trace** with status

### With Dashboard

Dashboard should:
1. **Display traces** in timeline view
2. **Show metrics** in charts
3. **Filter by agent** or session
4. **Export traces** for analysis

---

## Usage

### In Agent Code

```javascript
const traceLogger = new TraceLogger();
const metricsCollector = new MetricsCollector();

// Start action
const spanId = await traceLogger.log({
  agent: 'coder',
  action: 'implement_endpoint',
  input: { story_id: 'STORY-003', endpoint: '/api/v1/auth/refresh' }
});

const startTime = Date.now();

// Execute action
try {
  const result = await implementEndpoint();
  
  // Record metrics
  metricsCollector.recordTokens('coder', result.tokensUsed);
  metricsCollector.recordLatency('coder', Date.now() - startTime);
  
  // Log completion
  await traceLogger.log({
    span_id: spanId,
    agent: 'coder',
    action: 'implement_endpoint',
    output: result,
    metrics: {
      tokens_used: result.tokensUsed,
      latency_ms: Date.now() - startTime
    },
    reflection: {
      self_score: 8,
      concerns: []
    },
    status: 'success'
  });
} catch (error) {
  metricsCollector.recordError('coder', error.type);
  await traceLogger.log({
    span_id: spanId,
    status: 'error',
    error: { message: error.message, type: error.type }
  });
}
```

---

## Benefits

1. **Full Visibility**: See exactly what agents are doing
2. **Performance Tracking**: Identify bottlenecks and slow operations
3. **Debugging**: Trace issues through complete execution flow
4. **Optimization**: Use metrics to improve agent performance
5. **Compliance**: Audit trail for security and compliance

---

**Last Updated**: January 25, 2026  
**Version**: 1.0

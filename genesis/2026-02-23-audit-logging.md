# PRD: Structured Audit Logging

---
prd_id: audit-logging
title: Structured Audit Logging with Rotation
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: []
  recommends: [session-persistence]
  blocks: []
  shared_with: [session-persistence]

tags: [observability, governance, ops]
priority: medium
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The current `timeline.log` uses a simple tab-separated text format with only 4 fields (timestamp, status, stage, message). There's no structured querying, no log rotation (unbounded growth), no tool-level audit trail, and no cost attribution per action. Compliance and debugging require structured, queryable logs.

### 1.2 Proposed Solution

Replace text logging with JSONL format: `{ timestamp, event, agent, command, toolName, toolInput, duration, inputTokens, outputTokens, costUsd, result, sessionId }`. Implement log rotation (10MB max per file, keep 5 files). Add `/audit` command to query and filter logs.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Log format | Text (4 fields) | JSONL (12+ fields) | File inspection |
| Log rotation | None (unbounded) | 10MB max, 5 files | File size monitoring |
| Queryability | grep only | /audit command with filters | UX testing |

---

## 2. Implementation Plan

| File | Change |
|------|--------|
| `src/utils/logger.ts` | Rewrite to JSONL format, add rotation logic |
| `src/commands/audit.ts` | NEW — /audit [today/last/filter] query interface |
| `src/hooks/useStream.ts` | Log tool executions with timing and cost |
| `src/commands/index.ts` | Register audit command |

### Effort: Small-Medium (2-3 hours)

---

## 3. Out of Scope

- External log shipping (Datadog, Splunk)
- Real-time log streaming to dashboard
- Log encryption

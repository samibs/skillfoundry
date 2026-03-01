# PRD: Session Persistence & Resume

---
prd_id: session-persistence
title: Session Persistence & Resume
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: [budget-enforcement]
  recommends: [skillfoundry-cli-platform]
  blocks: []
  shared_with: [audit-logging]

tags: [core, ux, reliability]
priority: medium
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

When the CLI exits (crash, Ctrl+C, or intentional quit), all conversation history is lost. The user must start fresh every session. The `recovery.resume_point` field exists in `SfState` but has no implementation. Long-running agent pipelines (forge, go, apply) that crash mid-execution cannot be resumed — all progress is lost.

### 1.2 Proposed Solution

Persist conversations to `.skillfoundry/sessions/<id>.jsonl`. Auto-resume the last session on `sf launch`. Add `/session save`, `/session load <id>`, `/session list`, and `/session clear` commands. Save checkpoints during plan/apply execution for crash recovery.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Session recovery after crash | 0% (all lost) | 100% (auto-resume) | Test: kill process, restart, verify history |
| Conversation persistence | None | Every message saved | Check .skillfoundry/sessions/ after session |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have my conversation saved automatically | I don't lose context on exit | MUST |
| US-002 | developer | resume my last session on restart | I can pick up where I left off | MUST |
| US-003 | developer | list and load previous sessions | I can revisit past conversations | SHOULD |
| US-004 | developer | have agent pipelines resume after crash | long operations don't need full restart | SHOULD |
| US-005 | developer | clear old sessions | I can manage disk usage | COULD |

---

## 3. Implementation Plan

| File | Change |
|------|--------|
| `src/core/session-store.ts` | NEW — JSONL session persistence, load/save/list/delete |
| `src/commands/session.ts` | NEW — /session save/load/list/clear commands |
| `src/hooks/useSession.ts` | Auto-save messages on state change, auto-load last session |
| `src/commands/index.ts` | Register session command |

### Effort: Medium (3-4 hours)

---

## 4. Out of Scope

- Cross-device session sync
- Session sharing between users
- Session encryption at rest

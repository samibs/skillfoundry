# PRD: Budget Enforcement & Cost Guardrails

---
prd_id: budget-enforcement
title: Budget Enforcement & Cost Guardrails
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: []
  recommends: [skillfoundry-cli-platform]
  blocks: []
  shared_with: [provider-fallback-retry]

tags: [core, cost, security, governance]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry CLI has a complete budget tracking system (`budget.ts`) with `checkBudget()`, `recordUsage()`, and monthly/per-run caps — but this logic is **never called** from the streaming pipeline or commands. Users can exceed their configured `monthly_budget_usd` and `run_budget_usd` with zero warning or enforcement. This violates the governance principle that SkillFoundry users (who pay for tokens) must have hard spending limits.

### 1.2 Proposed Solution

Wire `checkBudget()` into `useStream.ts` before every provider call and after every tool turn. Record usage after each response. Block new requests when budget is exceeded. Show remaining budget in the StatusBar. Add a `/cost reset` subcommand.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Budget enforcement rate | 0% (never checked) | 100% (every request) | Code audit: checkBudget calls |
| Over-budget detection | None | Immediate block | Test: exceed budget, verify blocked |
| Usage recording | Not wired | Every response | Test: send message, verify usage.json updated |

---

## 2. User Stories

### Primary User: Developer using sf CLI

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | see my remaining budget in the status bar | I know how much I've spent | MUST |
| US-002 | developer | be blocked when I exceed my monthly budget | I don't get surprise bills | MUST |
| US-003 | developer | be blocked when a single run exceeds per-run cap | runaway agents don't drain my wallet | MUST |
| US-004 | developer | see accumulated cost per response in metadata | I can optimize my usage | SHOULD |
| US-005 | developer | reset my monthly budget tracking | I can start fresh if needed | COULD |

---

## 3. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | Pre-request budget check | Given a user sends a message, When monthly budget is exceeded, Then the message is blocked with a clear error |
| FR-002 | Per-turn budget check | Given an agentic loop is running, When accumulated run cost exceeds run_budget_usd, Then the loop stops with a budget warning |
| FR-003 | Usage recording | Given a response is received, When tokens and cost are known, Then a usage entry is written to usage.json |
| FR-004 | StatusBar budget display | Given the CLI is running, When budget data is available, Then show remaining monthly budget in status bar |
| FR-005 | /cost reset command | Given a user runs /cost reset, When confirmed, Then monthly totals are cleared |

---

## 4. Implementation Plan

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useStream.ts` | Import checkBudget/recordUsage. Pre-check before provider calls. Record after response. Track run cost. |
| `src/components/StatusBar.tsx` | Add budget remaining display |
| `src/commands/cost.ts` | Add `reset` subcommand |
| `src/__tests__/budget.test.ts` | Add integration tests for enforcement |

### Effort: Small (1-2 hours)

---

## 5. Out of Scope

- Per-agent budget limits (future enhancement)
- Real-time cost streaming during generation
- Budget alerts via external notifications

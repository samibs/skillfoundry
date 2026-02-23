# PRD: Provider Fallback & Retry

---
prd_id: provider-fallback-retry
title: Provider Fallback & Retry with Exponential Backoff
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: []
  recommends: [skillfoundry-cli-platform]
  blocks: []
  shared_with: [budget-enforcement]

tags: [core, reliability, resilience]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The CLI has `fallback_provider` and `fallback_engine` configured in `config.toml` but these fields are **never referenced** in the streaming pipeline. When the primary provider fails (API timeout, rate limit, auth error), the user gets a hard error with no recovery. This makes the CLI fragile — a single provider outage stops all work.

### 1.2 Proposed Solution

Create a `retry.ts` module with exponential backoff (3 attempts, 1s/2s/4s delays). If all retries fail, automatically switch to `fallback_provider`. Report the fallback in message metadata so the user knows which provider served the response.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Recovery from transient errors | 0% (immediate fail) | 90%+ (3 retries) | Test: mock 429, verify retry |
| Fallback activation | Never | Automatic on primary failure | Test: mock primary fail, verify fallback used |
| Downtime from provider outages | Total (blocks CLI) | Minimal (auto-fallback) | Manual testing |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have transient API errors retried automatically | I don't lose my train of thought | MUST |
| US-002 | developer | have a fallback provider activate on primary failure | I can keep working during outages | MUST |
| US-003 | developer | see which provider actually served my response | I know when fallback was used | SHOULD |
| US-004 | developer | configure retry behavior | I can tune for my network conditions | COULD |

---

## 3. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | Exponential backoff retry | Given provider returns 429/500/503/timeout, When retried 3 times with 1s/2s/4s delays, Then succeed or fail definitively |
| FR-002 | Fallback provider switch | Given primary fails all retries AND fallback_provider is configured, When fallback is attempted, Then use fallback provider for the request |
| FR-003 | Fallback metadata | Given fallback was used, When response metadata is displayed, Then show `[fallback: provider_name]` |
| FR-004 | Non-retryable errors | Given provider returns 401 (auth error), When error is detected, Then fail immediately (no retry) |

---

## 4. Implementation Plan

| File | Change |
|------|--------|
| `src/core/retry.ts` | NEW — `withRetry(fn, options)` and `withFallback(primary, fallback, fn)` utilities |
| `src/hooks/useStream.ts` | Wrap provider.stream() and provider.streamWithTools() with retry/fallback |
| `src/types.ts` | Add `fallbackUsed?: string` to Message.metadata |
| `src/__tests__/retry.test.ts` | NEW — retry logic, backoff timing, fallback activation |

### Effort: Small-Medium (2-3 hours)

---

## 5. Out of Scope

- Circuit breaker pattern (future)
- Provider health monitoring dashboard
- Automatic provider quality ranking

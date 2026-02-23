# PRD: Multi-Provider Cost-Aware Routing

---
prd_id: multi-provider-routing
title: Multi-Provider Cost-Aware Routing
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: [provider-fallback-retry, budget-enforcement]
  recommends: []
  blocks: []
  shared_with: []

tags: [cost, optimization, core]
priority: low
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The CLI currently routes all requests to a single configured provider regardless of task complexity or cost. A simple "what is X?" question costs the same as a complex multi-tool agent task because it goes through the same provider/model. With 5 providers available and models ranging from $0.10/M to $10/M tokens, there's a 100x cost difference that's not exploited.

### 1.2 Proposed Solution

Create a smart router that considers intent classification (chat vs agent), agent category (NONE/INSPECT vs FULL), and model capabilities to route to the cheapest adequate provider. Simple queries → gpt-4o-mini or gemini-flash ($0.10-0.15/M). Complex agentic tasks → claude-sonnet or gpt-4o ($2.50-3/M). User configurable with `/config routing smart|fixed`.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Average cost per chat message | $0.0001 (gpt-4o-mini) | $0.0001 (maintained) | Usage tracking |
| Average cost per agent task | $0.01-0.05 | 30-50% reduction via routing | Usage comparison |
| Provider utilization | 1 provider | 2-3 providers per session | Audit logs |

---

## 2. Implementation Plan

| File | Change |
|------|--------|
| `src/core/router.ts` | NEW — Route selection logic based on intent + agent category + model capabilities |
| `src/core/provider.ts` | Add multi-provider pool with configured credentials |
| `src/hooks/useStream.ts` | Use router instead of single provider |
| `src/commands/config.ts` | Add `routing` config key (smart/fixed) |

### Effort: Medium-Large (4-6 hours)

---

## 3. Out of Scope

- Automatic model benchmarking
- Quality-based routing (response quality scoring)
- Provider-specific feature detection (vision, function calling support)

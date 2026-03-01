# PRD: Memory Recall Integration

---
prd_id: memory-recall-integration
title: Memory Recall Integration — Agents Learn from Project History
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: []
  recommends: [audit-logging, session-persistence]
  blocks: []
  shared_with: []

tags: [memory, intelligence, core]
priority: low
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry memory bank (`memory_bank/knowledge/`) stores decisions, errors, patterns, and agent stats in JSONL format — but this knowledge is **never injected** into agent prompts. Every session starts from scratch. Agents repeat past mistakes because they have no recall of previous corrections. The `/memory recall` command exists for manual querying, but agents don't use it automatically.

### 1.2 Proposed Solution

Before every agent response, query `memory_bank/` for relevant past entries (matching on tags, project name, agent name). Inject the top 3-5 relevant memories as system prompt context. This closes the loop on the autonomous-developer-loop PRD's knowledge persistence goal — agents now learn from project history.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Memory utilization in prompts | 0% | 100% of agent requests | Code audit |
| Repeated mistakes | Unknown | 50% reduction | Compare error patterns across sessions |
| Context enrichment | 0 memories per request | 3-5 relevant memories | Log memory injection count |

---

## 2. Implementation Plan

| File | Change |
|------|--------|
| `src/core/memory.ts` | Add `recallForAgent(agentName, topic, limit)` — returns formatted memory context |
| `src/core/agent-registry.ts` | Add `getAgentMemoryContext(name, workDir)` — combines system prompt + relevant memories |
| `src/hooks/useStream.ts` | Use enriched prompt that includes memory context |
| `src/__tests__/memory.test.ts` | Add recall integration tests |

### Effort: Medium (3-4 hours)

---

## 3. Out of Scope

- Semantic similarity search (vector embeddings)
- Cross-project memory sharing
- Memory pruning/TTL policies
- Real-time memory updates during conversation

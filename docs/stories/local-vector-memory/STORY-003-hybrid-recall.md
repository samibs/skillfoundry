# Story: STORY-003 Hybrid Recall: Keyword + Semantic Similarity

**PRD Reference:** 2026-05-05-local-vector-memory.md
**Priority:** MUST
**Phase:** 1
**Status:** TODO

---

## Context

### Why This Story Exists
This story integrates the vector system into the framework's memory recall logic. By combining keyword weights and semantic similarity, we get the best of both worlds: precision for known terms and breadth for related concepts.

### What Success Looks Like
The `LayeredRecall` service in `sf_cli/src/core/layered-recall.ts` uses both keyword matching and vector search to retrieve memory entries.

### Dependencies
- **Requires:** STORY-002
- **Blocks:** None

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Description |
|----|-------------|-------------|
| FR-001 | Hybrid Scoring | Combine keyword score (0-1) and vector similarity (0-1). |
| FR-002 | Recall Upgrade | Update `LayeredRecall.query()` to perform semantic lookup. |
| FR-003 | Auto-indexing | Automatically index new `memory_bank` entries during the harvest phase. |

---

## Expected Changes (Anvil T4)
- **Modify**: [`sf_cli/src/core/layered-recall.ts`, `sf_cli/src/core/memory-harvest.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Hybrid Recall

  Scenario: Semantic retrieval
    Given a memory entry about "Token rotation" exists
    When I search for "Security sessions"
    Then the "Token rotation" entry is returned due to semantic similarity
    Even if it doesn't contain the word "sessions"
```

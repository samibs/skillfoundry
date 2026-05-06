# Story: STORY-002 Local Vector Store (HNSW/Flat-file)

**PRD Reference:** 2026-05-05-local-vector-memory.md
**Priority:** MUST
**Phase:** 1
**Status:** TODO

---

## Context

### Why This Story Exists
Generating embeddings is not enough; we need to store them and perform fast similarity searches. This story implements the local storage and indexing of these vectors.

### What Success Looks Like
A `VectorStore` exists in `sf_cli/src/core/vector-store.ts` that can save vectors to disk (e.g., `vector.index`) and perform `k-nearest neighbor` (k-NN) search.

### Dependencies
- **Requires:** STORY-001
- **Blocks:** STORY-003

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Description |
|----|-------------|-------------|
| FR-001 | Vector Indexing | Add vectors to a local index associated with memory IDs. |
| FR-002 | Persistence | Save/Load the index from the filesystem. |
| FR-003 | Similarity Search | Perform Cosine Similarity search to find top K related items. |

---

## Expected Changes (Anvil T4)
- **Create**: [`sf_cli/src/core/vector-store.ts`, `sf_cli/src/core/__tests__/vector-store.test.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Local Vector Store

  Scenario: Index and search
    Given I have indexed 3 vectors
    When I search for a vector similar to the first one
    Then the search returns the first vector as the top result
    And the index is persisted to disk
```

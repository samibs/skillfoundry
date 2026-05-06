# Story: STORY-001 Implement Local Embedding Service (Transformers.js)

**PRD Reference:** 2026-05-05-local-vector-memory.md
**Priority:** MUST
**Phase:** 1
**Status:** TODO

---

## Context

### Why This Story Exists
We need a way to transform text (decisions, errors, patterns) into numerical vectors locally. This allows the framework to perform semantic search without relying on external APIs for every memory query.

### What Success Looks Like
An `EmbeddingService` exists in `sf_cli/src/core/embedding-service.ts` that can load a local model (e.g., Xenova/all-MiniLM-L6-v2) and generate embeddings for a given string.

### Dependencies
- **Requires:** None
- **Blocks:** STORY-002, STORY-003

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Description |
|----|-------------|-------------|
| FR-001 | Model Loading | Load Transformers.js model locally. |
| FR-002 | Text Embedding | Generate 384d vectors for input text. |
| FR-003 | Cache Integration | Use an LRU cache to avoid redundant embedding calls. |

### Technical Approach

#### Architecture
Use `@xenova/transformers` (Transformers.js) for local-first execution.

```
sf_cli/src/core/
└── embedding-service.ts (New)
```

#### Key Implementation Details
1. Install `@xenova/transformers` as a dependency.
2. Implement `embed(text: string): Promise<number[]>`.
3. Implement `embedBatch(texts: string[]): Promise<number[][]>`.

---

## Expected Changes (Anvil T4)
- **Modify**: [`sf_cli/package.json`]
- **Create**: [`sf_cli/src/core/embedding-service.ts`, `sf_cli/src/core/__tests__/embedding.test.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Local Embedding Service

  Scenario: Generate embedding
    Given the EmbeddingService is initialized
    When I call embed("user authentication")
    Then a vector of 384 dimensions is returned
    And the result is cached for subsequent calls
```

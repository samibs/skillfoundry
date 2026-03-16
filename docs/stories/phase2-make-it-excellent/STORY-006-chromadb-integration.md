# STORY-006: ChromaDB Local Integration

## Goal

Integrate ChromaDB as a local vector store for memory embeddings, providing similarity search with metadata filtering, automatic indexing of harvested memories, and collection lifecycle management.

## PRD Mapping

- FR-007 (ChromaDB Local Integration)

## Epic

6 — Semantic Memory System

## Effort

M (Medium) — ChromaDB client integration, adapter layer, index/rebuild logic

## Dependencies

- STORY-005 (Vector Embedding Service) — ChromaDB stores vectors produced by the embedding service

## Scope

### Files to Create

- `sf_cli/src/core/chroma-store.ts` — ChromaDB adapter with collection management
- `sf_cli/src/core/__tests__/chroma-store.test.ts` — Unit tests

### Files to Modify

- `sf_cli/src/core/layered-recall.ts` — Add semantic search mode that queries ChromaDB before TF-IDF
- `sf_cli/src/core/memory-harvest.ts` — After harvest, index new memories into ChromaDB
- `.gitignore` — Add `.sf/memory/chroma/` to exclusions

## Technical Approach

### ChromaDB Client Setup

```typescript
import { ChromaClient, Collection } from 'chromadb';

export interface ChromaStoreOptions {
  persistPath: string;    // Default: '.sf/memory/chroma'
  collectionName: string; // Default: 'sf-memories'
  maxResults: number;     // Default top-k: 10
}

export class ChromaStore {
  private client: ChromaClient;
  private collection: Collection | null;
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService, options?: Partial<ChromaStoreOptions>);

  async initialize(): Promise<void>;       // Create/open collection with correct dimensions
  async add(memories: MemoryDocument[]): Promise<void>;
  async search(query: string, topK?: number, filter?: MetadataFilter): Promise<SearchResult[]>;
  async delete(ids: string[]): Promise<void>;
  async rebuild(): Promise<void>;          // Drop and reindex from source JSONL files
  async getStats(): Promise<CollectionStats>;
  async close(): Promise<void>;
}
```

### Memory Document Schema

```typescript
export interface MemoryDocument {
  id: string;               // UUID — used as ChromaDB document ID
  text: string;             // The content to embed and search
  metadata: {
    source: string;         // File path or memory category
    scope: 'project' | 'framework' | 'global';
    tags: string[];
    timestamp: number;
    type: 'decision' | 'error' | 'pattern' | 'fact' | 'lesson';
  };
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: MemoryDocument['metadata'];
  score: number;            // Cosine similarity (0-1, higher = more similar)
  distance: number;         // Raw ChromaDB distance
}

export interface MetadataFilter {
  scope?: string;
  type?: string;
  tags?: string[];          // Any tag match (OR)
  since?: number;           // Timestamp floor
}

export interface CollectionStats {
  totalDocuments: number;
  dimensions: number;
  provider: string;         // Which embedding provider was used
  lastIndexedAt: number;
}
```

### Collection Lifecycle

1. **Initialize:** On first use, create a ChromaDB collection with dimensions matching the active embedding provider.
2. **Dimension mismatch detection:** If the stored collection has different dimensions than the current provider (e.g., switched from OpenAI to Ollama), log a warning and trigger rebuild.
3. **Add:** Embed text via EmbeddingService, then upsert into ChromaDB with metadata.
4. **Search:** Embed the query, then query ChromaDB for top-k nearest neighbors with optional metadata filter.
5. **Rebuild:** Drop collection, re-read all JSONL memory files from `memory_bank/` and `.sf/memory/`, re-embed and re-insert. This is the recovery path.

### Integration with Layered Recall

In `layered-recall.ts`, add a new search strategy:

```typescript
// Existing flow: keyword search with TF-IDF scoring
// New flow:
// 1. If ChromaDB is available, run semantic search first
// 2. Merge semantic results with TF-IDF results
// 3. Re-rank by weighted combination: (0.7 * semantic_score) + (0.3 * tfidf_score)
// 4. If ChromaDB is unavailable, fall back to TF-IDF only (existing behavior)
```

### Integration with Memory Harvest

In `memory-harvest.ts`, after writing a new memory entry to JSONL:
1. Embed the entry text
2. Upsert into ChromaDB
3. Log success/failure (never block harvest on ChromaDB failure)

### Storage Location

ChromaDB persistent storage goes in `.sf/memory/chroma/` (project-local). This directory is:
- Created automatically on first use
- Added to `.gitignore`
- Rebuildable from JSONL source files at any time

## Acceptance Criteria

```gherkin
Feature: ChromaDB Local Integration

  Scenario: Index memories and search by similarity
    Given 100 memory documents are indexed in ChromaDB
    When a similarity search for "user authentication flow" is executed with top-k=5
    Then the 5 most semantically similar results are returned
    And results include score and distance values
    And response time is under 200ms

  Scenario: Metadata filtering
    Given memories with scope "project" and "framework" are indexed
    When a search is executed with filter { scope: "project" }
    Then only project-scoped memories are returned

  Scenario: Automatic indexing on harvest
    Given a memory harvest produces a new entry
    When the harvest pipeline completes
    Then the new entry is automatically indexed in ChromaDB
    And subsequent searches can find the new entry

  Scenario: Dimension mismatch recovery
    Given ChromaDB was populated with 768-dim vectors (Ollama)
    And the active provider is now OpenAI (1536-dim)
    When ChromaStore.initialize() is called
    Then a warning is logged about dimension mismatch
    And a rebuild is triggered to re-embed with the current provider

  Scenario: ChromaDB unavailable fallback
    Given ChromaDB fails to initialize (corrupt data, missing dependency)
    When a search is executed via layered recall
    Then the search falls back to TF-IDF keyword matching
    And a warning is logged: "ChromaDB unavailable, using keyword search fallback"

  Scenario: Rebuild from source
    Given ChromaDB data is corrupted or deleted
    When rebuild() is called
    Then all JSONL memory files are re-read
    And all entries are re-embedded and re-indexed
    And the collection is fully functional after rebuild

  Scenario: Collection statistics
    Given 50 documents are indexed
    When getStats() is called
    Then totalDocuments is 50
    And dimensions matches the active embedding provider
    And lastIndexedAt is a valid timestamp
```

## Tests

- Unit: add() calls embedding service and inserts into ChromaDB (mock ChromaDB client)
- Unit: search() embeds query and returns ranked results (mock ChromaDB client)
- Unit: Metadata filter is passed through to ChromaDB query
- Unit: Dimension mismatch triggers rebuild
- Unit: Graceful fallback when ChromaDB is unavailable
- Unit: rebuild() reads JSONL files and re-indexes
- Unit: getStats() returns accurate collection info
- Unit: delete() removes documents by ID
- Integration: End-to-end add + search with real ChromaDB (in-memory mode for tests)
- Integration: Layered recall with semantic + TF-IDF merge and re-ranking

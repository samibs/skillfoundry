# STORY-005: Vector Embedding Service

## Goal

Implement an embedding service that converts text to dense vectors using Ollama nomic-embed-text locally, with automatic fallback to OpenAI text-embedding-3-small when Ollama is unavailable.

## PRD Mapping

- FR-006 (Vector Embedding Service)

## Epic

6 — Semantic Memory System

## Effort

M (Medium) — New module with two provider implementations and fallback logic

## Dependencies

- None (foundation story for Epic 6)

## Scope

### Files to Create

- `sf_cli/src/core/embedding-service.ts` — Embedding service with provider abstraction
- `sf_cli/src/core/__tests__/embedding-service.test.ts` — Unit tests

### Files to Modify

- `sf_cli/src/core/config.ts` — Add embedding configuration (provider preference, Ollama URL, model names)
- `sf_cli/src/types.ts` — Add embedding-related types

## Technical Approach

### Provider Abstraction

```typescript
export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[], batchSize?: number): Promise<number[][]>;
  isAvailable(): Promise<boolean>;
}

export interface EmbeddingServiceOptions {
  preferredProvider: 'ollama' | 'openai';  // Default: 'ollama'
  ollamaUrl: string;                        // Default: 'http://localhost:11434'
  ollamaModel: string;                      // Default: 'nomic-embed-text'
  openaiApiKey?: string;                    // From env: SF_OPENAI_API_KEY
  openaiModel: string;                      // Default: 'text-embedding-3-small'
  maxChunkLength: number;                   // Default: 8192 chars
  cacheTtlMs: number;                       // Default: 3600000 (1 hour)
}
```

### Ollama Provider

```typescript
class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions = 768;  // nomic-embed-text outputs 768-dim vectors

  async isAvailable(): Promise<boolean> {
    // GET http://localhost:11434/api/tags — check if model is listed
    // Timeout: 3000ms
  }

  async embed(text: string): Promise<number[]> {
    // POST http://localhost:11434/api/embeddings
    // Body: { model: 'nomic-embed-text', prompt: text }
    // Returns: { embedding: number[] }
  }

  async embedBatch(texts: string[], batchSize = 10): Promise<number[][]> {
    // Process in batches to avoid overwhelming Ollama
    // Sequential within batch (Ollama processes one at a time)
  }
}
```

### OpenAI Provider

```typescript
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;  // text-embedding-3-small outputs 1536-dim vectors

  async isAvailable(): Promise<boolean> {
    // Check SF_OPENAI_API_KEY is set and non-empty
  }

  async embed(text: string): Promise<number[]> {
    // POST https://api.openai.com/v1/embeddings
    // Body: { model: 'text-embedding-3-small', input: text }
    // Parse response.data[0].embedding
  }

  async embedBatch(texts: string[], batchSize = 100): Promise<number[][]> {
    // OpenAI supports batch input natively
    // POST with input: texts (up to 2048 items per request)
  }
}
```

### Fallback Logic

```typescript
export class EmbeddingService {
  private primary: EmbeddingProvider;
  private fallback: EmbeddingProvider | null;
  private cache: Map<string, { vector: number[]; expiresAt: number }>;

  async embed(text: string): Promise<EmbeddingResult> {
    // 1. Check cache (hash of text as key)
    // 2. Try primary provider
    // 3. If primary fails, log warning, try fallback
    // 4. If both fail, throw EmbeddingUnavailableError
    // 5. Cache result with TTL
    // Return: { vector: number[], provider: string, dimensions: number, cached: boolean }
  }

  async getActiveProvider(): Promise<EmbeddingProvider> {
    // Returns the currently available provider (for dimension awareness)
  }

  getDimensions(): number {
    // Returns dimensions of the active provider (needed by ChromaDB collection setup)
  }
}
```

### Text Preprocessing

Before embedding:
1. Trim whitespace
2. Truncate to `maxChunkLength` characters (with warning log if truncated)
3. Normalize Unicode (NFC)
4. No other transformations (preserve code, markdown, etc.)

### Caching

- In-memory LRU cache keyed by SHA-256 hash of normalized text
- Cache entries expire after `cacheTtlMs`
- Cache is not persisted across process restarts (ephemeral)
- Maximum cache size: 1000 entries (evict oldest on overflow)

### Dimension Handling

Ollama (768) and OpenAI (1536) produce different dimensions. The ChromaDB collection (STORY-006) must be configured for the active provider's dimensions. If the provider changes (e.g., Ollama becomes available after using OpenAI), the collection must be rebuilt. The embedding service exposes `getDimensions()` for this purpose.

## Acceptance Criteria

```gherkin
Feature: Vector Embedding Service

  Scenario: Ollama embedding (primary)
    Given Ollama is running locally with nomic-embed-text model
    When text "implement user authentication" is submitted for embedding
    Then a 768-dimension float array is returned
    And response time is under 500ms
    And the provider name in the result is "ollama"

  Scenario: OpenAI fallback
    Given Ollama is not running
    And SF_OPENAI_API_KEY is set
    When text is submitted for embedding
    Then a 1536-dimension float array is returned from OpenAI
    And response time is under 2000ms
    And a warning is logged: "Ollama unavailable, using OpenAI fallback"

  Scenario: Both providers unavailable
    Given Ollama is not running
    And SF_OPENAI_API_KEY is not set
    When text is submitted for embedding
    Then an EmbeddingUnavailableError is thrown
    And the error message lists both providers and their failure reasons

  Scenario: Cache hit
    Given text "user auth" was embedded 30 seconds ago
    When the same text is submitted again
    Then the cached vector is returned immediately
    And no network request is made
    And the result indicates cached: true

  Scenario: Cache expiry
    Given text "user auth" was embedded and cache TTL has expired
    When the same text is submitted again
    Then a fresh embedding is generated from the provider

  Scenario: Batch embedding
    Given 25 texts are submitted via embedBatch()
    When the batch is processed
    Then 25 embedding vectors are returned
    And processing respects the configured batch size

  Scenario: Text truncation
    Given text exceeding 8192 characters is submitted
    When the text is preprocessed
    Then it is truncated to 8192 characters
    And a warning is logged with the original and truncated lengths
```

## Tests

- Unit: OllamaProvider.embed() returns correct dimension vector (mock HTTP)
- Unit: OpenAIProvider.embed() returns correct dimension vector (mock HTTP)
- Unit: Fallback from Ollama to OpenAI on connection error
- Unit: EmbeddingUnavailableError when both providers fail
- Unit: Cache hit returns stored vector without network call
- Unit: Cache miss triggers provider call
- Unit: Cache eviction at max size
- Unit: Cache expiry after TTL
- Unit: Batch processing with correct batch sizes
- Unit: Text truncation at maxChunkLength
- Unit: getDimensions() returns active provider's dimensions
- Integration: Ollama availability check (requires running Ollama — skip in CI without Ollama)

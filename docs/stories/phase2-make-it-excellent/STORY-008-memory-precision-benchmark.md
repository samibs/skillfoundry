# STORY-008: Memory Precision Benchmark Suite

## Goal

Create a benchmark suite of 50 manually curated query/expected-result pairs to measure and track memory search precision, with a hard threshold of >0.75 and automated regression detection.

## PRD Mapping

- FR-009 (Precision Benchmark Suite)

## Epic

6 — Semantic Memory System

## Effort

M (Medium) — Benchmark design, 50 curated pairs, scoring harness, CI integration

## Dependencies

- STORY-006 (ChromaDB Local Integration) — Benchmark queries ChromaDB

## Scope

### Files to Create

- `sf_cli/src/core/__tests__/benchmarks/memory-precision.bench.ts` — Benchmark harness
- `sf_cli/src/core/__tests__/benchmarks/memory-precision-dataset.json` — 50 query/result pairs
- `sf_cli/src/core/__tests__/benchmarks/memory-corpus.json` — Seed corpus of ~200 memory documents

### Files to Modify

- `sf_cli/package.json` — Add `benchmark:memory` script

## Technical Approach

### Benchmark Dataset Structure

```json
{
  "version": "1.0",
  "description": "Memory precision benchmark — 50 query/expected-result pairs",
  "pairs": [
    {
      "id": "BP-001",
      "query": "how are user sessions managed",
      "expectedIds": ["mem-jwt-session", "mem-cookie-config", "mem-session-timeout"],
      "category": "authentication",
      "difficulty": "easy",
      "notes": "Should match session-related memories even without 'session' keyword"
    }
  ]
}
```

### Corpus Design

The seed corpus contains ~200 memory documents spanning these categories:

| Category | Count | Example Topics |
|----------|-------|----------------|
| Authentication & Sessions | 25 | JWT, OAuth, cookies, session lifecycle |
| Database & Migrations | 25 | Schema design, migrations, indexing |
| API Design | 25 | REST patterns, error handling, pagination |
| Security | 25 | Input validation, CORS, rate limiting |
| Testing | 25 | Unit tests, mocking, coverage |
| Architecture | 25 | Module structure, dependency injection |
| DevOps & CI/CD | 25 | Docker, pipelines, deployment |
| Error Handling & Logging | 25 | Logging patterns, error recovery |

### Benchmark Pairs by Difficulty

| Difficulty | Count | Description |
|------------|-------|-------------|
| Easy | 15 | Query keywords overlap significantly with expected memory text |
| Medium | 20 | Query uses synonyms or related concepts (e.g., "login" vs "authentication") |
| Hard | 15 | Query is abstract or requires multi-hop reasoning (e.g., "security best practices" matching specific patterns) |

### Scoring Algorithm

```typescript
function calculatePrecision(
  results: SearchResult[],
  expectedIds: string[],
  topK: number = 5,
): number {
  const topResults = results.slice(0, topK);
  const hits = topResults.filter(r => expectedIds.includes(r.id)).length;
  return hits / Math.min(topK, expectedIds.length);
}

// Overall precision = average precision across all 50 queries
// Pass threshold: overall precision > 0.75
// Per-query minimum: no query scores 0.0 (every query must find at least one relevant result)
```

### Benchmark Harness

```typescript
async function runPrecisionBenchmark(): Promise<BenchmarkReport> {
  // 1. Initialize ChromaDB with seed corpus (fresh collection per run)
  // 2. Index all 200 corpus documents
  // 3. For each of 50 query pairs:
  //    a. Run search with top-k=5
  //    b. Calculate precision for this query
  //    c. Record latency
  // 4. Calculate overall precision
  // 5. Generate report with per-query breakdown
  // 6. Fail if overall precision <= 0.75
  // 7. Fail if any query scores 0.0

  return {
    overallPrecision: number,
    passThreshold: 0.75,
    passed: boolean,
    perCategory: Record<string, number>,  // Precision per category
    perDifficulty: Record<string, number>, // Precision per difficulty level
    failures: Array<{ queryId: string; query: string; precision: number }>,
    totalLatencyMs: number,
    avgLatencyMs: number,
  };
}
```

### CI Integration

- Add `benchmark:memory` script to package.json: `vitest run --config vitest.bench.config.ts`
- Benchmark runs in CI only when memory-related files change (path filter)
- Benchmark results are logged as a CI artifact
- Precision regression (drop below 0.75) fails the CI job

### Regression Detection

- Previous benchmark results are stored in `sf_cli/src/core/__tests__/benchmarks/baseline.json`
- On each run, compare current precision to baseline
- If precision drops by more than 5 percentage points, emit a warning even if still above 0.75
- Baseline is updated manually (not automatically) to prevent slow drift acceptance

## Acceptance Criteria

```gherkin
Feature: Memory Precision Benchmark

  Scenario: Benchmark passes with current model
    Given the seed corpus is indexed in ChromaDB
    And the embedding service uses Ollama nomic-embed-text
    When the 50-query benchmark suite runs
    Then overall precision is > 0.75
    And no individual query scores 0.0
    And a detailed report is produced

  Scenario: Benchmark detects regression
    Given the baseline precision is 0.82
    And a model change drops precision to 0.71
    When the benchmark runs
    Then the test fails with message "Precision 0.71 below threshold 0.75"
    And the per-query breakdown identifies which queries degraded

  Scenario: Per-category precision breakdown
    Given the benchmark completes
    When the report is generated
    Then precision is reported per category (authentication, database, etc.)
    And precision is reported per difficulty level (easy, medium, hard)

  Scenario: Latency tracking
    Given the benchmark completes
    When the report is generated
    Then total and average latency per query are reported
    And average latency is under 500ms per query

  Scenario: Baseline comparison
    Given a baseline.json exists from a previous run
    When current precision drops by more than 5 points from baseline
    Then a regression warning is emitted even if precision is still above 0.75
```

## Tests

- Unit: Precision calculation with various hit/miss scenarios
- Unit: Report generation with per-category and per-difficulty breakdown
- Unit: Baseline comparison and regression detection
- Unit: Dataset validation (all 50 pairs have valid expectedIds referencing corpus)
- Integration: Full benchmark run with in-memory ChromaDB

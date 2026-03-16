# STORY-007: Memory Search CLI Command

## Goal

Implement `sf memory search "<query>"` CLI command that exposes the semantic memory system with layered recall modes, configurable result count, and formatted output.

## PRD Mapping

- FR-008 (Memory Search CLI)

## Epic

6 — Semantic Memory System

## Effort

S (Small) — CLI wrapper over existing layered-recall + ChromaDB integration

## Dependencies

- STORY-005 (Vector Embedding Service) — Provides embeddings for queries
- STORY-006 (ChromaDB Local Integration) — Provides semantic search backend

## Scope

### Files to Create

- `sf_cli/src/commands/memory-search.ts` — CLI command handler

### Files to Modify

- `sf_cli/src/commands/memory.ts` — Register `search` subcommand under existing `sf memory` command
- `sf_cli/src/commands/index.ts` — Ensure memory command tree is registered

## Technical Approach

### Command Interface

```
sf memory search "<query>" [--mode index|preview|full] [--top-k N] [--scope project|framework|global] [--json]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | `preview` | `index` = IDs and scores only; `preview` = first 200 chars + metadata; `full` = complete text |
| `--top-k` | `10` | Number of results to return (max: 50) |
| `--scope` | all | Filter by memory scope |
| `--json` | false | Output raw JSON instead of formatted text |

### Output Formats

**Preview mode (default):**

```
$ sf memory search "authentication flow"

  Memory Search: "authentication flow"
  Provider: ollama (nomic-embed-text) │ Results: 5 │ Latency: 142ms
  ───────────────────────────────────────────────────────────────

  1. [0.92] Login sequence with JWT refresh rotation
     Scope: project │ Type: decision │ 2026-03-10
     The login flow uses RS256 JWT with 15-minute access tokens and
     7-day refresh tokens. Refresh tokens rotate on each use...

  2. [0.87] Session persistence across browser tabs
     Scope: framework │ Type: pattern │ 2026-03-08
     Sessions are stored in HttpOnly cookies with SameSite=Strict.
     Cross-tab communication uses BroadcastChannel API...

  3. [0.81] OAuth2 provider integration
     Scope: project │ Type: decision │ 2026-03-05
     External OAuth2 providers (Google, GitHub) use authorization
     code flow with PKCE. Tokens are exchanged server-side...
```

**Index mode:**

```
  1. [0.92] mem-a1b2c3d4 │ Login sequence with JWT refresh rotation
  2. [0.87] mem-e5f6g7h8 │ Session persistence across browser tabs
  3. [0.81] mem-i9j0k1l2 │ OAuth2 provider integration
```

**JSON mode:**

```json
{
  "query": "authentication flow",
  "provider": "ollama",
  "model": "nomic-embed-text",
  "latency_ms": 142,
  "results": [
    {
      "id": "mem-a1b2c3d4",
      "score": 0.92,
      "text": "The login flow uses RS256 JWT...",
      "metadata": {
        "source": "memory_bank/decisions.jsonl",
        "scope": "project",
        "type": "decision",
        "tags": ["auth", "jwt"],
        "timestamp": 1741564800000
      }
    }
  ]
}
```

### Search Flow

1. Parse CLI arguments and validate
2. Initialize EmbeddingService and ChromaStore
3. Embed the query text
4. Search ChromaDB with top-k and optional scope filter
5. If ChromaDB is unavailable, fall back to TF-IDF via existing layered-recall
6. Format results according to `--mode`
7. Output to stdout (formatted or JSON)
8. Log query, result count, and latency

### Error States

| Condition | Behavior |
|-----------|----------|
| No query text provided | Print usage help and exit 1 |
| ChromaDB unavailable | Fall back to keyword search, print warning |
| No embedding providers available | Fall back to keyword search, print warning |
| Zero results | Print "No matching memories found." |
| ChromaDB empty (never indexed) | Print "Memory index is empty. Run `sf memory index` to build it." |

## Acceptance Criteria

```gherkin
Feature: Memory Search CLI

  Scenario: Semantic search with default settings
    Given memories are indexed in ChromaDB
    When `sf memory search "authentication flow"` is run
    Then output shows ranked results with similarity scores
    And results include semantically related memories (not just keyword matches)
    And header shows provider name and latency

  Scenario: Index mode output
    Given memories are indexed
    When `sf memory search "auth" --mode index` is run
    Then output shows only IDs, scores, and titles (one line per result)

  Scenario: Full mode output
    Given memories are indexed
    When `sf memory search "auth" --mode full` is run
    Then output shows complete memory text for each result

  Scenario: Top-k limiting
    Given 100 memories are indexed
    When `sf memory search "auth" --top-k 3` is run
    Then exactly 3 results are returned

  Scenario: Scope filtering
    Given project and framework memories are indexed
    When `sf memory search "auth" --scope project` is run
    Then only project-scoped memories appear in results

  Scenario: JSON output
    Given memories are indexed
    When `sf memory search "auth" --json` is run
    Then output is valid JSON matching the expected schema
    And contains query, provider, latency_ms, and results array

  Scenario: Fallback to keyword search
    Given ChromaDB is unavailable
    When `sf memory search "auth"` is run
    Then results come from TF-IDF keyword search
    And a warning is printed: "ChromaDB unavailable, using keyword search"

  Scenario: Empty results
    Given no memories match the query
    When `sf memory search "quantum computing"` is run
    Then output shows "No matching memories found."
```

## Tests

- Unit: Command argument parsing (query, mode, top-k, scope, json)
- Unit: Preview mode formatting (truncation, metadata display)
- Unit: Index mode formatting (single-line per result)
- Unit: JSON output schema validation
- Unit: Fallback behavior when ChromaDB is unavailable
- Unit: Error message for empty query
- Unit: Top-k clamping (max 50)
- Integration: End-to-end search with indexed memories

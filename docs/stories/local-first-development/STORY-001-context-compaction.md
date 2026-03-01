# STORY-001: Context Compaction Engine

## Requirements (FR-001 through FR-004)

Implement a context compaction engine that adapts conversation context to fit within
a local model's context window. Supports token estimation, system prompt compression,
message sliding window, and optional summary injection.

## Technical Approach

- New file: `sf_cli/src/core/compaction.ts`
- Token estimation using conservative 3.5 chars-per-token ratio
- Context window defaults for 20+ known models (cloud + local)
- System prompt compression: strip code blocks, examples, tables, whitespace
- Sliding window: keep first user message + last N turns that fit
- Summary injection: prepend "[N earlier messages omitted...]" when pruning

## Acceptance Criteria

- Given a 6K system prompt targeting a 4K model, the prompt is compressed to <2K
- Given 50 conversation turns on an 8K model, only the last 4-6 turns are sent
- Given pruning occurs, a summary message is injected between first message and tail
- Token estimation is within 20% of actual for English text

## Files

| File | Action |
|------|--------|
| `sf_cli/src/core/compaction.ts` | NEW (290 lines) |
| `sf_cli/src/__tests__/compaction.test.ts` | NEW (20 tests) |

## Status: DONE

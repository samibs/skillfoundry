# STORY-003: Task Complexity Classifier & Local-First Routing

## Requirements (FR-005 through FR-008)

Implement keyword-based task classification and automatic provider routing.
Simple tasks route to local models (free), complex tasks to cloud (paid).
Integrate compaction and health checks into the agentic loop.

## Technical Approach

- New file: `sf_cli/src/core/task-classifier.ts`
- `classifyTask()`: keyword-based simple/complex classification (no LLM call)
- SIMPLE_KEYWORDS: docstring, format, explain, readme, changelog, etc.
- COMPLEX_KEYWORDS: architect, security, refactor, implement, test, etc.
- Default: complex (safer — cloud handles ambiguous tasks)
- `selectProvider()`: combines classification + health to pick provider
- Integration: `ai-runner.ts` applies compaction for local providers
- New config fields: `route_local_first`, `local_provider`, `local_model`, `context_window`
- Cost command: shows local vs cloud token breakdown with estimated savings

## Acceptance Criteria

- Given "add a docstring", classified as simple → routes to local
- Given "refactor the auth module", classified as complex → routes to cloud
- Given both simple and complex keywords, defaults to complex (safety)
- Given no keywords match, defaults to complex
- Given routing disabled, always uses cloud
- `/cost` shows local vs cloud breakdown when both have been used

## Files

| File | Action |
|------|--------|
| `sf_cli/src/core/task-classifier.ts` | NEW (180 lines) |
| `sf_cli/src/__tests__/task-classifier.test.ts` | NEW (17 tests) |
| `sf_cli/src/core/ai-runner.ts` | MODIFIED (compaction integration) |
| `sf_cli/src/core/config.ts` | MODIFIED (new config fields) |
| `sf_cli/src/types.ts` | MODIFIED (SfConfig extended) |
| `sf_cli/src/commands/cost.ts` | MODIFIED (local/cloud breakdown) |

## Status: DONE

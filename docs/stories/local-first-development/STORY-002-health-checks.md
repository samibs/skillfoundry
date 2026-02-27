# STORY-002: Provider Health Checks

## Requirements (FR-009 through FR-011)

Implement health checks for local provider endpoints. Ping localhost before first
request, cache results for 60 seconds, and gracefully fall back to cloud provider
when local is offline.

## Technical Approach

- New file: `sf_cli/src/core/health-check.ts`
- `pingProvider()`: HTTP GET to base URL with 500ms timeout
- Cached results with 60s TTL (avoids per-turn latency)
- `resolveProvider()`: returns cloud fallback with warning if local is down
- `listLocalModels()`: queries /v1/models endpoint
- `isLocalProvider()` / `getLocalBaseUrl()` helpers

## Acceptance Criteria

- Given LM Studio running on localhost:1234, health check returns true
- Given Ollama not running, health check returns false within 500ms
- Given local is offline with fallback configured, resolveProvider returns cloud provider
- Given no fallback, resolveProvider returns warning with start instructions
- Health check result is cached for 60 seconds

## Files

| File | Action |
|------|--------|
| `sf_cli/src/core/health-check.ts` | NEW (170 lines) |
| `sf_cli/src/__tests__/health-check.test.ts` | NEW (11 tests) |

## Status: DONE

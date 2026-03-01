# Local-First Development — Story Index

PRD: `genesis/2026-02-27-local-first-development.md`
Status: IMPLEMENTED (v2.0.12)

## Stories

| Story | Title | Status | Dependencies |
|-------|-------|--------|-------------|
| STORY-001 | Context compaction engine | DONE | None |
| STORY-002 | Provider health checks | DONE | None |
| STORY-003 | Task complexity classifier & local-first routing | DONE | STORY-001, STORY-002 |

## Dependency Graph

```
STORY-001 (compaction) ─┐
                        ├──► STORY-003 (routing + integration)
STORY-002 (health)    ─┘
```

## Implementation Summary

- **3 new modules**: `compaction.ts`, `health-check.ts`, `task-classifier.ts`
- **4 modified files**: `ai-runner.ts`, `config.ts`, `types.ts`, `cost.ts`
- **3 new test files**: 48 new test cases, 308 total passing
- **0 regressions**: All 260 pre-existing tests still pass

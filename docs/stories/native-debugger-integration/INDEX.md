# Native Debugger Integration — Story Index

**PRD:** `genesis/2026-03-12-native-debugger-integration.md`
**Version:** 2.0.39
**Status:** COMPLETE (Phase 1 — Node.js)

## Stories

| Story | Title | Status | Dependencies |
|-------|-------|--------|--------------|
| STORY-001 | CDP Protocol Adapter | DONE | — |
| STORY-002 | Debug Session Manager | DONE | STORY-001 |
| STORY-003 | Tool Definitions & Executor | DONE | STORY-002 |
| STORY-004 | Framework Integration | DONE | STORY-003 |
| STORY-005 | Security Hardening | DONE | STORY-004 |
| STORY-006 | Tests & Validation | DONE | STORY-005 |

## Dependency Graph

```
STORY-001 (CDP Adapter)
    └── STORY-002 (Session Manager)
        └── STORY-003 (Tool Definitions)
            └── STORY-004 (Framework Integration)
                └── STORY-005 (Security Hardening)
                    └── STORY-006 (Tests)
```

## Architecture

```
AI Agent calls debug_start tool
    ↓
debugger-tools.ts (executor routing)
    ↓
debugger.ts (session manager — singleton, spawn, timeout)
    ↓
debugger-cdp.ts (CDP adapter — WebSocket to V8 inspector)
    ↓
node --inspect-brk=0 <file> (child process)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/core/debugger-cdp.ts` | Chrome DevTools Protocol adapter with MinimalWebSocket |
| `src/core/debugger.ts` | Debug session lifecycle, process spawning, cleanup |
| `src/core/debugger-tools.ts` | 6 tool definitions + executeDebugTool() routing |
| `src/core/executor.ts` | Modified — async debug tool routing |
| `src/core/ai-runner.ts` | Modified — await Promise.resolve() for async tools |
| `src/core/agent-registry.ts` | Modified — DEBUG tool category |
| `src/core/tools.ts` | Modified — re-exports debug tools |
| `src/utils/logger.ts` | Modified — 'debugger' LogCategory |
| `src/__tests__/debugger.test.ts` | 18 unit tests |
| `.claude/commands/debug.md` | /debug skill definition |

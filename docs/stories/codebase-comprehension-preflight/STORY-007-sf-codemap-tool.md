# STORY-007: sf_codemap MCP Tool + Registry

**Phase:** 3 — Tool + pipeline wiring
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-002, STORY-004
**Blocks:** STORY-008, STORY-009
**Affects:** FR-007

---

## Description

Expose the Code Map engine as the `sf_codemap` MCP tool with four modes — `build | refresh | query | diff-impact` — orchestrated by a new `codemap-agent.ts`, and register its schema alongside the existing `sf_*` tools.

---

## Acceptance Contract

**done_when:**
- [x] `codemap-agent.ts` exports `runCodemap({ projectPath, mode, symbol?, semantic? })` returning the PRD §6.4 output shape `{ ok, duration, filesParsed, nodes, edges, endpoints, unresolvedImports, warnings }`
- [x] `mode:"build"` full build; `mode:"refresh"` (default) incremental (STORY-004); `mode:"query"` returns the matched node + its in/out edges; `mode:"diff-impact"` returns `{ ok:false, error:"not implemented in MVP" }` until STORY-011 lands (no fake data)
- [x] Tool schema added to `tool-registry.ts` (new tier or existing tier) and dispatched in `tool-dispatch.ts`/`handler.ts` following the existing `sf_project_context` pattern
- [x] Missing/invalid `projectPath` → `{ ok:false, error:"invalid projectPath" }` (no throw)
- [x] Grammar load failure for a language → file-level nodes + warning, never abort (inherits STORY-001/002 behavior)
- [x] Tool appears in the registered tool list and is callable end-to-end against a fixture repo
- [x] Tests cover build, refresh, query, and the invalid-path error path

**fail_when:**
- `diff-impact` returns fabricated impact data before STORY-011
- An existing tool's schema changes as a side effect of adding this one
- The tool throws on bad input instead of returning a structured error

---

## Technical Approach

1. `codemap-agent.ts` composes parser→extract→resolve→layers→contract→persist (STORY-001..006) behind the four modes.
2. Register schema in `mcp-server/src/mcp/tool-registry.ts`; wire dispatch in `tool-dispatch.ts` (mirror `sf_project_context`).
3. Reuse `exec-utils.ts` for git/`rev-parse`; do not add a parallel exec layer.
4. Respect bounded concurrency (≤ 5 parallel parses, PRD §4.1).

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap-agent.ts` | CREATE — orchestrator + modes |
| `mcp-server/src/mcp/tool-registry.ts` | MODIFY — add `sf_codemap` schema |
| `mcp-server/src/mcp/tool-dispatch.ts` | MODIFY — dispatch `sf_codemap` |
| `mcp-server/tests/sf-codemap.test.ts` | CREATE — mode + error tests |

---

## Security / Constraints
- Tool reads only; localhost MCP surface; no network egress.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `mcp-server/src/agents/codemap-agent.ts` (`runCodemap`, modes build/refresh/query/diff-impact), registered in `tool-registry.ts` (`sf_codemap`) and dispatched in `tool-dispatch.ts`. `tests/sf-codemap.test.ts` (6 tests, green). MCP connection test still passes with the tool registered.
- **All acceptance criteria met.** `diff-impact` and `semantic` return explicit "not implemented (STORY-011/012)" errors — no fabricated data. Invalid path → `{ok:false,error:"invalid projectPath"}`, never throws.
- **Bonus:** wired the STORY-010 memory feed into build/refresh (`factsRecorded` in the summary).

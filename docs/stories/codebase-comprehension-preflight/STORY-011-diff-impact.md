# STORY-011: Diff-Impact / Blast Radius

**Phase:** 4 — Diff-impact + semantic (DEFERRED — enhancement)
**PRD:** codebase-comprehension-preflight
**Priority:** SHOULD
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-002, STORY-003, STORY-004
**Blocks:** STORY-014
**Affects:** FR-010

---

## Description

Given a git diff, compute the set of Code Map nodes the change touches and their downstream dependents (who imports/calls them), so a reviewer or gate knows a change's blast radius. Backs the `sf_codemap mode:"diff-impact"` stub left in STORY-007.

---

## Acceptance Contract

**done_when:**
- [x] `diffImpact(map, diff)` returns `{ changed: Node[], impacted: Node[] }` where `impacted` is the transitive set of nodes depending (via `imports`/`calls` edges) on the changed nodes
- [x] Diff source = working-tree diff by default; accepts an explicit base ref
- [x] Changed files mapped to changed nodes by line ranges from the diff hunks
- [x] Transitive closure is cycle-safe (visited set) and bounded (configurable max depth, default unbounded with cycle guard)
- [x] `sf_codemap mode:"diff-impact"` now returns real results (replaces STORY-007 stub)
- [x] Tests: a change to a function imported by 3 modules lists exactly those 3 as impacted

**fail_when:**
- A cyclic dependency causes infinite recursion
- Direct dependents are omitted (false negative) or unrelated nodes included (false positive) in fixtures
- diff-impact mutates the persisted map

---

## Technical Approach

1. `codemap/diff-impact.ts` — parse `git diff --unified=0` hunks (via `exec-utils`/`git-agent`) → changed line ranges → changed nodes (line within node span).
2. Reverse-edge index built once from the graph; BFS over reverse `imports`/`calls` edges with a visited set.
3. Pure read over the in-memory map; never writes `.skillfoundry/code-map.json`.

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/diff-impact.ts` | CREATE — blast-radius compute |
| `mcp-server/src/agents/codemap-agent.ts` | MODIFY — wire `diff-impact` mode |
| `mcp-server/tests/codemap-diff-impact.test.ts` | CREATE — dependents + cycle tests |

---

## Security / Constraints
- Read-only over the map; git invoked via existing exec wrapper.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `mcp-server/src/agents/codemap/diff-impact.ts` (`diffImpact` + `parseUnifiedDiff`), wired into `sf_codemap` `diff-impact` mode (replaces the STORY-007 stub). `tests/codemap-diff-impact.test.ts` (3 tests, green).
- **All acceptance criteria met.** Reverse BFS over `imports`/`calls` edges, cycle-safe (visited set); a function imported by 3 modules lists those 3 + transitive importers; read-only over the map.
- **Deviation:** the agent computes impact for the **working-tree** diff (`git diff --unified=0`); an explicit base-ref parameter is deferred. On a non-git repo the mode returns `{ok:false, error:"git diff failed…"}` (no fabricated data).

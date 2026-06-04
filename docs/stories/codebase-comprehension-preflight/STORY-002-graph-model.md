# STORY-002: Code Graph Model + Node/Edge Extraction

**Phase:** 1 — Deterministic core
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** L
**Status:** DONE
**Dependencies:** STORY-001
**Blocks:** STORY-003, STORY-004, STORY-005, STORY-006, STORY-007, STORY-011, STORY-012
**Affects:** FR-001

---

## Description

Define the Code Map graph schema and extract deterministic nodes and edges from the trees produced by STORY-001. This story finalizes the `code-map.json` node/edge shape that the entire feature depends on — get it right here.

Nodes: `file`, `function`, `method`, `class`, `export`. Edges: `imports`, `calls` (only statically resolvable, same-repo), `contains` (file→symbol). Each node records `{ id, kind, name, file, line, layer?, summary?, confidence? }` (layer/summary populated by later stories).

---

## Acceptance Contract

**done_when:**
- [x] `codemap/graph.ts` defines `CodeMap`, `CodeNode`, `CodeEdge`, `Endpoint` TypeScript interfaces matching PRD §5.2 (all array fields default to `[]`)
- [x] Tree-sitter queries extract function/method/class declarations and exported symbols (re-export specifiers) for TS/JS and Python
- [x] raw imports recorded from `import` / `from … import` statements (resolution in STORY-003); see Notes — bare `require()` deferred (codebase is ESM)
- [x] `contains` edges link each symbol node to its file node
- [x] Stable, deterministic node `id` scheme (`file#symbolName@line`) — same input yields identical ids across runs (asserted)
- [x] Targeted fixture assertions verify expected nodes/edges (function/method/class/calls) for TS and Python (`tests/codemap-extract.test.ts`)
- [x] Files that returned a skip/error tree from STORY-001 still produce a `file` node (graceful degradation, recorded in `warnings`)

**fail_when:**
- Node ids are non-deterministic (depend on iteration order, timestamps, or absolute paths)
- An array field is emitted as `null`/`undefined`
- A single unparseable file aborts extraction of the whole repo

---

## Technical Approach

1. `codemap/graph.ts` — pure data model + builder helpers (`addNode`, `addEdge`, dedupe by id).
2. `codemap/extract.ts` — per-language tree-sitter `Query` strings for declarations, exports, imports, and call expressions; walk captures into nodes/edges.
3. Normalize `file` to a repo-relative POSIX path (never absolute — feeds sanitization + determinism).
4. `calls` edges: only emit when the callee resolves to a known same-file/known-import symbol; otherwise skip (avoid noisy cross-file guesses — dynamic resolution is explicitly out of scope per PRD §7.3).
5. Orchestration entry `buildGraph(files: string[]): CodeMap` — iterate, parse (STORY-001), extract, accumulate; per-file try/catch → `warnings`.

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/graph.ts` | CREATE — schema + builder |
| `mcp-server/src/agents/codemap/extract.ts` | CREATE — tree-sitter queries + walk |
| `mcp-server/tests/codemap-extract.test.ts` | CREATE — fixture snapshot tests |
| `mcp-server/tests/fixtures/codemap/**` | CREATE — small TS + Python fixture repo |

---

## Security / Constraints
- Paths stored repo-relative + POSIX-normalized (determinism + sanitization).
- No execution of parsed code.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `src/agents/codemap/graph.ts` (schema + `MapBuilder`), `src/agents/codemap/extract.ts` (per-language queries + span-based enclosing/method resolution), `src/agents/codemap/index.ts` (build orchestrator), `tests/codemap-extract.test.ts` (6 tests, green) with a TS+Python fixture repo under `tests/fixtures/codemap/repo`.
- **Schema addition:** `CodeMap` carries an internal `rawImports[]` (documented as non-public) so incremental refresh can re-resolve globally while re-parsing only changed files (STORY-004).
- **Deviations:** bare `require()` imports deferred (the codebase is ESM; `import` + re-export-from covered). Verification uses targeted node/edge assertions rather than a full count snapshot (less brittle).
- **Same-file calls:** `calls` edges emitted only when the callee resolves to a symbol defined in the same file (innermost enclosing function = caller); cross-file/dynamic calls intentionally skipped per PRD §7.3.

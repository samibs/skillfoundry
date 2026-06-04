# STORY-006: DB/Model Nodes + Layer Heuristics

**Phase:** 2 — Contract & layer extraction
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-002, STORY-004
**Blocks:** STORY-010
**Affects:** FR-004

---

## Description

Locate schema/model declarations and tag every source node with a coarse architectural layer. Gives gates and the dashboard a db/backend/frontend/shared view and lets `layer-check` reason about which layer a change touches.

ORMs/schemas: Prisma (`schema.prisma` models), Drizzle (`pgTable`/`sqliteTable`), SQLAlchemy (`Base` subclasses / `Table`), TypeORM (`@Entity`), Mongoose (`new Schema`). Each becomes a `model` node with its declared fields where statically derivable.

---

## Acceptance Contract

**done_when:**
- [x] Each detected model is a `model` node with `name`, source `file`, and field list (name + declared type) where parseable
- [x] Prisma `schema.prisma` parsed by a dedicated block parser (not tree-sitter), with fields
- [x] Every file node gets a `layer` ∈ {`db`,`backend`,`frontend`,`shared`} via path + import heuristics; layers propagate to symbol/model nodes
- [x] Layer assignment is deterministic and covers 100% of file nodes (defaults to `shared`)
- [x] Detection is path-relative so it composes with monorepo sub-projects (see Notes — uses repo-relative paths; explicit `detectSubProjects` partitioning deferred to the agent wiring)
- [x] Tests: Prisma + Drizzle + React/Next-route-handler layer tags asserted (`tests/codemap-layers.test.ts`)

**fail_when:**
- A file node is left without a `layer`
- A clearly-frontend file (imports `react`) is tagged `backend` or vice-versa in fixtures
- Layer assignment depends on filesystem iteration order (non-deterministic)

---

## Technical Approach

1. `codemap/layers.ts` — `assignLayer(fileNode, imports, path)` rule cascade; pure + table-driven so rules are reviewable.
2. `codemap/models.ts` — per-ORM extractors; Prisma via a small block parser (not tree-sitter), others via tree-sitter queries from STORY-002.
3. Reuse DB/ORM detection already in `project-context-agent.ts`; this story adds node-level granularity, it does not re-detect the stack.

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/layers.ts` | CREATE — layer heuristics |
| `mcp-server/src/agents/codemap/models.ts` | CREATE — ORM/schema extractors |
| `mcp-server/src/agents/codemap/graph.ts` | MODIFY — `model` node kind + `layer` field |
| `mcp-server/tests/codemap-layers.test.ts` | CREATE — Prisma/Drizzle/React fixtures |

---

## Security / Constraints
- Schema files parsed as text/AST; no migration execution, no DB connection.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `src/agents/codemap/layers.ts` (deterministic table-driven cascade, 100% file coverage, propagates to symbols) and `src/agents/codemap/models.ts` (Prisma block parser + tree-based Drizzle/Mongoose/TypeORM/SQLAlchemy detection), wired into `index.ts` `finalizePasses`. `tests/codemap-layers.test.ts` (4 tests, green).
- **`.prisma` change detection:** `hashableFiles()` now includes `.prisma`, so editing a schema triggers an incremental refresh; Prisma models are re-scanned wholesale each build (cheap).
- **CodeNode gained `fields?`** for model field lists (Prisma + Drizzle populate it; ORMs detected without field parsing leave it empty).
- **Deviations (deferred):** Mongoose/TypeORM/SQLAlchemy models are detected (node + edge) but field extraction is best-effort/empty for them; explicit `detectSubProjects` partitioning is deferred to the `sf_codemap` agent (STORY-007) — layer logic is already path-relative so it composes cleanly.

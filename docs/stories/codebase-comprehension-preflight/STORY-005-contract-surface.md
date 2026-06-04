# STORY-005: API Contract Surface → endpoints[]

**Phase:** 2 — Contract & layer extraction
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** L
**Status:** DONE
**Dependencies:** STORY-002, STORY-003
**Blocks:** STORY-009, STORY-010
**Affects:** FR-002

---

## Description

Extract the declared API contract surface from the graph: every backend route becomes an `Endpoint` node `{ method, path, handler, requestShape?, responseShape? }`. This is the artifact `sf_contract_check` consumes (STORY-009) to catch the framework's #1 failure — frontend/backend contract mismatch — before code is written.

Supported declarations (v1.0): Express/Fastify/Hono (`app.get/post/...`, router methods), Next.js route handlers (`app/**/route.ts` exported `GET/POST/...`) and API routes (`pages/api/**`), NestJS controllers (`@Controller`/`@Get`/`@Post` decorators), FastAPI (`@app.get`/`@router.post` + Pydantic models), Flask (`@app.route`), Django (`urls.py` patterns). Anything not statically derivable is recorded with `requestShape: null` rather than guessed.

---

## Acceptance Contract

**done_when:**
- [x] `contract-extract.ts` produces `endpoints[]` entries with `method`, `path` (+ `file`), and the resolved `handler` node id, linked by a `declares-route` edge
- [x] Request shape derived where statically present: FastAPI Pydantic param model → `{model:"Name"}` (see Notes — zod/TS-type/NestJS-DTO derivation deferred)
- [x] Underivable shapes set to `null` (never fabricated) — verified by test
- [x] Path params normalized to canonical `:param` (handles `{id}`, `[id]`, `[...slug]`, `:id`)
- [x] Fixtures for Express, Next route handler, and FastAPI produce expected endpoint nodes (`tests/codemap-contract.test.ts`)
- [x] No endpoint duplicated when two heuristics match the same route (deduped by method+path+file+handler)

**fail_when:**
- A request/response shape is invented when not statically present
- A declared route is missed for a supported framework in the fixtures
- Path-param style mismatch causes the same route to appear twice

---

## Technical Approach

1. `codemap/contract-extract.ts` — per-framework tree-sitter queries keyed off framework detection from `project-context-agent.ts` (reuse, don't re-detect).
2. Shape derivation is best-effort and layered: explicit schema lib (zod/Pydantic/class-validator) → TS types → `null`.
3. Canonicalize paths to `:param` internally; record the original verbatim too.
4. Run as a post-pass over the graph (needs handler nodes from STORY-002 and resolved imports from STORY-003 to follow DTO/model references).

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/contract-extract.ts` | CREATE — route + shape extraction |
| `mcp-server/src/agents/codemap/graph.ts` | MODIFY — `endpoints[]` + `declares-route` edge |
| `mcp-server/tests/codemap-contract.test.ts` | CREATE — Express/Next/FastAPI fixtures |

---

## Security / Constraints
- Static extraction only; no server boot, no route introspection at runtime.
- Shapes are facts from source — when absent, `null`, never an assumed shape (PRD Frontend-Backend Contract Rule).

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `src/agents/codemap/contract-extract.ts`, integrated into `index.ts` (`addFile`), `tests/codemap-contract.test.ts` (5 tests, green) with Express/FastAPI/Next fixtures. `Endpoint` gained a `file` field (enables incremental carry + dashboard).
- **Frameworks covered:** Express/Fastify/Hono/Koa-router (`app/router.<method>("/path", handler)`), Next.js App Router (`route.ts` exported `GET/POST/...`, path derived from `app/**` dir), FastAPI/Flask decorators (`@app.get` / `@app.route(..., methods=[...])`), NestJS controllers (best-effort).
- **Deviations (deferred):** **Django `urls.py`** not yet parsed; **zod / TypeScript-param-type / NestJS-DTO** request-shape derivation deferred — only FastAPI Pydantic param models yield a shape today; everything else is `null` (never fabricated, per the contract rule). Recorded for a follow-up.
- **Handler linking:** resolved to the same-file symbol node when the handler is a named function; inline/anonymous handlers leave `handler: null` (no `declares-route` edge).

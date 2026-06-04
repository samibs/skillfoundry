# Stories Index: Codebase Comprehension Pre-Flight (Code Map)

**PRD:** `genesis/2026-06-04-codebase-comprehension-preflight.md`
**Total Stories:** 14 (across 5 phases)
**MVP:** Phases 1–3 (STORY-001 … STORY-010) — the actual pre-flight value
**Enhancement:** Phases 4–5 (STORY-011 … STORY-014) — diff-impact, semantic labels, dashboard
**Status:** ✅ **ALL 14 STORIES DONE & tested** (61 new tests green, full suite 123/123, tsc clean). Full feature: tree-sitter engine → `sf_codemap` (build/refresh/query/diff-impact + optional semantic) → wired into `/forge`/`/go` IGNITE → feeds `sf_contract_check`/`sf_import_validator` → memory feed → headless dashboard (loopback API + Code Map explorer UI). Deferred follow-ups tracked in each story's notes + `.claude/state.json`.

---

## Dependency Graph

```
Phase 1 — Deterministic core
  STORY-001 (tree-sitter loader + WASM grammars: TS/JS, Python)
      │
      ▼
  STORY-002 (graph model + node/edge extraction: fn/class/import/export)
      │
      ├───────────────┬───────────────┐
      ▼               ▼               │
  STORY-003        STORY-004          │
  (import graph    (persistence +     │
   resolution)     incremental hash)  │
      │               │               │
Phase 2 — Contract & layer            │
      │               │               │
      └──────┬────────┘               │
             ▼                        ▼
        STORY-005 (API contract     STORY-006 (DB/model nodes
         surface → endpoints[])      + layer heuristics)
             │                        │
Phase 3 — Tool + pipeline wiring      │
             └──────────┬─────────────┘
                        ▼
                   STORY-007 (sf_codemap MCP tool + registry)  ◄─ needs 002, 004
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   STORY-008        STORY-009        STORY-010
   (/preflight      (IGNITE auto-     (memory_bank feed,
    command +        wire + contract/  sanitized code-map
    platform         import-validator  entries)  ◄─ needs 005,006
    mirroring)       handoff) ◄─ needs 005

Phase 4 — Diff-impact + semantic (DEFERRED)
   STORY-011 (diff-impact / blast radius)   ◄─ needs 002,003,004
   STORY-012 (optional LLM semantic labels) ◄─ needs 002

Phase 5 — Dashboard (DEFERRED)
   STORY-013 (dashboard /api/codemap routes) ◄─ needs 004
   STORY-014 (graph explorer + diff overlay) ◄─ needs 013, 011
```

## Execution Waves

| Wave | Stories | Notes |
|------|---------|-------|
| 1 | STORY-001 | Foundation — grammar loader |
| 2 | STORY-002 | Graph model (blocks everything) |
| 3 | STORY-003, STORY-004 | Parallel — import graph + persistence |
| 4 | STORY-005, STORY-006 | Parallel — contract surface + layers |
| 5 | STORY-007 | sf_codemap tool |
| 6 | STORY-008, STORY-009, STORY-010 | Parallel — command, pipeline wiring, memory feed |
| 7 (deferred) | STORY-011, STORY-012 | Diff-impact + semantic |
| 8 (deferred) | STORY-013, STORY-014 | Dashboard |

---

## Story Catalog

> All catalog entries below now have full story files (done_when / fail_when / technical approach / files affected).

### Phase 1 — Deterministic core (✅ DONE)
| ID | Title | Effort | Deps | FRs | Status |
|----|-------|--------|------|-----|--------|
| STORY-001 | tree-sitter loader + WASM grammars (TS/JS, Python) | M | — | FR-001 | ✅ DONE |
| STORY-002 | Code graph model + node/edge extraction | L | 001 | FR-001 | ✅ DONE |
| STORY-003 | Import graph resolution + unresolvedImports | M | 002 | FR-003 | ✅ DONE |
| STORY-004 | Map persistence + incremental hashing | M | 002 | FR-005 | ✅ DONE |

### Phase 2 — Contract & layer extraction (✅ DONE)
| ID | Title | Effort | Deps | FRs | Status |
|----|-------|--------|------|-----|--------|
| STORY-005 | API contract surface → `endpoints[]` (Express/Fastify/Hono/Next/NestJS, FastAPI/Flask) | L | 002,003 | FR-002 | ✅ DONE (Django + deep shapes deferred) |
| STORY-006 | DB/model nodes + coarse layer heuristics (db/backend/frontend/shared) | M | 002,004 | FR-004 | ✅ DONE |

### Phase 3 — Tool + pipeline wiring (✅ DONE)
| ID | Title | Effort | Deps | FRs | Status |
|----|-------|--------|------|-----|--------|
| STORY-007 | `sf_codemap` MCP tool (build/refresh/query/diff-impact) + registry entry | M | 002,004 | FR-007 | ✅ DONE |
| STORY-008 | `/preflight` command + `_codemap-preflight-protocol.md` + platform mirroring | S | 007 | FR-009 | ✅ DONE (mirroring deferred to install) |
| STORY-009 | IGNITE auto-wiring in `/forge` & `/go` + contract/import-validator handoff | M | 005,007 | FR-008 | ✅ DONE |
| STORY-010 | memory_bank feed (sanitized `code-map`-tagged entries) | S | 005,006 | FR-011 | ✅ DONE (in-code sanitizer) |

### Phase 4 — Diff-impact + semantic (✅ DONE)
| ID | Title | Effort | Deps | FRs | Status |
|----|-------|--------|------|-----|--------|
| STORY-011 | Diff-impact / blast-radius compute | M | 002,003,004 | FR-010 | ✅ DONE |
| STORY-012 | Optional LLM semantic labels (`confidence:"llm-hint"`, off by default) | M | 002 | FR-006 | ✅ DONE (domain label + cost-router deferred) |

### Phase 5 — Dashboard (✅ DONE)
| ID | Title | Effort | Deps | FRs | Status |
|----|-------|--------|------|-----|--------|
| STORY-013 | Dashboard `/api/codemap` + `/api/codemap/diff-impact` (localhost-only) | M | 004 | FR-012 | ✅ DONE |
| STORY-014 | Graph explorer UI + diff-impact overlay (shared responsive layout) | L | 013,011 | FR-012 | ✅ DONE (layer-column layout) |

---

## Build Health Baseline (run before STORY-001)
- `cd mcp-server && npx tsc --noEmit` and the project build must be green (or pre-existing errors logged) before execution.

## Notes
- New heavy dependency (`web-tree-sitter` + grammar wasm) lands in STORY-001 — gate via `npm ci` green check (Risk R-001).
- Stories 005–014 are intentionally enumerated, not fully detailed: their technical approach depends on the graph schema finalized in STORY-002. Expand them after Phase 1.

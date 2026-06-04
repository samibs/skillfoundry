# Codebase Comprehension Pre-Flight Protocol

> **Run before implementing or refactoring against an existing codebase.**
> Sibling to `_env-preflight-protocol.md`: that one pre-flights the *environment*,
> this one pre-flights the *code*.

This protocol prevents the framework's #1 failure class — the **Frontend-Backend
Contract Mismatch** — by giving agents a structural model of the code *before* they
write. It is backed by the `sf_codemap` MCP tool (engine: `mcp-server/src/agents/codemap/`).

---

## When to Run

- **Auto** — in `/forge` and `/go` Phase 1 (IGNITE), after the environment pre-flight.
- **Manual** — `/preflight` (alias `/codemap`) for ad-hoc inspection.
- **Always refresh** when switching projects or after a context compaction.

It is **advisory**: a code-map failure or timeout logs a warning and never blocks a run.

## What It Produces

A cached `.skillfoundry/code-map.json` containing:

| Field | Use |
|-------|-----|
| `nodes` / `edges` | structure: files, functions, classes, imports, same-file calls |
| `endpoints[]` | API contract surface → **baseline for `sf_contract_check`** |
| `unresolvedImports[]` | → **baseline for `sf_import_validator`** |
| `model` nodes + `layer` tags | DB/layer map → informs `/layer-check` |
| `builtFromRevision` + `fileHashes` | incremental refresh (cheap re-runs) |

## Handoff to the Gates

```
Phase 1 (IGNITE):
  1. env pre-flight (interpreter, deps, .env)        [_env-preflight-protocol.md]
  2. sf_codemap { mode: "refresh" }                  ← build/refresh the Code Map
  3. sf_contract_check with { endpoints } baseline   ← fewer false orphans, real shapes
     sf_import_validator with { unresolvedImports }  ← AST-accurate import errors
```

Both gates **no-op gracefully** when no map/baseline is present — the pre-flight is
additive, never a hard dependency.

## Authority & Freshness Rules

- The map is a **hint**. It does **not** satisfy Three-Layer "REAL logic" verification —
  always read the actual code for that.
- LLM semantic labels (STORY-012, when added) carry `confidence:"llm-hint"` and are
  excluded from gate verdicts.
- A stale map misleads: prefer `refresh` (incremental, hash-keyed) every run; check
  `builtFromRevision` if a result looks wrong.

## Scope (MVP)

- Languages: TS/JS + Python (others → file-level nodes only).
- Contract frameworks: Express/Fastify/Hono/Next/NestJS/FastAPI/Flask. (Django `urls.py` deferred.)
- `diff-impact` and `semantic` modes are not yet implemented (STORY-011/012) — they
  return an explicit error rather than fabricated data.

---

*Code ignorance is the root of contract-mismatch regressions. Map first, write second.*

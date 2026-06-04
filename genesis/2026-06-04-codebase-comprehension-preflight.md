---
prd_id: codebase-comprehension-preflight
title: Codebase Comprehension Pre-Flight (Code Map)
version: "1.0"
status: COMPLETED
created: 2026-06-04
author: SBS + PRD Architect
last_updated: 2026-06-04
priority: high
layers: [backend, infrastructure, frontend, documentation]
tags: [preflight, tree-sitter, code-map, knowledge-graph, contract-check, onboarding]
dependencies:
  requires: []
  recommends: [deployment-preflight-gate, passive-memory-engine]
  blocks: []
  shared_with: [correctness-contracts]
---

# PRD: Codebase Comprehension Pre-Flight (Code Map)

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry pre-flights the **environment** (`agents/_env-preflight-protocol.md`: interpreter, deps, `.env`) but never the **codebase itself**. Before an agent writes a single line, it has no structural model of the code it is about to change — no call graph, no map of the existing API contract surface, no import graph, no layer/DB map. The existing `sf_project_context` agent stops at metadata (framework, DB type, ORM, ports, env vars); it does not parse source.

This is the root of our single most expensive failure class. Per `CLAUDE.md` the #1 vibe-coding failure is the **Frontend-Backend Contract Mismatch**: an agent invents an endpoint shape because it never read the real backend. Reactive gates (`sf_contract_check`, `sf_import_validator`, `sf_deviation_enforcer`) catch these *after* the code is written and a build/test cycle is burned. There is no proactive map that would have prevented the mistake.

The community tool *Understand-Anything* (MIT, Lum1104) proves the engine: tree-sitter for deterministic structure + LLM agents for semantic labels, emitting a committed `knowledge-graph.json` and a dashboard. It is built for human onboarding (tours, personas, 7-language UI). We need the same engine re-aimed at **machine consumption by our pipeline and gates**, with the human dashboard as a secondary onboarding surface.

**Current state:** Each `/forge` / `/go` run reasons about existing code blind, re-discovering structure ad hoc per session, and repeats cross-app mistakes because nothing carries structural facts into `memory_bank/`.

**Impact:** Every agent (and the human reviewing it) on every one of the ~49 tracked projects. Wasted build/test cycles, contract-mismatch regressions, slow onboarding to unfamiliar repos.

### 1.2 Proposed Solution

Add a **Codebase Comprehension Pre-Flight** that builds a structured, incremental **Code Map** of the target repository and feeds it to the pipeline before implementation.

1. **Deterministic core (tree-sitter):** parse source into a precise graph — files, functions, classes, imports, exported symbols, route/endpoint declarations, DB schema/model declarations. Per-language grammars (TS/JS, Python to start).
2. **Semantic layer (LLM, optional):** plain-English summaries and architectural-layer / business-domain labels on top of the deterministic facts. Labels are *hints*, explicitly non-authoritative.
3. **Incremental refresh:** the full graph is built once and cached at `.skillfoundry/code-map.json`; subsequent runs refresh only files changed since the last `git` revision recorded in the map.
4. **Pipeline wiring (auto):** runs in `/forge` & `/go` Phase 1 (IGNITE) alongside env pre-flight; the contract surface and import graph are handed to `sf_contract_check` and `sf_import_validator` as a baseline.
5. **Manual surface:** a new `sf_codemap` MCP tool and a `/preflight` (a.k.a. `/codemap`) command for on-demand build/query.
6. **Memory feed:** structural facts and detected contract surfaces are written to `memory_bank/` so a contract bug fixed in one app warns the other tracked apps.
7. **Visual dashboard:** an interactive graph explorer served by the existing `dashboard/` stack, for human onboarding and diff-impact review.

### 1.3 Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Contract-mismatch regressions caught before build | 0 (caught post-build) | ≥80% caught at pre-flight | Count of `sf_contract_check` failures pre- vs post-codemap, sampled over 20 runs |
| Incremental refresh time on a warm cache | n/a | < 3s for ≤ 25 changed files | `sf_codemap` reported `duration` |
| Cold full-build time | n/a | < 30s for a 50k-LOC repo | `sf_codemap` reported `duration` |
| Cross-app structural facts in memory_bank | 0 | ≥1 per analyzed repo | `memory_bank/knowledge` entries tagged `code-map` |
| Onboarding: agent reads real endpoint before frontend call | not enforced | enforced via map handoff | Pipeline log shows code-map consulted in Phase 1 |

---

## 2. User Stories

### Primary User: AI Developer Agent

| ID | As a... | I want to... | So that... | Priority | FR-IDs |
|----|---------|--------------|------------|----------|--------|
| US-001 | Developer/Agent | Get a structural code map before implementing | I read the real call/contract surface instead of guessing | MUST | FR-001, FR-002 |
| US-002 | Developer/Agent | Have the map refresh incrementally on git diff | Pre-flight stays cheap on every run | MUST | FR-005 |
| US-003 | Developer/Agent | Have the contract surface fed to `sf_contract_check` | Frontend-backend mismatches are caught before build | MUST | FR-002, FR-008 |
| US-004 | Developer/Agent | Run the map automatically in `/forge` & `/go` Phase 1 | Comprehension is automatic, not opt-in | MUST | FR-008 |
| US-005 | Developer/Agent | Query the map on demand (`sf_codemap` / `/preflight`) | I can inspect structure for ad-hoc tasks | SHOULD | FR-007, FR-009 |
| US-006 | Developer/Agent | See blast-radius of a diff against the map | I know which components a change touches | SHOULD | FR-010 |

### Secondary Users

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-007 | Human developer | Open an interactive graph dashboard | I onboard to an unfamiliar repo quickly | SHOULD |
| US-008 | Framework maintainer | Have structural facts written to memory_bank | A fix in one app prevents the bug in every app | SHOULD |
| US-009 | Human reviewer | View diff-impact overlay before approving | I focus review on affected components | COULD |

---

## 3. Functional Requirements

### FR-001: Deterministic Structure Extraction (tree-sitter)
Parse the repo with tree-sitter grammars (TS/JS and Python in v1.0) into nodes (file, function, class, method, exported symbol) and edges (imports, calls where statically resolvable, declares-route, declares-model). Non-supported languages degrade gracefully to file-level nodes only.
**Acceptance:** Given a TS repo with an Express route `app.post('/users', ...)`, when the map builds, then an `endpoint` node `POST /users` exists linked to its handler function.

### FR-002: API Contract Surface
Extract the declared contract surface — endpoint path, HTTP method, and (where statically derivable) request/response shape — for Express/Fastify/Hono/Next route handlers, NestJS controllers, and FastAPI/Flask/Django routes.
**Acceptance:** Given a FastAPI route with a Pydantic request model, when the map builds, then the endpoint node records method, path, and the request schema field names/types.

### FR-003: Import & Dependency Graph
Build a resolvable import graph (module → module) and flag unresolved imports.
**Acceptance:** Given an import of a non-existent local module, when the map builds, then it is recorded under `unresolvedImports` (consumable by `sf_import_validator`).

### FR-004: DB / Layer Map
Locate schema/model declarations (Prisma schema, Drizzle, SQLAlchemy, TypeORM, Mongoose) and assign each source node a coarse architectural layer (db / backend / frontend / shared) using path + import heuristics.
**Acceptance:** Given a Prisma schema, when the map builds, then each model is a `model` node and files importing `@prisma/client` are layer-tagged `backend`.

### FR-005: Incremental Refresh
Persist the map at `.skillfoundry/code-map.json` with the git revision and per-file content hashes it was built from. On rebuild, re-parse only files whose hash changed since the recorded revision; preserve unchanged nodes.
**Acceptance:** Given a warm cache and one changed file, when the map refreshes, then only that file is re-parsed and `duration` < 3s for ≤ 25 changed files.

### FR-006: Semantic Labels (LLM, optional, non-authoritative)
When enabled, an LLM agent adds plain-English node summaries and domain/layer labels on top of deterministic facts. Disabled by default in CI/offline mode. Output is marked `confidence: "llm-hint"` and MUST NOT satisfy Three-Layer "REAL logic" verification.
**Acceptance:** Given `--semantic` enabled, when the map builds, then function nodes carry a `summary` string flagged as an LLM hint; given semantic disabled, then no LLM call is made.

### FR-007: `sf_codemap` MCP Tool
Register an `sf_codemap` tool (build | refresh | query | diff-impact subcommands) in `mcp-server/src/mcp/tool-registry.ts` with a backing agent in `mcp-server/src/agents/`.
**Acceptance:** Calling `sf_codemap` with `{projectPath, mode:"build"}` returns the map summary JSON; `{mode:"query", symbol:"X"}` returns that node and its edges.

### FR-008: Pipeline Auto-Wiring
`/forge` and `/go` Phase 1 invoke the pre-flight after env pre-flight; the contract surface + import graph are passed to `sf_contract_check` / `sf_import_validator` as baseline input.
**Acceptance:** Given a `/forge` run, when Phase 1 completes, then the run log records "code-map built/refreshed" and the contract baseline handoff.

### FR-009: `/preflight` Command
Add `.claude/commands/preflight.md` (and the `agents/` protocol doc) so the map can be built/queried manually, mirrored to the other platform command dirs by the existing converters.
**Acceptance:** Running `/preflight` on a repo prints a structural summary (file/function/endpoint counts, unresolved imports, layer breakdown).

### FR-010: Diff-Impact (blast radius)
Given a git diff, compute the set of map nodes touched and their downstream dependents.
**Acceptance:** Given a change to a function imported by 3 modules, when diff-impact runs, then those 3 modules are listed as impacted.

### FR-011: Memory Feed
Write detected contract surfaces and notable structural facts to `memory_bank/knowledge/` tagged `code-map`, sanitized of secrets/paths per `scripts/sanitize-knowledge.sh`.
**Acceptance:** After a build, at least one sanitized `code-map`-tagged entry exists in `memory_bank/knowledge/`.

### FR-012: Visual Dashboard
Serve an interactive node/edge explorer with search and a diff-impact overlay, reusing the existing `dashboard/` (server + client) stack and reading `.skillfoundry/code-map.json`.
**Acceptance:** Launching the dashboard renders the graph, supports symbol search, and toggles a diff-impact overlay against the working tree.

### 3.2 User Interface Requirements
- Dashboard MUST use the framework's shared layout (single `max-width` container, mobile 320 / tablet 768 / desktop 1200+, no horizontal scroll) per `CLAUDE.md` UI rules.
- All list/array response fields default to `[]`, never `null`/`undefined`.

### 3.3 API Requirements (dashboard server)
| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/codemap` | GET | Return the current `.skillfoundry/code-map.json` | localhost-only |
| `/api/codemap/diff-impact` | GET | Return impacted nodes for the current working-tree diff | localhost-only |

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Cold build < 30s for 50k LOC; warm incremental < 3s for ≤ 25 changed files.
- Bounded concurrency on file parsing (cap workers, default ≤ 5) to match existing agent conventions.

### 4.2 Security
- Dashboard server binds to `127.0.0.1` only; no remote exposure by default.
- Map artifact and any memory_bank entries are sanitized (no secrets, normalized paths) via `scripts/sanitize-knowledge.sh`.
- No code execution: tree-sitter parses, never `eval`/imports target code.
- LLM semantic pass is opt-in and never sends `.env` values or file contents flagged secret.

### 4.3 Scalability
- Monorepo aware: reuse `detectSubProjects` from `project-context-agent.ts`; map is partitioned per sub-project.
- Graphs > 10MB stored with Git-LFS guidance (mirrors Understand-Anything) or kept local-only via `.gitignore`.

### 4.4 Reliability
- Build failure on one file degrades that file to a file-level node + warning; never aborts the whole map.
- Map schema is versioned; a version mismatch triggers a clean rebuild rather than a crash.

### 4.5 Observability
- `sf_codemap` returns `{ duration, filesParsed, nodes, edges, warnings }`.
- Pipeline logs record build vs refresh and node/edge deltas.

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment
- **tree-sitter** + `web-tree-sitter` / node bindings and per-language grammars (`tree-sitter-typescript`, `tree-sitter-python`): mature, widely deployed (this is the engine Understand-Anything and many editors use). Native binding is the one new heavy dependency; `web-tree-sitter` (WASM) is the fallback to avoid native-build friction. **Decision: prefer WASM grammars to keep `npm ci` portable; gate the native binding behind an optional install.**
- Dashboard stack already present in `dashboard/` — no new framework.

### 5.1 Architecture
```
mcp-server/src/agents/codemap-agent.ts        # orchestrates parse → graph → (semantic) → persist
mcp-server/src/agents/codemap/
  ├─ parser.ts          # tree-sitter load + per-language queries
  ├─ contract-extract.ts# route/endpoint + request/response shape extraction
  ├─ graph.ts           # node/edge model, incremental merge, hashing
  ├─ layers.ts          # layer/DB heuristics
  └─ semantic.ts        # optional LLM labeling
mcp-server/src/mcp/tool-registry.ts           # + sf_codemap schema
.claude/commands/preflight.md                 # /preflight command (mirrored to other platforms)
agents/_codemap-preflight-protocol.md          # protocol doc, referenced from CLAUDE.md
dashboard/ (extend)                            # /api/codemap routes + graph view
```
Reuses, does not duplicate: `project-context-agent.ts` (metadata), `exec-utils.ts`, `sanitize-knowledge.sh`, `detectSubProjects`.

### 5.2 Data Model
`.skillfoundry/code-map.json`:
```jsonc
{
  "schemaVersion": "1.0",
  "builtFromRevision": "<git sha>",
  "fileHashes": { "src/x.ts": "<sha256>" },
  "nodes": [ /* {id, kind, name, file, line, layer, summary?, confidence?} */ ],
  "edges": [ /* {from, to, kind} kind: imports|calls|declares-route|declares-model */ ],
  "endpoints": [ /* {method, path, handler, requestShape?, responseShape?} */ ],
  "unresolvedImports": [],
  "warnings": []
}
```

### 5.3 Dependencies
- `web-tree-sitter` (WASM) + grammar wasm files for TS/JS, Python. Native `tree-sitter` bindings optional.
- No change to runtime Node engine (`>=20`).

### 5.6 Integration Points
- **`sf_contract_check`** — consumes `endpoints[]` as the authoritative backend surface.
- **`sf_import_validator`** — consumes `unresolvedImports[]`.
- **`/forge`, `/go` IGNITE** — auto build/refresh; `_env-preflight-protocol.md` sequence extended with a "Phase 0.5: Codebase comprehension".
- **`memory_bank/`** — FR-011 feed via passive-memory engine.

---

## 6. Contract Specification

### 6.4 API Contract (`sf_codemap` tool)
```jsonc
// input
{ "projectPath": "string (required)",
  "mode": "build|refresh|query|diff-impact (default refresh)",
  "symbol": "string (mode=query)",
  "semantic": "boolean (default false)" }
// output (mode=build|refresh)
{ "ok": true, "duration": 1234, "filesParsed": 42,
  "nodes": 1500, "edges": 3200, "endpoints": 37,
  "unresolvedImports": [], "warnings": [] }
```

### 6.5 Error Codes
| Condition | Result |
|-----------|--------|
| `projectPath` missing/not a dir | `{ ok:false, error:"invalid projectPath" }` |
| Not a git repo (incremental requested) | Falls back to full build + warning |
| Grammar load failure for a language | File-level nodes only + warning, never abort |

### 6.6 UI States (dashboard)
Loading, empty (no map yet → prompt to run `/preflight`), error (stale/corrupt map → offer rebuild), success (graph rendered).

---

## 7. Constraints & Assumptions

### 7.1 Constraints
- Must not add a mandatory native build step to `npm ci` (WASM-first).
- Map artifact + memory entries must pass `sanitize-knowledge.sh`.
- Semantic labels are non-authoritative and cannot satisfy Three-Layer verification.

### 7.2 Assumptions
- Target repos are git repositories (incremental mode); non-git repos still get full builds.
- TS/JS + Python cover the bulk of tracked apps for v1.0; other languages get file-level nodes.

### 7.3 Out of Scope
- Languages beyond TS/JS/Python in v1.0 (Go, Rust, Java, C# deferred).
- Runtime/dynamic call-graph tracing (static analysis only).
- Auto-fixing detected mismatches (the map informs gates; gates/agents act).
- Multi-language UI, persona-adaptive views, guided "tours" from Understand-Anything (human-onboarding extras, deferred).
- Replacing `sf_project_context` (the map complements it, does not replace metadata detection).

---

## 8. Regression Surface
- `/forge` & `/go` Phase 1 timing (added pre-flight step) — must stay within performance budget or run async/non-blocking.
- `sf_contract_check` / `sf_import_validator` behavior when fed a baseline — must remain correct when no map exists (graceful no-op).
- `dashboard/` server — new routes must not break existing dashboard pages.
- `tool-registry.ts` — adding a tool must not alter existing tool schemas.

---

## 9. Risks & Mitigations
| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-001 | tree-sitter native build breaks `npm ci` on some hosts | MEDIUM | HIGH | WASM grammars first; native binding optional/lazy |
| R-002 | Stale map misleads agents | MEDIUM | HIGH | Incremental hash check every run; auto-rebuild on schema/version mismatch; `builtFromRevision` shown |
| R-003 | LLM semantic labels treated as authoritative | MEDIUM | HIGH | `confidence:"llm-hint"`, excluded from Three-Layer verification, off by default |
| R-004 | Pre-flight slows the pipeline | MEDIUM | MEDIUM | Warm-cache incremental < 3s; build cap on workers; option to run non-blocking |
| R-005 | Duplicates `sf_project_context` | LOW | MEDIUM | Explicit boundary: metadata stays in project-context, structure in code-map; shared helpers reused |
| R-006 | Large graphs bloat the repo | LOW | MEDIUM | Git-LFS guidance or local-only `.gitignore` for `.skillfoundry/` |

---

## 10. Implementation Plan

### 10.1 Phases
1. **Phase 1 — Deterministic core:** tree-sitter loader, TS/JS + Python grammars, node/edge graph, import graph, persistence + incremental hashing. (FR-001, 003, 005)
2. **Phase 2 — Contract & layer extraction:** endpoint/contract surface, DB/model nodes, layer heuristics. (FR-002, 004)
3. **Phase 3 — Tool + pipeline wiring:** `sf_codemap` tool, `/preflight` command, IGNITE auto-wiring, contract/import-validator handoff, memory feed. (FR-007, 008, 009, 011)
4. **Phase 4 — Diff-impact + semantic:** blast-radius compute, optional LLM labels. (FR-006, 010)
5. **Phase 5 — Dashboard:** graph explorer + diff-impact overlay on existing dashboard stack. (FR-012)

### 10.2 Effort Estimate
Medium-large. Phases 1–3 are the MVP (the actual pre-flight value); Phases 4–5 are enhancement. Recommend shipping Phases 1–3 first, then 4–5.

---

## 11. Acceptance Criteria

### 11.1 Definition of Done
- [ ] `sf_codemap` builds a TS/JS and a Python repo into a valid `.skillfoundry/code-map.json`.
- [ ] Incremental refresh re-parses only changed files; meets performance targets.
- [ ] `endpoints[]` consumed by `sf_contract_check`; `unresolvedImports[]` consumed by `sf_import_validator`.
- [ ] `/forge` & `/go` Phase 1 build/refresh the map automatically and log the handoff.
- [ ] `/preflight` command works and is mirrored to all platform command dirs.
- [ ] Diff-impact lists downstream dependents for a changed symbol.
- [ ] Sanitized `code-map`-tagged entries land in `memory_bank/knowledge/`.
- [ ] Dashboard renders the graph with search + diff-impact overlay, on the shared responsive layout.
- [ ] No new mandatory native build in `npm ci`; `npm ci` stays green on a clean host.
- [ ] All three layers (artifact/backend, tool/pipeline, dashboard/frontend) verified REAL — no mocks, no TODOs.
- [ ] No new CRITICAL GuardLoop patterns detected (`/guardloop scan` clean).

### 11.2 Sign-off Required
- Framework maintainer (SBS) — architecture & memory feed
- Anvil gate suite (T0–T7) green

---

## 12. Appendix

### 12.2 References
- Understand-Anything (MIT, Lum1104): https://github.com/Lum1104/Understand-Anything — engine inspiration (tree-sitter + LLM hybrid).
- `agents/_env-preflight-protocol.md` — sibling environment pre-flight.
- `genesis/2026-03-17-deployment-preflight-gate.md` — sibling pre-flight (T7) pattern.
- `mcp-server/src/agents/project-context-agent.ts` — metadata layer this complements.

### 12.3 Change Log
| Date | Version | Change |
|------|---------|--------|
| 2026-06-04 | 1.0 | Initial draft from Understand-Anything assessment |

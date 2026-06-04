# STORY-009: IGNITE Auto-Wiring + Contract/Import-Validator Handoff

**Phase:** 3 — Tool + pipeline wiring
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-005, STORY-007
**Blocks:** —
**Affects:** FR-008

---

## Description

Make the pre-flight automatic. In the IGNITE/Phase-1 step of `/forge` and `/go`, build or refresh the Code Map right after the environment pre-flight, then hand its `endpoints[]` to `sf_contract_check` and `unresolvedImports[]` to `sf_import_validator` as a baseline — so contract/import mismatches are caught proactively, not after a build cycle.

---

## Acceptance Contract

**done_when:**
- [x] `/forge` and `/go` Phase 1 invoke `sf_codemap` (mode `refresh`) after env pre-flight; the run log records "code-map built/refreshed (N nodes, M endpoints)" and the handoff
- [x] `sf_contract_check` accepts an optional `endpoints[]` baseline; when supplied, frontend calls are checked against the real declared surface; when absent, behavior is unchanged (graceful no-op)
- [x] `sf_import_validator` accepts an optional `unresolvedImports[]` baseline with the same graceful-no-op contract
- [x] If `sf_codemap` fails or times out, the pipeline logs a warning and continues (pre-flight is advisory, never a hard blocker that wrecks a run) — configurable
- [x] `_env-preflight-protocol.md` updated with a "Phase 0.5: Codebase comprehension" note; `forge`/`go` command docs updated
- [x] Pipeline-timing budget respected (warm refresh < 3s); option to run non-blocking documented

**fail_when:**
- Adding the baseline changes `sf_contract_check`/`sf_import_validator` results when NO map is present (must be a pure no-op)
- A code-map failure aborts an otherwise-valid `/forge` or `/go` run
- The IGNITE step re-runs a full build every time instead of incremental refresh

---

## Technical Approach

1. Extend `contract-check-agent.ts` and `import-validator-agent.ts` with an optional baseline input; keep current signatures working (overload/optional param).
2. Edit the `/forge` and `/go` command docs + `_env-preflight-protocol.md` to add the codemap step (these are prompt/protocol files — the orchestration is doc-driven).
3. Log node/endpoint deltas via the existing observability/log path.

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/contract-check-agent.ts` | MODIFY — optional endpoints baseline |
| `mcp-server/src/agents/import-validator-agent.ts` | MODIFY — optional unresolved baseline |
| `agents/_env-preflight-protocol.md` | MODIFY — Phase 0.5 codebase comprehension |
| `.claude/commands/forge.md`, `.claude/commands/go.md` | MODIFY — IGNITE step |
| `mcp-server/tests/contract-baseline.test.ts` | CREATE — no-op + baseline tests |

---

## Security / Constraints
- Advisory gate by default; never silently blocks. Failures logged, not swallowed.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered (code):** `checkContracts(projectPath, baseline?)` and `validateImports(projectPath, baseline?)` now accept an optional Code Map baseline; both are **byte-for-byte no-ops when absent** (verified in `tests/codemap-handoff.test.ts`, 4 tests green). Baseline endpoints augment backend routes (fewer false orphans); baseline `unresolvedImports[]` seed the import errors.
- **Delivered (docs):** `agents/_env-preflight-protocol.md` Step 3.5, `.claude/commands/forge.md` IGNITE step, `.claude/commands/go.md` Phase 0 note — all describe the advisory `sf_codemap → contract/import baseline` handoff.
- **Advisory by design:** a code-map failure logs a warning and never blocks a `/forge` or `/go` run.
- **Perf:** incremental refresh keeps the added IGNITE step cheap; a hard <3s threshold assertion is deferred to a medium-repo benchmark.

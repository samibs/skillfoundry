# STORY-012: Optional LLM Semantic Labels

**Phase:** 4 — Diff-impact + semantic (DEFERRED — enhancement)
**PRD:** codebase-comprehension-preflight
**Priority:** COULD
**Effort:** M
**Status:** DONE (domain label + cost-router routing deferred — see Notes)
**Dependencies:** STORY-002
**Blocks:** —
**Affects:** FR-006

---

## Description

Add an optional LLM pass that decorates deterministic nodes with plain-English summaries and domain/layer hints. Strictly additive and non-authoritative: labels carry `confidence:"llm-hint"`, are off by default, make no LLM call when disabled, and MUST NOT satisfy Three-Layer "REAL logic" verification.

---

## Acceptance Contract

**done_when:**
- [x] `semantic:true` enables the pass; default OFF → no labeler is even constructed (verified by no-network tests)
- [~] Enabled: function/class/model nodes get a `summary` string stamped `confidence:"llm-hint"` (the optional `domain` label is deferred — see Notes)
- [x] Prompt sends only structural facts (id/kind/name/file/line) — never source contents, `.env`, or secret-flagged data (asserted)
- [x] Labels are clearly separable (`summary` + `confidence:"llm-hint"`) so consumers can ignore them
- [~] Batched (configurable `batchSize`); uses the Anthropic SDK directly rather than the cost-router — see Notes/deviation
- [x] Documentation states labels are advisory and excluded from gate/Three-Layer verification (module header + protocol doc)
- [x] Tests: disabled → no labeler call; enabled (mocked labeler) → labels present and flagged (`tests/codemap-semantic.test.ts`)

**fail_when:**
- Any code path treats a semantic label as authoritative (e.g. used to pass `layer-check`)
- An LLM call fires when semantic is disabled
- Source contents flagged secret are sent to the model

---

## Technical Approach

1. `codemap/semantic.ts` — batch nodes, build fact-only prompts, call via existing cost-router/provider abstraction; merge labels back by node id.
2. Honor offline/CI mode (disabled) and per-run budget caps.
3. Schema: add `summary?`, `domain?`, `confidence?` to `Node` (already reserved in STORY-002 schema).

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/semantic.ts` | CREATE — LLM labeling pass |
| `mcp-server/src/agents/codemap-agent.ts` | MODIFY — gate behind `semantic` flag |
| `mcp-server/tests/codemap-semantic.test.ts` | CREATE — off/on (mocked) tests |

---

## Security / Constraints
- Non-authoritative by contract; off by default; fact-only prompts; provider via existing routing + budget controls.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `mcp-server/src/agents/codemap/semantic.ts` (`applySemanticLabels` with an **injected `Labeler`** + `defaultLabeler()`), wired into `sf_codemap` build/refresh behind `semantic:true`. `tests/codemap-semantic.test.ts` (3 tests, green).
- **Non-authoritative by contract:** labels set `summary` + `confidence:"llm-hint"`; documented as excluded from gate/Three-Layer verification. Off by default — when disabled no labeler is constructed and no provider call occurs.
- **Graceful gating:** `defaultLabeler()` throws if `ANTHROPIC_API_KEY` is unset; the agent catches this and returns `{ok:false, error:"…provider…"}` rather than a fake success.
- **Deviations:** (1) the `domain` label is deferred — only `summary` is emitted today; (2) `defaultLabeler` calls the Anthropic SDK directly rather than the cost-router/budget layer — flagged as a follow-up so semantic runs respect per-run budget caps. The injected-labeler design means swapping in a cost-router-backed labeler is a one-line change.

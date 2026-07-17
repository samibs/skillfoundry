---
prd_id: agentos-state-kernel
title: AgentOS — Shared State Kernel & Schema-Validated Capability Contracts
version: 1.0
status: READY
created: 2026-07-17
author: samibs
last_updated: 2026-07-17

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends:
    - correctness-contracts        # AC gates / test-intent enforcement — shares the "contract" concept
    - real-autonomous-agents       # agents that consume/produce structured state
  blocks: []
  shared_with:
    - skillfoundry-v3-mcp-agent-server   # MCP handoffs should carry the same schemas
    - folder-state-and-checkbox-reconciler

tags: [core, architecture, agents, state, contracts, reliability]
priority: high
layers: [backend]
domains: []
---

# PRD: AgentOS — Shared State Kernel & Schema-Validated Capability Contracts

> **Design principle (single line):** the inter-agent intermediate representation is
> **terse, human-inspectable, schema-validated JSON** — semantically anchored to the
> models' training distribution — **not** opaque bitstrings, float arrays, or
> hidden-state embeddings. Embeddings are provider-fragile and API-blocked; JSON is
> native to both the developer's eyes and the LLM's reasoning. This PRD builds *only*
> the positive JSON-IR architecture; the tensor/embedding debate is out of scope.

---

## 1. Overview

### 1.1 Problem Statement

Today SkillFoundry agents (102 markdown prompt files) exchange work as **free-text
payloads** over the existing `agent-message-bus.ts`, and the pipeline threads state as
prose and files. Two failure classes result: (a) a downstream agent receives an
upstream agent's *narrative* rather than a validated data shape, so shapes silently
drift (the Frontend-Backend Contract failure, generalized to agent-to-agent); and (b)
when an `/autonomous` or `/swarm` run goes wrong there is **no single authoritative,
inspectable record of task state** — you cannot answer "what does the run believe is
true right now?" at 2 AM. Gates (Anvil, Semgrep, Checkov) run as pipeline *phases*
that produce reports, but nothing prevents an agent from *asserting* success in prose
that contradicts what the deterministic engine measured.

### 1.2 Proposed Solution

Introduce two coordinated primitives on top of the **existing** message bus and gate
engine — not a rewrite:

1. **Project State Kernel** — one durable, versioned, JSON-Schema-validated state
   document per task (`.skillfoundry/runs/<id>/state/state.json`), partitioned into
   owner-scoped slices (`coder_state`, `tester_state`, `security_state`, …). It stores
   **references, hashes, and metrics — never large artifact blobs**. It is the single
   source of truth for the run.
2. **Capability Contracts** — each agent capability declares an `input_schema` and
   `output_schema`. Handoffs and gate-guarded state writes go through a
   **validate → repair → retry** path (because the default provider does *not*
   guarantee grammar-constrained output). Anvil/gates act as the write barrier: an
   agent's proposed slice update is committed only if the deterministic validators
   pass; otherwise the failure is written back into state as structured error data,
   forcing a retry. Natural language is generated **lazily**, only at human boundaries.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Agent-handoff shape mismatches per 100 handoffs | unmeasured (prose) | 0 schema-invalid commits | Contract validator reject counter in run log |
| Malformed-output recovery | ad hoc `output-repair` | ≥99% recovered within 2 retries, else hard-halt | Retry/halt counters per run |
| "What is the run state?" answer time (audit) | manual log grep | 1 file read (`state.json`) | Presence of authoritative state doc |
| False success (agent claims pass, gate says fail) | possible | 0 committed | Cross-check: committed slice vs gate verdict |
| Existing agents broken by rollout | n/a | 0 regressions | Full test suite + parity on unconverted agents |

---

## 2. User Stories

### Primary User: Framework Maintainer / Autonomous-Run Operator

| ID | As a... | I want to... | So that... | Priority | FR-IDs |
|----|---------|--------------|------------|----------|--------|
| US-001 | operator | read one `state.json` to see exactly what the run believes | I can debug a rogue 2 AM run without reconstructing prose | MUST | FR-001, FR-002 |
| US-002 | maintainer | force every agent handoff through a JSON schema | downstream agents never parse an upstream agent's narrative | MUST | FR-003, FR-004 |
| US-003 | maintainer | have gates block state writes, not just emit reports | an agent cannot "gaslight" the run into a false success | MUST | FR-005, FR-006 |
| US-004 | operator | see clean success output and only get prose post-mortems on failure | I'm not drowned in agent-to-agent chatter on the happy path | SHOULD | FR-007 |
| US-005 | maintainer | adopt contracts incrementally without converting all 102 agents at once | rollout carries zero regressions | MUST | FR-008 |
| US-006 | operator | have concurrent agents write disjoint slices safely | `/swarm` and parallel execution don't lose updates | MUST | FR-009 |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | State Kernel store | `state.ts` in `sf_cli/src/core/` managing a per-run `state.json` with typed slices | Given a run starts, When the kernel initializes, Then a schema-valid `state.json` with `project_metadata` + empty owner slices exists on disk |
| FR-002 | References not blobs (spill, don't reject) | State stores file paths, content hashes, and scalar metrics only; oversized string fields spill to disk transparently | Given an agent writes a string field > configurable `maxFieldBytes`, When the slice is committed, Then the kernel writes the value to `state/artifacts/<sha256>` and replaces the field with `{ref, hash, bytes}`; the write is rejected ONLY if the disk spill itself fails |
| FR-003 | Capability schemas | Each agent capability declares `input_schema`/`output_schema` (JSON Schema) | Given an agent definition, When it is loaded, Then its capability schemas are registered; missing schema on a *converted* agent is a load-time error |
| FR-004 | Validated handoffs | Handoffs over the existing message bus carry schema-validated payloads | Given agent A hands off to B, When the payload fails B's `input_schema`, Then delivery is rejected and logged, never delivered as-is |
| FR-005 | Gate-guarded writes | State-slice commits are intercepted by Anvil/gates before merge | Given an agent proposes a `coder_state` update, When gates fail, Then the write is rejected and the failure is written to state as structured `error_logs`, not merged |
| FR-006 | Validate→repair→retry (per-slice halt) | Non-conforming model output is repaired then retried; halt is scoped to the failing slice, not the whole run | Given a model emits invalid JSON, When repair fails twice, Then the owning slice is marked `FAILED` with structured `error_logs` (no silent pass, no infinite loop, reuses `output-repair.ts`); independent sibling slices continue; the whole run aborts only if a *required* slice failed or the global consecutive-failure threshold trips |
| FR-007 | Lazy language projection | NL is generated only at human boundaries (final summary, failure post-mortem) | Given a successful autonomous run, When it completes, Then the terminal shows a compact state summary, not agent-to-agent transcripts; on repeated gate failure a Summary skill renders a human post-mortem |
| FR-008 | Incremental adoption | Contracts apply first to handoffs, then per-agent, behind a capability flag | Given unconverted markdown agents, When a run executes, Then they operate unchanged; only agents declaring schemas are enforced |
| FR-009 | Write authority + versioning (CAS recovery) | Each slice has a single owning agent + monotonic version; stale writes rebase and retry, never silently drop | Given two agents write concurrently, When both target the same slice, Then the stale-version write is rejected (optimistic concurrency) and the loser re-reads the current slice, rebases its change onto the new version, re-validates, and retries the commit (max 3 attempts) before escalating; cross-slice writes proceed in parallel |

### 3.2 User Interface Requirements

No graphical UI. The operator-facing surface is the CLI and the on-disk state file:

- **Terminal (happy path):** a compact, single-block run summary rendered from the
  final state document — no agent-to-agent transcript printed (FR-007).
- **Terminal (failure path):** a human-readable post-mortem generated by a Summary
  skill from the failing slice's structured `error_logs`.
- **State file:** `.skillfoundry/runs/<id>/state/state.json`, pretty-printed and
  directly human-inspectable, is the audit surface (US-001).

### 3.3 API Requirements

No public HTTP API is introduced. All interfaces are in-process TypeScript (state
kernel + contract validator) layered on the existing message bus. See §6 for why the
API Contract section is skipped.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| State read/write | < 5 ms local file op; no network in the write path |
| Contract validation | < 10 ms per handoff (compiled JSON Schema cached) |
| Added latency per gated write | Bounded by existing gate runtime; no new model calls except repair retries |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | N/A — local, single-user CLI process |
| Authorization | Write authority: a slice is writable only by its declared owner agent (FR-009) |
| Data Protection | State may reference file paths but MUST NOT embed secrets; run redaction (`redact.ts`) applied before any sync/export |
| Input Validation | All cross-agent payloads validated at the boundary; `maxFieldBytes`, max array size, max nesting depth enforced (injection-resistance) |
| Error Handling | Structured error codes into state; **no stack traces** surfaced to users; no silent failure (BPSBS) |
| Determinism boundary | Only deterministic validators may set `build_status=PASSING`; an agent-authored slice can never self-certify pass |

### 4.3 Reliability

- Repair loop is **bounded** (halt after 2, reusing the
  `CONSECUTIVE_FAILURE_HALT_THRESHOLD` discipline already in `pipeline.ts`) — no
  infinite retries.
- State writes are atomic (write-temp + rename) and versioned; a crashed run leaves a
  readable last-valid `state.json`.

---

## 5. Technical Specifications

### 5.1 State home & on-disk layout

State lives in a **dedicated `state/` subdir inside the run dir** (resolves OQ-1) —
per-run isolation, a same-filesystem scratch location for atomic temp+rename, and a
namespace for spilled artifacts and version snapshots:

```
.skillfoundry/runs/<id>/
└── state/
    ├── state.json            # authoritative document (pretty-printed)
    ├── state.json.tmp        # atomic write staging (rename → state.json)
    └── artifacts/
        └── <sha256>          # spilled oversized fields (FR-002)
```

#### State document shape (references/metrics only — no blobs)

```json
{
  "schema_version": 1,
  "run_id": "…",
  "project_metadata": { "target": "node-typescript", "build_status": "PASSING" },
  "slices": {
    "coder_state":    { "version": 4, "owner": "coder",    "modified_files": ["src/auth.ts"], "diff_hash": "sha256:…", "complexity_delta": 4 },
    "tester_state":   { "version": 2, "owner": "tester",   "test_runs": 48, "failures": 0, "coverage": 96 },
    "security_state": { "version": 1, "owner": "security", "critical_vulns": 0, "warnings": 1 }
  }
}
```

- `coverage`, `severity`, `build_status`, etc. keep their **semantic labels** — never
  positional/opaque encodings.
- Large artifacts (full diffs, ASTs, logs) live on disk under the run dir; state stores
  the **path + hash** only.

### 5.2 Capability contract shape & authoring (resolves OQ-3)

**Authoring model:** each capability's `input_schema`/`output_schema` is **co-located in
the agent's own front-matter** (the agent owns its contract), while **shared types**
(`Severity`, `Finding`, `FileRef`, …) live centrally in `schemas/` and are referenced by
`$ref`. At load time all schemas compile into **one registry** (mirroring the existing
`agent-registry` / `agent-prompt-loader` pattern), giving a single lookup + dedup surface
and preventing per-agent copies of common types from drifting.

```yaml
# agents/security_agent.md front-matter
capability: analyze
input_schema:  { type: object, properties: { diff_ref: {type: string}, dependencies: {type: array, items: {type: string}} }, required: [diff_ref] }
output_schema:
  type: object
  required: [vulnerabilities]
  properties:
    vulnerabilities: { type: array, items: { $ref: "schemas/finding.json#/Finding" } }
```

```json
// schemas/finding.json — shared, $ref'd by many agents (single source of truth)
{ "Severity": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
  "Finding": { "type": "object", "required": ["severity", "file"],
    "properties": { "severity": {"$ref": "#/Severity"}, "file": {"type": "string"},
      "line": {"type": "integer"}, "fix_suggestion": {"type": "string"} } } }
```

### 5.3 Write path (the "MMU" barrier)

```
agent produces output
  → validate against output_schema  ──fail──► repair (output-repair.ts) ──fail x2──► HALT (structured error)
  → gate barrier (gates.ts / micro-gates.ts: static build, semgrep, tests)
        ──fail──► write structured error_logs to slice, build_status=FAIL, force retry
        ──pass──► version-guarded commit to owned slice (reject if stale version)
  → lazy NL projection only if a human boundary is crossed
```

### 5.4 Corrections applied vs. the original proposal

| # | Original claim | Correction (normative in this PRD) |
|---|----------------|-------------------------------------|
| 1 | "Model literally cannot emit malformed prose (constrained decoding)" | Default provider (Anthropic) has **no** grammar-constrained output; contracts use **validate → repair → retry → halt**. Constrained-decode is a provider-specific *optimization*, not a guarantee. |
| 2 | "Replace agents chatting with a central state" (as if greenfield) | The typed **message bus already exists**; this builds the *durable state kernel + schemas* on top, reusing the bus. |
| 3 | "Turns the agent into a deterministic compiler pass" | Agents remain **stochastic producers**; only **gates are deterministic**. The guarantee lives at the gate/write barrier, not the model call. |
| 4 | `ast_changes: "…"` inside shared state | State stores **references + hashes + metrics only**; blobs stay on disk (FR-002). |
| 5 | "Each agent owns a slice" (no concurrency model) | Add **write authority + per-slice version guard** (optimistic concurrency) for `/swarm`/parallel safety (FR-009). |
| 6 | Tensor/embedding rebuttal as architecture | Demoted to a one-line design principle; **out of scope** as a requirement. |

### 5.5 Affected modules

| Module | Change |
|--------|--------|
| `sf_cli/src/core/state.ts` | **NEW** — kernel: typed slices, versioned atomic writes, refs-only validation |
| `sf_cli/src/core/agent-message-bus.ts` | Add schema-validation middleware on payloads |
| `sf_cli/src/core/pipeline.ts` | Route slice commits through the gate barrier; wire kernel into run dir |
| `sf_cli/src/core/gates.ts` / `micro-gates.ts` | Expose gate barrier as write interceptor; deterministic-only `PASSING` |
| `sf_cli/src/core/output-repair.ts` | Reused for the repair step of validate→repair→retry |
| `agents/*.md` | Opt-in: add capability `input_schema`/`output_schema` in front-matter (Coder, Tester, Security first) |
| `schemas/` | **NEW** — central shared type definitions (`Severity`, `Finding`, `FileRef`) `$ref`'d by agent contracts (OQ-3) |
| `mcp-server/` | MCP tool schemas **generated** from the canonical registry — a projection, never hand-duplicated (OQ-2) |

---

## 6. Contract Specification (Required for API Features)

**Skip reason:** This PRD introduces **no HTTP/network API and no request/response
endpoints**. All contracts are in-process TypeScript interfaces (the state kernel) and
per-agent JSON Schemas, both fully specified in §5. There is no wire contract to freeze
here. The JSON-Schema capability contracts in §5.2 are the equivalent "frozen shape"
for agent-to-agent handoffs.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- Must layer on the **existing** `agent-message-bus.ts` — no replacement of inter-agent
  transport.
- Default provider (Anthropic) offers no grammar-constrained decoding; the design
  cannot assume guaranteed-valid model output.
- Must not require converting all 102 markdown agents at once (incremental — FR-008).
- State is **per-run**; no cross-run or global shared state in this PRD.

### 7.2 Assumptions

- `output-repair.ts` can be driven programmatically for the repair step.
- Run directory `.skillfoundry/runs/<id>/state/` is writable, on a single filesystem
  (so temp+rename is atomic), and is the state home (OQ-1).
- OpenAI/Gemini strict JSON-schema modes are available and can be used as a "strict"
  optimization where the provider supports them.

### 7.3 Out of Scope

- Hidden-state / embedding / tensor passing between agents (rejected: provider-fragile,
  API-blocked).
- Converting every markdown agent to schemas (incremental rollout only).
- Replacing the message bus.
- A graphical UI (the dashboard may render `state.json` later, separately).
- Cross-run / global shared state.

---

## 8. Regression Surface

Existing behavior that this change could break — must be verified unchanged:

| Feature at Risk | Why at Risk | Verification |
|-----------------|-------------|--------------|
| Existing message-bus handoffs (unconverted agents) | New validation middleware sits in the delivery path | Unconverted agents bypass enforcement; full existing bus tests pass |
| `/forge` & `/go` pipeline runs | Kernel + gate-barrier wiring touches `pipeline.ts` | End-to-end pipeline run on a sample PRD produces identical artifacts |
| Anvil / micro-gate reporting | Gates repurposed as write interceptors | Gate reports still emitted; pass/fail verdicts unchanged on known fixtures |
| `output-repair.ts` current callers | Reused in a new loop | Existing repair unit tests pass; no behavior change for current callers |
| `/swarm` parallel execution | New per-slice version guard | Concurrent-write test: disjoint slices succeed, stale same-slice write rejected |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider without constrained decode emits invalid JSON often | Retry churn, latency | Repair-first path; per-provider "strict mode" when available (OpenAI/Gemini), repair fallback for Anthropic |
| Schema rigidity blocks legitimate agent output | Stalled runs | Start schemas permissive (required-fields-only), tighten with telemetry; flag-gated rollout |
| Slice ownership disputes under `/swarm` | Lost updates | Single-owner write authority + version guard; cross-slice parallelism only |
| Adoption cost across 102 agents | Slow ROI | Handoff-level contracts first (highest leverage), per-agent second |
| State file grows unbounded | Context bloat | References + hashes only; `maxFieldBytes` cap; artifacts on disk |

---

## 10. Implementation Plan

| Phase | Deliverable | Depends on |
|-------|-------------|-----------|
| 1 — Kernel | `state.ts`: typed slices, versioned atomic writes, refs-only validation; wired into `pipeline.ts` run dir | — |
| 2 — Gate barrier | Slice commits routed through `gates.ts`/`micro-gates.ts`; deterministic-only `PASSING` | Phase 1 |
| 3 — Handoff contracts | Schema-validate message-bus payloads; validate→repair→retry via `output-repair.ts` | Phase 1 |
| 4 — Per-agent schemas | Opt-in capability schemas; convert Coder, Tester, Security first | Phase 3 |
| 5 — Lazy projection | Compact success output + failure-only post-mortem Summary skill | Phases 2–4 |

---

## 11. Acceptance Criteria

### 11.1 Definition of Done

- [ ] `state.ts` kernel implemented with typed slices, atomic versioned writes, refs-only validation (FR-001, FR-002)
- [ ] Capability schema registration + load-time error for converted agents missing a schema (FR-003)
- [ ] Message-bus payloads schema-validated at delivery; invalid payloads rejected and logged (FR-004)
- [ ] Slice commits gated by Anvil/gates; failures written as structured `error_logs`, never merged (FR-005)
- [ ] Validate→repair→retry loop bounded, halting after 2 with a structured error (FR-006)
- [ ] Lazy NL projection: compact success summary, failure-only post-mortem (FR-007)
- [ ] Unconverted markdown agents run unchanged behind the capability flag (FR-008)
- [ ] Per-slice version guard: concurrent disjoint writes succeed, stale same-slice writes rejected (FR-009)
- [ ] All items in §8 Regression Surface verified with tests
- [ ] Unit + integration tests ≥ 80% on new `state.ts` and contract-validation code
- [ ] Public interfaces documented (kernel API, contract schema format)
- [ ] No new CRITICAL GuardLoop patterns detected (`/guardloop scan` clean)

### 11.2 Acceptance Scenarios (Gherkin)

```
Scenario: Agent cannot self-certify a passing build
  Given the coder agent proposes a coder_state update claiming success
  And the deterministic gate barrier reports a failing build
  When the commit is attempted
  Then the write is rejected
  And build_status remains FAIL with structured error_logs in state

Scenario: Concurrent slice writes are race-safe
  Given the tester and security agents write their own slices concurrently
  When both commits are applied
  Then both succeed
  But a second write to tester_state carrying a stale version is rejected
  And the rejected writer re-reads tester_state, rebases its change onto the
    current version, re-validates, and retries the commit (max 3) before escalating

Scenario: Malformed model output is bounded, not silently accepted
  Given an agent emits JSON that fails its output_schema
  When repair fails twice
  Then the run halts with a structured error and no slice is committed
```

---

## 12. Appendix

### 12.1 Resolved Design Decisions

Formerly open questions — resolved to best practice and made normative above:

| ID | Question | Decision | Rationale | Where |
|----|----------|----------|-----------|-------|
| OQ-1 | State home: run dir or dedicated subdir? | **Dedicated `state/` subdir inside the run dir** | Per-run isolation, same-filesystem scratch for atomic temp+rename, namespaces spilled artifacts/snapshots | §5.1, §7.2 |
| OQ-2 | MCP server: same schemas or a projection? | **Single source of truth — MCP tool schemas are a *generated projection* of the canonical registry** | Hand-duplicated wire schemas would drift — the exact contract-mismatch failure this PRD exists to eliminate | §5.5 |
| OQ-3 | Schema authoring: co-located or central registry? | **Hybrid — capability schema co-located in agent front-matter; shared types centralized in `schemas/` and `$ref`'d; all compiled into one registry at load** | Agent owns its contract (locality) while common types (`Severity`, `Finding`) have one definition; mirrors the existing agent-registry pattern | §5.2, §5.5 |

### 12.2 Resolved Gaps (from PRD-lint semantic pass)

| Gap | Decision | Rationale | Where |
|-----|----------|-----------|-------|
| Oversized `maxFieldBytes` field | **Transparent spill to `state/artifacts/<hash>`; replace field with `{ref,hash,bytes}`. Reject only if the disk write fails.** | Hard-rejecting a legitimate large diff would stall the run; spilling *is* the "refs not blobs" principle | FR-002, §5.1 |
| Halt scope on repair exhaustion | **Per-slice `FAILED` marking; independent siblings continue; whole-run abort only if a required slice fails or the global consecutive-failure threshold trips** | Bounds `/swarm` blast radius; consistent with existing halt-on-repeated-blocker discipline (no false success) | FR-006, §11.2 |
| Stale-version write recovery | **Bounded compare-and-swap: re-read → rebase → re-validate → retry (max 3) → escalate. Never silently drop the update.** | Standard optimistic-concurrency recovery; a dropped update is a silent lost write | FR-009, §11.2 |

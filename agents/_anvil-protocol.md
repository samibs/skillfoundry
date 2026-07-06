# The Anvil — 7-Tier Agent-Handoff Gate Protocol (A0–A6)

**Version**: 1.1
**Status**: ACTIVE
**Applies To**: All Agents in the Story Execution Pipeline

---

## Purpose

The Anvil is a 7-tier validation system that runs between every agent phase in the story execution pipeline. It catches issues at the source — before they cascade through the chain and require expensive re-runs.

**Core insight**: LLMs generate code optimistically (forward, single-pass) but debug analytically (backwards from evidence). The Anvil forces analytical validation at every handoff point, not just at the end.

> **Namespace — read this first.** Anvil tiers use the **A-namespace (A0–A6)**. They are *agent-handoff prompt checks*. They are **distinct from the CLI quality gates (T0–T7)** implemented in `sf_cli/src/core/gates.ts` and `scripts/anvil.sh`, which the deterministic `sf` engine runs. The two systems have the same count but different checks — e.g. **Anvil A3** is Self-Adversarial Review, while **CLI gate T3** is Tests. Never conflate an "A#" (Anvil) with a "T#" (CLI gate). This is the single canonical Anvil tier definition; other docs reference it rather than re-tabulating.

---

## The 7 Anvil Tiers (A0–A6)

| Tier | Name | Type | When | What It Catches |
|------|------|------|------|-----------------|
| **A0** | Correctness Contract | Static check (no LLM, no build) | Before any agent runs | Missing tests for completed story acceptance criteria — every `done_when` item must have a corresponding test |
| **A1** | Shell Pre-Flight | Shell script (no LLM) | Between EVERY agent handoff | Syntax errors, banned patterns, missing files, broken imports |
| **A2** | Canary Smoke Test | Quick execution test | After Coder, before Tester | Fundamental breakage — module won't import, won't compile |
| **A3** | Self-Adversarial Review | Coder self-critique | After Coder writes code | Coder's blind spots, untested failure modes |
| **A4** | Scope Validation | Diff comparison | In Gate-Keeper validation | Scope creep, incomplete implementation |
| **A4b** | Traceability Test | Line-level diff analysis | In Gate-Keeper validation (after A4) | Orthogonal changes — lines that don't trace to the request (see `LLM-020`) |
| **A5** | Contract Enforcement | API contract check | In Gate-Keeper validation | API drift, wrong signatures, missing endpoints |
| **A6** | Shadow Tester | Parallel risk agent | Concurrent with Coder | Risk prioritization for Tester, early warnings |

---

## Pipeline Integration

### Story Execution Flow (with Anvil)

```
FOR EACH story:

  0. ANVIL A0: Correctness Contract check
     └── For completed stories: verify every done_when item has a matching test
     └── Uses fuzzy keyword matching against test file content (no AI, no build)

  1. Architect designs solution
     └── ANVIL A1: Validate file references in architect output

  2. Coder implements (+ A6 Shadow Tester in parallel)
     └── ANVIL A1: Syntax, patterns, imports on ALL changed files
     └── ANVIL A2: Canary smoke test (can it import/compile?)
     └── ANVIL A3: Self-adversarial review (3+ failure modes)

  3. Tester writes tests (receives A6 risk list as input)
     └── ANVIL A1: Validate test files (syntax, no banned patterns)

  4. Gate-Keeper validates
     └── ANVIL A4: Scope validation (expected vs actual files)
     └── ANVIL A4b: Traceability test (every changed line traces to request)
     └── ANVIL A5: Contract enforcement (API matches declaration)
```

### Fast-Fail Behavior

- **A0 FAIL** → Block pipeline, done_when items lack test coverage — route to Tester
- **A1 FAIL after Architect** → Block Coder, route to Fixer
- **A1 FAIL after Coder** → Block Tester, route to Fixer
- **A2 FAIL (canary)** → Skip Tester entirely, route to Fixer
- **A3 VULNERABLE** → Block handoff, Coder must fix before proceeding
- **A4/A5 FAIL** → Gate-Keeper blocks, standard remediation flow

---

## Output Format

All Anvil checks produce results in this format:

```markdown
ANVIL CHECK: T[N] [Tier Name] — [target file or scope]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: PASS / WARN / FAIL

Findings:
  [severity] [description] — [file:line]
  [severity] [description] — [file:line]

Action: CONTINUE / FIX_REQUIRED / BLOCK
```

### Severity Levels

| Severity | Symbol | Effect |
|----------|--------|--------|
| **BLOCK** | `[BLOCK]` | Pipeline stops. Must fix before proceeding. |
| **WARN** | `[WARN]` | Pipeline continues. Logged to scratchpad. Tester should cover. |
| **INFO** | `[INFO]` | Informational only. Logged but no action required. |

### Severity Mapping

| Finding | Severity |
|---------|----------|
| Syntax error | BLOCK |
| Banned pattern (TODO, FIXME, etc.) | BLOCK |
| Import resolution failure | BLOCK |
| Canary smoke test failure | BLOCK |
| Self-adversarial verdict: VULNERABLE | BLOCK |
| Expected file not changed | BLOCK |
| API contract mismatch | BLOCK |
| Unexpected file changed (scope creep) | WARN |
| Changed line not traceable to request (A4b) | WARN |
| Changed line in security/auth file not traceable (A4b) | BLOCK |
| Suspicious duplicate content | WARN |
| Shadow tester HIGH risk | WARN |
| Shadow tester MEDIUM risk | INFO |
| Shadow tester LOW risk | INFO |

---

## Integration with Existing Systems

### Gate-Keeper

The Gate-Keeper integrates A4 (Scope Validation) and A5 (Contract Enforcement) into its validation phase. These are additional checks alongside the existing three-layer enforcement and banned pattern scanning.

### Fixer Orchestrator

When Anvil checks fail with BLOCK severity:
1. Violation report is generated in Gate-Keeper format
2. Routed to Fixer Orchestrator
3. Fixer routes to appropriate specialist agent
4. After fix, Anvil re-validates
5. Standard 3-retry loop applies

### Sub-Agent Response Format

All Anvil tier outputs follow the standard sub-agent response format defined in `agents/_subagent-response-format.md`. Max 500 tokens per tier result.

### Dispatch State

The dispatch state machine (`.claude/dispatch-state.json`) adds an `ANVIL_CHECKING` sub-state within `EXECUTING_STORY` to track which tier is currently running.

---

## Disabling Anvil

For specific use cases, Anvil can be disabled:

```
/go --no-anvil          Disable all Anvil checks
/go --anvil=t1          Run only Tier 1 (shell checks)
/go --anvil=t1,t2       Run Tiers 1 and 2 only
```

**Default**: All tiers enabled in semi-auto and autonomous modes. In supervised mode, A1 always runs; A2-A6 run if Gate-Keeper is in auto-fix mode.

---

## Tier Protocol References

Each tier has a dedicated protocol file:

| Tier | Protocol File |
|------|--------------|
| A0 | Static check — fuzzy keyword match of `done_when` items against test files (no external script) |
| A1 | `scripts/anvil.sh` (shell script) |
| A2 | `agents/_canary-smoke-test.md` |
| A3 | `agents/_self-adversarial-review.md` |
| A4 | `agents/_scope-validation.md` |
| A4b | `agents/_scope-validation.md` (Traceability Test section) |
| A5 | `agents/_contract-enforcement.md` |
| A6 | `agents/_shadow-tester.md` |

---

## Success Metrics

Track Anvil effectiveness:

| Metric | Target |
|--------|--------|
| A0 coverage gap detection (missing tests for done_when) | >90% of untested criteria caught |
| A1 catch rate (issues caught before LLM agents) | >40% of all violations |
| A2 canary catch rate (broken code before Tester) | >80% of import/compile errors |
| A3 adversarial miss rate (failures coder missed) | <20% unmitigated failure modes |
| A4 scope accuracy (expected vs actual) | >90% match rate |
| A4b traceability accuracy (lines traceable to request) | >95% of changed lines traceable |
| A5 contract match (API implementation vs spec) | 100% for declared endpoints |
| A6 risk prediction accuracy | >60% of HIGH risks confirmed by Tester |

---

## Design Principles

1. **Cheap checks first**: A0 (static) and A1 (shell) catch 60%+ of issues with zero LLM cost
2. **Fast-fail**: Don't run expensive agents on broken code
3. **Non-destructive**: Anvil only reads and validates — never modifies code
4. **Additive**: Anvil supplements existing Gate-Keeper, never replaces it
5. **Configurable**: Each tier can be enabled/disabled independently

---

*The Anvil — Strike early. Strike often. Every handoff is a checkpoint.*

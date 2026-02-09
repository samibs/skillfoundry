# The Anvil — 6-Tier Quality Gate Protocol

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: All Agents in the Story Execution Pipeline

---

## Purpose

The Anvil is a multi-tier validation system that runs between every agent phase in the story execution pipeline. It catches issues at the source — before they cascade through the chain and require expensive re-runs.

**Core insight**: LLMs generate code optimistically (forward, single-pass) but debug analytically (backwards from evidence). The Anvil forces analytical validation at every handoff point, not just at the end.

---

## The 6 Tiers

| Tier | Name | Type | When | What It Catches |
|------|------|------|------|-----------------|
| **T1** | Shell Pre-Flight | Shell script (no LLM) | Between EVERY agent handoff | Syntax errors, banned patterns, missing files, broken imports |
| **T2** | Canary Smoke Test | Quick execution test | After Coder, before Tester | Fundamental breakage — module won't import, won't compile |
| **T3** | Self-Adversarial Review | Coder self-critique | After Coder writes code | Coder's blind spots, untested failure modes |
| **T4** | Scope Validation | Diff comparison | In Gate-Keeper validation | Scope creep, incomplete implementation |
| **T5** | Contract Enforcement | API contract check | In Gate-Keeper validation | API drift, wrong signatures, missing endpoints |
| **T6** | Shadow Tester | Parallel risk agent | Concurrent with Coder | Risk prioritization for Tester, early warnings |

---

## Pipeline Integration

### Story Execution Flow (with Anvil)

```
FOR EACH story:

  1. Architect designs solution
     └── ANVIL T1: Validate file references in architect output

  2. Coder implements (+ T6 Shadow Tester in parallel)
     └── ANVIL T1: Syntax, patterns, imports on ALL changed files
     └── ANVIL T2: Canary smoke test (can it import/compile?)
     └── ANVIL T3: Self-adversarial review (3+ failure modes)

  3. Tester writes tests (receives T6 risk list as input)
     └── ANVIL T1: Validate test files (syntax, no banned patterns)

  4. Gate-Keeper validates
     └── ANVIL T4: Scope validation (expected vs actual files)
     └── ANVIL T5: Contract enforcement (API matches declaration)
```

### Fast-Fail Behavior

- **T1 FAIL after Architect** → Block Coder, route to Fixer
- **T1 FAIL after Coder** → Block Tester, route to Fixer
- **T2 FAIL (canary)** → Skip Tester entirely, route to Fixer
- **T3 VULNERABLE** → Block handoff, Coder must fix before proceeding
- **T4/T5 FAIL** → Gate-Keeper blocks, standard remediation flow

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
| Suspicious duplicate content | WARN |
| Shadow tester HIGH risk | WARN |
| Shadow tester MEDIUM risk | INFO |
| Shadow tester LOW risk | INFO |

---

## Integration with Existing Systems

### Gate-Keeper

The Gate-Keeper integrates T4 (Scope Validation) and T5 (Contract Enforcement) into its validation phase. These are additional checks alongside the existing three-layer enforcement and banned pattern scanning.

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

**Default**: All tiers enabled in semi-auto and autonomous modes. In supervised mode, T1 always runs; T2-T6 run if Gate-Keeper is in auto-fix mode.

---

## Tier Protocol References

Each tier has a dedicated protocol file:

| Tier | Protocol File |
|------|--------------|
| T1 | `scripts/anvil.sh` (shell script) |
| T2 | `agents/_canary-smoke-test.md` |
| T3 | `agents/_self-adversarial-review.md` |
| T4 | `agents/_scope-validation.md` |
| T5 | `agents/_contract-enforcement.md` |
| T6 | `agents/_shadow-tester.md` |

---

## Success Metrics

Track Anvil effectiveness:

| Metric | Target |
|--------|--------|
| T1 catch rate (issues caught before LLM agents) | >40% of all violations |
| T2 canary catch rate (broken code before Tester) | >80% of import/compile errors |
| T3 adversarial miss rate (failures coder missed) | <20% unmitigated failure modes |
| T4 scope accuracy (expected vs actual) | >90% match rate |
| T5 contract match (API implementation vs spec) | 100% for declared endpoints |
| T6 risk prediction accuracy | >60% of HIGH risks confirmed by Tester |

---

## Design Principles

1. **Cheap checks first**: T1 (shell) catches 60%+ of issues with zero LLM cost
2. **Fast-fail**: Don't run expensive agents on broken code
3. **Non-destructive**: Anvil only reads and validates — never modifies code
4. **Additive**: Anvil supplements existing Gate-Keeper, never replaces it
5. **Configurable**: Each tier can be enabled/disabled independently

---

*The Anvil — Strike early. Strike often. Every handoff is a checkpoint.*

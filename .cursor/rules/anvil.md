---
description: /anvil - The Anvil Quality Gate
globs:
alwaysApply: false
---

# anvil — Cursor Rule

> **Activation**: Say "anvil" or "use anvil rule" in chat to activate this workflow.
> **Platform**: Cursor (rule-based context, not slash-command invocation)

# /anvil - The Anvil Quality Gate

> 6-tier validation system that catches issues between every agent phase.

---

## Usage

```
/anvil                    Run all tiers on current story/changed files
/anvil t1                 Tier 1 only (shell checks: syntax, patterns, imports)
/anvil t1 <file>          Tier 1 on specific file
/anvil t2                 Tier 2 (canary smoke test)
/anvil t3                 Tier 3 (self-adversarial review of last implementation)
/anvil t4                 Tier 4 (scope validation: expected vs actual files)
/anvil t5                 Tier 5 (contract enforcement: API spec vs implementation)
/anvil t6                 Tier 6 (shadow tester: risk assessment of changed code)
/anvil --report           Full Anvil report on last story
```

---

## Instructions

You are **The Anvil** — the quality gate that strikes between every agent handoff. When `/anvil` is invoked, run validation checks on the current story or changed files.

### The 6 Tiers

| Tier | Name | Type | What It Catches |
|------|------|------|-----------------|
| T1 | Shell Pre-Flight | Shell script (no LLM) | Syntax errors, banned patterns, missing files |
| T2 | Canary Smoke Test | Quick execution test | Module won't import, won't compile |
| T3 | Self-Adversarial Review | Coder self-critique | Untested failure modes, blind spots |
| T4 | Scope Validation | Diff comparison | Scope creep, incomplete implementation |
| T5 | Contract Enforcement | API contract check | API drift, wrong signatures |
| T6 | Shadow Tester | Risk assessment | Priority risks for Tester |

### When invoked with no arguments (run all):

1. **Identify changed files**: Run `git diff --name-only` to find what changed
2. **T1 — Shell Pre-Flight**: Run `scripts/anvil.sh check` on changed files
   - Syntax validation (Python, JS, Shell, JSON)
   - Banned pattern scan (zero-tolerance list)
   - Import resolution check
3. **T2 — Canary Smoke Test**: See `agents/_canary-smoke-test.md`
   - Try to import/compile the main changed module
   - PASS/FAIL with single-line reason
4. **T3 — Self-Adversarial Review**: See `agents/_self-adversarial-review.md`
   - List 3+ failure modes for recently implemented code
   - Each must have a mitigation (test/guard/validation)
   - Verdict: RESILIENT or VULNERABLE
5. **T4 — Scope Validation**: See `agents/_scope-validation.md`
   - Compare expected_changes from story vs git diff
   - Flag missing or unexpected changes
6. **T5 — Contract Enforcement**: See `agents/_contract-enforcement.md`
   - If story has API contract, validate endpoints exist
   - Check methods, request/response models, status codes
7. **T6 — Shadow Risk Assessment**: See `agents/_shadow-tester.md`
   - Read changed files, generate prioritized risk list

### When invoked with specific tier:

Run only the requested tier. Useful for debugging or spot-checking.

### Output Format:

```
The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  T1 (Shell Pre-Flight):      PASS / WARN / FAIL
  T2 (Canary Smoke Test):     PASS / FAIL / SKIP
  T3 (Self-Adversarial):      RESILIENT / VULNERABLE / SKIP
  T4 (Scope Validation):      PASS / WARN / FAIL / SKIP
  T5 (Contract Enforcement):  PASS / WARN / FAIL / SKIP
  T6 (Shadow Risk):           [N] HIGH, [N] MEDIUM, [N] LOW

  Overall: PASS / WARN / FAIL
  Action: CONTINUE / FIX_REQUIRED / BLOCK
```

---

## WORKED EXAMPLES BY TIER

### T1 — Shell Pre-Flight (Example)
```
T1 SHELL PRE-FLIGHT
━━━━━━━━━━━━━━━━━━━
Files checked: src/auth/jwt.ts, src/auth/middleware.ts, test/auth/jwt.spec.ts

  src/auth/jwt.ts:
    ✓ Syntax valid
    ✗ BANNED PATTERN: "TODO: implement refresh" (line 42)
    ✓ Imports resolve

  src/auth/middleware.ts:
    ✓ Syntax valid
    ✓ No banned patterns
    ✓ Imports resolve

  test/auth/jwt.spec.ts:
    ✓ Syntax valid
    ✓ No banned patterns
    ✗ MISSING IMPORT: "describe" not imported (jest globals)

T1 Result: FAIL (1 banned pattern, 1 missing import)
Action: FIX_REQUIRED — Route to Fixer
```

### T2 — Canary Smoke Test (Example)
```
T2 CANARY SMOKE TEST
━━━━━━━━━━━━━━━━━━━━
Module: src/auth/index.ts

  Attempting import...
  ✓ Module loads without error
  ✓ Exports: JwtService, authenticate, authorize
  ✓ No runtime exceptions on import

T2 Result: PASS
```

### T3 — Self-Adversarial Review (Example)
```
T3 SELF-ADVERSARIAL REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: src/auth/jwt.ts (JwtService)

  Failure Mode 1: Token expiry not checked on refresh
    Risk: HIGH
    Mitigation: Added exp validation in refreshToken() — test: jwt.spec.ts#L45

  Failure Mode 2: No rate limiting on token generation
    Risk: MEDIUM
    Mitigation: Rate limiter middleware applied — test: middleware.spec.ts#L12

  Failure Mode 3: Key rotation not handled
    Risk: MEDIUM
    Mitigation: Multi-key verification supports old + new keys — test: jwt.spec.ts#L78

T3 Verdict: RESILIENT (3 failure modes identified, all mitigated)
```

### T4 — Scope Validation (Example)
```
T4 SCOPE VALIDATION
━━━━━━━━━━━━━━━━━━━
Story: STORY-003 (JWT Authentication)

  Expected changes (from story):
    ✓ src/auth/jwt.ts — CREATED
    ✓ src/auth/middleware.ts — MODIFIED
    ✓ test/auth/jwt.spec.ts — CREATED

  Unexpected changes:
    ⚠ src/config/database.ts — MODIFIED (not in story scope)

  Missing changes:
    ✗ src/auth/types.ts — EXPECTED but not created

T4 Result: WARN (1 unexpected change, 1 missing change)
Action: Review unexpected change; implement missing file
```

### T5 — Contract Enforcement (Example)
```
T5 CONTRACT ENFORCEMENT
━━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-003 (JWT Authentication)

  API Contract Check:
    POST /auth/login
      ✓ Endpoint exists
      ✓ Request body: { email: string, password: string }
      ✓ Response 200: { accessToken: string, refreshToken: string }
      ✓ Response 401: { error: string }

    POST /auth/refresh
      ✓ Endpoint exists
      ✗ Response 200: Missing "expiresIn" field (contract requires it)

T5 Result: FAIL (1 contract violation)
Action: FIX_REQUIRED — Add expiresIn to refresh response
```

### T6 — Shadow Risk Assessment (Example)
```
T6 SHADOW RISK ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━
Changed files: 3 files, 245 lines added

  HIGH RISK:
  1. src/auth/jwt.ts:42 — Token signing with configurable algorithm
     → Test: Verify algorithm cannot be overridden to "none"

  MEDIUM RISK:
  2. src/auth/middleware.ts:18 — Error message includes token details
     → Test: Verify error responses don't leak token internals

  LOW RISK:
  3. src/auth/jwt.ts:78 — Key rotation reads from filesystem
     → Test: Verify graceful handling of missing key file

T6 Result: 1 HIGH, 1 MEDIUM, 1 LOW
Action: Tester should prioritize HIGH risk item first
```

---

## BAD vs GOOD Examples

### BAD: Anvil run that rubber-stamps everything
```
/anvil

The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  T1 (Shell Pre-Flight):      PASS
  T2 (Canary Smoke Test):     SKIP (no entry point found)
  T3 (Self-Adversarial):      SKIP (no recent implementation)
  T4 (Scope Validation):      SKIP (no story context)
  T5 (Contract Enforcement):  SKIP (no API contract)
  T6 (Shadow Risk):           SKIP (no changed files)

  Overall: PASS
  Action: CONTINUE
```
Problem: 5 of 6 tiers skipped. This is not a quality gate — it's a rubber stamp. A real Anvil run requires context (changed files, story reference, recent implementation).

### GOOD: Anvil run with thorough validation and actionable findings
```
/anvil

The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  T1 (Shell Pre-Flight):      WARN — 1 banned pattern in src/auth/jwt.ts:42
  T2 (Canary Smoke Test):     PASS — Module imports cleanly
  T3 (Self-Adversarial):      RESILIENT — 3 failure modes, all mitigated
  T4 (Scope Validation):      WARN — 1 unexpected file modified
  T5 (Contract Enforcement):  FAIL — Missing "expiresIn" in refresh response
  T6 (Shadow Risk):           1 HIGH, 1 MEDIUM, 1 LOW

  Overall: FAIL
  Action: FIX_REQUIRED

  Fixes needed:
  1. Remove TODO on line 42 of src/auth/jwt.ts (T1)
  2. Add expiresIn to POST /auth/refresh response (T5)
  3. Review unexpected modification to src/config/database.ts (T4)
```

---

## HANDOFF PROTOCOL

### Anvil -> Fixer (on FAIL)
When Anvil detects failures, route to the Fixer Orchestrator with structured context:

```
ANVIL -> FIXER HANDOFF
━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-XXX
Failed Tiers: [T1, T5]

Violation 1 (T1):
  File: src/auth/jwt.ts
  Line: 42
  Issue: Banned pattern "TODO"
  Fix Type: REMOVE_BANNED_PATTERN (auto-fixable)

Violation 2 (T5):
  File: src/auth/routes.ts
  Endpoint: POST /auth/refresh
  Issue: Missing "expiresIn" field in response
  Fix Type: CONTRACT_VIOLATION (may need coder)
```

### Anvil -> Go/Gate-Keeper (on PASS)
When Anvil passes, hand off to the next pipeline stage:

```
ANVIL -> GATE-KEEPER HANDOFF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-XXX
Anvil Result: PASS (all 6 tiers)
T6 Risk List: [attached for tester reference]
Ready for: Final gate-keeper validation
```

### Anvil -> Coder (on T3 VULNERABLE)
When self-adversarial review finds unmitigated failure modes:

```
ANVIL -> CODER HANDOFF
━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-XXX
T3 Verdict: VULNERABLE

Unmitigated Failure Modes:
1. [failure mode] — needs guard/validation at [location]
2. [failure mode] — needs test at [location]

Action: Implement mitigations, then re-run /anvil t3
```

---

## ERROR HANDLING

| Error | Cause | Resolution |
|-------|-------|------------|
| No changed files detected | `git diff` returns empty | Check if changes are committed; use `git diff HEAD~1` |
| Script not found | `scripts/anvil.sh` missing | Run `/health` to verify framework integrity |
| Story context missing | No current story in state | Run with explicit file: `/anvil t1 src/auth/jwt.ts` |
| T2 import fails | Missing dependencies | Run package install before retrying |
| T5 no contract found | Story has no API contract section | Skip T5 (not all stories have API contracts) |
| Tier timeout | Check takes too long | Skip tier with TIMEOUT status, log for investigation |

---

## REFLECTION PROTOCOL

### Pre-Execution Reflection
Before running Anvil checks, answer:
- Which files changed since the last Anvil run?
- Is there a story context available for T4/T5 validation?
- Should all 6 tiers run, or is a targeted check sufficient?
- Is the `scripts/anvil.sh` script available and executable?

### Post-Execution Reflection
After Anvil completes, evaluate:
- Did any tier produce false positives (flagging correct code)?
- Were all failure findings actionable (not vague)?
- Did T3 identify meaningful failure modes (not trivial ones)?
- Was the overall verdict consistent with the individual tier results?
- Should any findings be escalated beyond the Fixer?

### Self-Score (1-10)
| Dimension | Score | Criteria |
|-----------|-------|----------|
| Thoroughness | [1-10] | Were all applicable tiers run? No inappropriate skips? |
| Accuracy | [1-10] | Were findings real issues, not false positives? |
| Actionability | [1-10] | Can each finding be fixed with clear instructions? |
| Handoff Quality | [1-10] | Was the handoff to Fixer/Gate-Keeper properly structured? |

**Threshold**: If Thoroughness scores below 6 (too many skipped tiers), re-run with explicit file targets. If Accuracy scores below 6, review T1 patterns for false positive tuning.

---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/go` | Anvil runs at every handoff during story execution |
| `/forge` | Anvil is embedded in Phase 2 (Forge) pipeline |
| `/coder` | Anvil T1-T3 run after coder produces implementation |
| `/tester` | Anvil T1 runs after tester produces tests; T6 feeds risk list to tester |
| `/gate-keeper` | T4+T5 integrated into gate-keeper validation |
| `/fixer` | Receives structured violation reports from Anvil on FAIL |
| `/security` | T1 banned pattern scan overlaps with security scanning |
| `/metrics` | Anvil pass/fail rates tracked per tier |

### Peer Improvement Signals

- **From `/coder`**: If coder consistently fails T1, suggest adding linting to coder's pre-handoff checklist
- **From `/fixer`**: If fixer cannot resolve a T5 contract violation, escalate to architect
- **From `/tester`**: If tester finds issues T6 missed, update T6 risk heuristics
- **To `/metrics`**: Report per-tier pass/fail rates for trend analysis
- **To `/memory`**: Record recurring failure patterns for future prevention

---

*The Anvil — Strike early. Strike often. Every handoff is a checkpoint.*

---

## How to Use in Cursor

This rule activates when you reference it in chat. Examples:
- "use anvil rule"
- "anvil — implement the feature"
- "follow the anvil workflow"

Cursor loads this rule as context. It does NOT use /slash-command syntax.

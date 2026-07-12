# /anvil

Gemini skill for `anvil`.

## Instructions

# /anvil - The Anvil Quality Gate

> 6-tier (A1–A6) agent-handoff validation system that catches issues between every agent phase.

> **Namespace**: Anvil tiers are **A1–A6** — distinct from the CLI quality gates **T0–T7** (`sf_cli/core/gates.ts`). Different checks AND a different count (6 Anvil tiers vs 8 CLI gates); e.g. Anvil A3 = Self-Adversarial Review, CLI gate T3 = Tests. To avoid confusion, invoke Anvil tiers with the `a` prefix (`/anvil a3`), never `t3`. Canonical definition: `agents/_anvil-protocol.md`.

---

## Usage

```
/anvil                    Run all tiers on current story/changed files
/anvil a1                 Tier A1 only (shell checks: syntax, patterns, imports, SAST)
/anvil a1 <file>          Tier A1 on specific file
/anvil a2                 Tier A2 (canary smoke test)
/anvil a3                 Tier A3 (self-adversarial review of last implementation)
/anvil a4                 Tier A4 (scope validation + Semgrep SAST deep scan)
/anvil a4 --sast-only     Tier A4 SAST scan only (skip scope diff)
/anvil a5                 Tier A5 (contract enforcement: API spec vs implementation)
/anvil a6                 Tier A6 (shadow tester: risk assessment of changed code)
/anvil --report           Full Anvil report on last story
```

---

## Instructions

You are **The Anvil** — the quality gate that strikes between every agent handoff. When `/anvil` is invoked, run validation checks on the current story or changed files.

### The 6 Tiers

| Tier | Name | Type | What It Catches |
|------|------|------|-----------------|
| A1 | Shell Pre-Flight | Shell script (no LLM) | Syntax errors, banned patterns, missing files, Semgrep SAST (if installed) |
| A2 | Canary Smoke Test | Quick execution test | Module won't import, won't compile |
| A3 | Self-Adversarial Review | Coder self-critique | Untested failure modes, blind spots |
| A4 | Scope + SAST | Diff comparison + Semgrep deep scan | Scope creep, incomplete implementation, OWASP Top 10, hardcoded secrets |
| A5 | Contract Enforcement | API contract check | API drift, wrong signatures |
| A6 | Shadow Tester | Risk assessment | Priority risks for Tester |

### When invoked with no arguments (run all):

1. **Identify changed files**: Run `git diff --name-only` to find what changed
2. **A1 — Shell Pre-Flight**: Run `scripts/anvil.sh check` on changed files
   - Syntax validation (Python, JS, Shell, JSON)
   - Banned pattern scan (zero-tolerance list)
   - Import resolution check
3. **A2 — Canary Smoke Test**: See `agents/_canary-smoke-test.md`
   - Try to import/compile the main changed module
   - PASS/FAIL with single-line reason
4. **A3 — Self-Adversarial Review**: See `agents/_self-adversarial-review.md`
   - List 3+ failure modes for recently implemented code
   - Each must have a mitigation (test/guard/validation)
   - Verdict: RESILIENT or VULNERABLE
5. **A4 — Scope Validation + SAST**: See `agents/_scope-validation.md`
   - Compare expected_changes from story vs git diff
   - Flag missing or unexpected changes
   - Run `scripts/anvil.sh sast <changed-files>` for Semgrep OWASP Top 10 + secrets scan
   - If `semgrep` not installed: WARN and skip (non-blocking unless HIGH findings present)
   - HIGH severity findings → FAIL (route to coder); MEDIUM → WARN
   - For deep LLM-assisted SAST: invoke `sf_security_scan` tool with the changed file list
6. **A5 — Contract Enforcement**: See `agents/_contract-enforcement.md`
   - If story has API contract, validate endpoints exist
   - Check methods, request/response models, status codes
7. **A6 — Shadow Risk Assessment**: See `agents/_shadow-tester.md`
   - Read changed files, generate prioritized risk list

### When invoked with specific tier:

Run only the requested tier. Useful for debugging or spot-checking.

### Output Format:

```
The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  A1 (Shell Pre-Flight):      PASS / WARN / FAIL
  A2 (Canary Smoke Test):     PASS / FAIL / SKIP
  A3 (Self-Adversarial):      RESILIENT / VULNERABLE / SKIP
  A4 (Scope Validation):      PASS / WARN / FAIL / SKIP
  A5 (Contract Enforcement):  PASS / WARN / FAIL / SKIP
  A6 (Shadow Risk):           [N] HIGH, [N] MEDIUM, [N] LOW

  Overall: PASS / WARN / FAIL
  Action: CONTINUE / FIX_REQUIRED / BLOCK
```

---

## WORKED EXAMPLES BY TIER

### A1 — Shell Pre-Flight (Example)
```
A1 SHELL PRE-FLIGHT
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

A1 Result: FAIL (1 banned pattern, 1 missing import)
Action: FIX_REQUIRED — Route to Fixer
```

### A2 — Canary Smoke Test (Example)
```
A2 CANARY SMOKE TEST
━━━━━━━━━━━━━━━━━━━━
Module: src/auth/index.ts

  Attempting import...
  ✓ Module loads without error
  ✓ Exports: JwtService, authenticate, authorize
  ✓ No runtime exceptions on import

A2 Result: PASS
```

### A3 — Self-Adversarial Review (Example)
```
A3 SELF-ADVERSARIAL REVIEW
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

A3 Verdict: RESILIENT (3 failure modes identified, all mitigated)
```

### A4 — Scope Validation (Example)
```
A4 SCOPE VALIDATION
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

A4 Result: WARN (1 unexpected change, 1 missing change)
Action: Review unexpected change; implement missing file
```

### A5 — Contract Enforcement (Example)
```
A5 CONTRACT ENFORCEMENT
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

A5 Result: FAIL (1 contract violation)
Action: FIX_REQUIRED — Add expiresIn to refresh response
```

### A6 — Shadow Risk Assessment (Example)
```
A6 SHADOW RISK ASSESSMENT
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

A6 Result: 1 HIGH, 1 MEDIUM, 1 LOW
Action: Tester should prioritize HIGH risk item first
```

---

## BAD vs GOOD Examples

### BAD: Anvil run that rubber-stamps everything
```
/anvil

The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  A1 (Shell Pre-Flight):      PASS
  A2 (Canary Smoke Test):     SKIP (no entry point found)
  A3 (Self-Adversarial):      SKIP (no recent implementation)
  A4 (Scope Validation):      SKIP (no story context)
  A5 (Contract Enforcement):  SKIP (no API contract)
  A6 (Shadow Risk):           SKIP (no changed files)

  Overall: PASS
  Action: CONTINUE
```
Problem: 5 of 6 tiers skipped. This is not a quality gate — it's a rubber stamp. A real Anvil run requires context (changed files, story reference, recent implementation).

### GOOD: Anvil run with thorough validation and actionable findings
```
/anvil

The Anvil — Quality Gate Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  A1 (Shell Pre-Flight):      WARN — 1 banned pattern in src/auth/jwt.ts:42
  A2 (Canary Smoke Test):     PASS — Module imports cleanly
  A3 (Self-Adversarial):      RESILIENT — 3 failure modes, all mitigated
  A4 (Scope Validation):      WARN — 1 unexpected file modified
  A5 (Contract Enforcement):  FAIL — Missing "expiresIn" in refresh response
  A6 (Shadow Risk):           1 HIGH, 1 MEDIUM, 1 LOW

  Overall: FAIL
  Action: FIX_REQUIRED

  Fixes needed:
  1. Remove TODO on line 42 of src/auth/jwt.ts (A1)
  2. Add expiresIn to POST /auth/refresh response (A5)
  3. Review unexpected modification to src/config/database.ts (A4)
```

---

## HANDOFF PROTOCOL

### Anvil -> Fixer (on FAIL)
When Anvil detects failures, route to the Fixer Orchestrator with structured context:

```
ANVIL -> FIXER HANDOFF
━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-XXX
Failed Tiers: [A1, A5]

Violation 1 (A1):
  File: src/auth/jwt.ts
  Line: 42
  Issue: Banned pattern "TODO"
  Fix Type: REMOVE_BANNED_PATTERN (auto-fixable)

Violation 2 (A5):
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
A6 Risk List: [attached for tester reference]
Ready for: Final gate-keeper validation
```

### Anvil -> Coder (on A3 VULNERABLE)
When self-adversarial review finds unmitigated failure modes:

```
ANVIL -> CODER HANDOFF
━━━━━━━━━━━━━━━━━━━━━━
Story: STORY-XXX
A3 Verdict: VULNERABLE

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
| A2 import fails | Missing dependencies | Run package install before retrying |
| A5 no contract found | Story has no API contract section | Skip A5 (not all stories have API contracts) |
| Tier timeout | Check takes too long | Skip tier with TIMEOUT status, log for investigation |

---

## Reflection

See `agents/_reflection-protocol.md`. Before and after each task, self-score **quality**, **correctness**, **completeness** (0-10); if overall < 7.0, revise before handoff.
---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/go` | Anvil runs at every handoff during story execution |
| `/forge` | Anvil is embedded in Phase 2 (Forge) pipeline |
| `/coder` | Anvil A1-A3 run after coder produces implementation |
| `/tester` | Anvil A1 runs after tester produces tests; A6 feeds risk list to tester |
| `/gate-keeper` | A4+A5 integrated into gate-keeper validation |
| `/fixer` | Receives structured violation reports from Anvil on FAIL |
| `/security` | A1 banned pattern scan overlaps with security scanning |
| `/metrics` | Anvil pass/fail rates tracked per tier |

---
name: feature-lifecycle
command: feature
description: Full per-feature pipeline: implement → testloop → evaluator challenge → coder feedback → document → commit. Each stage gates the next. Evaluator findings feed back to the coder. Nothing is committed until tests are green and the evaluator is satisfied.
color: green
---

# Feature Lifecycle Orchestrator

**Role:** Per-feature quality pipeline that takes a story or feature description from zero to a committed, documented, tested, and evaluated implementation. No stage is skipped. No commit happens without the evaluator's approval.

---

## Activation Syntax

```
/feature                            Prompt for story or description
/feature STORY-001                  Run lifecycle for a specific story file
/feature "description of feature"   Run lifecycle for an inline description
/feature --dry-run                  Preview pipeline without executing
/feature --from challenge           Resume from a specific stage
/feature --no-commit                Run full pipeline but don't commit
/feature --override "reason"        Accept current gate failure with logged tradeoff
/feature --exec-mode advisory       Force advisory mode (no shell-based test claims)
/feature --detect-stack             Re-run stack detection before starting
/feature --lite                     Lite mode: no shadow tester, no Anvil, single-pass evaluator
```

---

## Hard Rules

- **NEVER** commit before the evaluator gives ✅ or 🟡-resolved verdict
- **NEVER** skip the testloop — "it compiles" is not proof
- **NEVER** accept evaluator findings as informational — all 🔴 findings produce fix briefs that go back to the coder
- **NEVER** write documentation for code that has failing tests
- **NEVER** commit unrelated files — stage only the files touched by this feature
- **ALWAYS** track state across stages — a failed stage can be resumed
- **STOP** and escalate on evaluator verdict 🚫 (full rewrite) — human decision required

---

## State File

All stage state is tracked in `.claude/local/feature-state.json`:

```json
{
  "story_id": "STORY-001",
  "feature": "User authentication — JWT login flow",
  "stage": "implement | testloop | challenge | document | commit | done | halted",
  "status": "running | success | halted",
  "started_at": "ISO8601",
  "stages": {
    "implement": { "status": "done", "files_modified": ["src/auth/auth.service.ts"] },
    "testloop": { "status": "done", "iterations": 2, "final_pass_rate": "100%" },
    "challenge": {
      "cycles": 2,
      "verdicts": ["🟡", "✅"],
      "fix_briefs_sent": 1,
      "final_verdict": "✅"
    },
    "document": { "status": "done", "files_updated": ["CHANGELOG.md", "docs/api_reference.md"] },
    "commit": { "status": "done", "hash": "abc1234", "message": "feat(auth): JWT login flow [STORY-001]" }
  }
}
```

---

## Pre-Flight (runs before Stage 1)

### P1: Execution Context

Run `agents/_execution-context.md` detection (or read `.claude/local/execution-context.json`).
Display mode:
```
EXECUTION MODE: REAL | ADVISORY | DEGRADED
```
In ADVISORY mode: all test claims use qualified language ("appears correct — verify manually"). Commit body appends `[ADVISORY MODE]`.

### P2: Stack Profile

Read `.claude/shared/stack-profile.json`. If missing, run `agents/_stack-profile.md` detection and write it now. All stages use profiled commands — never hardcode.

### P3: Complexity Classification

Estimate the feature scope and classify:

| Tier | Signals | Pipeline |
|------|---------|----------|
| `MICRO` | 1 file, trivial change, no new API surface | Redirect to `/quick` |
| `SMALL` | 1–3 files, no new DB schema, no auth change | `/feature --lite` (no shadow tester, no Anvil) |
| `MEDIUM` | 3–10 files, or new endpoint, or DB migration | Full `/feature` pipeline |
| `LARGE` | 10+ files, or multi-story, or auth/security change | Full `/feature` + recommend `/forge` |

If `MICRO` is detected:
```
ℹ️  This looks like a MICRO change (1 file, trivial).
    Redirecting to /quick for lighter ceremony.
    Use /feature --force to run the full pipeline anyway.
```

If `LARGE` is detected:
```
⚠️  This looks like a LARGE feature (10+ files or security-critical).
    Consider using /forge for multi-story orchestration.
    Continuing with /feature — all stages apply.
```

Read complexity routing setting from `.claude/shared/config.json`. If `"complexity_routing": false`, skip classification and always run full pipeline.

### P4: Tone

Read `"tone"` from `.claude/shared/config.json`. If `"professional"`, use neutral language throughout:
- "BLOCKED" instead of "REJECTED"
- "Issues found" instead of "Brutal assessment"
- "Review required" instead of "Full rewrite"
- "Pipeline halted" instead of "HALT"

Default is `"cold-blooded"` if config not found.

---

## Stage 1: IMPLEMENT

### Input
- Story file from `docs/stories/` OR inline feature description

### If story file provided
Read the story completely:
- Acceptance criteria (Gherkin format)
- Technical approach and code patterns
- Dependencies on other stories
- Security checklist

### If description provided
Synthesize a minimal story context:
- Derive acceptance criteria from the description
- Identify the affected layer (DB / Backend / Frontend)
- Flag any missing context as a clarification question before starting

### Coder Behavior (TDD-first, per `_tdd-protocol.md`)
1. **RED** — Write a failing test for the first acceptance criterion
2. **GREEN** — Write minimal implementation to pass
3. **REFACTOR** — Clean up while tests stay green
4. Repeat for each acceptance criterion

**Shadow Tester** runs in parallel (per `_shadow-tester.md`):
- Reads the coder's output as it's produced
- Generates a ranked risk list: HIGH / MEDIUM / LOW
- This risk list feeds into Stage 3 (Challenge) — does NOT block Stage 1

### Stage 1 Complete When
- All acceptance criteria have corresponding implementation
- No banned patterns present (`TODO`, `PLACEHOLDER`, `STUB`, etc.)
- At least one test file exists
- Shadow Tester risk list generated

### Stage 1 Output
```
STAGE 1 COMPLETE — IMPLEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story:     STORY-001 (or inline: "user auth")
Files:     src/auth/auth.service.ts (+142 lines)
           src/auth/auth.controller.ts (+67 lines)
Tests:     tests/auth/auth.service.test.ts (+89 lines)
ACs Done:  4 / 4

Shadow Risk:
  HIGH:   Token expiry not enforced in validateToken()
  MEDIUM: No rate limiting on login endpoint
  LOW:    Missing JSDoc on 2 public methods

→ Proceeding to Stage 2: TestLoop
```

---

## Stage 2: TESTLOOP

Invoke the `/testloop` skill (per `agents/testloop.md`) with the scope appropriate to the feature:
- DB-only change → unit tests only
- API endpoint → unit + integration
- UI component → unit + Playwright E2E

### TestLoop Parameters
```
/testloop all --max 5 --story [story-id]
```

### Stage 2 Complete When
- ALL tests pass (0 failures)
- Coverage meets threshold (80% lines minimum)
- No timeout errors

### If TestLoop Escalates (oscillation or max iterations)
```
⛔ STAGE 2 BLOCKED — TestLoop could not converge

Unresolved failures:
  1. [suite > test] — oscillated 3 times
  2. ...

Options:
  A) Fix the oscillating failure manually, then: /feature --from testloop
  B) Review test expectations with: /tester
  C) Redesign the affected component with: /architect
  D) Accept with override: /feature --override "accepting N failures: [reason]"
     (logged to logs/overrides.md — evaluator will see failures in Stage 3)

Feature lifecycle HALTED. State saved to .claude/local/feature-state.json.
```

### Stage 2 Output
```
STAGE 2 COMPLETE — TESTLOOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Iterations:  2 / 5
Tests:       89 passed, 0 failed
Coverage:    91.2% lines | 84.5% branches
E2E:         12 scenarios passed (Playwright)

→ Proceeding to Stage 3: Challenge
```

---

## Stage 3: CHALLENGE

### 3a: Semgrep Scan (runs first, per `agents/_semgrep-bridge.md`)

Before the LLM evaluator, run Semgrep on all modified files if available:

```bash
# Check availability
which semgrep >/dev/null 2>&1 && SEMGREP=true || SEMGREP=false

# Run if available
$SEMGREP && semgrep --config config/semgrep-rules/ --json \
  --output .claude/local/semgrep-results.json [modified_files...]
```

- **ERROR findings** → HARD BLOCK. Generate fix brief → coder fixes → re-scan. No LLM evaluator until zero hard blocks.
- **WARNING findings** → pass to LLM evaluator as additional context.
- **Semgrep not installed** → log advisory notice, proceed to LLM evaluator.

Semgrep hard blocks are **not overridable** with `--override`. They must be fixed.

### 3b: LLM Evaluator

The evaluator reviews the implementation with full context:
- Story acceptance criteria
- All modified files
- TestLoop results (pass rate, coverage, iterations used)
- Shadow Tester risk list from Stage 1
- Semgrep WARNING findings (if any)

Invoke `/evaluator` with this context bundle.

### Evaluator Verdict → Action Map

| Verdict | Meaning | Action |
|---------|---------|--------|
| ✅ **Acceptable** | Passes all standards, minor suggestions only | Proceed to Stage 4 |
| 🟡 **Needs partial refactor** | Non-critical issues, fixable without retesting | Generate fix brief → coder applies → re-evaluate (no testloop re-run unless logic changed) |
| 🔴 **Critical flaw** | Security, correctness, or architecture violation | Generate fix brief → coder fixes → **re-run TestLoop** → re-evaluate |
| 🚫 **Full rewrite** | Fundamental design failure, BPSBS violation | **HALT** — options below |

**On 🚫 verdict:**
```
Options:
  A) Accept the evaluator's recommendation and redesign with: /architect
  B) Override with documented reason: /feature --override "proceeding despite 🚫: [reason]"
     (logged to logs/overrides.md — override note added to commit body)
  C) Escalate for human review and stop here

Note: --override on a 🚫 verdict is permitted but strongly discouraged.
      The evaluator's reasoning and the override reason are both recorded.
```

### Fix Brief Format (for 🟡 and 🔴)

When the evaluator returns findings, generate a targeted fix brief per finding and dispatch to the coder:

```
CHALLENGE FIX BRIEF — Cycle [N]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Finding: [Evaluator finding title]
Severity: [HIGH | MEDIUM | LOW]
File: [path:line]

Evaluator Judgment:
"[Exact evaluator finding text — no paraphrasing]"

Required Fix:
[Specific, actionable instruction for the coder]

Do NOT:
- Modify unrelated code
- Add new features
- Change test logic unless explicitly needed
```

### Challenge Cycle Limits

- Max challenge cycles: **3**
- After 3 cycles with same finding at 🔴: escalate to human (oscillation guard)
- 🟡 findings: max 2 re-challenge cycles before accepting with documented tradeoff

### Oscillation Guard

If the same finding appears in 3 consecutive evaluator verdicts:
```
⚠️ CHALLENGE OSCILLATION
Finding "[finding]" has persisted through 3 fix cycles.
The coder is unable to resolve this within the current architecture.

Escalating to: /architect for structural review.
Feature lifecycle PAUSED. Resumable with: /feature --from challenge
```

### Stage 3 Output
```
STAGE 3 COMPLETE — CHALLENGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cycles:    2 (1 fix brief dispatched)
Verdicts:  🟡 → ✅
Findings resolved:
  ✓ Added input validation on login endpoint [MEDIUM]
  ✓ Fixed missing error logging in auth flow [LOW]

Final Verdict: ✅ Acceptable

→ Proceeding to Stage 4: Document
```

---

## Stage 4: DOCUMENT

Invoke `/docs` (documentation-codifier) with:
- List of all files modified in Stages 1 and 3
- Story acceptance criteria (what the feature does)
- API endpoints added or changed
- Evaluator verdict and any documented tradeoffs

### What Gets Documented

| Target | Condition | Content |
|--------|-----------|---------|
| **JSDoc / docstrings** | Any new public method, class, or endpoint | Description, params, return type, exceptions |
| **CHANGELOG.md** | Always | Entry under `[Unreleased]` following Keep a Changelog format |
| **docs/api_reference.md** | If new endpoints added/changed | Endpoint path, method, request/response schema, auth requirements |
| **README.md** | Only if user-visible feature (new CLI flag, new UI screen, new capability) | Update features list or usage section |

### Documentation Rules (from documentation-codifier)
- README is user-facing only — no internal implementation details
- CHANGELOG gets all technical changes: breaking, migration, API, behavior
- JSDoc is MANDATORY for all new public API surface
- Stale docs are bugs — update any existing docs that the feature makes incorrect

### Stage 4 Complete When
- All new public methods have JSDoc / docstrings
- CHANGELOG has an entry for this feature
- API reference updated if endpoints changed
- No stale documentation remains

### Stage 4 Output
```
STAGE 4 COMPLETE — DOCUMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSDoc:      4 methods documented
CHANGELOG:  [Added] JWT login flow with refresh token support
API Ref:    /auth/login, /auth/logout, /auth/refresh documented
README:     Updated — "Authentication" section added

→ Proceeding to Stage 5: Commit
```

---

## Stage 5: COMMIT

Stage and commit only the files touched by this feature lifecycle. Never commit unrelated changes.

### Files to Stage

Collect from state: all files modified in Stages 1, 3, and 4.

```bash
# Stage only feature-related files
git add [implementation files] [test files] [doc files]

# Verify nothing unintended is staged
git diff --cached --name-only
```

If unrelated modified files are detected in `git status`: **do NOT stage them**. Report them as unstaged changes for the user to handle.

### Convention-Aware Commit

Before formatting the commit, read `.claude/shared/conventions.json` (per `agents/_convention-discovery.md`):
- Use `conventions.commits.format` to pick the commit prefix style
- Use `conventions.commits.ticket_pattern` to place the story reference correctly
- Update the correct changelog file (`conventions.changelog.file`) in the detected format

If `conventions.json` does not exist: use Conventional Commits (default SkillFoundry format).

### Commit Message Format

Follow detected conventions (or Conventional Commits default) + story reference:

```
feat(scope): short description of what was built

Story: STORY-XXX
Evaluator: ✅ Acceptable
Tests: 89 passed, 0 failed (91.2% coverage)
Playwright: 12 E2E scenarios

[List key changes if more than one file changed]
- Add JWT login endpoint at /auth/login
- Add refresh token rotation
- Add token blacklisting on logout

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Commit Type Mapping

| Feature Type | Prefix |
|-------------|--------|
| New feature | `feat` |
| Bug fix | `fix` |
| Performance | `perf` |
| Documentation only | `docs` |
| Refactor (no behavior change) | `refactor` |
| Tests only | `test` |
| Breaking change | `feat!` or `fix!` |

### Audit Trail

After commit, append an audit entry per `agents/_audit-export.md`:

```bash
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"type\":\"feature_commit\",...}" >> logs/audit-trail.jsonl
```

If `audit_webhook` is configured in `.claude/shared/config.json`, POST the entry there (fire-and-forget, non-blocking).

### Stage 5 Output
```
STAGE 5 COMPLETE — COMMIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hash:     abc1234
Message:  feat(auth): JWT login flow with refresh token support [STORY-001]
Files:    7 files committed
          src/auth/auth.service.ts
          src/auth/auth.controller.ts
          tests/auth/auth.service.test.ts
          tests/auth/auth.e2e.spec.ts
          docs/api_reference.md
          CHANGELOG.md

Unstaged (not part of this feature):
  M  src/unrelated-file.ts  ← user must handle separately
```

---

## Final Summary

After Stage 5 completes:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ FEATURE LIFECYCLE COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Story:      STORY-001 — JWT Login Flow
Duration:   ~18 min total
Exec Mode:  REAL | ADVISORY

Stage Results:
  ✓ IMPLEMENT    4/4 ACs covered | Shadow risk: 1 HIGH, 1 MEDIUM, 1 LOW
  ✓ SEMGREP      0 hard blocks | 1 warning (passed to evaluator)
  ✓ TESTLOOP     89 tests pass | 91.2% coverage | 2 iterations
  ✓ CHALLENGE    2 cycles | 1 fix applied | Final verdict: ✅ Acceptable
  ✓ DOCUMENT     CHANGELOG + API ref + 4 JSDoc entries
  ✓ COMMIT       abc1234 — feat(auth): JWT login flow [STORY-001]

Evaluator Final Verdict: ✅ Acceptable
  Minor findings documented (non-blocking):
  - Consider adding rate limiting in a follow-up story

Overrides used: [none | N override(s) — see logs/overrides.md]

Next Steps:
  → Ready for PR creation: gh pr create
  → Or: /forge to continue with next story
```

### HTML Report (optional)

If `"reports.generate_html": true` in `.claude/shared/config.json`, generate `reports/feature-[story-id]-[timestamp].html` — a single-file, dependency-free report:

```html
<!-- reports/feature-STORY-001-20260622-1130.html -->
<!-- Single file, pure HTML + inline CSS. No JS dependencies. Opens in any browser. -->
```

**Report contents:**
- Feature title, story ID, timestamp, duration, execution mode
- Stage outcomes table (pass/fail/skipped, duration per stage)
- Test results: pass count, coverage, E2E scenarios
- Semgrep findings (hard blocks + warnings)
- Evaluator verdict + all findings (resolved and unresolved)
- Files committed
- Override log (if any)

Report path is shown in the Final Summary output above.

---

## Integration Map

| Agent / Protocol | Used In Stage |
|-----------------|---------------|
| `_execution-context.md` | Pre-flight — REAL/ADVISORY/DEGRADED detection |
| `_stack-profile.md` | Pre-flight — test commands, E2E commands, build commands |
| `ruthless-coder` | Stage 1 — implementation |
| `_tdd-protocol.md` | Stage 1 — RED/GREEN/REFACTOR discipline |
| `_shadow-tester.md` | Stage 1 — risk list for evaluator |
| `testloop` | Stage 2 — test execution feedback loop |
| `_semgrep-bridge.md` | Stage 3 — hard-block static analysis (before LLM evaluator) |
| `merciless-evaluator` | Stage 3 — LLM quality challenge |
| `_bidirectional-iteration.md` | Stage 3 — oscillation detection |
| `documentation-codifier` | Stage 4 — docs generation |
| `_convention-discovery.md` | Stage 4+5 — changelog format, commit style, test file naming |
| `_commit-trailers.md` | Stage 5 — commit format |
| `_audit-export.md` | Stage 5 — audit trail entry after commit |
| `_evaluator-calibration.md` | Stage 3b — calibration context loaded by evaluator |
| `logs/overrides.md` | All stages — override decisions logged here |
| `logs/audit-trail.jsonl` | Stage 5 — append-only structured audit record |

---

## Error Recovery

All stages write to `.claude/local/feature-state.json`. A failed or interrupted lifecycle can be resumed:

```
/feature --from testloop     Resume from Stage 2
/feature --from challenge    Resume from Stage 3
/feature --from document     Resume from Stage 4
/feature --from commit       Resume from Stage 5
```

---

*Feature Lifecycle Orchestrator v1.0.0 — SkillFoundry Framework*
*Pipeline: Implement → TestLoop → Challenge → Document → Commit*

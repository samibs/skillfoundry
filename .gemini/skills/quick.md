# /quick

Gemini skill for `quick`.

## Instructions

# /quick — Lightweight Feature Workflow

**Role:** Minimal-ceremony feature workflow for solo developers and small changes. Implement → test → commit. No PRD required, no full pipeline overhead.

---

## Usage

```
/quick "description"          Implement, test, and commit a small feature
/quick "description" --challenge   Add evaluator challenge (optional)
/quick "description" --no-commit   Implement and test, skip commit
```

---

## When to use

- Solo developer, informal feature request
- Small improvements (a flag, a config option, a new utility function)
- Prototyping before formalizing into a PRD
- Dark mode toggle, UI tweaks, non-critical additions

## When NOT to use

- Production auth, payments, security-critical features → use `/feature`
- Multi-story features → use `/forge`
- When you need the full evaluator + docs pipeline → use `/feature`

---

## The Pipeline

```
/quick "add dark mode toggle to settings page"

  STEP 1: IMPLEMENT    Coder builds it (TDD when test scope is clear)
  STEP 2: TESTLOOP     Tests run, fixes loop until green (max 3 iterations)
  STEP 3: COMMIT       Scoped commit [ADVISORY if no shell]

  Optional (--challenge flag only):
  STEP 2.5: CHALLENGE  Evaluator grades. Fix brief loops back to coder.
```

No shadow tester. No Anvil gates. No layer-check. No docs stage (code-level comments only). No security audit.

---

## Behavior

### Step 1: Implement

Coder reads the description and implements:
- If test scope is obvious (function, endpoint, component) → TDD: test first
- If test scope is unclear (UI tweak, config change) → implement then test
- Banned patterns still apply (no TODO, STUB, hardcoded secrets)
- No formal story scaffolding required

### Step 2: TestLoop

Run `/testloop` with reduced settings:
```
/testloop --max 3 [auto-detected scope]
```

Max 3 iterations (vs. 5 in full `/feature`). If not converging after 3, report failures and stop — no further auto-fix. User decides next action.

### Step 2.5: Challenge (optional, `--challenge` flag only)

If `--challenge` is passed: run evaluator. Its findings produce fix briefs back to the coder, then one re-test. Max 1 challenge cycle in quick mode.

If evaluator returns 🚫: promote to `/feature` automatically:
```
⚠️  Quick mode cannot resolve a 🚫 verdict.
    This feature needs the full pipeline: /feature "description"
    State saved — continuing from challenge stage.
```

### Step 2.8: Security-Critical Pattern Scan (always runs, before commit)

Before committing, scan the changed files for security-critical patterns that `/quick` does not have a full security review for:

```bash
# Patterns that auto-escalate to /feature regardless of context
CRITICAL_PATTERNS=(
  "localStorage.setItem.*token"   # token in localStorage
  "sessionStorage.setItem.*token" # token in sessionStorage
  "password.*=.*['\"][^'\"]{3,}" # possible hardcoded password
  "secret.*=.*['\"][^'\"]{8,}"   # possible hardcoded secret
  "algorithm.*HS256"              # HS256 JWT
  "eval("                         # code execution
  "child_process.exec("           # shell injection surface
)

grep -rn "${CRITICAL_PATTERNS[@]}" [changed_files] 2>/dev/null
```

If any match is found:

```
⛔ QUICK MODE ESCALATION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Security-critical pattern detected in changed files:
  [file:line] — [matched pattern]

/quick does not include a security audit.
This change requires the full pipeline:

  /feature "description"    Full pipeline with security evaluation
  /hotfix "description"     If this is a production fix (logs bypass)

Reason: Quick mode is not appropriate for security-sensitive changes.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This escalation is **not overridable in quick mode**. Use `/feature --override` if you have a documented reason.

### Step 3: Commit

Same commit format as `/feature` but with `[quick]` tag:

```
feat(scope): description [quick]

Tests: N passed
Mode: REAL | ADVISORY

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

No evaluator verdict in commit body (unless `--challenge` was used).

---

## Explicit limitations banner

Quick mode always opens with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ QUICK MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Not forge-grade. Skipped: PRD validation, shadow tester,
Anvil gates, layer-check, security audit, full docs.

For production-critical features: /feature "description"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This is not negotiable — the user must see the scope reduction.

---

## Escalation path

If at any point quick mode hits something that requires more rigor:

| Situation | Action |
|-----------|--------|
| TestLoop oscillates (3+ same failure) | STOP — report failures — suggest `/feature --from testloop` |
| Evaluator returns 🚫 (if `--challenge` used) | Promote to `/feature` automatically |
| Banned pattern found | STOP — same as full pipeline |
| Hardcoded secret found | STOP — BPSBS zero-tolerance, no override |

---

## State

Quick mode writes minimal state to `.claude/local/quick-state.json`:
```json
{
  "description": "add dark mode toggle",
  "status": "running | success | halted",
  "step": "implement | testloop | commit | done",
  "files_modified": [],
  "commit_hash": null
}
```

Resume with: `/quick --resume`

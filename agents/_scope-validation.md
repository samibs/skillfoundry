# The Anvil — Tier 4: Scope Validation

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: Gate-Keeper Validation Phase
**Protocol**: See `agents/_anvil-protocol.md` for overview

---

## Purpose

Compare the files a story declared it would change against the files that were actually changed. This catches two problems:

1. **Incomplete implementation**: Expected files were NOT changed (story didn't finish)
2. **Scope creep**: Unexpected files WERE changed (story did more than declared)

---

## When to Run

- During Gate-Keeper validation
- After Coder + Tester complete
- Before final gate verdict

---

## Story Metadata: Expected Changes

Stories should declare their expected changes in a structured section:

```markdown
### Expected Changes
Files this story should create or modify:
- Create: `src/services/payment.py`, `tests/test_payment.py`
- Modify: `src/routes/api.py`, `src/models/user.py`
```

If a story lacks this section, scope validation logs a WARNING and skips (does not block).

---

## Validation Process

### Step 1: Extract Expected Changes

Parse the story file for the "Expected Changes" section. Extract two lists:
- **expected_create**: Files that should be newly created
- **expected_modify**: Files that should be modified

### Step 2: Get Actual Changes

Run `git diff --name-only` (or `git diff --name-only HEAD` if commits were made) to get the list of files that actually changed during this story's implementation.

### Step 3: Compare

| Comparison | Result | Severity |
|------------|--------|----------|
| Expected file NOT in actual changes | **Incomplete implementation** | BLOCK |
| Actual file NOT in expected list | **Scope creep** | WARN |
| File in both expected and actual | **Match** | PASS |
| Expected file was created (and it exists) | **Match** | PASS |

---

## Output Format

```markdown
ANVIL CHECK: T4 Scope Validation — [story ID]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Expected Changes:
  Create: [list]
  Modify: [list]

Actual Changes:
  [list from git diff]

Comparison:
  [PASS] src/services/payment.py — created as expected
  [PASS] tests/test_payment.py — created as expected
  [PASS] src/routes/api.py — modified as expected
  [BLOCK] src/models/user.py — expected modification NOT found
  [WARN] src/utils/helpers.py — unexpected change (scope creep?)

Status: PASS / WARN / FAIL
Action: CONTINUE / FIX_REQUIRED / BLOCK
```

---

## Shell Integration

The `scripts/anvil.sh scope <story-file>` command implements the shell-level scope check. It:
1. Parses expected changes from the story markdown
2. Runs `git diff --name-only`
3. Compares and reports

---

## Handling Scope Creep

When unexpected files are changed:

- **WARN severity** (default): Log the unexpected change but don't block
- Scope creep is sometimes legitimate (e.g., updating an import in a related file)
- Gate-Keeper reviews warnings and may escalate if the changes look unrelated

### When scope creep becomes a BLOCK:

- Changes to security-sensitive files (auth, config, middleware) not declared in story
- Changes to files owned by a different story (parallel execution conflict)
- Changes to test fixtures or shared utilities without story mandate

---

## T4b: Traceability Test (Line-Level)

T4 validates at the **file level** (expected vs actual files changed). T4b goes deeper: it validates at the **line level** that every changed line traces directly to the user's request.

> **Core Question**: "Can every changed line trace directly to the user's request? If not, flag the unrelated changes."

### When to Run

- After T4 passes (T4b is a sub-check of T4, not independent)
- Only on files that passed T4 (i.e., expected or accepted scope-creep files)
- Skipped if T4 fails with BLOCK (no point checking lines if files are wrong)

### Process

#### Step 1: Extract Request Intent

From the story or task, extract the stated goal and acceptance criteria:

```
REQUEST: "Add rate limiting to login endpoint"
INTENT: Changes should relate to rate limiting, login, authentication, middleware
```

#### Step 2: Categorize Changed Lines

For each changed file, categorize hunks from `git diff`:

| Category | Description | Severity |
|----------|-------------|----------|
| **Direct** | Line directly implements the request | PASS |
| **Supporting** | Line is required to support the request (imports, type updates) | PASS |
| **Orthogonal** | Line is unrelated to the request (formatting, renaming, "cleanup") | WARN |
| **Suspicious** | Line modifies security/auth/config with no clear link to request | BLOCK |

#### Step 3: Report

```markdown
ANVIL CHECK: T4b Traceability Test — [story ID]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Request Intent: [summary of what was asked]

Line Traceability:
  [PASS] src/middleware/rate-limiter.ts:1-45 — Direct: implements rate limiting
  [PASS] src/routes/auth.ts:12 — Supporting: imports rate limiter middleware
  [WARN] src/routes/auth.ts:28 — Orthogonal: reformatted existing comment
  [BLOCK] src/config/security.ts:5 — Suspicious: changed JWT expiry (not in request)

Summary: 45 lines direct, 1 line supporting, 1 line orthogonal, 1 line suspicious

Status: WARN
Action: Review orthogonal/suspicious changes. Revert or justify.
```

### Deviation Reference

This check directly prevents:
- **LLM-020**: Orthogonal/drive-by changes (see `agents/_known-deviations.md`)
- **LLM-016**: Ignoring the project's existing patterns (when "cleanup" rewrites style)

### Severity Rules

- **Orthogonal changes in non-sensitive files**: WARN (log, don't block)
- **Orthogonal changes in security-sensitive files**: BLOCK (must revert or justify)
- **>20% of changed lines are orthogonal**: Escalate to WARN regardless of file type
- **Any suspicious line in auth/config/middleware**: BLOCK

### Handling Flagged Lines

When T4b flags orthogonal or suspicious changes:

1. **WARN**: Gate-Keeper logs the warning. Coder is asked to justify or revert in next iteration
2. **BLOCK**: Route to Fixer Orchestrator with violation type: `orthogonal_change`
3. Fixer generates a revert patch for the flagged hunks only (surgical, not full file revert)

---

## Handling Missing Changes

When expected files were NOT changed:

- **BLOCK severity**: Story is incomplete
- Route to Fixer Orchestrator with violation type: `incomplete_implementation`
- Fixer routes back to Coder with specific list of unmodified files

---

*The Anvil T4 — What you said you'd change, you must change. What you didn't say you'd change, explain why.*

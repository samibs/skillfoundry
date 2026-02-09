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

## Handling Missing Changes

When expected files were NOT changed:

- **BLOCK severity**: Story is incomplete
- Route to Fixer Orchestrator with violation type: `incomplete_implementation`
- Fixer routes back to Coder with specific list of unmodified files

---

*The Anvil T4 — What you said you'd change, you must change. What you didn't say you'd change, explain why.*

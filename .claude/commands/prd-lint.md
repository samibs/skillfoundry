# /prd-lint — PRD Linter

> Validates a PRD against the SkillFoundry template structure before /go or /forge runs on it.

---

## Usage

```
/prd-lint                     Lint all PRDs in genesis/
/prd-lint <file>              Lint a specific PRD file
/prd-lint --strict <file>     Fail on warnings too (CI mode)
/prd-lint --fix <file>        Auto-fix common issues (add missing sections as stubs)
```

---

## Instructions

You are the **PRD Linter**. When invoked, run structural validation on PRD files in `genesis/` to catch issues before they enter the implementation pipeline.

### When invoked with no arguments:

Run `bash scripts/prd-lint.sh genesis/` and report results.

### When invoked with a file:

Run `bash scripts/prd-lint.sh <file>` and report results.

### When invoked with `--strict`:

Run `bash scripts/prd-lint.sh --strict <file>` — treats warnings as errors. Use in CI or pre-/go gates.

### When invoked with `--fix`:

After running the linter, auto-fix issues you can address without user input:
- Add missing required sections as stubs (e.g., `## 8. Regression Surface` with empty table)
- Add `FR-IDs` column to user story tables if missing
- Add `- [ ] No new CRITICAL GuardLoop patterns detected` to Definition of Done if missing
- **Do not** fill in content that requires user knowledge (problem statement, constraints, etc.)

---

## What the Linter Checks

| Check | Level | Description |
|-------|-------|-------------|
| Front matter starts file | ERROR | File must open with `---` on line 1 |
| Required front matter fields | ERROR | prd_id, title, status, created, author |
| `layers:` not empty | ERROR | Must declare: [database, backend, frontend] |
| Required sections present | ERROR | §1–§5, §7–§11 must all exist |
| No TBD/TODO markers | ERROR | Outside comment blocks — blocks /go |
| status: DRAFT | WARN | Confirm PRD is ready |
| Vague language | WARN | might/maybe/possibly/somehow |
| Unchecked checkboxes `[ ]` | WARN | Unverified dependency versions |
| §6 Contract not empty | WARN | If present, must have content or Skip reason |
| §8 Regression Surface rows | WARN | Must list at least one feature at risk |
| §11.1 GuardLoop DoD item | WARN | Missing `/guardloop scan` clean check |
| §2 FR-IDs column | WARN | User story table missing traceability column |

---

## Output Format

```
PRD Linter: my-feature.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [ERROR]  layers: is empty. Must declare affected layers.
  [ERROR]  Missing required section: ## 8. Regression Surface
  [WARN]   PRD status is DRAFT — confirm it is ready before running /go
  [WARN]   2 instance(s) of vague language (might/maybe/possibly).

VERDICT: FAIL — 2 error(s), 2 warning(s), 8 passed
  Action: BLOCK — fix errors before /go
```

---

## Integration with /go

The `/go` pipeline should call `/prd-lint` as the first gate before executing any PRD:

```
/go [prd-file]
  └─ Step 0: /prd-lint <prd-file>
      ├─ PASS → proceed with story generation
      ├─ WARN → prompt user: "Warnings found. Proceed? [Y/n]"
      └─ FAIL → BLOCK — output lint errors and stop
```

---

## Examples

### Linting before /go
```
/prd-lint genesis/2026-05-13-user-auth.md

PRD Linter: 2026-05-13-user-auth.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [WARN]   PRD status is DRAFT — confirm it is ready before running /go
  [WARN]   §8 Regression Surface table has no rows.

VERDICT: WARN — 0 errors, 2 warning(s), 10 passed
  Action: REVIEW — warnings logged, proceed with caution
```

### Linting entire genesis/ folder
```
/prd-lint

PRD Linter: 2026-05-13-user-auth.md  → WARN (2 warnings)
PRD Linter: 2026-05-12-payments.md   → PASS
PRD Linter: 2026-05-10-notifications.md → FAIL (1 error)

═══════════════════════════════════════════════════════════
  PRDs linted: 3   Failed: 1   Passed: 2
═══════════════════════════════════════════════════════════
```

---

## REFLECTION PROTOCOL

Before reporting results, verify:
- Did the script run successfully? (check exit code)
- Are error messages actionable? (point to specific lines/sections)
- Should `--fix` be suggested for auto-fixable issues?

**Threshold**: If 3+ PRDs fail in genesis/, pause and report the common pattern — it may indicate a template issue rather than individual PRD problems.

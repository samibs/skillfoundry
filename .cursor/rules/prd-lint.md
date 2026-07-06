---
description: /prd-lint — PRD Linter
globs:
alwaysApply: false
---

# prd-lint — Cursor Rule

> **Activation**: Say "prd-lint" or "use prd-lint rule" in chat to activate this workflow.
> **Platform**: Cursor (rule-based context, not slash-command invocation)

# /prd-lint — PRD Linter

> Validates a PRD before /go or /forge runs on it — structural checks (template) **and** a semantic reasoning pass that catches requirement contradictions and gaps before a line of code exists.

---

## Usage

```
/prd-lint                     Lint all PRDs in genesis/
/prd-lint <file>              Lint a specific PRD file
/prd-lint --strict <file>     Fail on warnings too (CI mode)
/prd-lint --fix <file>        Auto-fix common issues (add missing sections as stubs)
/prd-lint --reason <file>     Semantic pass only: reason over content for contradictions + gaps
```

A full lint runs **two phases**: structural checks (the `scripts/prd-lint.sh` script) *then* the semantic consistency pass below. Structure is necessary but not sufficient — a PRD can be perfectly formatted and still tell the pipeline to build two things that can't both be true.

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

## Semantic Consistency — Contradictions & Gaps (reasoning pass)

The structural script above cannot read meaning. After it runs, **reason over the PRD's actual content** for the two failure classes that silently produce wrong code — the requirements the pipeline will otherwise resolve arbitrarily. Read every requirement, story, data model, and contract, then check them against each other.

### Contradictions (a requirement conflicts with another) → **ERROR**

The pipeline cannot satisfy both; it will pick one side at random. Look for:

- **Architectural** — "stateless service" vs. "store session server-side"; "no external dependencies" vs. a story integrating a third-party API.
- **Data** — a field a story reads/writes that the data model never defines (or defines with a conflicting type); an entity created in one story and assumed pre-existing in another.
- **Behavioral / authz** — the same route described as both public and admin-only; conflicting rate limits, retention periods, or status codes for one endpoint.
- **Non-functional vs. functional** — a stated "p99 < 100ms" against a story that makes N synchronous external calls in the hot path.

### Gaps (under-specification the pipeline will guess at) → **WARN** (security/data gaps → **ERROR**)

- **Error behavior** — a flow or endpoint with no defined failure/error response.
- **Authorization** — a protected resource with no stated who-can-access rule.
- **Edge cases** — empty / null / max-size / concurrent inputs unaddressed for a stated operation.
- **Unmeasurable acceptance criteria** — "fast", "secure", "scalable" with no number or testable definition.
- **Data lifecycle** — creation without deletion/retention; a stateful entity with no defined transitions.
- **Referenced-but-undefined** — a story cites an entity, endpoint, role, or config the PRD never specifies.

### Report each finding as

```
[CONTRADICTION] §<a> ↔ §<b> — <the conflict> — will implement <one side> arbitrarily — DECISION NEEDED: <the choice the PRD must make>
[GAP]           §<x>          — <what's undefined> — pipeline will assume <default> — SPECIFY: <what to add>
```

A PRD with any **CONTRADICTION** is `FAIL` regardless of structural score — resolve it before `/go` or `/forge`, because no downstream gate can catch a requirement that was wrong on purpose. This is verification moved to the cheapest possible point: before a line of code exists.

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

---

## How to Use in Cursor

This rule activates when you reference it in chat. Examples:
- "use prd-lint rule"
- "prd-lint — run the workflow"
- "follow the prd-lint workflow for this task"

Cursor loads this rule as context. It does NOT use /slash-command syntax.

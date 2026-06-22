# /feature — Feature Lifecycle Orchestrator

**Role:** Per-feature pipeline that takes a story or description from zero to a committed, documented, tested, and evaluator-approved implementation.

**Persona:** See `agents/feature-lifecycle.md` for full agent definition.

---

## Usage

```
/feature                            Prompt for story or description
/feature STORY-001                  Run lifecycle for a specific story file
/feature "description of feature"   Run lifecycle for an inline description
/feature --dry-run                  Preview pipeline stages without executing
/feature --from challenge           Resume from a specific stage
/feature --no-commit                Run full pipeline but skip the commit
```

---

## The Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                   FEATURE LIFECYCLE PIPELINE                    │
│                                                                  │
│  STAGE 1        STAGE 2        STAGE 3        STAGE 4  STAGE 5  │
│                                                                  │
│  IMPLEMENT  →  TESTLOOP   →  CHALLENGE  →  DOCUMENT  →  COMMIT  │
│                                                                  │
│  Coder +       Run tests       Evaluator       Docs              git commit  │
│  TDD first  →  Fix loop    →  grades it    →  + CHANGELOG        scoped to  │
│  Shadow        Playwright      Fix brief   →  + JSDoc            feature    │
│  Tester        E2E too     →  back to       → API ref            files only │
│  risk list     ≤5 iters       coder                              │
│                               ≤3 cycles                          │
│                               ✅ then next                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stage Behavior

Follow the full execution protocol in `agents/feature-lifecycle.md`.

### Stage 1: IMPLEMENT
- Coder reads story/description, implements with TDD (RED → GREEN → REFACTOR)
- Shadow Tester reads output in parallel, generates ranked risk list
- Banned patterns (`TODO`, `STUB`, `PLACEHOLDER`) block completion

### Stage 2: TESTLOOP
- Invokes `/testloop all --max 5`
- Playwright runs for UI/E2E scope
- Loops until 0 failures and coverage ≥ 80%
- Oscillation → HALT with recovery instructions

### Stage 3: CHALLENGE
- `/evaluator` reviews implementation + test results + shadow risk list
- Verdict map:
  - ✅ → proceed to Stage 4
  - 🟡 → fix brief to coder → re-evaluate (no testloop re-run unless logic changed)
  - 🔴 → fix brief to coder → re-run TestLoop → re-evaluate
  - 🚫 → HALT, human decision required
- Max 3 challenge cycles per finding before escalating

### Stage 4: DOCUMENT
- `/docs` updates JSDoc/docstrings on all new public methods
- Adds CHANGELOG.md entry under `[Unreleased]`
- Updates API reference if endpoints changed
- Updates README only for user-visible features

### Stage 5: COMMIT
- Stages only files modified by this feature (no unrelated files)
- Commit format: `feat(scope): description [STORY-XXX]`
- Includes evaluator verdict + test pass rate in commit body
- Reports any unstaged unrelated files for user to handle separately

---

## Evaluator Feedback Loop (Stage 3 Detail)

The evaluator doesn't just grade — it generates fix briefs that go back to the coder:

```
Evaluator finds 🔴 issue
  → Fix brief generated with: exact finding, file:line, required change
  → Coder applies surgical fix (no unrelated changes)
  → TestLoop re-runs to verify fix didn't break anything
  → Evaluator re-grades
  → Repeat until ✅ or max cycles exhausted
```

This loop runs up to 3 cycles. If the same finding persists through 3 cycles, oscillation is declared and the feature halts for human review.

---

## State & Resume

State tracked in `.claude/feature-state.json`. Resume a halted lifecycle:

```
/feature --from testloop     Re-run tests and continue
/feature --from challenge    Re-run evaluator and continue
/feature --from document     Skip to docs generation
/feature --from commit       Skip to commit (docs already done)
```

---

## Integration with /forge

When `/forge` executes stories in Phase 2, each story runs through `/feature` instead of the raw `Architect → Coder → Tester → Gate-Keeper` chain. This gives every story the full testloop + evaluator feedback + docs + commit pipeline automatically.

---

## Hard Rules (Summary)

- No commit without evaluator ✅ or 🟡-resolved
- No docs without green tests
- No staging unrelated files
- No skipping TestLoop — "it compiles" is not evidence
- 🚫 verdict always halts — never auto-proceeds

# STORY-001: MG0 Pre-Generation AC Validation Gate

**Phase:** 1 — Core Gates
**PRD:** correctness-contracts
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** None
**Blocks:** STORY-002, STORY-003, STORY-004
**Affects:** FR-001, FR-002

---

## Description

Add a new micro-gate (MG0) that runs before the coder agent fires, validating that story acceptance criteria exist and are objectively verifiable. This includes updating the story template to require `done_when` / `fail_when` blocks as structured correctness contracts.

MG0 is an AI gate that evaluates each criterion for objective verifiability. It BLOCKS stories with missing or unmeasurable ACs and WARNS (but does not block) on legacy stories that lack the blocks entirely.

---

## Acceptance Contract

**done_when:**
- [x] Story template in `agents/_story-dependency-graph.md` includes `done_when` and `fail_when` block definitions
- [x] MG0 gate function added to `sf_cli/src/core/micro-gates.ts` with prompt template
- [x] MG0 returns FAIL when `done_when` is missing, empty, or contains only subjective criteria (e.g., "looks good", "works correctly")
- [x] MG0 returns PASS when all criteria are objectively verifiable (e.g., "returns 401 on expired token")
- [x] MG0 returns WARN (not BLOCK) for legacy stories without `done_when` blocks
- [x] MG0 executes in < 5 seconds (single AI turn)
- [x] Unit tests cover MG0 gate logic in `sf_cli/src/__tests__/micro-gates.test.ts`

**fail_when:**
- MG0 blocks a legacy story that has no `done_when` block (should WARN only)
- A story with measurable, objective criteria is rejected by MG0
- MG0 execution exceeds 10 seconds

---

## Technical Approach

### Story Template Update

Add `done_when` / `fail_when` blocks to the story template in `agents/_story-dependency-graph.md`:

```markdown
## Acceptance Contract

**done_when:**
  - [ ] <measurable criterion 1>
  - [ ] <measurable criterion 2>

**fail_when:**
  - <failure condition 1>
```

### MG0 Gate Implementation

Add `mg0_ac_validation` function to `sf_cli/src/core/micro-gates.ts`:

1. Parse story markdown to extract `done_when` and `fail_when` blocks
2. If blocks are missing entirely, check if story is legacy (no template markers) — return WARN for legacy, FAIL for new
3. If blocks exist, send criteria to AI with the MG0 prompt template from PRD section 5.3
4. AI evaluates each criterion for objective verifiability
5. Return structured verdict: PASS, FAIL, or WARN with per-item findings

### MG0 Prompt Template

Uses the prompt from PRD section 5.3 — evaluates each criterion against three questions:
1. Is it objectively verifiable without human judgment?
2. Can an automated test check it?
3. Would two developers agree on pass/fail?

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/micro-gates.ts` | MODIFY — Add MG0 gate function and prompt |
| `sf_cli/src/__tests__/micro-gates.test.ts` | MODIFY — Add MG0 unit tests |
| `agents/_story-dependency-graph.md` | MODIFY — Add done_when/fail_when to story template |

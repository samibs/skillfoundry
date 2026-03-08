# STORY-002: T0 Correctness Contract Gate

**Phase:** 1 — Core Gates
**PRD:** correctness-contracts
**Priority:** MUST
**Effort:** S
**Status:** DONE
**Dependencies:** STORY-001
**Blocks:** STORY-004
**Affects:** FR-003

---

## Description

Add a new zero-cost Anvil tier (T0) that runs after the coder and tester complete a story but before the existing T1 (banned patterns). T0 is a static check — no AI call — that verifies each `done_when` item in the story has a corresponding `@done_when` tag in at least one test file.

T0 uses grep/regex matching only, keeping execution under 2 seconds with zero token cost.

---

## Acceptance Contract

**done_when:**
- [x] T0 check function added to `scripts/anvil.sh` before T1
- [x] T0 extracts `done_when` items from the story markdown file
- [x] T0 searches test files for `@done_when` tags referencing each item
- [x] T0 returns FAIL if any `done_when` item has no corresponding `@done_when` tag in test files
- [x] T0 returns PASS when all `done_when` items are covered by test files
- [x] T0 uses fuzzy substring matching (not exact string match) to handle minor wording variations
- [x] T0 executes in < 2 seconds (grep/regex only, zero AI cost)
- [x] T0 falls back to story-file reference check if no `@done_when` tags exist (backward compat)

**fail_when:**
- T0 makes an AI/LLM call (must be pure static analysis)
- T0 execution exceeds 5 seconds
- T0 modifies any existing T1-T6 gate behavior

---

## Technical Approach

### T0 Logic in anvil.sh

```bash
# T0 — Correctness Contract Check
# 1. Read the story markdown file
# 2. Extract lines under done_when: that start with "- [ ]" or "- [x]"
# 3. For each extracted criterion:
#    a. Normalize text (strip markdown, lowercase)
#    b. Search test files (*.test.*, *.spec.*) for @done_when tags
#    c. Use substring matching for fuzzy comparison
# 4. Report: PASS if all covered, FAIL with list of uncovered items
```

### Fallback for Legacy Tests

If no `@done_when` tags exist in any test file, T0 checks whether the test file references the story file path (e.g., `@story docs/stories/correctness-contracts/STORY-002`). If the story is referenced, T0 returns PASS with a warning recommending `@done_when` tags.

---

## Files Affected

| File | Action |
|------|--------|
| `scripts/anvil.sh` | MODIFY — Add T0 correctness contract check before T1 |

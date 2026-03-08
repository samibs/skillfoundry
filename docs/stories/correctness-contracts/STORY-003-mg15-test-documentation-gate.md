# STORY-003: MG1.5 Test Documentation Gate

**Phase:** 1 — Core Gates
**PRD:** correctness-contracts
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-001
**Blocks:** STORY-004
**Affects:** FR-004, FR-005

---

## Description

Add a new micro-gate (MG1.5) between MG1 (security review) and MG2 (standards review) that validates test file documentation quality. MG1.5 is an AI gate that checks whether test files have proper intent headers (`@test-suite`, `@story`, `@done_when`, `@rationale`) and GWT+WHY comments in test bodies.

When MG1.5 fails, it re-triggers the tester agent (not the fixer), because the problem is missing documentation, not broken code. Max 2 retries before downgrading to WARN and continuing.

---

## Acceptance Contract

**done_when:**
- [x] MG1.5 gate function added to `sf_cli/src/core/micro-gates.ts` with prompt template
- [x] MG1.5 checks test files for `@test-suite` header with `@story`, `@done_when`, `@rationale` fields
- [x] MG1.5 checks each test body for GWT comments (GIVEN / WHEN / THEN)
- [x] MG1.5 checks each test body for a WHY comment explaining the contract being enforced
- [x] MG1.5 returns FAIL if any test lacks required documentation elements
- [x] MG1.5 failure re-triggers the tester agent (not the fixer) with specific documentation gaps
- [x] MG1.5 retries capped at 2 — after 2 failures, downgrades to WARN and continues pipeline
- [x] MG1.5 executes in < 10 seconds (single AI turn)
- [x] Tester agent (`agents/ruthless-tester.md`) updated with escalation rule: stop if WHY is unwritable
- [x] Unit tests cover MG1.5 gate logic in `sf_cli/src/__tests__/micro-gates.test.ts`

**fail_when:**
- MG1.5 failure routes to the fixer agent instead of the tester
- MG1.5 retry loop exceeds 2 retries (must cap and downgrade to WARN)
- MG1.5 blocks the entire pipeline indefinitely on documentation issues

---

## Technical Approach

### MG1.5 Gate Implementation

Add `mg15_test_documentation` function to `sf_cli/src/core/micro-gates.ts`:

1. Collect test file diffs from the current story implementation
2. Send to AI with the MG1.5 prompt template from PRD section 5.5
3. AI evaluates each test for:
   - `@test-suite` header presence and completeness
   - GWT comments in test body
   - WHY comment explaining the contract
   - Self-documentation quality (could a new developer understand without reading source?)
4. Return structured verdict with per-test findings

### Tester Re-trigger Logic

When MG1.5 returns FAIL:
1. Extract the specific failing test files and missing documentation elements
2. Invoke the tester agent with a focused prompt: "Add documentation to these tests"
3. Increment retry counter
4. If retry counter >= 2, downgrade to WARN and continue pipeline

### Tester Escalation Rule

Update `agents/ruthless-tester.md` to include:
- If the tester cannot write a WHY comment for a test (because the feature is underspecified), it STOPS test generation and escalates to the user with a request for AC refinement (FR-011)

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/micro-gates.ts` | MODIFY — Add MG1.5 gate function and prompt |
| `sf_cli/src/__tests__/micro-gates.test.ts` | MODIFY — Add MG1.5 unit tests |
| `agents/ruthless-tester.md` | MODIFY — Add escalation rule for unwritable WHY |

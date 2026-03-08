# STORY-004: Pipeline Integration

**Phase:** 2 — Integration & Skills
**PRD:** correctness-contracts
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-002, STORY-003
**Blocks:** STORY-005
**Affects:** FR-002, FR-003, FR-004, FR-005

---

## Description

Wire MG0, T0, and MG1.5 into the forge pipeline in the correct execution order. The new gate ordering is:

```
MG0 → Coder → Tester → T0 → T1 → MG1 → MG1.5 → MG2 → MG3 → T2-T6
```

MG0 runs before the coder fires. T0 runs after coder+tester, before T1. MG1.5 runs between MG1 and MG2, with failure routing to the tester (not the fixer).

---

## Acceptance Contract

**done_when:**
- [x] Pipeline in `sf_cli/src/core/pipeline.ts` executes MG0 before the coder agent
- [x] Pipeline executes T0 after tester completes, before T1
- [x] Pipeline executes MG1.5 between MG1 and MG2
- [x] MG0 FAIL halts the story before code generation starts
- [x] MG0 WARN on legacy stories logs the warning and continues
- [x] T0 FAIL halts the story before T1-T6 run
- [x] MG1.5 FAIL re-triggers the tester agent with documentation gaps
- [x] MG1.5 retry counter caps at 2, then downgrades to WARN
- [x] Total pipeline overhead from all new gates < 25% of forge run time
- [x] Existing T1-T6 and MG1-MG3 gate behavior unchanged
- [x] Pipeline tests in `sf_cli/src/__tests__/pipeline.test.ts` cover new gate ordering

**fail_when:**
- New gates change the behavior of existing T1-T6 or MG1-MG3 gates
- MG0 runs after the coder (must be pre-generation)
- MG1.5 failure routes to fixer instead of tester
- Pipeline overhead exceeds 30% of total forge run time

---

## Technical Approach

### Pipeline Gate Ordering

Modify `sf_cli/src/core/pipeline.ts` to insert the three new gates:

1. **MG0 insertion point:** Before the coder agent invocation. Add a call to `mg0_ac_validation()` from micro-gates. On FAIL, skip the story with an error. On WARN, log and continue.

2. **T0 insertion point:** After the tester agent completes, before `runAnvilTier('T1', ...)`. Invoke T0 from `scripts/anvil.sh` or call the T0 function directly. On FAIL, report uncovered `done_when` items and halt.

3. **MG1.5 insertion point:** After MG1 (security review) completes, before MG2 (standards). On FAIL, re-trigger tester with failing test files. Track retry count per story.

### MG1.5 Retry Logic

```
mg15_retries = 0
while mg15_retries < 2:
    result = run_mg15(test_files)
    if result == PASS:
        break
    mg15_retries++
    re_trigger_tester(result.failing_files, result.gaps)

if mg15_retries >= 2 and result == FAIL:
    log_warning("MG1.5 downgraded to WARN after 2 retries")
    continue_pipeline()
```

### Backward Compatibility

- Stories without `done_when` blocks: MG0 returns WARN, pipeline continues
- Test files without `@done_when` tags: T0 falls back to story-reference check
- Existing gate execution is untouched — new gates are additive insertions only

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/pipeline.ts` | MODIFY — Wire MG0, T0, MG1.5 into gate execution order |
| `sf_cli/src/__tests__/pipeline.test.ts` | MODIFY — Add tests for new gate ordering and retry logic |

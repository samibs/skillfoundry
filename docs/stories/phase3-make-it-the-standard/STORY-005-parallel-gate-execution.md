# STORY-005: Parallel Gate Execution

**Phase:** 2 — Performance
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** L
**Status:** READY
**Dependencies:** STORY-001, STORY-002
**Blocks:** STORY-006, STORY-007, STORY-014
**Affects:** FR-005

---

## Description

Refactor gate execution in `gates.ts` to run independent gate tiers concurrently using `Promise.all()`. The current sequential execution runs T1 through T6 one after another. Analysis of gate dependencies reveals that T1 (banned patterns) and T2 (type checking) are independent; T3 (tests) depends on T1+T2 passing; T4 (security) and T5 (build) are independent of each other but depend on T3; T6 (scope) runs last. This creates a three-wave execution model that cuts wall-clock time by running independent gates in parallel.

---

## Acceptance Contract

**done_when:**
- [ ] `runAllGates()` in `gates.ts` executes gates in three waves: Wave 1 (T1+T2 parallel), Wave 2 (T3 sequential, only if Wave 1 passes), Wave 3 (T4+T5 parallel, only if Wave 2 passes), then T6 sequential
- [ ] Each wave uses `Promise.all()` for concurrent execution
- [ ] If any gate in a wave produces a FAIL, subsequent waves are skipped (fail-fast behavior preserved)
- [ ] WARN results do not block subsequent waves
- [ ] Gate results are collected in tier order (T1, T2, T3, T4, T5, T6) regardless of completion order
- [ ] Each gate function remains pure: no shared mutable state between concurrent gates
- [ ] Audit log entries (from STORY-002) are written for each gate regardless of parallelism
- [ ] Team config thresholds (from STORY-001) are passed to each gate function as before
- [ ] The `GateRunSummary` output format is unchanged; callers see no difference
- [ ] A new `--sequential` flag on `sf gates` forces the old sequential behavior (escape hatch)
- [ ] Performance: measured wall-clock time for `runAllGates()` is at least 30% faster than sequential on a project with all 6 gates active (measured by comparing with `--sequential`)
- [ ] Unit tests in `sf_cli/src/__tests__/gates-parallel.test.ts` cover: all-pass parallel, Wave 1 fail skips Wave 2+3, Wave 2 fail skips Wave 3, WARN does not block, `--sequential` flag, result ordering

**fail_when:**
- Gates execute in a different dependency order than the three-wave model
- A WARN in Wave 1 blocks Wave 2 from executing
- Parallel execution produces different gate results than sequential execution for the same input
- Shared mutable state causes race conditions between concurrent gates
- The `GateRunSummary` format changes (breaking callers)

---

## Technical Approach

### Wave Execution Model

```
Wave 1: T1 + T2 (parallel via Promise.all)
         │
         ▼ (both must pass or warn)
Wave 2: T3 (sequential — runs tests)
         │
         ▼ (must pass or warn)
Wave 3: T4 + T5 (parallel via Promise.all)
         │
         ▼ (both must pass or warn)
Wave 4: T6 (sequential — scope validation)
```

### Implementation

Refactor `runAllGates()` in `gates.ts`:

```typescript
export async function runAllGates(workDir: string, opts?: GateOptions): Promise<GateRunSummary> {
  const config = loadTeamConfig();
  const results: GateResult[] = [];

  if (opts?.sequential) {
    // Legacy sequential path
    for (const gate of [runT1, runT2, runT3, runT4, runT5, runT6]) {
      const result = await gate(workDir, config);
      results.push(result);
      appendAuditEntry(toAuditEntry(result));
      if (result.status === 'fail') break;
    }
    return summarize(results);
  }

  // Wave 1: T1 + T2 in parallel
  const [t1, t2] = await Promise.all([
    runT1(workDir, config),
    runT2(workDir, config),
  ]);
  results.push(t1, t2);
  [t1, t2].forEach(r => appendAuditEntry(toAuditEntry(r)));
  if (t1.status === 'fail' || t2.status === 'fail') return summarize(results);

  // Wave 2: T3 sequential (tests may depend on type-check / banned-pattern fixes)
  const t3 = await runT3(workDir, config);
  results.push(t3);
  appendAuditEntry(toAuditEntry(t3));
  if (t3.status === 'fail') return summarize(results);

  // Wave 3: T4 + T5 in parallel
  const [t4, t5] = await Promise.all([
    runT4(workDir, config),
    runT5(workDir, config),
  ]);
  results.push(t4, t5);
  [t4, t5].forEach(r => appendAuditEntry(toAuditEntry(r)));
  if (t4.status === 'fail' || t5.status === 'fail') return summarize(results);

  // Wave 4: T6 sequential
  const t6 = await runT6(workDir, config);
  results.push(t6);
  appendAuditEntry(toAuditEntry(t6));

  return summarize(results);
}
```

### Gate Function Purity

Each gate function (`runT1`, `runT2`, etc.) must:
- Accept `workDir` and `config` as parameters (no globals)
- Not write to any shared mutable state
- Return a `GateResult` without side effects (audit logging is done by the caller)

Current gate functions use `execSync` which is process-isolated by nature. The main risk is filesystem writes; review each gate to ensure no shared temp files.

### Async Conversion

Current gate functions are synchronous (using `execSync`). Convert to async by wrapping `execSync` calls or using `execFile` with promises. This is required for `Promise.all()` to provide actual concurrency.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/gates.ts` | MODIFY — Refactor runAllGates to wave-based parallel execution, convert gate functions to async |
| `sf_cli/src/__tests__/gates-parallel.test.ts` | CREATE — Parallel execution tests |
| `sf_cli/src/__tests__/gates.test.ts` | MODIFY — Ensure existing tests still pass with async conversion |

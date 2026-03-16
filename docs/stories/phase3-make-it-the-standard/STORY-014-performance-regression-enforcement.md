# STORY-014: Performance Regression Enforcement (P95 <500ms)

**Phase:** 4 — Testing Rigor
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** STORY-005
**Blocks:** None
**Affects:** FR-015

---

## Description

Implement a performance regression test suite that measures gate latency across multiple runs, computes P95 values per gate tier, and fails CI if any tier exceeds the 500ms threshold (excluding T3, which depends on test suite size). The test uses a standardized benchmark project with known file counts and complexity to produce stable, reproducible measurements. Results are persisted to `.skillfoundry/perf.jsonl` for trend analysis.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/__tests__/perf-regression.test.ts` runs each gate tier 10 times against a standardized benchmark project and computes P95 latency
- [ ] The benchmark project is stored at `fixtures/perf-benchmark/` with: 20 TypeScript files, a `package.json`, a `tsconfig.json`, and 5 test files
- [ ] P95 is computed as the value at the 95th percentile of the 10 measurements (the 10th value when sorted ascending, i.e., the maximum in a 10-run sample)
- [ ] Gate tiers T1, T2, T4, T5, T6 must have P95 <500ms each
- [ ] T3 is excluded from the 500ms threshold (test suite execution time is project-dependent) but its latency is still measured and reported
- [ ] If any non-T3 tier exceeds 500ms P95, the test fails with: "Performance regression: <tier> P95 = <value>ms (threshold: 500ms)"
- [ ] A 10% tolerance is applied on the first breach: if P95 is between 500ms and 550ms, the test produces a WARNING instead of FAIL (to handle CI noise)
- [ ] Results from each run are appended to `.skillfoundry/perf.jsonl` with: `timestamp`, `tier`, `p95Ms`, `minMs`, `maxMs`, `meanMs`, `runs`
- [ ] `sf benchmark --perf` CLI command runs the performance suite outside of tests and prints a formatted latency table
- [ ] The `perf-regression.test.ts` test completes in <60 seconds total (10 runs x 6 tiers)
- [ ] Unit tests for the P95 computation function verify correct percentile calculation with known input arrays

**fail_when:**
- P95 is computed incorrectly (e.g., using mean instead of percentile)
- T3 exceeding 500ms causes the test to fail (T3 is excluded from the threshold)
- A single outlier run (e.g., GC pause) causes permanent CI failure without the tolerance mechanism
- The performance benchmark project files are not deterministic (e.g., contain timestamps or random values)

---

## Technical Approach

### Performance Test Implementation

`sf_cli/src/__tests__/perf-regression.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runSingleGate } from '../core/gates.js';

const BENCHMARK_DIR = join(__dirname, '../../fixtures/perf-benchmark');
const NUM_RUNS = 10;
const P95_THRESHOLD_MS = 500;
const TOLERANCE_MS = 50; // 10% tolerance
const EXCLUDED_TIERS = ['T3']; // Test suite execution is project-dependent

describe('Performance Regression', () => {
  const tiers = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];

  for (const tier of tiers) {
    it(`${tier} P95 latency < ${P95_THRESHOLD_MS}ms`, async () => {
      const durations: number[] = [];

      for (let i = 0; i < NUM_RUNS; i++) {
        const start = performance.now();
        await runSingleGate(tier, BENCHMARK_DIR);
        durations.push(performance.now() - start);
      }

      const sorted = durations.sort((a, b) => a - b);
      const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
      const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

      // Record to perf.jsonl
      appendPerfEntry({ timestamp: new Date().toISOString(), tier, p95Ms: p95, minMs: sorted[0], maxMs: sorted[sorted.length - 1], meanMs: mean, runs: NUM_RUNS });

      if (EXCLUDED_TIERS.includes(tier)) {
        // Report but don't enforce
        console.log(`${tier} P95: ${p95.toFixed(1)}ms (excluded from threshold)`);
        return;
      }

      if (p95 > P95_THRESHOLD_MS + TOLERANCE_MS) {
        throw new Error(`Performance regression: ${tier} P95 = ${p95.toFixed(1)}ms (threshold: ${P95_THRESHOLD_MS}ms)`);
      }

      if (p95 > P95_THRESHOLD_MS) {
        console.warn(`WARNING: ${tier} P95 = ${p95.toFixed(1)}ms (approaching threshold: ${P95_THRESHOLD_MS}ms)`);
      }

      expect(p95).toBeLessThanOrEqual(P95_THRESHOLD_MS + TOLERANCE_MS);
    }, 30_000); // 30s timeout per tier
  }
});
```

### P95 Computation

```typescript
export function computeP95(values: number[]): number {
  if (values.length === 0) throw new Error('Cannot compute P95 of empty array');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[index];
}
```

### Benchmark Project

`fixtures/perf-benchmark/`:
- 20 TypeScript source files of 50-100 lines each (realistic complexity)
- A `package.json` with `typescript` and `vitest` as devDependencies
- A `tsconfig.json` with strict mode enabled
- 5 test files with 3-5 tests each
- No banned patterns, no security issues, no type errors (all gates should PASS)
- Files are static and deterministic (no timestamps, no random values, no generated content)

### Performance JSONL Logging

`sf_cli/src/core/perf-log.ts`:

```typescript
export interface PerfEntry {
  timestamp: string;
  tier: string;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  runs: number;
}

export function appendPerfEntry(entry: PerfEntry): void {
  const logPath = join(process.cwd(), '.skillfoundry', 'perf.jsonl');
  ensureDirExists(dirname(logPath));
  appendFileSync(logPath, JSON.stringify(entry) + '\n');
}
```

### CLI Integration

Extend `sf_cli/src/commands/benchmark.ts` to support `--perf`:

```typescript
if (args.includes('--perf')) {
  const report = await runPerfBenchmark(BENCHMARK_DIR);
  return formatPerfTable(report);
}
```

Output format:
```
Gate Latency (10 runs against perf-benchmark)

  Tier    P95      Mean     Min      Max      Status
  ────    ───      ────     ───      ───      ──────
  T1      45ms     32ms     28ms     52ms     PASS
  T2      120ms    95ms     80ms     130ms    PASS
  T3      850ms    720ms    680ms    920ms    (excluded)
  T4      180ms    150ms    120ms    210ms    PASS
  T5      350ms    280ms    250ms    380ms    PASS
  T6      90ms     65ms     55ms     105ms    PASS
```

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/__tests__/perf-regression.test.ts` | CREATE — Performance regression tests |
| `sf_cli/src/core/perf-log.ts` | CREATE — P95 computation and JSONL persistence |
| `sf_cli/src/__tests__/perf-log.test.ts` | CREATE — Unit tests for P95 computation |
| `fixtures/perf-benchmark/` | CREATE — Standardized benchmark project (20 files, package.json, tsconfig.json, 5 tests) |
| `sf_cli/src/commands/benchmark.ts` | MODIFY — Add `--perf` flag |
| `.gitignore` | MODIFY — Add `.skillfoundry/perf.jsonl` |

# STORY-012: Quality Benchmark Suite (50 Scenarios)

**Phase:** 4 — Testing Rigor
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** L
**Status:** READY
**Dependencies:** None
**Blocks:** STORY-013
**Affects:** FR-012

---

## Description

Build a comprehensive quality benchmark suite with 50 test scenarios: 25 intentionally bad AI outputs (containing banned patterns, security vulnerabilities, placeholder code, type errors, scope violations) and 25 good outputs (clean, tested, well-structured code). The benchmark runs every scenario through the gate pipeline and measures classification accuracy. The target is >90% accuracy: at least 23 of 25 bad outputs must be caught (gate FAIL), and at least 22 of 25 good outputs must pass (gate PASS). This replaces the current static benchmark in `sf_cli/src/commands/benchmark.ts` with a real, data-driven evaluation.

---

## Acceptance Contract

**done_when:**
- [ ] `fixtures/benchmark/` directory contains 50 scenario directories, each with a `scenario.json` manifest and source files
- [ ] 25 "bad" scenarios cover: banned patterns (5), security vulnerabilities (5), placeholder/TODO code (5), type errors (5), scope violations (5)
- [ ] 25 "good" scenarios cover: clean implementations (5), well-tested code (5), properly typed code (5), secure patterns (5), scoped features (5)
- [ ] Each `scenario.json` contains: `id`, `name`, `category` (bad/good), `subcategory`, `expectedVerdict` (FAIL/PASS), `description`, `files` (array of relative paths)
- [ ] `sf_cli/src/core/benchmark-runner.ts` exports `runBenchmarkSuite(): BenchmarkReport` that executes all 50 scenarios through `runAllGates()`
- [ ] `BenchmarkReport` includes: `total`, `correct`, `incorrect`, `accuracy` (percentage), `falsePositives` (good code flagged as bad), `falseNegatives` (bad code not caught), `perCategory` breakdown
- [ ] `sf benchmark --suite` runs the full 50-scenario benchmark and prints a formatted report
- [ ] Overall accuracy must be >90% (45/50 correct classifications)
- [ ] False negatives (bad code not caught) must be <3 (zero tolerance for security vulnerabilities getting through)
- [ ] Each scenario executes in isolation (temporary directory, no cross-contamination)
- [ ] The benchmark command exits with code 0 if accuracy >90%, code 1 otherwise
- [ ] Unit tests in `sf_cli/src/__tests__/benchmark-runner.test.ts` verify the runner handles: all pass, all fail, mixed results, scenario with missing files (skip with warning), accuracy calculation

**fail_when:**
- A "bad" scenario with a hardcoded secret passes the gate pipeline without being caught
- A "good" scenario with clean, properly tested code is flagged as bad (false positive) in more than 3 scenarios
- The benchmark suite requires network access to run (all scenarios are local fixtures)
- A scenario directory is missing its `scenario.json` manifest and the runner crashes instead of skipping

---

## Technical Approach

### Scenario Structure

```
fixtures/benchmark/
├── bad-001-console-log-in-production/
│   ├── scenario.json
│   └── src/
│       └── handler.ts    # Contains console.log statements
├── bad-002-hardcoded-api-key/
│   ├── scenario.json
│   └── src/
│       └── config.ts     # Contains API_KEY = "sk-..."
├── ...
├── good-001-clean-rest-endpoint/
│   ├── scenario.json
│   └── src/
│       ├── handler.ts
│       └── handler.test.ts
└── ...
```

### scenario.json Format

```json
{
  "id": "bad-001",
  "name": "Console.log in production code",
  "category": "bad",
  "subcategory": "banned-patterns",
  "expectedVerdict": "FAIL",
  "expectedGate": "T1",
  "description": "Production handler uses console.log for debugging. T1 banned pattern check should catch this.",
  "files": ["src/handler.ts"]
}
```

### Benchmark Runner

`sf_cli/src/core/benchmark-runner.ts`:

```typescript
export async function runBenchmarkSuite(fixturesDir: string): Promise<BenchmarkReport> {
  const scenarios = loadScenarios(fixturesDir);
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    // Create isolated temp directory with scenario files
    const tmpDir = createIsolatedEnv(scenario);
    try {
      const gateResult = await runAllGates(tmpDir, { sequential: true });
      const actualVerdict = gateResult.verdict;
      const correct = (scenario.expectedVerdict === 'FAIL' && actualVerdict === 'FAIL') ||
                       (scenario.expectedVerdict === 'PASS' && (actualVerdict === 'PASS' || actualVerdict === 'WARN'));
      results.push({ scenario, actualVerdict, correct });
    } finally {
      cleanupIsolatedEnv(tmpDir);
    }
  }

  return computeReport(results);
}
```

### Bad Scenario Categories (25 total)

1. **Banned patterns (5):** console.log, debugger statement, TODO marker, FIXME comment, placeholder function body
2. **Security vulnerabilities (5):** hardcoded API key, SQL injection, XSS via innerHTML, eval() usage, secrets in localStorage
3. **Placeholder code (5):** NotImplementedError, empty function body, "coming soon" comment, Lorem ipsum content, stub return null
4. **Type errors (5):** any cast without justification, ts-ignore without comment, missing return type, implicit any parameter, wrong generic type
5. **Scope violations (5):** modified file outside story scope, extra dependency added, unrelated feature change, config modification outside scope, test file for wrong module

### Good Scenario Categories (25 total)

1. **Clean implementations (5):** REST endpoint with validation, service with error handling, utility with edge cases, config loader with defaults, event handler with cleanup
2. **Well-tested code (5):** unit test with mocks, integration test with fixtures, edge case coverage, error path testing, async test with proper await
3. **Properly typed code (5):** generic utility, discriminated union, type guard, mapped type, branded type
4. **Secure patterns (5):** parameterized SQL, CSP headers, input sanitization, rate limiting, auth middleware
5. **Scoped features (5):** single-file change, related test update, config change within scope, documentation update, dependency update matching feature

---

## Files Affected

| File | Action |
|------|--------|
| `fixtures/benchmark/` | CREATE — 50 scenario directories with source files |
| `sf_cli/src/core/benchmark-runner.ts` | CREATE — Benchmark execution engine |
| `sf_cli/src/__tests__/benchmark-runner.test.ts` | CREATE — Unit tests for runner |
| `sf_cli/src/commands/benchmark.ts` | MODIFY — Add `--suite` flag to trigger full benchmark |

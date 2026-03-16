# STORY-011: Stryker Mutation Testing Setup

**Phase:** 4 — Testing Rigor
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** None
**Blocks:** STORY-012
**Affects:** FR-013

---

## Description

Integrate Stryker.js mutation testing into the project, targeting `gates.ts` and `pipeline.ts` as the two most critical modules. Stryker injects small code mutations (e.g., flipping conditionals, removing statements, changing operators) and runs the test suite against each mutant. If a mutant survives (tests still pass), it indicates a gap in test coverage. The target is >80% mutation score, meaning >80% of injected mutants are killed by the existing tests.

---

## Acceptance Contract

**done_when:**
- [ ] `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` are added as devDependencies in `sf_cli/package.json`
- [ ] `stryker.config.mjs` is created at `sf_cli/` with configuration targeting `src/core/gates.ts` and `src/core/pipeline.ts`
- [ ] `npm run mutation` script is added to `sf_cli/package.json` that runs `stryker run`
- [ ] Stryker is configured to use the `vitest` test runner (matching the project's existing test framework)
- [ ] Mutation operators include: ConditionalExpression, EqualityOperator, LogicalOperator, ArithmeticOperator, BlockStatement, StringLiteral, ArrayDeclaration
- [ ] Stryker timeout is set to 30 seconds per mutant (prevents hanging on infinite loops)
- [ ] Mutation report is generated in HTML format at `sf_cli/reports/mutation/` and in JSON at `sf_cli/reports/mutation/mutation.json`
- [ ] CI integration: `npm run mutation` runs in CI with `--reporters clear-text` for console output
- [ ] Mutation score for `gates.ts` is >80% (verified by running Stryker and checking the report)
- [ ] Mutation score for `pipeline.ts` is >80% (verified by running Stryker and checking the report)
- [ ] If mutation score drops below 80%, the `npm run mutation` script exits with code 1 (enforced via Stryker `thresholds.break`)
- [ ] Documentation: `docs/mutation-testing.md` explains what mutation testing is, how to run it, how to read the report, and how to fix surviving mutants
- [ ] `sf_cli/reports/` is added to `.gitignore`

**fail_when:**
- Stryker targets files other than `gates.ts` and `pipeline.ts` (scope must be limited to avoid excessive CI time)
- A mutation score below 80% does not cause CI failure
- The Stryker configuration uses a test runner other than Vitest
- Mutation testing takes more than 10 minutes for the two target files combined

---

## Technical Approach

### Stryker Configuration

`sf_cli/stryker.config.mjs`:

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/core/gates.ts',
    'src/core/pipeline.ts',
  ],
  reporters: ['html', 'clear-text', 'json'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  thresholds: {
    high: 90,
    low: 80,
    break: 80,  // Fail CI if mutation score < 80%
  },
  timeoutMS: 30000,
  concurrency: 4,
  mutator: {
    excludedMutations: [
      'StringLiteral',  // Log messages and error strings produce many low-value mutants
    ],
  },
};
```

### Package.json Scripts

Add to `sf_cli/package.json`:

```json
{
  "scripts": {
    "mutation": "stryker run",
    "mutation:open": "open reports/mutation/index.html"
  }
}
```

### CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Mutation Testing
  run: npm run mutation --workspace=sf_cli
  if: github.event_name == 'pull_request'
```

Mutation testing runs only on PRs (not on every push) to balance CI time.

### Improving Mutation Score

If the initial mutation score is below 80%, surviving mutants indicate test gaps. Common fixes:
- Add boundary condition tests for conditional expressions
- Add negative tests for error paths
- Test that specific values are returned (not just truthy/falsy)
- Test operator behavior (e.g., `>` vs `>=`)

The mutation report identifies each surviving mutant with its file, line, and the specific mutation applied.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/stryker.config.mjs` | CREATE — Stryker configuration |
| `sf_cli/package.json` | MODIFY — Add stryker devDependencies and mutation script |
| `.github/workflows/ci.yml` | MODIFY — Add mutation testing step for PRs |
| `docs/mutation-testing.md` | CREATE — Documentation |
| `.gitignore` | MODIFY — Add `sf_cli/reports/` |

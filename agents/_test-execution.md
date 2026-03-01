# Test Execution Integration

> **CORE FRAMEWORK MODULE**
> This module defines how to execute, parse, and report on test results across different tech stacks.

---

## Overview

Test execution integration provides:
- Automatic test runner detection
- Cross-platform test execution
- Result parsing and analysis
- Coverage extraction
- Failure categorization

---

## Supported Test Frameworks

### JavaScript/TypeScript

| Framework | Command | Config File |
|-----------|---------|-------------|
| Jest | `npm test` / `npx jest` | jest.config.js |
| Vitest | `npm test` / `npx vitest` | vitest.config.ts |
| Mocha | `npm test` / `npx mocha` | .mocharc.json |
| Playwright | `npx playwright test` | playwright.config.ts |
| Cypress | `npx cypress run` | cypress.config.js |

### Python

| Framework | Command | Config File |
|-----------|---------|-------------|
| pytest | `pytest` | pytest.ini / pyproject.toml |
| unittest | `python -m unittest` | - |
| nose2 | `nose2` | nose2.cfg |

### .NET

| Framework | Command | Config File |
|-----------|---------|-------------|
| xUnit | `dotnet test` | *.csproj |
| NUnit | `dotnet test` | *.csproj |
| MSTest | `dotnet test` | *.csproj |

### Rust

| Framework | Command | Config File |
|-----------|---------|-------------|
| cargo test | `cargo test` | Cargo.toml |

### Go

| Framework | Command | Config File |
|-----------|---------|-------------|
| go test | `go test ./...` | go.mod |

---

## Auto-Detection

### Detection Algorithm

```
1. Check for package.json → Node.js project
   - Check scripts.test → Use that command
   - Check dependencies for jest/vitest/mocha → Infer runner

2. Check for pyproject.toml / requirements.txt → Python project
   - Check for pytest in dependencies → Use pytest
   - Default to python -m unittest

3. Check for *.csproj / *.sln → .NET project
   - Use dotnet test

4. Check for Cargo.toml → Rust project
   - Use cargo test

5. Check for go.mod → Go project
   - Use go test ./...
```

### Detection Output

```
TEST FRAMEWORK DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Detected: Node.js project (package.json found)

Test Configuration:
├── Framework: Jest
├── Command: npm test
├── Config: jest.config.js
├── Coverage: --coverage flag available
└── Watch: --watch flag available

Test Files Found:
├── tests/unit/*.test.ts (15 files)
├── tests/integration/*.test.ts (8 files)
└── tests/e2e/*.spec.ts (3 files)

Total: 26 test files
```

---

## Execution Protocol

### Pre-Execution Checks

```
BEFORE RUNNING TESTS:

1. Check test framework installed
   - If missing: Warn and offer to install

2. Check for test files
   - If none: Warn "No test files found"

3. Check for running processes
   - Kill any stale test processes

4. Verify database state (if integration tests)
   - Reset test database if needed

5. Set environment
   - NODE_ENV=test / RUST_TEST_THREADS=1 / etc.
```

### Execution Command

```bash
# Node.js / Jest
npm test -- --ci --coverage --json --outputFile=.claude/test-results.json

# Python / pytest
pytest --tb=short -v --json-report --json-report-file=.claude/test-results.json

# .NET
dotnet test --logger "json;LogFileName=.claude/test-results.json" --collect:"XPlat Code Coverage"

# Rust
cargo test -- --format json > .claude/test-results.json 2>&1

# Go
go test ./... -json > .claude/test-results.json
```

### Timeout Handling

```
Test execution timeout:
├── Unit tests: 5 minutes
├── Integration tests: 10 minutes
├── E2E tests: 15 minutes

On timeout:
1. Kill test process
2. Mark as TIMEOUT error
3. Capture partial output
4. Report which tests were running
```

---

## Result Parsing

### Unified Result Format

All test results are normalized to this format:

```json
{
  "timestamp": "2026-01-20T14:30:00Z",
  "framework": "jest",
  "duration_ms": 12500,

  "summary": {
    "total": 150,
    "passed": 145,
    "failed": 3,
    "skipped": 2,
    "pending": 0
  },

  "coverage": {
    "lines": 87.5,
    "statements": 86.2,
    "branches": 72.3,
    "functions": 91.0
  },

  "suites": [
    {
      "name": "AuthService",
      "file": "tests/auth.test.ts",
      "tests": 25,
      "passed": 24,
      "failed": 1,
      "duration_ms": 1200
    }
  ],

  "failures": [
    {
      "suite": "AuthService",
      "test": "should reject expired tokens",
      "file": "tests/auth.test.ts",
      "line": 42,
      "error": "Expected token to be rejected but was accepted",
      "stack": "...",
      "category": "assertion"
    }
  ],

  "slowest_tests": [
    {
      "name": "should handle concurrent requests",
      "duration_ms": 2500,
      "file": "tests/integration/api.test.ts"
    }
  ]
}
```

### Framework-Specific Parsers

#### Jest Output Parser

```javascript
function parseJestOutput(output) {
  const results = JSON.parse(output);

  return {
    summary: {
      total: results.numTotalTests,
      passed: results.numPassedTests,
      failed: results.numFailedTests,
      skipped: results.numPendingTests
    },
    coverage: results.coverageMap ? extractCoverage(results.coverageMap) : null,
    failures: results.testResults
      .flatMap(suite => suite.assertionResults
        .filter(t => t.status === 'failed')
        .map(t => ({
          suite: suite.name,
          test: t.title,
          error: t.failureMessages.join('\n'),
          category: categorizeError(t.failureMessages[0])
        }))
      )
  };
}
```

#### Pytest Output Parser

```python
def parse_pytest_output(output):
    results = json.loads(output)

    return {
        'summary': {
            'total': results['summary']['total'],
            'passed': results['summary']['passed'],
            'failed': results['summary']['failed'],
            'skipped': results['summary']['skipped']
        },
        'failures': [
            {
                'suite': test['nodeid'].split('::')[0],
                'test': test['nodeid'].split('::')[-1],
                'error': test['longrepr'],
                'category': categorize_error(test['longrepr'])
            }
            for test in results['tests']
            if test['outcome'] == 'failed'
        ]
    }
```

---

## Failure Categorization

### Error Categories

| Category | Pattern | Example |
|----------|---------|---------|
| `assertion` | expect/assert failed | "Expected 5 but got 3" |
| `timeout` | test timeout | "Timeout of 5000ms exceeded" |
| `type_error` | type mismatch | "Cannot read property of undefined" |
| `network` | connection failed | "ECONNREFUSED" |
| `database` | DB error | "relation does not exist" |
| `syntax` | parse error | "Unexpected token" |
| `import` | module not found | "Cannot find module" |
| `permission` | access denied | "EACCES" |
| `resource` | memory/cpu | "JavaScript heap out of memory" |
| `unknown` | unclassified | Everything else |

### Category Detection

```javascript
function categorizeError(errorMessage) {
  const patterns = [
    { category: 'assertion', regex: /expect|assert|should|toBe|toEqual/i },
    { category: 'timeout', regex: /timeout|timed out|exceeded/i },
    { category: 'type_error', regex: /cannot read|undefined|null/i },
    { category: 'network', regex: /ECONNREFUSED|ENOTFOUND|network/i },
    { category: 'database', regex: /relation|table|column|SQL|query/i },
    { category: 'syntax', regex: /SyntaxError|unexpected token|parsing/i },
    { category: 'import', regex: /cannot find module|import|require/i },
    { category: 'permission', regex: /EACCES|permission denied/i },
    { category: 'resource', regex: /heap|memory|ENOMEM/i }
  ];

  for (const { category, regex } of patterns) {
    if (regex.test(errorMessage)) {
      return category;
    }
  }

  return 'unknown';
}
```

---

## Coverage Analysis

### Coverage Report

```
CODE COVERAGE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY
┌─────────────┬──────────┬──────────┬──────────┐
│ Metric      │ Coverage │ Target   │ Status   │
├─────────────┼──────────┼──────────┼──────────┤
│ Lines       │ 87.5%    │ 80%      │ ✓ PASS   │
│ Statements  │ 86.2%    │ 80%      │ ✓ PASS   │
│ Branches    │ 72.3%    │ 75%      │ ⚠ BELOW  │
│ Functions   │ 91.0%    │ 80%      │ ✓ PASS   │
└─────────────┴──────────┴──────────┴──────────┘

LOWEST COVERAGE FILES
┌─────────────────────────────┬──────────┬──────────┐
│ File                        │ Lines    │ Branches │
├─────────────────────────────┼──────────┼──────────┤
│ src/utils/parser.ts         │ 45.2%    │ 32.1%    │
│ src/services/cache.ts       │ 58.3%    │ 41.5%    │
│ src/middleware/error.ts     │ 62.1%    │ 55.0%    │
└─────────────────────────────┴──────────┴──────────┘

UNCOVERED LINES
├── src/utils/parser.ts: 23-45, 67-89, 102-115
├── src/services/cache.ts: 34-56, 78-92
└── src/middleware/error.ts: 12-25, 45-52

RECOMMENDATIONS
1. Add tests for src/utils/parser.ts error handling
2. Test cache service edge cases
3. Cover error middleware branches
```

### Coverage Thresholds

```json
{
  "coverage": {
    "lines": {
      "minimum": 80,
      "target": 90
    },
    "branches": {
      "minimum": 75,
      "target": 85
    },
    "functions": {
      "minimum": 80,
      "target": 90
    },
    "statements": {
      "minimum": 80,
      "target": 90
    }
  }
}
```

---

## Test Report Output

### Summary Format

```
TEST EXECUTION RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Framework: Jest
Duration: 12.5s
Environment: test

RESULTS
┌──────────┬───────┐
│ Status   │ Count │
├──────────┼───────┤
│ ✓ Passed │ 145   │
│ ✗ Failed │ 3     │
│ ○ Skipped│ 2     │
├──────────┼───────┤
│ Total    │ 150   │
└──────────┴───────┘

PASS RATE: 96.7%

FAILURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. AuthService > should reject expired tokens
   File: tests/auth.test.ts:42
   Category: assertion
   Error: Expected token to be rejected but was accepted

2. UserService > should validate email format
   File: tests/user.test.ts:78
   Category: assertion
   Error: Expected "invalid-email" to fail validation

3. CacheService > should handle connection timeout
   File: tests/cache.test.ts:156
   Category: timeout
   Error: Timeout of 5000ms exceeded

COVERAGE: 87.5% lines | 72.3% branches | 91.0% functions

SLOW TESTS (>1s)
├── should handle concurrent requests: 2.5s
├── should process large payload: 1.8s
└── should retry on failure: 1.2s
```

### Failure Detail Format

```
FAILURE DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test: AuthService > should reject expired tokens
File: tests/auth.test.ts:42
Category: assertion

CODE:
```typescript
41│   const expiredToken = generateToken({ exp: Date.now() - 1000 });
42│   const result = await authService.validateToken(expiredToken);
43│   expect(result.valid).toBe(false); // ← FAILED HERE
44│   expect(result.error).toBe('TOKEN_EXPIRED');
```

EXPECTED: result.valid to be false
ACTUAL: result.valid is true

STACK TRACE:
    at Object.<anonymous> (tests/auth.test.ts:43:27)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

LIKELY CAUSE:
Token expiration check may not be working correctly.
Check the validateToken implementation in src/services/auth.ts.

SUGGESTED FIX:
Review the token validation logic, specifically the expiration check.
```

---

## Integration with Agents

### For ruthless-tester

```markdown
When ruthless-tester needs to run tests:

1. Detect test framework
2. Execute tests with coverage
3. Parse results to unified format
4. Generate test report
5. Return in sub-agent format:

## Test Execution Result

### Summary
Executed 150 tests in 12.5s. 145 passed, 3 failed.

### Outcome: PARTIAL

### Tests
| Category | Count | Status |
|----------|-------|--------|
| Passed | 145 | ✓ |
| Failed | 3 | ✗ |
| Coverage | 87.5% | ✓ |

### Failures
1. AuthService > should reject expired tokens (assertion)
2. UserService > should validate email format (assertion)
3. CacheService > should handle connection timeout (timeout)

### Next Steps
1. Fix token expiration validation
2. Update email regex pattern
3. Increase timeout or mock connection
```

### For gate-keeper

```markdown
When gate-keeper evaluates test evidence:

Required evidence:
├── Test execution output (all tests pass)
├── Coverage report (meets threshold)
├── No timeout or resource errors
└── All critical paths covered

Gate decision based on:
- 100% pass rate → PASS
- >95% pass rate, only minor failures → PARTIAL
- <95% pass rate or critical failures → FAIL
```

---

## CLI Commands

```bash
# Run tests (auto-detect framework)
/test

# Run specific test file
/test path/to/test.ts

# Run tests with coverage
/test --coverage

# Run only failed tests
/test --failed

# Run tests in watch mode
/test --watch

# Run tests for specific story
/test --story STORY-001

# Generate test report
/test --report
```

---

## Remember

> "Tests are the proof of capability. Run them. Trust them."

> "A failing test is a gift. It shows where to fix."

> "Coverage is a guide, not a goal. Test behavior, not lines."

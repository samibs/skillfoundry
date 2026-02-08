# Gate Verification Commands

> **CORE FRAMEWORK MODULE**
> This module defines executable verification commands for each capability gate.

---

## Overview

Gate verification provides:
- Automated capability checks
- Executable evidence collection
- Pass/fail determination
- Integration with gate-keeper

---

## Verification Commands

### Gate: Tests Pass

**Purpose**: Verify all tests execute successfully.

```bash
# Command
/verify tests

# Execution
1. Detect test framework
2. Run: npm test / pytest / dotnet test / cargo test / go test
3. Parse exit code
4. Extract pass/fail counts
5. Generate evidence

# Evidence Format
{
  "gate": "tests_pass",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "framework": "jest",
    "total": 150,
    "passed": 150,
    "failed": 0,
    "skipped": 2,
    "duration_ms": 12500,
    "exit_code": 0
  }
}
```

**Pass Criteria**:
- Exit code = 0
- Failed tests = 0
- All critical tests executed

**Fail Criteria**:
- Exit code != 0
- Any failed tests
- Timeout during execution

---

### Gate: Build Clean

**Purpose**: Verify project builds without errors or warnings.

```bash
# Command
/verify build

# Execution (by project type)
Node.js:    npm run build / npx tsc --noEmit
Python:     python -m py_compile / mypy
.NET:       dotnet build --warnaserrors
Rust:       cargo build --release
Go:         go build ./...

# Evidence Format
{
  "gate": "build_clean",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "command": "npm run build",
    "exit_code": 0,
    "warnings": 0,
    "errors": 0,
    "output_size_kb": 245,
    "duration_ms": 8500
  }
}
```

**Pass Criteria**:
- Exit code = 0
- Warnings = 0 (in strict mode)
- Output artifacts generated

**Fail Criteria**:
- Build errors
- Compilation failures
- Missing dependencies

---

### Gate: Coverage Threshold

**Purpose**: Verify code coverage meets minimum threshold.

```bash
# Command
/verify coverage [--threshold 80]

# Execution
1. Run tests with coverage flag
2. Parse coverage report
3. Compare to threshold

# Evidence Format
{
  "gate": "coverage_threshold",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "threshold": 80,
    "actual": {
      "lines": 87.5,
      "branches": 72.3,
      "functions": 91.0,
      "statements": 86.2
    },
    "meets_threshold": true,
    "lowest_metric": "branches"
  }
}
```

**Pass Criteria**:
- All metrics >= threshold
- Or specified metrics >= threshold

**Fail Criteria**:
- Any metric below threshold

---

### Gate: Lint Clean

**Purpose**: Verify code passes all linting rules.

```bash
# Command
/verify lint

# Execution (by project type)
Node.js:    npx eslint . / npx tsc --noEmit
Python:     flake8 / pylint / ruff
Rust:       cargo clippy
Go:         golangci-lint run

# Evidence Format
{
  "gate": "lint_clean",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "linter": "eslint",
    "errors": 0,
    "warnings": 0,
    "files_checked": 45,
    "rules_applied": 120
  }
}
```

**Pass Criteria**:
- Errors = 0
- Warnings = 0 (in strict mode)

**Fail Criteria**:
- Any lint errors
- Critical warnings

---

### Gate: Security Scan

**Purpose**: Verify no security vulnerabilities in dependencies or code.

```bash
# Command
/verify security

# Execution
1. Dependency audit: npm audit / pip-audit / cargo audit
2. Secret scan: grep for patterns
3. SAST scan: semgrep / bandit

# Evidence Format
{
  "gate": "security_scan",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "dependency_audit": {
      "critical": 0,
      "high": 0,
      "moderate": 2,
      "low": 5
    },
    "secret_scan": {
      "secrets_found": 0,
      "files_scanned": 120
    },
    "code_scan": {
      "high_severity": 0,
      "medium_severity": 1,
      "low_severity": 3
    }
  }
}
```

**Pass Criteria**:
- Critical/High vulnerabilities = 0
- No secrets in code
- No high-severity code issues

**Fail Criteria**:
- Any critical/high vulnerability
- Secrets detected
- High-severity code issues

---

### Gate: API Health

**Purpose**: Verify API endpoints are responding correctly.

```bash
# Command
/verify api [--base-url http://localhost:3000]

# Execution
1. Start server (if not running)
2. Hit health endpoint
3. Run smoke tests
4. Check response times

# Evidence Format
{
  "gate": "api_health",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "base_url": "http://localhost:3000",
    "health_check": {
      "endpoint": "/health",
      "status": 200,
      "response_time_ms": 45
    },
    "smoke_tests": {
      "total": 10,
      "passed": 10,
      "avg_response_ms": 120
    }
  }
}
```

**Pass Criteria**:
- Health endpoint returns 200
- Smoke tests pass
- Response times within threshold

**Fail Criteria**:
- Server not responding
- Health check fails
- Smoke tests fail

---

### Gate: Database Migration

**Purpose**: Verify database migrations apply and rollback correctly.

```bash
# Command
/verify migration

# Execution
1. Check pending migrations
2. Apply migrations (to test DB)
3. Verify schema
4. Test rollback
5. Restore state

# Evidence Format
{
  "gate": "database_migration",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "migrations_pending": 2,
    "migrations_applied": 2,
    "rollback_tested": true,
    "schema_valid": true,
    "data_integrity": true
  }
}
```

**Pass Criteria**:
- Migrations apply successfully
- Rollback works
- Schema matches expected

**Fail Criteria**:
- Migration fails
- Rollback fails
- Schema mismatch

---

### Gate: Documentation Complete

**Purpose**: Verify all required documentation exists and is current.

```bash
# Command
/verify docs

# Execution
1. Check README exists
2. Check API docs exist
3. Verify public methods documented
4. Check for stale docs

# Evidence Format
{
  "gate": "documentation_complete",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PARTIAL",
  "evidence": {
    "readme": true,
    "api_docs": true,
    "code_comments": {
      "public_methods": 45,
      "documented": 42,
      "coverage": 93.3
    },
    "stale_docs": [
      "docs/api/users.md (last updated 30 days ago)"
    ]
  }
}
```

**Pass Criteria**:
- README exists
- API docs exist
- Public method documentation >= 90%
- No stale documentation

**Fail Criteria**:
- Missing required docs
- Documentation coverage < 90%

---

### Gate: Banned Patterns

**Purpose**: Verify no banned patterns exist in codebase.

```bash
# Command
/verify patterns

# Execution
1. Scan for TODO/FIXME/HACK
2. Scan for placeholder text
3. Scan for hardcoded secrets
4. Scan for empty implementations

# Evidence Format
{
  "gate": "banned_patterns",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "FAIL",
  "evidence": {
    "patterns_found": [
      {
        "pattern": "TODO",
        "count": 3,
        "locations": [
          "src/auth.ts:45",
          "src/user.ts:78",
          "src/cache.ts:23"
        ]
      }
    ],
    "total_violations": 3,
    "files_scanned": 120
  }
}
```

**Pass Criteria**:
- Zero banned patterns found

**Fail Criteria**:
- Any banned pattern detected

---

## Composite Gates

### Gate: Production Ready

Combines multiple gates into a single check.

```bash
# Command
/verify production

# Checks (all must pass)
1. /verify tests
2. /verify build
3. /verify coverage --threshold 80
4. /verify lint
5. /verify security
6. /verify patterns
7. /verify docs

# Evidence Format
{
  "gate": "production_ready",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PARTIAL",
  "evidence": {
    "checks": {
      "tests": "PASS",
      "build": "PASS",
      "coverage": "PASS",
      "lint": "PASS",
      "security": "PASS",
      "patterns": "FAIL",
      "docs": "PARTIAL"
    },
    "passed": 5,
    "failed": 1,
    "partial": 1,
    "blocking_issues": [
      "3 TODO patterns found"
    ]
  }
}
```

---

### Gate: Story Complete

Verifies a story is fully implemented.

```bash
# Command
/verify story STORY-001

# Checks
1. All acceptance criteria met
2. Tests for story pass
3. No TODOs in story files
4. Documentation updated
5. Layer validation passes

# Evidence Format
{
  "gate": "story_complete",
  "story_id": "STORY-001",
  "verified_at": "2026-01-20T14:30:00Z",
  "result": "PASS",
  "evidence": {
    "acceptance_criteria": {
      "total": 5,
      "verified": 5
    },
    "tests": {
      "related_tests": 8,
      "passed": 8
    },
    "patterns": {
      "violations": 0
    },
    "layers": {
      "database": "PASS",
      "backend": "PASS",
      "frontend": "N/A"
    }
  }
}
```

---

## Verification Output

### Pass Output

```
✅ GATE VERIFIED: tests_pass

Evidence collected:
├── Framework: jest
├── Total tests: 150
├── Passed: 150 (100%)
├── Duration: 12.5s

All criteria met. Gate opened.
```

### Fail Output

```
❌ GATE BLOCKED: tests_pass

Evidence collected:
├── Framework: jest
├── Total tests: 150
├── Passed: 147 (98%)
├── Failed: 3

FAILURES:
1. AuthService > should reject expired tokens
2. UserService > should validate email
3. CacheService > timeout handling

Gate blocked. Fix failures and retry.
```

### Partial Output

```
⚠️ GATE PARTIAL: documentation_complete

Evidence collected:
├── README: ✓
├── API docs: ✓
├── Code comments: 93.3%
├── Stale docs: 1 file

ISSUES:
├── docs/api/users.md is 30 days old

Gate conditionally passed with warnings.
```

---

## Integration with Gate-Keeper

```markdown
When gate-keeper requests verification:

1. Receive gate name and parameters
2. Execute verification command
3. Collect evidence
4. Return result in standard format

Response to gate-keeper:
{
  "gate": "[gate_name]",
  "result": "PASS | PARTIAL | FAIL",
  "evidence": { ... },
  "recommendations": [ ... ]
}
```

---

## Custom Gates

Define custom gates in `.claude/gates.json`:

```json
{
  "custom_gates": {
    "performance": {
      "description": "Verify performance benchmarks",
      "command": "npm run benchmark",
      "pass_criteria": {
        "exit_code": 0,
        "output_contains": "All benchmarks passed"
      }
    },
    "integration": {
      "description": "Run integration test suite",
      "command": "npm run test:integration",
      "timeout_ms": 300000,
      "pass_criteria": {
        "exit_code": 0
      }
    }
  }
}
```

---

## Remember

> "Verification is not bureaucracy. It's insurance."

> "Every gate exists because something failed without it."

> "Automated verification beats manual checking every time."

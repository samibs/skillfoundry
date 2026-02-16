# STORY-002: GitHub Actions CI Pipeline

**Phase:** 1 — CI/CD & Cleanup
**PRD:** competitive-leap
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001
**Affects:** FR-010, FR-011

---

## Description

Create a GitHub Actions CI pipeline that runs the test suite on every push and pull request. This is the single most impactful improvement — moving from "manual trust" to "automated verification" on every change.

---

## Technical Approach

### Workflow: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-22.04, ubuntu-24.04, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: |
          if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y jq bc
          elif command -v brew &> /dev/null; then
            brew install jq bc
          fi

      - name: Run test suite
        run: bash tests/run-tests.sh

      - name: Verify shell scripts are valid
        run: |
          find scripts/ -name "*.sh" -exec bash -n {} \;
```

### Key decisions:

1. **Matrix strategy**: Ubuntu 22.04, Ubuntu 24.04, macOS-latest. Covers the two most common Linux LTS versions and macOS.
2. **Dependencies**: Install `jq` and `bc` which are required by framework scripts.
3. **Shell validation**: `bash -n` syntax check on all scripts catches syntax errors early.
4. **No caching needed**: Tests are fast (shell scripts, no compilation).

### Test suite compatibility:

Before this story, verify `tests/run-tests.sh`:
- Uses `#!/usr/bin/env bash` (not `/bin/bash`)
- Handles macOS `date` vs GNU `date` differences
- Returns proper exit code (0 all pass, 1 any fail)

---

## Acceptance Criteria

```gherkin
Scenario: CI runs on push to main
  Given code is pushed to main branch
  When GitHub Actions triggers
  Then the test suite runs on all matrix targets
  And results are reported in GitHub UI

Scenario: CI runs on pull request
  Given a PR is opened against main
  When GitHub Actions triggers
  Then the test suite runs
  And PR shows pass/fail status check

Scenario: CI fails on test failure
  Given a test in run-tests.sh fails
  When CI runs
  Then the workflow exits with non-zero code
  And GitHub marks the check as failed

Scenario: Shell syntax validation
  Given a script has a syntax error
  When CI runs bash -n validation
  Then the error is caught and reported
```

---

## Security Checklist

- [ ] No secrets required for test execution
- [ ] No write permissions to repository from CI
- [ ] Actions pinned to specific versions (actions/checkout@v4)
- [ ] No artifacts uploaded containing sensitive data

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Create |
| `tests/run-tests.sh` | Verify macOS compatibility, fix if needed |

---

## Testing

- Push to a branch → CI triggers and passes
- Open PR → CI status check appears
- Introduce intentional test failure → CI fails correctly
- Verify all 3 matrix targets pass

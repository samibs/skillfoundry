# Framework Testing

## Overview

Comprehensive test suite for validating framework installation, updates, agent protocols, integration workflows, performance, security, and cross-platform compatibility.

## Running Tests

```bash
# Run all tests
./tests/run-tests.sh

# Run with verbose output
./tests/run-tests.sh --verbose

# Run specific test category
./tests/run-tests.sh --test install
./tests/run-tests.sh --test update
./tests/run-tests.sh --test version
./tests/run-tests.sh --test structure
./tests/run-tests.sh --test agents      # NEW: Agent protocol tests
./tests/run-tests.sh --test integration # NEW: Integration tests
./tests/run-tests.sh --test performance # NEW: Performance tests
./tests/run-tests.sh --test security    # NEW: Security tests
./tests/run-tests.sh --test cross-platform # NEW: Cross-platform tests
```

## Test Categories

### Version Management Tests
- ✅ Version file exists
- ✅ Version format validation (semver)
- ✅ Scripts read from .version file

### Install Script Tests
- ✅ Claude platform installation
- ✅ Copilot platform installation
- ✅ Cursor platform installation
- ✅ Version marker creation

### Update Script Tests
- ✅ Version detection
- ✅ Project registration

### Structure Tests
- ✅ Required files exist
- ✅ Directory structure validation

### Agent Protocol Tests (NEW)
- ✅ Reflection protocol exists
- ✅ Key agents include reflection protocol
- ✅ Agent protocol validation

### Integration Tests (NEW)
- ✅ Install then update workflow
- ✅ All platforms install correctly
- ✅ End-to-end workflow validation

### Performance Tests (NEW)
- ✅ Install script speed (< 5 seconds)
- ✅ File count validation
- ✅ Resource usage checks

### Security Tests (NEW)
- ✅ AI vulnerability patterns documented
- ✅ Agents reference security patterns
- ✅ Security pattern detection

### Cross-Platform Tests (NEW)
- ✅ Both bash and PowerShell scripts exist
- ✅ Unified installer scripts exist
- ✅ Platform compatibility validation

## Test Coverage

**Current Coverage**: Comprehensive tests for critical paths, integration workflows, performance, security, and cross-platform compatibility

**Test Count**: 20+ tests across 8 categories

**Future Enhancements**:
- Agent behavior validation (mock agent execution)
- Advanced security pattern detection
- Load testing for update scripts
- Windows-specific PowerShell tests

## CI/CD Integration

To integrate with CI/CD:

```yaml
# Example GitHub Actions
- name: Run Framework Tests
  run: ./tests/run-tests.sh

# Run specific test categories
- name: Run Security Tests
  run: ./tests/run-tests.sh --test security

- name: Run Integration Tests
  run: ./tests/run-tests.sh --test integration
```

## Adding New Tests

1. Add test function: `test_new_feature()`
2. Call from `run_all_tests()` in appropriate category
3. Follow naming: `test_<category>_<feature>()`
4. Use helpers: `log_test()`, `log_success()`, `log_failure()`
5. Clean up test workspace: `cleanup_test_workspace`

## Test Categories Reference

| Category | Purpose | Tests |
|----------|---------|-------|
| `version` | Version management | 3 tests |
| `install` | Installation scripts | 3 tests |
| `update` | Update scripts | 1 test |
| `structure` | File/directory structure | 2 tests |
| `agents` | Agent protocols | 2 tests |
| `integration` | End-to-end workflows | 2 tests |
| `performance` | Speed and resource usage | 2 tests |
| `security` | Security pattern validation | 2 tests |
| `cross-platform` | Platform compatibility | 2 tests |

**Total**: 19+ tests

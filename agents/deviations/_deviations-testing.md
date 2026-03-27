# Known LLM Deviation Patterns — Testing

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 8: Testing Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| TEST-001 | Testing implementation details | Test behavior/output, not internal state or method calls | tester |
| TEST-002 | Not testing error paths | Test what happens on invalid input, network failure, empty data | tester |
| TEST-003 | Using real APIs in unit tests | Mock external services. Use fixtures for API responses | tester |
| TEST-004 | Not testing edge cases | Test: empty array, null, undefined, 0, "", false, very long strings, special chars | tester |
| TEST-005 | Flaky tests with time-dependent assertions | Use `vi.useFakeTimers()` or fixed dates. Never rely on `Date.now()` in assertions | tester |
| TEST-006 | Not testing auth/authz paths | Test: unauthenticated access, wrong role, expired token, invalid token | tester |
| TEST-007 | Zero test files with "all tests passed" | Vacuous pass detection — 0 test files = 0 tests ran = NOT passing | tester, gate-keeper |

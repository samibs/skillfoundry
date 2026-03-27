# Known LLM Deviation Patterns — Silent Logic Failures

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 12: Silent Logic Failures

> 60% of AI code faults are silent logic errors — code compiles and runs but produces wrong results.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| LOGIC-001 | Happy path bias — only works with ideal input | Test with: null, undefined, empty string, 0, false, empty array, very long strings, special characters, Unicode, negative numbers | tester, coder |
| LOGIC-002 | Off-by-one errors in loops and pagination | Verify: first item, last item, empty set, single item, boundary between pages | tester, coder |
| LOGIC-003 | Incorrect comparison operators | `>` vs `>=`, `<` vs `<=`. Always test boundary values | tester |
| LOGIC-004 | Swallowed exceptions — catch without action | Every catch block MUST either: re-throw, log + return error response, or handle explicitly. NEVER empty catch | coder |
| LOGIC-005 | Floating point arithmetic for money | NEVER use float for currency. Use integer cents (amount * 100) or Decimal/BigNumber library | coder, data-architect |
| LOGIC-006 | Timezone bugs — using local time for storage | Store ALL timestamps as UTC. Convert to local time only at display | coder, data-architect |
| LOGIC-007 | Race conditions in async code | When multiple async operations modify shared state, use mutex/locks or sequential processing | coder |
| LOGIC-008 | Incorrect null coalescing (`??` vs `||`) | `??` only catches null/undefined. `||` catches all falsy (0, '', false). Know which you need | coder |
| LOGIC-009 | String comparison for version numbers | "10.0" < "9.0" as strings. Use semver library for version comparison | coder |
| LOGIC-010 | Incorrect boolean logic (De Morgan's law) | `!(a && b)` ≠ `(!a && !b)`. It equals `(!a || !b)`. Review complex boolean expressions | coder |

# Sub-Agent Response Format Standard

> **MANDATORY**: All sub-agents spawned via the Task tool MUST return responses in this format.

---

## Purpose

When spawning sub-agents, the parent context is limited. Sub-agents that return verbose, unstructured responses waste tokens and pollute the parent's context window. This format ensures:

1. **Conciseness**: Responses under 500 tokens
2. **Actionability**: Clear outcomes and next steps
3. **Traceability**: File paths and decision records
4. **Aggregatability**: Structured data for parent synthesis

---

## Standard Response Template

```markdown
## [Agent Name] Result

### Summary (Required, <100 tokens)
[1-3 sentences describing what was accomplished or found]

### Outcome: [SUCCESS / PARTIAL / FAILED / BLOCKED]

### Files Changed (if applicable)
| File | Action | Description |
|------|--------|-------------|
| `path/to/file` | created/modified/deleted | [1-line description] |

### Key Decisions (if any)
| Decision | Rationale |
|----------|-----------|
| [Choice made] | [Why] |

### Findings (if research/exploration)
| Finding | Relevance | Location |
|---------|-----------|----------|
| [What was found] | [HIGH/MED/LOW] | [file:line or URL] |

### Issues Encountered (if any)
| Issue | Severity | Resolution |
|-------|----------|------------|
| [Problem] | [H/M/L] | [Fixed/Blocked/Deferred] |

### Tests (if applicable)
- Status: [PASSED X / FAILED Y]
- Coverage: [X%]
- Failed: [list of failed test names]

### Next Steps (if incomplete)
1. [Action needed]
2. [Action needed]

### Context to Preserve
[Any critical information the parent agent MUST know]
```

---

## Format by Task Type

### For Code Implementation Tasks

```markdown
## Coder Result

### Summary
Implemented JWT refresh token rotation in auth service.

### Outcome: SUCCESS

### Files Changed
| File | Action | Description |
|------|--------|-------------|
| `src/auth/refresh.py` | created | Token rotation logic |
| `src/models/token.py` | modified | Added token_family field |
| `tests/test_refresh.py` | created | 5 test cases |

### Key Decisions
| Decision | Rationale |
|----------|-----------|
| Token family tracking | Enables reuse detection per RFC 6819 |
| 7-day refresh expiry | Balance security vs UX |

### Tests
- Status: PASSED 5 / FAILED 0
- Coverage: 92%

### Context to Preserve
- Token family ID stored in HttpOnly cookie alongside refresh token
- Reuse detection invalidates entire family
```

### For Research/Exploration Tasks

```markdown
## Explorer Result

### Summary
Found 3 locations where authentication is handled; main entry point is `src/middleware/auth.ts`.

### Outcome: SUCCESS

### Findings
| Finding | Relevance | Location |
|---------|-----------|----------|
| Main auth middleware | HIGH | `src/middleware/auth.ts:45` |
| JWT validation helper | HIGH | `src/utils/jwt.ts:12` |
| Legacy auth (deprecated) | LOW | `src/old/auth.js` |

### Context to Preserve
- Auth uses RS256 algorithm
- Tokens stored in memory, not localStorage
- Refresh handled via `/api/auth/refresh` endpoint
```

### For Testing Tasks

```markdown
## Tester Result

### Summary
Created comprehensive test suite for payment module; 2 edge cases failing.

### Outcome: PARTIAL

### Files Changed
| File | Action | Description |
|------|--------|-------------|
| `tests/payment/test_checkout.py` | created | 12 test cases |
| `tests/payment/test_refund.py` | created | 8 test cases |

### Tests
- Status: PASSED 18 / FAILED 2
- Coverage: 78%
- Failed: `test_partial_refund_rounding`, `test_currency_conversion_edge`

### Issues Encountered
| Issue | Severity | Resolution |
|-------|----------|------------|
| Rounding error in refunds | MEDIUM | Needs fix in `refund.py:89` |
| Currency API timeout | LOW | Mocked for now |

### Next Steps
1. Fix rounding logic in `src/payment/refund.py`
2. Add retry logic for currency API
```

### For Validation/Gate Tasks

```markdown
## Gate Keeper Result

### Summary
Layer validation complete; backend passes, frontend has 2 violations.

### Outcome: PARTIAL

### Findings
| Layer | Status | Issues |
|-------|--------|--------|
| Database | ✅ PASS | - |
| Backend | ✅ PASS | - |
| Frontend | ❌ FAIL | Mock data found, missing error state |

### Issues Encountered
| Issue | Severity | Resolution |
|-------|----------|------------|
| `src/components/UserList.tsx:34` uses mock data | HIGH | Blocked |
| `src/pages/Login.tsx` missing error state | MEDIUM | Blocked |

### Next Steps
1. Replace mock data with real API call
2. Add error state handling to Login page

### Context to Preserve
- Database migration verified: `003_add_tokens.sql`
- Backend tests: 45/45 passed
```

---

## Anti-Patterns (DO NOT)

### Too Verbose
```markdown
❌ BAD:
I have completed the implementation of the JWT refresh token rotation mechanism.
First, I analyzed the existing codebase and found that... [500 more words]
Then I decided to implement... [300 more words]
The code I wrote handles the following cases... [full code listing]
```

### Unstructured
```markdown
❌ BAD:
Done! I made some changes to the auth files. There might be some issues
but it should work. Let me know if you need anything else. The tests
are passing I think, maybe check them?
```

### Missing Actionable Info
```markdown
❌ BAD:
## Summary
Updated the code.

## Outcome: SUCCESS
```

---

## Token Budget Guidelines

| Section | Max Tokens |
|---------|------------|
| Summary | 50 |
| Files Changed | 100 |
| Key Decisions | 75 |
| Findings | 100 |
| Issues | 75 |
| Tests | 50 |
| Next Steps | 50 |
| **Total** | **~500** |

---

## Enforcement

When spawning sub-agents, include this instruction:

```markdown
IMPORTANT: Return your response in the standard sub-agent format.
Keep total response under 500 tokens.
See: agents/_subagent-response-format.md

Required sections:
- Summary (<100 tokens)
- Outcome: SUCCESS/PARTIAL/FAILED/BLOCKED
- Files Changed (table)
- Key Decisions (if any)
- Issues Encountered (if any)
- Next Steps (if incomplete)
- Context to Preserve (critical info only)
```

---

## Integration with Parent Agent

Parent agents should:

1. **Parse structured response** into internal state
2. **Aggregate multiple sub-agent results** into unified view
3. **Act on outcome status**:
   - SUCCESS → Proceed to next phase
   - PARTIAL → Address issues before proceeding
   - FAILED → Retry or escalate
   - BLOCKED → Resolve blockers first
4. **Preserve context** from "Context to Preserve" section
5. **Discard verbose details** - they're in the files, not needed in context

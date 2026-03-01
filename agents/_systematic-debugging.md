# Systematic Debugging Protocol v1.0.0

> Shared module for structured four-phase root cause analysis.
> Referenced by: `/debugger`, `/tester`, `/coder`

---

## Purpose

Replace ad-hoc debugging with a rigorous, repeatable four-phase process that identifies true root causes rather than symptoms.

---

## The Four Phases

```
┌─────────────────────────────────────────────────────────────────┐
│                   SYSTEMATIC DEBUGGING CYCLE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────┐    ┌─────────────┐    ┌────────┐    ┌────────┐  │
│  │  OBSERVE  │ ─► │ HYPOTHESIZE │ ─► │  TEST  │ ─► │ VERIFY │  │
│  └───────────┘    └─────────────┘    └────────┘    └────────┘  │
│       │                                                  │      │
│       │              ┌──────────┐                        │      │
│       └──────────────│  REPEAT  │◄───────────────────────┘      │
│                      └──────────┘                               │
│                   (if hypothesis wrong)                         │
│                                                                 │
│  Phase 1: OBSERVE    - Gather facts without assumptions         │
│  Phase 2: HYPOTHESIZE - Form testable explanations              │
│  Phase 3: TEST       - Validate or invalidate hypothesis        │
│  Phase 4: VERIFY     - Confirm fix and no regressions           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: OBSERVE

### Objective

Gather all relevant facts without making assumptions or jumping to conclusions.

### Activities

```markdown
## OBSERVATION CHECKLIST

### Error Information
- [ ] Exact error message captured
- [ ] Full stack trace collected
- [ ] Error code/type identified
- [ ] Timestamp of occurrence noted

### Reproduction
- [ ] Steps to reproduce documented
- [ ] Consistent reproduction achieved (or noted as intermittent)
- [ ] Minimum reproduction case identified
- [ ] Environment where error occurs noted

### Context
- [ ] Recent changes reviewed (git log, deployments)
- [ ] Related logs collected
- [ ] System state at time of error noted
- [ ] User/input that triggered error captured

### Scope
- [ ] All affected functionality identified
- [ ] Working vs non-working cases compared
- [ ] Boundary conditions noted
```

### Observation Output

```json
{
  "phase": "OBSERVE",
  "debug_id": "DEBUG-20260120-001",
  "error": {
    "message": "Cannot read property 'id' of undefined",
    "type": "TypeError",
    "stack": "at UserService.getProfile (user.service.ts:45)...",
    "code": null
  },
  "reproduction": {
    "steps": [
      "1. Login as user without profile",
      "2. Navigate to /dashboard",
      "3. Error appears"
    ],
    "consistent": true,
    "minimum_case": "Call getProfile() with userId that has no profile record"
  },
  "context": {
    "recent_changes": ["commit abc123: Added profile caching"],
    "environment": "development",
    "related_logs": ["UserService: Fetching profile for user-123"],
    "input": { "userId": "user-123" }
  },
  "scope": {
    "affected": ["/dashboard", "/profile", "/settings"],
    "working": ["/login", "/register", "/home"],
    "pattern": "All pages requiring user profile"
  }
}
```

### Observation Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|--------------|---------|------------------|
| Assuming cause | "It's probably the cache" | Gather evidence first |
| Partial info | Only reading error message | Collect full stack trace |
| Skipping repro | "I know what's wrong" | Always reproduce first |
| Tunnel vision | Only looking at changed code | Review full error path |

---

## Phase 2: HYPOTHESIZE

### Objective

Form one or more testable hypotheses that could explain the observed behavior.

### Hypothesis Formation

```markdown
## HYPOTHESIS TEMPLATE

### Hypothesis [N]
**Statement:** [Clear, falsifiable statement]
**Based on:** [Observation that supports this]
**Predicts:** [What should happen if true]
**Test:** [How to validate or invalidate]
**Confidence:** [LOW|MEDIUM|HIGH]
```

### Example Hypotheses

```json
{
  "phase": "HYPOTHESIZE",
  "debug_id": "DEBUG-20260120-001",
  "hypotheses": [
    {
      "id": "H1",
      "statement": "getProfile() returns undefined when user has no profile record",
      "based_on": "Error occurs for users without profile, not for users with profile",
      "predicts": "Calling getProfile for user with profile will succeed",
      "test": "Call getProfile with userId that has profile record",
      "confidence": "HIGH"
    },
    {
      "id": "H2",
      "statement": "Cache returns stale undefined value after profile deletion",
      "based_on": "Recent change added profile caching",
      "predicts": "Clearing cache will fix the issue temporarily",
      "test": "Clear cache and retry operation",
      "confidence": "MEDIUM"
    },
    {
      "id": "H3",
      "statement": "Database connection timeout causes undefined return",
      "based_on": "Intermittent nature of some similar past issues",
      "predicts": "Error correlates with high database load",
      "test": "Check database metrics at time of error",
      "confidence": "LOW"
    }
  ],
  "primary_hypothesis": "H1",
  "reasoning": "H1 directly explains the error pattern and has highest evidence support"
}
```

### Hypothesis Ranking

| Factor | Weight | Description |
|--------|--------|-------------|
| Evidence support | 40% | How well observations support it |
| Simplicity | 25% | Occam's razor - simpler is better |
| Testability | 20% | Can we easily validate/invalidate |
| Scope match | 15% | Does it explain all symptoms |

---

## Phase 3: TEST

### Objective

Design and execute tests that validate or invalidate each hypothesis.

### Test Design Principles

```markdown
## TEST DESIGN CHECKLIST

- [ ] Test can definitively prove hypothesis FALSE
- [ ] Test is isolated (tests one thing)
- [ ] Test is reproducible
- [ ] Test has clear pass/fail criteria
- [ ] Test doesn't introduce new variables
```

### Test Execution

```json
{
  "phase": "TEST",
  "debug_id": "DEBUG-20260120-001",
  "tests": [
    {
      "hypothesis_id": "H1",
      "test_name": "Test getProfile with existing profile",
      "method": "Unit test with known good userId",
      "steps": [
        "1. Create test user with profile in database",
        "2. Call getProfile(testUserId)",
        "3. Assert result is not undefined",
        "4. Assert result.id equals testUserId"
      ],
      "expected": "Profile object returned successfully",
      "actual": "Profile object returned successfully",
      "result": "PASS",
      "conclusion": "Hypothesis H1 NOT invalidated"
    },
    {
      "hypothesis_id": "H1",
      "test_name": "Test getProfile without profile record",
      "method": "Unit test with userId having no profile",
      "steps": [
        "1. Create test user WITHOUT profile",
        "2. Call getProfile(testUserId)",
        "3. Observe return value"
      ],
      "expected": "If H1 true: returns undefined",
      "actual": "Returns undefined",
      "result": "PASS",
      "conclusion": "Hypothesis H1 CONFIRMED"
    }
  ],
  "hypothesis_results": {
    "H1": "CONFIRMED",
    "H2": "NOT_TESTED",
    "H3": "INVALIDATED"
  }
}
```

### Root Cause Tracing

Once hypothesis is confirmed, trace to true root cause:

```
Error: Cannot read 'id' of undefined
    │
    ▼
Immediate cause: getProfile() returns undefined
    │
    ▼
Why? No profile record exists for user
    │
    ▼
Why? User created via SSO without profile initialization
    │
    ▼
ROOT CAUSE: SSO registration flow missing profile creation step
```

### Five Whys Technique

```markdown
## FIVE WHYS ANALYSIS

1. **Why** did the error occur?
   → getProfile() returned undefined

2. **Why** did getProfile() return undefined?
   → User has no profile record in database

3. **Why** does user have no profile record?
   → User was created via SSO login

4. **Why** doesn't SSO login create profile?
   → SSO registration only creates auth record, not profile

5. **Why** doesn't it create profile?
   → Original SSO implementation didn't anticipate profile requirement

**ROOT CAUSE:** SSO registration flow incomplete - missing profile creation
```

---

## Phase 4: VERIFY

### Objective

Implement fix, verify it resolves the issue, and ensure no regressions.

### Verification Checklist

```markdown
## VERIFICATION CHECKLIST

### Fix Implementation
- [ ] Fix addresses ROOT CAUSE (not just symptom)
- [ ] Fix follows coding standards
- [ ] Fix has appropriate error handling
- [ ] Fix is minimal (no scope creep)

### Testing
- [ ] Original reproduction case now passes
- [ ] Edge cases tested
- [ ] Regression tests added
- [ ] Existing test suite passes

### Review
- [ ] Fix reviewed by peer/agent
- [ ] Fix documented (comments, changelog)
- [ ] Related documentation updated

### Deployment
- [ ] Fix deployed to test environment
- [ ] Verification in test environment
- [ ] Monitoring in place for recurrence
```

### Verification Output

```json
{
  "phase": "VERIFY",
  "debug_id": "DEBUG-20260120-001",
  "fix": {
    "description": "Add profile creation to SSO registration flow",
    "files_modified": [
      "src/auth/sso.service.ts",
      "src/user/profile.service.ts"
    ],
    "lines_changed": 25,
    "commit": "def456"
  },
  "verification": {
    "original_case": {
      "test": "SSO user accessing dashboard",
      "result": "PASS",
      "verified_at": "2026-01-20T14:30:00Z"
    },
    "edge_cases": [
      { "test": "SSO user with existing profile", "result": "PASS" },
      { "test": "Regular user (non-SSO)", "result": "PASS" },
      { "test": "SSO user, profile creation fails", "result": "PASS" }
    ],
    "regression_tests": {
      "total": 245,
      "passed": 245,
      "failed": 0
    }
  },
  "status": "RESOLVED",
  "resolution_time_ms": 3600000
}
```

### Defense in Depth

After fixing, add defensive measures:

```markdown
## DEFENSE IN DEPTH ADDITIONS

1. **Null check at call site**
   ```typescript
   const profile = await getProfile(userId);
   if (!profile) {
     throw new ProfileNotFoundError(userId);
   }
   ```

2. **Database constraint**
   - Add foreign key ensuring profile exists

3. **Monitoring**
   - Alert on ProfileNotFoundError occurrences

4. **Documentation**
   - Update SSO integration guide
```

---

## Debug Session State

### State File Location

```
.claude/debug-state.json
```

### State Schema

```json
{
  "active_session": {
    "debug_id": "DEBUG-20260120-001",
    "phase": "TEST",
    "started_at": "2026-01-20T12:00:00Z",
    "error_summary": "TypeError in UserService.getProfile",
    "observations": { /* ... */ },
    "hypotheses": [ /* ... */ ],
    "tests": [ /* ... */ ],
    "current_hypothesis": "H1"
  },
  "completed_sessions": [
    {
      "debug_id": "DEBUG-20260119-003",
      "resolved": true,
      "root_cause": "Missing null check in payment processor",
      "resolution_time_ms": 7200000
    }
  ],
  "metrics": {
    "total_sessions": 15,
    "avg_resolution_time_ms": 5400000,
    "first_hypothesis_correct_rate": 0.67
  }
}
```

---

## Integration with /debugger

### Enhanced Debugger Flow

```markdown
## /debugger SYSTEMATIC MODE

When invoked, /debugger now follows this protocol:

1. **Initialize**
   - Create debug session
   - Set phase to OBSERVE

2. **Phase 1: Observation**
   - Collect error details
   - Gather context
   - Document reproduction steps
   - Output: Observation report

3. **Phase 2: Hypothesis**
   - Form hypotheses from observations
   - Rank by likelihood
   - Select primary hypothesis
   - Output: Hypothesis list

4. **Phase 3: Testing**
   - Design tests for hypotheses
   - Execute tests
   - Record results
   - Trace to root cause
   - Output: Root cause identification

5. **Phase 4: Verification**
   - Implement fix
   - Verify original case
   - Run regression tests
   - Add defensive measures
   - Output: Resolution report

6. **Complete**
   - Update metrics
   - Archive session
   - Generate learnings
```

---

## Commands

```
/debug start [error]      Start new debug session
/debug observe            Enter/show observation phase
/debug hypothesize        Enter/show hypothesis phase
/debug test               Enter/show test phase
/debug verify             Enter/show verification phase
/debug status             Show current debug state
/debug history            Show past debug sessions
/debug metrics            Show debugging metrics
/debug abort              Abort current session
```

---

## Condition-Based Waiting

For intermittent bugs, use condition-based waiting:

```typescript
// Instead of arbitrary delays
await sleep(5000); // BAD

// Use condition-based waiting
await waitFor(() => queue.isEmpty(), {
  timeout: 30000,
  interval: 100,
  message: 'Queue did not empty'
}); // GOOD
```

### Wait Conditions

| Condition Type | Example |
|----------------|---------|
| State check | `() => service.isReady()` |
| Value check | `() => counter >= 10` |
| Element present | `() => page.locator('.loaded')` |
| Network idle | `() => pendingRequests === 0` |

---

## Metrics Collection

Debug metrics feed into the main metrics system:

```json
{
  "debug_metrics": {
    "total_sessions": 45,
    "avg_phases_to_resolution": 3.2,
    "first_hypothesis_correct": 0.67,
    "avg_hypotheses_per_session": 2.1,
    "avg_tests_per_hypothesis": 1.8,
    "resolution_time": {
      "p50_ms": 3600000,
      "p90_ms": 14400000,
      "p99_ms": 28800000
    },
    "root_cause_categories": {
      "null_reference": 12,
      "race_condition": 8,
      "configuration": 7,
      "logic_error": 10,
      "external_dependency": 8
    }
  }
}
```

---

## Best Practices

1. **Never skip observation** - Assumptions lead to wrong fixes
2. **Write hypotheses down** - Forces clarity of thought
3. **Test to disprove** - Easier than proving correct
4. **Find root cause** - Symptoms will recur if root not fixed
5. **Add regression test** - Prevent future recurrence
6. **Document learnings** - Build organizational knowledge

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Shotgun debugging | Random changes hoping something works | Follow the phases |
| Printf debugging only | Doesn't build understanding | Combine with hypothesis testing |
| Blame the framework | Avoids finding real cause | Assume your code until proven |
| Fix and forget | No regression protection | Always add test |
| Debug by rewrite | Destroys working code | Isolate and fix minimally |

---

*Systematic Debugging Protocol v1.0.0 - SkillFoundry Framework*

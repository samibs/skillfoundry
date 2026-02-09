# The Anvil — Tier 3: Self-Adversarial Review

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: Coder Agent (mandatory before handoff)
**Protocol**: See `agents/_anvil-protocol.md` for overview

---

## Purpose

Force the Coder to "try to break" its own code BEFORE handing off to the Tester. This exploits the LLM paradox: LLMs debug better than they generate, because debugging is analytical (backwards from evidence) while generation is optimistic (forward, single-pass).

By making the Coder switch from "builder" to "breaker" mode, we catch blind spots that would otherwise cascade to the Tester or Gate-Keeper.

---

## When to Run

- After Coder completes implementation
- After Anvil T1 and T2 pass
- Before handoff to Tester

---

## Protocol

### After completing implementation, the Coder MUST:

1. **Switch mental mode**: Stop being the builder. Become the attacker.
2. **List 3+ failure modes**: Ways the code could fail in production
3. **For EACH failure mode**, specify ONE of:
   - A **test** that covers it (with file path)
   - A **guard clause** that prevents it (with file:line)
   - A **validation** that catches it (with file:line)
4. **Declare verdict**: RESILIENT or VULNERABLE

### If ANY failure mode lacks mitigation:
- The Coder MUST fix it before declaring the story complete
- Add the missing test, guard, or validation
- Re-assess and update the adversarial review

---

## Output Format

```markdown
## Self-Adversarial Review

### Failure Mode 1: [what could go wrong]
- **Trigger**: [how it happens — invalid input, race condition, null value, etc.]
- **Impact**: [what breaks — data corruption, crash, security hole, UX failure]
- **Mitigation**: [test / guard clause / validation]
- **Location**: [file:line where the mitigation lives]

### Failure Mode 2: [what could go wrong]
- **Trigger**: [how it happens]
- **Impact**: [what breaks]
- **Mitigation**: [test / guard clause / validation]
- **Location**: [file:line]

### Failure Mode 3: [what could go wrong]
- **Trigger**: [how it happens]
- **Impact**: [what breaks]
- **Mitigation**: [test / guard clause / validation]
- **Location**: [file:line]

### Verdict: RESILIENT / VULNERABLE

[If VULNERABLE: List unmitigated failure modes and what needs to be done]
```

---

## Failure Mode Categories

The Coder should consider these categories when identifying failure modes:

| Category | Examples |
|----------|----------|
| **Input** | Null/empty values, oversized input, special characters, injection |
| **State** | Race conditions, stale data, concurrent modifications |
| **Integration** | API timeout, database unavailable, third-party failure |
| **Security** | Auth bypass, privilege escalation, data exposure |
| **Edge Cases** | Boundary values, empty collections, division by zero |
| **Environment** | Missing env vars, disk full, permission denied |

---

## Minimum Requirements

| Aspect | Minimum |
|--------|---------|
| Failure modes listed | 3 |
| Categories covered | 2 different categories |
| Each mode has mitigation | 100% (or verdict is VULNERABLE) |
| Mitigations are real | Must reference actual files/lines |

---

## Verdict Rules

### RESILIENT
- All failure modes have mitigations
- Mitigations reference real code (not hypothetical)
- At least 2 different failure categories covered

### VULNERABLE
- Any failure mode lacks mitigation
- Mitigations are vague or reference non-existent code
- Only 1 failure category considered
- Fewer than 3 failure modes listed

---

## Pipeline Behavior

- **RESILIENT** → Continue to Tester
- **VULNERABLE** → Pipeline BLOCKS
  - Coder must address unmitigated failure modes
  - After fixing, re-run adversarial review
  - If still VULNERABLE after 2 attempts → Escalate to Senior Engineer

---

## Examples

### Good Adversarial Review

```markdown
## Self-Adversarial Review

### Failure Mode 1: SQL injection via user search query
- **Trigger**: User enters `'; DROP TABLE users;--` in search field
- **Impact**: Database destruction
- **Mitigation**: Parameterized query in search service
- **Location**: `src/services/search.py:45` — uses SQLAlchemy ORM (auto-parameterized)

### Failure Mode 2: Missing authentication on admin endpoint
- **Trigger**: Unauthenticated request to /api/admin/users
- **Impact**: Data exposure of all user records
- **Mitigation**: Auth middleware applied to admin router
- **Location**: `src/routes/admin.py:12` — `@require_role("admin")` decorator

### Failure Mode 3: Empty result set causes division by zero in analytics
- **Trigger**: New user with zero transactions calls /api/analytics/average
- **Impact**: 500 error, unhandled exception
- **Mitigation**: Guard clause checks for empty set
- **Location**: `src/services/analytics.py:78` — `if len(transactions) == 0: return 0.0`

### Verdict: RESILIENT
```

### Bad Adversarial Review (triggers VULNERABLE)

```markdown
## Self-Adversarial Review

### Failure Mode 1: Invalid input
- **Trigger**: Bad data
- **Impact**: Might crash
- **Mitigation**: Will add validation later

### Verdict: VULNERABLE
- Only 1 failure mode (minimum 3)
- Mitigation is vague ("will add later" — not implemented)
- Only 1 category covered
```

---

## Integration with Reflection Protocol

The Self-Adversarial Review extends the existing Reflection Protocol (`agents/_reflection-protocol.md`). It replaces the generic post-action "Edge Case Analysis" with a structured, mandatory, actionable review.

---

*The Anvil T3 — If you can't break it, you haven't tested it. If you can break it, fix it first.*

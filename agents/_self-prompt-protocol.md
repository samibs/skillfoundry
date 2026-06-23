# Self-Prompt Protocol

**Version**: 1.0
**Status**: ACTIVE
**Used By**: `_ralph-loop-protocol.md`, `/improve`, `/goma` (loop mode), `_reflection-protocol.md`

---

## Purpose

When an agent determines its goal is not yet achieved (Step 4 of the Ralph Loop), it must formulate its own next task rather than waiting for a human. This protocol governs the quality, structure, and safety of that self-generated prompt.

**The self-prompt is the most critical artifact in a loop.** A vague self-prompt causes runaway loops, hallucinated progress, and scope drift. A sharp self-prompt converges in the minimum number of iterations.

---

## The Self-Prompt Template

Every self-prompt MUST follow this structure:

```
[SELF-PROMPT — Iteration N+1]

Context (carried forward from this iteration):
  Previous task:    [exactly what was attempted — be precise]
  What happened:    [the actual outcome, not what was hoped for]
  Still failing:    [specific unmet success criteria, copied verbatim from checkpoint]
  Root cause:       [why it is still failing — honest diagnosis, no hedging]

Next task (specific and narrow):
  [One concrete action that directly targets the root cause above]

  NOT acceptable:  "Fix the remaining issues"
  NOT acceptable:  "Continue working on the auth module"
  REQUIRED:        "Update src/auth/middleware.ts:67 — the exp claim check is bypassed
                    in dev mode via the DEV_SKIP_JWT env flag. Remove this bypass entirely."

Different approach (if prior approach failed):
  [State what you will do differently and why the previous approach was insufficient]
  [If first iteration, write: N/A]

Do NOT pursue this iteration:
  [ ] Anything outside the original success criteria
  [ ] Adjacent improvements noticed while working
  [ ] Refactoring of surrounding code
  [ ] "While I'm in here" changes
```

---

## Five Quality Rules

### Rule 1: Be More Specific Each Iteration

Each self-prompt must narrow the scope compared to the previous one. If the prompt is getting less specific, the agent is losing track of the goal.

```
Iteration 1 goal:          "All tests pass"
Iteration 2 self-prompt:
  GOOD → "Fix null pointer in UserService.getById() — test fails at line 87,
           column 12: cannot read property 'email' of undefined"
  BAD  → "Fix the remaining test failures" ← still vague, will loop indefinitely
```

### Rule 2: State the Actual Root Cause

Do not write "it is still failing." Write why.

```
BAD:  "The auth tests are still failing. Need to keep working on them."
GOOD: "Auth tests fail because refreshToken() does not update the token family
       counter on use. The DB still holds the old counter value, causing the
       reuse-detection check to fire on valid tokens."
```

### Rule 3: No Invented Requirements

The self-prompt must only address items from the ORIGINAL success criteria. Anything noticed outside the goal scope must be logged but not pursued.

```
FORBIDDEN: "Also, I noticed the logging format is inconsistent across services.
            I should standardize that too."
CORRECT:   "Logging inconsistency is out of scope for this loop.
            Logged to memory_bank/knowledge/observations.jsonl."
```

### Rule 4: State What Is Different

If you are running the same approach again, you will get the same result. The self-prompt must explain what changed — new information, a different file, a different layer, a different mechanism.

```
BAD:  "Retry fixing the login endpoint."
GOOD: "Retry fixing the login endpoint — but target the middleware chain, not
       the handler. The previous approach validated in the wrong layer; the
       middleware runs before the handler and is where the check must live."
```

### Rule 5: Acknowledge Discoveries

If the previous iteration revealed something unexpected (a hidden dependency, a wrong assumption, a deeper root cause), the self-prompt must capture that discovery so the next execution uses it.

```
DISCOVERY: "The test was testing the wrong function. The real entry point
            is processPayment(), not handlePayment()."
SELF-PROMPT must say: "Target processPayment() at payments/service.ts:112,
                       not handlePayment() as previously assumed."
```

---

## Oscillation Prevention

Before finalizing any self-prompt, check for oscillation:

```
IF self_prompt[N].remaining == self_prompt[N-1].remaining
   AND self_prompt[N].approach == self_prompt[N-1].approach:

  → Oscillation confirmed. DO NOT formulate another self-prompt.
  → Exit the loop with judgment: OSCILLATION
  → Surface to user:
    "I have attempted [item] [N] times using the same approach and cannot
     make progress. Here is my diagnosis: [root cause]. Here is what I
     cannot resolve without your input: [specific blocker]."
```

A genuinely different approach targeting the same remaining item is NOT oscillation, even if the item has not yet been resolved.

---

## Budget-Aware Self-Prompting

Check budget before formulating a self-prompt:

```
IF budget_remaining > 40%:
  → Normal self-prompt: address all remaining criteria by priority

IF 20% < budget_remaining <= 40%:
  → MINIMAL self-prompt: target only the single highest-priority unmet criterion
  → State explicitly: "[LOW BUDGET] Targeting only: [single criterion]"

IF budget_remaining <= 20%:
  → Do NOT formulate a self-prompt
  → Exit with BUDGET_HALT
  → Write remaining state to .claude/ralph-loop-state.json
  → Output: "Budget guard triggered. State saved. Resume with /improve --resume."
```

---

## State Recording

When writing a self-prompt, also append it to `.claude/ralph-loop-state.json`:

```json
{
  "iteration": 3,
  "self_prompt": {
    "previous_task": "...",
    "what_happened": "...",
    "still_failing": ["criterion X", "criterion Y"],
    "root_cause": "...",
    "next_task": "...",
    "different_approach": "...",
    "budget_remaining_pct": 45,
    "oscillation_check": "different approach — not oscillation"
  }
}
```

---

## Good vs Bad Examples

### Good Self-Prompt (Iteration 2 of a test loop)

```
[SELF-PROMPT — Iteration 2]

Context:
  Previous task:  Run all tests, fix failures in the auth module
  What happened:  Fixed 3 of 5 failures. Two remain.
  Still failing:
    - "Token expiry test: endpoint returns 200 instead of 401 after JWT expires"
    - "Admin route test: non-admin user can access /admin (should return 403)"
  Root cause:
    - Token expiry: JWT verification skips the `exp` claim when APP_ENV=development
      (see src/auth/jwt.ts:34 — there is an explicit env bypass that must be removed)
    - Admin route: middleware reads `req.user.role` but the DB column is `user_role`,
      not `role`. The field is always undefined, so the check always passes.

Next task:
  1. src/auth/jwt.ts:34 — Remove the dev-mode bypass of exp verification. JWT expiry
     must be enforced in all environments.
  2. src/admin/middleware.ts:23 — Change `req.user.role` to `req.user.user_role`
     to match the actual database column name.

Different approach:
  Previous fix targeted the test assertions. This fix targets the implementation
  bugs the tests are correctly catching.
```

### Bad Self-Prompt (will loop indefinitely)

```
[SELF-PROMPT — Iteration 2]

The auth tests are still not passing. I should continue working on the auth
module. There are still some issues to resolve in the authentication system.
I will keep working on fixing the remaining problems.
```

This prompt will produce the same result as iteration 1. The loop will oscillate.

---

## Anti-Patterns

| Anti-Pattern | Why Dangerous | Correct Behaviour |
|---|---|---|
| Vague next task | Loop will not converge | Specify file, function, and line if possible |
| Expanding scope each iteration | Loop never terminates | Reject new items; log to backlog |
| Repeating the same approach | Causes oscillation | Always state what is different |
| Hiding root cause | Loop circles the symptom | Dig for and state the actual cause |
| Ignoring discoveries | Iteration N+1 makes same mistake | Capture discoveries explicitly |
| Omitting "different approach" field | Implies retry without change | Always fill this field |

---

*Self-Prompt Protocol — Sharp prompts converge. Vague prompts spiral.*

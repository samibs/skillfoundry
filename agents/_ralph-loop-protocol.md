# The Ralph Loop Protocol

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: All loop-capable agents

---

## What Is the Ralph Loop?

Named after the pattern described by Anthropic's Boris Cherny:

> "The model summarizes everything done so far and asks whether it has accomplished its goal,
> bouncing back into task execution if incomplete."

This is **not** a retry mechanism. It is a self-prompting execution cycle where the agent:
1. Executes a task
2. Writes a checkpoint (what was done, what remains)
3. Judges its own progress (AI decision, not Boolean)
4. Formulates its own next prompt if incomplete
5. Re-enters execution with that self-generated prompt
6. Continues until goal achieved or budget exhausted

The key distinction: **the agent is simultaneously the worker, the scheduler, and the quality judge.**

---

## The Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                        RALPH LOOP CYCLE                          │
│                                                                   │
│   SET GOAL + SUCCESS CRITERIA                                    │
│          │                                                        │
│          ▼                                                        │
│   ┌────────────┐   ┌─────────────┐   ┌──────────────────────┐  │
│   │  EXECUTE   │──►│ CHECKPOINT  │──►│  GOAL ACHIEVED?      │  │
│   │  CURRENT   │   │ (agent      │   │  YES → PRESENT       │  │
│   │  TASK      │   │  writes it) │   │  NO  → SELF-PROMPT   │  │
│   └────────────┘   └─────────────┘   └──────────────────────┘  │
│          ▲                                        │              │
│          │                                        ▼              │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  SELF-PROMPT: "I tried X. Still need Y. Next: Z."        │  │
│   │  (see _self-prompt-protocol.md)                          │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│   Guards:                                                        │
│   • Oscillation: same remaining work 2× with no change → HALT   │
│   • Max iterations exceeded → HALT                               │
│   • Budget < 20% remaining → HALT                                │
│   • Scope drift detected → LOG and skip                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Protocol

### Step 1: Goal Setting

Before entering the loop, the goal must be explicit and measurable. Vague goals do not converge.

```
GOAL FORMAT:
  Goal:             [one sentence — the desired end state]
  Success Criteria:
    - [ ] [measurable criterion 1]
    - [ ] [measurable criterion 2]
  Max Iterations:   [N, default 5]
  Budget Guard:     [stop if < 20% tokens remaining]
```

**Good goals:**
- "All tests pass with 80%+ coverage"
- "No GuardLoop patterns (GL-01 through GL-10) found in the codebase"
- "The login flow works end-to-end across all three layers"

**Bad goals (will not converge):**
- "Make it better"
- "Fix everything"
- "Improve code quality generally"

---

### Step 2: Execute Current Task

Execute the task defined by `current_task`. On iteration 1, this is the original goal. On subsequent iterations, this is the self-generated prompt from Step 5.

Do not shortcut execution because you know you will loop back. Each iteration must be a genuine attempt.

---

### Step 3: Write the Checkpoint

After execution, write a structured checkpoint before judging:

```markdown
## Ralph Loop Checkpoint — Iteration [N]

**Goal**: [original goal]
**Iteration**: [N] / [max]

**Completed this iteration**:
- [concrete thing done 1]
- [concrete thing done 2]

**Success criteria status**:
- [x] [criterion 1] — ACHIEVED
- [ ] [criterion 2] — NOT YET (reason: ...)
- [ ] [criterion 3] — BLOCKED (reason: ...)

**Remaining work** (honest assessment):
- [specific remaining item 1]
- [specific remaining item 2]

**What I learned this iteration**:
- [something discovered that should change the next approach]
```

---

### Step 4: Goal Achievement Judgment

The agent decides — not a Boolean check. Ask:

1. Are ALL success criteria met? (from checkpoint)
2. Is remaining work zero or negligible?
3. Would a developer accept this as done?

| Judgment | Condition | Action |
|---|---|---|
| `COMPLETE` | All criteria met, no remaining work | Present output, exit loop |
| `CONTINUE` | Some criteria unmet, path is clear | Formulate self-prompt, loop |
| `BLOCKED` | Cannot progress without external input | Surface blocker, exit loop |
| `BUDGET_HALT` | Token budget < 20% remaining | Present partial output, save state |
| `OSCILLATION` | Same remaining work appeared twice with no change | Halt, escalate to user |

---

### Step 5: Self-Prompt (CONTINUE only)

Formulate the next iteration's task. Follow `_self-prompt-protocol.md` strictly.

```
SELF-PROMPT FORMAT:
  Previous attempt: [1 sentence — what was tried]
  Result:           [1 sentence — what actually happened]
  Remaining:        [list of unmet criteria from checkpoint]
  Root cause:       [why criteria are still unmet — honest diagnosis]
  Next task:        [specific, targeted instruction — file:line level if possible]
  Different approach: [what to do differently, or N/A if first try was directionally correct]
```

Set `current_task = self_prompt` and return to Step 2.

---

### Step 6: Exit and Present

On any terminal judgment (`COMPLETE`, `BLOCKED`, `BUDGET_HALT`, `OSCILLATION`):

```
RALPH LOOP COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Goal:        [original goal]
  Outcome:     [COMPLETE / BLOCKED / BUDGET_HALT / OSCILLATION]
  Iterations:  [N] of [max]

  Achieved:
    [x] [criterion 1]
    [x] [criterion 2]

  Not achieved:
    [ ] [criterion 3] — [reason]

  Iteration history:
    #1: [1-line summary of what was done and what it accomplished]
    #2: [1-line summary]
    ...

  [If BLOCKED]: Action required — [what the user must provide to unblock]
  [If OSCILLATION]: Stuck on — [the specific item that failed repeatedly]
  [If BUDGET_HALT]: Resume with /improve --resume or /goma --resume
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Safety Guards

### Oscillation Detection

Before formulating each self-prompt, compare remaining work to the previous iteration's remaining work.

```
IF remaining_work[N] == remaining_work[N-1]:
  → Oscillation confirmed.
  → Set judgment to OSCILLATION.
  → Exit loop. Do NOT retry the same approach.
  → Report: "Stuck on [item] after [N] identical attempts."
```

Genuinely different approaches to the same remaining item are NOT oscillation, even if the item persists.

### Max Iteration Guard

```
IF iteration > max_iterations:
  → Exit with BUDGET_HALT
  → Present partial output
  → List remaining work with honest assessment of why the loop did not complete
```

### Budget Guard

```
IF token_budget_remaining < 20%:
  → Complete the current iteration only
  → Exit with BUDGET_HALT
  → Write remaining state to .claude/ralph-loop-state.json for resumption
```

### Scope Drift Detection

If remaining work at iteration N contains items NOT present in the original success criteria, the agent invented new requirements mid-loop.

```
IF new_item NOT IN original_success_criteria:
  → Do NOT pursue this item in the current loop
  → Log to memory_bank/knowledge/scope-drift.jsonl
  → Note in checkpoint: "Observed [item] but it is out of scope — logged for later"
```

---

## State Persistence

Write to `.claude/ralph-loop-state.json` after every iteration:

```json
{
  "command": "[which command triggered the loop]",
  "goal": "...",
  "iteration": 3,
  "max_iterations": 5,
  "status": "CONTINUE",
  "completed_criteria": ["criterion 1", "criterion 2"],
  "remaining_criteria": ["criterion 3"],
  "iteration_history": [
    {"n": 1, "summary": "...", "remaining": ["a", "b", "c"]},
    {"n": 2, "summary": "...", "remaining": ["a", "c"]},
    {"n": 3, "summary": "...", "remaining": ["c"]}
  ],
  "last_self_prompt": "...",
  "oscillation_check": ["c", "c"]
}
```

---

## Integration Points

| Use Case | Command | Loop Goal |
|---|---|---|
| Continuous improvement | `/improve` | "No improvement opportunities remain" |
| Autonomous feature pipeline | `/goma` | "All three layers green per story" |
| Test fix loop | `/testloop` | "All tests pass" |
| Security hardening | `/security --fix` | "Zero findings in security scan" |
| Refactor to completion | `/refactor` | "Quality score meets threshold" |

---

*Ralph Loop Protocol — Agent as worker, scheduler, and judge.*
*Inspired by Boris Cherny's loop model (Anthropic, 2026).*

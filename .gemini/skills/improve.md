# /improve

Gemini skill for `improve`.

## Instructions

# /improve — Continuous Improvement Loop

> Scans the codebase for improvement opportunities, fixes them one at a time,
> and loops until no improvements remain or the token budget is exhausted.
>
> This is Boris Cherny's "agent prompting itself" pattern applied to codebase health:
> the agent scans → prioritizes → fixes → checkpoints → scans again.
> No human input between iterations.
>
> Protocol engine: `agents/_ralph-loop-protocol.md` + `agents/_self-prompt-protocol.md`

---

## Usage

```
/improve                    Scan and fix all improvement categories
/improve arch               Architectural improvements only
/improve duplication        Duplicate code / abstraction consolidation
/improve quality            Code quality (GuardLoop patterns GL-01 through GL-10)
/improve security           Security posture improvements
/improve --dry-run          Show what would be fixed, do not apply any changes
/improve --resume           Resume a previously interrupted improvement loop
/improve --budget [N]       Set max iterations (default: 10)
/improve --pr               Open a PR with all fixes when the loop completes
```

---

## What This Command Does

This is a **self-prompting loop** — the agent finds the work, does the work, finds more work, and stops when there is nothing left.

```
LOOP {
  1. SCAN       — Identify all improvement opportunities in scope
  2. PRIORITIZE — Rank by impact, select the single highest-priority item
  3. FIX        — Apply the fix (surgical — one item per iteration, no scope creep)
  4. VERIFY     — Confirm the fix did not regress anything
  5. CHECKPOINT — Record: what was fixed, what remains, what was learned
  6. JUDGE      — Any improvements remaining? Budget sufficient to continue?
  7. SELF-PROMPT — Formulate: "I fixed X. Still need to address Y at [location]."
  8. → RE-ENTER at step 2 with that self-prompt as current_task
}

EXIT when:
  - Backlog is empty (no improvements remain in scope)
  - Token budget < 20% remaining
  - Max iterations reached
  - Same item appears in remaining work twice with no change (oscillation)
  - An item cannot be fixed without user input (blocked)
```

---

## Instructions

### Phase 0: Pre-Flight

**0.1 Check for interrupted state**

```bash
python3 -c "
import json, sys
try:
    s = json.load(open('.claude/ralph-loop-state.json'))
    if s.get('command') == 'improve' and s.get('status') == 'CONTINUE':
        print('RESUME_AVAILABLE')
        print(f'Iteration: {s[\"iteration\"]} of {s[\"max_iterations\"]}')
        print(f'Remaining: {len(s.get(\"remaining_criteria\", []))} items')
except:
    print('NO_PRIOR_STATE')
" 2>/dev/null || echo "NO_PRIOR_STATE"
```

If `RESUME_AVAILABLE` and `--resume` was not passed, ask:
> "A previous `/improve` run was interrupted at iteration [N]. Resume it, or start fresh?"

**0.2 Determine scope**

```
No args       → all categories: security, quality, duplication, arch
"arch"        → architectural improvements only
"duplication" → duplication only
"quality"     → GuardLoop quality patterns only
"security"    → security posture only
```

**0.3 Initialise loop state**

Write `.claude/ralph-loop-state.json`:

```json
{
  "command": "improve",
  "goal": "No improvement opportunities remain in [scope] categories",
  "iteration": 0,
  "max_iterations": 10,
  "status": "CONTINUE",
  "fixed_items": [],
  "reverted_items": [],
  "blocked_items": [],
  "remaining_items": [],
  "iteration_history": []
}
```

---

### Phase 1: Initial Scan

Run a full scan across all requested categories. This defines the improvement backlog for the entire loop.

**Security** — scan for:
- API endpoints missing authentication middleware
- Auth endpoints missing rate limiting
- Missing input validation at system boundaries (user input, external APIs)
- CORS accepting `*` in production configuration
- Missing Content-Security-Policy header setup
- Hardcoded secrets or credentials (GL-01)
- Auth tokens in localStorage or sessionStorage (GL-02)

**Quality** — run GuardLoop scan:
```bash
bash scripts/guardloop-analyze.sh 2>/dev/null
```
If script unavailable, inline-grep for all 10 GL patterns from `agents/_guardloop-rules.md`:
- GL-01: hardcoded-secret
- GL-02: localstorage-token
- GL-03: file-corruption
- GL-04: empty-catch
- GL-05: placeholder-code
- GL-06: nullable-array-method
- GL-07: ts-ignore-no-comment
- GL-08: console-log-unguarded
- GL-09: hardcoded-path
- GL-10: select-star-query

**Duplication** — scan for:
- Functions with greater than 80% structural similarity across files (same logic, different names)
- Constants or configuration values appearing in 3 or more files (should be a shared config)
- Repeated code blocks of 15 or more identical lines in different locations

**Architectural** — scan for:
- Files exceeding 500 lines (God object candidates)
- Functions with deeply nested if/else/switch/loop (cyclomatic complexity > 10)
- Circular import indicators (A imports B, B imports A)
- Layer violations (frontend code importing DB models directly, etc.)

**Present initial scan:**

```
/improve Scan — [scope]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Security:        [N] items
  Quality:         [N] items
  Duplication:     [N] items
  Architectural:   [N] items
  ─────────────────────────────────────────────
  Total backlog:   [N] improvements

  Priority order:
    1. [highest item] ([category])
    2. [second item] ([category])
    3. [third item] ([category])
    ... and [N-3] more

  Starting improvement loop (max [max_iterations] iterations)...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If backlog = 0: exit immediately.
```
/improve — Nothing to do
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Scanned [scope]. No improvement opportunities found.
  Codebase is clean across all requested categories.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Phase 2: Improvement Loop (Ralph Loop Engine)

Enter the Ralph Loop (`agents/_ralph-loop-protocol.md`). Each iteration runs steps 2.1 through 2.6.

**2.1 PRIORITIZE**

Select the single highest-priority item from the remaining backlog:

| Priority | Category | Pattern |
|---|---|---|
| 1 | Security — Critical | Hardcoded secrets, exposed tokens, missing auth |
| 2 | Quality — Critical | GL-01, GL-02, GL-03 |
| 3 | Quality — High | GL-04, GL-05, GL-06 |
| 4 | Security — Medium | Missing rate limits, CORS, CSP |
| 5 | Duplication | High-impact consolidation opportunities |
| 6 | Quality — Medium | GL-07, GL-08, GL-09, GL-10 |
| 7 | Architectural | God objects, circular deps, layer violations |

Output: `ITERATION [N] — Targeting: [specific item] ([category] / [priority])`

**2.2 FIX (Surgical)**

Apply the fix. Hard rules:
- Fix ONLY the selected item. One improvement per iteration.
- Do not fix adjacent issues discovered during the fix — add them to backlog instead.
- Do not refactor surrounding code as a side effect.
- If the fix requires more than 50 lines of change: split it into sub-items, add to backlog, apply the first sub-item now.

**2.3 VERIFY**

After fixing, verify no regressions:

```bash
# Detect and run available test framework
if [ -f "package.json" ]; then
  npm test --passWithNoTests 2>&1 | tail -20
elif [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
  python -m pytest --tb=short 2>&1 | tail -20
elif find . -name "*.Tests.csproj" -not -path "*/node_modules/*" | grep -q .; then
  dotnet test --no-build 2>&1 | tail -20
else
  echo "NO_TEST_FRAMEWORK — static analysis only"
fi
```

If tests fail after the fix:
- Revert the change: `git checkout -- [changed files]`
- Mark item as `REVERTED` in state
- Log reason
- Continue to next item in backlog (do not retry this item in the same run)

**2.4 CHECKPOINT**

Write the iteration checkpoint:

```
ITERATION [N] CHECKPOINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Targeted:  [description of item]
  Outcome:   [FIXED / REVERTED / BLOCKED]
  File(s):   [files changed or unchanged]
  Tests:     [PASS / FAIL / NO_FRAMEWORK]
  Backlog:   [N] items remaining
  Next:      [description of next item]
```

Update `.claude/ralph-loop-state.json` with current iteration state.

**2.5 JUDGE**

```
IF backlog is empty:                     → COMPLETE
IF iteration >= max_iterations:          → BUDGET_HALT
IF token_budget < 20% remaining:         → BUDGET_HALT
IF oscillation detected (see below):     → OSCILLATION on [item]
ELSE:                                    → CONTINUE
```

**Oscillation check**: if the same item appears in `remaining_items` for two consecutive iterations with no change to it:
→ mark as OSCILLATION, remove from active backlog, add to `blocked_items` with note "oscillation detected".

**2.6 SELF-PROMPT (if CONTINUE)**

Follow `_self-prompt-protocol.md`:

```
[SELF-PROMPT — Iteration N+1]
  Previous task:     [item just attempted]
  Outcome:           [FIXED / REVERTED / BLOCKED]
  Remaining:         [N] items in backlog
  Next task:         Fix [specific next item] at [specific location] using [approach]
  Different approach: [N/A, or state change if previous was reverted]
```

Set `current_task = self_prompt` and loop to 2.1.

---

### Phase 3: Exit Report

When the loop exits on any condition:

```
/improve COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Outcome:    [COMPLETE / BUDGET_HALT / OSCILLATION / BLOCKED]
  Iterations: [N] of [max_iterations]

  Fixed ([N] items):
    ✓ [item 1 description] — [file:line]
    ✓ [item 2 description] — [file:line]

  Reverted ([N] items, tests failed):
    ✗ [item X description] — [reason tests failed]

  Blocked ([N] items):
    ⊘ [item Y description] — [why it cannot be fixed automatically]

  Remaining ([N] items, not reached):
    • [item A description] — not reached within iteration budget
    • [item B description] — not reached within iteration budget

  [If OSCILLATION]:
    Stuck on: [item that oscillated]
    Diagnosis: [what the agent tried and why it kept failing]
    Action needed: [what user must provide to resolve]

  [If BUDGET_HALT]:
    State saved: .claude/ralph-loop-state.json
    Resume: /improve --resume

  [If --pr and fixed_items > 0]:
    PR: [PR URL]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**If `--pr` flag** and at least one item was fixed, create a PR after the loop:

```bash
git add -A
git commit -m "improve: [N] automated improvements via /improve

Fixed:
- [item 1]
- [item 2]

Applied by SkillFoundry /improve loop"

gh pr create \
  --title "improve: [N] automated improvements" \
  --body "## Automated Improvements

Applied by \`/improve\` (SkillFoundry self-prompting improvement loop).

### Fixed ([N] items)
[list]

### Skipped / Blocked
[list with reasons]

### How to review
Each fix is a targeted, single-item change. Review file by file — no cross-item dependencies."
```

---

### Dry Run Mode

`/improve --dry-run` runs Phase 1 (scan + prioritize) only. Does not apply any fixes.

```
/improve DRY RUN — What would be fixed:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Backlog: [N] items across [scope]

  Iteration 1 (would fix): [highest priority item — location]
  Iteration 2 (would fix): [second priority item — location]
  Iteration 3 (would fix): [third priority item — location]
  ... ([N-3] more items)

  Estimated iterations: [N] (max: 10)
  To apply all fixes:   /improve
  To apply by category: /improve security | /improve quality | ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Integration

| Agent / Protocol | Role |
|---|---|
| `_ralph-loop-protocol.md` | The loop engine (Steps 2.1–2.6) |
| `_self-prompt-protocol.md` | Governs self-prompt quality in Step 2.6 |
| `agents/_guardloop-rules.md` | Source of quality patterns for the scan |
| `scripts/guardloop-analyze.sh` | Quality scan script (Phase 1) |
| `ruthless-coder` (agents/ruthless-coder.md) | Applies fixes in Step 2.2 |
| `ruthless-tester` (agents/ruthless-tester.md) | Verifies fixes in Step 2.3 |
| `merciless-evaluator` | Final quality grade on COMPLETE exit |

---

*The Improvement Loop — The agent finds the work, does the work, finds more work,*
*and stops when there is nothing left.*
*Pattern: Boris Cherny (Anthropic, 2026) × SkillFoundry*

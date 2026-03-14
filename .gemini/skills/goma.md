# /goma

Gemini skill for `goma`.

## Instructions

# /goma - Go Mode Autonomous

You are the Autonomous Execution Commander. You run the full `/go` pipeline with minimal interruptions, maximum speed, and full auto-remediation. All escalations are deferred and logged for post-execution review. Use only when you trust the PRDs and want hands-off execution.

**Persona**: See `agents/fixer-orchestrator.md` for auto-remediation persona.
**Reflection Protocol**: See `agents/_reflection-protocol.md` for reflection requirements.

---

## OPERATING MODE

```
/goma                       Full autonomous execution of all PRDs
/goma [prd-file]            Autonomous execution of specific PRD
/goma --dry-run             Preview execution plan without acting
/goma --resume              Resume interrupted autonomous execution
/goma --review              Show deferred escalations from last run
/goma --rollback            Rollback last autonomous execution
```

---

## PHASE 1: PRE-FLIGHT SAFETY CHECK

Autonomous mode is powerful but risky. Validate thoroughly before launching.

### 1.1 Verify PRDs Exist

```
SCAN: genesis/*.md (exclude TEMPLATE.md, README.md)

IF no PRDs found:
  OUTPUT:
    NO PRDs FOUND -- AUTONOMOUS MODE ABORTED
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Autonomous mode requires PRDs in genesis/.
    Create one: /prd "your feature idea"
  EXIT.
```

### 1.1.5 Git Repository Check

```
IF NOT a git repository (no .git/ directory):
  AUTO-INITIALIZE:
    git init && git add -A && git commit -m "initial commit"

  OUTPUT:
    ✓ Git repository initialized with initial commit.

  CONTINUE.

IF git working tree is dirty (uncommitted changes):
  OUTPUT:
    ⚠️  DIRTY GIT WORKING TREE — AUTONOMOUS MODE BLOCKED
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Uncommitted changes detected. Autonomous mode requires a clean
    working tree to guarantee safe rollback.

    Options:
      git add -A && git commit -m "save work before /goma"
      git stash

    Or use /gosm (semi-auto mode allows dirty tree with warning).

  WAIT for user confirmation. EXIT if declined.
```

This MUST run before the risk warning (1.2) and before any execution begins.

### 1.2 Autonomous Risk Warning

```
AUTONOMOUS MODE WARNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are about to execute in FULL AUTONOMOUS mode.

This means:
  - ALL violations will be auto-fixed without your input
  - Architecture decisions will be made by the agent
  - Business ambiguities will be resolved with best-guess logic
  - You will NOT be interrupted until execution completes
  - Escalations are LOGGED, not blocking

Risks:
  - Auto-resolved decisions may not match your intent
  - Rollback may be needed if quality is poor
  - Complex multi-PRD runs may make compounding bad decisions

Safety nets:
  - Full rollback available: /goma --rollback or /nuke
  - All deferred escalations logged for review
  - Emergency stop: Ctrl+C preserves state for /goma --resume

PRDs to execute: [N]
Estimated stories: [M]

Proceed with autonomous execution? (y/N)
```

### 1.3 Pre-Flight Checklist

```
CHECKLIST:
  [ ] All PRDs pass critical validation
  [ ] No interrupted state exists (or user chose --resume)
  [ ] Git working tree is clean (REQUIRED for autonomous -- rollback depends on it)
  [ ] State machine initialized with rollback manifest
  [ ] Escalation log cleared or archived from previous run
```

**IMPORTANT**: Unlike semi-auto, autonomous mode REQUIRES a clean git working tree. Dirty trees make rollback unreliable, which is unacceptable when the developer is not monitoring.

---

## PHASE 2: AUTONOMOUS EXECUTION

Dispatch to `/go --mode=autonomous` and let it run to completion.

### 2.1 Argument Passthrough

```
/goma genesis/auth.md       -->  /go --mode=autonomous genesis/auth.md
/goma --parallel             -->  /go --mode=autonomous --parallel
/goma --tdd --parallel       -->  /go --mode=autonomous --tdd --parallel
```

### 2.2 Autonomous Behavior Rules

| Situation | Behavior | Logging |
|-----------|----------|---------|
| Missing tests | Auto-generate via Tester | Log to remediations |
| Security headers missing | Auto-add via Security | Log to remediations |
| Dead code | Auto-remove via Refactor | Log to remediations |
| Architecture ambiguity | Choose simplest viable option | Log to ESCALATION-DEFERRED |
| Business logic unclear | Implement conservative default | Log to ESCALATION-DEFERRED |
| Security policy choice | Choose most restrictive option | Log to ESCALATION-DEFERRED |
| Breaking API change | Implement with deprecation warning | Log to ESCALATION-DEFERRED |
| Auto-fix fails 3x | Skip violation, log for review | Log to ESCALATION-DEFERRED |

### 2.3 Batch Execution & Context Exhaustion Prevention

Stories are executed in batches of 3-5 (respecting dependency order). After each batch:

1. Persist state to `.claude/state.json` (completed stories, remaining stories, files created)
2. Force context compaction
3. Evaluate remaining context budget

```
IF context budget > 60% consumed after a batch:
  OUTPUT:
    ⏸️  AUTONOMOUS CHECKPOINT — BATCH [N] COMPLETE
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Completed: [X] / [Y] stories ([Z]%)
    Remaining: [R] stories

    Context budget is running low. Saving state and stopping gracefully.

    TO RESUME:
      /goma --resume

    State saved to: .claude/state.json
    All completed work is preserved.

  STOP execution gracefully (do NOT continue until context runs out silently).
```

**CRITICAL**: Never let context run out without outputting resume instructions.
The user's previous experience of "worked for 1 hour then gave me the hand" must
never happen again. Always stop at a batch boundary with clear instructions.

### 2.4 Safety Guardrails

These conditions trigger an **emergency stop** even in autonomous mode:

| Condition | Response |
|-----------|----------|
| 5+ consecutive story failures | HALT -- systemic issue detected |
| Security vulnerability in auto-fix | HALT -- auto-fix made things worse |
| Oscillation detected (fix A causes B, B causes A) | HALT for that violation, continue others |
| State file corruption | HALT -- cannot guarantee rollback |
| 10+ deferred escalations accumulated | WARN (continue but flag for review) |

### 2.5 Deferred Escalation Format

Every decision that would normally require user input is logged:

```json
{
  "timestamp": "2026-02-26T14:23:00Z",
  "story": "STORY-005",
  "type": "architecture_decision",
  "issue": "Payment gateway: Stripe vs self-hosted",
  "decision_made": "Chose Stripe (simpler, managed PCI-DSS)",
  "rationale": "Conservative choice per autonomous policy",
  "confidence": "medium",
  "reversible": true,
  "review_priority": "HIGH"
}
```

---

## PHASE 3: POST-EXECUTION REVIEW

After autonomous execution completes (or stops at a batch checkpoint), run the
mandatory delivery audit and then present a structured review.

### 3.0 Delivery Audit (MANDATORY)

Before any other post-execution review, compare planned vs actual deliverables:

```
1. READ the story index (docs/stories/[prd-name]/INDEX.md)
   - Extract every STORY-XXX entry and its planned files/pages/components
2. SCAN the filesystem for each planned deliverable
3. REPORT the delta

DELIVERY AUDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Planned: [X] stories, [Y] files
Delivered: [A] stories complete, [B] files present
Missing: [C] stories incomplete, [D] files absent
Completion: [Z]%

MISSING ITEMS:
  ✗ STORY-[N]: [title]
    - [file path] (not created)
    - [file path] (not created)

IF completion < 100%:
  ⚠️  INCOMPLETE DELIVERY
  To complete remaining work: /goma --resume
```

This audit runs regardless of whether execution completed fully or stopped at a
checkpoint. It prevents the scenario where stories are listed but their files
were never created.

### 3.1 Deferred Escalation Review

```
DEFERRED ESCALATION REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[N] decisions were made autonomously that normally require your input.
Review each and APPROVE or OVERRIDE:

1. [HIGH] STORY-005: Payment gateway choice
   Decision: Stripe (managed PCI-DSS)
   Rationale: Conservative, simpler integration
   Action: [APPROVE / OVERRIDE with alternative]

2. [MEDIUM] STORY-008: Caching strategy
   Decision: Redis with 15-minute TTL
   Rationale: Standard caching pattern
   Action: [APPROVE / OVERRIDE with alternative]

3. [LOW] STORY-010: Date format
   Decision: ISO 8601 throughout
   Rationale: International standard
   Action: [APPROVE / OVERRIDE with alternative]
```

### 3.2 Quality Assessment

```
AUTONOMOUS EXECUTION QUALITY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stories:          [X] complete / [Y] total
Auto-Fixes:       [N] applied
Deferred:         [N] decisions made autonomously
Failed:           [N] stories blocked
Emergency Stops:  [N]

Quality Signals:
  Test coverage:    [X]%
  Security scan:    [PASS / FAIL]
  Banned patterns:  [CLEAN / N found]
  Three-layer:      [ALL PASS / failures listed]

Overall Quality: [HIGH / ACCEPTABLE / POOR]
```

### 3.3 Rollback Decision

```
IF quality == POOR:
  OUTPUT:
    QUALITY BELOW THRESHOLD
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Autonomous execution produced poor quality output.

    Recommended: Rollback and re-execute in semi-auto mode.
      /goma --rollback     Rollback all autonomous changes
      /gosm                Re-execute with developer oversight

    Or review and fix manually:
      /goma --review       Review all deferred decisions
```

---

## ERROR HANDLING

### No PRDs Found
```
Abort immediately. Do not execute /go with no PRDs.
Point user to /prd command.
```

### /go Pipeline Fails
```
1. State is saved automatically
2. Report: which story failed, which phase, why
3. Suggest: /goma --resume (retry from failure)
4. Suggest: /goma --rollback (clean slate)
5. Suggest: /gosm (switch to semi-auto for more control)
```

### Emergency Stop Triggered
```
EMERGENCY STOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Autonomous execution halted.

Reason:    [5+ consecutive failures / security regression / ...]
Last Story: STORY-[N]
Completed:  [X] / [Y] stories

Options:
  /goma --resume       Resume from halt point
  /goma --rollback     Rollback all changes
  /gosm --resume       Continue in semi-auto mode (recommended)
  /nuke                Full clean slate
```

### Dirty Git Working Tree
```
AUTONOMOUS MODE BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Uncommitted changes detected. Autonomous mode requires a clean
working tree to guarantee safe rollback.

Options:
  git stash            Stash changes and retry
  git commit           Commit changes and retry
  /gosm                Use semi-auto mode (allows dirty tree with warning)
```

---

## BAD/GOOD EXAMPLE

### BAD: Launching autonomous with no safety checks
```
User: /goma
Agent: Executing /go --mode=autonomous...
[No risk warning, no PRD validation, no clean-tree check]
[Makes 8 bad architecture decisions nobody reviews]
[Developer discovers mess 2 hours later, no rollback possible]
```

### GOOD: Full safety protocol with post-run review
```
User: /goma
Agent:
  AUTONOMOUS MODE WARNING
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Full risk disclosure, confirmation required]

  User: y

  [Executes 10 stories autonomously]
  [Auto-fixes 18 violations]
  [Defers 3 architecture decisions]
  [Completes with quality: ACCEPTABLE]

  DEFERRED ESCALATION REVIEW
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  3 decisions need your review:
  1. [HIGH] Payment gateway: chose Stripe -- APPROVE / OVERRIDE?
  2. [MEDIUM] Cache TTL: chose 15min -- APPROVE / OVERRIDE?
  3. [LOW] Date format: chose ISO 8601 -- APPROVE / OVERRIDE?
```

---

## OUTPUT FORMAT

```
AUTONOMOUS EXECUTION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRDs Executed:       [N]
Stories Completed:   [X] / [Y]
Auto-Fixes:          [N]
Deferred Decisions:  [N] (review with /goma --review)
Emergency Stops:     [N]

Three-Layer Status:
  Database:   [PASS / FAIL / N/A]
  Backend:    [PASS / FAIL / N/A]
  Frontend:   [PASS / FAIL / N/A]

Quality:  [HIGH / ACCEPTABLE / POOR]
Action:   [No action needed / Review deferred decisions / ROLLBACK recommended]

Deferred decisions logged to: logs/escalations-deferred.md
Remediation log: logs/remediations.md
```

---

## REFLECTION PROTOCOL

### Pre-Execution Reflection
Before launching autonomous mode, reflect:
1. **PRD Quality**: Are PRDs detailed enough for autonomous decisions? Vague PRDs cause bad auto-decisions.
2. **Scope Risk**: Is the scope small enough for autonomous? Large multi-PRD runs compound errors.
3. **Reversibility**: Can all expected changes be rolled back cleanly?
4. **Trust Level**: Has this project run successfully in semi-auto before? Jumping straight to autonomous is risky.

### Post-Execution Reflection
After completion, assess:
1. **Decision Quality**: Were deferred decisions reasonable? Would a developer have chosen differently?
2. **Auto-Fix Quality**: Did auto-fixes introduce regressions or new issues?
3. **Emergency Stops**: Were any triggered? If yes, why -- and could they be prevented?
4. **Mode Appropriateness**: Should this project use semi-auto instead next time?

### Self-Score (0-10)
- **Completion Rate**: What % of stories completed successfully? (X/10)
- **Decision Quality**: Were autonomous decisions defensible? (X/10)
- **Safety Protocol**: Were all guardrails respected? (X/10)
- **Output Quality**: Is the result production-ready? (X/10)

**If overall score < 7.0**: Recommend switching to `/gosm` for future runs.
**If decision quality < 6.0**: PRDs need more specificity before autonomous is safe.

---

## INTEGRATION WITH PEER AGENTS

| Agent | Relationship | When |
|-------|-------------|------|
| `/go` | Downstream executor | Always -- goma dispatches to /go |
| `/fixer` | Auto-remediation engine | All violations routed here |
| `/gate-keeper` | Validation authority | After every story and fix |
| `/nuke` | Emergency rollback | When autonomous execution fails |
| `/gosm` | Fallback mode | When autonomous proves too risky |
| `/replay` | Post-mortem analysis | Review autonomous decisions |

### Peer Improvement Signals

**Upstream (feeds into goma)**:
- `/prd` -- PRD detail level determines autonomous decision quality
- `/stories` -- Story clarity affects auto-fix success rate

**Downstream (goma feeds into)**:
- `/go` -- Receives autonomous mode flag
- `/fixer` -- Receives all violations for auto-fix (no escalation path)
- `/gate-keeper` -- Receives validation requests

**Reviewers**:
- `/evaluator` -- Post-run quality assessment
- `/review` -- Can audit auto-fixed code
- Developer -- Reviews deferred escalations

### Required Challenge

If 5+ deferred escalations accumulate at HIGH review priority, goma MUST challenge:
> "5+ high-priority autonomous decisions were made without your input. Autonomous mode may not be appropriate for this project's complexity. Consider switching to `/gosm` (semi-auto) for the remaining PRDs."

---

*Autonomous Commander -- Full speed, full responsibility, full rollback capability.*

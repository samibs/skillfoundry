---
description: /replay - Replay & Session Viewer
globs:
alwaysApply: false
---

# replay — Cursor Rule

> **Activation**: Say "replay" or "use replay rule" in chat to activate this workflow.
> **Platform**: Cursor (rule-based context, not slash-command invocation)

# /replay - Replay & Session Viewer

> Re-run the last `/go` or `/forge` execution, or view past session timelines.

---

## Usage

```
/replay                   Replay the last execution
/replay --dry-run         Show what would be replayed without executing
/replay --from=<phase>    Resume from a specific phase (ignite, forge, temper, inspect, remember)
/replay --failed          Replay only failed stories
/replay --show            List recent sessions and display timeline
/replay --show <id>       Show specific session timeline (by ID or index)
```

---

## Instructions

You are the Replay Manager. When `/replay` is invoked, re-run the last execution pipeline or display past session timelines.

### When invoked with `--show` (Session Viewer):

This is a **read-only** view of past agent sessions. No re-execution occurs.

1. **List sessions** (no session ID given):
   ```bash
   ./scripts/session-recorder.sh list
   ```
   Display recent sessions in a table:
   ```
   Session History
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   #  Session ID                        Agent    Story       Outcome
   1  20260215_143000_a1b2c3d4          coder    STORY-003   success
   2  20260215_120000_e5f6g7h8          tester   STORY-002   success
   3  20260214_160000_i9j0k1l2          fixer    STORY-001   failed
   ```

2. **Show session timeline** (session ID or index given):
   ```bash
   ./scripts/session-recorder.sh show <session-id>
   ```
   Display the full session timeline:
   ```
   Session Timeline — 20260215_143000_a1b2c3d4
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Agent: coder | Story: STORY-003 | Duration: 12m 34s

   14:30:00  ▶ SESSION START
   14:30:15  📁 READ    src/auth/types.ts
   14:31:02  📁 CREATE  src/auth/jwt.ts
   14:32:18  🔧 EVENT   Running tests — 12 test files
   14:33:45  💡 DECISION Used RS256 for JWT signing
                        Why: Asymmetric keys allow public key verification
                        Alternatives: HS256 (shared secret risk), ES256 (less support)
                        Confidence: 0.9
   14:35:22  📁 MODIFY  src/auth/index.ts
   14:38:10  🔧 EVENT   Anvil Tier 3 passed
   14:42:34  ✅ SESSION END — success (anvil-pass)

   Summary:
     Events: 4 | Decisions: 1 | Files: 3 (1 read, 1 created, 1 modified)
   ```

3. **If no sessions exist**:
   Report: "No session records found. Sessions are created when agents run via `/go` or `/forge`."

4. **Decision details**: When showing a timeline, always expand decision records to show `what`, `why`, `alternatives`, and `confidence`. These are the most valuable part of session history.

### Integration with other tools:
- Session records live in `logs/sessions/{date}/session-{id}.jsonl`
- Current session pointer: `.claude/current-session.json`
- Use `scripts/session-recorder.sh` for all session operations
- See `agents/_session-protocol.md` for the full session lifecycle protocol

---

### When invoked (without --show):

1. **Find last execution state**: Check `.claude/dispatch-state.json` for the most recent execution record:
   - Command used (`/go`, `/forge`, `/blitz`)
   - Mode (autonomous, semi-auto, manual)
   - Flags (parallel, tdd, etc.)
   - PRD file(s) processed
   - Stories and their completion status

2. **If no execution history exists**:
   Report: "No previous execution found. Run `/go` or `/forge` first."

3. **Show replay plan**:
   ```
   Replay Plan
   ━━━━━━━━━━━━━━━━━━━━━

     Last command:   /forge
     Mode:           semi-auto + parallel
     PRDs:           genesis/my-feature.md
     Stories:        5 total (3 complete, 2 failed)

     Will re-run:    2 failed stories
   ```

4. **Require confirmation**: "Replay this execution? (y/N)"

5. **Execute**: Re-run the same command with the same parameters.

### When invoked with `--dry-run`:
Show the replay plan without executing. No mutations.

### When invoked with `--from=<phase>`:
Resume the pipeline from a specific phase instead of the beginning.
Valid phases: `ignite`, `forge`, `temper`, `inspect`, `remember`, `debrief`

### When invoked with `--failed`:
Only re-run stories that failed in the previous execution. Skip completed stories.

---

## Confirmation Required

This command executes code. Requires confirmation before proceeding.

---

## SAFETY CHECKS (Before Replay)

Before executing any replay, validate:

1. **State file integrity**: Verify `.claude/dispatch-state.json` exists and is valid JSON
2. **File existence**: Confirm all files referenced in the previous execution still exist
3. **Git state clean**: Check `git status` for uncommitted changes that could conflict
4. **Dependency check**: Ensure stories being replayed don't depend on stories not being replayed
5. **Version match**: Confirm framework version hasn't changed since original execution

```
PRE-REPLAY VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━

  State file:     ✓ Valid
  Referenced files: ✓ All exist (12/12)
  Git state:      ✓ Clean working tree
  Dependencies:   ✓ No broken deps
  Version:        ✓ Same framework version

  Proceed with replay? (y/N)
```

**If any check fails:**
```
⚠️ REPLAY BLOCKED
━━━━━━━━━━━━━━━━━━━━━━━━━━

  FAILED CHECKS:
  ✗ Git state: 3 uncommitted files detected
  ✗ Referenced files: src/auth/jwt.ts no longer exists

  OPTIONS:
  1. Fix issues and retry
  2. Use --from=<phase> to skip past problematic phase
  3. Run /go fresh instead of replaying
```

---

## BAD vs GOOD Examples

### BAD: Replaying without validation
```
/replay

> Replaying last execution...
> Running STORY-003...
> ERROR: src/auth/jwt.ts not found
> ERROR: STORY-001 dependency not met
> 3 stories failed, 45K tokens wasted
```
Problem: No pre-flight checks. Blindly re-ran stale state against changed codebase.

### GOOD: Replay with validation and targeted scope
```
/replay --failed

> Pre-replay validation...
>   State file: ✓ Valid
>   Git state: ✓ Clean
>   Dependencies: ✓ Resolved
>
> Replay Plan:
>   Last command: /forge
>   Will re-run: 2 failed stories (STORY-004, STORY-007)
>   Skipping: 5 completed stories
>
> Replay this execution? (y/N) y
>
> STORY-004: ✓ Passed (fix applied from previous feedback)
> STORY-007: ✓ Passed
>
> Replay Complete — 2/2 stories succeeded
```

---

## OUTPUT FORMAT

```
REPLAY RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Command Replayed:  /forge
  Mode:              semi-auto + parallel
  PRD:               genesis/my-feature.md

  Stories Replayed:  [N]
  ├── Succeeded:     [N]
  ├── Failed:        [N]
  └── Skipped:       [N]

  Duration:          [Xm Ys]
  Tokens Used:       ~[X]K

  Phase Summary:
  ├── Ignite:    ✓ PRDs validated
  ├── Forge:     ✓/✗ [N]/[M] stories
  ├── Temper:    ✓/✗ Layer checks
  ├── Inspect:   ✓/✗ Security audit
  ├── Remember:  ✓ Knowledge harvested
  └── Debrief:   ✓ Scratchpad updated

  Overall: SUCCESS / PARTIAL / FAILED
  Next Step: [specific recommendation]
```

---

## ERROR HANDLING

| Error | Cause | Resolution |
|-------|-------|------------|
| No execution history | No previous `/go` or `/forge` run | Run `/go` or `/forge` first |
| State file corrupted | Malformed JSON in dispatch-state | Run `/go --clean` then `/go` |
| Referenced file missing | File deleted since last execution | Use `--from=<phase>` to skip, or run fresh |
| Dependency chain broken | Completed story was rolled back | Replay full chain, not just failed |
| Git conflict detected | Working tree has uncommitted changes | Commit or stash changes first |
| Version mismatch | Framework updated since last run | Run fresh with `/go` instead |

---

## REFLECTION PROTOCOL

### Pre-Execution Reflection
Before replaying, answer:
- Is this replay necessary, or should I run `/go` fresh?
- Are the failure conditions from the last run still present?
- Will the same inputs produce different outputs this time?
- Have files changed since the original execution?

### Post-Execution Reflection
After replay completes, evaluate:
- Did the replayed stories pass that previously failed?
- Were there new failures not present in the original run?
- Was the replay more efficient than running fresh?
- Should the state file be updated or cleared?

### Self-Score (1-10)
| Dimension | Score | Criteria |
|-----------|-------|----------|
| Safety | [1-10] | Were all pre-flight checks performed? |
| Efficiency | [1-10] | Did we avoid re-running unnecessary stories? |
| Completeness | [1-10] | Were all failed stories addressed? |
| Recovery | [1-10] | Did we handle errors gracefully? |

**Threshold**: If any dimension scores below 6, escalate to user with explanation before proceeding.

---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/go` | Source of execution state; replay re-runs `/go` pipeline |
| `/forge` | Source of execution state; replay re-runs `/forge` pipeline |
| `/fixer` | Failed stories may need fixer intervention before replay |
| `/anvil` | Quality gates re-run during replay |
| `/status` | Shows replay-eligible sessions |
| `/context` | Budget check before replay to avoid token waste |
| `/memory` | Replay outcomes recorded to memory bank |

### Peer Improvement Signals

- **From `/go`**: If `/go` reports repeated failures on same story, suggest `/replay --failed` with targeted fixes
- **From `/fixer`**: If fixer resolved issues, recommend replay to verify fixes
- **To `/metrics`**: Report replay success rates for trend analysis
- **To `/memory`**: Record what changed between original run and replay

---

*Replay Manager - The Forge - Claude AS Framework*

---

## How to Use in Cursor

This rule activates when you reference it in chat. Examples:
- "use replay rule"
- "replay — implement the feature"
- "follow the replay workflow"

Cursor loads this rule as context. It does NOT use /slash-command syntax.

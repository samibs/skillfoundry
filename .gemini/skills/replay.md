# /replay

Gemini skill for $cmd.

## Instructions

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

*Replay Manager - The Forge - Claude AS Framework*

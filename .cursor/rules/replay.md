# Replay & Session Viewer

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
   Display recent sessions in a table with session ID, agent, story, and outcome.

2. **Show session timeline** (session ID or index given):
   ```bash
   ./scripts/session-recorder.sh show <session-id>
   ```
   Display the full session timeline with events, decisions, file operations, and gate results.
   Always expand decision records to show `what`, `why`, `alternatives`, and `confidence`.

3. **If no sessions exist**:
   Report: "No session records found. Sessions are created when agents run via `/go` or `/forge`."

### Integration:
- Session records: `logs/sessions/{date}/session-{id}.jsonl`
- Session recorder: `scripts/session-recorder.sh`
- Protocol: `agents/_session-protocol.md`

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

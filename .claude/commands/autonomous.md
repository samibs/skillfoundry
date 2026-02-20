# /autonomous - Toggle Autonomous Developer Loop

> Toggle autonomous mode on/off. When active, every user input is automatically classified and routed to the correct pipeline without manual command invocation.

---

## Usage

```
/autonomous          Show current status
/autonomous on       Enable autonomous mode
/autonomous off      Disable autonomous mode
/autonomous status   Show detailed status with sync info
```

---

## Instructions

You manage the autonomous developer loop toggle. When invoked:

### `/autonomous` or `/autonomous status`

Check the current state and report:

```bash
# Check if autonomous mode is active
FLAG_FILE=".claude/.autonomous"
```

Display:

```
Autonomous Mode: [ON/OFF]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Protocol:       agents/_autonomous-protocol.md
  Classifier:     agents/_intent-classifier.md
  Mode:           [ACTIVE — all inputs auto-routed / INACTIVE — manual commands]

  Knowledge Sync: [RUNNING (PID: XXXX) / STOPPED]
  Last Sync:      [timestamp or "never"]
  Sync Repo:      [repo URL or "not configured"]

  Session Stats:
    Inputs classified:  [N]
    Pipelines executed: [N]
    User corrections:   [N]
```

### `/autonomous on`

1. Create the flag file:
   ```bash
   mkdir -p .claude
   echo '{"enabled":true,"activated":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","version":"1.0"}' > .claude/.autonomous
   ```

2. Verify the protocol files exist:
   - `agents/_autonomous-protocol.md` — routing rules
   - `agents/_intent-classifier.md` — classification reference

3. Start the knowledge sync daemon if configured:
   ```bash
   if [ -f scripts/knowledge-sync.sh ] && [ -x scripts/knowledge-sync.sh ]; then
       bash scripts/knowledge-sync.sh start --if-not-running
   fi
   ```

4. Display:
   ```
   Autonomous Mode: ON
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   The autonomous developer loop is now active.
   Every input will be classified and routed automatically.

   How it works:
     You type    → Claude classifies (FEATURE/BUG/REFACTOR/QUESTION/OPS/MEMORY)
     Claude runs → The appropriate pipeline executes fully
     You review  → Structured summary presented for approval

   To disable: /autonomous off
   ```

### `/autonomous off`

1. Remove the flag file:
   ```bash
   rm -f .claude/.autonomous
   ```

2. Stop the knowledge sync daemon:
   ```bash
   if [ -f scripts/knowledge-sync.sh ] && [ -x scripts/knowledge-sync.sh ]; then
       bash scripts/knowledge-sync.sh sync   # force final sync
       bash scripts/knowledge-sync.sh stop
   fi
   ```

3. Display:
   ```
   Autonomous Mode: OFF
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Autonomous mode disabled. Manual command invocation resumed.
   Knowledge sync stopped (final sync completed).

   To re-enable: /autonomous on
   ```

---

## Notes

- Autonomous mode persists across sessions (flag file on disk)
- The knowledge sync daemon runs independently — stopping autonomous mode also stops sync
- All commands (`/forge`, `/go`, `/auto`, etc.) still work normally when autonomous mode is on
- Autonomous mode does NOT auto-commit or auto-push — the user always reviews first

---

*The Autonomous Developer Loop — Type once, review once, ship.*

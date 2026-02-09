# /nuke - Nuke & Rebuild

> Clean slate: rollback all changes and clear execution state.

---

## Usage

```
/nuke                     Rollback + clean state (requires confirmation)
/nuke --rollback-only     Rollback changes without clearing state
/nuke --clean-only        Clear state without rolling back
/nuke --dry-run           Show what would be nuked without doing it
```

---

## Instructions

You are the Nuke Commander. When `/nuke` is invoked, provide a clean slate by rolling back changes and clearing execution state.

### When invoked:

1. **Show warning**:
   ```
   ⚠ NUKE — This will:
     1. Rollback all file changes from the last /go execution
     2. Clear the execution state file
     3. Remove dispatch and swarm state

   This action is DESTRUCTIVE and cannot be undone.
   ```

2. **Require explicit confirmation**: Ask the user to confirm before proceeding.
   - Use standard Claude Code confirmation (present warning, ask "Proceed? (y/N)")
   - Only proceed if user explicitly confirms
   - Any decline cancels the operation

3. **Execute rollback**:
   ```
   /go --rollback
   ```

4. **Clear state**:
   ```
   /go --clean
   ```

5. **Report result**:
   ```
   Nuke Complete
   ━━━━━━━━━━━━━━━

     Changes:  ✓ Rolled back
     State:    ✓ Cleared

     Clean slate. Ready for /go or /forge.
   ```

### When invoked with `--dry-run`:
Show what would be rolled back and cleared without executing. No mutations.

### When invoked with `--rollback-only`:
Execute only Step 3 (rollback). Skip state clearing.

### When invoked with `--clean-only`:
Execute only Step 4 (clean state). Skip rollback.

---

## Confirmation Required

This command is destructive. Per the CLI confirmation matrix:
- Full nuke: Standard confirmation with destructive warning (y/N)
- `--rollback-only`: Standard confirmation (y/N)
- `--clean-only`: Standard confirmation (y/N)
- `--dry-run`: No confirmation needed (read-only)

---

*Shortcut Command - The Forge - Claude AS Framework*

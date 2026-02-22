# /goma

Gemini skill for $cmd.

## Instructions

# /goma - Go Mode Autonomous

> Shortcut for `/go --mode=autonomous` — full autonomy, minimal interruptions.

---

## Usage

```
/goma                     Full autonomous execution of all PRDs
/goma [prd-file]          Autonomous execution of specific PRD
```

---

## Instructions

You are a shortcut dispatcher. When `/goma` is invoked, execute the `/go` command in autonomous mode.

### When invoked:

1. **Execute**: Run the full `/go` pipeline with `--mode=autonomous`:
   - Find all PRDs in `genesis/`
   - Validate, generate stories, implement
   - Auto-fix all violations without user interruption
   - User checkpoint only at project completion

2. **Pass through arguments**: If a PRD file is specified, pass it to `/go`.

3. **Equivalent to**:
   ```
   /go --mode=autonomous
   ```

### What autonomous mode means:
- Full auto-remediation of violations
- No user interruptions during execution
- Phase checkpoints only at project completion
- All escalations logged but not blocking

---

*Shortcut Command - The Forge - Claude AS Framework*

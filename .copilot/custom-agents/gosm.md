# Custom Agent Instructions

**Agent Type**: task
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

## Instructions

# /gosm - Go Semi-Auto (Recommended)

> Shortcut for `/go --mode=semi-auto` — auto-fix routine, escalate critical.

---

## Usage

```
/gosm                     Semi-auto execution of all PRDs (recommended)
/gosm [prd-file]          Semi-auto execution of specific PRD
```

---

## Instructions

You are a shortcut dispatcher. When `/gosm` is invoked, execute the `/go` command in semi-auto mode.

### When invoked:

1. **Execute**: Run the full `/go` pipeline with `--mode=semi-auto`:
   - Find all PRDs in `genesis/`
   - Validate, generate stories, implement
   - Auto-fix routine violations (missing tests, security headers, dead code)
   - Escalate critical decisions to user (architecture, business logic, security policy)

2. **Pass through arguments**: If a PRD file is specified, pass it to `/go`.

3. **Equivalent to**:
   ```
   /go --mode=semi-auto
   ```

### Why this is recommended:
- Best balance between speed and oversight
- Routine issues handled automatically
- Critical decisions still involve the developer
- Phase checkpoints at each major milestone

---

*Shortcut Command - The Forge - Claude AS Framework*

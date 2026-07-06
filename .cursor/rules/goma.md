---
description: /goma - Go Mode Autonomous
globs:
alwaysApply: false
---

# goma — Cursor Rule

> **Activation**: Say "goma" or "use goma rule" in chat to activate this workflow.
> **Platform**: Cursor (rule-based context, not slash-command invocation)

# /goma - Go Mode Autonomous

`/goma` is a thin alias for **`/go --mode=autonomous`**. It runs the full `/go` pipeline hands-off: escalations are auto-resolved where safe and otherwise deferred and logged for post-run review. Use only when you trust the PRDs.

**Persona**: See `agents/fixer-orchestrator.md` for auto-remediation.
**Reflection Protocol**: See `agents/_reflection-protocol.md`.

---

## Dispatch

`/goma [args]` → `/go --mode=autonomous [args]` with full argument passthrough.

```
/goma genesis/auth.md      →  /go --mode=autonomous genesis/auth.md
/goma --parallel           →  /go --mode=autonomous --parallel
/goma --resume             →  /go --mode=autonomous --resume
/goma --rollback           →  roll back the last autonomous run
```

---

## What autonomous mode adds

**A clean git working tree is REQUIRED** (unlike semi-auto). Autonomous rollback depends on it, and rollback must be reliable when the developer is not watching.

Pre-flight — blocks execution if any item is unmet:

- All PRDs pass critical validation
- No interrupted state exists (or `--resume` was chosen)
- **Git working tree is clean** — autonomous rollback depends on it
- State machine initialized with a rollback manifest
- Escalation log cleared or archived from the previous run

If the tree is dirty, autonomous mode is blocked with instructions to commit or stash first. During the run, every escalation is deferred and written to the escalation log for review rather than interrupting execution. Everything else — pipeline phases, Anvil gates, batching, delivery audit — is `/go`'s behavior unchanged.

---

## Activation

This rule activates when you reference it in chat. Examples:
- "use goma rule"
- "goma — run the pipeline"
- "follow the goma workflow"

Cursor loads this rule as context. It does NOT use /slash-command syntax.

---
name: blitz
description: >-
  /blitz - Blitz Mode Commander
---

# /blitz - Blitz Mode Commander

`/blitz` is a thin alias for **`/go --mode=semi-auto --parallel --tdd`**. It runs the full `/go` pipeline at maximum speed: semi-auto remediation + parallel wave execution + TDD enforcement. Blitz is for well-defined PRDs with independent stories.

**Persona**: See `agents/fixer-orchestrator.md` for auto-remediation and `agents/_parallel-dispatch.md` for wave planning.
**Reflection Protocol**: See `agents/_reflection-protocol.md`.

---

## Dispatch

`/blitz [args]` → `/go --mode=semi-auto --parallel --tdd [args]` with full argument passthrough.

```
/blitz genesis/auth.md   →  /go --mode=semi-auto --parallel --tdd genesis/auth.md
/blitz --dry-run         →  preview the wave plan without executing
```

---

## When blitz applies

Blitz only adds value when stories can run in parallel. Readiness check — all must hold, or use `/gosm` instead:

- The PRD is well-defined and validated
- Stories are mostly independent (wave planning needs independence)
- **At least 2 stories are independent** — otherwise parallelism has no value

Wave planning is defined in `agents/_parallel-dispatch.md`: stories are grouped into dependency-ordered waves, same-wave stories are checked for file-overlap conflicts, and all stories in a wave are dispatched simultaneously (RED→GREEN→REFACTOR under TDD). Run `--dry-run` to preview the wave plan before executing. Everything else — phases, Anvil gates, delivery audit — is `/go`'s behavior unchanged.

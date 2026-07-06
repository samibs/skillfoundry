---
name: gosm
description: >-
  /gosm - Go Semi-Auto Orchestrator
---

# /gosm - Go Semi-Auto Orchestrator

`/gosm` is a thin alias for **`/go --mode=semi-auto`**. It runs the full `/go` pipeline but auto-fixes routine issues and escalates only critical decisions to you. This is the recommended execution mode.

**Persona**: See `agents/fixer-orchestrator.md` for auto-remediation.
**Reflection Protocol**: See `agents/_reflection-protocol.md`.

---

## Dispatch

`/gosm [args]` → `/go --mode=semi-auto [args]` with full argument passthrough. Every pipeline phase, Anvil gate, batch/context checkpoint, resume, and delivery audit is defined once in `/go`; `/gosm` only preselects the mode.

```
/gosm genesis/auth.md      →  /go --mode=semi-auto genesis/auth.md
/gosm --parallel           →  /go --mode=semi-auto --parallel
/gosm --tdd --parallel     →  /go --mode=semi-auto --tdd --parallel
/gosm --resume             →  /go --mode=semi-auto --resume
```

Extra flags: `--resume` (continue from saved state), `--escalation-log` (show deferred escalations).

---

## What semi-auto mode adds

The one behavior semi-auto layers over `/go`: an auto-fix-vs-escalate decision on every gate finding. Deterministic, routine issues are fixed silently; anything needing human judgment is escalated.

| Category | Issue | Action |
|----------|-------|--------|
| Tests | Missing unit tests / coverage < 80% | AUTO-FIX |
| Security | Missing standard headers (CSP, CSRF) | AUTO-FIX |
| Security | Hardcoded secret / auth-authz pattern choice | ESCALATE |
| Code | Dead code, duplication, banned patterns (TODO/FIXME) | AUTO-FIX |
| Docs | Missing API documentation | AUTO-FIX |
| Performance | N+1 query, missing index | AUTO-FIX |
| Performance | Caching strategy | ESCALATE |
| Architecture | Multiple valid approaches | ESCALATE |
| Business | Ambiguous requirement | ESCALATE |
| Database | Schema design choice | ESCALATE |
| API | Breaking change to consumers | ESCALATE |

On escalation, present: story, phase, issue type, context, options with trade-offs, and a recommendation — then wait for input. If the auto-fix rate falls below 70% for a run, recommend switching to `/go` (supervised) — most findings need human decisions, so semi-auto is buying little. Everything else — phases, gates, delivery audit — is `/go`'s behavior unchanged.

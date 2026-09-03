---
sidebar_position: 5
title: Governed Missions
---

# Governed Missions

*Added in v5.31.0*

Your AI reports "done" and the tests are green. But did the test runner actually finish, or did
it hang after the assertions passed? Is that dev server still running? Did your change survive
the merge, or did something quietly overwrite it? Did the push really land on the remote?

`/mission` answers those questions with evidence instead of assurances.

## The problem it solves

SkillFoundry already tracked worktrees, run state, an audit trail, and gate evidence — but all
of it lives in `.skillfoundry/runs/`, describes a single execution, and disappears when that
execution ends.

So the next agent — a new session, a different model, a colleague's machine — starts from
nothing but chat history. Chat history is the least reliable record in the system.

A governed mission writes a durable record into `.ai/` in your repository:

```text
.ai/
├── ledger.json              current engineering state
├── gaps.json                what is still open
├── attestations/            where each worker operated, and under what conditions
├── patches/<ID>.md          what changed and why
├── evidence/<ID>/           what proves it
└── app-catalog.json         services and their reserved ports
```

Close the laptop, come back next week, switch AI tools: the next agent reads
**git + ledger + attestations + patches + evidence** instead of guessing.

## Status you can trust

The ledger refuses to record a claim your repository cannot back up:

```
/mission set STORY-042 acceptance_status PASS

  ✗ Refused: acceptance_status stays NOT_STARTED

  The ledger must never claim more than evidence proves:
    · blocked by unsatisfied AC dispositions: AC8=BLOCKED_BY_AUTHORIZATION
    · blocked by open gaps: GAP-001
```

Five dimensions advance independently, because a feature can be implemented but not accepted,
accepted but not published:

```text
implementation_status        COMPLETE
acceptance_status            EVIDENCE_PARTIAL
integration_status           NOT_STARTED
publication_status           NOT_STARTED
external_validation_status   NOT_APPLICABLE
```

## Green is not automatically a pass

| What it catches | How |
|---|---|
| Tests "passed" but the runner hung | Normal termination is an acceptance criterion |
| A dev server left running | Every started process has a recorded owner |
| Zero tests actually ran | A test run with no detectable results is not clean |
| A change dropped in a merge | Provenance verifies the content is in the final tree |
| "Pushed" ≠ published | The remote SHA, tree and content are re-read after the push |
| "It was probably already broken" | That claim requires a baseline run to be accepted |

Cleanup can never turn into `kill all node` and take out your other projects: each process is
recorded with a fingerprint of its command line, and re-verified before any signal is sent.

## A single-worker run

```bash
/mission init STORY-042 --title "JWT refresh rotation"
/mission attest STORY-042 --worker claude-coder-042 --agent claude
/mission gate STORY-042                      # WRITES AUTHORIZED / BLOCKED

# ... implement ...

/mission evidence STORY-042 --kind tests --run "npm test"
/mission commit STORY-042
/mission verify STORY-042
```

`verify` prints the Definition of Done:

```
  ✓ AC matrix complete               8 AC(s), all dispositioned
  ✓ Worker attestation recorded      claude-coder-042 — native worktree verified
  ✗ Worker commit created            No worker commit — NOT_INTEGRATION_READY
  ✓ Normal termination proven        Exited normally in 10.32s
  ✓ No owned orphan processes        Orphan check: CLEAN

  Disposition: EVIDENCE_PARTIAL — VALIDATION_REQUIRED
```

## Running several agents at once

```bash
/mission set-baseline --branch main
/mission plan AF-302 --depends "AF-301:HARD" --writes "src/Missions/Repo.cs"
/mission wave plan
/mission wave dispatch WAVE-02 --items "AF-302,AF-401"
```

`wave plan` builds one dependency graph across all your PRDs and **defers** work that would
collide — two agents never rewrite the same routing file or migration in the same pass. Each
writer gets its own git worktree; sharing one is refused outright.

Integration is serial and follows dependency order, never who finished first.

## Where to go next

- The complete protocol, vocabularies and all 25 subcommands: `MULTI_AGENT_PROTOCOL.md` in your
  project root (installed automatically).
- `/mission help` for the command reference.
- Release notes: `docs/V5.31.0-RELEASE-NOTES.md`.

:::note When not to use it
A typo fix, a config tweak, a single-file change. The overhead should not exceed the value —
`/mission` is for work that must be *provably* done.
:::

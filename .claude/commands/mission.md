---
description: "Use when work must be provably done, not just finished: governed missions with a durable .ai/ ledger, worker attestation, evidence-gated status, provenance, collision-aware wave planning, agent registry, and process ownership. Triggers: parallel or multi-agent execution, 'is this actually integrated?', 'prove the tests passed cleanly', publishing to a shared branch, reconstructing state after context loss, orphaned dev servers, 'probably pre-existing' claims. Do NOT use for: a single trivial edit (just make it), running quality gates on a diff (use /verify), or building a feature from a PRD (use /forge)."
---

# /mission — Governed Development Mission Protocol

> **Implement → Test → Iterate → Validate → Evidence → Integrate → Publish**
>
> Full protocol: `MULTI_AGENT_PROTOCOL.md` · Agent module: `agents/_governed-mission-protocol.md`

A change is not complete because it compiles, tests locally, or has a commit. Completion
requires traceability, evidence, provenance, clean termination, and acceptance.

`/mission` writes machine-readable artifacts under `.ai/` that outlive the agent that produced
them. **You do not hand-write that JSON** — the CLI writes and validates it, and refuses claims
the repository cannot substantiate.

---

## What it prevents

| Failure | How `/mission` blocks it |
|---|---|
| Two agents writing in one directory | Registration refuses a second ACTIVE write agent per worktree. |
| A "worktree" that is really a copied folder | Verified against `git worktree list --porcelain`. |
| "Tests pass" while the runner hung | `normal_termination` and orphan detection; reported NOT CLEAN. |
| A dev server orphaned after the run | Ownership registry + identity-verified targeted cleanup. |
| A contribution silently dropped in a merge | Provenance: `LOST`/`UNKNOWN` block acceptance. |
| "Pushed" ≠ published | `publish-check` re-reads the remote SHA, tree and content. |
| "Probably pre-existing" | Requires a baseline run at the accepted SHA, or it is not substantiated. |
| Retry loops burning budget | `NO_PROGRESS` after two identical failures with no state change. |
| A ledger that drifts from reality | `/mission reconcile` — the ledger is corrected, never reality. |

---

## Single-worker flow

```bash
/mission init STORY-042 --title "JWT refresh rotation"
/mission attest STORY-042 --worker claude-coder-042 --agent claude --allow-main
/mission gate STORY-042                       # WRITES AUTHORIZED / BLOCKED

# ... implement ...

/mission evidence STORY-042 --kind tests --run "npm test"
/mission ac STORY-042 --file criteria.json
git commit -m "feat(auth): refresh rotation [STORY-042]"
/mission commit STORY-042
/mission set STORY-042 implementation_status COMPLETE
/mission set STORY-042 acceptance_status PASS
/mission verify STORY-042
/mission report STORY-042 --out docs/reports/STORY-042.md
```

## Multi-agent flow

```bash
/mission set-baseline --branch main
/mission plan AF-302 --depends "AF-301:HARD" --writes "src/Missions/Repo.cs"
/mission wave plan                            # collision-aware; defers, never merges blindly
/mission wave dispatch WAVE-02 --items "AF-302,AF-401"

git worktree add -b agent/AF-302 ../wt/AF-302 <base-sha>
/mission agent register codex-backend-AF-302 --item AF-302 --worktree ../wt/AF-302 --mode WRITE
/mission attest AF-302 --worker codex-backend-AF-302 --agent codex

# ... workers implement in parallel ...

/mission wave order                           # dependency order, not completion time
/mission provenance AF-302 --integration main
/mission integrate AF-302
/mission wave complete WAVE-02
```

---

## The ledger has two planes

One entry per work item. `execution.*` answers *"is this scheduled, running, integrated?"*.
The `*_status` dimensions answer *"is this claim proven?"*. `/mission reconcile` cross-checks
them — a scheduler that says `INTEGRATED` while the evidence gate disagrees is a reported
discrepancy, not an accepted fact.

Never collapse the lifecycle into one vague status. Track **implementation · acceptance ·
integration · publication · external validation** independently.

---

## Rules you must not work around

1. **No source writes before a PASS attestation.** `WRITES BLOCKED` means fix the environment, not the code.
2. **Parallel writers never share a working directory.**
3. **Never modify product code to compensate for a broken environment.** Classify the defect first.
4. **Never broadly kill** `all node` / `all dotnet` / `all python`. Verify ownership.
5. **A promotion refusal is information, not an obstacle.** Produce the evidence. `--force` is a human decision, and the bypassed claims are recorded.
6. **Do not edit `.ai/*.json` by hand.**

---

## When NOT to use this

A typo fix, a config tweak, a single-file change, a question. The overhead must not exceed the
value — see **Skill Scope Boundaries** in `CLAUDE.md`. Use `/verify` to gate a diff, `/forge` to
build a feature from a PRD, and `/mission` when the work must be **provably** done.

---

## Full command reference

Run `/mission help`, or see §23 of `MULTI_AGENT_PROTOCOL.md`.

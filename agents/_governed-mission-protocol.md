# Governed Mission Protocol

> **CORE FRAMEWORK MODULE**
> Operational module for `MULTI_AGENT_PROTOCOL.md`. Referenced by: `/go`, `/forge`, `/coder`,
> `/tester`, `/gate-keeper`, `/ship`, `/delegate`, `/orchestrate`, `/swarm`, `/context`, `/cost`
>
> The full protocol lives in `MULTI_AGENT_PROTOCOL.md` at the repository root.
> **This module does not restate it** — it defines when agents invoke it and what blocks them.

---

## Why this exists

SkillFoundry already had worktrees (`_git-worktrees.md`), a run-state machine
(`_state-machine.md`), an audit trail (`_audit-export.md`), gate evidence
(`_gate-verification.md`), scope validation (`_scope-validation.md`), and parallel dispatch
(`_parallel-dispatch.md`).

All of that state is **ephemeral** — it describes one run and dies with it.

This protocol adds the durable half: a repository-resident record that survives the agent.
A replacement worker with zero chat history reconstructs project state from
**git + ledger + attestations + patches + evidence** rather than trusting the previous agent.

```text
Git             what exact content changed over time
Attestation     where, and under what conditions, did the worker operate
Patch guide     what changed and why
Evidence        what proves the implementation satisfies the requirement
Ledger          what is the project's current authoritative engineering state
─────────────────────────────────────────────────────────────────────────
                = governed engineering history
```

---

## Enforcement is code, not prose

Every rule below is enforced by `sf_cli/src/core/mission-*.ts` and surfaced through `/mission`.
Agents **do not hand-write** `.ai/` JSON — the CLI writes and validates it. An agent that edits
`.ai/ledger.json` directly is bypassing the gate and its claims will be flagged by
`/mission reconcile`.

| Concern | Module | Enforced behaviour |
|---|---|---|
| Git facts | `mission-git.ts` | Native worktree proof, patch-id, tree SHAs. No shell interpolation. |
| Ledger | `mission-ledger.ts` | Evidence-gated promotion; two planes cross-checked. |
| Attestation | `mission-attestation.ts` | No source writes before a PASS attestation. |
| Provenance | `mission-provenance.ts` | `LOST`/`UNKNOWN` block acceptance. Publication re-verified. |
| Evidence | `mission-evidence.ts` | Normal termination, orphan detection, bounded retries. |
| Orchestration | `mission-orchestration.ts` | One worktree per writer; collision-aware waves. |
| Processes | `mission-processes.ts` | Ownership-verified cleanup. Never a broad kill. |

---

## When this module activates

Activates when **any** of:

- two or more write-capable agents operate concurrently;
- `/go` dispatches multiple stories or tasks;
- `/forge` delegates a phase to a parallel worker;
- autonomous mode selects parallel execution;
- the user asks for parallel agents or subagents;
- multiple PRDs contain executable work with cross-dependencies;
- work is destined for publication to a shared branch.

**Does not activate** for a trivial single-agent edit — a typo fix, a config tweak, a README
change. See **Skill Scope Boundaries** in `CLAUDE.md`; the overhead must not exceed the value.

---

## Worker sequence

```text
1. /mission set-baseline --branch main        pin the exact SHA, never a branch name
2. /mission plan <ID> --depends … --writes …  declare dependencies + write manifest
3. git worktree add -b agent/<ID> <path> <base-sha>
4. /mission agent register <platform>-<role>-<ID> --item <ID> --worktree <path> --mode WRITE
5. /mission attest <ID> --worker <name> --agent <platform>
6. /mission gate <ID>                         ← WRITES BLOCKED until PASS
   ── implement ──
7. /mission proc register …                   for every process started
8. /mission evidence <ID> --kind tests --run "<targeted test command>"
9. /mission ac <ID> --file criteria.json
10. git commit && /mission commit <ID>
11. /mission proc stop <agent>                before claiming completion
12. /mission exec <ID> INTEGRATION_READY
13. /mission verify <ID>
```

Integration and publication are **separate, orchestrator-owned** steps (§17–18 of the protocol).

---

## Hard stops

An agent must stop and report — never work around — when any of these occur:

| Signal | Meaning | Correct response |
|---|---|---|
| `WRITES BLOCKED` | No PASS attestation | Fix the environment; re-attest. Do **not** write. |
| `WORKTREE_INVALID` | Not a git-registered worktree | Recreate with `git worktree add`. Never treat a copied folder as a worktree. |
| Shared-worktree violation | Two ACTIVE writers, one directory | Stop immediately. One worker releases. |
| `NOT A CLEAN VALIDATION` | Host hung, killed, or left orphans | Not a PASS. Investigate termination before reporting. |
| `ORPHANS_DETECTED` | Owned processes outlived the run | `/mission proc stop <agent>` before completion. |
| `LOST` / `UNKNOWN` provenance | Contribution absent or unexplained | Blocks acceptance. Do **not** force. |
| `NO_PROGRESS` | Two identical failures, no state change | Stop retrying. Report the blocker. |
| Dependency cycle | Nothing is schedulable | Report for a human to break. |
| `PUBLICATION_FAILED` | Remote lacks the contribution | Do not claim published. Reconcile. |
| Promotion refused | Evidence does not support the claim | Produce the evidence. `--force` is a human decision. |

---

## Defect classification before remediation

Before changing product code in response to a failure, classify its origin
(`/mission evidence` does this automatically from command output):

```text
PRODUCT_DEFECT                     the code is wrong
TEST_DEFECT                        the test is wrong
ENVIRONMENT_DEFECT                 missing binary, dependency, PATH
WORKTREE_DEFECT                    not a valid worktree
REPOSITORY_SNAPSHOT_INCOMPLETE     project file absent from the working copy
INFRASTRUCTURE_DEFECT              OOM, disk, host capacity
EXTERNAL_DEPENDENCY                network, third-party service
AUTHORIZATION_FAILURE              access refused
```

**Never modify product architecture to compensate for the last six.** Fix or report the
environment. An assertion failure is classified `PRODUCT_DEFECT` only at MEDIUM confidence —
confirm the test itself is correct first.

Related: `agents/_env-preflight-protocol.md`, `agents/_systematic-debugging.md`.

---

## The "pre-existing" rule

Claiming a failure predates the mission requires baseline evidence: the **same test**, in the
**same environment**, at the **accepted baseline SHA**. Without it the claim is *not
substantiated* and the failure is treated as caused by this mission.

This is enforced by `adjudicatePreExisting()`. It exists because the opposite behaviour —
dismissing a self-inflicted regression as pre-existing — is a recorded, repeated failure mode
(see `memory_bank/` and `agents/_known-deviations.md`).

---

## Relationship to existing modules

| Module | Relationship |
|---|---|
| `_git-worktrees.md` | Explains worktrees. This module **proves** them via `git worktree list --porcelain` and refuses unverified ones. |
| `_state-machine.md` | Run state for one `/go` execution. This module holds the **durable** record across runs. |
| `_audit-export.md` | Append-only decision log. Complementary — the ledger holds current truth, the audit trail holds history. |
| `_gate-verification.md` | Produces gate evidence. This module **persists and references** it under `.ai/evidence/`. |
| `_scope-validation.md` | Anvil T4, expected vs. actual files. Feeds `execution.write_manifest`. |
| `_parallel-dispatch.md` | Concurrency mechanics. This module adds **collision-aware wave planning** and worktree exclusivity. |
| `_anvil-protocol.md` | T1–T6 remain the handoff gate between worker and integration state. |
| `_delivery-efficiency.md` | Decides how much validation a change warrants. This module proves what ran; that one decides what *should* run. |
| `_rollback-protocol.md` | Rollback mechanics. Patch guides record the per-contribution rollback path. |

**Do not duplicate any of the above.** Extend the existing primitive; if one is insufficient,
document exactly why before extending it.

---

## Token discipline

The ledger and evidence exist partly to **reduce** context consumption. Load only the active
work item's requirement, patch guide, diff, and relevant evidence. Reference durable paths
rather than re-injecting content:

```text
LEDGER:       .ai/ledger.json
PATCH GUIDE:  .ai/patches/<ID>.md
EVIDENCE:     .ai/evidence/<ID>/tests.json
RAW LOG:      .skillfoundry/mission-logs/<label>-<ts>.log
```

Never paste full successful build or test logs into context. For a PASS, the summary is
command · exit code · counts · duration · artifact · normal termination. For a FAILURE, reduce
to the failing test, the relevant exception and stack, the affected file and line, and minimal
surrounding context — then read the raw log only if needed.

> Token limits may reduce context consumption. They must never reduce required validation.

---

## Non-negotiables

1. One worker = one bounded mission = one native worktree = one branch.
2. Parallel writers never share a working directory.
3. No source writes before a PASS attestation.
4. Every write unit resolves to a requirement artifact and has a patch guide.
5. The ledger never claims more than evidence proves.
6. `IMPLEMENTED` is not `VERIFIED`. A commit is not acceptance. An integration is not a publication.
7. Normal termination and orphan cleanup are part of acceptance.
8. Failures are recorded with a classification, never disguised as partial success.
9. Broad machine-wide process killing is prohibited. Verify ownership first.
10. Durable repository state outranks chat memory.

---

_See `MULTI_AGENT_PROTOCOL.md` for the complete protocol, vocabularies, and command reference._

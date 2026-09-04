# MULTI_AGENT_PROTOCOL.md — Governed Multi-Agent Execution

**Version:** 1.0
**Applies to:** Claude Code · Cursor · GitHub Copilot · OpenAI Codex · Gemini · Grok Build · human developers
**Enforced by:** `sf` CLI — `/mission` (see `.claude/commands/mission.md`)

> This protocol extends SkillFoundry. It does not replace `CLAUDE.md`, `AGENTS.md`, Genesis,
> stories, `/go`, `/forge`, the Anvil, BPSBS, three-layer completeness, or any existing skill.

---

## Core rule

**Implement → Test → Iterate → Validate → Evidence → Integrate → Publish**

A change is not complete because it compiles, tests locally, or has a commit. Completion
requires traceability, evidence, provenance, clean termination, and acceptance.

And, for parallel work:

> Parallelize independent work, serialize dependent or colliding work, and make all
> execution state recoverable without relying on chat memory.

---

## 1. What this protocol owns

**Authoritative for:** multi-agent orchestration · parallel execution · worktree isolation ·
execution waves · agent ownership · process ownership · the `.ai/` ledger · patch guides ·
provenance · port coordination · cross-PRD dependency scheduling · test-cost coordination ·
publication verification.

**Not authoritative for** (existing SkillFoundry rules stand): PRD-first development · Genesis ·
story generation · three-layer completeness · ONLY REAL LOGIC · banned patterns · BPSBS ·
Anvil gates · security standards · testing standards · documentation · skill scope.

Where this protocol conflicts with an existing safety or correctness requirement, **the stricter
requirement wins.**

---

## 2. Activation

Activates when any of the following is true:

- two or more write-capable agents operate concurrently;
- `/go` dispatches multiple stories or tasks;
- `/forge` delegates implementation, testing, or review to parallel workers;
- autonomous mode chooses parallel execution;
- the user explicitly requests parallel agents or subagents;
- multiple PRDs contain executable work with cross-dependencies.

A trivial single-agent edit does not require the full machinery. SkillFoundry's
complexity-based scope rules still apply — see **Skill Scope Boundaries** in `CLAUDE.md`.

---

## 3. Non-negotiable rules

1. One worker = one bounded mission = one native git worktree = one branch.
2. Parallel writers **never** share a working directory.
3. A copied repository folder is **not** a worktree. Only `git worktree list --porcelain` proves it.
4. Never compensate for a broken agent environment by modifying product code.
5. Never weaken tests, authentication, authorization, validation, or quality gates to pass.
6. Never invent APIs, contracts, telemetry, database state, or backend capabilities.
7. Never silently expand scope, hide failing evidence, or classify missing evidence as PASS.
8. Never use a dirty worktree as an implementation baseline.
9. Never force-push, reset, or destroy unrelated work unless explicitly authorized.
10. Never store secrets in source, logs, evidence, patches, or `.ai/`.
11. Never leave owned processes or resources orphaned.
12. Never broadly kill `all node` / `all dotnet` / `all python` / `all docker`. Verify ownership first.
13. Never repeatedly execute expensive suites without a reason.
14. Never claim COMPLETE solely because a worker created a commit.

---

## 4. The `.ai/` control plane

```text
.ai/
├── ledger.json              machine-readable engineering truth
├── gaps.json                explicit unresolved gaps
├── app-catalog.json         applications, services, reserved ports
├── agents/<name>.json       one registration per active worker
├── attestations/<ID>-<worker>.json
├── patches/<ID>.md          what changed and why
├── processes/<agent>.json   owned PIDs with identity fingerprints
├── evidence/<ID>/           acceptance · tests · security · provenance · closeout
├── decisions/OD-xxx.md      architectural decisions
├── design/
└── logs/{frontend,backend,tests,orchestration,agents}/
```

Raw logs may live outside git (`.skillfoundry/mission-logs/`) and be **referenced** by
evidence rather than embedded. Never inline megabytes of test output into the ledger or
into model context.

**Never create an empty file to satisfy the directory shape.** Artifacts contain real evidence.

---

## 5. The ledger

`.ai/ledger.json` is the machine-readable status authority. Chat output is not authoritative.
Markdown status reports are not authoritative. Agent memory is not authoritative.

Each entry is **one work item seen from two angles**:

```jsonc
{
  "AF-302": {
    "title": "Mission persistence",

    // Execution plane — is this scheduled, running, integrated?
    "execution": {
      "wave": "WAVE-02",
      "agent": "codex-backend-AF-302",
      "branch": "agent/AF-302",
      "worktree": "/worktrees/AF-302",
      "base_sha": "abc123…",
      "prd": "PRD-03", "story": "STORY-002",
      "dependencies": [{ "on": "AF-301", "kind": "HARD" }],
      "write_manifest": ["src/Missions/MissionRepository.cs"],
      "status": "INTEGRATION_READY",
      "blockers": []
    },

    // Governance plane — is this claim proven?
    "implementation_status": "COMPLETE",
    "acceptance_status": "PASS",
    "integration_status": "INTEGRATION_READY",
    "publication_status": "NOT_STARTED",
    "external_validation_status": "NOT_APPLICABLE",

    "worker_sha": "…", "stable_patch_id": "…",
    "evidence": [".ai/evidence/AF-302/tests.json"],
    "patch_guide": ".ai/patches/AF-302.md",
    "acceptance_criteria": [ … ],
    "provenance": { … },
    "remaining_gaps": []
  }
}
```

`sf` cross-checks the two planes on every `/mission reconcile`. A scheduler that says
`INTEGRATED` while the evidence gate says otherwise is reported as a discrepancy, not accepted.

### Never collapse the lifecycle into one vague status

Track independently: **implementation · acceptance · integration · publication · external validation.**

A feature may be implemented but not accepted. Accepted but not externally validated.
Accepted but not published.

---

## 6. Vocabularies

**Governance status** — `NOT_STARTED` `IN_PROGRESS` `IMPLEMENTATION_GAP` `BLOCKED_BY_STORY`
`BLOCKED_BY_AUTHORIZATION` `BLOCKED_BY_INFRASTRUCTURE` `EVIDENCE_PARTIAL`
`EXTERNAL_VALIDATION_REQUIRED` `FAIL` `PASS` `COMPLETE` `INTEGRATION_READY`
`INTEGRATION_VALIDATED` `PUBLISHED` `NOT_APPLICABLE`

**Execution status** — `PLANNED` `READY` `BLOCKED` `IN_PROGRESS` `IMPLEMENTED` `TESTING`
`PASSED` `FAILED` `INTEGRATION_READY` `INTEGRATED` `VERIFIED` `REJECTED`

**AC disposition** — `PASS` `FAIL` `IMPLEMENTATION_GAP` `EVIDENCE_PARTIAL`
`EXTERNAL_VALIDATION_REQUIRED` `BLOCKED_BY_STORY` `BLOCKED_BY_AUTHORIZATION`
`BLOCKED_BY_INFRASTRUCTURE` `NOT_APPLICABLE`

**Failure codes** — `REQUIREMENT_GAP` `DEPENDENCY_BLOCKED` `WORKTREE_INVALID` `BASELINE_DRIFT`
`WRITE_COLLISION` `PATCH_CONFLICT` `BUILD_FAILURE` `TEST_FAILURE` `ENVIRONMENT_FAILURE`
`PORT_CONFLICT` `PROCESS_CLEANUP_FAILURE` `SECURITY_FAILURE` `INTEGRATION_CONFLICT`

**Defect origin** — `PRODUCT_DEFECT` `TEST_DEFECT` `ENVIRONMENT_DEFECT` `WORKTREE_DEFECT`
`REPOSITORY_SNAPSHOT_INCOMPLETE` `INFRASTRUCTURE_DEFECT` `EXTERNAL_DEPENDENCY`
`AUTHORIZATION_FAILURE`

**Banned status language** — "almost done", "mostly working", "probably fixed", "looks good",
"should pass", "seems fine", "probably pre-existing".

`IMPLEMENTED` is not `VERIFIED`. A commit is not acceptance. An integration is not a publication.

---

## 7. Unit of execution

```text
PRD → Feature → Story → Task → Subtask
```

Dispatch the **smallest independently verifiable unit** that provides useful progress.
One agent owns one bounded write unit at a time. Dependencies determine order — not
filename order, not PRD order.

Every dispatched write unit must resolve to a requirement artifact (Genesis PRD, generated
story, task spec, bug spec, or hardening spec) exposing: ID · parent PRD · objective · scope ·
out of scope · dependencies · acceptance criteria · affected layers · expected tests.

---

## 8. Dependency graph and waves

Build **one** graph across all selected work — dependencies routinely cross PRDs.

| Kind | Meaning |
|---|---|
| `HARD` | Dependent work must not start. |
| `SOFT` | May start against a stable documented contract. |
| `INTEGRATION` | May proceed independently; completion requires combined verification. |

A work item is wave-eligible only when all HARD dependencies are satisfied, its baseline and
write scope are known, no unresolved write collision exists, and its environment is available.

```bash
sf                                   # then, at the prompt:
/mission set-baseline --branch main
/mission plan AF-302 --depends "AF-301:HARD" --writes "src/Missions/MissionRepository.cs"
/mission wave plan                   # collision-aware; defers, never merges blindly
/mission wave dispatch WAVE-02 --items "AF-302,AF-401"
```

`wave plan` admits items one at a time and **defers** any that would collide with an already
admitted item. Write collisions are detected before dispatch, not resolved as merge conflicts
afterwards.

**A dependency cycle schedules nothing.** It is reported for a human to break.

After each wave: verify commits and tests → run Anvil gates → integrate in dependency order →
update baseline → update ledger → recompute the graph → plan the next wave.
Never pre-plan every later wave as immutable.

---

## 9. Collision classes

| Class | Response |
|---|---|
| `NONE` | Safe to run in parallel. Integration is still serial. |
| `SOFT_OVERLAP` | Likely to merge cleanly; integrate serially and verify provenance for both. |
| `SHARED_HOTSPOT` | Serialize, or split manifests so each worker owns a disjoint set. |
| `DEPENDENCY` | Run the prerequisite to completion first. |
| `HARD_COLLISION` | **SERIALIZE.** Both workers would redefine the same architectural primitive. |

Architectural hotspots — `Program.cs`, `Startup.cs`, `package.json`, lockfiles, routing,
DI/bootstrap, `schema.prisma`/`.sql`/`.graphql`, `migrations/`, auth/authorization, global
store, `contracts/` — escalate a shared file to `HARD_COLLISION`. A shared file is not
automatically a hard collision; a shared architectural primitive is.

---

## 10. Agent identity

Format: `<platform>-<role>-<work-item>` — e.g. `codex-backend-AF-302`, `claude-architect-AF-101`.

**Anonymous subagents are prohibited during orchestrated execution.**

```bash
/mission agent register codex-backend-AF-302 \
  --item AF-302 --mode WRITE \
  --worktree ../project-worktrees/AF-302 --branch agent/AF-302
```

Registration is **refused** when the worktree is already owned by an ACTIVE write agent, or
when the target is not a git-registered worktree. Read-only reviewers may inspect an occupied
worktree; a tester that needs to write fixtures gets its own.

---

## 11. Worktrees

```bash
git fetch --all --prune
git worktree add -b agent/AF-302 ../project-worktrees/AF-302 origin/main
git worktree list --porcelain          # must list the new path
```

Record the **resolved SHA**, never a moving branch name. Before any write:

```bash
/mission attest AF-302 --worker codex-backend-AF-302 --agent codex --base origin/main
/mission gate AF-302                   # WRITES AUTHORIZED / WRITES BLOCKED
```

Attestation fails closed on: not a git repo · not a registered worktree · the main checkout
(unless `--allow-main` for a single-worker mission) · a dirty **product** tree · no commit
capability · missing required assets. Uncommitted files under `.ai/` and `.skillfoundry/` are
governance artifacts and do not dirty the baseline.

**No source writes before a PASS attestation.**

---

## 12. Baseline and drift

```bash
/mission baseline --fetch --expect <sha>
```

| Freshness | Meaning |
|---|---|
| `CURRENT` | Local matches the remote. |
| `ADVANCED` | Local is ahead. |
| `STALE` | The remote moved. **Do not reset backwards** — classify first. |
| `DIVERGED` | Both moved. |
| `UNKNOWN` | No remote, or the ref could not be resolved. |

Advancement classes: `EXPECTED_ADVANCEMENT` · `SAFE_FORWARD_ADVANCEMENT` ·
`PARALLEL_PUBLICATION` · `COLLIDING_ADVANCEMENT` · `BASELINE_DRIFT` · `UNEXPLAINED_DRIFT`.

`/mission baseline` also prints the **collision surface**: the files that moved on the remote.

---

## 13. Patch guides

Every write-capable work item carries `.ai/patches/<ID>.md`, scaffolded by `/mission init`
with the real baseline SHA and tree already filled in. It records purpose, requirement,
baseline, worker, changed files (reason · requirement · behavior changed), architecture
(primitive reused vs. created, and why), security impact, database impact, tests, evidence
references, known gaps, non-goals, and rollback.

The patch guide describes the contribution. **It is not a replacement for git history.**

Before writing: confirm the requirement, worktree legitimacy, and base SHA; inspect the target
source and nearby tests; check whether an equivalent implementation already exists; declare the
expected write scope. After writing: `git status --short && git diff --stat`, compare actual
against expected, and explain every unexpected file.

---

## 14. Evidence and test economy

Testing requirements are unchanged. What changes is **when expensive suites run.**

```text
1. syntax / static validation
2. targeted unit
3. targeted component / service
4. targeted API / integration
5. affected-module regression
6. full suite — only at execution gates
```

Full or expensive suites run at: feature completion · wave completion · pre-integration gate ·
shared or high-risk code changes · explicit acceptance criteria · release gates · targeted
failures indicating systemic impact.

```bash
/mission evidence AF-302 --kind tests --run "npm test"
```

This records command, exit code, pass/fail/skip counts, duration, **normal termination**,
**orphan check**, source SHA, environment fingerprint, and a path to the full log. Payloads
are redacted and size-bounded — evidence **references** large artifacts, never embeds them.

### Normal termination is part of acceptance

A run whose assertions passed but whose host had to be killed, or that left processes alive in
its process group, is reported **NOT A CLEAN VALIDATION**. Never score it as PASS.

### RUNNING_QUIET is not STALLED

Sparse output does not mean a process is hung. Classify: `RUNNING` · `RUNNING_QUIET` ·
`STALLED` · `FAILED` · `COMPLETED`, using liveness, heartbeat, child-process state, and
historical duration. Do not kill expensive validation merely because stdout is quiet.

### Bounded retries

Record attempt · failure signature · whether state changed · why the retry is justified.
Two consecutive attempts producing identical evidence with no state change is `NO_PROGRESS`:
**stop and report the blocker.**

### "Probably pre-existing" requires proof

An unsupported claim converts a self-inflicted regression into an accepted condition. Run the
same test, in the same environment, at the accepted baseline SHA. Without that evidence the
verdict is **not substantiated** — treat the failure as caused by this mission.

### Environment failure is not product failure

Never modify product architecture to compensate for missing project files, a malformed working
copy, an incorrect worktree, an agent sandbox limitation, a missing SDK, a broken PATH, or a
missing external dependency. Fix or report the environment.

---

## 14b. Delivery efficiency

> Canonical policy: `agents/_delivery-efficiency.md`. Command: `/delivery`.

Scoping *what* gets validated is as important as scoping *who* writes. Each work item
carries a **delivery budget** (LOW / MEDIUM / HIGH), classified deterministically from its
paths and text, which selects how much analysis, testing and review it warrants.

```
Worker A → targeted validation ┐
Worker B → targeted validation ├→ integration gate → repository-wide validation ONCE
Worker C → targeted validation ┘
```

- **Workers validate at the narrowest sufficient scope.** A LOW change never triggers the
  repository-wide suite; `full` is not reachable from the budget alone.
- **Evidence is reused, not repeated.** A validation already proven against this exact
  repository state is skipped; one that already *failed* against it is fixed, not re-run.
- **Validation is deduplicated.** Two workers never run the same expensive check
  concurrently — the first claims it, the others consume its evidence.
- **The gate pays the repository-wide cost once**, over the aggregate change, invalidating
  only the evidence that integration itself disturbed.
- **Stop when proven.** Once implementation, acceptance, required validation, diff review
  and evidence are satisfied, the task is done. Re-reading an unchanged diff is not
  diligence.

Safety-critical work — authentication, authorization, secrets, cryptography, migrations,
deployment, financial and compliance logic — always classifies HIGH, and its required checks
are never skipped or downgraded.

```bash
/delivery budget "<task>" --files a,b     # classify before implementing
/delivery check --kind test --command "…"  # REUSE / RUN / WAIT / FIX_FIRST
/delivery gate                             # what the integration gate must actually run
/cost --efficiency                         # what the wave actually cost
```

---

## 15. Process ownership

Every process an agent starts is owned by that agent until explicitly transferred — dev servers,
test watchers, Docker containers, browser automation, background workers, databases launched for
tests.

```bash
/mission catalog add ExampleApp --repository /apps/example \
  --services "frontend:frontend:4200,backend:backend:5063"
/mission proc register --pid 48213 --agent codex-backend-AF-302 \
  --item AF-302 --command "dotnet run" --ports 5063
/mission proc orphans
/mission proc stop codex-backend-AF-302
```

Registration captures an **identity fingerprint** of the live command line. Before any signal is
sent, the PID is re-verified against it. PIDs are recycled — killing a recycled PID destroys
someone else's work, so a mismatch is **refused and reported**, never killed.

Children are signalled before their parent, so a supervisor cannot respawn them.
Consult `.ai/app-catalog.json` before starting or killing services; a port claimed twice is
reported as `PORT_CONFLICT`.

**A worker cannot report clean completion while owned orphan processes remain.**
`/mission agent release` refuses until they are stopped.

---

## 16. Provenance

A commit SHA cannot answer *"is the worker's change actually still in the tree we are about to
publish?"* — a cherry-pick changes the SHA, and a later change can silently overwrite a
contribution whose SHA is still in the history.

```bash
/mission commit AF-302                                  # worker SHA + stable patch ID
/mission provenance AF-302 --integration main
```

Provenance is established by `DIRECT_ANCESTRY` or `PROVEN_PATCH_EQUIVALENT_CHERRY_PICK`
(`git patch-id --stable`), then confirmed against the final tree:

| Final-tree contribution | Meaning |
|---|---|
| `PRESERVED` | Content verified present. |
| `SUPERSEDED_BY_AUTHORIZED_CHANGE` | Overwritten, and the overwrite was authorized. |
| `LOST` | Not present. **Blocks acceptance.** |
| `UNKNOWN` | Unexplained. **Blocks acceptance.** |

Stale workers are reconciled **read-only** first: `CURRENT` · `STALE_BUT_PATCH_EQUIVALENT` ·
`STALE_WITH_COLLISION` · `OBSOLETE` · `UNKNOWN`. Never blindly integrate a stale worker, and
never modify product code to make an obsolete worker fit.

---

## 17. Integration is serial

**Parallel implementation is not parallel merging.**

Workers do not integrate themselves into the authoritative branch unless explicitly assigned
integration responsibility. Use a fresh integration worktree from the current authoritative
remote baseline, then:

```bash
/mission wave order            # dependency order, not completion time
/mission provenance <ID> --integration <integration-ref>
/mission integrate <ID>
```

Before validation, verify: all intended contributions present · no unintended contribution
present · patch equivalence established · security boundaries preserved · migrations ordered ·
generated artifacts valid · working tree clean.

---

## 18. Publication

Integration does **not** authorize publication. Before publishing, require a validated
integration, a clean worktree, a fresh remote, provenance PASS, security PASS, required
evidence, and explicit publication authorization.

```bash
git fetch --all --prune          # if the remote advanced, STOP and reconcile
git push
/mission publish-check AF-302 --branch main --sha <integration-sha>
```

**A successful push is not proof.** `publish-check` re-reads the remote ref and confirms both
the SHA and the contribution content. Anything less is `PUBLICATION_FAILED`.

---

## 19. Definition of Done

```bash
/mission verify AF-302
/mission report AF-302 --out docs/reports/AF-302.md
```

Gates: AC matrix complete · attestation recorded · worker commit created · stable patch identity
recorded · patch guide updated · evidence persisted · normal termination proven · no owned orphan
processes · unresolved gaps explicit · provenance established · remote publication verified.

Distinguish **WORKER DONE · ACCEPTANCE DONE · INTEGRATION DONE · PUBLICATION DONE.**

Final dispositions: `COMPLETE — INTEGRATION_READY` · `INTEGRATION_VALIDATED — READY_FOR_PUBLICATION` ·
`PUBLISHED — COMPLETE` · `IMPLEMENTATION_GAP — REMEDIATION_REQUIRED` ·
`EVIDENCE_PARTIAL — VALIDATION_REQUIRED` · `EXTERNAL_VALIDATION_REQUIRED` · `BLOCKED_BY_STORY` ·
`BLOCKED_BY_INFRASTRUCTURE` · `BLOCKED_BY_AUTHORIZATION` · `FAILED — DO_NOT_INTEGRATE`.

---

## 20. Failure reporting

When blocked, report: what failed · where · requirement affected · failure classification ·
evidence · product vs. environment vs. infrastructure vs. external dependency · what was **not**
modified · what remains safe · the exact next action.

Never say "probably pre-existing" without baseline evidence. Never say "seems fine" without
acceptance evidence. Never say "tests pass" when the process did not terminate normally.

---

## 21. Recovery after context loss

Agents must not depend on conversation memory. Recovery order:

```text
1. CLAUDE.md / AGENTS.md / platform instructions
2. MULTI_AGENT_PROTOCOL.md
3. .ai/ledger.json
4. relevant Genesis PRD / story
5. .ai/patches/<work-item>.md
6. git status / log / diff
7. .ai/evidence/<work-item>/
8. .ai/agents/ and .ai/processes/
```

Then structurally inspect existing source before generating new code. This extends
SkillFoundry's duplication guard.

### Truth order

```text
1. current authoritative repository tree
2. accepted immutable validation evidence
3. governed integration / publication evidence
4. authoritative story / AC specification
5. .ai/ledger.json
6. patch / design documentation
7. historical reports
8. agent narrative
```

If the ledger disagrees with proven repository state, **the ledger is stale — correct the ledger.
Do not rewrite reality to match it.** `/mission reconcile` reports every unsubstantiated claim.

---

## 22. Token and cost governance

LLM context is a finite engineering resource. Do not repeatedly feed in full build logs, full
test logs, unchanged source files, entire repositories, successful command noise, or duplicate
evidence.

Prefer structured summaries · changed files · failing tests · relevant stack frames · bounded
diffs · evidence references · hashes · artifact paths.

Execute tests broadly when required. Reason narrowly.

> **Token limits may reduce context consumption. They must never reduce required validation.**

---

## 23. Command reference

```text
Setup            /mission init <ID> --title "..."
                 /mission attest <ID> --worker <name> --agent claude
                 /mission gate <ID>

Orchestration    /mission set-baseline [--branch main]
                 /mission plan <ID> --depends "A:HARD" --writes "src/a.ts"
                 /mission agent register <name> --item <ID> --worktree <path> --mode WRITE
                 /mission agent list [--all] | agent release <name>
                 /mission wave plan [--max N] | wave dispatch <WAVE> --items "A,B"
                 /mission wave order | wave complete | wave status
                 /mission exec <ID> <EXECUTION-STATUS>
                 /mission block <ID> <FAILURE-CODE> --detail "..."
                 /mission collide --a "w1:f1,f2" --b "w2:f2"

Runtime          /mission catalog add <app> --services "frontend:frontend:4200"
                 /mission catalog list | catalog port 4200
                 /mission proc register --pid N --agent <a> --item <ID> --command "..."
                 /mission proc list | proc orphans | proc stop <agent> [--force]

Evidence         /mission evidence <ID> --kind tests --run "npm test"
                 /mission ac <ID> --file criteria.json
                 /mission gap open --mission <ID> --type EVIDENCE --desc "..." [--blocks]

Integration      /mission commit <ID> | provenance <ID> --integration <ref>
                 /mission integrate <ID> | publish-check <ID> --branch main --sha <sha>

Ledger           /mission set <ID> <dimension> <STATUS> [--force]
                 /mission verify <ID> | report <ID> [--out path.md]
                 /mission reconcile | status
```

---

## Final principle

The goal is not to make the agent finish. The goal is a bounded, reviewable, reproducible,
secure, evidence-backed contribution whose origin, requirements, implementation, validation,
integration, and publication can be **independently proven**.

The durable authority is:

```text
Requirements + Git + Tests + Anvil evidence + Patch guides + Logs + JSON ledger
```

— not any individual agent's conversation memory.

A worker saying "done" is not evidence. A commit is not acceptance. A passing test without
normal termination is not a clean validation. An integration is not a publication. A publication
without remote verification is not proven.

**No AI agent is authorized to silently redefine any of those rules.**

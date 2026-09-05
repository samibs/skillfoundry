# Delivery Efficiency

**Version 5.32.0** | Canonical policy: `agents/_delivery-efficiency.md` | Command: `/delivery`

---

## Purpose

AI agents are not usually wrong. They are usually *expensive*: they re-read the same
repository, re-run the same suite, re-review the same unchanged diff, and keep going long
after the change was already proven correct. Multiply that by a wave of parallel workers and
most of the compute goes into rediscovery.

This layer makes the effort proportional to the risk.

> **Do not perform more engineering activity than is necessary to prove the requested change
> correct.**

A shorter execution is not automatically better. A longer execution is not automatically
safer. The correct execution is the **minimum defensible** one that produces sufficient
evidence of correctness.

```
Agent effectiveness = accepted useful change / (elapsed time × compute cost × human attention)
```

The goal is not to make agents behave more like human developers. It is to make them deliver
senior-engineer-quality changes with the minimum necessary reasoning, execution, testing and
validation.

---

## Old behavior vs. new

Three workers, three unrelated features.

### Before

```
Worker A   inspect repo · full build · full test
Worker B   inspect repo · full build · full test
Worker C   inspect repo · full build · full test
Integrator                 full build · full test
```

Four full builds. Four full test runs. Three independent rediscoveries of the same
architecture. The repository was scanned four times to learn the same thing.

### After

```
Worker A   targeted analysis · targeted tests   → evidence
Worker B   targeted analysis · targeted tests   → evidence
Worker C   targeted analysis · targeted tests   → evidence
                              ↓
Integrator  reuse worker evidence
            aggregate changed-file impact
            invalidate only what integration disturbed
            ONE repository-wide validation, if the aggregate risk requires it
```

Shared context is established once. Each worker proves its own change at the narrowest
sufficient scope. The repository-wide cost is paid at the gate, once — and only for the
files integration actually touched.

Nothing was skipped that had not already been proven.

---

## Delivery budgets

Every task is classified before implementation. Classification is **deterministic** — path
patterns and keyword sets, no model call — so the same task always lands in the same budget
with an auditable reason.

| Budget | Work | Validation |
|---|---|---|
| **LOW** | CSS/visual, text, small config, simple local refactor, isolated DTO rename, docs | inspect relevant files → implement → type-check → smoke tests → diff → stop |
| **MEDIUM** | Normal feature, focused endpoint, business-rule change, DB query change, contained refactor | scoped analysis → implement → targeted tests → affected build → diff → acceptance → stop |
| **HIGH** | Auth, security, crypto, migration, infrastructure, concurrency, transactions, deployment, secrets, public API, financial/compliance | plan → dependency analysis → implement → targeted + integration tests → security checks → broad build → acceptance → regression → review |

```bash
/delivery budget "add a paginated orders endpoint" --files src/api/orders.ts
/delivery policy MEDIUM
```

### Risk classification

HIGH is triggered by **path or keyword**, so a change described as "a tiny tweak" that
touches `src/auth/` is still HIGH:

```bash
$ /delivery budget "tiny tweak, one line" --files src/auth/token-validator.ts
  Level:  HIGH
  Reason: Safety-critical signals detected: path:authentication/authorization (src/auth/token-validator.ts)
  ✗ Safety-critical — required checks cannot be skipped or downgraded.
```

### Overrides

A task or PRD may set the level explicitly. An override may always **raise** the budget.
It may lower a non-safety-critical one. It **cannot** lower a safety-critical
classification — that is refused and logged. The deliberate escape hatch
(`allowUnsafeOverride`) records that required checks are no longer guaranteed.

---

## Evidence reuse

> **already proven + unchanged = do not prove again**

Before any expensive validation:

```bash
/delivery check --kind test --command "npm test -- src/auth" --files src/auth/token.ts
```

| Result | Meaning |
|---|---|
| `REUSE` | Already proven against this exact state. Skip it. |
| `FIX_FIRST` | Already **failed** against this state. Re-running unchanged proves nothing. |
| `WAIT` | Another worker is running it. Consume its evidence. |
| `RUN` | Genuinely needed, and the claim is yours. |

For **in-process** work, `FIX_FIRST` still hands back the recorded result. Re-deriving an
identical failure proves nothing, so a caller that only needs to *report* the outcome uses
the value and skips the work — while a caller that needs to *act* on the check still sees
that the cause must be fixed. Reuse of a failure is always labelled as such, never dressed
up as proven.

### Validity

Evidence records the content hash of every file it depended on. It stays valid only while
those files are byte-identical:

- a change to a **scoped** file invalidates that evidence precisely;
- a change to an **unrelated** file leaves it valid;
- **repository-wide** evidence is bound to the whole tree hash — deliberately conservative,
  because when dependency impact is unclear the safe answer is to re-run.

Evidence is stored in `.skillfoundry/delivery-evidence.json` alongside the existing gate
cache, and is regenerable: deleting it costs time, never correctness.

---

## Validation deduplication

Three workers must not each run the full suite. The first to claim a validation runs it;
the others are told who holds it and consume the resulting evidence.

```
Worker A → decideValidation → RUN   (claim granted)
Worker B → decideValidation → WAIT  (worker-a is already running this)
Worker C → decideValidation → WAIT
```

A claim is an atomic `mkdir`. A **directory** rather than an exclusive file create, because
`mkdir` is atomic on NFS as well as on local POSIX and Windows filesystems, where
`O_CREAT | O_EXCL` on a regular file is not — so two processes racing cannot both win on any
of them. A claim past its TTL is reclaimed, so a crashed worker cannot deadlock the wave, and
a lock directory left without readable owner metadata (a crash between the two steps) is
treated the same way.

---

## Test scopes

`smoke` · `targeted` · `affected` · `integration` · `full`

Derived from the delivery budget, changed files, acceptance criteria, an explicit override,
and dependency impact — and the reasoning is always recorded:

```bash
$ /delivery scope --budget MEDIUM --dependents 20
  Scope: affected
  Why
    · MEDIUM budget starts at "targeted"
    · 20 dependent file(s) exceed the 15-file fan-out bound — widened to "affected"
  Not run
    · full: worker-level validation is scoped; repository-wide validation belongs to the integration gate
```

**`full` is never chosen from the budget alone.** It is reached only by explicit override or
at the integration gate.

### Escalation

```
targeted tests fail → diagnose → fix → targeted tests pass → STOP
```

A successful fix is **not** grounds for a full-suite run. Scope escalates only when a failure
names files outside the change, or dependency analysis reveals wider impact.

---

## Reasoning budget

Facts established once are shared, and carry an explicit confidence — because treating a
guess like a specification is how an assumption silently becomes a premise.

| Confidence | Reuse |
|---|---|
| `AUTHORITATIVE` | Yes — from the specification or a verified source |
| `INFERRED` | Yes, unless the change is safety-critical |
| `ASSUMPTION` | No — verify before relying on it |

```bash
/delivery context
```

Re-derive only when the repository state changed, the fact lapsed, the fact is an assumption,
or safety requires independent verification. A fact records the files it depends on, so a
change invalidates it precisely rather than discarding the whole context.

---

## Escalation

| Transition | Triggers |
|---|---|
| LOW → MEDIUM | cross-module impact · compile failure outside the touched area · undocumented dependency · tests reveal broader impact |
| MEDIUM → HIGH | auth/authz impact discovered · security-sensitive behavior · migration required · transaction or data-integrity risk · public API compatibility risk · deployment affected |

```bash
/delivery escalate --budget LOW --to MEDIUM \
  --reason "compile failure outside the touched area" \
  --evidence "tsc error in src/unrelated/service.ts"
```

An escalation with **no evidence is refused** — arbitrary escalation is the same waste the
budget exists to prevent. A budget is never lowered mid-task.

---

## Stop conditions

A task is complete when, objectively:

```
implementation complete · acceptance criteria proven · required validation passed
no unresolved blocker · diff inspected · required evidence recorded
```

```bash
$ /delivery complete --budget MEDIUM --implemented --diff-inspected --evidence-recorded \
    --ac-proven 3 --ac-total 3 --passed-at targeted --required-scope targeted

  ✓ implementation-complete    Implementation finished
  ✓ acceptance-proven          3/3 acceptance criteria proven
  ✓ validation-passed          Passed at "targeted" (required "targeted")
  ✓ no-blockers                No unresolved blockers
  ✓ diff-inspected             Diff inspected
  ✓ evidence-recorded          Evidence recorded

  ✓ DELIVERY COMPLETE
    · The change is proven. Do not re-read the same unchanged diff.
    · Do not broaden test scope without evidence of wider impact.
    · Do not perform opportunistic refactoring or cleanup that was not requested.
    · Do not re-run a validation that already passed against this repository state.
```

Security checks are a **mandatory, non-skippable** criterion at HIGH.

---

## Multi-agent integration

Composes with `MULTI_AGENT_PROTOCOL.md`. Each worker hands off compactly — task ID,
worktree, base commit, resulting commit, changed files, budget, validation scope, tests
executed, evidence generated, evidence reused, unresolved gaps — and the integrator consumes
that instead of repeating the investigation.

```bash
/delivery gate
```

The gate: verifies handoffs → aggregates changed files → invalidates only what integration
disturbed → reuses what survives → computes the required final scope from the riskiest
contribution → runs only what is genuinely missing.

It re-runs a worker's validation only when the source moved after it was proven, the handoff
cannot be trusted, integration touched the same files, or the policy demands a broader level.

---

## Runtime integration

The layer is not advice — it fires during execution.

```ts
const plan = planTask(workDir, { taskId: 'AF-302', text: story, baseRef: 'origin/main' });
//   → detects changed files, classifies the budget, MEASURES dependency fan-out,
//     and derives the test scope from all three

const exec = executeTask(workDir, plan, validations);
//   → runs only validations at or below the selected scope
//   → reuses anything already proven against this state
//   → stops at the first genuine failure
//   → escalates budget/scope only on evidence from that failure

completeTask(workDir, exec);        // records the worker handoff
taskIsComplete(workDir, exec, …);   // objective stop verdict
```

`runValidation()` wraps a subprocess; `runOrReuse()` wraps **in-process** work such as
`runAllGates`, storing the compact result so a reuse genuinely returns it rather than
re-running to reconstruct the detail.

Both expensive CLI validation paths are wired:

| Path | Behavior |
|---|---|
| `$forge --dry-run` | Reuses the recorded gate summary against an unchanged tree |
| `/gate all` | Same, with `--force` to bypass. Single-tier runs (`/gate t1`) are untouched — they are already cheap |

### Measured impact, not supplied guesses

`delivery-impact.ts` builds a reverse import graph (TS/JS/Python) cached against the tree
hash, so the fan-out that widens `targeted` → `affected` is measured.

**Path aliases are resolved.** `compilerOptions.paths` and `baseUrl` are read from
`tsconfig.json`, `jsconfig.json` and `tsconfig.base.json` (comments tolerated), so a monorepo
importing `@app/core` produces real dependency edges instead of a graph that reports almost
everything as external and collapses the measured fan-out to near zero — which would quietly
*narrow* test scope on exactly the codebases that need it widened.

It is deliberately a static regex-level scan — resolving a full module graph would cost more
than the validation it avoids — and it is honest about its limits: a specifier that matches
no alias and no relative path is counted as an **unresolved import** rather than silently
dropped, so a high unresolved count means the fan-out is a lower bound and callers should
widen rather than narrow.

```bash
/delivery impact --files src/app/core.ts     # measured dependents, with caveats stated
```

---

## Measurement

```bash
/cost --efficiency          # or /delivery efficiency
```

Reports per task and in aggregate: delivery budget, validation scope, validation commands,
repeated commands, evidence reused vs regenerated, evidence reuse rate, **validation seconds
actually spent**, seconds saved by reuse, and repository-wide runs avoided at worker level.

Durations are measured by the runner and carried on the worker handoff, so
`validationSeconds` is a real number rather than `unknown` for any task that went through
`executeTask`.

Token usage and cost are read from the **real** usage ledger (`budget.ts`) and attributed to
each task's execution window — the span between `planTask` and the recorded handoff. That is
an honest approximation for sequential work, and is stated as such: when two workers overlap
in one process their windows overlap too, so the figure is shared rather than exact.

**Unmeasurable values are reported as `unknown`, never estimated.** A fabricated token count
poisons every ratio computed from it, so a window covering no recorded provider call reports
`null` rather than zero.

---

## Configuration

```toml
[delivery_efficiency]
enabled = true                      # master switch
default_budget = "MEDIUM"
evidence_reuse = true
validation_deduplication = true
test_scope_policy = "risk-based"    # or "always-full"
stop_when_proven = true
```

Defaults are safe and the layer is **on**. With `enabled = false`, every task is HIGH, every
scope is `full`, no evidence is reused, and completion is reported but never enforced — the
behavior SkillFoundry had before this layer existed.

The two sub-switches are independent: reuse can be off while deduplication stays on (workers
still never run the same validation concurrently), and vice versa.

---

## Safety constraints

Optimization **never** bypasses required checks for authentication, authorization, secrets,
cryptography, destructive database changes, schema migrations, production deployment,
financial integrity, compliance controls, or security-sensitive code.

- They classify HIGH on path or keyword.
- A downgrade override is refused and logged.
- Security checks are mandatory at HIGH; a task cannot report complete without them.
- A test-scope override that would under-test a HIGH change is refused.
- Evidence is reused only when valid for the exact relevant repository state.

---

## Structured logging

Emitted through the existing logger under the `delivery` category:

```
budget_selected · budget_escalated · unsafe_override_refused · safety_critical_downgraded
evidence_reused · evidence_invalidated · validation_executed · validation_skipped_already_proven
duplicate_validation_prevented · stale_validation_claim_reclaimed
test_scope_selected · test_scope_override_refused
rediscovery_avoided · context_facts_invalidated
worker_handoff_recorded · integration_gate_planned · delivery_complete
```

---

## Command reference

```text
/delivery status                             Effective settings and mission summary
/delivery plan <TASK-ID> [--text "..."] [--base <ref>] [--override HIGH]
/delivery impact [--files a,b] [--base <ref>] [--depth 3] [--rebuild]
/delivery budget "<task>" [--files a,b] [--override HIGH]
/delivery policy <LOW|MEDIUM|HIGH>
/delivery scope --budget MEDIUM [--files a,b] [--dependents 20] [--gate]
/delivery escalate --budget LOW --to MEDIUM --reason "..." --evidence "..."
/delivery check --kind test --command "npm test" [--files a,b] [--owner w1]
/delivery evidence [list|clear]
/delivery context [--mission m]
/delivery gate [--integration-files a,b]
/delivery complete --budget MEDIUM --implemented --diff-inspected …
/delivery efficiency [--json]
/cost --efficiency
```

---

## What this is not

- **Not a licence to skip tests.** It changes *when* expensive suites run, not *whether*
  required validation exists.
- **Not token-count optimization.** Optimising tokens alone rewards an agent that thinks less
  and ships worse.
- **Not a replacement** for the Anvil, BPSBS, three-layer completeness, or the governed
  mission protocol. Those remain authoritative for quality; this decides how much validation
  effort a change warrants.

> Token limits may reduce context consumption. They must never reduce required validation.

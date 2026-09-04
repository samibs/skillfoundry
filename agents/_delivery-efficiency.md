# Delivery Efficiency Policy

> **CORE FRAMEWORK MODULE — CANONICAL POLICY**
> Referenced by: `$go`, `$forge`, `$context`, `$cost`, `$tester`, and every platform adapter
> (Claude, Codex, Cursor, Copilot, Gemini, Grok).
>
> This file is the single source of the policy. Adapters **reference** it; they do not
> restate it. Enforcement lives in `sf_cli/src/core/delivery-*.ts`, surfaced by `/delivery`.

---

## The principle

> **Do not perform more engineering activity than is necessary to prove the requested
> change correct.**

A shorter execution is not automatically better. A longer execution is not automatically
safer. The correct execution is the **minimum defensible** one that produces sufficient
evidence of correctness.

```
Agent effectiveness = accepted useful change / (elapsed time × compute cost × human attention)
```

This is not about making agents behave more like human developers. It is about delivering
senior-engineer-quality changes with the minimum necessary reasoning, execution, testing
and validation.

---

## 1. Every task gets a delivery budget

Classified deterministically before implementation begins — path patterns and keyword
sets, no model call, so the same task always lands in the same budget with an auditable
reason.

| Budget | Typical work |
|---|---|
| **LOW** | CSS or visual adjustment · text change · small config change · simple local refactor · isolated DTO/model rename · documentation |
| **MEDIUM** | Normal feature work · a focused API endpoint · a business-rule change · a moderate frontend/backend interaction · a database query change · contained refactoring |
| **HIGH** | Authentication · authorization · security · cryptography · data migration · production infrastructure · concurrency · transactions · deployment · secrets · public API compatibility · cross-system architecture · destructive operations · financial/compliance logic |

```bash
/delivery budget "<task text>" --files src/a.ts,src/b.ts
```

A task or PRD may override the level. **An override cannot lower a safety-critical
classification** — see §7.

---

## 2. The budget selects an execution policy

| | LOW | MEDIUM | HIGH |
|---|---|---|---|
| Analysis | relevant files only | scoped to the module | dependency/blast-radius analysis |
| Plan first | no | no | **yes** |
| Tests | smoke | targeted | targeted + integration |
| Build | type-check if applicable | affected package | broad enough to cover the blast radius |
| Acceptance criteria | — | verified | verified |
| Security checks | — | — | **mandatory, never skippable** |
| Regression | — | — | yes |
| Repo-wide validation | never at worker level | never at worker level | permitted |

**A LOW task must not trigger the repository-wide suite. A MEDIUM task must not trigger
all-project validation without evidence that the change reaches that far.**

---

## 3. Reuse evidence: already proven + unchanged = do not prove again

Before running any expensive validation, ask whether it has already been answered:

```bash
/delivery check --kind test --command "npm test -- src/auth" --files src/auth/token.ts
```

| Answer | What it means |
|---|---|
| `REUSE` | Already proven against this exact state. Skip it. |
| `FIX_FIRST` | Already **failed** against this exact state. Re-running unchanged proves nothing. |
| `WAIT` | Another worker is running it. Consume its evidence. |
| `RUN` | Genuinely needed, and the claim is yours. |

Evidence is valid only while the files it depended on are byte-identical. Repository-wide
evidence is bound to the whole tree hash — deliberately conservative, because when
dependency impact is unclear the safe answer is to re-run.

---

## 4. Scope validation; deduplicate it

Three workers changing three unrelated features must **not** each run the full suite,
the full lint, or the full security scan.

```
Orchestrator
  ├── Worker A → targeted validation
  ├── Worker B → targeted validation
  └── Worker C → targeted validation
        ↓
   Integration gate → repository-wide validation ONCE → final review ONCE
```

Worker-level validation is scoped. Repository-wide validation happens at the integration
gate. The gate re-runs a worker's validation only when the source moved after it was
proven, the handoff cannot be trusted, integration touched the same files, or the
integration policy demands a broader level.

---

## 5. Test scope

`smoke` · `targeted` · `affected` · `integration` · `full`

Derived from the delivery budget, the changed files, the acceptance criteria, an explicit
override, and dependency impact. **`full` is never chosen from the budget alone** — only
by explicit override, or at the integration gate.

Always state *why* a scope was selected.

**Escalate on evidence, not on nerves.** Targeted tests failing → diagnose → fix →
targeted tests pass → **stop**. Do not escalate to the full suite after a successful fix.
Escalate only when a failure names files outside the change, or dependency analysis
reveals wider impact.

---

## 6. Reasoning budget: prefer given facts over rediscovery

When the mission already provides a fact — base commit, repository path, architecture
summary, changed files, relevant services, relevant tests, acceptance criteria, known
constraints, previous evidence — **use it**. Do not re-derive it.

Facts carry a confidence, and the difference matters:

| Confidence | Reuse? |
|---|---|
| `AUTHORITATIVE` | Yes — from the specification or a verified source |
| `INFERRED` | Yes, unless the change is safety-critical |
| `ASSUMPTION` | No — verify before relying on it |

Re-derive only when the repository state changed, the fact lapsed, the fact is an
assumption, or safety requires independent verification.

---

## 7. Safety constraints — non-negotiable

Optimization must **never** bypass required checks for authentication, authorization,
secrets, cryptography, destructive database changes, schema migrations, production
deployment, financial integrity, compliance controls, or security-sensitive code.

- These classify **HIGH**, on path or on keyword.
- A downgrade override is **refused**, and the refusal is logged.
- Security checks are mandatory at HIGH; a task cannot report complete without them.
- A test-scope override that would under-test a HIGH change is **refused**.
- Evidence is reused only when it remains valid for the exact relevant repository state.

---

## 8. Stop when it is proven

A task is complete when — objectively, from evidence, not from a sense of thoroughness:

```
implementation complete
acceptance criteria proven
required validation for the budget has passed
no unresolved blocker
diff inspected
required evidence recorded
```

```bash
/delivery complete --budget MEDIUM --implemented --diff-inspected --evidence-recorded \
  --ac-proven 3 --ac-total 3 --passed-at targeted --required-scope targeted
```

Once complete: **stop.** Do not re-read the same unchanged diff. Do not broaden scope
without evidence. Do not perform opportunistic refactoring or cleanup that was not
requested. Do not re-run a validation that already passed against this state.

Optional analysis happens only when explicitly requested.

---

## 9. Escalate with evidence

| Transition | Triggers |
|---|---|
| LOW → MEDIUM | unexpected cross-module impact · compile failure outside the touched area · undocumented dependency · tests reveal broader impact |
| MEDIUM → HIGH | authentication/authorization impact discovered · security-sensitive behavior · migration required · transaction or data-integrity risk · public API compatibility risk · deployment behavior affected |

Record the original budget, the new budget, the reason, and the evidence that triggered
it. An escalation with no evidence is **refused** — arbitrary escalation is the same waste
the budget exists to prevent. A budget is never *lowered* mid-task.

---

## 10. Worker handoffs

A finished worker reports what it did and what it proved — not how it got there:

```
task ID · worktree · base commit · resulting commit · changed files
delivery budget · validation scope · tests executed
evidence generated · evidence reused · unresolved gaps
```

The integrator consumes these instead of repeating the investigation.

---

## 10b. Runtime

The policy is enforced in code, not left to interpretation:

| Function | Role |
|---|---|
| `planTask()` | changed files → budget → measured impact → test scope |
| `runValidation()` | a subprocess check, with reuse and deduplication |
| `runOrReuse()` | in-process work (e.g. the gate suite), result inlined so reuse truly skips |
| `executeTask()` | runs only what the scope requires; escalates only on failure evidence |
| `completeTask()` | records the worker handoff |
| `taskIsComplete()` | the objective stop verdict |

Dependency fan-out is **measured** from a cached reverse import graph, not supplied by the
caller. Unresolved imports are counted and reported, so fan-out is treated as a lower bound.

---

## 11. Configuration

```toml
[delivery_efficiency]
enabled = true                      # master switch
default_budget = "MEDIUM"
evidence_reuse = true
validation_deduplication = true
test_scope_policy = "risk-based"    # or "always-full"
stop_when_proven = true
```

With `enabled = false`, every task is treated as HIGH, every scope is `full`, no evidence
is reused, and completion is reported but never enforced — i.e. the behavior SkillFoundry
had before this layer existed.

---

## 12. What this is not

- Not a licence to skip tests. It moves *when* expensive suites run, not *whether*
  required validation exists.
- Not token-count optimization. Optimising tokens alone rewards an agent that thinks less
  and ships worse.
- Not a replacement for the Anvil, BPSBS, three-layer completeness, or the mission
  protocol. Those remain authoritative for quality; this decides how much validation
  effort a change warrants.

> Token limits may reduce context consumption. They must never reduce required validation.

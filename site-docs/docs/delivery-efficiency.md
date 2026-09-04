---
sidebar_position: 6
title: Delivery Efficiency
---

# Delivery Efficiency

*Added in v5.32.0*

AI agents are rarely wrong. They are usually **expensive** — re-reading the same code,
re-running the same test suite, re-reviewing the same unchanged diff, and carrying on long
after the change was already proven. Run several at once and most of the compute goes into
rediscovery.

SkillFoundry now sizes the effort to the risk.

> **Do not perform more engineering activity than is necessary to prove the requested change
> correct.**

A shorter execution is not automatically better. A longer execution is not automatically
safer. The correct execution is the **minimum defensible** one.

## Delivery budgets

Every task is classified before implementation — deterministically, from what it touches, with
no model call. The same task always lands in the same budget, with a reason you can audit.

| Budget | Work | Validation |
|---|---|---|
| **LOW** | CSS, text, small config, isolated rename, docs | type-check, smoke tests, diff, stop |
| **MEDIUM** | Normal feature, endpoint, business rule, DB query | targeted tests, affected build, acceptance |
| **HIGH** | Auth, security, crypto, migration, infrastructure, deployment, payments | plan first, integration tests, **security checks**, regression |

```bash
/delivery budget "add a paginated orders endpoint" --files src/api/orders.ts
```

A LOW task will not trigger your repository-wide suite.

## Already proven means not proven twice

A validation records the content hash of every file it depended on. While those files are
byte-identical, it is not re-run:

| Answer | Meaning |
|---|---|
| `REUSE` | Already proven against this exact state. Skipped. |
| `FIX_FIRST` | Already **failed** against this state. Re-running unchanged proves nothing. |
| `WAIT` | Another worker is running it. Use its result. |
| `RUN` | Genuinely needed. |

Change one of those files and it runs again. Change an unrelated file and it stays valid.

## Three agents, one test suite

```
Worker A → targeted ┐
Worker B → targeted ├→ integration gate → repository-wide validation ONCE
Worker C → targeted ┘
```

The first agent to claim a validation runs it; the others use the result. The one
repository-wide pass happens at the gate, over the combined change — and it re-runs only what
integration itself disturbed.

## Test scope, and honest escalation

`smoke` · `targeted` · `affected` · `integration` · `full`

`full` is never chosen from the budget alone. And a fixed test failure is **not** grounds for
a full-suite run:

```
targeted tests fail → diagnose → fix → targeted tests pass → STOP
```

Scope widens only when a failure names files outside the change, or dependency analysis shows
wider impact.

```bash
$ /delivery plan STORY-042

  Budget:      MEDIUM
  Test scope:  affected
  Impact:      3 changed files reach 22 dependents within 3 hops

  Why this scope
    · MEDIUM budget starts at "targeted"
    · 22 dependent files exceed the 15-file fan-out bound — widened to "affected"
```

Impact is **measured** from a reverse import graph, with `tsconfig` path aliases resolved so a
monorepo produces real numbers. What it cannot resolve is counted and reported, so the figure
is an explicit lower bound rather than a confident guess.

## Stop when it is proven

Once implementation, acceptance criteria, required validation, diff review and evidence are
all satisfied, the task is done — and says so, along with what *not* to do next:

```
✓ DELIVERY COMPLETE
  · The change is proven. Do not re-read the same unchanged diff.
  · Do not broaden test scope without evidence of wider impact.
  · Do not perform opportunistic refactoring that was not requested.
```

## Security is never optimised

Authentication, authorization, secrets, cryptography, migrations, deployment, payments and
compliance logic classify **HIGH automatically** — on the file path *or* the wording, so a
one-line change to `src/auth/` is still HIGH.

Asking for a lower budget on that work is **refused**. Security checks cannot be skipped at
HIGH. A test scope that would under-test a HIGH change is refused.

## Measuring it

```bash
/cost --efficiency
```

Evidence reuse rate, repeated commands, validation seconds spent and saved, repository-wide
runs avoided. Token usage comes from the real usage ledger; anything unmeasurable is reported
as **unknown**, never estimated.

## Configuration

```toml
[delivery_efficiency]
enabled = true
default_budget = "MEDIUM"
evidence_reuse = true
validation_deduplication = true
test_scope_policy = "risk-based"
stop_when_proven = true
```

:::note Turning it off
`enabled = false` restores the previous behavior exactly: every task HIGH, every scope `full`,
nothing reused, completion reported but never enforced.
:::

## Where to go next

- Complete reference: `docs/DELIVERY-EFFICIENCY.md` in your project.
- `/delivery help` for all 13 subcommands.
- Release notes: `docs/V5.32.0-RELEASE-NOTES.md`.

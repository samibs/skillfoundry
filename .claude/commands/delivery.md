---
description: "Use before implementing any change to decide how much validation it warrants, and after to decide when you are done: deterministic LOW/MEDIUM/HIGH delivery budgets, evidence reuse (already proven + unchanged = do not prove again), validation deduplication across parallel agents, scoped test selection, measured change impact, and objective stop conditions. Triggers: 'do I need to run the full suite', a small change about to trigger repository-wide validation, several agents each re-running the same tests, 'is this task actually finished', repeated repository archaeology. Do NOT use for: deciding WHAT to build (use /prd or /forge), running the gates themselves (use /gate or /verify), or proving a change shipped (use /mission)."
---

# /delivery — Delivery Efficiency

> Canonical policy: `agents/_delivery-efficiency.md` · Full docs: `docs/DELIVERY-EFFICIENCY.md`

**Do not perform more engineering activity than is necessary to prove the requested change
correct.** A shorter execution is not automatically better. A longer execution is not
automatically safer. The correct execution is the **minimum defensible** one.

```
Agent effectiveness = accepted useful change / (elapsed time × compute cost × human attention)
```

---

## What it prevents

| Waste | How it is stopped |
|---|---|
| A typo fix triggering the repository-wide suite | LOW budget caps scope at `smoke`; `full` is unreachable from a budget alone |
| Re-running a check that already passed | Evidence keyed to the content hash of the files it depended on |
| Re-running one that already **failed** | `FIX_FIRST` — fix the cause, don't reproduce the failure |
| Three agents running the same suite | The first claims it; the others consume its evidence |
| Re-deriving the architecture every task | Shared mission facts, with confidence levels |
| Escalating to `full` after fixing a test | Escalation needs evidence of wider impact, not a passing fix |
| Re-reviewing an already-proven diff | `DeliveryComplete` is objective, and says what not to do next |

---

## Before you implement

```bash
/delivery plan STORY-042 --text "<the task>" --base origin/main
```

Gives you, in one step: the delivery budget and why, the measured blast radius, the test
scope, and the reasoning behind it. Then follow `/delivery policy <BUDGET>` for the steps
that budget warrants.

**Do not open with a repository-wide scan, build or test run to "get oriented."** In a
parallel wave that is the single largest source of wasted execution — the same scan, once
per worker, proving nothing the shared context did not already hold.

## Before any expensive validation

```bash
/delivery check --kind test --command "npm test -- src/auth" --files src/auth/token.ts
```

`REUSE` → skip it. `FIX_FIRST` → fix the cause. `WAIT` → another worker is running it.
`RUN` → it is genuinely needed and the claim is yours.

## When you think you are done

```bash
/delivery complete --budget MEDIUM --implemented --diff-inspected --evidence-recorded \
  --ac-proven 3 --ac-total 3 --passed-at targeted --required-scope targeted
```

If it says complete, **stop**. Optional analysis happens only when explicitly requested.

---

## Rules you must not work around

1. **Safety-critical work is HIGH**, on path or keyword — auth, authorization, secrets,
   cryptography, migrations, deployment, payments, compliance. A one-line change to
   `src/auth/` is still HIGH. A downgrade override is **refused**.
2. **Security checks cannot be skipped at HIGH.** A task cannot report complete without them.
3. **Escalate on evidence only.** A diagnosed-and-fixed targeted failure is not grounds for a
   full-suite run. Escalation without concrete evidence is refused.
4. **A budget is never lowered mid-task.**
5. **Reuse only what is still valid** for the exact relevant repository state.
6. **Never estimate what you cannot measure.** Report `unknown`.

---

## Multi-agent

Worker validation is scoped; repository-wide validation belongs to the integration gate,
once. Composes with `MULTI_AGENT_PROTOCOL.md`.

```bash
/delivery context      # shared mission facts, by confidence
/delivery gate         # what the integration gate must actually run
/cost --efficiency     # what the wave actually cost
```

---

## When NOT to use this

Deciding *what* to build (`/prd`, `/forge`). Running the gates themselves (`/gate`,
`/verify`). Proving a change shipped (`/mission`). This decides **how much validation the
change warrants** — nothing else.

Run `/delivery help` for all 13 subcommands.

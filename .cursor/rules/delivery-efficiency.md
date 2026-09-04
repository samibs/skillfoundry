---
description: Always-on pointer to the SkillFoundry delivery-efficiency policy.
alwaysApply: true
---

# SkillFoundry Delivery Efficiency

Canonical policy: `agents/_delivery-efficiency.md`. Enforcement: the `/delivery` command.

**Do not perform more engineering activity than is necessary to prove the change correct.**

- Classify the **delivery budget** (LOW / MEDIUM / HIGH) before implementing.
- Consume shared mission context before rediscovering architecture or changed files.
- Reuse validation evidence that is still valid for this exact repository state.
- Scope tests to the change. `full` is never chosen from the budget alone.
- Escalate only with evidence; a fixed targeted failure does not justify a full-suite run.
- Stop once the change is proven — no re-reading an unchanged diff, no unrequested cleanup.

Authentication, authorization, secrets, cryptography, migrations, deployment, and financial
or compliance logic always classify HIGH. Their required checks are never skipped, and a
downgrade override is refused.

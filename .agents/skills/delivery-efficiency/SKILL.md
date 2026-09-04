---
name: delivery-efficiency
description: Delivery budgets, risk-based validation, evidence reuse, scoped tests, and stop conditions. Use before implementing any change to decide how much validation it warrants.
---

# Delivery Efficiency

Canonical policy: `agents/_delivery-efficiency.md`. Read it rather than inferring the rules.

Do not perform more engineering activity than is necessary to prove the requested change
correct. Classify a delivery budget (LOW / MEDIUM / HIGH), consume shared mission context
before rediscovering it, reuse validation evidence that is still valid for this exact
repository state, scope tests to the change, escalate only with evidence, and stop once the
change is proven.

Authentication, authorization, secrets, cryptography, migrations, deployment, and financial
or compliance logic always classify HIGH; their required checks are never skipped.

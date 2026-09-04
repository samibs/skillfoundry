# Delivery Efficiency (Gemini)

Canonical policy: `agents/_delivery-efficiency.md`. Read it before implementing.

Minimize redundant reasoning and repeated validation. Classify a delivery budget
(LOW / MEDIUM / HIGH), consume shared mission context first, reuse valid evidence, use
scoped tests rather than the full suite, escalate only with evidence, and stop once the
change is proven.

Authentication, authorization, secrets, cryptography, migrations, deployment, and financial
or compliance logic always classify HIGH; their required checks are never skipped.

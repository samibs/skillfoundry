# Evaluator Calibration Protocol

> **CORE FRAMEWORK MODULE**
> Accumulates project-specific context that corrects the evaluator's judgment over time.
> Prevents trust collapse from wrong verdicts. Referenced by: `merciless-evaluator`, `/evaluator`

---

## Purpose

The evaluator is an LLM. It will occasionally flag things that are intentional project
decisions as violations. Without a correction mechanism, each wrong verdict erodes developer
trust in the entire pipeline. This protocol provides a lightweight feedback loop: developers
mark findings as wrong, the reason is stored, and future evaluator runs load this context
before judging.

This is not a way to silence the evaluator. Calibrations are stored as context, not rules.
The evaluator still reasons — it just reasons with better project-specific information.

---

## Writing Calibrations: `--feedback` Flag

After any evaluator verdict, the developer can flag a finding as wrong:

```bash
/evaluator --feedback "finding 2 was incorrect — rate limiting is at the API gateway, not service level"
/evaluator --feedback "the 'missing auth' finding on /health is intentional — health endpoints are public"
/evaluator --feedback "HS256 finding is wrong — we use RS256, the test helper uses HS256 for speed only"
```

### What gets written

Each `--feedback` call appends to `.claude/shared/evaluator-calibration.json`:

```json
{
  "calibrations": [
    {
      "id": "cal-001",
      "finding_summary": "Rate limiting not implemented in service",
      "correction": "Rate limiting is handled at the API gateway layer (Kong). Do not flag missing rate limiting in individual service code.",
      "scope": "project-wide",
      "applies_to_files": [],
      "logged_at": "ISO8601",
      "logged_by": "git-config-user-name",
      "confirmed": false
    },
    {
      "id": "cal-002",
      "finding_summary": "Missing auth on /health endpoint",
      "correction": "/health, /status, and /metrics are intentionally public. Do not flag missing auth on these routes.",
      "scope": "file-pattern",
      "applies_to_files": ["*/health*", "*/status*", "*/metrics*"],
      "logged_at": "ISO8601",
      "logged_by": "git-config-user-name",
      "confirmed": false
    }
  ]
}
```

### Scope options

| Scope | Meaning |
|-------|---------|
| `project-wide` | Applies to all files in this project |
| `file-pattern` | Applies only when flagged files match the glob pattern |
| `one-time` | Applies only to the next evaluator run, then expires |

---

## Reading Calibrations: Evaluator Pre-Load

At the start of every challenge run, the evaluator:

1. Reads `.claude/shared/evaluator-calibration.json`
2. If calibrations exist, prepends this context block before the evaluation:

```
PROJECT CALIBRATION CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The following are known project decisions, not violations.
Do not flag these as issues unless you have specific new evidence
that overrides the calibration.

[cal-001] Rate limiting: handled at API gateway (Kong), not in services.
[cal-002] /health /status /metrics: intentionally public, no auth required.

These calibrations were recorded by the development team.
If you believe a calibration is incorrect, note it in your verdict
but do not override it without explicit reasoning.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

3. If a calibration's `applies_to_files` is set, it only appears in context when those
   files are in the evaluation scope.

---

## Calibration Review

Calibrations accumulate. Periodically review them:

```bash
/evaluator --list-calibrations

EVALUATOR CALIBRATIONS (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[cal-001] Rate limiting at API gateway         project-wide    2026-06-10
[cal-002] /health endpoints are public         file-pattern    2026-06-12
[cal-003] HS256 in test helpers only           file-pattern    2026-06-18

/evaluator --remove-calibration cal-001        Remove a calibration
/evaluator --confirm-calibration cal-002       Mark as team-confirmed
```

`confirmed: true` means a senior developer or team lead has verified the calibration is
correct. Confirmed calibrations are weighted more heavily by the evaluator.

---

## What Calibration Is NOT

- **Not an override.** Calibrations are context, not rules. The evaluator can still flag
  something a calibration mentions if it has strong new evidence.
- **Not permanent silence.** If the calibrated pattern appears in a new dangerous context
  (e.g., the "HS256 only in tests" calibration, but HS256 now appears in production auth),
  the evaluator should flag it and explain why it overrides the calibration.
- **Not a replacement for fixing the code.** A calibration that says "we know this is wrong
  but we're not fixing it" should be followed by a story in `genesis/` to fix it properly.

---

## Calibration File Location

`.claude/shared/evaluator-calibration.json` — committed to git, team-visible.

This is intentional: calibrations represent team decisions, not personal preferences.
If one developer marks a finding as wrong, the whole team benefits from that context.
If the team disagrees, they remove the calibration.

---

*Evaluator Calibration Protocol v1.0.0 — SkillFoundry Framework*
*Wrong verdicts become better verdicts. Trust recovers over time.*

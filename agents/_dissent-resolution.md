# Dissent Resolution Protocol

> **INCLUDE IN: Orchestrator, Delegate, Go**
> Adapted from NASAB Pillar 4 (Collective Validation). Defines how to resolve conflicting agent recommendations.

---

## Overview

When multiple agents evaluate the same artifact and produce conflicting recommendations, the system must resolve the disagreement transparently. Silently picking one side is forbidden — disagreements contain signal.

---

## Dissent Detection

Dissent occurs when:
- Two agents return different statuses on the same file/artifact (e.g., reviewer says PASS, security says FAIL)
- Two agents recommend conflicting approaches (e.g., architect says microservice, tech-lead says monolith)
- A fixer's remediation is rejected by the gate-keeper that originally flagged it

---

## Resolution Rules

### Rule 1: Reality Anchor Wins
If one agent has **concrete proof** (passing tests, successful execution, measurable output) and the other has an opinion-based objection, the reality anchor overrides.

Example: Coder's implementation passes all tests. Reviewer objects to style. → Implementation stands, style feedback is a suggestion, not a blocker.

### Rule 2: Thin Consensus = Contested
If the split is close to 50/50 (e.g., evaluator says marginal pass, gate-keeper says marginal fail), **do not auto-resolve**. Flag as contested and escalate to user:

```
CONTESTED DECISION — requires human input
Agent A ([name]): [position + rationale]
Agent B ([name]): [position + rationale]
Evidence: [what each side has]
```

### Rule 3: Security Objections Always Escalate
If the **security agent** or **security-scanner** dissents, their objection is **never auto-resolved**. Security concerns always escalate to the user, regardless of what other agents say.

### Rule 4: Persistent Dissent = Investigate
If the same disagreement pattern appears across **2 or more stories** (e.g., reviewer and coder always disagree on error handling style), this signals a systemic issue. Surface it:

```
PERSISTENT DISSENT DETECTED
Pattern: [reviewer] and [coder] disagree on [topic] in stories [X, Y, Z]
Root cause: Likely a standards gap or ambiguous requirement
Recommendation: Add explicit guidance to CLAUDE.md or project standards
```

---

## Escalation Format

When escalating dissent to the user:

```markdown
## Agent Disagreement — [artifact/file]

### Position A: [Agent Name] — [STATUS]
[1-2 sentence rationale]
Evidence: [tests passing / code analysis / standard reference]

### Position B: [Agent Name] — [STATUS]
[1-2 sentence rationale]
Evidence: [tests failing / security concern / pattern violation]

### Recommendation
[Which side has stronger evidence and why, or "genuinely ambiguous — needs human judgment"]
```

---

## Remember

> "Disagreement between agents is not a bug — it's the system working. Suppress it and you get false confidence."

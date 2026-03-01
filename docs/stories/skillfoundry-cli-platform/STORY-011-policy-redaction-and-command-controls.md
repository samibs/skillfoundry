# STORY-011: Policy Checks, Redaction, and Command Restrictions

**Phase:** 2 — Governance Core
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** L
**Dependencies:** STORY-006
**Affects:** FR-007, FR-031, FR-032

---

## Description

Implement governance enforcement with `sf policy check`, default redaction, and runtime restrictions for shell/network/path operations.

---

## Technical Approach

### Scope

- Implement policy parser/validator and `sf policy check` command.
- Enforce command/path/network allow/deny rules during execution.
- Apply redaction to terminal output and exported artifacts.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/policy.*` | Create policy check command |
| `sf_cli/policy/policy_engine.*` | Create policy evaluation engine |
| `sf_cli/policy/rules.*` | Create command/path/network rule definitions |
| `sf_cli/security/redaction.*` | Create redaction pipeline |
| `sf_cli/execution/guardrails.*` | Integrate runtime enforcement checks |

---

## Acceptance Criteria

```gherkin
Scenario: Policy check reports violations
  Given invalid or conflicting policy rules
  When user runs "sf policy check"
  Then violations are reported with actionable details

Scenario: Disallowed command is blocked
  Given policy denies specific shell command patterns
  When execution requests denied command
  Then run is blocked and violation is logged

Scenario: Redaction masks sensitive output
  Given response contains secret-like token
  When output is rendered or exported
  Then sensitive value is masked
```

---

## Testing

- Unit tests for policy parsing and rule evaluation.
- Integration tests for runtime command/path/network blocking.
- Redaction tests for common key/token patterns.

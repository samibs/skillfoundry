# STORY-012: Budget Controls and Cost Guardrails

**Phase:** 2 — Governance Core
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-010
**Affects:** FR-030

---

## Description

Implement budget enforcement at run and monthly levels so expensive routes can be controlled predictably.

---

## Technical Approach

### Scope

- Add per-run and monthly budget limits in config.
- Track estimated and actual usage cost.
- Block run start when caps are exceeded.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/cost/budget_config.*` | Create budget schema and defaults |
| `sf_cli/cost/budget_engine.*` | Create budget evaluation and blocking logic |
| `sf_cli/cost/usage_tracker.*` | Create usage/cost accounting module |
| `sf_cli/output/cost_summary.*` | Create user-facing cost summaries |

---

## Acceptance Criteria

```gherkin
Scenario: Run blocked when over cap
  Given run budget cap is $1.00
  And estimated run cost exceeds cap
  When user starts command
  Then execution is blocked with budget exceeded reason

Scenario: Monthly cap enforced
  Given monthly usage has reached configured limit
  When user starts a new run
  Then command exits with budget exceeded status

Scenario: Cost summary is visible
  Given a successful run completed
  When output is rendered
  Then estimated and actual cost values are shown
```

---

## Testing

- Unit tests for budget threshold checks.
- Integration tests for blocking behavior and exit codes.
- Cost accounting tests with mixed provider routes.

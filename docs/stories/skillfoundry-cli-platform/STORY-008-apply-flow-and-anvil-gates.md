# STORY-008: Apply Flow with Anvil Gate Enforcement

**Phase:** 1 — Core CLI Foundation
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** XL
**Dependencies:** STORY-007
**Affects:** FR-003, FR-033

---

## Description

Implement `sf apply` so approved plans execute through mandatory Anvil T1-T6 quality gates, aborting safely on failures and emitting structured outcomes.

---

## Technical Approach

### Scope

- Implement `sf apply --plan <id>` execution path.
- Integrate Anvil gates T1-T6 in strict order.
- Abort apply on gate failure with explicit status.
- Emit run-level success/failure summary.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/apply.*` | Create apply command handler |
| `sf_cli/gates/anvil_runner.*` | Create T1-T6 orchestrator |
| `sf_cli/gates/contracts.*` | Create gate result contract types |
| `sf_cli/execution/apply_engine.*` | Create apply orchestrator |

---

## Acceptance Criteria

```gherkin
Scenario: Apply runs all gates on success path
  Given a valid approved plan
  When user runs apply
  Then T1 through T6 execute in order
  And apply completes only if all gates pass

Scenario: Gate failure aborts apply
  Given gate T3 fails during apply
  When gate result is processed
  Then apply stops immediately
  And command exits with gate failure status

Scenario: Apply reports gate outcomes
  Given apply execution completes
  When results are printed/exported
  Then each gate status is included in run summary
```

---

## Testing

- Gate orchestration unit tests (ordering and abort semantics).
- Integration tests for pass/fail gate outcomes.
- Exit-code tests for gate failure mapping.

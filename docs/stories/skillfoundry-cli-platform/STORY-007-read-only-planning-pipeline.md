# STORY-007: Read-Only Planning Pipeline

**Phase:** 1 — Core CLI Foundation
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** L
**Dependencies:** STORY-006
**Affects:** FR-002

---

## Description

Implement `sf plan` as a deterministic, read-only planning path that builds context, invokes routing, and emits a reusable plan ID without writing project files.

---

## Technical Approach

### Scope

- Implement `sf plan "<task>"` command flow.
- Build scoped context for planning input.
- Produce stable plan artifact with unique ID.
- Enforce read-only execution guarantees.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/plan.*` | Create plan command handler |
| `sf_cli/planning/planner.*` | Create planning orchestration |
| `sf_cli/planning/plan_store.*` | Create plan ID persistence layer |
| `sf_cli/execution/read_only_guard.*` | Create no-write enforcement utility |

---

## Acceptance Criteria

```gherkin
Scenario: Plan command returns plan ID
  Given initialized workspace
  When user runs "sf plan \"add provider routing\""
  Then a plan is generated
  And a plan ID is returned

Scenario: Plan flow is read-only
  Given a clean git working tree
  When plan command completes
  Then no source files are modified

Scenario: Plan artifact can be reused
  Given a plan ID exists
  When user later runs apply with that plan ID
  Then apply can load the exact plan artifact
```

---

## Testing

- Unit tests for plan ID generation and storage.
- Integration tests for no-write guard.
- Determinism tests for same-input plan metadata consistency.

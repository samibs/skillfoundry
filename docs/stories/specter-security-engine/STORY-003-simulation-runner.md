# Story: STORY-003 Adversarial Simulation Runner (curl/mock)

**PRD Reference:** 2026-05-05-specter-security-engine.md
**Priority:** MUST
**Phase:** 1
**Status:** DONE

---

## Context

### Why This Story Exists
Identifying a threat is not enough; Specter must attempt to prove it. This story implements the "Simulation Runner" which executes local commands to verify if an attack vector is actually exploitable.

### What Success Looks Like
Specter can execute a `curl` command or a mock script against a local dev server and capture the result as a `SimulationResult`.

### Dependencies
- **Requires:** STORY-002
- **Blocks:** STORY-004

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Implementation Notes |
|----|-------------|---------------------|
| FR-001 | Command Execution | Safely execute simulation commands (curl, script). |
| FR-002 | Result Parsing | Parse stdout/stderr to determine if the attack "succeeded" (e.g., 200 OK when 403 expected). |
| FR-003 | Sandbox Safety | Ensure simulations only run against localhost/test environments. |

---

## Expected Changes (Anvil T4)
- **Modify**: [`sf_cli/src/core/specter.ts`, `sf_cli/src/core/executor.ts`]
- **Create**: [`sf_cli/src/core/__tests__/specter-sim.test.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Adversarial Simulation

  Scenario: Proven vulnerability
    Given an AttackVector with a curl command
    When the SimulationRunner executes it
    And the response matches the "success" criteria of the attack
    Then the SimulationResult is marked as "EXPLOITED"
```

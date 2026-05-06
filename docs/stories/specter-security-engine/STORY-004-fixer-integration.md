# Story: STORY-004 Specter-Fixer Integration & Hardening Loop

**PRD Reference:** 2026-05-05-specter-security-engine.md
**Priority:** MUST
**Phase:** 1
**Status:** DONE

---

## Context

### Why This Story Exists
This story closes the loop. When Specter finds a vulnerability, it must trigger the `fixer` to harden the code, and then re-verify until the threat is mitigated.

### What Success Looks Like
A proven exploit in Specter automatically triggers a new `fixer` iteration with the exploit trace as input.

### Dependencies
- **Requires:** STORY-003
- **Blocks:** None

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Implementation Notes |
|----|-------------|---------------------|
| FR-001 | Fixer Handoff | Pass `SimulationResult` and `AttackVector` to the `RemediationEngine`. |
| FR-002 | Iterative Hardening | Allow up to 3 hardening attempts per vector. |
| FR-003 | Final Sign-off | Mark Specter gate as PASS only when all "High" vectors are mitigated. |

---

## Expected Changes (Anvil T4)
- **Modify**: [`sf_cli/src/core/pipeline.ts`, `sf_cli/src/core/remediation-engine.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Hardening Loop

  Scenario: Automatic remediation
    Given Specter found an "EXPLOITED" vulnerability
    When the Pipeline dispatches the Fixer
    Then the Fixer receives the exploit trace
    And a second Specter run marks the vector as "MITIGATED"
```

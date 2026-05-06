# Story: STORY-001 Implement Core Specter Engine Infrastructure

**PRD Reference:** 2026-05-05-specter-security-engine.md
**Priority:** MUST
**Phase:** 1
**Status:** DONE
**Assignee:** Unassigned

---

## Context

### Why This Story Exists
We need the base infrastructure for the Specter engine to reside in the `sf_cli` core. This story sets up the classes, types, and registration necessary for Specter to be triggered during the Forge pipeline.

### What Success Looks Like
A `SpecterEngine` class exists in `sf_cli/src/core/specter.ts` with basic lifecycle methods (initialize, analyze, signoff) and is registered in the `AgentRegistry`.

### Dependencies
- **Requires:** None
- **Blocks:** STORY-002, STORY-003, STORY-004

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Implementation Notes |
|----|-------------|---------------------|
| FR-001 | Specter Core Class | Create `SpecterEngine` in `sf_cli/src/core/specter.ts`. |
| FR-002 | Type Definitions | Define `AttackVector`, `SimulationResult`, and `SpecterReport` interfaces. |
| FR-003 | Pipeline Hook | Add `Specter` to the `AgentPool` and `Pipeline` stages. |

### Technical Approach

#### Architecture
Specter will be a core service similar to `CheckovScanner` but with a higher-level "Red Team" persona.

```
sf_cli/src/core/
├── specter.ts (New)
└── agent-registry.ts (Modify)
```

#### Key Implementation Details
1. Define `SpecterEngine` class extending `BaseAgent` (or similar pattern in `sf_cli`).
2. Implement `analyze(context: Context): Promise<SpecterReport>`.
3. Integrate into `Pipeline.ts` before the final `Finisher` stage.

#### Code Patterns to Follow
Follow `sf_cli/src/core/checkov-scanner.ts` for tool-based scanning integration and `sf_cli/src/core/agent.ts` for agent lifecycle.

---

## Expected Changes (Anvil T4)

Files this story should create or modify:
- **Create**: [`sf_cli/src/core/specter.ts`, `sf_cli/src/core/__tests__/specter.test.ts`]
- **Modify**: [`sf_cli/src/core/agent-registry.ts`, `sf_cli/src/core/pipeline.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Core Specter Engine

  Scenario: Specter is initialized and registered
    Given the SF CLI is initializing
    When the AgentRegistry is loaded
    Then "specter" is a registered agent
    And the SpecterEngine is available in the AgentPool

  Scenario: Specter report generation
    Given a mock project context
    When I call specter.analyze()
    Then a SpecterReport is returned
    And the report status is "DRAFT"
```

---

## Testing Requirements

### Unit Tests
- [ ] `SpecterEngine` initialization.
- [ ] `AgentRegistry` correctly includes `specter`.
- [ ] `analyze` method returns a valid `SpecterReport` structure.

---

## Definition of Done

- [ ] `SpecterEngine` implemented in TypeScript.
- [ ] Interfaces for vectors and simulations defined.
- [ ] All unit tests passing.
- [ ] No banned patterns (TODO/FIXME).

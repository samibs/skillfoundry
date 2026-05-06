# Story: STORY-002 Speculative Threat Generator (Red Team Agent)

**PRD Reference:** 2026-05-05-specter-security-engine.md
**Priority:** MUST
**Phase:** 1
**Status:** DONE

---

## Context

### Why This Story Exists
The heart of Specter is its ability to think like an attacker. This story implements the generative component that analyzes code changes and proposes specific attack vectors.

### What Success Looks Like
Specter can generate at least 3 distinct `AttackVector` objects for a given set of `git diff` changes, specifically targeting logical flaws (e.g., "Bypass auth in X", "Inject Y into Z").

### Dependencies
- **Requires:** STORY-001
- **Blocks:** STORY-003, STORY-004

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Implementation Notes |
|----|-------------|---------------------|
| FR-001 | Diff Analysis | Parse `git diff` to identify sensitive code areas (auth, db, forms). |
| FR-002 | Speculative Generation | Use an LLM call with a "Red Team" prompt to generate vectors. |
| FR-003 | Vector Scoring | Score vectors by likelihood and impact (High/Med/Low). |

### Technical Approach

#### Architecture
This story focuses on the logic inside `SpecterEngine.generateVectors()`.

#### Key Implementation Details
1. Create a specialized prompt in `sf_cli/src/prompts/specter-red-team.md`.
2. Implement `generateVectors(diff: string, prd: string): Promise<AttackVector[]>`.
3. Ensure the LLM output is parsed into the structured `AttackVector` interface.

---

## Expected Changes (Anvil T4)
- **Create**: [`sf_cli/src/prompts/specter-red-team.md`]
- **Modify**: [`sf_cli/src/core/specter.ts`]

---

## Acceptance Criteria

```gherkin
Feature: Speculative Threat Generation

  Scenario: Generate vectors for auth changes
    Given a diff modifying "auth.ts"
    When Specter analyzes the diff
    Then at least 3 AttackVectors are generated
    And at least one vector targets "Authorization Bypass" or similar
```

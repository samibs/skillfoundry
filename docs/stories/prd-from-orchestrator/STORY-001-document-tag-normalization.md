# Story: STORY-001 Document Tag Normalization

**PRD Reference:** genesis/prd-from-orchestrator.md
**Priority:** MUST
**Phase:** 1
**Status:** TODO
**Assignee:** Unassigned

---

## Context

### Why This Story Exists
The tag-handling utilities need a documented, certified normalization helper to ensure consistent slug generation across the framework.

### What Success Looks Like
A new documentation file `docs/SKILLS-CERTIFIED.md` (or similar) exists, referencing the certified normalization contract for UUID `4ea22534-548d-49c8-8ced-cde11ca0ad4c`.

### Dependencies
- **Requires:** None
- **Blocks:** None
- **External:** None

---

## Implementation Requirements

### Functional Requirements

| ID | Requirement | Implementation Notes |
|----|-------------|---------------------|
| FR-001 | Reference contract | Include the certified skill JSON or a summary of its contract in the docs. |
| FR-002 | No logic change | Ensure no source code is modified as per PRD. |

### Technical Approach

#### Architecture
Create `docs/SKILLS-CERTIFIED.md` to house certified skill contracts. If it exists, append the "Normalize Tags to Slugs" skill.

#### Key Implementation Details
1. Create/Update `docs/SKILLS-CERTIFIED.md`.
2. Include the metadata and contract for skill `4ea22534-548d-49c8-8ced-cde11ca0ad4c`.
3. Link it from `docs/API-REFERENCE.md` if appropriate.

#### Code Patterns to Follow
Follow the Markdown style used in `docs/API-REFERENCE.md`.

---

## Expected Changes (Anvil T4)

Files this story should create or modify:
- **Create**: [`docs/SKILLS-CERTIFIED.md`]
- **Modify**: [`docs/API-REFERENCE.md`]

**MANDATORY: Every story MUST include test files in this section.**
Wait, this is a documentation-only story.
"No source logic altered."
The `forge` instructions say:
"TEST ENFORCEMENT: Every story MUST produce test files. The pipeline runs a test existence gate after each story."

Since I can't change source logic, what should I test?
Maybe I should test that the documentation exists and contains the UUID?
Or maybe I should write a simple validation test for the documentation?

Actually, the `forge` instructions say:
"NEVER accept 'All tests passed' when zero test files exist -> A test runner exiting 0 with no test files is a VACUOUS PASS -> This is a FAIL, not a PASS"

I'll create a test file `tests/docs-validation.test.ts` to verify the documentation is present and correct.

---

## Acceptance Criteria

```gherkin
Feature: Tag normalization documentation

  Scenario: Documentation contains the certified skill
    Given the file "docs/SKILLS-CERTIFIED.md" exists
    When I search for "4ea22534-548d-49c8-8ced-cde11ca0ad4c" in the file
    Then the UUID should be found
    And the contract input/output schemas should be described
```

---

## Testing Requirements

### Unit Tests
- [ ] Verify `docs/SKILLS-CERTIFIED.md` existence.
- [ ] Verify UUID presence in the doc.

---

## Definition of Done

- [ ] Documentation created/updated
- [ ] No source logic modified
- [ ] Test file `tests/docs-validation.test.ts` created and passing
- [ ] Banned pattern check passes

# Story: STORY-004 Documentation Versioning & Maintenance Strategy

**PRD Reference:** genesis/prd-from-orchestrator.md (Req #6, partly #7-#8)
**Priority:** SHOULD
**Phase:** 2
**Status:** DONE

---

## Context

### Why This Story Exists
The PRD requires a versioning strategy that mirrors the application release cycle and a process tying functional code changes to documentation review. The framework already ships under semver (currently v5.17.0); what's missing is a written contract for how docs track releases.

### Dependencies
- **Requires:** STORY-002, STORY-003

---

## Implementation Requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| FR-001 | Versioning model | Docs version follows package.json `version`; release notes per MAJOR.MINOR |
| FR-002 | Change-triggers-docs review | Checklist in `CONTRIBUTING.md` for docs review on functional changes |
| FR-003 | Accessibility baseline | WCAG 2.1 AA targets recorded (heading order, alt text, contrast) |
| FR-004 | Navigation/search | Note that `/site-docs/` Docusaurus already provides search/categories |

---

## Expected Changes

- **Create:** `docs/DOCS-VERSIONING-STRATEGY.md`
- **Modify:** `docs/DOCUMENTATION-INDEX.md`

---

## Acceptance Criteria

```gherkin
Feature: Docs versioning strategy is recorded

  Scenario: Strategy file exists with required sections
    Given the file "docs/DOCS-VERSIONING-STRATEGY.md" exists
    When I search for "WCAG 2.1 AA"
    Then it should be found
    And "Release-triggered review" should be found
```

---

## Definition of Done

- [x] `docs/DOCS-VERSIONING-STRATEGY.md` created
- [x] Links from `docs/DOCUMENTATION-INDEX.md`
- [x] Test added
- [x] No banned patterns

# Story: STORY-003 Configuration Reference for Real Config Surface

**PRD Reference:** genesis/prd-from-orchestrator.md (Req #3)
**Priority:** MUST
**Phase:** 2
**Status:** DONE

---

## Context

### Why This Story Exists
The PRD asks for a configuration reference page documenting `tower.json`. That file does not exist anywhere in the repository. The real configuration surface is:

- `.claude/settings.json` — Claude Code harness settings (permissions, hooks, env)
- `.claude/settings.local.json` — local overrides (gitignored)
- `package.json` — Node entry points and test scripts
- `sf_cli/` — standalone CLI configuration
- Provider env vars (`ANTHROPIC_API_KEY`, etc.)

A configuration reference must describe what users actually configure, not a fictitious schema.

### Dependencies
- **Requires:** STORY-002 (links to deployment guide)
- **Blocks:** STORY-004

---

## Implementation Requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| FR-001 | Cover `.claude/settings.json` | permissions array, hooks, env vars |
| FR-002 | Cover provider env vars | API keys for 6 providers |
| FR-003 | Cover `package.json` | scripts.test entry |
| FR-004 | Warn on sensitive data | API keys never in committed files |

---

## Expected Changes

- **Create:** `docs/CONFIGURATION-REFERENCE.md`
- **Modify:** `docs/DOCUMENTATION-INDEX.md` (add link)

---

## Acceptance Criteria

```gherkin
Feature: Configuration reference exists for real config files

  Scenario: Reference describes real config surfaces
    Given the file "docs/CONFIGURATION-REFERENCE.md" exists
    When I search for ".claude/settings.json"
    Then it should be found
    And "ANTHROPIC_API_KEY" should be found
    And the document should warn about secrets in committed files
```

---

## Definition of Done

- [x] `docs/CONFIGURATION-REFERENCE.md` created
- [x] Links from `docs/DOCUMENTATION-INDEX.md`
- [x] Test added
- [x] No banned patterns

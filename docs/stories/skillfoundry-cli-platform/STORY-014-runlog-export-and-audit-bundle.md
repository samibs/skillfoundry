# STORY-014: Runlog Export and Audit Bundle Contract

**Phase:** 3 — Learning Loop
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-007, STORY-008
**Affects:** FR-009

---

## Description

Implement immutable run-bundle exports so each completed run has reproducible evidence including plan details, commands, diffs, tests, and outcomes.

---

## Technical Approach

### Scope

- Implement `sf runlog export --run <id> [--out <path>]`.
- Define runlog schema for portable audit artifacts.
- Ensure run bundles are immutable once finalized.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/runlog.*` | Create runlog export command |
| `sf_cli/runlog/schema.*` | Create runlog artifact schema |
| `sf_cli/runlog/exporter.*` | Create export pipeline |
| `sf_cli/runlog/immutability.*` | Create immutability enforcement checks |

---

## Acceptance Criteria

```gherkin
Scenario: Export run bundle by run ID
  Given a completed run exists
  When user runs "sf runlog export --run <id>"
  Then run artifact is exported successfully

Scenario: Bundle includes required evidence sections
  Given run bundle is exported
  When artifact is validated
  Then it includes plan metadata, commands, diffs, tests, and final status

Scenario: Finalized run bundle is immutable
  Given run bundle is finalized
  When modification is attempted through CLI
  Then mutation is denied and logged
```

---

## Testing

- Schema validation tests for exported bundles.
- Integrity tests for immutable artifact behavior.
- Integration tests for custom output paths.

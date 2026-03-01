# STORY-003: Diff Preview and Apply Approval Checkpoint

**Phase:** 4 — Interactive TUI Shell + UX Hardening
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001
**Affects:** FR-053

---

## Description

Add an inline diff/patch preview flow before apply, with explicit approval controls. This provides the same high-trust checkpoint users expect from top coding CLIs while preserving deterministic safety in SkillFoundry.

---

## Technical Approach

### Scope

- Generate colorized unified diffs for pending changes.
- Render diff in center pane with navigation controls.
- Gate apply behind explicit approval action.
- Provide reject/defer options without losing plan state.

### Implementation notes

- Build a `DiffModel` that includes file path, hunk metadata, and change statistics.
- Separate diff generation from rendering to support both TUI and line mode.
- Approval checkpoint must write an auditable decision event into run logs.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/diff/diff_service.*` | Create diff generation service |
| `sf_cli/ui/diff/diff_view.*` | Create colorized diff viewer |
| `sf_cli/ui/checkpoint/approval_dialog.*` | Create apply approval interaction |
| `sf_cli/orchestrator/apply_flow.*` | Modify apply to enforce approval gate |
| `sf_cli/runlog/events.*` | Modify runlog schema with approval decision event |

---

## Acceptance Criteria

```gherkin
Scenario: Diff preview is shown before apply
  Given a plan produces file changes
  When user initiates apply
  Then a colorized diff preview is displayed before execution continues

Scenario: Approval required for apply
  Given a diff preview is open
  When the user has not approved
  Then apply execution cannot proceed

Scenario: Approval event is auditable
  Given user approves or rejects at checkpoint
  When decision is made
  Then run log stores decision type, timestamp, and actor context

Scenario: User defers apply
  Given a pending plan with diff preview
  When user selects defer
  Then plan remains available for future apply
  And no file writes are performed
```

---

## Security Checklist

- [ ] Diff output redacts known secret patterns before display/export
- [ ] Binary files are summarized, not dumped as raw content
- [ ] Approval decision cannot be bypassed via UI shortcut or race condition

---

## Testing

- Unit tests for diff generation and large-file handling.
- Integration tests for apply-block-until-approval behavior.
- Runlog schema tests for checkpoint decision events.
- Performance test for <=500-line diff render target.

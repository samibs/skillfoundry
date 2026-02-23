# STORY-001: TUI Shell Foundation and Three-Pane Layout

**Phase:** 4 — Interactive TUI Shell + UX Hardening
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** L
**Dependencies:** None
**Affects:** FR-050, FR-051, FR-057

---

## Description

Implement the foundational interactive shell for `sf` so the CLI can launch into a full-screen TUI with a stable three-pane layout and consistent visual semantics. This is the baseline required before timeline, diff, and advanced interaction stories can be layered in.

---

## Technical Approach

### Scope

- Add interactive launch behavior when `sf` is invoked without subcommands.
- Implement three-pane layout contract:
  - Left: navigation, modes, run history
  - Center: activity stream and active workflow view
  - Right: provider route, policy state, budget, memory hits
- Define design tokens for spacing and status color semantics.
- Implement fallback to line mode when full-screen rendering is unavailable.

### Implementation notes

- Keep UI framework behind an adapter (`TuiRenderer`) so runtime choice (Go Bubble Tea or Python Textual) does not leak into command handlers.
- Add a `UiState` model with explicit sections: `navigation`, `activity`, `context`, `status_bar`.
- Centralize color/status mapping in one module to avoid per-view drift.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/ui/tui_shell.*` | Create full-screen shell entrypoint |
| `sf_cli/ui/layout/three_pane.*` | Create base layout renderer |
| `sf_cli/ui/theme/tokens.*` | Create visual token definitions |
| `sf_cli/ui/state/ui_state.*` | Create shared UI state model |
| `sf_cli/commands/root.*` | Modify default launch routing |
| `sf_cli/ui/line_mode_fallback.*` | Create fallback renderer |

---

## Acceptance Criteria

```gherkin
Scenario: Interactive launch opens full-screen TUI
  Given the user runs "sf" with no subcommand
  When terminal capabilities support full-screen mode
  Then the TUI shell opens with left, center, and right panes visible

Scenario: Three-pane layout persists across views
  Given the user navigates between home, plan, and chat views
  When each view renders
  Then pane structure remains stable and only pane content updates

Scenario: Visual semantics are consistent
  Given statuses "success", "warning", and "error"
  When rendered in any view
  Then they use shared theme tokens from a single source module

Scenario: Fallback line mode activates automatically
  Given the terminal does not support full-screen rendering
  When "sf" launches
  Then line mode is used
  And core workflow information remains visible
```

---

## Security Checklist

- [ ] No API keys or secrets rendered in any pane
- [ ] Redaction rules applied to context pane values
- [ ] Run history does not expose sensitive command arguments by default

---

## Testing

- Launch `sf` with/without subcommand and verify routing behavior.
- Snapshot tests for pane structure across required views.
- Token consistency tests for status-to-color mapping.
- Capability test for fallback line-mode activation.

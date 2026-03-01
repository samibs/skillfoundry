# STORY-004: Keyboard-First Command Palette and Shortcuts

**Phase:** 4 — Interactive TUI Shell + UX Hardening
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001
**Affects:** FR-054

---

## Description

Implement a keyboard-first interaction layer to make core workflows fast and consistent with best-in-class coding CLIs. The goal is full keyboard coverage for high-frequency actions without requiring mouse interaction.

---

## Technical Approach

### Scope

- Implement command palette (`Ctrl+P`) for discoverable actions.
- Implement required shortcuts from PRD:
  - `Ctrl+R`: provider/route switcher
  - `Ctrl+L`: memory/lesson lookup
  - `Ctrl+A`: apply checkpoint action
  - `Ctrl+J/K`: timeline navigation
- Add shortcut help overlay and conflict-safe keymap resolution.

### Implementation notes

- Centralize bindings in `KeymapRegistry` with context-aware handlers.
- Keep shortcut actions idempotent where applicable (especially `Ctrl+A`).
- Support key rebinding via config file for terminal compatibility.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/ui/input/keymap_registry.*` | Create shortcut registry and dispatcher |
| `sf_cli/ui/palette/command_palette.*` | Create command palette view and filter |
| `sf_cli/ui/overlays/shortcut_help.*` | Create keyboard help overlay |
| `sf_cli/config/ui_keybindings.*` | Create configurable keybinding schema |
| `sf_cli/ui/controllers/*. *` | Modify controllers to expose actions to keymap |

---

## Acceptance Criteria

```gherkin
Scenario: Command palette opens and executes action
  Given the user is in interactive mode
  When they press Ctrl+P
  Then command palette opens
  And selected action executes successfully

Scenario: Provider switch shortcut works
  Given interactive mode is active
  When user presses Ctrl+R
  Then provider route switcher opens
  And selected route is applied to current session

Scenario: Memory lookup shortcut works
  Given interactive mode is active
  When user presses Ctrl+L
  Then memory/lesson lookup opens with current context query prefilled

Scenario: Timeline navigation works via keyboard
  Given timeline has multiple entries
  When user presses Ctrl+J or Ctrl+K
  Then focus moves through timeline entries without mouse input
```

---

## Security Checklist

- [ ] Shortcut actions honor policy restrictions (no privileged bypass)
- [ ] Keybinding config validation rejects unsafe/unrecognized action IDs
- [ ] Command palette redacts sensitive command arguments in history list

---

## Testing

- Keyboard event unit tests for each required shortcut.
- Palette filtering tests (fuzzy match and deterministic ordering).
- Accessibility test for keyboard-only completion of plan/apply flow.
- Regression test for keybinding conflicts and rebind behavior.

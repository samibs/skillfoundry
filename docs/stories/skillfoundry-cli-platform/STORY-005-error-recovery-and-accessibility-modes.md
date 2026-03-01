# STORY-005: Error Recovery UX and Accessibility Modes

**Phase:** 4 — Interactive TUI Shell + UX Hardening
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-002, STORY-003
**Affects:** FR-056, FR-058

---

## Description

Implement structured error and recovery UX plus terminal accessibility modes to ensure the CLI is usable, recoverable, and inclusive under real-world failure conditions.

---

## Technical Approach

### Scope

- Define error card patterns for provider failure, policy block, gate failure, and budget cap.
- Provide next-step actions per error type: retry, fallback route, open logs, edit policy.
- Add `--high-contrast` mode with explicit non-color indicators.
- Add `--reduced-motion` mode with static updates (no animated transitions).
- Ensure line mode output preserves the same recovery actions and meaning.

### Implementation notes

- Normalize errors into `UiErrorModel` with `category`, `message`, `recovery_actions`, `reference_id`.
- Keep recovery action handlers pure and auditable (every retry/fallback action logged).
- Accessibility flags must be available in config and runtime flags.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/ui/errors/error_presenter.*` | Create structured error rendering |
| `sf_cli/ui/errors/recovery_actions.*` | Create actionable recovery handler module |
| `sf_cli/ui/theme/accessibility.*` | Create high-contrast and reduced-motion profiles |
| `sf_cli/config/ui_accessibility.*` | Add accessibility config schema |
| `sf_cli/ui/line_mode_fallback.*` | Modify fallback output to include recovery actions |
| `sf_cli/runlog/events.*` | Modify runlog to capture recovery action invocations |

---

## Acceptance Criteria

```gherkin
Scenario: Provider failure shows actionable recovery options
  Given provider request fails
  When error is rendered
  Then user sees retry and fallback actions
  And selecting an action triggers the corresponding flow

Scenario: Policy block is explicit and recoverable
  Given a command is blocked by policy
  When error is shown
  Then blocked rule and remediation path are shown
  And user can open policy location from the UI

Scenario: High-contrast mode avoids color-only meaning
  Given high-contrast mode is enabled
  When statuses and errors are rendered
  Then textual symbols/labels communicate status independent of color

Scenario: Reduced-motion mode disables animated updates
  Given reduced-motion mode is enabled
  When timeline or state changes occur
  Then UI updates without animation and preserves readability
```

---

## Security Checklist

- [ ] Error rendering never leaks secrets or stack traces in non-debug mode
- [ ] Recovery actions cannot bypass checkpoint/policy constraints
- [ ] Accessibility flags cannot disable redaction or safety controls

---

## Testing

- Error-model mapping tests for provider/policy/gate/budget classes.
- Recovery action integration tests with runlog evidence.
- Accessibility tests for high-contrast and reduced-motion modes.
- Snapshot tests for line-mode parity with TUI recovery messaging.

# STORY-002: Streaming Timeline and Conversation/Command Dual Mode

**Phase:** 4 — Interactive TUI Shell + UX Hardening
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001
**Affects:** FR-052, FR-055

---

## Description

Implement live execution streaming for `plan`/`apply` phases and add a dual-mode input system so users can switch between conversational interaction and structured command entry without losing context.

---

## Technical Approach

### Scope

- Add timeline event stream with explicit states: `queued`, `running`, `pass`, `fail`, `skipped`.
- Render phase updates in center pane with incremental updates.
- Add input modes:
  - `Command` mode (`sf>`): structured CLI actions
  - `Chat` mode (`you>`): conversational queries
- Preserve route, plan, and selection context while switching modes.

### Implementation notes

- Introduce `TimelineEvent` schema with timestamp, stage, status, and payload.
- Use event bus/pub-sub channel for UI updates from orchestration engine.
- Keep mode switching in a dedicated state controller (`InputModeController`) to avoid per-view duplication.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/ui/timeline/event_bus.*` | Create event transport for streaming updates |
| `sf_cli/ui/timeline/timeline_view.*` | Create timeline renderer |
| `sf_cli/ui/input/mode_controller.*` | Create dual-mode state controller |
| `sf_cli/ui/input/prompt_bar.*` | Modify prompt rendering for `sf>` and `you>` |
| `sf_cli/orchestrator/events.*` | Modify orchestrator to emit UI timeline events |

---

## Acceptance Criteria

```gherkin
Scenario: Plan emits live phase updates
  Given a user runs "sf plan \"task\"" in interactive mode
  When plan phases execute
  Then timeline entries update in real time with queued/running/pass/fail states

Scenario: Apply emits gate-by-gate timeline
  Given a user runs apply on an approved plan
  When T1-T6 gates execute
  Then each gate appears as a separate timeline event with status and timestamp

Scenario: User switches from command to chat mode
  Given a user is in command mode with an active plan context
  When they toggle to chat mode
  Then prompt changes to "you>"
  And active plan context remains available

Scenario: User switches back from chat to command mode
  Given a user is in chat mode
  When they toggle to command mode
  Then prompt changes to "sf>"
  And no timeline state is lost
```

---

## Security Checklist

- [ ] Timeline payloads pass redaction before render
- [ ] Chat mode output respects policy constraints identical to command mode
- [ ] No internal stack traces shown unless debug mode is explicitly enabled

---

## Testing

- Event ordering tests for timeline stream.
- UI rendering tests for all timeline statuses.
- Mode-toggle state retention tests.
- End-to-end test: `plan -> chat question -> apply` without context loss.

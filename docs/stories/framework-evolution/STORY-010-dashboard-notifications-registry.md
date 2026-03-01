# STORY-010: Dashboard, Notifications, Registry

## Goal
Ship real-time observability and project fleet visibility.

## PRD Mapping
- FR-026
- FR-028
- FR-037

## Tasks
- Ensure `scripts/dashboard.sh` reflects queue, cost, and escalation state.
- Add notification hook execution points for completion/escalation.
- Harden `scripts/registry.sh dashboard` with health/version columns.

## Acceptance Criteria
- Dashboard refreshes in-place with current execution state.
- Notification hooks fire at expected milestones.
- Registry dashboard shows all registered projects with health summary.

## Tests
- Dashboard read-state smoke test.
- Notification hook invocation test.
- Registry output contract test.

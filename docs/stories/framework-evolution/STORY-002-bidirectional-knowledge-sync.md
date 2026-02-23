# STORY-002: Bidirectional Knowledge Sync

## Goal
Support push/pull sync between framework bootstrap and project memory.

## PRD Mapping
- FR-002
- FR-007

## Tasks
- Wire `scripts/memory.sh sync` to execute pull then push.
- Enforce scope-aware routing (`project` vs `universal`).
- Emit sync summary (pulled/pushed/skipped/conflicts).

## Acceptance Criteria
- Sync pulls central additions into project memory.
- Sync pushes eligible project learnings to framework store.
- Output reports deterministic counts.

## Tests
- Sync dry integration with fixture repos.
- Scope-tag assertion tests.

# STORY-004: Escalation Auto-Capture

## Goal
Automatically persist escalation decisions into project knowledge.

## PRD Mapping
- FR-005

## Tasks
- Add capture hook for escalation responses.
- Write normalized decision entries with lineage metadata.
- Add optional reviewer annotations.

## Acceptance Criteria
- Escalation answer creates a decision entry without manual action.
- Captured entries include timestamp, agent, and context summary.

## Tests
- Hook-level test simulating escalation flow.
- Entry schema validation test.

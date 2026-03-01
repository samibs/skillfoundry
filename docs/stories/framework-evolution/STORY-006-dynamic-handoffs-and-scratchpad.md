# STORY-006: Dynamic Handoffs and Scratchpad

## Goal
Enable immediate mid-flow handoffs and inter-agent notes.

## PRD Mapping
- FR-011
- FR-012

## Tasks
- Implement handoff metadata contract between agent roles.
- Harden `parallel/swarm-scratchpad.sh` read/unread semantics.
- Add timeline notes for handoff events.

## Acceptance Criteria
- Tester can begin on completed sub-unit before full wave completion.
- Scratchpad notes are visible to downstream agents with ack state.

## Tests
- Handoff scenario test (coder to tester).
- Scratchpad unread/read lifecycle test.

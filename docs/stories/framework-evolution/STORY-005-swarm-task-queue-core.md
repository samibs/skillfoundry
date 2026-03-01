# STORY-005: Swarm Task Queue Core

## Goal
Provide shared queue primitives and agent availability pool.

## PRD Mapping
- FR-010
- FR-017

## Tasks
- Finalize queue state machine transitions in `parallel/swarm-queue.sh`.
- Implement robust claim/release/complete operations.
- Persist pool state for active/idle agents.

## Acceptance Criteria
- Multiple agents can pull independent tasks without collision.
- Queue state remains consistent after interruption.

## Tests
- Concurrent claim stress test.
- Recovery test from interrupted queue writes.

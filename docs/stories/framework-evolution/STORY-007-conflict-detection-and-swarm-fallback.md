# STORY-007: Conflict Detection and Swarm Fallback

## Goal
Detect write conflicts and auto-fallback to wave mode on coordination failure.

## PRD Mapping
- FR-014
- FR-015
- FR-016

## Tasks
- Enforce conflict checks before write lock acquisition.
- Add fallback trigger path and transition log.
- Expose fallback status in swarm/dashboard output.

## Acceptance Criteria
- Concurrent write conflict pauses one path and reports actionable context.
- Failed swarm coordination falls back automatically to wave mode.

## Tests
- Simulated concurrent write conflict test.
- Swarm failure injection with verified fallback.

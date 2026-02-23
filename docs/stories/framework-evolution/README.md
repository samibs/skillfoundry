# Framework Evolution Stories

Source PRD: `genesis/2026-02-07-framework-evolution.md`

## Story Map

- STORY-001: Knowledge Harvest Engine (FR-001, FR-006)
- STORY-002: Bidirectional Knowledge Sync (FR-002, FR-007)
- STORY-003: Dedup + Promotion Pipeline (FR-003, FR-004)
- STORY-004: Escalation Auto-Capture (FR-005)
- STORY-005: Swarm Task Queue Core (FR-010, FR-017)
- STORY-006: Dynamic Handoffs + Shared Scratchpad (FR-011, FR-012)
- STORY-007: Conflict Detection + Swarm Fallback (FR-014, FR-015, FR-016)
- STORY-008: Dry Run + Review Only Modes (FR-020, FR-021)
- STORY-009: Explain/Undo/Health + Cost Integration (FR-022, FR-023, FR-024, FR-025)
- STORY-010: Live Dashboard + Notifications + Registry (FR-026, FR-028, FR-037)
- STORY-011: Incremental Execution + PRD Diffing + Semantic Search (FR-027, FR-030, FR-039)
- STORY-012: Compliance Presets + Secret Scan + Monorepo + Metrics + Templates (FR-031..FR-036, FR-038, FR-040)

## Dependency Graph

- STORY-001 -> STORY-002 -> STORY-003 -> STORY-004
- STORY-005 -> STORY-006 -> STORY-007
- STORY-001 -> STORY-008 -> STORY-009 -> STORY-010
- STORY-003 -> STORY-011 -> STORY-012
- STORY-007 -> STORY-012
- STORY-010 -> STORY-012

## Execution Waves

- Wave A: STORY-001, STORY-005
- Wave B: STORY-002, STORY-006, STORY-008
- Wave C: STORY-003, STORY-007, STORY-009
- Wave D: STORY-004, STORY-010, STORY-011
- Wave E: STORY-012

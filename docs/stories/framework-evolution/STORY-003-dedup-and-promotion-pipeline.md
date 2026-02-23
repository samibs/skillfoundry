# STORY-003: Dedup and Promotion Pipeline

## Goal
Promote repeated high-value entries to universal stores and prevent duplicates.

## PRD Mapping
- FR-003
- FR-004

## Tasks
- Implement signature-based dedup key strategy.
- Track `promotion_count` and threshold policy.
- Add review queue output for near-threshold entries.

## Acceptance Criteria
- Duplicate entries across projects collapse to one universal entry.
- Entries with 3+ occurrences or weight > 0.8 are promoted.
- Promotion results are audit-logged.

## Tests
- Multi-project fixture test for promotion threshold.
- Dedup false-negative regression tests.

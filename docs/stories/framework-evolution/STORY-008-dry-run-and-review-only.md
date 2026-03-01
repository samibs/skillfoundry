# STORY-008: Dry Run and Review Only

## Goal
Support simulation-only and audit-only execution modes.

## PRD Mapping
- FR-020
- FR-021

## Tasks
- Add `/go --dry-run` execution branch with no file writes.
- Add `/go --review-only` branch for quality audit pipeline.
- Return plan/report artifacts with stable output shape.

## Acceptance Criteria
- Dry run prints planned stories/agents/files without modifying workspace.
- Review-only runs validators and emits findings report.

## Tests
- Dry-run filesystem mutation guard test.
- Review-only report contract test.

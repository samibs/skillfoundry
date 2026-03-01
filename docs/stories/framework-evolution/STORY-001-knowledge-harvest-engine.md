# STORY-001: Knowledge Harvest Engine

## Goal
Implement project-to-framework harvest of decisions/errors/patterns with scope tagging.

## PRD Mapping
- FR-001
- FR-006

## Tasks
- Extend `scripts/harvest.sh` to support structured extraction with `scope` field.
- Integrate harvest step in `update.sh --all` path.
- Add idempotent merge behavior for central JSONL files.

## Acceptance Criteria
- Running harvest on a project appends new entries to central knowledge.
- Running harvest twice does not duplicate identical entries.
- `update.sh --all` performs harvest before update push.

## Tests
- Harvest unit smoke for each category file.
- Integration run verifying no duplicate append on rerun.

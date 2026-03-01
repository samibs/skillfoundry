# STORY-011: Incremental Execution, PRD Diff, Semantic Search

## Goal
Execute only impacted stories and improve retrieval via semantic search.

## PRD Mapping
- FR-027
- FR-030
- FR-039

## Tasks
- Implement impacted-story selection by changed files/PRD deltas.
- Add PRD diff summarizer that maps edits to affected stories.
- Integrate semantic search command path for knowledge lookup.

## Acceptance Criteria
- Incremental run skips unaffected completed stories.
- PRD diff output lists impacted stories with reason.
- Semantic search returns ranked relevant entries.

## Tests
- Impacted-story selection test with fixture diffs.
- PRD diff mapping regression test.
- Semantic search relevance smoke.

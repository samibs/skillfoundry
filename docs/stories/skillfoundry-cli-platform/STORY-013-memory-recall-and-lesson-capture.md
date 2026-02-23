# STORY-013: Memory Recall and Lesson Capture Commands

**Phase:** 3 — Learning Loop
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** L
**Dependencies:** STORY-006, STORY-014
**Affects:** FR-008, FR-040, FR-041

---

## Description

Implement memory-native workflows that retrieve relevant prior knowledge for planning and persist lessons from completed runs.

---

## Technical Approach

### Scope

- Implement `sf memory recall "<query>"` retrieval command.
- Implement `sf memory record --from-run <id>` linkage command.
- Implement `sf lessons capture --from-run <id>` extraction and persistence.
- Integrate memory recall into plan pre-context path.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/memory.*` | Create recall and record command handlers |
| `sf_cli/commands/lessons.*` | Create lesson capture command handler |
| `sf_cli/memory/retriever.*` | Create retrieval and ranking module |
| `sf_cli/memory/lesson_extractor.*` | Create run-to-lesson extraction logic |
| `sf_cli/planning/context_builder.*` | Inject memory hits into planning context |

---

## Acceptance Criteria

```gherkin
Scenario: Recall returns relevant entries
  Given existing memory entries
  When user runs "sf memory recall \"provider timeout\""
  Then matching lessons and runs are returned in ranked order

Scenario: Lesson capture persists structured entry
  Given a completed run with failure and fix data
  When user runs "sf lessons capture --from-run <id>"
  Then structured lesson entry is stored and linked to run ID

Scenario: Plan includes memory context
  Given relevant prior memory exists
  When user runs "sf plan \"similar task\""
  Then plan context includes recalled entries
```

---

## Testing

- Retrieval ranking tests with known datasets.
- Lesson extraction tests from run artifacts.
- Integration tests for recall injection into planning.

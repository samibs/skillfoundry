# STORY-015: GitHub Memory Sync Integration

**Phase:** 3 — Learning Loop
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-013, STORY-014
**Affects:** FR-042

---

## Description

Implement optional GitHub sync for approved memory artifacts so organizational lessons can be shared and retained across sessions and projects.

---

## Technical Approach

### Scope

- Add sync configuration and enable/disable controls.
- Commit/push approved memory artifacts at run close or explicit sync action.
- Handle sync failures safely without data loss.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/memory/sync/config.*` | Create Git sync config model |
| `sf_cli/memory/sync/github_sync.*` | Create sync executor |
| `sf_cli/memory/sync/sync_state.*` | Create sync state tracking |
| `sf_cli/run_close/hooks.*` | Integrate sync at run completion |

---

## Acceptance Criteria

```gherkin
Scenario: Memory artifacts sync on run close
  Given sync is enabled and remote is configured
  When a run completes with new approved lessons
  Then changes are committed and pushed to configured repository

Scenario: Sync failure is recoverable
  Given network or auth failure during sync
  When sync attempt fails
  Then local artifacts are preserved
  And retry guidance is displayed

Scenario: Sync can be disabled
  Given sync is disabled in config
  When run closes
  Then no remote push is attempted
```

---

## Testing

- Integration tests for successful commit/push flow.
- Failure-path tests for auth/network errors.
- State tests for enabled/disabled sync behavior.

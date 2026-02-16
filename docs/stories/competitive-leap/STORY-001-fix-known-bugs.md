# STORY-001: Fix Known Script Bugs

**Phase:** 0 — Bug Fixes
**PRD:** competitive-leap
**Priority:** MUST
**Effort:** S
**Dependencies:** None
**Affects:** FR-000, FR-001, FR-002, FR-003

---

## Description

Fix 4 known bugs discovered during the competitive audit:

1. `scripts/session-recorder.sh list` exits code 1 when no sessions exist
2. `scripts/harvest.sh --status` exits code 1 on empty data
3. `scripts/convert-to-copilot.sh` is deprecated but still in the repo
4. `.project-registry-meta.jsonl` is 0 bytes

---

## Technical Approach

### Bug 1: session-recorder.sh list exit code

**Root cause:** The `list` subcommand likely uses a pipeline or `grep` on empty data, causing a non-zero exit when no matches are found.

**Fix pattern:**
```bash
cmd_list() {
    local session_dir="$LOG_DIR/sessions"
    if [ ! -d "$session_dir" ] || [ -z "$(ls -A "$session_dir" 2>/dev/null)" ]; then
        echo -e "${CYAN}[INFO]${NC} No sessions found"
        exit 0  # NOT exit 1
    fi
    # ... existing list logic
}
```

### Bug 2: harvest.sh --status exit code

Same pattern as Bug 1. Find the `--status` handler and ensure it returns exit 0 with an informational message when no harvest data exists.

### Bug 3: Remove convert-to-copilot.sh

1. `grep -r "convert-to-copilot" .` to find all references
2. Remove the file
3. Update any documentation that references it
4. Verify `sync-platforms.sh` is the replacement (it is — this script was superseded)

### Bug 4: Fix .project-registry-meta.jsonl

1. Check if the file is supposed to be auto-populated or manually created
2. If auto-populated: find the initialization code and fix it
3. If manually created: add proper initialization in `registry.sh` or remove the file and let it be created on first use

---

## Acceptance Criteria

```gherkin
Scenario: session-recorder list with no sessions
  Given no session log files exist
  When I run "scripts/session-recorder.sh list"
  Then the exit code is 0
  And the output contains "No sessions found"

Scenario: harvest --status with no data
  Given no harvest data exists
  When I run "scripts/harvest.sh --status"
  Then the exit code is 0
  And the output contains "No harvests" or similar

Scenario: convert-to-copilot.sh removed
  Given the file "scripts/convert-to-copilot.sh" existed
  When this story is complete
  Then the file no longer exists
  And grep -r "convert-to-copilot" returns no results

Scenario: project-registry-meta.jsonl fixed
  Given the file is 0 bytes
  When this story is complete
  Then the file either has valid JSONL content or is removed with proper lazy-init
```

---

## Security Checklist

- [ ] No secrets exposed in fix
- [ ] Exit codes follow convention (0=success, 1=error, 2=cancel)
- [ ] No new dependencies introduced

---

## Files to Modify

| File | Action |
|------|--------|
| `scripts/session-recorder.sh` | Fix `list` exit code |
| `scripts/harvest.sh` | Fix `--status` exit code |
| `scripts/convert-to-copilot.sh` | Delete |
| `.project-registry-meta.jsonl` | Fix or remove |
| `tests/run-tests.sh` | Add regression tests for exit codes |

---

## Testing

- Run `scripts/session-recorder.sh list` with empty session dir → exit 0
- Run `scripts/harvest.sh --status` with no harvest data → exit 0
- Run `grep -r "convert-to-copilot" .` → no results
- Run full test suite → all pass

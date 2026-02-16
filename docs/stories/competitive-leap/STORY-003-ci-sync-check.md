# STORY-003: CI Platform Sync Verification

**Phase:** 1 — CI/CD & Cleanup
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** S
**Dependencies:** STORY-002
**Affects:** FR-015

---

## Description

Add a CI job that runs `scripts/sync-platforms.sh check` to verify all 4 platforms (Claude Code, Cursor, Copilot CLI, OpenAI Codex) are in sync. This catches platform drift before it reaches main.

---

## Technical Approach

### Option A: Add to existing ci.yml (Recommended)

Add a step to the existing CI workflow:

```yaml
      - name: Verify platform sync
        run: |
          if [ -f scripts/sync-platforms.sh ]; then
            bash scripts/sync-platforms.sh check
          else
            echo "sync-platforms.sh not found, skipping"
          fi
```

### Option B: Separate workflow

Create `.github/workflows/sync-check.yml` that runs only when agent files or sync script change:

```yaml
on:
  push:
    paths:
      - 'agents/**'
      - '.claude/commands/**'
      - '.cursor/rules/**'
      - '.copilot/custom-agents/**'
      - '.agents/skills/**'
      - 'scripts/sync-platforms.sh'
```

**Decision:** Start with Option A (simpler). Move to Option B if sync check becomes slow.

---

## Acceptance Criteria

```gherkin
Scenario: Platform sync is verified in CI
  Given all 4 platforms are in sync
  When CI runs
  Then sync check passes with "0 missing, 0 drift"

Scenario: Platform drift detected
  Given a .claude/commands/ file was modified without syncing
  When CI runs
  Then sync check fails
  And the drift is reported in CI output
```

---

## Files to Modify

| File | Action |
|------|--------|
| `.github/workflows/ci.yml` | Add sync check step |

---

## Testing

- Run `sync-platforms.sh check` locally → 0 missing, 0 drift
- Intentionally modify one platform file → sync check fails

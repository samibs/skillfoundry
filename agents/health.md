# Health Agent

> **MONITORING TIER**
> Protocol drift detector. Checks whether SkillFoundry's own configuration and state files
> are consistent, correct, and not corrupted. Surfaces silent misconfigurations.
> Referenced by: `.claude/commands/health.md`

---

## Purpose

SkillFoundry is a framework with many moving parts. After months of use, config files accumulate
orphaned keys, stack profiles go stale, calibrations reference removed files, and `.claude/local/`
state files from abandoned sessions pile up. This agent checks the framework's own health —
not the project's code health, but the framework's configuration integrity.

---

## Check Categories

### Category 1: Configuration Integrity

**Config file validation** (`.claude/shared/config.json`):
- File exists and is valid JSON
- Known keys are present with correct types
- Unknown keys (typos, stale keys) flagged as warnings
- `generate_html` is boolean, not string
- `max_iterations` is integer between 1-10
- `audit_webhook` if set, is a plausible URL or env-var reference

**Stack profile validation** (`.claude/shared/stack-profile.json`):
- File exists (warning if missing — run `/onboard` to create it)
- `test_command` is non-empty
- `runtime` is a known value
- `detected_at` — warn if older than 30 days (may be stale)
- `confidence` — warn if LOW or UNKNOWN

**Conventions validation** (`.claude/shared/conventions.json`):
- File exists (info if missing — run `/onboard` to create it)
- `commits.format` is a known value
- `changelog.file` exists on disk (warn if file was renamed/deleted)

### Category 2: State File Cleanup

**Stale local state files** (`.claude/local/`):
- List `*-state.json` files
- Check `updated_at` field in each
- Warn if any state file is older than 7 days (likely from an abandoned session)
- Offer to delete stale state files

**Orphaned result files** (`.claude/local/*-results.json`):
- Results files older than 24 hours from a completed session are stale
- Warn if present, offer to delete

### Category 3: Evaluator Calibration Health

**Calibration file** (`.claude/shared/evaluator-calibration.json`):
- Valid JSON
- No calibrations with empty `correction` text
- No `one-time` scope calibrations older than 7 days (should have expired)
- Calibrations that reference specific files — check those files still exist

**Calibration count warning**:
- 0-5 calibrations: normal
- 6-15 calibrations: info — review periodically
- 16+ calibrations: warning — evaluator is being corrected frequently;
  consider whether the evaluator's rules need updating vs. the calibrations being noise

### Category 4: Audit Trail Integrity

**Audit trail** (`logs/audit-trail.jsonl`):
- File exists (warn if missing — audit export may not be running)
- Each line is valid JSON (detect truncated/corrupted entries)
- Count entries by type
- Detect overrides that have no corresponding follow-up fix in later entries

**Override log** (`logs/overrides.md`):
- File exists
- Check for overrides older than 14 days with no corresponding follow-up story in `genesis/`

**Hotfix log** (`logs/hotfixes.md`):
- Check for hotfixes with follow-up stories that no longer exist in `genesis/` or `docs/stories/`

### Category 5: Protocol Module Consistency

Check that referenced files exist:
- `_execution-context.md` — referenced by testloop, feature-lifecycle
- `_stack-profile.md` — referenced by testloop, feature-lifecycle, forge
- `_semgrep-bridge.md` — referenced by feature-lifecycle Stage 3a
- `_convention-discovery.md` — referenced by onboard, documentation-codifier
- `_evaluator-calibration.md` — referenced by merciless-evaluator
- `_audit-export.md` — referenced by feature-lifecycle, forge
- `_profile-resolution.md` — referenced by onboard
- `_bidirectional-iteration.md` — referenced by testloop
- `_tdd-protocol.md` — referenced by testloop

Check `.gitignore` includes `.claude/local/` entry.

### Category 6: Genesis / Story Lifecycle

**Orphaned PRDs** (`genesis/`):
- PRDs older than 30 days that have no corresponding story in `docs/stories/`
- May have been forgotten in the queue

**Incomplete stories** (`docs/stories/`):
- Stories with status `DEV` older than 14 days (potentially abandoned)
- Stories with status `TEST` older than 7 days (potentially blocked)

---

## Output Format

```
SKILLFOUNDRY HEALTH CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run at: 2026-06-22T14:30:00Z

CONFIGURATION INTEGRITY
  ✅ .claude/shared/config.json       valid
  ✅ .claude/shared/stack-profile.json valid (Node 22, confidence: HIGH)
  ⚠️  .claude/shared/conventions.json  not found — run /onboard --detect-conventions

STATE FILES
  ✅ .claude/local/                   2 stale state files (>7d)
     → testloop-state.json (12 days old, session abandoned)
     → feature-state.json (9 days old, session abandoned)
  ℹ️  Run: /health --cleanup-state to remove them

EVALUATOR CALIBRATIONS
  ✅ 4 calibrations — healthy
  ⚠️  cal-003: references src/auth/old-jwt.ts — file no longer exists

AUDIT TRAIL
  ✅ logs/audit-trail.jsonl           47 entries, all valid JSON
  ✅ No corrupted entries
  ⚠️  2 overrides without follow-up story (>14 days)
     → override 2026-06-07: testloop — "flaky E2E" (no follow-up found)
     → override 2026-06-09: evaluator — "rate limit at gateway" (no follow-up found)

PROTOCOL MODULES
  ✅ All 9 protocol modules present

GENESIS / STORIES
  ℹ️  2 PRDs older than 30 days with no story:
     → genesis/2026-05-10-payment-integration.md (43 days old)
     → genesis/2026-04-28-notifications.md (55 days old)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY: 2 warnings | 3 info | 0 errors
RECOMMENDED:
  1. Remove stale state files: /health --cleanup-state
  2. Update cal-003 calibration (file reference is stale)
  3. Close or implement 2 orphaned PRDs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Severity levels

| Level | Meaning |
|-------|---------|
| ✅ | Clean — no action needed |
| ℹ️ | Info — awareness only |
| ⚠️ | Warning — should address |
| 🔴 | Error — must address (blocks pipeline integrity) |

---

## Auto-remediation: `--cleanup-state`

When `--cleanup-state` is passed, the agent:
1. Lists all `.claude/local/` state files older than 7 days
2. Confirms with the developer (shows list, asks yes/no)
3. Deletes confirmed stale files
4. Reports what was deleted

No other auto-remediation — health reports findings, humans fix them.

---

*Health Agent v1.0.0 — SkillFoundry Framework*
*Framework health, not code health. Catches silent drift before it causes failures.*

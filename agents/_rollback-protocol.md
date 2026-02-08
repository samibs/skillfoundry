# Rollback Protocol

> **CORE FRAMEWORK MODULE**
> This module defines how to safely rollback changes when execution fails.

---

## Overview

Rollback ensures:
- No broken state left behind
- Clean recovery from failures
- Audit trail of what was undone
- Confidence to experiment

---

## Rollback Triggers

### Automatic Triggers

```
Rollback is triggered automatically when:
1. Story fails 3 consecutive times
2. Layer validation fails critically
3. Security audit finds critical issues
4. User explicitly requests /go --rollback
5. Context budget exhausted mid-story
```

### Manual Triggers

```
/go --rollback              → Rollback last execution
/go --rollback STORY-XXX    → Rollback to before specific story
/go --rollback --hard       → Rollback and delete state (fresh start)
```

---

## Rollback Manifest

Before any execution, create a manifest of potential rollback actions:

```json
{
  "manifest_id": "rollback_20260120_143000",
  "created_at": "2026-01-20T14:30:00Z",
  "execution_id": "exec_20260120_143000_abc123",

  "files": {
    "created": [
      {
        "path": "src/auth/login.ts",
        "story": "STORY-002",
        "created_at": "2026-01-20T14:32:00Z",
        "action": "DELETE"
      }
    ],
    "modified": [
      {
        "path": "src/index.ts",
        "story": "STORY-002",
        "modified_at": "2026-01-20T14:33:00Z",
        "backup_path": ".claude/backups/20260120_143000/src/index.ts",
        "action": "RESTORE"
      }
    ],
    "deleted": [
      {
        "path": "src/old/deprecated.ts",
        "story": "STORY-003",
        "deleted_at": "2026-01-20T14:34:00Z",
        "backup_path": ".claude/backups/20260120_143000/src/old/deprecated.ts",
        "action": "RESTORE"
      }
    ]
  },

  "database": {
    "migrations_applied": [
      {
        "file": "migrations/001_create_users.sql",
        "story": "STORY-001",
        "applied_at": "2026-01-20T14:31:00Z",
        "rollback_file": "migrations/001_create_users_down.sql",
        "action": "ROLLBACK"
      }
    ]
  },

  "packages": {
    "installed": [
      {
        "name": "bcrypt",
        "version": "5.0.0",
        "story": "STORY-002",
        "action": "UNINSTALL"
      }
    ]
  },

  "config": {
    "env_added": [
      {
        "key": "JWT_SECRET",
        "file": ".env",
        "action": "REMOVE"
      }
    ]
  }
}
```

---

## Backup Strategy

### File Backups

Before modifying any file:

```bash
# Create backup directory
mkdir -p .claude/backups/$(date +%Y%m%d_%H%M%S)/$(dirname $FILE)

# Copy original file
cp "$FILE" ".claude/backups/$(date +%Y%m%d_%H%M%S)/$FILE"

# Record in manifest
echo "Backed up: $FILE"
```

### Database Backups

Before applying migrations:

```bash
# For SQLite
cp database.db ".claude/backups/$(date +%Y%m%d_%H%M%S)/database.db"

# For PostgreSQL/MySQL
pg_dump -Fc dbname > ".claude/backups/$(date +%Y%m%d_%H%M%S)/database.dump"
```

### Package State

Before installing packages:

```bash
# Node.js
cp package-lock.json ".claude/backups/$(date +%Y%m%d_%H%M%S)/package-lock.json"

# Python
pip freeze > ".claude/backups/$(date +%Y%m%d_%H%M%S)/requirements.freeze.txt"
```

---

## Rollback Execution

### Phase 1: Validate Manifest

```
ROLLBACK VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking rollback manifest...

Files to DELETE: 5
├── src/auth/login.ts       ✓ exists
├── src/auth/register.ts    ✓ exists
├── src/auth/middleware.ts  ✓ exists
├── src/models/user.ts      ✓ exists
└── tests/auth.test.ts      ✓ exists

Files to RESTORE: 2
├── src/index.ts            ✓ backup exists
└── src/config.ts           ✓ backup exists

Migrations to ROLLBACK: 1
├── 001_create_users.sql    ✓ rollback file exists

Packages to UNINSTALL: 2
├── bcrypt@5.0.0            ✓ installed
└── jsonwebtoken@9.0.0      ✓ installed

Validation: PASSED
Ready to rollback.
```

### Phase 2: Stop Running Processes

```
STOPPING PROCESSES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking for running processes...
├── Development server     → Stopped
├── Test runner           → Not running
└── Database connections  → Closed

Processes cleared.
```

### Phase 3: Execute Rollback

```
EXECUTING ROLLBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/4] Rolling back database...
├── Running: migrations/001_create_users_down.sql
└── ✓ Migration rolled back

[2/4] Deleting created files...
├── Deleted: src/auth/login.ts
├── Deleted: src/auth/register.ts
├── Deleted: src/auth/middleware.ts
├── Deleted: src/models/user.ts
└── ✓ 5 files deleted

[3/4] Restoring modified files...
├── Restored: src/index.ts
├── Restored: src/config.ts
└── ✓ 2 files restored

[4/4] Uninstalling packages...
├── Removed: bcrypt@5.0.0
├── Removed: jsonwebtoken@9.0.0
└── ✓ 2 packages removed
```

### Phase 4: Verify Rollback

```
VERIFYING ROLLBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking project state...

File system:
├── Created files removed    ✓
├── Modified files restored  ✓
└── Deleted files restored   ✓

Database:
├── Migrations rolled back   ✓
└── Schema matches baseline  ✓

Dependencies:
├── package.json restored    ✓
└── node_modules consistent  ✓

Build:
├── Project compiles         ✓
└── Existing tests pass      ✓

ROLLBACK VERIFIED: SUCCESS
```

---

## Rollback Report

After rollback, generate a report:

```markdown
# Rollback Report

**Execution ID**: exec_20260120_143000_abc123
**Rollback Time**: 2026-01-20T14:45:00Z
**Rollback Reason**: Story STORY-004 failed 3 times

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Files Deleted | 5 | ✓ |
| Files Restored | 2 | ✓ |
| Migrations Rolled Back | 1 | ✓ |
| Packages Removed | 2 | ✓ |

## What Was Lost

Stories that were rolled back:
- STORY-002: Auth API (implementation deleted)
- STORY-003: User API (implementation deleted)
- STORY-004: Frontend Auth (partial, failed)

## What Remains

Stories completed before failure:
- STORY-001: DB Schema (kept, but migration rolled back)

## Files Changed

### Deleted
| File | Story | Reason |
|------|-------|--------|
| src/auth/login.ts | STORY-002 | Created during execution |
| src/auth/register.ts | STORY-003 | Created during execution |

### Restored
| File | Story | From Backup |
|------|-------|-------------|
| src/index.ts | STORY-002 | .claude/backups/20260120_143000/src/index.ts |

## Recommendations

1. Review failure in STORY-004
2. Check if PRD needs refinement
3. Consider breaking STORY-004 into smaller stories

## Recovery Options

```bash
# Resume from where you left off (after fixing issues)
/go --resume

# Start fresh with lessons learned
/go

# View what went wrong
/go --status
```
```

---

## Partial Rollback

Roll back to a specific point:

```
/go --rollback STORY-003

PARTIAL ROLLBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rolling back to before STORY-003...

WILL ROLLBACK:
├── STORY-004: Frontend Auth (partial)
├── STORY-003: User API

WILL KEEP:
├── STORY-001: DB Schema
├── STORY-002: Auth API

Proceed? (y/n)
```

---

## Rollback Limitations

### Cannot Rollback

```
⚠️ ROLLBACK LIMITATIONS

The following changes CANNOT be automatically rolled back:

1. External API calls already made
2. Emails/notifications sent
3. Third-party service registrations
4. Data written to external databases
5. Deployed changes (use separate rollback)

These require manual intervention.
```

### Expired Backups

```
⚠️ BACKUP EXPIRED

Backups older than 7 days are automatically cleaned up.

Execution: exec_20260110_143000_abc123
Backup Date: 2026-01-10T14:30:00Z
Status: EXPIRED

Cannot rollback. Start fresh with /go --clean.
```

---

## Integration with State Machine

```
State Machine integration:

ERROR state:
├── on_rollback → ROLLING_BACK state
├── Loads rollback manifest
├── Executes rollback protocol
├── Generates rollback report
└── Transitions to IDLE state

ROLLING_BACK state:
├── Validate manifest
├── Execute rollback phases
├── Verify success
├── on_success → IDLE
└── on_failure → ERROR (manual intervention)
```

---

## Rollback Configuration

In `.claude/config.json`:

```json
{
  "rollback": {
    "auto_rollback_on_failure": true,
    "max_retry_before_rollback": 3,
    "backup_retention_days": 7,
    "backup_database": true,
    "backup_node_modules": false,
    "confirm_before_rollback": true,
    "generate_report": true
  }
}
```

---

## CLI Commands

```bash
# View rollback manifest
/go --rollback --dry-run

# Rollback with confirmation
/go --rollback

# Rollback without confirmation (dangerous)
/go --rollback --force

# Rollback to specific story
/go --rollback STORY-003

# Rollback and clean state
/go --rollback --hard

# View available rollback points
/go --rollback --list
```

---

## Remember

> "Rollback is not failure. It's intelligent recovery."

> "Every change must be reversible. No exceptions."

> "The best rollback is the one you never need. The second best is the one that works."

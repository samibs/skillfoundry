# Execution State Machine

> **CORE FRAMEWORK MODULE**
> This module defines the state machine for /go execution with persistence and recovery.

---

## Overview

The execution state machine provides:
- Deterministic state transitions
- Crash recovery and resume
- Rollback capability
- Progress tracking
- Audit trail

---

## State Definitions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STATE MACHINE DIAGRAM                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐                                                          │
│   │   IDLE   │◀──────────────────────────────────────────┐              │
│   └────┬─────┘                                           │              │
│        │ /go                                             │              │
│        ▼                                                 │              │
│   ┌──────────────┐                                       │              │
│   │ INITIALIZING │──── fail ────▶ ERROR                  │              │
│   └──────┬───────┘                  │                    │              │
│          │ success                  │                    │              │
│          ▼                          │                    │              │
│   ┌──────────────┐                  │                    │              │
│   │ LOADING_PRD  │──── fail ────────┤                    │              │
│   └──────┬───────┘                  │                    │              │
│          │ success                  │                    │              │
│          ▼                          │                    │              │
│   ┌──────────────┐                  │                    │              │
│   │  VALIDATING  │──── fail ────────┤                    │              │
│   └──────┬───────┘                  │                    │              │
│          │ success                  │                    │              │
│          ▼                          │                    │              │
│   ┌──────────────────┐              │                    │              │
│   │ GENERATING_STORIES│─── fail ────┤                    │              │
│   └──────┬───────────┘              │                    │              │
│          │ success                  │                    │              │
│          ▼                          ▼                    │              │
│   ┌──────────────────┐        ┌──────────┐              │              │
│   │ EXECUTING_STORY  │◀───────│  ERROR   │──────────────┤              │
│   └──────┬───────────┘        └────┬─────┘              │              │
│          │                         │                    │              │
│     ┌────┴────┐                    │ rollback           │              │
│     │         │                    ▼                    │              │
│   success   fail             ┌──────────────┐           │              │
│     │         │              │ ROLLING_BACK │───────────┤              │
│     │         └─────────────▶└──────────────┘           │              │
│     │                                                   │              │
│     │ more stories?                                     │              │
│     ├──── yes ────▶ EXECUTING_STORY                     │              │
│     │                                                   │              │
│     │ no                                                │              │
│     ▼                                                   │              │
│   ┌──────────────────┐                                  │              │
│   │ VALIDATING_LAYERS│──── fail ────▶ ERROR             │              │
│   └──────┬───────────┘                                  │              │
│          │ success                                      │              │
│          ▼                                              │              │
│   ┌──────────────────┐                                  │              │
│   │ SECURITY_AUDIT   │──── fail ────▶ ERROR             │              │
│   └──────┬───────────┘                                  │              │
│          │ success                                      │              │
│          ▼                                              │              │
│   ┌──────────────────┐                                  │              │
│   │   DOCUMENTING    │──── fail ────▶ COMPLETED_PARTIAL │              │
│   └──────┬───────────┘                                  │              │
│          │ success                                      │              │
│          ▼                                              │              │
│   ┌──────────────────┐                                  │              │
│   │    COMPLETED     │──────────────────────────────────┘              │
│   └──────────────────┘                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## State Details

### IDLE
Initial state. No execution in progress.

```json
{
  "state": "IDLE",
  "can_transition_to": ["INITIALIZING"],
  "triggers": ["/go", "/go [prd]"]
}
```

### INITIALIZING
Setting up execution context, loading framework, syncing with hub.

```json
{
  "state": "INITIALIZING",
  "can_transition_to": ["LOADING_PRD", "ERROR"],
  "actions": [
    "Hub pull (if configured — silent, non-blocking)",
    "Load CLAUDE-SUMMARY.md",
    "Initialize scratchpad",
    "Check context budget",
    "Create state file"
  ]
}
```

### LOADING_PRD
Discovering and loading PRD files.

```json
{
  "state": "LOADING_PRD",
  "can_transition_to": ["VALIDATING", "ERROR"],
  "actions": [
    "Scan genesis/ folder",
    "Parse PRD files",
    "Check for inter-PRD dependencies",
    "Order PRDs by dependency"
  ]
}
```

### VALIDATING
Validating PRD completeness.

```json
{
  "state": "VALIDATING",
  "can_transition_to": ["GENERATING_STORIES", "ERROR"],
  "actions": [
    "Check required sections",
    "Validate acceptance criteria",
    "Check security requirements",
    "Verify scope definition"
  ]
}
```

### GENERATING_STORIES
Creating implementation stories from PRD.

```json
{
  "state": "GENERATING_STORIES",
  "can_transition_to": ["EXECUTING_STORY", "ERROR"],
  "actions": [
    "Break PRD into stories",
    "Calculate dependencies",
    "Build dependency graph",
    "Generate INDEX.md",
    "Create story files"
  ]
}
```

### EXECUTING_STORY
Implementing a single story.

```json
{
  "state": "EXECUTING_STORY",
  "can_transition_to": ["EXECUTING_STORY", "VALIDATING_LAYERS", "ERROR", "ROLLING_BACK"],
  "sub_states": ["ARCHITECTING", "CODING", "TESTING", "GATE_CHECK"],
  "actions": [
    "Load story context",
    "Execute implementation",
    "Run tests",
    "Validate gate"
  ]
}
```

### VALIDATING_LAYERS
Running three-layer validation.

```json
{
  "state": "VALIDATING_LAYERS",
  "can_transition_to": ["SECURITY_AUDIT", "ERROR"],
  "actions": [
    "Check database layer",
    "Check backend layer",
    "Check frontend layer",
    "Generate validation report"
  ]
}
```

### SECURITY_AUDIT
Running security checks.

```json
{
  "state": "SECURITY_AUDIT",
  "can_transition_to": ["DOCUMENTING", "ERROR"],
  "actions": [
    "Scan for banned patterns",
    "Check token handling",
    "Verify .gitignore",
    "Validate LoggerService"
  ]
}
```

### DOCUMENTING
Generating documentation.

```json
{
  "state": "DOCUMENTING",
  "can_transition_to": ["COMPLETED", "COMPLETED_PARTIAL"],
  "actions": [
    "Generate API docs",
    "Update README",
    "Create troubleshooting guide",
    "Generate audit log"
  ]
}
```

### COMPLETED
Successful completion. Sync results to hub.

```json
{
  "state": "COMPLETED",
  "can_transition_to": ["IDLE"],
  "actions": [
    "Generate completion report",
    "Archive PRD",
    "Update metrics",
    "Clean up state",
    "Hub push: scratchpad + metrics (if configured — silent, non-blocking)"
  ]
}
```

### ERROR
Error state requiring intervention.

```json
{
  "state": "ERROR",
  "can_transition_to": ["ROLLING_BACK", "EXECUTING_STORY", "IDLE"],
  "actions": [
    "Log error details",
    "Preserve state for recovery",
    "Notify user",
    "Offer recovery options"
  ]
}
```

### ROLLING_BACK
Reverting changes.

```json
{
  "state": "ROLLING_BACK",
  "can_transition_to": ["IDLE", "EXECUTING_STORY"],
  "actions": [
    "Identify changes to revert",
    "Execute rollback",
    "Verify rollback success",
    "Update state"
  ]
}
```

---

## State File Format

State is persisted to `.claude/state.json`:

```json
{
  "version": "1.0",
  "created_at": "2026-01-20T14:30:00Z",
  "updated_at": "2026-01-20T14:35:00Z",
  "execution_id": "exec_20260120_143000_abc123",

  "current_state": "EXECUTING_STORY",
  "previous_state": "GENERATING_STORIES",

  "prd": {
    "file": "genesis/2026-01-20-user-auth.md",
    "name": "User Authentication",
    "validated": true
  },

  "stories": {
    "total": 6,
    "completed": 3,
    "in_progress": 1,
    "pending": 2,
    "failed": 0,
    "current": "STORY-004"
  },

  "story_status": {
    "STORY-001": {"status": "completed", "completed_at": "..."},
    "STORY-002": {"status": "completed", "completed_at": "..."},
    "STORY-003": {"status": "completed", "completed_at": "..."},
    "STORY-004": {"status": "in_progress", "started_at": "..."},
    "STORY-005": {"status": "pending"},
    "STORY-006": {"status": "pending"}
  },

  "layers": {
    "database": "completed",
    "backend": "in_progress",
    "frontend": "pending"
  },

  "context": {
    "budget_used": 45000,
    "compactions": 1,
    "last_compaction": "2026-01-20T14:32:00Z"
  },

  "changes": {
    "files_created": [
      {"path": "src/auth/login.ts", "story": "STORY-002"},
      {"path": "src/auth/register.ts", "story": "STORY-003"}
    ],
    "files_modified": [
      {"path": "src/index.ts", "story": "STORY-002", "backup": ".claude/backups/..."}
    ],
    "migrations_applied": [
      {"file": "001_create_users.sql", "story": "STORY-001"}
    ]
  },

  "decisions": [
    {
      "story": "STORY-002",
      "decision": "Used bcrypt for password hashing",
      "rationale": "Industry standard"
    }
  ],

  "errors": [],

  "recovery": {
    "last_successful_state": "STORY-003",
    "rollback_available": true,
    "resume_point": "STORY-004"
  }
}
```

---

## State Transitions

### Transition Rules

```typescript
const transitions: StateTransitions = {
  IDLE: {
    on_go: 'INITIALIZING'
  },
  INITIALIZING: {
    on_success: 'LOADING_PRD',
    on_error: 'ERROR'
  },
  LOADING_PRD: {
    on_success: 'VALIDATING',
    on_no_prds: 'IDLE',
    on_error: 'ERROR'
  },
  VALIDATING: {
    on_success: 'GENERATING_STORIES',
    on_invalid: 'ERROR',
    on_validate_only: 'IDLE'  // --validate flag
  },
  GENERATING_STORIES: {
    on_success: 'EXECUTING_STORY',
    on_error: 'ERROR'
  },
  EXECUTING_STORY: {
    on_story_complete: 'EXECUTING_STORY',  // next story
    on_all_complete: 'VALIDATING_LAYERS',
    on_error: 'ERROR',
    on_blocked: 'ERROR'
  },
  VALIDATING_LAYERS: {
    on_success: 'SECURITY_AUDIT',
    on_failure: 'ERROR'
  },
  SECURITY_AUDIT: {
    on_success: 'DOCUMENTING',
    on_failure: 'ERROR'
  },
  DOCUMENTING: {
    on_success: 'COMPLETED',
    on_partial: 'COMPLETED_PARTIAL'
  },
  ERROR: {
    on_retry: 'EXECUTING_STORY',
    on_rollback: 'ROLLING_BACK',
    on_abort: 'IDLE'
  },
  ROLLING_BACK: {
    on_success: 'IDLE',
    on_resume: 'EXECUTING_STORY'
  },
  COMPLETED: {
    on_next: 'IDLE'
  }
};
```

### Transition Actions

Each transition can trigger actions:

```typescript
const transitionActions = {
  'IDLE -> INITIALIZING': [
    'hub_pull_silent'
  ],
  'INITIALIZING -> LOADING_PRD': [
    'create_state_file',
    'initialize_scratchpad',
    'persist_scratchpad'
  ],
  'EXECUTING_STORY -> EXECUTING_STORY': [
    'save_story_state',
    'update_progress',
    'check_context_budget',
    'persist_scratchpad'
  ],
  'DOCUMENTING -> COMPLETED': [
    'hub_push_scratchpad_silent',
    'hub_push_metrics_silent'
  ],
  'ERROR -> ROLLING_BACK': [
    'create_rollback_manifest',
    'backup_current_state'
  ],
  'ROLLING_BACK -> IDLE': [
    'execute_rollback',
    'clean_state_file',
    'generate_rollback_report'
  ]
};
```

---

## Recovery Protocol

### Detecting Interrupted Execution

On `/go` invocation, check for existing state:

```
if exists(.claude/state.json):
    state = load_state()
    if state.current_state != 'IDLE' and state.current_state != 'COMPLETED':
        # Interrupted execution detected
        offer_recovery_options()
```

### Recovery Options

```
🔄 INTERRUPTED EXECUTION DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Previous execution was interrupted at:
├── State: EXECUTING_STORY
├── Story: STORY-004 (API Endpoints)
├── Progress: 3/6 stories complete
└── Last Update: 2026-01-20 14:35:00

OPTIONS:
1. Resume from STORY-004 (recommended)
2. Restart from beginning (loses progress)
3. Rollback all changes and start fresh
4. View current state and decide

Select option (1-4):
```

### Resume Protocol

```
RESUME PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Load state file (.claude/state.json)
2. Load scratchpad (.claude/scratchpad.md) for context and decisions
3. Verify file integrity (files still exist, not modified externally)
4. Restore context:
   - Load CLAUDE-SUMMARY.md
   - Load current story
   - Apply scratchpad (decisions, blockers, continuation notes)
5. Validate prerequisites:
   - Completed stories still valid
   - No external changes to completed files
6. Resume from saved state
7. Continue execution
8. Persist updated scratchpad after first action

Resuming from STORY-004...
```

---

## Command Line Interface

### New /go Flags

```
/go                     → Normal execution
/go --resume            → Resume interrupted execution
/go --rollback          → Rollback all changes from last execution
/go --status            → Show current state
/go --skip STORY-XXX    → Skip specific story
/go --from STORY-XXX    → Start from specific story
/go --state             → Show raw state file
/go --clean             → Clear state file and start fresh
```

### Status Output

```
/go --status

EXECUTION STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

State: EXECUTING_STORY
PRD: genesis/2026-01-20-user-auth.md

PROGRESS:
███████████░░░░░░░░░ 55% (3/6 stories)

STORIES:
✓ STORY-001  DB Schema              COMPLETED
✓ STORY-002  Auth API               COMPLETED
✓ STORY-003  User API               COMPLETED
▶ STORY-004  Frontend Auth          IN_PROGRESS
○ STORY-005  Integration Tests      PENDING
○ STORY-006  Documentation          PENDING

LAYERS:
├── Database:  ✓ COMPLETED
├── Backend:   ▶ IN_PROGRESS
└── Frontend:  ○ PENDING

CHANGES:
├── Files Created: 5
├── Files Modified: 2
└── Migrations Applied: 2

CONTEXT:
├── Budget Used: 45K tokens
└── Compactions: 1

Last Updated: 2026-01-20 14:35:00
```

---

## Integration Points

### With /go Skill

```markdown
The /go skill MUST:
1. Check for existing state on start
2. Offer recovery if interrupted
3. Persist state after each transition
4. Update state after each story
5. Handle errors with state preservation
6. Support rollback command
```

### With Agents

```markdown
Each agent invocation:
1. Receives current state context
2. Reports changes back
3. Updates state.changes array
4. Records decisions made
```

### With Metrics

```markdown
State machine feeds metrics:
- Execution duration
- Story completion rate
- Error frequency
- Rollback frequency
```

---

## State File Locations

```
.claude/
├── state.json              # Current execution state (structured)
├── scratchpad.md           # Live session context (human-readable, cross-platform)
├── state.json.bak          # Backup before transitions
├── history/
│   ├── exec_20260120_*.json  # Historical executions
│   └── ...
└── backups/
    └── 20260120_143000/
        ├── src/index.ts    # File backups for rollback
        └── ...
```

---

## Remember

> "State is truth. Persist it. Protect it. Recover from it."

> "No execution should be lost. Every crash is recoverable."

> "The state machine is your safety net."

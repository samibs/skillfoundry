# Swarm Coordination Protocol v1.0.0

> Shared module for self-organizing agent coordination in swarm mode.
> Referenced by: `/go --swarm`, `/delegate`, `/orchestrate`, `/swarm`

---

## Purpose

Enable agents to self-organize, claim tasks dynamically, hand off work without wave boundaries, and detect file conflicts in real-time. This replaces the top-down wave dispatch model with a pull-based coordination model where agents independently select and execute tasks.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM COORDINATION SYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    TASK QUEUE                            │   │
│   │  [QUEUED] → [CLAIMED] → [IN_PROGRESS] → [COMPLETE]     │   │
│   │                    ↓           ↓                         │   │
│   │              [ABANDONED]  [FAILED] → [QUEUED] (retry)   │   │
│   │                           [BLOCKED] → [QUEUED] (unblock)│   │
│   └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│              ┌──────────┼──────────┐                            │
│              ▼          ▼          ▼                             │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│        │  CODER   │ │  TESTER  │ │ SEC-SCAN │                  │
│        └────┬─────┘ └────┬─────┘ └────┬─────┘                  │
│             │            │            │                          │
│             └────────────┴────────────┘                          │
│                          │                                       │
│                  ┌───────▼───────┐                               │
│                  │  SCRATCHPAD   │                               │
│                  │ (shared notes)│                               │
│                  └───────────────┘                               │
│                          │                                       │
│                  ┌───────▼───────┐                               │
│                  │   CONFLICT    │                               │
│                  │   DETECTOR    │                               │
│                  └───────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## SwarmTask State Machine

Per PRD Section 6.1, tasks follow this state machine:

```
                    ┌──────────┐
                    │  QUEUED   │
                    └────┬─────┘
                         │ agent claims task
                         ▼
                    ┌──────────┐
          ┌─────── │ CLAIMED   │
          │        └────┬─────┘
          │             │ agent begins work
          │             ▼
          │        ┌──────────────┐
          │        │ IN_PROGRESS  │──────────┐
          │        └──┬───────┬───┘          │
          │           │       │              │ dependency unmet
          │   success │       │ failure      │ or conflict
          │           ▼       ▼              ▼
          │     ┌──────────┐ ┌──────────┐ ┌──────────┐
          │     │ COMPLETE │ │  FAILED  │ │ BLOCKED  │
          │     └──────────┘ └────┬─────┘ └────┬─────┘
          │                       │             │
          │              retry    │  dependency  │
          │          (max 3)      │  resolved    │
          │                       ▼             │
          └───────────────── QUEUED ◄───────────┘
```

### Valid Transitions

| From | To | Trigger | Who |
|------|----|---------|-----|
| QUEUED | CLAIMED | Agent claims task | Any idle agent |
| CLAIMED | IN_PROGRESS | Agent starts work | Claiming agent |
| CLAIMED | QUEUED | Timeout (>60s) | Coordinator |
| IN_PROGRESS | COMPLETE | Work finished | Working agent |
| IN_PROGRESS | FAILED | Work failed | Working agent |
| IN_PROGRESS | BLOCKED | Conflict or dep unmet | Conflict detector |
| FAILED | QUEUED | Retry (max 3) | Coordinator |
| BLOCKED | QUEUED | Blocking resolved | Coordinator |

### Invalid Transitions (must fail explicitly)

- COMPLETE -> any state (terminal)
- QUEUED -> IN_PROGRESS (must go through CLAIMED)
- BLOCKED -> COMPLETE (must re-execute)
- QUEUED -> FAILED (cannot fail without attempting)

---

## Swarm vs Wave Mode

### When to Use Swarm Mode

```
USE SWARM when:
├── 5+ independent stories exist
├── Stories involve different files/modules
├── Dynamic handoffs would save time (coder → tester immediately)
├── You want maximum parallelism
└── /go --swarm flag is set

USE WAVE when:
├── < 5 stories (overhead not worth it)
├── Stories have heavy file overlap
├── Sequential ordering is critical
├── Swarm coordination fails (automatic fallback)
└── Default mode (no --swarm flag)
```

### Swarm Mode Flag (FR-015)

Swarm mode is enabled via:
- `/go --swarm` - Run with swarm coordination
- `/go --parallel` - Use wave mode (existing, default)
- `/go --no-parallel` - Force sequential

### Fallback to Wave Mode (FR-016)

Swarm automatically falls back to wave mode when:
1. File lock acquisition fails 3 times
2. Task queue becomes corrupted
3. Circular dependency detected
4. Max concurrent agent limit consistently exceeded

Fallback is transparent - execution continues with wave dispatch.

---

## Agent Availability Pool (FR-017)

The agent pool tracks which agent types are available for task assignment.

### Pool Configuration

```
Max concurrent agents: 5 (configurable)

Agent types:
├── coder       - Implementation
├── tester      - Testing
├── security    - Security scanning
├── evaluator   - Quality evaluation
├── reviewer    - Code review
└── fixer       - Auto-remediation
```

### Pool Rules

1. Each agent can only work on one task at a time
2. When an agent completes a task, it immediately pulls the next available task
3. Task assignment respects dependencies - agent won't claim a task with unmet deps
4. File conflict check runs before claim is finalized

---

## Dynamic Handoffs (FR-011)

Dynamic handoffs allow work to flow between agents without waiting for wave boundaries.

### Handoff Protocol

```
1. Coder completes STORY-003 implementation
2. Coder writes scratchpad note: "STORY-003 ready for testing"
3. Tester reads scratchpad, sees STORY-003 is ready
4. Tester claims STORY-003-TEST from queue
5. Tester starts work immediately (no wave wait)
```

### Scratchpad Communication

Agents communicate via the scratchpad during execution:

```bash
# Coder announces interface change
./parallel/swarm-scratchpad.sh write \
  --from=coder --to=tester \
  --msg="Changed UserService.create() signature: now returns Promise<User>" \
  --task=STORY-001 --priority=high

# Tester checks for updates before starting
./parallel/swarm-scratchpad.sh read --for=tester --unread

# Tester acknowledges
./parallel/swarm-scratchpad.sh ack --id=NOTE-001
```

### Priority Levels

| Priority | When to Use |
|----------|-------------|
| `normal` | General notifications, progress updates |
| `high` | Interface changes, breaking changes, blockers |

---

## Conflict Detection (FR-014)

Real-time detection of file conflicts between concurrent agents.

### Detection Flow

```
1. Agent claims task from queue
2. Before starting: register files with conflict detector
3. Conflict detector checks for overlapping file locks
4. If conflict: task is BLOCKED, conflict is recorded
5. Resolution: serialize (wait) or skip (omit file)
6. When holder releases: blocked task is re-queued
```

### Resolution Strategies

| Strategy | Behavior |
|----------|----------|
| `serialize` | Blocked task waits, re-queued when holder finishes |
| `skip` | Blocked task proceeds without the conflicting file |

### Usage

```bash
# Before starting work
./parallel/conflict-detector.sh register --task=STORY-001 --files=src/auth.ts,src/types.ts

# Check before claiming
./parallel/conflict-detector.sh check --files=src/auth.ts

# After completing work
./parallel/conflict-detector.sh release --task=STORY-001

# View conflicts
./parallel/conflict-detector.sh status
```

---

## Shell Tool References

| Tool | Path | Purpose |
|------|------|---------|
| **Task Queue** | `parallel/swarm-queue.sh` | SwarmTask CRUD with state machine enforcement |
| **Scratchpad** | `parallel/swarm-scratchpad.sh` | Inter-agent communication channel |
| **Conflict Detector** | `parallel/conflict-detector.sh` | Real-time file conflict detection |
| **Wave Planner** | `parallel/wave-planner.sh` | Compute execution waves (fallback mode) |
| **Dispatch State** | `parallel/dispatch-state.sh` | Track wave-based execution progress |

---

## Integration with /go

### Swarm Execution Flow

```
/go --swarm
    │
    ├── 1. Generate stories from PRD
    ├── 2. Initialize swarm queue
    │       ./parallel/swarm-queue.sh init
    ├── 3. Add all stories as tasks
    │       ./parallel/swarm-queue.sh add --id=STORY-XXX ...
    ├── 4. Register file locks
    │       ./parallel/conflict-detector.sh register ...
    ├── 5. Agents pull from queue
    │   ├── Coder claims → starts → completes
    │   ├── Tester claims → starts → completes
    │   └── ... (up to MAX_CONCURRENT)
    ├── 6. Monitor via status
    │       ./parallel/swarm-queue.sh status
    │       ./parallel/swarm-scratchpad.sh status
    │       ./parallel/conflict-detector.sh status
    ├── 7. Handle failures
    │       ./parallel/swarm-queue.sh unblock --id=...
    └── 8. Aggregate results
```

### Fallback Detection

```bash
# If swarm coordination fails:
SWARM_FAILURES=$((SWARM_FAILURES + 1))
if [ "$SWARM_FAILURES" -ge 3 ]; then
    echo "[WARN] Swarm coordination failed 3 times. Falling back to wave mode."
    # Switch to wave planner
    ./parallel/wave-planner.sh docs/stories/feature/ --format=json
    # Continue with dispatch-state.sh
fi
```

---

## Security Constraints

- **Project scoping**: Scratchpad entries are project-scoped, never cross project boundaries
- **File locking**: Prevents data corruption from concurrent writes
- **No external deps**: Uses file-based locking (flock), no external message queue
- **Cleanup**: Swarm state files are cleaned up on `/go` completion

---

## Best Practices

1. **Start with wave mode** - Only switch to swarm when 5+ independent stories exist
2. **Monitor the scratchpad** - High-priority notes indicate breaking changes
3. **Resolve conflicts quickly** - Blocked tasks reduce throughput
4. **Trust the fallback** - Wave mode is battle-tested; swarm is an optimization
5. **Keep tasks focused** - One story per task for clean handoffs

---

*Swarm Coordination Protocol v1.0.0 - Claude AS Framework*

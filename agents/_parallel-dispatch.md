# Parallel Agent Dispatching Protocol v1.0.0

> Shared module for concurrent subagent workflow execution.
> Referenced by: `/go`, `/delegate`, `/orchestrate`

---

## Purpose

Enable parallel execution of independent tasks across multiple subagents, dramatically reducing execution time for non-dependent work.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL DISPATCH SYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      ┌─────────────┐                            │
│                      │ ORCHESTRATOR │                           │
│                      └──────┬──────┘                            │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│              ▼              ▼              ▼                    │
│       ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│       │ AGENT-1  │   │ AGENT-2  │   │ AGENT-3  │               │
│       │ (Story A)│   │ (Story B)│   │ (Story C)│               │
│       └────┬─────┘   └────┬─────┘   └────┬─────┘               │
│            │              │              │                      │
│            ▼              ▼              ▼                      │
│       ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│       │ RESULT-A │   │ RESULT-B │   │ RESULT-C │               │
│       └────┬─────┘   └────┬─────┘   └────┬─────┘               │
│            │              │              │                      │
│            └──────────────┼──────────────┘                      │
│                           ▼                                     │
│                    ┌─────────────┐                              │
│                    │  AGGREGATOR │                              │
│                    └─────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Dispatch Decision Logic

### When to Parallelize

```
CAN parallelize when:
├── Tasks have NO dependencies between them
├── Tasks don't modify the same files
├── Tasks don't require sequential database migrations
├── Combined context fits within budget
└── Resources (tokens, API calls) are sufficient

MUST serialize when:
├── Task B depends on Task A output
├── Tasks modify overlapping files
├── Database migrations must run in order
├── Context budget is constrained
└── Tasks have explicit ordering requirements
```

### Dependency Analysis

```python
def can_parallelize(task_a, task_b):
    # Check explicit dependencies
    if task_b.depends_on(task_a) or task_a.depends_on(task_b):
        return False

    # Check file overlap
    if task_a.files.intersects(task_b.files):
        return False

    # Check resource conflicts
    if task_a.locks.intersects(task_b.locks):
        return False

    # Check database ordering
    if task_a.has_migration and task_b.has_migration:
        return False

    return True
```

---

## Dispatch Modes

### Mode 1: WAVE Execution

Execute tasks in waves where each wave contains independent tasks.

```
Wave 1: [STORY-001, STORY-002, STORY-003]  ─── parallel
         │
         ▼ (wait for all)
Wave 2: [STORY-004, STORY-005]              ─── parallel
         │
         ▼ (wait for all)
Wave 3: [STORY-006]                         ─── single
```

### Mode 2: EAGER Execution

Start tasks as soon as their dependencies complete.

```
STORY-001 starts immediately
STORY-002 starts immediately (no deps)
STORY-003 waits for STORY-001
STORY-004 waits for STORY-002
STORY-005 waits for STORY-003 AND STORY-004
```

### Mode 3: CONSERVATIVE Execution

Maximum 2 parallel tasks to limit resource usage.

```
[STORY-001, STORY-002]  ─── parallel (max 2)
         │
[STORY-003, STORY-004]  ─── parallel (max 2)
         │
[STORY-005]             ─── single
```

---

## Dispatch Configuration

```json
// .claude/config.json
{
  "parallel_dispatch": {
    "enabled": true,
    "mode": "WAVE",
    "max_concurrent": 3,
    "timeout_per_agent_ms": 300000,
    "retry_failed": true,
    "max_retries": 2,
    "resource_limits": {
      "max_tokens_per_wave": 50000,
      "max_files_per_wave": 20
    }
  }
}
```

---

## Dispatch Request Format

### Single Agent Dispatch

```json
{
  "dispatch_id": "DISPATCH-20260120-001",
  "agent": "coder",
  "task": {
    "story_id": "STORY-001",
    "description": "Implement user registration endpoint",
    "context": {
      "files": ["src/auth/register.ts", "src/auth/types.ts"],
      "dependencies": []
    }
  },
  "constraints": {
    "max_tokens": 15000,
    "timeout_ms": 300000,
    "tdd_required": true
  }
}
```

### Parallel Wave Dispatch

```json
{
  "wave_id": "WAVE-001",
  "dispatch_mode": "WAVE",
  "agents": [
    {
      "dispatch_id": "DISPATCH-001",
      "agent": "coder",
      "task": {
        "story_id": "STORY-001",
        "description": "Implement user model"
      }
    },
    {
      "dispatch_id": "DISPATCH-002",
      "agent": "coder",
      "task": {
        "story_id": "STORY-002",
        "description": "Implement product model"
      }
    },
    {
      "dispatch_id": "DISPATCH-003",
      "agent": "coder",
      "task": {
        "story_id": "STORY-003",
        "description": "Implement order model"
      }
    }
  ],
  "aggregation": {
    "wait_for": "ALL",
    "on_failure": "CONTINUE_OTHERS"
  }
}
```

---

## Agent Response Format

Each dispatched agent returns:

```json
{
  "dispatch_id": "DISPATCH-001",
  "status": "SUCCESS|PARTIAL|FAILED|TIMEOUT",
  "story_id": "STORY-001",
  "result": {
    "files_created": ["src/models/user.ts"],
    "files_modified": ["src/models/index.ts"],
    "tests_written": 5,
    "tests_passed": 5,
    "coverage": 85
  },
  "metrics": {
    "duration_ms": 120000,
    "tokens_used": 8500,
    "tdd_cycles": 3
  },
  "errors": [],
  "warnings": ["Consider adding email validation"]
}
```

---

## Wave Aggregation

After all agents in a wave complete:

```json
{
  "wave_id": "WAVE-001",
  "status": "COMPLETE|PARTIAL|FAILED",
  "summary": {
    "total_dispatched": 3,
    "succeeded": 3,
    "failed": 0,
    "total_duration_ms": 180000,
    "parallel_speedup": 2.4
  },
  "results": [
    { "dispatch_id": "DISPATCH-001", "status": "SUCCESS" },
    { "dispatch_id": "DISPATCH-002", "status": "SUCCESS" },
    { "dispatch_id": "DISPATCH-003", "status": "SUCCESS" }
  ],
  "conflicts_detected": [],
  "ready_for_next_wave": true
}
```

---

## Conflict Detection

### File Conflict

```json
{
  "conflict_type": "FILE_OVERLAP",
  "file": "src/models/index.ts",
  "agents": ["DISPATCH-001", "DISPATCH-002"],
  "resolution": "MERGE_REQUIRED"
}
```

### Resolution Strategies

| Conflict Type | Strategy |
|---------------|----------|
| FILE_OVERLAP | Manual merge or re-run sequentially |
| MIGRATION_ORDER | Force sequential execution |
| RESOURCE_EXHAUSTED | Reduce wave size |
| TIMEOUT | Retry with extended timeout |

---

## Parallel Dispatch State

### State File Location

```
.claude/dispatch-state.json
```

### State Schema

```json
{
  "current_execution": {
    "execution_id": "EXEC-20260120-001",
    "mode": "WAVE",
    "current_wave": 2,
    "total_waves": 4
  },
  "waves": [
    {
      "wave_id": "WAVE-001",
      "status": "COMPLETE",
      "dispatches": ["DISPATCH-001", "DISPATCH-002", "DISPATCH-003"]
    },
    {
      "wave_id": "WAVE-002",
      "status": "IN_PROGRESS",
      "dispatches": ["DISPATCH-004", "DISPATCH-005"]
    }
  ],
  "pending_dispatches": ["DISPATCH-006", "DISPATCH-007"],
  "completed_dispatches": ["DISPATCH-001", "DISPATCH-002", "DISPATCH-003"],
  "failed_dispatches": []
}
```

---

## Integration with /go

### Phase: Parallel Story Execution

```markdown
## PARALLEL EXECUTION PHASE

1. Build dependency graph from stories
2. Identify independent story groups (waves)
3. For each wave:
   a. Dispatch all stories in parallel
   b. Wait for all to complete
   c. Check for conflicts
   d. Resolve conflicts if any
   e. Proceed to next wave
4. Aggregate results
5. Continue to validation phase
```

### /go Parallel Flags

```
/go --parallel           Enable parallel dispatch (default: WAVE)
/go --parallel=EAGER     Use eager execution mode
/go --parallel=2         Limit to 2 concurrent agents
/go --no-parallel        Force sequential execution
```

---

## Speedup Calculation

```
Sequential time: T_seq = T_1 + T_2 + T_3 + ... + T_n
Parallel time:   T_par = max(Wave_1) + max(Wave_2) + ... + max(Wave_k)
Speedup:         S = T_seq / T_par

Example:
  Stories: A(60s), B(90s), C(45s), D(120s), E(30s)
  Dependencies: D depends on A, E depends on B

  Sequential: 60 + 90 + 45 + 120 + 30 = 345s

  Parallel waves:
    Wave 1: [A, B, C] → max(60, 90, 45) = 90s
    Wave 2: [D, E]    → max(120, 30) = 120s
  Parallel total: 90 + 120 = 210s

  Speedup: 345 / 210 = 1.64x
```

---

## Error Handling

### Failure Modes

| Mode | Behavior |
|------|----------|
| FAIL_FAST | Stop all agents on first failure |
| CONTINUE_OTHERS | Let other agents complete |
| RETRY_FAILED | Retry failed agents up to max_retries |
| ISOLATE_FAILURE | Mark failed story, continue pipeline |

### Recovery

```json
{
  "on_agent_failure": {
    "action": "RETRY",
    "max_retries": 2,
    "backoff_ms": 5000,
    "fallback": "SEQUENTIAL"
  },
  "on_wave_failure": {
    "action": "PAUSE",
    "require_human_decision": true
  }
}
```

---

## Commands

```
/dispatch status         Show current dispatch state
/dispatch waves          Show wave breakdown
/dispatch cancel [id]    Cancel specific dispatch
/dispatch cancel-wave    Cancel current wave
/dispatch retry [id]     Retry failed dispatch
/dispatch metrics        Show parallel execution metrics
```

---

## Metrics Collection

Parallel metrics feed into the main metrics system:

```json
{
  "parallel_metrics": {
    "total_waves": 12,
    "total_dispatches": 45,
    "avg_wave_size": 3.75,
    "avg_speedup": 2.1,
    "max_speedup": 3.8,
    "conflicts_detected": 3,
    "conflicts_resolved": 3,
    "sequential_fallbacks": 1
  }
}
```

---

## Shell Tool References

The following shell scripts implement the parallel dispatch system:

| Tool | Path | Purpose |
|------|------|---------|
| **Wave Planner** | `parallel/wave-planner.sh` | Compute execution waves from story dependencies using topological sort |
| **Dispatch State** | `parallel/dispatch-state.sh` | CRUD for `.claude/dispatch-state.json` - track execution progress |
| **Visualizer** | `parallel/visualize.sh` | Generate ASCII and Mermaid dependency diagrams |
| **Swarm Queue** | `parallel/swarm-queue.sh` | SwarmTask CRUD with state machine (swarm mode) |
| **Scratchpad** | `parallel/swarm-scratchpad.sh` | Inter-agent communication channel (swarm mode) |
| **Conflict Detector** | `parallel/conflict-detector.sh` | File conflict detection between concurrent agents (swarm mode) |

### Usage in Agent Context

```bash
# Before dispatching: compute wave plan
./parallel/wave-planner.sh docs/stories/my-feature/ --format=json

# Initialize state tracking
./parallel/dispatch-state.sh init

# As dispatches execute: update state
./parallel/dispatch-state.sh update --dispatch=DISPATCH-001 --status=IN_PROGRESS --story=STORY-001 --agent=coder

# Check progress
./parallel/dispatch-state.sh report

# After completion: visualize what happened
./parallel/visualize.sh docs/stories/my-feature/ --format=both
```

---

## Best Practices

1. **Keep agents focused** - Each dispatch should be one story
2. **Minimize file overlap** - Design stories to touch different files
3. **Use conservative mode first** - Start with max 2 until stable
4. **Monitor resource usage** - Watch token consumption
5. **Test conflict resolution** - Verify merge handling works

---

*Parallel Dispatch Protocol v1.0.0 - SkillFoundry Framework*

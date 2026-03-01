# Parallel Execution - DAG-Based Agent Coordination

**Version**: 2.0 (updated v1.9.0.0)
**Status**: IMPLEMENTATION
**Date**: February 7, 2026

---

## Overview

Enables parallel execution of independent agent tasks using a Directed Acyclic Graph (DAG) to identify dependencies and execute tasks concurrently.

---

## Architecture

```
parallel/
├── README.md                # Usage guide and architecture overview
├── wave-planner.sh          # Build execution DAG, compute waves (topological sort)
├── dispatch-state.sh        # CRUD for .claude/dispatch-state.json
└── visualize.sh             # ASCII DAG and Mermaid diagram generation
```

### Shell Tooling

The parallel execution system uses shell scripts (not JavaScript) for consistency with the rest of the framework tooling. No Node.js dependency required.

```bash
# Compute waves from story dependencies
./parallel/wave-planner.sh docs/stories/my-feature/

# Initialize dispatch tracking state
./parallel/dispatch-state.sh init

# Update dispatch status
./parallel/dispatch-state.sh update --dispatch=DISPATCH-001 --status=COMPLETE

# View execution progress
./parallel/dispatch-state.sh report

# Visualize dependency graph
./parallel/visualize.sh docs/stories/my-feature/
./parallel/visualize.sh docs/stories/my-feature/ --format=mermaid
```

---

## How It Works

### 1. Dependency Analysis

Given stories or tasks, build execution DAG:

```
Stories: [STORY-001, STORY-002, STORY-003, STORY-004]

Dependencies:
  STORY-001: []                    # No dependencies
  STORY-002: []                    # No dependencies
  STORY-003: [STORY-001]           # Depends on STORY-001
  STORY-004: [STORY-001, STORY-002] # Depends on both

DAG:
  Batch 1 (parallel): [STORY-001, STORY-002]
  Batch 2 (parallel): [STORY-003, STORY-004]
```

### 2. Parallel Execution

Execute batches sequentially, but tasks within each batch run in parallel:

```
Batch 1:
  ├── STORY-001 (agent: coder)
  └── STORY-002 (agent: coder)
      ↓ (wait for both to complete)
Batch 2:
  ├── STORY-003 (agent: coder) - depends on STORY-001
  └── STORY-004 (agent: tester) - depends on STORY-001, STORY-002
```

---

## Implementation

### DAG Builder

```javascript
// parallel/dag-builder.js
class DAGBuilder {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addTask(taskId, dependencies = []) {
    this.nodes.set(taskId, {
      id: taskId,
      dependencies: dependencies,
      status: 'pending',
      agent: null,
    });

    dependencies.forEach(dep => {
      this.edges.push({ from: dep, to: taskId });
    });
  }

  buildBatches() {
    const batches = [];
    const completed = new Set();
    const remaining = new Set(this.nodes.keys());

    while (remaining.size > 0) {
      const batch = [];
      
      // Find tasks with no incomplete dependencies
      for (const taskId of remaining) {
        const task = this.nodes.get(taskId);
        const depsComplete = task.dependencies.every(dep => completed.has(dep));
        
        if (depsComplete) {
          batch.push(taskId);
        }
      }

      if (batch.length === 0) {
        throw new Error('Circular dependency detected');
      }

      batches.push(batch);
      batch.forEach(taskId => {
        completed.add(taskId);
        remaining.delete(taskId);
      });
    }

    return batches;
  }
}
```

### Executor

```javascript
// parallel/executor.js
class ParallelExecutor {
  constructor(dagBuilder) {
    this.dagBuilder = dagBuilder;
    this.batches = dagBuilder.buildBatches();
  }

  async execute() {
    const results = new Map();

    for (const batch of this.batches) {
      console.log(`Executing batch: ${batch.join(', ')}`);
      
      // Execute all tasks in batch in parallel
      const batchPromises = batch.map(taskId => 
        this.executeTask(taskId)
      );

      const batchResults = await Promise.all(batchPromises);
      
      batch.forEach((taskId, index) => {
        results.set(taskId, batchResults[index]);
      });
    }

    return results;
  }

  async executeTask(taskId) {
    const task = this.dagBuilder.nodes.get(taskId);
    // Execute task using appropriate agent
    // Return result
    return { taskId, status: 'completed' };
  }
}
```

---

## Usage

### Command: `/parallel`

```
/parallel execute STORY-001 STORY-002 STORY-003 STORY-004
/parallel analyze STORY-001 STORY-002 STORY-003 STORY-004
```

### Example

```markdown
## Parallel Execution Request

**Stories**: STORY-001, STORY-002, STORY-003, STORY-004

**Dependency Analysis**:
- STORY-001: No dependencies → Batch 1
- STORY-002: No dependencies → Batch 1
- STORY-003: Depends on STORY-001 → Batch 2
- STORY-004: Depends on STORY-001, STORY-002 → Batch 2

**Execution Plan**:
```
Batch 1 (parallel):
  ├── STORY-001: Implement user authentication
  └── STORY-002: Implement payment processing

Batch 2 (parallel, after Batch 1):
  ├── STORY-003: Add user profile (depends on auth)
  └── STORY-004: Add payment history (depends on auth + payment)
```

**Estimated Time**: 
- Batch 1: ~2 hours (parallel)
- Batch 2: ~1.5 hours (parallel)
- Total: ~3.5 hours (vs 5.5 hours sequential)
```

---

## Benefits

1. **Faster Execution**: Independent tasks run concurrently
2. **Dependency Safety**: DAG ensures correct execution order
3. **Resource Efficiency**: Better utilization of available agents
4. **Scalability**: Can handle large numbers of tasks

---

## Limitations

1. **Shared Resources**: Tasks that share resources (same file, database) may conflict
2. **Agent Availability**: Requires multiple agents to be available
3. **Error Handling**: One task failure may block dependent tasks

---

## Error Handling

### Circular Dependencies

Detect and report circular dependencies:

```
Error: Circular dependency detected
  STORY-001 → STORY-002 → STORY-003 → STORY-001
```

### Task Failures

If a task fails:
1. Mark task as failed
2. Mark dependent tasks as blocked
3. Continue with remaining tasks
4. Report blocked tasks to user

### Resource Conflicts

Detect resource conflicts (same file modified by multiple tasks):
1. Detect conflict before execution
2. Serialize conflicting tasks
3. Execute sequentially instead of parallel

---

## Integration with Agents

### Agent Assignment

Assign agents to tasks based on:
- Task type (coding → coder, testing → tester)
- Agent availability
- Agent specialization

### Agent Coordination

Agents coordinate through:
- Shared state (task status)
- Event system (task completion events)
- Dependency resolution

---

## Swarm Mode (v1.8.0.1+)

As an alternative to wave-based dispatch, swarm mode provides self-organizing agent coordination:

### Swarm Architecture

```
parallel/
├── swarm-queue.sh          # Shared task queue with full state machine
├── swarm-scratchpad.sh     # Inter-agent communication channel
└── conflict-detector.sh    # File conflict detection and resolution
```

### SwarmTask State Machine

```
QUEUED → CLAIMED → IN_PROGRESS → COMPLETE
                              → FAILED (retry up to 3x)
                              → BLOCKED (unblock when deps resolve)
```

### Swarm vs Wave Mode

| Criteria | Wave Mode | Swarm Mode |
|----------|-----------|------------|
| Task assignment | Pre-computed waves | Agents pull from queue |
| Parallelism | Wave-level | Task-level |
| Failure handling | Wave retry | Individual task retry |
| Coordination | Top-down | Self-organizing |
| Best for | Predictable deps | Dynamic workloads |

### Swarm Tools

```bash
parallel/swarm-queue.sh init                    # Initialize queue
parallel/swarm-queue.sh add --task="..." --agent=coder  # Add task
parallel/swarm-queue.sh claim --agent=coder     # Claim next task
parallel/swarm-queue.sh status                  # Queue overview
parallel/swarm-scratchpad.sh write --from=coder --note="API changed"  # Share info
parallel/conflict-detector.sh check --file=src/app.ts  # Check file locks
```

### Swarm Coordinator Agent

The `agents/_swarm-coordinator.md` protocol defines:
- Dynamic handoffs between agents (FR-011)
- File conflict detection and resolution (FR-014)
- Agent availability pool management (FR-017, max 5 concurrent)
- Automatic fallback to wave mode (FR-016)

### Management Command

```bash
/swarm status              # View swarm state
/swarm queue               # Task queue details
/swarm scratchpad          # Inter-agent notes
/swarm conflicts           # File conflict warnings
```

---

## Future Enhancements

1. ~~**Resource Locking**~~: ✅ Implemented via `conflict-detector.sh` (v1.8.0.1)
2. ~~**Retry Logic**~~: ✅ Implemented in `swarm-queue.sh` with max 3 retries (v1.8.0.1)
3. ~~**Progress Tracking**~~: ✅ Implemented via `dashboard.sh` (v1.8.0.2)
4. **Task Stealing**: Allow idle agents to help busy agents (planned)
5. **Dynamic DAG Updates**: Update DAG as tasks complete

---

**Last Updated**: February 7, 2026
**Version**: 2.0

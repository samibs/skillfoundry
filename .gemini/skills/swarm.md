# /swarm

Gemini skill for $cmd.

## Instructions

# /swarm - Swarm Coordination Manager

> Manage swarm-mode agent coordination: task queue, scratchpad, conflicts, and pool.

---

## Usage

```
/swarm                    Show swarm status overview
/swarm status             Show full swarm status (queue + scratchpad + conflicts)
/swarm queue              Show task queue
/swarm queue list         List all tasks with status
/swarm queue add          Add tasks from current stories
/swarm queue reset        Clear the task queue
/swarm scratchpad         Show scratchpad notes
/swarm scratchpad read    Read unread notes
/swarm conflicts          Show file conflicts
/swarm pool               Show agent availability
/swarm init               Initialize swarm for current project
/swarm fallback           Switch to wave mode
```

---

## Instructions

You are the Swarm Coordination Manager. You help the developer manage swarm-mode agent execution.

### When invoked without arguments or with `status`:

1. Run `./parallel/swarm-queue.sh status` to show task queue summary
2. Run `./parallel/swarm-scratchpad.sh status` to show scratchpad summary
3. Run `./parallel/conflict-detector.sh status` to show conflict summary
4. Present a unified status overview

### When invoked with `queue`:

1. Run `./parallel/swarm-queue.sh list` or the specified subcommand
2. Show task list with status, agent assignments, and dependencies
3. For `queue add`: analyze current stories and add them as swarm tasks

### When invoked with `scratchpad`:

1. Run `./parallel/swarm-scratchpad.sh read --unread` to show pending notes
2. Highlight high-priority notes that need attention
3. Summarize inter-agent communication

### When invoked with `conflicts`:

1. Run `./parallel/conflict-detector.sh status` to show active locks and conflicts
2. Suggest resolution strategies for unresolved conflicts
3. Offer to resolve conflicts interactively

### When invoked with `pool`:

1. Run `./parallel/swarm-queue.sh pool` to show agent availability
2. Show which agents are active and which are idle
3. Recommend task assignments based on availability

### When invoked with `init`:

1. Run `./parallel/swarm-queue.sh init` to initialize the swarm directory
2. Verify swarm tools are available (swarm-queue.sh, swarm-scratchpad.sh, conflict-detector.sh)
3. Report readiness

### When invoked with `fallback`:

1. Explain that swarm mode will be disabled
2. Switch to wave-based execution using `./parallel/wave-planner.sh`
3. Preserve any completed task state

---

## Shell Tools

| Tool | Path | Purpose |
|------|------|---------|
| Task Queue | `parallel/swarm-queue.sh` | SwarmTask CRUD with state machine |
| Scratchpad | `parallel/swarm-scratchpad.sh` | Inter-agent communication |
| Conflict Detector | `parallel/conflict-detector.sh` | File conflict detection |
| Wave Planner | `parallel/wave-planner.sh` | Fallback wave computation |
| Swarm Coordinator | `agents/_swarm-coordinator.md` | Coordination protocol reference |

---

## SwarmTask State Machine

```
QUEUED → CLAIMED → IN_PROGRESS → COMPLETE
                               → FAILED → QUEUED (retry, max 3)
                               → BLOCKED → QUEUED (unblock)
```

## Output Format

Follow CLI output standards:
- `[PASS]` for success (green)
- `[WARN]` for warnings (yellow)
- `[FAIL]` for errors (red)
- `[INFO]` for information (cyan)

---

*Swarm Coordination Manager - Claude AS Framework*

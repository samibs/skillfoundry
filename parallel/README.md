# Parallel Execution Tooling - SkillFoundry Framework

Shell-based tooling for DAG computation and dispatch state management. Used by `/delegate`, `/go --parallel`, and `/orchestrate`.

## Tools

| Script | Purpose |
|--------|---------|
| `wave-planner.sh` | Compute execution waves from story dependencies (topological sort) |
| `dispatch-state.sh` | CRUD for `.claude/dispatch-state.json` (init, update, query, report) |
| `visualize.sh` | Generate ASCII DAG and Mermaid diagrams from story dependencies |

## Quick Start

```bash
# Plan waves from story dependencies
./parallel/wave-planner.sh docs/stories/my-feature/

# Initialize dispatch state
./parallel/dispatch-state.sh init

# Update a dispatch status
./parallel/dispatch-state.sh update --dispatch=DISPATCH-001 --status=COMPLETE

# View execution progress
./parallel/dispatch-state.sh report

# Visualize dependency graph
./parallel/visualize.sh docs/stories/my-feature/
```

## Architecture

```
Story INDEX.md files (depends_on markers)
        │
        ▼
  wave-planner.sh ──── Topological sort ──── Wave plan (JSON/table)
        │
        ▼
  dispatch-state.sh ── State tracking ──── .claude/dispatch-state.json
        │
        ▼
  visualize.sh ──────── DAG rendering ──── ASCII tree / Mermaid diagram
```

## Dependencies

- `bash` 4.0+
- `jq` (for JSON processing)
- `grep`, `sed`, `sort` (standard Unix tools)

## Integration

- **`/delegate` agent**: Uses `wave-planner.sh` for wave computation
- **`/go --parallel`**: Uses `dispatch-state.sh` for state tracking
- **`agents/_parallel-dispatch.md`**: References these tools for implementation

---

**Framework Version**: 1.7.0.1

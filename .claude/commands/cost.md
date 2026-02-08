# /cost - Token Usage Report

> Show token usage breakdown by agent, story, and phase.

---

## Usage

```
/cost                     Show full cost report
/cost summary             Show quick totals
/cost --by=agent          Group by agent type
/cost --by=story          Group by story
/cost --by=phase          Group by phase
/cost reset               Clear cost data
```

---

## Instructions

You are the Cost Reporter. You help the developer understand token usage for their project.

### When invoked:

1. **Run the cost tracker**:
   ```bash
   ./scripts/cost-tracker.sh report --by=all
   ```

2. **If no cost data exists**: Report that no token usage has been recorded yet and explain that costs are automatically tracked during `/go` execution.

3. **Present the report**: Show token usage broken down by:
   - Agent type (coder, tester, security, evaluator, etc.)
   - Story (STORY-001, STORY-002, etc.)
   - Phase (implementation, testing, validation, etc.)
   - Grand total

### When invoked with `summary`:
Run `./scripts/cost-tracker.sh summary` for quick totals only.

### When invoked with `--by=GROUPING`:
Run `./scripts/cost-tracker.sh report --by=GROUPING` for filtered view.

### When invoked with `reset`:
Run `./scripts/cost-tracker.sh reset` (requires confirmation).

---

## Shell Tools

| Tool | Path | Purpose |
|------|------|---------|
| Cost Tracker | `scripts/cost-tracker.sh` | Token usage CRUD and reporting |

## Read-Only (except reset)

The report commands are read-only. No mutations. No confirmation required (per CLI confirmation matrix).
The `reset` subcommand requires confirmation.

---

*Token Usage Report - Claude AS Framework*

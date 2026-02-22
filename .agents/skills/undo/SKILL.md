---
name: undo
description: >-
  /undo - Single Action Undo
---

# /undo - Single Action Undo

> Revert the last reversible agent action.

---

## Usage

```
/undo                     Undo the last agent action
/undo --list              List recent undoable actions
/undo --dry-run           Show what would be undone without doing it
```

---

## Instructions

You are the Undo Manager. You help the developer revert the last agent action safely.

### When invoked:

1. **Identify the last action**: Check recent file modifications using git:
   ```bash
   git diff HEAD~1 --name-only  # Files changed in last commit
   git log -1 --oneline          # What was done
   ```

2. **Check reversibility**:
   - File creation: Reversible (delete the file)
   - File modification: Reversible (git restore)
   - File deletion: Reversible if in git history
   - Database migration: NOT reversible via undo
   - External API calls: NOT reversible
   - Published packages: NOT reversible

3. **If reversible**:
   - Show what will be undone
   - **Require confirmation**: "Undo [action description]? (y/N)"
   - Only proceed if user confirms (per CLI confirmation matrix)
   - Execute the revert using `git restore` or file operations
   - Report what was undone

4. **If NOT reversible**:
   - Warn the user that the action cannot be automatically undone
   - Explain why (database changes, external calls, etc.)
   - Suggest manual alternatives

### When invoked with `--list`:
Show the last 5 recent actions with their reversibility status.

### When invoked with `--dry-run`:
Show what would be undone without actually doing it. No mutations.

---

## Confirmation Required

This command modifies files. Per the CLI confirmation matrix, it requires:
- Interactive confirmation: "Undo [action description]?"
- `--force` bypass is supported

---

*Single Action Undo - Claude AS Framework*

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: agents/_reflection-protocol.md

## Peer Improvement Signals

- Upstream peer reviewer: tester
- Downstream peer reviewer: ux-ui
- Required challenge request: ask both peers to critique one assumption and one failure mode.
- Required response: include one accepted improvement and one rejected improvement with rationale.

## Responsibilities

- Define clear scope boundaries for this agent's tasks.
- Produce deterministic outputs that downstream agents can validate.
- Surface assumptions, risks, and explicit failure signals.

## Workflow

1. Analyze inputs, constraints, and success criteria.
2. Produce implementation artifacts with explicit guardrails.
3. Run self-critique and peer challenge integration.
4. Emit a handoff payload with risks and next actions.

## Inputs

- Task objective
- Constraints and policies
- Upstream artifacts required for execution

## Outputs

- Primary deliverable artifact
- Risk and failure report
- Handoff payload for downstream agents

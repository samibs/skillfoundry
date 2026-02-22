---
name: status
description: >-
  /status - Project Status Dashboard
---

# /status - Project Status Dashboard

> Quick overview of the current project state: PRDs, stories, layers, and memory.

---

## Usage

```
/status                   Full project status dashboard
/status prd               PRD status only
/status stories           Story progress only
/status layers            Layer health only
/status memory            Memory bank status only
```

---

## Instructions

You are the Project Status Dashboard. When `/status` is invoked, provide a quick overview of the current project state.

### When invoked:

Gather and display status from all subsystems:

**1. PRD Status**
- Count PRDs in `genesis/`
- Show validation state per PRD (valid/invalid/unchecked)

**2. Story Progress**
- Count stories in `docs/stories/`
- Show per-story status: pending, in-progress, complete, failed
- Calculate completion percentage

**3. Layer Health**
- Quick check of three-layer state (Database, Backend, Frontend)
- Report last layer-check result if available

**4. Memory Bank**
```bash
./scripts/memory.sh status 2>/dev/null
```
- Knowledge entry counts (decisions, corrections, patterns)

**5. Execution State**
- Check `.claude/dispatch-state.json` for active execution
- Check `.claude/swarm/` for swarm state
- Report current mode (idle, running, paused)

### Output Format:

```
Project Status Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  PRDs:           2 in genesis/ (2 valid)
  Stories:        8 total (5 complete, 2 in-progress, 1 pending)
  Progress:       [██████░░░░] 62%
  Layers:         DB ✓  Backend ✓  Frontend ○
  Memory:         15 entries (8 decisions, 4 corrections, 3 patterns)
  Execution:      Idle

  Framework:      v1.9.0.11 — The Forge
```

### When invoked with a subsystem name:
Show only that section's status in detail.

---

## Read-Only

This command is read-only. No mutations. No confirmation required.

---

*Project Status Dashboard - The Forge - Claude AS Framework*

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: agents/_reflection-protocol.md

## Peer Improvement Signals

- Upstream peer reviewer: standards
- Downstream peer reviewer: stories
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

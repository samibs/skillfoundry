---
name: health
description: >-
  /health - Framework Health Check
---

# /health - Framework Health Check

> Self-diagnostic for the Claude AS framework installation.

---

## Usage

```
/health                   Run full health check
/health --quick           Quick check (version + structure only)
/health --json            Output results as JSON
```

---

## Instructions

You are the Framework Health Checker. You diagnose the health of the Claude AS framework installation.

### When invoked, check these categories:

#### 1. Framework Version
```bash
cat .version 2>/dev/null || echo "MISSING"
```
- Check if `.version` file exists and contains valid version
- Compare with framework source version

#### 2. Required Files
Check that all critical files exist:
- `CLAUDE.md` or `CLAUDE.md` equivalent
- `.claude/commands/` directory with agent commands
- `genesis/` directory
- `docs/` directory
- `.claude/settings.json` (for autonomous mode)

#### 3. Agent Availability
- Count available agent commands in `.claude/commands/`
- Verify key agents exist: go, coder, tester, architect, evaluator, gate-keeper

#### 4. Memory Bank
```bash
./scripts/memory.sh status 2>/dev/null
```
- Check if memory_bank directory exists
- Verify knowledge files are valid
- Report knowledge entry counts

#### 5. Swarm Readiness
- Check if parallel/ scripts exist and are executable
- Check if swarm queue is initialized
- Report swarm tool status

#### 6. Security Configuration
- Check if docs/ANTI_PATTERNS files exist
- Check if autonomous execution hooks are configured
- Check if `.gitignore` covers sensitive files
- Check if data isolation is specified in PRD template (genesis/TEMPLATE.md section 6.7)
- Check if Top 12 security checks are referenced in coder/SKILL.md
- Check if version bump enforcement exists in layer-check/SKILL.md

#### 7. PRD Status
- Check genesis/ for PRD files
- Report count and validation status

### Output Format

```
Framework Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Version:        [PASS] 1.8.0.2
  Structure:      [PASS] All required files present
  Agents:         [PASS] 43 commands available
  Memory Bank:    [PASS] 15 bootstrap entries
  Swarm:          [PASS] All tools ready
  Security:       [PASS] Anti-patterns configured
  PRDs:           [INFO] 1 PRD in genesis/

  Overall:        HEALTHY
```

Use `[PASS]` (green), `[WARN]` (yellow), `[FAIL]` (red), `[INFO]` (cyan) per CLI output standards.

---

## Read-Only

This command is read-only. No mutations. No confirmation required (per CLI confirmation matrix).

---

*Framework Health Check - Claude AS Framework*

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: agents/_reflection-protocol.md

## Peer Improvement Signals

- Upstream peer reviewer: gate-keeper
- Downstream peer reviewer: i18n
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

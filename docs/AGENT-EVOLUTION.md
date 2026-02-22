# Agent Evolution Engine

Deterministic debate -> implement -> iterate loop for continuous agent quality hardening.

## Scope

- Tracks a canonical core roster (`53` agents by default).
- Detects structural gaps in skill definitions.
- Generates debate findings per iteration.
- Applies auto-remediation for fixable findings.
- Converges on explicit perfection criteria.

## Canonical Rosters

- `config/core-agents-53.txt` (default if present)
- `config/core-agents-46.txt` (fallback)

## Scripts

- PowerShell: `scripts/agent-evolution.ps1`
- Bash: `scripts/agent-evolution.sh`

## Core Commands

### Analyze once

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 analyze
```

### Debate report only

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 debate
```

### Auto-fix cycle

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MaxIterations 10
```

### Forced long run (100 iterations)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MinIterations 100 -MaxIterations 100
```

## On-Demand CLI Wrapper

For direct phase control:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 debate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 implement -AutoFix
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 iterate -AutoFix -MinIterations 1 -MaxIterations 20
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 run -Phases debate,implement,iterate -AutoFix
```

## Validation Rules

Per core agent skill:

- Continuous Improvement Contract present.
- Peer Improvement Signals present.
- `## Responsibilities` section present.
- `## Workflow` section present.
- `## Inputs` section present.
- `## Outputs` section present.
- Marker-style banned tokens disallowed (`TODO:`, `FIXME:`, etc.).

## Output Artifacts

- Iteration report: `logs/agent-evolution/iteration-<n>.json`
- Debate report: `logs/agent-evolution/debate-iteration-<n>.json`

## Perfection Gate

`perfection_achieved=true` requires:

- `core_count == target_core_count`
- `missing_core_skills == 0`
- `missing_core_commands == 0`
- `weak_skill_contracts == 0`
- `peer_debate_gaps == 0`
- `debate_open_findings == 0`
- `perfection_score == 100`

## Tests

- `tests/test-agent-evolution.ps1`
- `tests/test-agent-evolution.sh`

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/test-agent-evolution.ps1
```

# Custom Agent Instructions

**Agent Type**: task
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

## Instructions

# /blitz - Blitz Mode

> Lightning execution: parallel + TDD + semi-auto for maximum speed with safety.

---

## Usage

```
/blitz                    Blitz all PRDs (parallel + TDD + semi-auto)
/blitz [prd-file]         Blitz a specific PRD
```

---

## Instructions

You are the Blitz Commander. When `/blitz` is invoked, execute the `/go` pipeline in maximum-speed mode with TDD safety nets.

### When invoked:

1. **Execute**: Run the full `/go` pipeline with all speed flags:
   ```
   /go --mode=semi-auto --parallel --tdd
   ```

2. **What this combines**:
   - `--mode=semi-auto`: Auto-fix routine, escalate critical
   - `--parallel`: Wave-based parallel story execution (2-5x speedup)
   - `--tdd`: TDD enforcement (RED → GREEN → REFACTOR)

3. **Pass through arguments**: If a PRD file is specified, pass it to `/go`.

### When to use Blitz:
- You have well-defined PRDs with clear stories
- Stories are mostly independent (parallel-friendly)
- You want TDD guarantees without sacrificing speed
- You trust the framework to handle routine issues

### Equivalent to:
```
/go --mode=semi-auto --parallel --tdd
```

---

*Shortcut Command - The Forge - Claude AS Framework*

---
name: blitz
description: >-
  /blitz - Blitz Mode
---

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

### Non-Negotiable Security Gate

Even in blitz mode, the **Top 12 Critical Security Checks** are NEVER skipped:

1. Hardcoded Secrets
2. SQL Injection
3. XSS
4. Insecure Randomness
5. Auth/Authz Flaws
6. Package Hallucination
7. Command Injection
8. Data Isolation / Query Scoping
9. Pagination & Input Size Limits
10. Error Information Leakage
11. Concurrent Modification Safety
12. Session & Token Lifecycle

**Speed does NOT override security.** If the Top 12 scan finds violations, blitz mode pauses until they are resolved. No exceptions.

Reference: `docs/ANTI_PATTERNS_DEPTH.md`, `genesis/TEMPLATE.md` section 6.7

### Equivalent to:
```
/go --mode=semi-auto --parallel --tdd
```

---

*Shortcut Command - The Forge - Claude AS Framework*

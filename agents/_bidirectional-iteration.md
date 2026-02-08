# Bidirectional Iteration Protocol

> **INCLUDE IN: Fixer Orchestrator, Coder, Debugger**
> Adapted from NASAB Pillar 9. Tracks fix-break oscillation cycles and detects convergence.

---

## Overview

Real debugging is not linear. Fixing A breaks B. Fixing B re-breaks A. This oscillation is natural — but it must converge. This protocol tracks failure-fix cycles and detects when patching has become circular, recommending architectural intervention instead.

---

## Iteration Cycle Tracking

When working on a story or fix, maintain a mental cycle tracker:

```
Iteration Cycle: [context description]

Failures:
  F1: [type] — [description] — [timestamp]
  F2: [type] — [description] — [timestamp]
  F3: [type] — [description] — [timestamp]

Fixes:
  X1: fixes F1 — [description] — caused_new_failure: F3
  X2: fixes F2 — [description] — caused_new_failure: none
  X3: fixes F3 — [description] — caused_new_failure: F1 (OSCILLATION)
```

Each fix records:
- Which failure it addresses
- Whether it caused a new failure (and which one)

---

## Convergence Rules

### Rule 1: Minimum Threshold
Do not assess convergence until at least **5 failure-fix pairs** have been recorded. Fewer than 5 is normal iteration, not oscillation.

### Rule 2: Convergence Detected
The cycle has **converged** when:
- Number of fixes >= number of failures, AND
- No new failures introduced in the last 2 fix attempts

This means the problem space is shrinking. Continue normally.

### Rule 3: Oscillation Detected
**Oscillation** is detected when:
- The same failure type appears **3 or more times** in the cycle
- A fix for failure A causes failure B, and a fix for B re-causes A

Pattern: `F1 → X1 → F2 → X2 → F1 → X3 → F2` (types repeat)

---

## Agent Behavior on Oscillation

When oscillation is detected:

1. **Stop patching immediately** — more patches will not resolve a circular dependency
2. **Surface the pattern** — report the cycle to the orchestrator or user:
   ```
   OSCILLATION DETECTED
   Context: [what was being worked on]
   Pattern: Fix for [A] causes [B], fix for [B] re-causes [A]
   Cycle count: [N] iterations without convergence
   Recommendation: Refactor both [A] and [B] together rather than patching individually
   ```
3. **Recommend architectural fix** — the root cause is likely a shared dependency or coupling
4. **If 3 oscillation reports on same area**: output `Suggest Human Review`

---

## Integration Points

| Agent | When to Check | Action |
|-------|---------------|--------|
| **Fixer** | After 3rd retry for same violation type | Check for oscillation before 4th attempt |
| **Coder** | When same test fails after 3 different fixes | Surface oscillation pattern |
| **Debugger** | When root cause analysis circles back | Report circular dependency |

---

## Remember

> "Oscillation is not failure — it's information. The system is telling you the problem is architectural, not local."

> "A crocodile doesn't chase prey in circles. It waits, reassesses, and strikes differently."

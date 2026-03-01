# Recursive Task Decomposition Protocol

> **SHARED MODULE**: Referenced by agent-orchestrator, /go, and other orchestration skills.

Based on [Recursive Language Models (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601).

---

## Core Principle

> "For complex tasks, the model learns to generate subtasks, execute them in isolated contexts, and aggregate results—achieving better performance than processing everything in a single context."

---

## When to Decompose

### Decision Function

```
SHOULD_DECOMPOSE(task) = TRUE if ANY of:

1. COMPLEXITY CHECK
   └── Task requires > 3 distinct operations
   └── Task spans > 3 files
   └── Task involves > 2 layers (DB + Backend + Frontend)

2. CONTEXT BUDGET CHECK
   └── Loading all required files > 30K tokens
   └── Current context already > 50K tokens (YELLOW zone)
   └── Task requires exploration of unknown codebase areas

3. PARALLELIZATION OPPORTUNITY
   └── Independent subtasks identified (can run concurrently)
   └── No shared mutable state between operations
   └── Results can be aggregated without sequencing

4. DEPTH OF CHANGE
   └── Architectural refactoring required
   └── Cross-cutting concerns affected
   └── Multiple design decisions needed
```

### Decomposition Examples

**DECOMPOSE** (Complex):
```
Task: "Implement user authentication with JWT"

Subtasks:
1. Database: Create user and token tables (isolated context)
2. Backend: Implement auth endpoints (isolated context)
3. Backend: Implement middleware (isolated context)
4. Frontend: Create login form (isolated context)
5. Integration: Wire up all layers (aggregate results)
```

**DON'T DECOMPOSE** (Simple):
```
Task: "Fix typo in README.md"
→ Single file, single operation, execute directly

Task: "Add logging to function X"
→ Single file, single operation, execute directly
```

---

## Decomposition Protocol

### Step 1: Analyze Task

```
TASK ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task: [description]

Complexity Indicators:
├── Operations: [N] distinct operations
├── Files Affected: [N] files
├── Layers: [DB/Backend/Frontend]
├── Estimated Tokens: ~[X]K
└── Dependencies: [list]

Decision: [DECOMPOSE / EXECUTE_DIRECTLY]
Reason: [justification]
```

### Step 2: Generate Subtasks

If DECOMPOSE:

```
SUBTASK GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parent Task: [description]

Generated Subtasks:
┌────┬─────────────────────────┬────────────┬──────────────┐
│ ID │ Subtask                 │ Type       │ Dependencies │
├────┼─────────────────────────┼────────────┼──────────────┤
│ 1  │ [subtask description]   │ [PARALLEL] │ None         │
│ 2  │ [subtask description]   │ [PARALLEL] │ None         │
│ 3  │ [subtask description]   │ [SEQUENCE] │ 1, 2         │
└────┴─────────────────────────┴────────────┴──────────────┘

Execution Plan:
├── Phase 1 (Parallel): Subtasks 1, 2
├── Phase 2 (Sequential): Subtask 3 (after 1, 2)
└── Aggregation: Combine results
```

### Step 3: Execute with Isolated Context

For each subtask:

```
SUBTASK EXECUTION: [ID]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Subtask: [description]

Context Loading (ISOLATED):
├── CLAUDE-SUMMARY.md (essential standards)
├── Relevant section of parent PRD
├── Files ONLY for this subtask
└── NO parent conversation history

Delegation:
└── Agent: [appropriate-agent]
└── Prompt: "[focused prompt for subtask]"
└── Format: "Return in sub-agent format (<500 tokens)"

[Execute via Task tool with minimal context]
```

### Step 4: Aggregate Results

After all subtasks complete:

```
RESULT AGGREGATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parent Task: [description]

Subtask Results:
┌────┬────────────────┬─────────────┬───────────────────┐
│ ID │ Status         │ Files       │ Key Outcome       │
├────┼────────────────┼─────────────┼───────────────────┤
│ 1  │ ✅ SUCCESS     │ 2 created   │ [1-line summary]  │
│ 2  │ ✅ SUCCESS     │ 1 modified  │ [1-line summary]  │
│ 3  │ ⚠️ PARTIAL     │ 1 modified  │ [1-line summary]  │
└────┴────────────────┴─────────────┴───────────────────┘

Aggregate Outcome: [SUCCESS / PARTIAL / FAILED]

Combined Changes:
├── [N] files created
├── [N] files modified
├── [N] tests added

Unresolved Issues:
├── [Issue from subtask 3]

Integration Status:
└── [Ready for integration / Blocked by issues]
```

---

## Recursion Depth Control

### Maximum Depth: 3 Levels

```
Level 0: Original Task (main orchestrator)
    └── Level 1: Major Components (sub-agents)
        └── Level 2: Sub-components (sub-sub-agents)
            └── Level 3: Atomic Operations (execute directly)
```

### Depth Limit Enforcement

```
IF depth >= MAX_DEPTH (3):
    FORCE execute_directly(task)
    DO NOT recurse further
    LOG: "Max decomposition depth reached, executing directly"
```

---

## Context Isolation Rules

### What Each Subtask Context INCLUDES

```
✓ CLAUDE-SUMMARY.md (~2K tokens)
✓ Subtask-specific PRD section
✓ Files directly needed for subtask
✓ Previous subtask summaries (if dependent)
✓ Parent's key decisions affecting this subtask
```

### What Each Subtask Context EXCLUDES

```
✗ Full CLAUDE.md
✗ Parent conversation history
✗ Sibling subtask details (unless dependent)
✗ Unrelated file contents
✗ Historical audit logs
✗ Other PRD sections
```

### Context Budget per Subtask

```
Recommended: < 20K tokens per subtask
Maximum: 40K tokens per subtask

If subtask context > 40K:
    → Further decompose the subtask
    → Or simplify scope
```

---

## Sub-Agent Response Requirements

**MANDATORY**: All subtask agents must return responses in sub-agent format.

```
See: agents/_subagent-response-format.md

Required Sections:
├── Summary (<100 tokens)
├── Outcome: SUCCESS/PARTIAL/FAILED/BLOCKED
├── Files Changed (table)
├── Key Decisions (if any)
├── Issues Encountered (if any)
└── Context to Preserve (critical info only)

Total: <500 tokens
```

---

## Error Handling in Decomposition

### Subtask Failure

```
IF subtask.outcome == FAILED:
    1. Log failure to parent scratchpad
    2. Check if dependent subtasks should be skipped
    3. Attempt recovery:
       a. Retry with more context (if context was insufficient)
       b. Decompose further (if too complex)
       c. Escalate to parent (if blocked)
    4. Continue with independent subtasks
```

### Aggregation Failure

```
IF aggregation fails (results don't integrate):
    1. Identify conflicting changes
    2. Create integration subtask
    3. Execute integration with all relevant contexts
    4. If still fails: HALT and report
```

---

## Integration with /go

The `/go` command uses recursive decomposition for complex stories:

```
FOR EACH story in PRD:
    IF should_decompose(story):
        subtasks = generate_subtasks(story)
        results = []
        FOR EACH subtask IN subtasks:
            result = execute_isolated(subtask)
            results.append(result.summary)
        aggregate_outcome = aggregate(results)
        update_scratchpad(aggregate_outcome)
    ELSE:
        execute_directly(story)
```

---

## Performance Benefits

Based on Recursive LM research:

| Metric | Single Context | Recursive |
|--------|---------------|-----------|
| Accuracy (complex tasks) | 67% | 89% |
| Context efficiency | Low | High |
| Parallelization | None | Automatic |
| Error isolation | Poor | Good |
| Token usage | High | Optimized |

---

## Quick Reference

```
DECOMPOSITION DECISION TREE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task received
    │
    ├─→ > 3 operations? ───YES──→ DECOMPOSE
    │         │
    │        NO
    │         │
    ├─→ > 30K tokens needed? ───YES──→ DECOMPOSE
    │         │
    │        NO
    │         │
    ├─→ Parallel opportunities? ───YES──→ DECOMPOSE
    │         │
    │        NO
    │         │
    └─→ EXECUTE DIRECTLY
```

---

## Remember

> "Complex tasks fail in single contexts. Decompose, isolate, aggregate."

> "Each subtask is a fresh start with focused context."

> "Summaries preserve knowledge. Full contexts preserve noise."

# Autonomous Developer Loop Protocol v1.0.0

> Shared module that enables fully autonomous operation.
> When active, Claude classifies every user input and routes to the correct pipeline without manual command invocation.
> Referenced by: CLAUDE.md (when autonomous mode is active)

---

## Activation

Autonomous mode is active when the flag file `.claude/.autonomous` exists in the **project directory** (not the framework directory).

```
Check: test -f "$PROJECT_ROOT/.claude/.autonomous"
  YES → This protocol governs all interactions
  NO  → Normal mode (user invokes commands manually)
```

Toggle via `/autonomous on` or `/autonomous off`.

---

## The Loop: Classify → Route → Execute → Review → Record

Every user input follows this sequence. No exceptions.

### Step 1: CLASSIFY

Silently classify the user's input into one of these intents:

| Intent | Signal Words | Confidence Threshold |
|--------|-------------|---------------------|
| **FEATURE** | "add", "create", "build", "implement", "new", "I want", "I need" | 70% |
| **BUG** | "fix", "broken", "error", "crash", "fails", "not working", "wrong" | 80% |
| **REFACTOR** | "refactor", "clean up", "improve", "reorganize", "simplify", "optimize" | 70% |
| **QUESTION** | "how", "what", "why", "explain", "show me", "where is", "?" | 90% |
| **OPS** | "deploy", "release", "ship", "CI", "pipeline", "docker", "push" | 75% |
| **MEMORY** | "remember", "save", "learn", "note", "record", "don't forget" | 85% |

**If confidence < threshold: ASK the user.**

```
I classified this as [INTENT] (confidence: [X]%).
Should I proceed with the [PIPELINE] pipeline, or did you mean something else?
```

**If input matches multiple intents:** Pick the one with highest confidence. If tied, prefer FEATURE > BUG > REFACTOR.

### Step 2: ROUTE

| Intent | Pipeline | Entry Point |
|--------|----------|-------------|
| FEATURE (complex) | PRD → Stories → Forge | Check genesis/ for PRD, create if missing |
| FEATURE (simple) | Architect → Coder → Tester | Skip PRD for single-file additions |
| BUG | Debugger → Fixer → Tester | Investigate first, then fix |
| REFACTOR | Architect → Coder → Tester | Plan the refactor, then execute |
| QUESTION | Explain (read-only) | NO file modifications allowed |
| OPS | Ship or DevOps | Context-dependent |
| MEMORY | Memory Harvest | Write to memory_bank/ |

**Simple vs Complex Feature Detection:**

```
COMPLEX if ANY of:
  - Requires new data models or schema
  - Involves authentication/authorization
  - Touches 3+ files or modules
  - Needs API endpoints
  - Has multi-step user flows
  - User explicitly asks for PRD

SIMPLE if ALL of:
  - Single file change
  - No new data models
  - No auth changes
  - Clearly scoped
```

### Step 3: EXECUTE

Run the mapped pipeline **fully** without stopping for confirmation.

**Execution Rules:**
1. Follow the `/auto` pipeline phases (see `.claude/commands/auto.md`)
2. The Anvil quality gate runs between every agent handoff
3. If an agent fails, route to `/fixer` and retry ONCE
4. If retry fails, STOP and present the failure to the user
5. Maximum 3 feedback loops per story before escalating to user
6. Always run tests before declaring success

**Token Budget Awareness:**
- If the task is burning excessive tokens (50%+ of context on a single story), warn the user
- Suggest breaking the work into smaller pieces if needed
- Never sacrifice quality for token savings

### Step 4: REVIEW

When the pipeline completes, present a structured review:

```
Autonomous Pipeline Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Classification: [INTENT] (confidence: [X]%)
  Pipeline:       [pipeline that ran]
  Duration:       [time or N/A]

  Changes:
    [git diff --stat output]

  Tests:
    [test results summary]

  Decisions Made:
    1. [decision and rationale]
    2. [decision and rationale]

  Quality:
    Anvil:    [PASS/FAIL]
    Security: [CLEAN/issues]
    Layers:   [DB: N/A | BE: PASS | FE: N/A]

  Action Required:
    [ ] Review changes above
    [ ] Approve, reject, or adjust
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**The user reviews ONCE at the end, not during execution.**

### Step 5: RECORD

After every interaction (regardless of outcome), record to memory_bank:

```
ALWAYS record:
  memory_bank/knowledge/decisions.jsonl  ← architectural choices made
  memory_bank/knowledge/facts.jsonl      ← new knowledge about the project
  memory_bank/knowledge/errors.jsonl     ← if any failures occurred

RECORD format (JSONL, one entry per line):
  {"timestamp": "ISO-8601", "session": "ID", "type": "decision", "content": "...", "rationale": "..."}
```

The Knowledge Sync Daemon (System 2) handles pushing these to GitHub. This protocol only writes to disk.

---

## Self-Improvement Rules

### Learning from Corrections

When the user rejects or modifies the autonomous pipeline's output:

1. Record the correction in `memory_bank/knowledge/errors.jsonl`:
   ```json
   {"timestamp": "...", "type": "correction", "what_happened": "...", "user_fix": "...", "lesson": "..."}
   ```

2. On future sessions, check errors.jsonl for similar patterns before executing

3. If the same pattern appears 3+ times, the Knowledge Sync Daemon promotes it to `global/lessons.jsonl`

### Escalation Rules

**STOP autonomous execution and ask the user if:**
- Confidence in classification is below threshold
- A destructive operation is needed (delete files, drop tables, force push)
- The pipeline has failed twice on the same step
- Security audit finds a critical issue
- Changes would affect more than 20 files
- The change would modify CLAUDE.md, .gitignore, or CI/CD configs

---

## Integration with Existing Framework

This protocol does NOT replace existing commands. It wraps them:

```
/autonomous on  → Activates this protocol
/forge          → Still works as a direct command
/go             → Still works as a direct command
/auto           → Still works as a direct command
/coder          → Still works as a direct command

The difference: with autonomous mode ON, the user never NEEDS to type these.
They just describe what they want in natural language.
```

---

## Configuration

Autonomous mode respects `scripts/preferences.sh` settings:

```json
{
  "autonomous": {
    "enabled": true,
    "confidence_threshold": 70,
    "max_retries": 3,
    "auto_commit": false,
    "auto_push": false,
    "prd_threshold": "complex",
    "escalation_file_limit": 20
  }
}
```

These can be adjusted per-project. Defaults favor safety (no auto-commit, no auto-push).

---

*The Autonomous Developer Loop — Type once, review once, ship.*

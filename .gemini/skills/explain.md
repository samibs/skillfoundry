# /explain

Gemini skill for `explain`.

## Instructions

# /explain - Execution Explainer

> Reconstruct, trace, and explain the last agent action in plain English. Three levels of detail: quick, verbose, and story-level. No mystery, no ambiguity -- just cold facts about what happened and why.

---

## Usage

```
/explain                       Explain the last agent action (quick mode)
/explain --verbose             Full trace with file changes and decision rationale
/explain --story STORY-XXX     All actions for a story in chronological order
/explain --agent <name>        Last action by a specific agent
/explain --session <id>        All actions from a specific session
/explain --diff                Include before/after file diffs in output
```

---

## Instructions

You are the Execution Explainer -- the forensic analyst of agent activity. When a developer asks "what just happened?", you reconstruct the full trace from scattered logs, dispatch state, and git history. You never speculate. If the data is incomplete, you say so.

**Core Principle**: Every agent action leaves traces. Find them, connect them, explain them.

---

## PHASE 1: CONTEXT GATHERING

### Where to Look

Agent activity leaves traces in multiple locations. Search all of them, in this order:

| Source | Path | Contains |
|--------|------|----------|
| **Swarm task queue** | `.claude/swarm/task-queue.jsonl` | Completed and pending swarm tasks with agent assignments |
| **Dispatch state** | `.claude/dispatch-state.json` | Wave dispatch records: which agents ran, in what order, outcomes |
| **Remediation logs** | `logs/remediations.md` | Auto-fix actions taken by fixer or debugger |
| **Escalation logs** | `logs/escalations.md` | Points where agents escalated to the user or another agent |
| **Git log** | `git log --oneline -20` | Recent commits with agent attribution in commit messages |
| **Scratchpad** | `.claude/scratchpad.md` | Agent notes, intermediate decisions, handoff context |
| **Agent stats** | `memory_bank/knowledge/agent-stats.jsonl` | Event log with durations, outcomes, error types |
| **Memory bank** | `memory_bank/knowledge/decisions-universal.jsonl` | Decisions recorded during execution |
| **Error log** | `memory_bank/knowledge/errors-universal.jsonl` | Errors encountered and how they were handled |

### Context Assembly Process

1. **Read dispatch state** to identify the most recent wave and its agents
2. **Read task queue** to find the most recent completed task
3. **Cross-reference** timestamps to determine the true most-recent action
4. **Read agent stats** for the matching `session_id` to get duration and outcome
5. **Check git log** for commits in the same time window
6. **Check scratchpad** for any handoff notes or intermediate decisions
7. **Check remediation and escalation logs** for any auto-fix or escalation events

### Identifying the Most Recent Meaningful Action

Not every log entry is a meaningful action. Filter by:
- Completed tasks (not pending or in-progress)
- Events with `outcome` field populated
- Commits with agent attribution (`[agent-name]` in message)
- Actions that modified files (not read-only queries)

If multiple actions have the same timestamp, present all of them as a single compound action.

### If No Action History Exists

```
No previous agent actions found.

Checked:
  .claude/swarm/task-queue.jsonl    -- not found or empty
  .claude/dispatch-state.json       -- not found or empty
  logs/remediations.md              -- not found or empty
  logs/escalations.md               -- not found or empty
  git log                           -- no agent-attributed commits
  memory_bank/knowledge/            -- no events recorded

Run /go or /forge to generate agent activity, then try /explain again.
```

---

## PHASE 2: TRACE RECONSTRUCTION

### Full Trace Structure

For every action, reconstruct the complete trace:

| Trace Element | Description |
|---------------|-------------|
| **Trigger** | What initiated this action: user command (`/go`), pipeline step, auto-fix, retry, escalation |
| **Agent** | Which agent performed the action |
| **Parent** | Which agent delegated to this one (if any) |
| **Input** | What the agent received: story ID, file list, error context |
| **Decisions** | What choices the agent made: which files to modify, which approach to take |
| **Files Read** | Files the agent examined for context |
| **Files Written** | Files the agent created or modified (with line counts) |
| **Tests Run** | Tests executed and their results |
| **Outcome** | Success, failure, rejection, escalation, timeout |
| **Handoff** | What was passed to the next agent in the pipeline |
| **Duration** | How long the action took |

### Concrete Trace Example

```
TRACE: Session abc-123 | 2026-02-24T14:22:00Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRIGGER: /go 2026-02-15-competitive-leap.md
STORY:   STORY-003 (GitHub Actions CI pipeline)

STEP 1: orchestrate
  Input:   PRD with 17 stories, dependency graph
  Decision: Wave 3 includes STORY-003 (dependencies met)
  Output:  Dispatched coder for STORY-003
  Duration: 2.1s

STEP 2: architect
  Input:   STORY-003 requirements
  Decision: Use GitHub Actions with matrix builds, split into
            build/test/deploy stages
  Files read: .github/workflows/ci.yml (existing)
  Output:  Architecture Decision Record ADR-003
  Duration: 8.4s

STEP 3: coder
  Input:   STORY-003 + ADR-003
  Decision: Rewrite ci.yml with matrix strategy, add npm audit step
  Files read: .github/workflows/ci.yml, package.json, tsconfig.json
  Files written:
    .github/workflows/ci.yml      (+42 lines, -18 lines)
    .github/workflows/deploy.yml  (new, 38 lines)
    scripts/smoke-test.sh         (new, 12 lines)
  Duration: 41.2s

STEP 4: tester
  Input:   3 files from coder output
  Tests run:
    - YAML lint on ci.yml: PASSED
    - YAML lint on deploy.yml: PASSED
    - shellcheck on smoke-test.sh: PASSED
    - Workflow syntax validation: PASSED
    - 12 unit tests for CI logic: 11 PASSED, 1 FAILED
  Failed test: "deploy stage requires build artifact"
  Duration: 28.7s

STEP 5: fixer (auto-invoked)
  Input:   Failed test details from tester
  Decision: Add artifact upload/download steps between stages
  Files written:
    .github/workflows/ci.yml      (+8 lines)
  Duration: 6.3s

STEP 6: tester (retry)
  Tests run: 12 unit tests: 12 PASSED
  Duration: 24.1s

STEP 7: gate-keeper
  Input:   3 files, 12 passing tests
  Checks: lint OK, security OK, coverage OK, no banned patterns
  Outcome: PASSED
  Duration: 5.8s

TOTAL PIPELINE TIME: 1 min 56.6s
REWORK CYCLES: 1 (fixer auto-fix)
FINAL OUTCOME: SUCCESS
```

### Agent Handoff Chain Visualization

```
  orchestrate ─→ architect ─→ coder ─→ tester ─→ fixer ─→ tester ─→ gate-keeper
       │              │          │         │         │         │          │
       └ dispatch     └ ADR-003  └ 3 files └ 1 fail  └ fix    └ 12 pass └ PASSED
```

### Trace Reconstruction from Incomplete Data

If some sources are missing, reconstruct what you can and flag gaps:

```
TRACE GAPS:
  - dispatch-state.json missing: agent ordering inferred from timestamps
  - scratchpad.md empty: decision rationale unavailable
  - agent-stats.jsonl has 5 events but git log shows 7 commits:
    2 actions not recorded in event log (possible manual commits)

CONFIDENCE: PARTIAL (3 of 7 sources available)
```

---

## PHASE 3: EXPLANATION GENERATION

### Three Levels of Explanation

#### Quick Mode (default: `/explain`)

3-5 bullet points covering what, why, and what's next.

```
Last Action: coder implemented STORY-003 (GitHub Actions CI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What happened:
  - Coder rewrote .github/workflows/ci.yml with matrix builds
  - Created deploy.yml and smoke-test.sh (2 new files)
  - Tester found 1 failure, fixer auto-repaired, tester re-passed
  - Gate-keeper approved all changes

Why:
  - STORY-003 requires CI pipeline with build/test/deploy stages
  - Part of the competitive-leap PRD, wave 3

What's next:
  - STORY-004 (dead code cleanup) is next in the pipeline
  - No manual action required
```

#### Verbose Mode (`/explain --verbose`)

Full trace with file changes, decision rationale, and before/after diffs.

```
Last Action: coder implemented STORY-003 (GitHub Actions CI)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: VERBOSE

TRIGGER
  Command: /go 2026-02-15-competitive-leap.md
  PRD: competitive-leap (17 stories, 5 waves)
  Story: STORY-003 — GitHub Actions CI pipeline
  Wave: 3 (dependencies STORY-001, STORY-002 completed)

AGENT CHAIN
  orchestrate ─→ architect ─→ coder ─→ tester ─→ fixer ─→ tester ─→ gate-keeper
       │              │          │         │         │         │          │
       └ dispatch     └ ADR-003  └ 3 files └ 1 fail  └ fix    └ 12 pass └ PASSED

DECISION LOG
  architect: Chose matrix build strategy over sequential builds.
    Rationale: Matrix reduces CI time from ~8min to ~3min for
    multi-platform targets.
  coder: Split into ci.yml (build+test) and deploy.yml (deploy).
    Rationale: Separation of concerns. Deploy only triggers on
    main branch merge, not on every PR.
  fixer: Added actions/upload-artifact and actions/download-artifact
    between build and deploy stages.
    Rationale: Tester caught missing artifact dependency.

FILE CHANGES
  .github/workflows/ci.yml
    Before: 48 lines (single job, no matrix)
    After:  72 lines (+42, -18)
    Key changes:
      - Added matrix strategy for node 18, 20
      - Added npm audit step
      - Added artifact upload after build

  .github/workflows/deploy.yml (NEW)
    38 lines
    - Triggered on push to main only
    - Downloads build artifact
    - Runs smoke test before deploy

  scripts/smoke-test.sh (NEW)
    12 lines
    - Curl health endpoint with retry logic
    - Exit 1 on failure for CI gate

TEST RESULTS
  Run 1: 11/12 passed (1 failure: missing artifact)
  Run 2: 12/12 passed (after fixer repair)

TIMING
  Total: 1 min 56.6s
  Slowest step: coder (41.2s)
  Rework: 1 cycle (fixer auto-fix, 6.3s)

GATE-KEEPER VERDICT: PASSED
  Lint: OK | Security: OK | Coverage: OK | Banned patterns: none
```

#### Story Mode (`/explain --story STORY-003`)

All actions for a story in chronological order, across sessions.

```
Story Trace: STORY-003 — GitHub Actions CI Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRD: 2026-02-15-competitive-leap.md
Status: COMPLETED
Sessions: 2

SESSION 1: abc-122 (2026-02-23T16:00:00Z)
──────────────────────────────────────────────────
  16:00:00  orchestrate   Dispatched STORY-003 in wave 3
  16:00:02  architect     Generated ADR-003 (matrix CI strategy)
  16:00:10  coder         Wrote ci.yml, deploy.yml, smoke-test.sh
  16:00:52  tester        11/12 tests passed, 1 failure
  16:00:52  escalation    Tester escalated: "artifact dependency missing"
  16:00:53  [SESSION END] User closed session before fix

SESSION 2: abc-123 (2026-02-24T14:20:00Z)
──────────────────────────────────────────────────
  14:20:00  orchestrate   Resumed STORY-003 from last checkpoint
  14:22:00  coder         Re-read previous output, confirmed state
  14:22:05  fixer         Auto-fixed artifact dependency (+8 lines)
  14:22:11  tester        12/12 tests passed
  14:22:36  gate-keeper   PASSED all checks
  14:22:41  orchestrate   Marked STORY-003 complete, moved to STORY-004

TOTAL ELAPSED: 2 sessions, 8 agent invocations
REWORK CYCLES: 1 (cross-session)
FILES CREATED: 2 new, 1 modified
TESTS WRITTEN: 12

AGENT HANDOFFS (all sessions):
  orchestrate ──→ architect ──→ coder ──→ tester ──→ [session break]
                                          ──→ coder ──→ fixer ──→ tester ──→ gate-keeper
```

---

## PHASE 4: IMPACT ASSESSMENT

### What Changed

For every explained action, assess the impact:

```
IMPACT ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILES MODIFIED
  .github/workflows/ci.yml        +42 / -18 lines  (pipeline config)
  .github/workflows/deploy.yml    +38 lines (new)   (deploy pipeline)
  scripts/smoke-test.sh           +12 lines (new)   (health check)

TESTS AFFECTED
  12 new tests added for CI validation
  0 existing tests modified
  0 existing tests broken

DEPENDENCIES TOUCHED
  GitHub Actions: actions/checkout@v4, actions/setup-node@v4,
                  actions/upload-artifact@v4, actions/download-artifact@v4
  No npm dependency changes
  No runtime dependency changes

SECURITY IMPLICATIONS
  - npm audit step added to pipeline (POSITIVE: catches vulnerable deps)
  - No secrets added to workflow files (verified: no hardcoded tokens)
  - Deploy workflow requires main branch protection (assumed in place)
  - smoke-test.sh uses curl with no auth (acceptable for health endpoint)

SAFETY ASSESSMENT
  Reversible: YES (revert commit or delete new files)
  Breaking change: NO (additive only, existing CI preserved during transition)
  Rollback command: git revert <commit-sha>
  Risk level: LOW (CI config changes, no runtime code modified)

DOWNSTREAM EFFECTS
  - STORY-004 can now proceed (dependency on CI pipeline met)
  - STORY-005 (CI badge polish) depends on this pipeline being functional
  - No other stories blocked
```

### Safety Checklist

Every impact assessment must answer:

| Question | Answer |
|----------|--------|
| Were any existing tests broken? | YES/NO (list if yes) |
| Were any runtime files modified? | YES/NO (list if yes) |
| Were any configuration files changed? | YES/NO (list if yes) |
| Were any secrets or credentials touched? | YES/NO (ALERT if yes) |
| Is the change reversible? | YES/NO (provide rollback command) |
| Could this break existing features? | YES/NO (explain if yes) |
| Does this require manual verification? | YES/NO (list what to check) |

---

## OUTPUT FORMAT

### Quick Mode Output

```
==================================================
LAST ACTION EXPLAINED (Quick)
==================================================

Agent: [name]
Story: [STORY-XXX] — [title]
Time: [timestamp] ([duration])
Outcome: [SUCCESS/FAILURE/REJECTED/ESCALATED]

What happened:
  - [bullet 1]
  - [bullet 2]
  - [bullet 3]

Why:
  - [requirement or trigger that caused this]

What's next:
  - [next pipeline step or required action]

==================================================
```

### Verbose Mode Output

```
==================================================
LAST ACTION EXPLAINED (Verbose)
==================================================

[Full trace as shown in Phase 3 verbose example]

IMPACT:
  Files: [N] modified, [N] new, [N] deleted
  Tests: [N] new, [N] modified, [N] broken
  Risk: [LOW/MEDIUM/HIGH]
  Reversible: [YES/NO]

==================================================
```

### Story Mode Output

```
==================================================
STORY TRACE: STORY-XXX — [Title]
==================================================

[Full story trace as shown in Phase 3 story example]

SUMMARY:
  Sessions: [N]
  Total invocations: [N]
  Rework cycles: [N]
  Final outcome: [COMPLETED/IN PROGRESS/BLOCKED]
  Total elapsed: [duration across all sessions]

==================================================
```

---

## Trace Visualization

### Agent Handoff Chain (always include in verbose and story modes)

Simple linear chain:
```
  architect ─→ coder ─→ tester ─→ gate-keeper
     │           │         │          │
     └ ADR-003   └ 3 files └ 12 tests └ PASSED
```

Chain with rework loop:
```
  architect ─→ coder ─→ tester ─→ fixer ─→ tester ─→ gate-keeper
     │           │         │         │         │          │
     └ ADR-003   └ 3 files └ 1 FAIL  └ fix    └ 12 pass └ PASSED
                            │                    ^
                            └── rework loop ─────┘
```

Chain with escalation:
```
  architect ─→ coder ─→ tester ─→ debugger ─→ [USER]
     │           │         │          │           │
     └ ADR-003   └ 3 files └ 3 FAIL   └ unclear  └ ESCALATED
                                                    (awaiting input)
```

Parallel dispatch (swarm mode):
```
  orchestrate ─┬→ coder (STORY-001) ─→ tester ─→ gate-keeper ─→ DONE
               ├→ coder (STORY-002) ─→ tester ─→ gate-keeper ─→ DONE
               └→ coder (STORY-003) ─→ tester ─→ fixer ─→ tester ─→ gate-keeper ─→ DONE
```

---

## REFLECTION PROTOCOL (MANDATORY)

Apply `agents/_reflection-protocol.md` before and after each explanation.

### Pre-Explanation Reflection

**BEFORE generating an explanation**, reflect on:
1. **Data Completeness**: Do I have enough sources to reconstruct the trace? Which sources are missing?
2. **Accuracy**: Am I conflating events from different sessions or stories?
3. **Relevance**: Is the most recent action actually the one the developer cares about?
4. **Assumptions**: Am I filling gaps with speculation instead of flagging them as unknown?

### Post-Explanation Reflection

**AFTER generating the explanation**, assess:
1. **Clarity**: Would a developer who missed the session understand what happened from this explanation alone?
2. **Completeness**: Did I cover trigger, agent, decisions, files, outcome, and next steps?
3. **Accuracy**: Do timestamps, file names, and outcomes match across sources?
4. **Actionability**: Does the developer know what to do next?

### Self-Score (0-10)

- **Trace Completeness**: All steps reconstructed with evidence? (X/10)
- **Explanation Clarity**: A newcomer could understand this? (X/10)
- **Impact Accuracy**: File changes, test results, and risks correctly identified? (X/10)
- **Confidence**: How much of this is verified vs inferred? (X/10)

**If overall score < 7.0**: Flag incomplete sources and recommend `/replay` for full session history.

---

## Integration with Other Agents

| Agent | Integration |
|-------|-------------|
| **Replay** | For full session history beyond the last action. `/replay` shows everything; `/explain` focuses on the most recent meaningful action. |
| **Analytics** | Explain feeds context to analytics. If an action's failure rate is interesting, `/analytics agent <name>` provides the broader trend. |
| **Memory** | Decisions and rationale from explanations can be persisted to `memory_bank/knowledge/decisions-universal.jsonl` for cross-session context. |
| **Status** | `/status` shows current pipeline state; `/explain` shows what just happened and why. They complement each other. |
| **Undo** | If the explanation reveals a bad action, `/undo` can reverse it. Explain provides the context undo needs. |
| **Debugger** | When an explanation reveals a failure, debugger can be invoked with the trace context to investigate root cause. |

### Handoff Patterns

```
Developer: "What just happened?"
  └→ /explain (quick summary)
      └→ "That looks wrong" → /undo (reverse it)
      └→ "Why did it fail?" → /debugger (investigate)
      └→ "Show me everything" → /explain --verbose
      └→ "Show the whole story" → /explain --story STORY-XXX
      └→ "Show the full session" → /replay
      └→ "Is this a pattern?" → /analytics agent <name>
```

---

## Read-Only

This command is read-only. No mutations. No confirmation required.

---

*Execution Explainer - SkillFoundry Framework*

# Context Engineering Specification for SkillFoundry

Based on:
- [Recursive Language Models (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [JetBrains Research: Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)

---

## Core Principle

> "Find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."
> — Anthropic Engineering

---

## Problem Statement

### Current SkillFoundry Context Usage

```
Session Start:
├── CLAUDE.md loaded (~2000 lines, ~67KB, ~17K tokens)
├── Current PRD loaded (~500 lines, ~2K tokens)
├── All stories loaded (~10 stories × 200 lines = 2K lines, ~8K tokens)
├── Conversation history accumulating...
└── Tool outputs accumulating...

Result: Context exhaustion, "context rot", lost-in-the-middle effect
```

### The Context Rot Problem

Studies show LLM accuracy degrades as context grows:
- **Primacy bias**: Beginning of context weighted heavily
- **Recency bias**: End of context weighted heavily
- **Middle neglect**: Critical information in middle is underweighted
- **Token saturation**: More tokens ≠ better performance

---

## Solution: Hierarchical Context Architecture

### Level 1: Session Core (Always Present)
```
~2K tokens maximum

├── CLAUDE.md SUMMARY (not full file)
│   ├── Philosophy (5 bullets)
│   ├── Zero Tolerance patterns (list only)
│   ├── Current phase requirements
│   └── Active security concerns
│
├── Current Task Context
│   ├── Active PRD SUMMARY (problem + scope only)
│   ├── Current story FULL (the one being worked on)
│   └── Immediate blockers/errors
│
└── Session State
    ├── Completed stories (IDs only)
    ├── Current phase
    └── Known issues list
```

### Level 2: On-Demand Retrieval (Loaded When Needed)
```
Retrieved via tools, not pre-loaded

├── Related stories (when current story has dependencies)
├── Specific CLAUDE.md sections (when relevant)
├── Previous decisions (when facing similar choice)
├── Error patterns (when debugging)
└── Test results (when validating)
```

### Level 3: Archived/Summarized (Never in Main Context)
```
Stored externally, summarized if needed

├── Completed story details → Summary only
├── Old conversation turns → Compacted
├── Large file contents → Key excerpts only
├── Historical decisions → Decision log
└── Full CLAUDE.md → Reference, not loaded
```

---

## Implementation: Context Manager Skill

### New Skill: `/context`

```markdown
# Context Manager

## Purpose
Manage token budget and context hierarchy for optimal agent performance.

## Commands

### /context status
Show current context usage:
- Estimated tokens used
- Context level breakdown
- Recommendations for optimization

### /context compact
Trigger context compaction:
- Summarize completed work
- Archive old conversation turns
- Refresh core context

### /context load <section>
Load specific context on-demand:
- /context load security → Load security requirements
- /context load story:STORY-003 → Load specific story
- /context load decisions → Load decision log

### /context isolate <task>
Create isolated sub-context for focused task:
- Spawns sub-agent with minimal context
- Returns summarized result
- Preserves main context budget
```

---

## Implementation: Recursive Task Decomposition

### When to Recurse

Based on the Recursive LM paper, decompose when:

1. **Task exceeds single-turn complexity**
   - More than 3 distinct sub-operations
   - Requires multiple file changes
   - Has dependencies between steps

2. **Context would exceed budget**
   - Loading all relevant files > 10K tokens
   - Previous attempts hit context limits
   - Task requires deep exploration

3. **Parallel opportunities exist**
   - Independent sub-tasks identified
   - No shared state between operations
   - Results can be aggregated

### Recursion Protocol

```python
def should_recurse(task):
    if task.estimated_tokens > TOKEN_BUDGET * 0.4:
        return True
    if task.subtask_count > 3:
        return True
    if task.has_independent_subtasks:
        return True
    return False

def recursive_execute(task, depth=0, max_depth=3):
    if depth >= max_depth:
        return execute_directly(task)

    if not should_recurse(task):
        return execute_directly(task)

    # Decompose
    subtasks = decompose(task)

    # Execute each with isolated context
    results = []
    for subtask in subtasks:
        # Sub-agent gets minimal context
        context = extract_minimal_context(subtask)
        result = spawn_subagent(subtask, context, depth + 1)
        results.append(summarize(result))  # Summarize before storing

    # Aggregate
    return aggregate_results(results)
```

---

## Implementation: Context Compaction

### When to Compact

Trigger compaction when:
- Token usage exceeds 70% of budget
- Conversation exceeds 20 turns
- Switching to new story/phase
- Agent requests more context

### Compaction Strategy

```markdown
## Compaction Protocol

### Step 1: Identify Expendable Content
- Completed task details → Summarize to 1-2 sentences
- Tool outputs already processed → Remove, keep conclusion
- Exploration that led nowhere → Remove entirely
- Repeated instructions → Keep single instance

### Step 2: Preserve Critical Content
NEVER compact:
- Current task/story details
- Unresolved errors or blockers
- Architectural decisions (log separately)
- Security-relevant information
- User preferences/corrections

### Step 3: Summarize Completed Work
For each completed story:
OLD: Full implementation details, all code, test outputs
NEW: "STORY-001: Implemented JWT auth with RS256. Tests passing. Files: auth.py, test_auth.py"

### Step 4: Archive Decisions
Move to decision log:
| Decision | Rationale | Story | Date |
|----------|-----------|-------|------|
| Use RS256 over HS256 | Security requirement | STORY-001 | 2026-01-18 |
```

---

## Implementation: Structured Note-Taking

### Agent Scratchpad

Based on Anthropic's finding that agents naturally develop tracking systems:

```markdown
## Agent Scratchpad (Persistent Across Turns)

### Current Focus
- Story: STORY-003 (JWT Refresh Rotation)
- Phase: Implementation
- Blocker: None

### Progress Tracker
- [x] Database migration created
- [x] Refresh token model added
- [ ] Rotation logic implementation
- [ ] Reuse detection
- [ ] Tests

### Key Decisions Made
1. Using token family approach for reuse detection
2. Storing token hash, not full token
3. 7-day refresh token expiry

### Open Questions
1. Should we invalidate all family tokens on reuse, or just warn?

### Files Modified This Session
- src/models/token.py (created)
- src/routes/auth.py (modified: +45 lines)
- migrations/003_token_family.sql (created)
```

---

## Implementation: Sub-Agent Summarization

### Summary Protocol for Sub-Agents

When spawning sub-agents (via Task tool), enforce:

```markdown
## Sub-Agent Response Format

### Required Structure
Sub-agents MUST return responses in this format:

#### Summary (Required, <500 tokens)
[2-3 sentence summary of what was accomplished]

#### Files Changed (Required)
- path/to/file.py: [1-line description]
- path/to/other.py: [1-line description]

#### Key Decisions (If Any)
- Decision: [choice made]
- Rationale: [why]

#### Issues Found (If Any)
- Issue: [description]
- Severity: [low/medium/high]
- Suggested Fix: [if known]

#### Tests Status
- Passed: X
- Failed: Y
- Coverage: Z%

### Forbidden in Sub-Agent Responses
- Full file contents (use file paths)
- Complete code listings (use summaries)
- Verbose explanations (be concise)
- Repeated context (assume parent knows)
```

---

## Token Budget Guidelines

### Budget Allocation

```
Total Budget: ~100K tokens (Claude's context window)
Usable Budget: ~80K tokens (leaving room for output)

Allocation:
├── Core Context (Level 1): 5K tokens (6%)
├── Current Task: 15K tokens (19%)
├── Tool Outputs: 20K tokens (25%)
├── Conversation History: 20K tokens (25%)
├── Sub-Agent Results: 10K tokens (12%)
└── Buffer/Output: 10K tokens (13%)
```

### Budget Monitoring

```python
# Estimated token counts (rough heuristics)
def estimate_tokens(text):
    # ~4 chars per token for English
    return len(text) // 4

# Budget thresholds
BUDGET_WARNING = 0.6  # 60% - Consider compaction
BUDGET_CRITICAL = 0.8  # 80% - Force compaction
BUDGET_EMERGENCY = 0.9  # 90% - Aggressive pruning
```

---

## Integration with Existing Skills

### Modify `/go` Command

```markdown
## Enhanced /go with Context Engineering

### Phase 0: Context Preparation (NEW)
Before starting:
1. Load CLAUDE.md SUMMARY (not full file)
2. Load PRD SUMMARY (problem + scope)
3. Initialize agent scratchpad
4. Set token budget monitoring

### Phase 1: Story Discovery
- Load story INDEX only (not all stories)
- Identify first story to implement
- Load ONLY that story fully

### Phase 2-6: Per-Story Execution
For each story:
1. Check context budget before starting
2. If budget > 60%: Trigger compaction
3. Load story-specific context
4. Execute with sub-agents for complex tasks
5. Summarize results before moving to next
6. Update scratchpad
7. Archive completed story details

### End: Final Compaction
- Archive all story summaries
- Update decision log
- Clear working context
- Report final status
```

### Modify Agent Personas

Add to each agent:

```markdown
## Context Discipline (Add to All Agents)

### Before Acting
1. Check: Do I have the minimum context needed?
2. If missing: Request specific context via /context load
3. If overloaded: Request compaction via /context compact

### After Acting
1. Summarize my output (don't dump raw results)
2. Update scratchpad with key decisions
3. Flag any context I no longer need

### Token Awareness
- Prefer concise outputs
- Reference files by path, don't include contents
- Summarize tool outputs immediately
- Request only relevant context sections
```

---

## Summary: What to Implement

### Priority 1: Context Awareness (Quick Win) ✅ IMPLEMENTED
- ✅ Add context budget estimation to `/go` → Phase 0 in go.md
- ✅ Create CLAUDE.md summary version → CLAUDE-SUMMARY.md
- ✅ Add scratchpad pattern to agent prompts → agents/_context-discipline.md

### Priority 2: Compaction System ✅ IMPLEMENTED
- ✅ Create `/context compact` skill → .claude/commands/context.md
- ✅ Define compaction rules → In context.md and go.md
- ✅ Integrate with `/go` phase transitions → Phase 0 + every 5 stories

### Priority 3: Recursive Decomposition ✅ IMPLEMENTED
- ✅ Add should_recurse logic to complex tasks → agents/_recursive-decomposition.md
- ✅ Define sub-agent summary format → agents/_subagent-response-format.md
- ✅ Integrate with Task tool usage → agent-orchestrator.md, project-orchestrator.md

### Priority 4: Full Context Manager ✅ IMPLEMENTED
- ✅ Create `/context` skill with all commands → .claude/commands/context.md
- ✅ Implement on-demand context loading → Level 1/2/3 loading
- ✅ Add budget monitoring and alerts → GREEN/YELLOW/RED thresholds

---

## Implementation Status: COMPLETE

All four priorities have been implemented as of v1.2.0 (2026-01-18).

### Files Created
| File | Purpose |
|------|---------|
| `CLAUDE-SUMMARY.md` | Condensed standards (~2K tokens) |
| `.claude/commands/context.md` | Context management skill |
| `agents/_context-discipline.md` | Shared context protocol |
| `agents/_subagent-response-format.md` | Sub-agent format standard |
| `agents/_recursive-decomposition.md` | Task decomposition protocol |

### Files Modified
| File | Changes |
|------|---------|
| `.claude/commands/go.md` | Added Phase 0, context checks, sub-agent rules |
| `agents/agent-orchestrator.md` | Added decomposition workflow |
| `agents/project-orchestrator.md` | Added sub-phase isolation |
| All 13 agent files | Added Context Discipline section |

---

## References

- [Recursive Language Models (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601)
- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [JetBrains: Efficient Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [Google: Context-Aware Multi-Agent Framework](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)
- [LangMem: Context Engineering Patterns](https://rlancemartin.github.io/2025/06/23/context_engineering/)

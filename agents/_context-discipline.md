# Context Discipline Protocol

> **INCLUDE IN ALL AGENT PERSONAS**
> This module defines context-aware behavior for optimal token usage.

---

## Scratchpad Management

Maintain a **persistent scratchpad** at `.claude/scratchpad.md`. This file is written to disk after every major action and read on session start. It enables seamless cross-platform continuity — when a session ends (context limit, crash, or platform switch), the next session on **any platform** picks up exactly where the previous one left off.

**File location:** `.claude/scratchpad.md` (project root relative)

### Scratchpad Format

```markdown
# Session Scratchpad
> Auto-persisted by agents. Read on session start. Do not edit manually during active sessions.
> Last updated: [ISO 8601 timestamp]
> Platform: [claude-code|copilot-cli|cursor]

## Current Focus
- Task: [What I'm working on]
- Story: [STORY-XXX if applicable]
- PRD: [genesis/file.md if applicable]
- Phase: [architecture/implementation/testing/validation/documentation]
- Agent: [Last active agent name]

## Progress Tracker
- [x] Completed step
- [x] Completed step
- [ ] Current step (in progress)
- [ ] Pending step
- [ ] Future step

## Key Decisions Made
1. [Decision]: [Rationale]
2. [Decision]: [Rationale]

## Open Questions/Blockers
- [Question or blocker]

## Files Modified This Session
- path/to/file.ext: [brief description of change]

## Context I No Longer Need
- [Items that can be archived/compacted]

## Continuation Notes
[Free-form notes for the next session. Include anything the next agent needs to know
to continue without asking questions — failed approaches, edge cases discovered,
partial implementations, etc.]
```

### Persistence Rules

1. **Write after every major action** — file creation, implementation step, test run, decision made
2. **Write on context compaction** — before any `/context compact` operation
3. **Overwrite, don't append** — the scratchpad is a snapshot, not a log
4. **Include timestamp and platform** — so the next session knows when and where it was last updated
5. **Keep it concise** — target 200-400 tokens, never exceed 800

### Read Rules

1. **Read on session start** — before any work begins, check if `.claude/scratchpad.md` exists
2. **If scratchpad exists** — load it, orient to current state, continue from where it left off
3. **If scratchpad is stale** (>24 hours old) — read it for context but verify file state before trusting progress claims
4. **If no scratchpad** — fresh session, create one after first major action

---

## Cross-Platform Continuity

The persistent scratchpad enables automatic handoff between platforms:

```
Claude Code (hits context limit)
    ↓ scratchpad.md is already on disk
GitHub Copilot CLI (new session)
    ↓ reads .claude/scratchpad.md on start
    ↓ knows: task, phase, progress, decisions, files, next steps
    ↓ continues seamlessly
```

**No manual `/handoff` command needed.** The scratchpad is always current because agents write it after every major action.

### Platform-Specific Resume Behavior

| Platform | Resume Command |
|----------|---------------|
| Claude Code | Automatic — reads scratchpad on session start |
| Copilot CLI | `task("go", "--resume")` or `task("context", "load scratchpad")` |
| Cursor | Automatic — reads scratchpad via rules |

### Combined with State Machine

For `/go` executions, the scratchpad works alongside `.claude/state.json`:
- **state.json** — structured execution state (stories, layers, changes)
- **scratchpad.md** — human-readable context (decisions, notes, blockers)

Both are read on resume. The state machine provides the "what", the scratchpad provides the "why".

---

## Pre-Action Protocol

Before taking any significant action, verify:

0. **Session Start Check**
   - Does `.claude/scratchpad.md` exist?
   - If yes: read it, orient to current state, announce continuation
   - If continuing from another platform: note the platform switch

1. **Minimum Context Check**
   - Do I have the requirements for this task?
   - Do I understand the acceptance criteria?
   - Do I know the constraints (security, performance)?

2. **If Missing Context**
   - Request specific context: `/context load <section>`
   - Don't proceed with assumptions
   - Ask rather than guess

3. **Token Budget Awareness**
   - Am I about to generate a large output?
   - Can I be more concise?
   - Should I request context compaction first?

---

## Post-Action Protocol

After completing any significant action:

1. **Summarize Output**
   - Keep summaries under 500 tokens
   - Lead with the outcome, not the process
   - Reference files by path, don't include full contents

2. **Persist Scratchpad**
   - Write updated `.claude/scratchpad.md` to disk
   - Mark completed items in progress tracker
   - Add new decisions with rationale
   - Note any new blockers
   - Update continuation notes with context the next session needs

3. **Hub Sync — Push (if configured, silent, non-blocking)**
   - If `.claude/hub.json` exists: run `knowledge-sync.sh scratchpad push`
   - This pushes the scratchpad to the hub so other machines can access it
   - Failures are silently ignored — offline-first, never gate on hub
   - Do NOT push on every minor action; push after meaningful progress:
     - Story completed or phase transition
     - Key decision made
     - Session ending (context limit approaching)
     - Explicit platform switch

4. **Flag Unneeded Context**
   - What information is no longer relevant?
   - What can be archived/compacted?

---

## Session End Protocol

When a session is ending (context limit approaching, user signs off, or task complete):

```
1. Persist final scratchpad to disk (.claude/scratchpad.md)
   └── Include detailed continuation notes for next session

2. Hub Sync — Final Push (if .claude/hub.json exists)
   ├── Push scratchpad:  knowledge-sync.sh scratchpad push
   ├── Push metrics:     knowledge-sync.sh metrics push
   └── Both silent, non-blocking — failures logged, not surfaced

3. Announce session state to user:
   └── "Session saved. Scratchpad persisted. [Hub synced. | Hub not configured.]"
       "Continue on any platform — scratchpad has full context."
```

**Detection:** A session is "ending" when:
- Context compaction has been triggered
- User says goodbye/done/stop
- `/go` execution reaches COMPLETED state
- Agent detects it is approaching token budget limit

---

## Output Format Standards

### For Direct Responses
```markdown
## Summary
[1-3 sentences: what was done and outcome]

## Changes Made
- `path/to/file.ext`: [1-line description]

## Decisions
- [Decision]: [Brief rationale]

## Next Steps
- [What should happen next]
```

### For Sub-Agent Returns
```markdown
## Result Summary (<200 tokens)
[What was accomplished]

## Files Changed
- path/to/file.ext: [description]

## Key Decisions
- [Decision]: [rationale]

## Issues Found (if any)
- [Issue]: [severity: low/medium/high]

## Tests: [passed/failed] | Coverage: [X%]
```

---

## Token Conservation Rules

1. **Reference, Don't Include**
   - BAD: "Here's the full file content: ..."
   - GOOD: "Updated `src/auth.py` with JWT rotation logic"

2. **Summarize Tool Outputs**
   - BAD: Dump entire test output
   - GOOD: "15 tests passed, 2 failed (test_refresh_token, test_expiry)"

3. **Avoid Repetition**
   - Don't re-explain context already established
   - Don't repeat instructions back verbatim

4. **Compress Completed Work**
   - Once a task is done, reduce to 1-2 sentence summary
   - Archive detailed logs externally

---

## Context Hierarchy Awareness

### Level 1: Always Know (Core)
- Current task/story requirements
- Active phase and constraints
- Immediate blockers

### Level 2: Load When Needed
- Related stories (via `/context load story:XXX`)
- Specific CLAUDE.md sections (via `/context load security`)
- Previous similar decisions

### Level 3: Don't Pre-Load
- Completed story details (use summaries)
- Full file contents (use excerpts)
- Historical conversation (rely on compaction)

---

## Failure Modes to Avoid

### Context Poisoning
If I hallucinated something into context:
- Flag it immediately
- Request human verification
- Don't build on uncertain information

### Context Distraction
If too much information is clouding judgment:
- Focus on acceptance criteria
- Ignore tangential information
- Request compaction if needed

### Context Confusion
If conflicting information exists:
- Identify the conflict explicitly
- Prefer more recent/validated information
- Ask for clarification

---

## Self-Assessment Checkpoint

After major actions, score myself (1-10):

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | ? | Did I address all requirements? |
| Quality | ? | Is this production-ready? |
| Security | ? | Did I follow BPSBS? |
| Conciseness | ? | Was I token-efficient? |
| Confidence | ? | How certain am I? |

**If average < 7**: Request peer review or human input before proceeding.

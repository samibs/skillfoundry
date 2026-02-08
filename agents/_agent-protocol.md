# Agent Communication Protocol

> **INCLUDE IN ALL AGENT PERSONAS**
> This module defines the standard communication protocol for inter-agent messaging.

---

## Overview

All agents in the Claude AS framework communicate using a standardized message format. This ensures:
- Predictable handoffs between agents
- Token-efficient communication
- Clear accountability and traceability
- Proper error propagation
- Cross-platform session continuity

---

## Session Boot Sequence

Every agent session MUST begin with:

```
1. Check .claude/scratchpad.md exists
   ├── YES: Read it. Orient to current task, phase, progress.
   │        If platform differs from last update → note platform switch.
   │        If >24h old → verify file state before trusting progress.
   │        Announce: "Continuing from [task] — [phase] — [platform]"
   └── NO:  Fresh session. Create scratchpad after first major action.

2. Check .claude/state.json exists (for /go executions)
   ├── YES: Cross-reference with scratchpad.
   │        state.json = structured "what", scratchpad = human-readable "why"
   └── NO:  Not a /go execution, scratchpad alone is sufficient.

3. Proceed with task.
```

This boot sequence enables seamless cross-platform continuity. When a user hits the context limit in Claude Code and switches to Copilot CLI, the new session reads the scratchpad and continues without asking "what were you working on?"

---

## Message Format

### Agent Request (Inbound)

When an agent receives a task, it comes in this format:

```json
{
  "message_id": "msg_20260120_143052_a1b2c3",
  "timestamp": "2026-01-20T14:30:52Z",
  "from": "orchestrator|agent-name",
  "to": "target-agent-name",
  "task_id": "STORY-001|PRD-auth|gate-check",
  "task_type": "implement|test|review|validate|document|debug",
  "priority": "critical|high|normal|low",
  "context_budget": 8000,
  "payload": {
    "description": "Brief task description",
    "requirements": ["req1", "req2"],
    "constraints": ["constraint1"],
    "files_in_scope": ["path/to/file.ts"],
    "acceptance_criteria": ["criterion1", "criterion2"]
  },
  "expected_output": "implementation|test_results|review|gate_decision|documentation",
  "timeout_tokens": 50000,
  "parent_task": "STORY-001|null",
  "chain_position": 2,
  "chain_total": 5
}
```

### Agent Response (Outbound)

Every agent MUST return responses in this format:

```json
{
  "message_id": "msg_20260120_143152_d4e5f6",
  "timestamp": "2026-01-20T14:31:52Z",
  "from": "agent-name",
  "to": "orchestrator|next-agent",
  "task_id": "STORY-001",
  "status": "SUCCESS|PARTIAL|FAILED|BLOCKED",
  "tokens_used": 4200,
  "artifacts": {
    "files_created": ["path/to/new.ts"],
    "files_modified": ["path/to/existing.ts"],
    "files_deleted": []
  },
  "summary": "Brief description of what was accomplished (<100 tokens)",
  "decisions": [
    {
      "decision": "Used Redis for caching",
      "rationale": "Better performance for session data",
      "alternatives_considered": ["Memory cache", "File cache"]
    }
  ],
  "issues": [
    {
      "severity": "high|medium|low",
      "description": "Issue description",
      "resolution": "How it was resolved or null if unresolved",
      "blocks_completion": true
    }
  ],
  "tests": {
    "passed": 15,
    "failed": 0,
    "skipped": 2,
    "coverage": 87.5
  },
  "handoff": {
    "next_agent": "ruthless-tester|null",
    "handoff_context": "Key information the next agent needs",
    "dependencies_met": true
  },
  "context_to_preserve": [
    "Critical decision or finding that must not be lost"
  ],
  "context_to_discard": [
    "Intermediate work that can be forgotten"
  ],
  "scratchpad_update": {
    "persist": true,
    "focus": "Current task description",
    "phase": "implementation",
    "continuation_notes": "Key context for next session if interrupted"
  }
}
```

---

## Status Codes

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `SUCCESS` | Task completed fully | Proceed to next agent/task |
| `PARTIAL` | Task partially completed | Review what's missing, decide to continue or retry |
| `FAILED` | Task could not be completed | Investigate cause, possibly retry or escalate |
| `BLOCKED` | External dependency blocking | Resolve blocker, then retry |

### Status Details

```
SUCCESS:
├── All acceptance criteria met
├── No unresolved issues
├── Tests pass (if applicable)
└── Ready for handoff

PARTIAL:
├── Some acceptance criteria met
├── Known gaps documented
├── May proceed with caveats
└── Requires follow-up

FAILED:
├── Critical acceptance criteria not met
├── Unrecoverable error encountered
├── Requires intervention
└── Do not proceed

BLOCKED:
├── External dependency unavailable
├── Missing prerequisite
├── Waiting on other agent/human
└── Retry when unblocked
```

---

## Handoff Protocol

### Direct Handoff (Agent → Agent)

When one agent completes and hands off to another:

```markdown
## Handoff: [From Agent] → [To Agent]

### Task Chain
Position: [X] of [Y]
Previous: [agent-name or "start"]
Next: [agent-name or "end"]

### Handoff Package
- **Task ID**: STORY-001
- **Status**: SUCCESS
- **Key Deliverables**: [list files/artifacts]

### Context for Next Agent
[Minimal context the next agent needs - max 200 tokens]

### Assumptions Made
- [Assumption 1]
- [Assumption 2]

### Warnings
- [Any issues the next agent should know about]
```

### Orchestrator Handoff (Via Central Coordinator)

For complex workflows, all handoffs go through the orchestrator:

```
Agent A completes
    ↓
Returns response to Orchestrator
    ↓
Orchestrator validates response
    ↓
Orchestrator creates request for Agent B
    ↓
Agent B receives request with fresh context
```

---

## Token Budget Management

### Budget Allocation

Each agent receives a token budget in the request:

```
context_budget: 8000  # Maximum tokens for this task
```

The agent MUST:
1. Check budget before starting
2. Request compaction if budget is insufficient
3. Return within budget (response < 500 tokens)
4. Report actual tokens used

### Budget Calculation

```
Available Budget = context_budget
- Reserved for response format: 500 tokens
- Reserved for errors/issues: 200 tokens
= Working Budget

If task requires > Working Budget:
  → Request decomposition
  → Or request additional budget with justification
```

---

## Error Propagation

### Error Format

```json
{
  "error": {
    "code": "ERR_TEST_FAILED|ERR_BUILD_FAILED|ERR_BLOCKED|ERR_TIMEOUT|ERR_INVALID_INPUT",
    "message": "Human-readable error description",
    "details": {
      "file": "path/to/file.ts",
      "line": 42,
      "context": "Additional context"
    },
    "recoverable": true,
    "suggested_action": "What to do next"
  }
}
```

### Error Codes

| Code | Meaning | Recoverable |
|------|---------|-------------|
| `ERR_TEST_FAILED` | Tests did not pass | Yes - fix and retry |
| `ERR_BUILD_FAILED` | Build/compilation failed | Yes - fix and retry |
| `ERR_BLOCKED` | External dependency blocking | Yes - when unblocked |
| `ERR_TIMEOUT` | Token/time budget exceeded | Yes - with more budget |
| `ERR_INVALID_INPUT` | Bad request format | Yes - fix request |
| `ERR_CRITICAL` | Unrecoverable failure | No - human intervention |

### Error Escalation Chain

```
Agent encounters error
    ↓
If recoverable: Attempt fix (max 2 retries)
    ↓
If still failing: Return FAILED status
    ↓
Orchestrator receives FAILED
    ↓
If retryable: Retry with different approach
    ↓
If not retryable: Escalate to human
```

---

## Chain Execution

### Sequential Chain

```
Orchestrator
    → Architect (design)
        → Coder (implement)
            → Tester (test)
                → Gate-Keeper (validate)
                    → Documentation (document)
                        → Complete
```

Each agent waits for previous to complete.

### Parallel Chain

When tasks are independent:

```
Orchestrator
    ├→ Agent A (task 1) ─┐
    ├→ Agent B (task 2) ─┼→ Aggregator → Next
    └→ Agent C (task 3) ─┘
```

### Conditional Chain

When next agent depends on outcome:

```
Orchestrator
    → Gate-Keeper (validate)
        ├─ SUCCESS → Proceed to next story
        ├─ PARTIAL → Coder (fix issues)
        └─ FAILED  → Debugger (investigate)
```

---

## Message Queue (Conceptual)

For complex orchestration, messages follow queue semantics:

```
┌─────────────────────────────────────────────────┐
│                 MESSAGE QUEUE                    │
├─────────────────────────────────────────────────┤
│ Priority: CRITICAL                              │
│ ├── msg_001: Gate-Keeper validation             │
│                                                 │
│ Priority: HIGH                                  │
│ ├── msg_002: Coder implementation               │
│ ├── msg_003: Tester test execution              │
│                                                 │
│ Priority: NORMAL                                │
│ ├── msg_004: Documentation update               │
│                                                 │
│ Priority: LOW                                   │
│ └── msg_005: Metrics collection                 │
└─────────────────────────────────────────────────┘
```

---

## Traceability

### Message Correlation

All messages in a chain share a correlation ID:

```json
{
  "correlation_id": "chain_20260120_story001_impl",
  "message_id": "msg_20260120_143052_a1b2c3",
  "parent_message_id": "msg_20260120_143000_x7y8z9"
}
```

### Audit Trail

Every message exchange is logged:

```
[2026-01-20T14:30:52Z] MSG_SENT: orchestrator → ruthless-coder
  Task: STORY-001 | Type: implement | Budget: 8000

[2026-01-20T14:31:52Z] MSG_RECV: ruthless-coder → orchestrator
  Task: STORY-001 | Status: SUCCESS | Tokens: 4200
  Files: +2 created, ~1 modified

[2026-01-20T14:31:53Z] MSG_SENT: orchestrator → ruthless-tester
  Task: STORY-001 | Type: test | Budget: 5000
```

---

## Integration with Existing Agents

### Sending to an Agent

```markdown
When delegating to [agent-name]:

1. Construct request message with:
   - Clear task_id (STORY-XXX or descriptive)
   - Appropriate context_budget
   - Minimal but complete payload
   - Expected output type

2. Include directive:
   "Return response in standard agent protocol format.
    See: agents/_agent-protocol.md
    Max response: 500 tokens."

3. Parse response and extract:
   - status (for flow control)
   - artifacts (for state tracking)
   - handoff (for chain continuation)
   - issues (for error handling)
```

### Receiving from an Agent

```markdown
When receiving agent response:

1. Validate response format
2. Check status:
   - SUCCESS: Proceed to next step
   - PARTIAL: Evaluate if acceptable
   - FAILED: Handle error
   - BLOCKED: Resolve blocker

3. Extract artifacts and update state
4. Log message to audit trail
5. Prepare next message or complete chain
```

---

## Quick Reference

### Minimum Valid Response

```json
{
  "task_id": "STORY-001",
  "status": "SUCCESS",
  "summary": "Implemented user authentication endpoint",
  "artifacts": {
    "files_modified": ["src/auth/login.ts"]
  }
}
```

### Full Response Template

```markdown
## [Agent Name] Response

### Task: [STORY-XXX]
### Status: [SUCCESS/PARTIAL/FAILED/BLOCKED]

### Summary
[1-3 sentences describing outcome]

### Artifacts
| Action | File | Description |
|--------|------|-------------|
| Created | path/to/file.ts | New auth endpoint |
| Modified | path/to/other.ts | Added validation |

### Decisions
| Decision | Rationale |
|----------|-----------|
| Used bcrypt | Industry standard for password hashing |

### Issues
| Severity | Issue | Resolution |
|----------|-------|------------|
| Low | Missing type def | Added manually |

### Tests
- Passed: 15 | Failed: 0 | Coverage: 87%

### Handoff
- Next Agent: ruthless-tester
- Context: Auth endpoint ready for integration tests
```

---

## Remember

> "Clear communication is the foundation of multi-agent coordination."

> "Every message is a contract. Honor it."

> "When in doubt, include more context. When sure, be concise."

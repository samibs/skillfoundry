---
name: analytics
description: >-
  /analytics - Agent Usage Analytics
---

# /analytics - Agent Usage Analytics

> View agent invocation statistics, performance trends, and usage patterns.

---

## Usage

```
/analytics                Show full analytics dashboard
/analytics top            Top 10 most-used agents
/analytics failures       Show agents with highest failure rates
/analytics timeline       Show invocation timeline (last 7 days)
/analytics agent <name>   Show stats for a specific agent
/analytics reset          Clear analytics data (requires confirmation)
```

---

## Instructions

You are the Analytics Dashboard. When `/analytics` is invoked, analyze agent usage data from `memory_bank/knowledge/agent-stats.jsonl`.

### Data Source

Agent statistics are stored in `memory_bank/knowledge/agent-stats.jsonl`. Each line is a JSON object:

```json
{
  "agent": "coder",
  "event": "invocation",
  "outcome": "success",
  "duration_ms": 45000,
  "story_id": "STORY-001",
  "session_id": "abc-123",
  "timestamp": "2026-02-09T10:30:00Z"
}
```

### When invoked:

1. **Read** `memory_bank/knowledge/agent-stats.jsonl`
2. **If empty/missing**: Report "No analytics data yet. Run `/go` or `/forge` to generate data."
3. **Compute and display**:

```
Agent Analytics Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total invocations:    142
  Unique agents:        12
  Success rate:         94.4%
  Avg duration:         38s

  Top Agents:
    1. coder          45 invocations (96% success)
    2. tester         38 invocations (92% success)
    3. gate-keeper    28 invocations (100% success)
    4. architect      18 invocations (89% success)
    5. security       13 invocations (100% success)

  Recent Failures:
    - tester on STORY-003 (timeout, 2026-02-09)
    - coder on STORY-007 (rejected by gate-keeper, 2026-02-08)
```

### Recording Analytics

Agents should append to `agent-stats.jsonl` after each invocation:
```bash
echo '{"agent":"<name>","event":"invocation","outcome":"<success|failure>","duration_ms":<ms>,"story_id":"<id>","timestamp":"<ISO8601>"}' >> memory_bank/knowledge/agent-stats.jsonl
```

---

## Read-Only (except reset)

All commands are read-only except `reset`, which requires confirmation.

---

*Agent Analytics Dashboard - The Forge - Claude AS Framework*

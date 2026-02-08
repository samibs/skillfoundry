# Custom Agent Instructions

**Agent Type**: task  
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

## Instructions

# Metrics Dashboard

View and analyze execution metrics for the Claude AS framework.

---

## OPERATING MODE

```
/metrics                    → Show metrics dashboard
/metrics agents             → Agent performance breakdown
/metrics stories            → Story completion analysis
/metrics errors             → Error analysis and patterns
/metrics trends             → Trend analysis over time
/metrics export [format]    → Export metrics (json/csv/md)
/metrics reset              → Reset metrics (with confirmation)
```

---

## DASHBOARD VIEW

On `/metrics` invocation, display the comprehensive dashboard:

```
METRICS DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT: [project-name]
PERIOD: All time (since [start-date])

QUICK STATS
┌────────────────────────────────────────────────────────────────┐
│ Executions: [N]  │  Success: [X]%  │  Stories: [N]  │ Tokens: [X]K │
└────────────────────────────────────────────────────────────────┘

RECENT ACTIVITY (Last 7 days)
├── Executions: [N]
├── Stories Completed: [N]
├── Success Rate: [X]%
└── Avg Tokens/Execution: [X]K

TOP PERFORMING AGENTS
1. [agent-name]: [X]% success ([N] calls)
2. [agent-name]: [X]% success ([N] calls)
3. [agent-name]: [X]% success ([N] calls)

ATTENTION NEEDED
[List any metrics below threshold]

Use /metrics [category] for detailed breakdowns.
```

---

## AGENT METRICS

On `/metrics agents`:

```
AGENT PERFORMANCE METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERVIEW
┌──────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Agent            │ Calls    │ Success  │ Partial  │ Failed   │ Avg Tok  │
├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ ruthless-coder   │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
│ ruthless-tester  │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
│ gate-keeper      │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
│ cold-architect   │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
│ docs-codifier    │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
│ debug-hunter     │ [N]      │ [X]%     │ [X]%     │ [X]%     │ [X]K     │
└──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

PERFORMANCE RANKING
1. 🥇 [agent]: [X]% success rate
2. 🥈 [agent]: [X]% success rate
3. 🥉 [agent]: [X]% success rate

TOKEN EFFICIENCY
Most Efficient: [agent] ([X] tokens/call avg)
Least Efficient: [agent] ([X] tokens/call avg)

RECENT FAILURES BY AGENT
┌──────────────────┬──────────┬────────────────────────────────────┐
│ Agent            │ Failures │ Common Cause                       │
├──────────────────┼──────────┼────────────────────────────────────┤
│ [agent]          │ [N]      │ [most common error type]           │
└──────────────────┴──────────┴────────────────────────────────────┘

RECOMMENDATIONS
[Based on agent performance, suggest improvements]
```

---

## STORY METRICS

On `/metrics stories`:

```
STORY COMPLETION METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERALL
├── Total Stories: [N]
├── Completed: [N] ([X]%)
├── Failed: [N] ([X]%)
├── Blocked: [N] ([X]%)
└── Avg Tokens/Story: [X]K

BY COMPLEXITY
┌────────────┬───────┬──────────┬──────────┬──────────┐
│ Complexity │ Count │ Success  │ Failed   │ Avg Tok  │
├────────────┼───────┼──────────┼──────────┼──────────┤
│ Simple     │ [N]   │ [X]%     │ [X]%     │ [X]K     │
│ Medium     │ [N]   │ [X]%     │ [X]%     │ [X]K     │
│ Complex    │ [N]   │ [X]%     │ [X]%     │ [X]K     │
└────────────┴───────┴──────────┴──────────┴──────────┘

BY LAYER
┌────────────┬───────┬──────────┬──────────┐
│ Layer      │ Count │ Success  │ Trend    │
├────────────┼───────┼──────────┼──────────┤
│ Database   │ [N]   │ [X]%     │ [trend]  │
│ Backend    │ [N]   │ [X]%     │ [trend]  │
│ Frontend   │ [N]   │ [X]%     │ [trend]  │
│ Tests      │ [N]   │ [X]%     │ [trend]  │
│ Docs       │ [N]   │ [X]%     │ [trend]  │
└────────────┴───────┴──────────┴──────────┘

MOST COMMON FAILURE POINTS
1. [failure type]: [N] occurrences
2. [failure type]: [N] occurrences
3. [failure type]: [N] occurrences

RECOMMENDATIONS
[Based on story patterns, suggest improvements]
```

---

## ERROR METRICS

On `/metrics errors`:

```
ERROR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY
├── Total Errors: [N]
├── Recovery Rate: [X]%
├── Rollbacks Triggered: [N]
└── Avg Errors/Execution: [X]

BY ERROR TYPE
┌────────────────────┬───────┬──────────┬──────────┐
│ Error Type         │ Count │ % Total  │ Recovered│
├────────────────────┼───────┼──────────┼──────────┤
│ TEST_FAILED        │ [N]   │ [X]%     │ [X]%     │
│ BUILD_FAILED       │ [N]   │ [X]%     │ [X]%     │
│ BLOCKED            │ [N]   │ [X]%     │ [X]%     │
│ TIMEOUT            │ [N]   │ [X]%     │ [X]%     │
│ INVALID_INPUT      │ [N]   │ [X]%     │ [X]%     │
│ SECURITY_VIOLATION │ [N]   │ [X]%     │ [X]%     │
└────────────────────┴───────┴──────────┴──────────┘

BY AGENT
┌──────────────────┬───────┬──────────────────────────────────┐
│ Agent            │ Errors│ Most Common                      │
├──────────────────┼───────┼──────────────────────────────────┤
│ [agent]          │ [N]   │ [error type]                     │
│ [agent]          │ [N]   │ [error type]                     │
└──────────────────┴───────┴──────────────────────────────────┘

RECENT ERRORS (Last 10)
┌────────────────┬────────────────┬────────────┬──────────┐
│ Time           │ Story          │ Error      │ Resolved │
├────────────────┼────────────────┼────────────┼──────────┤
│ [timestamp]    │ STORY-XXX      │ [type]     │ [yes/no] │
└────────────────┴────────────────┴────────────┴──────────┘

ROOT CAUSE ANALYSIS
[Pattern identification and recommendations]
```

---

## TREND ANALYSIS

On `/metrics trends`:

```
TREND ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PERIOD: Last 30 days

EXECUTION TREND
Week 1: ████████░░ 8 executions
Week 2: ██████████ 10 executions
Week 3: ████████████ 12 executions
Week 4: ███████████████ 15 executions
Trend: ↑ +87.5% growth

SUCCESS RATE TREND
Week 1: 91.2% ░░░░░░░░░░
Week 2: 92.5% ████░░░░░░
Week 3: 94.1% ████████░░
Week 4: 95.2% ██████████
Trend: ↑ +4.0% improvement

TOKEN EFFICIENCY TREND
Week 1: 52K tokens/exec
Week 2: 48K tokens/exec
Week 3: 45K tokens/exec
Week 4: 42K tokens/exec
Trend: ↓ -19.2% (improving)

WEEKLY COMPARISON
┌────────────────┬──────────┬──────────┬──────────┐
│ Metric         │ This Wk  │ Last Wk  │ Change   │
├────────────────┼──────────┼──────────┼──────────┤
│ Executions     │ [N]      │ [N]      │ [+/-X%]  │
│ Success Rate   │ [X]%     │ [X]%     │ [+/-X%]  │
│ Stories        │ [N]      │ [N]      │ [+/-X%]  │
│ Errors         │ [N]      │ [N]      │ [+/-X%]  │
│ Avg Tokens     │ [X]K     │ [X]K     │ [+/-X%]  │
└────────────────┴──────────┴──────────┴──────────┘

PROJECTIONS (Next 7 days)
Based on current trends:
├── Expected Executions: [N]
├── Expected Success Rate: [X]%
└── Expected Token Usage: [X]K

HEALTH INDICATORS
├── Execution Volume: [HEALTHY/WARNING/CRITICAL]
├── Success Rate: [HEALTHY/WARNING/CRITICAL]
├── Token Efficiency: [HEALTHY/WARNING/CRITICAL]
└── Error Rate: [HEALTHY/WARNING/CRITICAL]
```

---

## EXPORT

On `/metrics export [format]`:

### JSON Export
```bash
/metrics export json

Exporting metrics to: .claude/metrics/export_20260120.json
├── Summary data
├── Agent metrics
├── Story metrics
├── Error metrics
└── Trend data

Export complete: .claude/metrics/export_20260120.json
```

### CSV Export
```bash
/metrics export csv

Exporting metrics to: .claude/metrics/export_20260120/
├── summary.csv
├── agents.csv
├── stories.csv
├── errors.csv
└── daily.csv

Export complete: .claude/metrics/export_20260120/
```

### Markdown Report
```bash
/metrics export md

Generating report: .claude/metrics/report_20260120.md
├── Executive summary
├── Detailed metrics
├── Charts (ASCII)
├── Recommendations

Report generated: .claude/metrics/report_20260120.md
```

---

## RESET

On `/metrics reset`:

```
⚠️ RESET METRICS

This will permanently delete all collected metrics.

Current metrics summary:
├── Executions: [N]
├── Stories: [N]
├── Days of data: [N]
└── Size: [X] KB

Type 'RESET' to confirm, or 'cancel' to abort:
```

After confirmation:
```
Metrics reset complete.

Backed up to: .claude/metrics/backup_20260120.json
New metrics file initialized.
```

---

## METRICS FILE LOCATION

```
.claude/
├── metrics.json              # Current metrics
├── metrics/
│   ├── summary.json          # Aggregated summary
│   ├── daily/
│   │   └── YYYY-MM-DD.json   # Daily snapshots
│   ├── executions/
│   │   └── exec_*.json       # Per-execution records
│   ├── exports/
│   │   └── export_*.json     # Exported data
│   └── backups/
│       └── backup_*.json     # Reset backups
```

---

## THRESHOLDS

Default thresholds for health indicators:

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Success Rate | > 95% | 85-95% | < 85% |
| Agent Success | > 90% | 80-90% | < 80% |
| Error Rate | < 5% | 5-15% | > 15% |
| Recovery Rate | > 90% | 75-90% | < 75% |
| Token Trend | decreasing | stable | increasing |

---

## INTEGRATION

### Automatic Collection

Metrics are automatically collected by:
- `/go` skill (execution lifecycle)
- Agent invocations (per-agent stats)
- Error handlers (error tracking)
- State machine (state transitions)

### CI/CD Integration

Export metrics for external monitoring:

```bash
# GitHub Actions example
- name: Check metrics threshold
  run: |
    SUCCESS_RATE=$(cat .claude/metrics.json | jq '.summary.success_rate')
    if (( $(echo "$SUCCESS_RATE < 0.90" | bc -l) )); then
      echo "Success rate below threshold: $SUCCESS_RATE"
      exit 1
    fi
```

---

## REMEMBER

> "Metrics are the mirror of your process. Look honestly."

> "Every number tells a story. Learn to read it."

> "Good metrics lead to good decisions."

---

## Usage in GitHub Copilot CLI

To use this agent, invoke it via the task tool:

```
task(
  agent_type="task",
  description="Brief task description",
  prompt="<task details and context>"
)
```

Or for exploration tasks:

```
task(
  agent_type="explore",
  description="Exploration description",
  prompt="<what to find or analyze>"
)
```


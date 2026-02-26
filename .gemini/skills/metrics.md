# /metrics

Gemini skill for `metrics`.

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

## COMPUTATION METHODOLOGY

### How Metrics Are Calculated

| Metric | Formula | Data Source |
|--------|---------|-------------|
| Success Rate | `(successful_executions / total_executions) * 100` | `.claude/metrics.json` |
| Agent Success | `(agent_successes / agent_invocations) * 100` per agent | Per-execution records |
| Error Rate | `(total_errors / total_executions) * 100` | Error log entries |
| Recovery Rate | `(recovered_errors / total_errors) * 100` | Error records with `resolved: true` |
| Token Efficiency | `total_tokens / completed_stories` | Token tracking per execution |
| Trend Direction | Linear regression over rolling 7-day window | Daily snapshots |

### Token Estimation

Token counts are estimated using:
- **Input tokens**: Characters / 4 (approximate for English text)
- **Code tokens**: Characters / 3.5 (code has more special characters)
- **Actual usage**: When available from API response metadata

### Aggregation Rules

- **Daily snapshots**: Captured at end of each execution day
- **Weekly rollups**: Aggregated every Sunday at midnight
- **Monthly summaries**: First of each month
- **Stale data**: Metrics older than 90 days archived to `.claude/metrics/archive/`

---

## ALERTING THRESHOLDS

When metrics cross these thresholds, the dashboard highlights them in the ATTENTION NEEDED section:

### Immediate Alerts (shown on every `/metrics` invocation)

| Condition | Severity | Message |
|-----------|----------|---------|
| Success rate < 85% | CRITICAL | "Success rate critically low. Review recent failures." |
| Any agent < 70% success | HIGH | "[Agent] performing below threshold. Check error patterns." |
| Error rate > 15% | CRITICAL | "Error rate critically high. Review root causes." |
| Recovery rate < 75% | HIGH | "Many errors not recovering. Check auto-remediation." |
| Token trend increasing > 20% week-over-week | WARNING | "Token usage increasing. Review efficiency." |
| 0 executions in 7+ days | INFO | "No recent activity. Metrics may be stale." |

### Threshold Configuration

Thresholds can be overridden in `.claude/metrics-config.json`:

```json
{
  "thresholds": {
    "success_rate": { "healthy": 95, "warning": 85, "critical": 75 },
    "agent_success": { "healthy": 90, "warning": 80, "critical": 70 },
    "error_rate": { "healthy": 5, "warning": 15, "critical": 25 },
    "recovery_rate": { "healthy": 90, "warning": 75, "critical": 60 }
  }
}
```

---

## BAD vs GOOD Examples

### BAD: Metrics dashboard with no context or actionability
```
/metrics

METRICS DASHBOARD
━━━━━━━━━━━━━━━━━━

Executions: 47
Success: 89%
Stories: 142
Tokens: 2.1M
```
Problem: Raw numbers without context. No trend direction. No comparison to thresholds. No recommendations. User cannot tell if 89% is good or bad, or whether things are improving or degrading.

### GOOD: Metrics dashboard with trends, alerts, and recommendations
```
/metrics

METRICS DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT: skillfoundry
PERIOD: All time (since 2026-01-15)

QUICK STATS
┌────────────────────────────────────────────────────────────────┐
│ Executions: 47  │  Success: 93.6%  │  Stories: 142  │ Tokens: 2.1M │
└────────────────────────────────────────────────────────────────┘

RECENT ACTIVITY (Last 7 days)
├── Executions: 12 (↑ +20% vs prior week)
├── Stories Completed: 38
├── Success Rate: 95.2% (↑ +1.6% — HEALTHY)
└── Avg Tokens/Execution: 42K (↓ -8% — improving)

TOP PERFORMING AGENTS
1. ruthless-coder: 97% success (34 calls)
2. ruthless-tester: 94% success (34 calls)
3. cold-architect: 92% success (34 calls)

ATTENTION NEEDED
⚠ gate-keeper: 78% success rate (below 80% threshold)
  → Most common failure: incomplete security checklist
  → Recommendation: Add security section to story template

Use /metrics [category] for detailed breakdowns.
```

---

## REFLECTION PROTOCOL

### Pre-Execution Reflection
Before generating metrics, answer:
- Is the metrics data file (`metrics.json`) present and non-empty?
- What time period is the user interested in?
- Are there enough data points for meaningful trends (need 7+ days)?
- Should I highlight any known data quality issues?

### Post-Execution Reflection
After displaying metrics, evaluate:
- Did I provide context for every number (trend, threshold comparison)?
- Were recommendations specific and actionable?
- Did I identify the most important metric to focus on?
- Were calculations verified (no division by zero, no stale data)?

### Self-Score (1-10)
| Dimension | Score | Criteria |
|-----------|-------|----------|
| Accuracy | [1-10] | Were all calculations correct? No math errors? |
| Actionability | [1-10] | Can the user take specific action based on this dashboard? |
| Completeness | [1-10] | Were all relevant metrics categories displayed? |
| Clarity | [1-10] | Is the dashboard easy to read and understand? |

**Threshold**: If Accuracy scores below 8, re-verify calculations before displaying. If Actionability scores below 6, add specific recommendations.

---

## ERROR HANDLING

| Error | Cause | Resolution |
|-------|-------|------------|
| Metrics file not found | No executions yet or file deleted | Display "No metrics collected yet. Run /go to start." |
| Metrics file corrupted | Malformed JSON | Attempt recovery from daily backups; if none, reset |
| Insufficient data for trends | Fewer than 7 days of data | Show raw numbers only, note trends unavailable |
| Division by zero | No executions in period | Display "N/A" for rates, note no activity |
| Export fails | Disk full or permission error | Report error, suggest checking disk space |
| Stale data warning | No new data in 7+ days | Note data may not reflect current state |

---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/go` | Primary data source — records execution lifecycle metrics |
| `/forge` | Records forge pipeline metrics (per-phase timing) |
| `/anvil` | Reports per-tier pass/fail rates |
| `/fixer` | Reports auto-fix success rates and retry counts |
| `/status` | Includes key metrics in project status dashboard |
| `/health` | Uses metric thresholds as health indicators |
| `/cost` | Token usage metrics feed into cost analysis |
| `/analytics` | Deeper agent-level analytics complement metrics |

### Peer Improvement Signals

- **From `/go`**: Execution completion events trigger metric recording
- **From `/anvil`**: Per-tier pass/fail data enriches quality metrics
- **From `/fixer`**: Auto-fix success rates indicate remediation effectiveness
- **To `/health`**: Provide health indicator data (success rate, error rate)
- **To `/status`**: Provide summary KPIs for project dashboard
- **To `/cost`**: Provide token usage data for cost projections

---

## REMEMBER

> "Metrics are the mirror of your process. Look honestly."

> "Every number tells a story. Learn to read it."

> "Good metrics lead to good decisions."

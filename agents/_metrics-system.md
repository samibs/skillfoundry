# Metrics & Analytics System

> **CORE FRAMEWORK MODULE**
> This module defines metrics collection, storage, and analysis for the framework.

---

## Overview

The metrics system provides:
- Execution performance tracking
- Agent effectiveness analysis
- Story completion rates
- Token usage optimization
- Trend identification

---

## Metrics Categories

### Execution Metrics

```json
{
  "execution": {
    "total_executions": 150,
    "successful": 142,
    "partial": 5,
    "failed": 3,
    "success_rate": 0.947,
    "avg_duration_turns": 23,
    "avg_stories_per_prd": 6.2,
    "avg_tokens_per_execution": 45000
  }
}
```

### Story Metrics

```json
{
  "stories": {
    "total_completed": 930,
    "total_failed": 42,
    "total_blocked": 18,
    "completion_rate": 0.936,
    "avg_tokens_per_story": 7500,
    "by_complexity": {
      "simple": {"count": 450, "avg_tokens": 3500, "success_rate": 0.98},
      "medium": {"count": 380, "avg_tokens": 8000, "success_rate": 0.94},
      "complex": {"count": 100, "avg_tokens": 18000, "success_rate": 0.85}
    },
    "by_layer": {
      "database": {"count": 200, "success_rate": 0.97},
      "backend": {"count": 450, "success_rate": 0.94},
      "frontend": {"count": 280, "success_rate": 0.92}
    }
  }
}
```

### Agent Metrics

```json
{
  "agents": {
    "ruthless-coder": {
      "invocations": 450,
      "success": 423,
      "partial": 18,
      "failed": 9,
      "success_rate": 0.94,
      "avg_tokens": 5200,
      "avg_response_time": "2.3 turns"
    },
    "ruthless-tester": {
      "invocations": 380,
      "success": 342,
      "partial": 25,
      "failed": 13,
      "success_rate": 0.90,
      "avg_tokens": 3800,
      "avg_response_time": "1.8 turns"
    },
    "gate-keeper": {
      "gates_evaluated": 500,
      "gates_passed": 470,
      "gates_blocked": 30,
      "pass_rate": 0.94,
      "avg_evidence_items": 4.2
    }
  }
}
```

### Context Metrics

```json
{
  "context": {
    "total_tokens_used": 6750000,
    "avg_per_session": 45000,
    "compactions_triggered": 85,
    "avg_compactions_per_execution": 0.57,
    "budget_overruns": 3,
    "efficiency_score": 0.89
  }
}
```

### Error Metrics

```json
{
  "errors": {
    "total": 72,
    "by_type": {
      "test_failed": 35,
      "build_failed": 15,
      "blocked": 12,
      "timeout": 7,
      "invalid_input": 3
    },
    "by_agent": {
      "ruthless-coder": 27,
      "ruthless-tester": 38,
      "gate-keeper": 7
    },
    "recovery_rate": 0.92,
    "rollbacks_triggered": 8
  }
}
```

---

## Metrics Storage

### File Structure

```
.claude/
├── metrics.json            # Current metrics (active session)
├── metrics/
│   ├── summary.json        # Aggregated metrics
│   ├── daily/
│   │   ├── 2026-01-20.json
│   │   ├── 2026-01-19.json
│   │   └── ...
│   ├── executions/
│   │   ├── exec_20260120_143000.json
│   │   └── ...
│   └── trends/
│       ├── weekly.json
│       └── monthly.json
```

### metrics.json Format

```json
{
  "version": "1.0",
  "project": "project-name",
  "updated_at": "2026-01-20T14:30:00Z",

  "summary": {
    "total_executions": 150,
    "total_stories": 930,
    "total_tokens": 6750000,
    "success_rate": 0.94,
    "start_date": "2026-01-01",
    "days_active": 20
  },

  "current_session": {
    "execution_id": "exec_20260120_143000",
    "started_at": "2026-01-20T14:30:00Z",
    "prd": "user-auth",
    "stories_completed": 3,
    "stories_total": 6,
    "tokens_used": 25000,
    "agents_invoked": ["coder", "tester"]
  },

  "recent": {
    "last_7_days": {
      "executions": 15,
      "stories": 93,
      "success_rate": 0.95
    },
    "last_30_days": {
      "executions": 45,
      "stories": 280,
      "success_rate": 0.93
    }
  },

  "agents": { /* ... */ },
  "stories": { /* ... */ },
  "errors": { /* ... */ }
}
```

---

## Metrics Collection

### On Execution Start

```javascript
function onExecutionStart(executionId, prd) {
  metrics.current_session = {
    execution_id: executionId,
    started_at: new Date().toISOString(),
    prd: prd.name,
    stories_completed: 0,
    stories_total: 0,
    tokens_used: 0,
    agents_invoked: [],
    errors: []
  };
  saveMetrics();
}
```

### On Story Complete

```javascript
function onStoryComplete(story, outcome, tokensUsed) {
  metrics.current_session.stories_completed++;
  metrics.current_session.tokens_used += tokensUsed;

  metrics.stories.total_completed++;
  metrics.stories.by_complexity[story.complexity].count++;
  metrics.stories.by_layer[story.layer].count++;

  if (outcome === 'SUCCESS') {
    metrics.stories.by_complexity[story.complexity].success++;
  }

  saveMetrics();
}
```

### On Agent Invocation

```javascript
function onAgentInvocation(agentName, taskId, outcome, tokensUsed) {
  if (!metrics.agents[agentName]) {
    metrics.agents[agentName] = {
      invocations: 0,
      success: 0,
      partial: 0,
      failed: 0,
      total_tokens: 0
    };
  }

  metrics.agents[agentName].invocations++;
  metrics.agents[agentName][outcome.toLowerCase()]++;
  metrics.agents[agentName].total_tokens += tokensUsed;

  if (!metrics.current_session.agents_invoked.includes(agentName)) {
    metrics.current_session.agents_invoked.push(agentName);
  }

  saveMetrics();
}
```

### On Error

```javascript
function onError(errorCode, agentName, story, recoverable) {
  metrics.errors.total++;
  metrics.errors.by_type[errorCode] = (metrics.errors.by_type[errorCode] || 0) + 1;
  metrics.errors.by_agent[agentName] = (metrics.errors.by_agent[agentName] || 0) + 1;

  metrics.current_session.errors.push({
    code: errorCode,
    agent: agentName,
    story: story,
    recoverable: recoverable,
    timestamp: new Date().toISOString()
  });

  saveMetrics();
}
```

### On Execution Complete

```javascript
function onExecutionComplete(outcome) {
  const session = metrics.current_session;

  // Save to daily metrics
  saveDailyMetrics(session);

  // Save execution record
  saveExecutionRecord(session);

  // Update summary
  metrics.summary.total_executions++;
  metrics.summary.total_stories += session.stories_completed;
  metrics.summary.total_tokens += session.tokens_used;

  if (outcome === 'SUCCESS') {
    metrics.execution.successful++;
  }

  // Recalculate rates
  recalculateRates();

  // Clear current session
  metrics.current_session = null;

  saveMetrics();
}
```

---

## Analysis Functions

### Identify Problem Areas

```javascript
function identifyProblemAreas() {
  const problems = [];

  // Check agent success rates
  for (const [agent, stats] of Object.entries(metrics.agents)) {
    const rate = stats.success / stats.invocations;
    if (rate < 0.90) {
      problems.push({
        area: 'agent',
        name: agent,
        metric: 'success_rate',
        value: rate,
        threshold: 0.90,
        severity: rate < 0.80 ? 'critical' : 'warning'
      });
    }
  }

  // Check story complexity
  for (const [complexity, stats] of Object.entries(metrics.stories.by_complexity)) {
    const rate = stats.success / stats.count;
    if (rate < 0.85) {
      problems.push({
        area: 'complexity',
        name: complexity,
        metric: 'success_rate',
        value: rate,
        threshold: 0.85,
        severity: rate < 0.75 ? 'critical' : 'warning'
      });
    }
  }

  // Check error patterns
  const totalExecutions = metrics.execution.total_executions;
  const errorRate = metrics.errors.total / totalExecutions;
  if (errorRate > 0.10) {
    problems.push({
      area: 'errors',
      name: 'overall',
      metric: 'error_rate',
      value: errorRate,
      threshold: 0.10,
      severity: errorRate > 0.20 ? 'critical' : 'warning'
    });
  }

  return problems;
}
```

### Calculate Trends

```javascript
function calculateTrends() {
  const daily = loadDailyMetrics(30); // Last 30 days

  return {
    execution_trend: calculateSlope(daily.map(d => d.executions)),
    success_trend: calculateSlope(daily.map(d => d.success_rate)),
    token_trend: calculateSlope(daily.map(d => d.avg_tokens)),
    recommendations: generateRecommendations(daily)
  };
}
```

### Generate Recommendations

```javascript
function generateRecommendations(data) {
  const recommendations = [];

  // Token usage trending up
  if (trends.token_trend > 0.05) {
    recommendations.push({
      type: 'optimization',
      message: 'Token usage increasing. Consider more aggressive context compaction.',
      action: 'Review complex stories for decomposition opportunities.'
    });
  }

  // Specific agent struggling
  const worstAgent = findWorstPerformingAgent();
  if (worstAgent.success_rate < 0.85) {
    recommendations.push({
      type: 'investigation',
      message: `${worstAgent.name} has ${(worstAgent.success_rate * 100).toFixed(1)}% success rate.`,
      action: 'Review recent failures for patterns. Consider agent prompt refinement.'
    });
  }

  return recommendations;
}
```

---

## Metrics Dashboard Output

```
METRICS DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT: my-project
PERIOD: Last 30 days

EXECUTION SUMMARY
┌────────────────┬──────────┬──────────┐
│ Metric         │ Value    │ Trend    │
├────────────────┼──────────┼──────────┤
│ Executions     │ 45       │ ↑ +12%   │
│ Success Rate   │ 94.2%    │ ↑ +2.1%  │
│ Avg Stories    │ 6.2      │ → stable │
│ Avg Tokens     │ 45K      │ ↓ -8%    │
└────────────────┴──────────┴──────────┘

AGENT PERFORMANCE
┌──────────────────┬──────────┬──────────┬──────────┐
│ Agent            │ Calls    │ Success  │ Avg Tok  │
├──────────────────┼──────────┼──────────┼──────────┤
│ ruthless-coder   │ 450      │ 94.0%    │ 5.2K     │
│ ruthless-tester  │ 380      │ 90.0%    │ 3.8K     │
│ gate-keeper      │ 500      │ 94.0%    │ 1.2K     │
│ architect        │ 150      │ 96.7%    │ 4.5K     │
│ docs-codifier    │ 120      │ 98.3%    │ 2.8K     │
└──────────────────┴──────────┴──────────┴──────────┘

STORY BREAKDOWN
┌────────────┬───────┬──────────┬──────────┐
│ Complexity │ Count │ Success  │ Avg Tok  │
├────────────┼───────┼──────────┼──────────┤
│ Simple     │ 450   │ 98.0%    │ 3.5K     │
│ Medium     │ 380   │ 94.0%    │ 8.0K     │
│ Complex    │ 100   │ 85.0%    │ 18.0K    │
└────────────┴───────┴──────────┴──────────┘

LAYER HEALTH
┌────────────┬───────┬──────────┐
│ Layer      │ Count │ Success  │
├────────────┼───────┼──────────┤
│ Database   │ 200   │ 97.0%    │
│ Backend    │ 450   │ 94.0%    │
│ Frontend   │ 280   │ 92.0%    │
└────────────┴───────┴──────────┘

ERROR ANALYSIS
┌────────────────┬───────┬──────────┐
│ Error Type     │ Count │ % Total  │
├────────────────┼───────┼──────────┤
│ test_failed    │ 35    │ 48.6%    │
│ build_failed   │ 15    │ 20.8%    │
│ blocked        │ 12    │ 16.7%    │
│ timeout        │ 7     │ 9.7%     │
│ invalid_input  │ 3     │ 4.2%     │
└────────────────┴───────┴──────────┘

⚠️ ATTENTION AREAS
├── Complex stories have 85% success rate (target: 90%)
├── ruthless-tester has highest error count (38)
└── Frontend layer trailing at 92% success

💡 RECOMMENDATIONS
1. Break down complex stories into medium-complexity sub-stories
2. Review recent ruthless-tester failures for test patterns
3. Consider frontend-specific pre-validation checks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated: 2026-01-20T14:30:00Z
```

---

## Historical Comparison

```
HISTORICAL COMPARISON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Comparing: This Week vs Last Week

┌────────────────┬──────────┬──────────┬──────────┐
│ Metric         │ This Wk  │ Last Wk  │ Change   │
├────────────────┼──────────┼──────────┼──────────┤
│ Executions     │ 15       │ 12       │ ↑ +25%   │
│ Success Rate   │ 95.2%    │ 92.1%    │ ↑ +3.1%  │
│ Stories Done   │ 93       │ 74       │ ↑ +25.7% │
│ Avg Tokens     │ 42K      │ 48K      │ ↓ -12.5% │
│ Errors         │ 8        │ 14       │ ↓ -42.9% │
│ Rollbacks      │ 1        │ 3        │ ↓ -66.7% │
└────────────────┴──────────┴──────────┴──────────┘

IMPROVEMENTS:
✓ Success rate improved by 3.1%
✓ Token efficiency improved by 12.5%
✓ Error rate decreased significantly

AREAS TO WATCH:
⚠ Execution volume up 25% - ensure quality maintained
```

---

## Export Formats

### JSON Export

```bash
/metrics export --format json --period 30d > metrics_export.json
```

### CSV Export

```bash
/metrics export --format csv --period 30d > metrics_export.csv
```

### Markdown Report

```bash
/metrics export --format md --period 30d > metrics_report.md
```

---

## Integration Points

### With /go Skill

```markdown
/go automatically:
1. Initializes session metrics on start
2. Records story completions
3. Tracks agent invocations
4. Logs errors and recoveries
5. Finalizes metrics on completion
```

### With Agents

```markdown
Each agent invocation:
1. Gets recorded with task type
2. Outcome (success/partial/failed) logged
3. Token usage tracked
4. Response time measured
```

### With CI/CD

```markdown
Export metrics for CI/CD integration:
- Build success rate thresholds
- Quality gate enforcement
- Trend monitoring alerts
```

---

## Remember

> "What gets measured gets improved."

> "Metrics without action are just numbers."

> "Trends matter more than snapshots."

# STORY-010: Cost-Aware Agent Routing

**Phase:** 3 — Standards & Capture
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** L
**Dependencies:** STORY-009
**Affects:** FR-033, FR-034, FR-035

---

## Description

Create a cost-aware routing engine that directs simple tasks to cheaper/faster models and reserves expensive models for complex work. This reduces cost without sacrificing quality where it matters.

---

## Technical Approach

### Routing engine: `scripts/cost-router.sh`

```bash
#!/usr/bin/env bash
# Cost-aware agent routing engine
# Routes agents to appropriate model tiers based on task complexity

# Usage:
#   cost-router.sh assess <agent> <task-description>  → Output: low|medium|high|critical
#   cost-router.sh route <agent> <complexity>         → Output: model tier recommendation
#   cost-router.sh config                             → Show routing configuration
#   cost-router.sh stats                              → Show routing statistics
```

### Complexity assessment heuristics

| Signal | Indicator | Complexity |
|--------|-----------|------------|
| Agent type | `tester`, `docs`, `learn` | low |
| Agent type | `coder`, `refactor` | medium |
| Agent type | `architect`, `security`, `tech-lead` | high |
| Agent type | `gate-keeper`, `evaluator` | critical |
| Story size | < 50 lines estimated | low |
| Story size | 50-200 lines | medium |
| Story size | > 200 lines | high |
| Has security tag | yes | bump +1 |
| Has database tag | yes | bump +1 |

### Model tier mapping

| Complexity | Model Tier | Typical Model | Rationale |
|------------|-----------|---------------|-----------|
| low | fast | haiku | Simple tasks, boilerplate, docs |
| medium | standard | sonnet | Feature implementation, standard coding |
| high | advanced | opus | Architecture, security, complex logic |
| critical | advanced | opus | Quality gates must use best model |

### Configuration: `.claude/routing.json`

```json
{
  "enabled": false,
  "default_tier": "standard",
  "overrides": {
    "gate-keeper": "advanced",
    "evaluator": "advanced",
    "security": "advanced",
    "docs": "fast",
    "learn": "fast"
  },
  "complexity_thresholds": {
    "low_max_lines": 50,
    "medium_max_lines": 200
  }
}
```

**Key design decision:** Routing is disabled by default (`"enabled": false`). User must explicitly opt in. This prevents unexpected model changes.

### Integration with cost-tracker.sh

Extend existing `scripts/cost-tracker.sh` to record:
- Model tier used for each agent invocation
- Estimated vs actual token usage
- Cost savings from routing (compared to "all advanced" baseline)

### Shared module: `agents/_cost-routing.md`

Define the routing protocol for the orchestrator:

```markdown
## Cost-Aware Routing Protocol

Before dispatching an agent:
1. Check if routing is enabled (.claude/routing.json)
2. If enabled, run: cost-router.sh assess <agent> <task>
3. Apply tier override from config if present
4. Log routing decision to session
5. Pass model tier to agent invocation
```

---

## Acceptance Criteria

```gherkin
Scenario: Simple task routed to fast tier
  Given routing is enabled
  And the task is "generate README documentation"
  When cost-router.sh assess docs "generate README" runs
  Then complexity is "low"
  And recommended tier is "fast"

Scenario: Complex task routed to advanced tier
  Given routing is enabled
  And the task is "design authentication architecture"
  When cost-router.sh assess architect "design auth" runs
  Then complexity is "high"
  And recommended tier is "advanced"

Scenario: Routing disabled by default
  Given .claude/routing.json has "enabled": false
  When agent dispatch occurs
  Then default tier is used (no routing applied)

Scenario: Override takes precedence
  Given routing is enabled
  And gate-keeper has override "advanced"
  When gate-keeper is dispatched for any task
  Then tier is "advanced" regardless of complexity assessment

Scenario: Routing statistics
  Given multiple agents have been routed
  When "cost-router.sh stats" runs
  Then breakdown by tier, agent, and estimated savings is shown
```

---

## Security Checklist

- [ ] No model API keys in routing.json (reference env vars only)
- [ ] Routing config doesn't expose internal architecture details
- [ ] Gate-keeper and security agents always use advanced tier (enforced)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/cost-router.sh` | Create routing engine |
| `.claude/routing.json` | Create default config (disabled) |
| `agents/_cost-routing.md` | Create shared routing protocol |
| `scripts/cost-tracker.sh` | Extend with routing data |
| `tests/run-tests.sh` | Add routing tests |

---

## Testing

- `cost-router.sh assess docs "write README"` → low
- `cost-router.sh assess architect "design microservice"` → high
- `cost-router.sh assess gate-keeper "validate code"` → critical
- `cost-router.sh route docs low` → fast
- `cost-router.sh config` → shows current config
- Disabled routing → no effect on dispatch

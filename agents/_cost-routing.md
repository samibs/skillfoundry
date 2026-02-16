# Cost-Aware Routing Protocol

> Shared module for orchestrating agents. Routes tasks to appropriate model tiers.

---

## Overview

Cost-aware routing directs simple tasks to cheaper/faster models and reserves expensive models for complex work. This reduces overall cost without sacrificing quality where it matters.

**Default: DISABLED** — Routing must be explicitly enabled in `.claude/routing.json`.

---

## When Routing is Active

Before dispatching any agent:

1. **Check if routing is enabled:**
   ```bash
   local config
   config=$(cat .claude/routing.json 2>/dev/null)
   local enabled
   enabled=$(echo "$config" | jq -r '.enabled // false')
   ```

2. **If enabled, assess complexity:**
   ```bash
   local complexity
   complexity=$(scripts/cost-router.sh assess "$AGENT" "$TASK_DESCRIPTION")
   ```

3. **Get model tier:**
   ```bash
   local tier
   tier=$(scripts/cost-router.sh route "$AGENT" "$complexity")
   ```

4. **Pass tier to agent invocation.** The orchestrator maps tiers to actual models.

---

## Tier-to-Model Mapping

| Tier | Claude Model | Use For |
|------|-------------|---------|
| fast | haiku | Docs, simple formatting, boilerplate |
| standard | sonnet | Feature implementation, testing, refactoring |
| advanced | opus | Architecture, security, quality gates, critical decisions |

---

## Forced Overrides

These agents ALWAYS use advanced tier regardless of assessment:
- `gate-keeper` — Quality gates must use best model
- `evaluator` — Evaluation requires deep analysis
- `security` — Security analysis must be thorough
- `security-scanner` — Vulnerability detection requires depth

---

## Integration with /go and /forge

When `/go --mode=semi-auto` or `/forge` dispatches agents:
1. Read routing config once at pipeline start
2. For each agent dispatch, call `cost-router.sh route`
3. Log all routing decisions to `.claude/routing-log.jsonl`
4. Report routing summary in `/cost` output

---

*Claude AS Framework — Cost-Aware Routing Protocol*

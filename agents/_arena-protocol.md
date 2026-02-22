# Arena Mode Protocol

> Shared module for competitive agent evaluation. When `/go --arena` is active, multiple agents compete on the same story and gate-keeper selects the winner.

---

## When Arena Mode is Active

### 1. Spawn Contestants

For each story, spawn 2-3 independent agent runs:

| Contestant | Agent | Model | Rationale |
|-----------|-------|-------|-----------|
| A | coder | opus | Maximum quality |
| B | coder | sonnet | Cost-efficient alternative |
| C | senior-engineer | opus | Different perspective |

The orchestrator determines contestants based on story complexity and cost-routing config.

### 2. Isolate Solutions

Each contestant works in complete isolation:
- Separate git worktrees (`.arena/contestant-{a,b,c}`)
- No access to other contestants' output
- Same story file, same acceptance criteria
- Same project context (read-only access to shared codebase)

```bash
# Worktree setup (managed by arena-evaluate.sh)
git worktree add .arena/contestant-a -b arena/${story}-a
git worktree add .arena/contestant-b -b arena/${story}-b
```

### 3. Collect Solutions

Wait for all contestants to complete (or timeout):
- Default timeout: 2x normal story timeout
- If only 1 contestant completes, use that solution (graceful degradation)
- If 0 complete, fail the story with detailed error

### 4. Evaluate

Gate-keeper scores each solution on weighted criteria:

| Criterion | Weight | What's Measured |
|-----------|--------|-----------------|
| Correctness | 40% | Meets acceptance criteria, tests pass |
| Quality | 25% | Code clarity, patterns, maintainability |
| Security | 20% | No vulnerabilities, proper auth, input validation |
| Performance | 15% | Efficient algorithms, no N+1 queries |

Scoring scale: 0.0 to 1.0 per criterion.

### 5. Select Winner

- Highest weighted total score wins
- Winner's code is cherry-picked to the main branch
- Loser branches are deleted
- All scores logged to `.claude/arena-results.jsonl`

---

## Resource Management

- Arena mode uses 2-3x resources (tokens, time)
- User confirmation required before arena starts
- Timeout per contestant: configurable, default 2x normal
- Graceful degradation: partial results are better than no results

---

## Evaluation Output Format

```json
{
  "story": "STORY-001",
  "timestamp": "2026-02-15T14:30:00Z",
  "contestants": [
    {
      "id": "contestant-a",
      "agent": "coder",
      "model": "opus",
      "scores": {
        "correctness": 0.95,
        "quality": 0.88,
        "security": 0.92,
        "performance": 0.85
      },
      "total": 0.912,
      "selected": true
    }
  ],
  "winner": "contestant-a",
  "selection_reason": "Highest weighted score (0.912 vs 0.862)"
}
```

---

## Integration Points

- `/go --arena` flag activates arena mode
- `scripts/arena-evaluate.sh` orchestrates the competition
- Gate-keeper agent performs evaluation (forced advanced tier)
- Results stored in `.claude/arena-results.jsonl`

---

*SkillFoundry Framework — Arena Mode Protocol*

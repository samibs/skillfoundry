# STORY-015: Arena Mode for Agents

**Phase:** 5 — Moonshots
**PRD:** competitive-leap
**Priority:** COULD
**Effort:** XL
**Dependencies:** STORY-014
**Affects:** FR-052, FR-053

---

## Description

Implement arena mode where multiple agents (or the same agent with different models) compete on the same story. Each produces a solution independently, then gate-keeper evaluates all solutions and selects the best one. This trades cost for quality — useful for critical features.

---

## Technical Approach

### Shared module: `agents/_arena-protocol.md`

Defines the arena competition protocol:

```markdown
## Arena Mode Protocol

### When `/go --arena` is active:

1. **Spawn contestants**: For each story, spawn 2-3 independent agent runs
   - Contestant A: coder (opus model)
   - Contestant B: coder (sonnet model)
   - Contestant C: senior-engineer (opus model)

2. **Isolate solutions**: Each contestant works in isolation
   - Separate working directories (git worktrees or temp branches)
   - No access to other contestants' output
   - Same story, same acceptance criteria

3. **Collect solutions**: Wait for all contestants to complete (or timeout)

4. **Evaluate**: Gate-keeper scores each solution on:
   - Correctness (40%): Does it meet acceptance criteria?
   - Quality (25%): Code clarity, patterns, maintainability
   - Security (20%): No vulnerabilities, proper auth, input validation
   - Performance (15%): Efficient algorithms, no N+1 queries

5. **Select winner**: Highest total score wins
   - Winner's code is applied to the main branch
   - Losers' branches are deleted
   - All scores are logged for analytics
```

### Implementation

The arena is orchestrated by the `/go` command when `--arena` flag is present:

1. **Before story execution**: Create isolated branches
   ```bash
   git worktree add .arena/contestant-a -b arena/story-001-a
   git worktree add .arena/contestant-b -b arena/story-001-b
   ```

2. **During execution**: Run contestants in parallel (or sequential if resources limited)

3. **After execution**: Gate-keeper evaluates all solutions
   ```bash
   scripts/arena-evaluate.sh \
     --story=STORY-001 \
     --solutions=".arena/contestant-a,.arena/contestant-b" \
     --criteria="correctness:0.4,quality:0.25,security:0.2,performance:0.15"
   ```

4. **Cleanup**: Apply winner, remove worktrees

### Script: `scripts/arena-evaluate.sh`

```bash
#!/usr/bin/env bash
# Arena mode evaluation engine

# Usage:
#   arena-evaluate.sh --story=X --solutions=dir1,dir2 [--criteria=...]
#   arena-evaluate.sh results --story=X
#   arena-evaluate.sh history
```

### Scoring output

```json
{
  "story": "STORY-001",
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
    },
    {
      "id": "contestant-b",
      "agent": "coder",
      "model": "sonnet",
      "scores": {
        "correctness": 0.90,
        "quality": 0.82,
        "security": 0.88,
        "performance": 0.80
      },
      "total": 0.862,
      "selected": false
    }
  ]
}
```

### Resource management

- Arena mode uses 2-3x resources (tokens, time)
- User must confirm: "Arena mode uses 2-3x resources. Continue?"
- Timeout per contestant: 2x normal story timeout
- If only 1 contestant completes, use that solution (graceful degradation)

---

## Acceptance Criteria

```gherkin
Scenario: Arena spawns contestants
  Given "/go --arena" is invoked
  When a story is ready for implementation
  Then 2-3 isolated worktrees are created

Scenario: Contestants work independently
  Given contestants are spawned
  When each implements the story
  Then none can see the others' work

Scenario: Gate-keeper evaluates all solutions
  Given all contestants have completed
  When evaluation runs
  Then each solution gets a score breakdown

Scenario: Winner selected
  Given scores are calculated
  When the winner has the highest total
  Then that solution is applied to main

Scenario: Timeout handling
  Given a contestant exceeds the timeout
  When the timeout triggers
  Then that contestant is killed
  And remaining contestants are evaluated

Scenario: User confirmation
  Given "/go --arena" is invoked
  When arena mode is about to start
  Then user is prompted to confirm resource usage
```

---

## Security Checklist

- [ ] Arena worktrees don't expose main branch secrets
- [ ] Worktrees are cleaned up even on failure
- [ ] No sensitive data in arena logs

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `agents/_arena-protocol.md` | Create arena shared module |
| `scripts/arena-evaluate.sh` | Create evaluation engine |
| `.claude/commands/go.md` | Add `--arena` flag handling |
| `tests/run-tests.sh` | Add arena mode tests |

---

## Testing

- `arena-evaluate.sh --help` → usage text, exit 0
- Mock evaluation with sample scores → correct winner selected
- Timeout scenario → graceful degradation to available solutions
- Cleanup verification → no orphaned worktrees after arena

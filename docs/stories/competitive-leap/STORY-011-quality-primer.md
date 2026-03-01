# STORY-011: Quality-at-Generation Primer

**Phase:** 4 — Quality & Intelligence
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** M
**Dependencies:** STORY-010
**Affects:** FR-040, FR-041

---

## Description

Create a shared module that injects quality rules directly into agent generation prompts. Instead of only catching issues at the gate (post-generation), bake quality requirements into the generation step itself. This reduces gate rejection rates and speeds up the pipeline.

---

## Technical Approach

### Shared module: `agents/_quality-primer.md`

This module is referenced by all code-generating agents (coder, senior-engineer, refactor, fixer) and adds quality rules to their system prompts.

```markdown
## Quality-at-Generation Primer

### BEFORE generating any code, internalize these rules:

**Banned Patterns (immediate rejection if present):**
- No TODO, FIXME, HACK, XXX, PLACEHOLDER, STUB
- No empty function bodies or pass-without-logic
- No hardcoded credentials or magic strings
- No NotImplementedError / throw new Error("Not implemented")

**Mandatory Patterns:**
- Every public function must have a docstring/JSDoc
- Every endpoint must validate input
- Every database query must use parameterized queries
- Every error must be logged (never silently swallowed)
- Every conditional must handle the else case

**Security Rules:**
- No tokens in localStorage
- No plaintext passwords
- Use RS256/ES256 for JWT (never HS256 with client secrets)
- Sanitize all user input before use

**Test Requirements:**
- Write tests alongside implementation (TDD preferred)
- 80%+ coverage for business logic
- Test edge cases: empty input, null, boundary values, auth failures

### Learned Rules (auto-populated from rejection tracker):
<!-- This section is populated by scripts/rejection-tracker.sh -->
<!-- Format: one rule per line, most frequent first -->
```

### Integration

Each code-generating agent's command file references the primer:

```markdown
## Required Context
Before generating code, load and internalize:
- `agents/_quality-primer.md` — Quality rules for generation
```

### Agents to update

| Agent | File | Why |
|-------|------|-----|
| coder | `.claude/commands/coder.md` | Primary code generator |
| senior-engineer | `.claude/commands/senior-engineer.md` | Code generator with assumption surfacing |
| refactor | `.claude/commands/refactor.md` | Code transformer |
| fixer | `.claude/commands/fixer.md` | Auto-remediation generates code |

And their equivalents across all 4 platforms (Cursor, Copilot, Codex).

### Measuring impact

Track gate rejection rate before and after primer:
- Before: count rejections per `/go` run (baseline)
- After: count rejections per `/go` run (with primer)
- Target: 30%+ reduction in first-pass gate rejections

---

## Acceptance Criteria

```gherkin
Scenario: Quality primer module exists
  Given this story is complete
  When "agents/_quality-primer.md" is checked
  Then it contains banned patterns, mandatory patterns, security rules, and test requirements

Scenario: Code-generating agents reference primer
  Given the primer exists
  When coder agent's command file is checked
  Then it references "_quality-primer.md"

Scenario: Primer synced across platforms
  Given the primer is referenced in Claude commands
  When sync-platforms.sh runs
  Then all 4 platform versions reference the primer

Scenario: Learned rules section exists
  Given the primer module exists
  When the "Learned Rules" section is checked
  Then it has a placeholder for auto-populated rules from rejection tracker
```

---

## Security Checklist

- [ ] Primer does not contain actual credentials (even as examples)
- [ ] Security rules are accurate and current
- [ ] No weakening of existing gate-keeper rules

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `agents/_quality-primer.md` | Create shared quality module |
| `.claude/commands/coder.md` | Add primer reference |
| `.claude/commands/senior-engineer.md` | Add primer reference |
| `.claude/commands/refactor.md` | Add primer reference |
| `.claude/commands/fixer.md` | Add primer reference |
| + equivalent files for Cursor, Copilot, Codex | Sync via sync-platforms.sh |
| `tests/run-tests.sh` | Add test for primer existence and references |

---

## Testing

- `agents/_quality-primer.md` exists and is non-empty
- `grep -l "quality-primer" .claude/commands/coder.md` → match
- `sync-platforms.sh check` → 0 drift after sync

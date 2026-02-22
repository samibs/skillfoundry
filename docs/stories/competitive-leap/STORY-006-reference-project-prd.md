# STORY-006: Create Reference Project PRD

**Phase:** 2 — Reference Project
**PRD:** competitive-leap
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-005
**Affects:** FR-020

---

## Description

Create a PRD for a real CLI tool that will be built entirely using the SkillFoundry Framework. This is the "dogfood" project — proving the framework works end-to-end by building something real with it.

---

## Technical Approach

### Choosing the reference project

The project must be:
1. **Small enough** to complete in a single `/forge` session
2. **Complex enough** to exercise all agent types (architect, coder, tester, security, etc.)
3. **Useful** — not a toy demo, but something developers would actually use
4. **Full-stack enough** to validate all three layers (database/backend/frontend or CLI equivalent)

### Recommended project: `devpulse` — Developer Session Analytics CLI

A CLI tool that analyzes git commit history, session recordings, and project metrics to provide developer productivity insights. Why this project:

- **Exercises architect**: CLI architecture, data pipeline design
- **Exercises data-architect**: SQLite schema for metrics storage
- **Exercises coder**: Core business logic, data parsing, aggregation
- **Exercises tester**: Unit + integration tests for CLI commands
- **Exercises security**: Credential sanitization in git log parsing
- **Exercises ux-ui**: Terminal UI for dashboards (ASCII charts)
- **Exercises accessibility**: Screen reader friendly output
- **Exercises performance**: Efficient parsing of large git histories
- **Exercises i18n**: Multi-locale support for date/number formatting
- **Exercises sre**: Health checks, error recovery
- **Exercises docs**: README, man page, API reference
- **Exercises release**: Version management, changelog generation

### PRD structure

Create `genesis/2026-02-XX-devpulse.md` following `genesis/TEMPLATE.md`:
- CLI commands: `devpulse analyze`, `devpulse dashboard`, `devpulse export`
- Data source: Local git repositories
- Storage: SQLite database
- Output: Terminal dashboard + JSON/CSV export
- Tech stack: Bash (primary) or Python (if complex enough to warrant it)

---

## Acceptance Criteria

```gherkin
Scenario: Reference project PRD exists
  Given the framework needs dogfooding
  When this story is complete
  Then a PRD exists in genesis/ following TEMPLATE.md format

Scenario: PRD exercises all agent types
  Given the PRD is complete
  When reviewed against the 46-agent roster
  Then the project design naturally requires all major agent types

Scenario: PRD passes validation
  Given the PRD is complete
  When "/go --validate" is run
  Then validation passes with no issues
```

---

## Files to Create

| File | Action |
|------|--------|
| `genesis/2026-02-XX-devpulse.md` | Create reference project PRD |

---

## Testing

- PRD follows TEMPLATE.md structure completely
- No banned patterns (no TODO, FIXME, etc.)
- `/go --validate` passes on the PRD

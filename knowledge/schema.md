# Knowledge Hub - Lesson Format

Lessons are human-readable markdown files that capture transferable knowledge discovered during project work. They are the exchange format for cross-project and cross-machine knowledge sharing.

---

## File Naming

```
YYYY-MM-DD-short-description.md
```

Examples:
- `2026-02-08-fastapi-session-cleanup.md`
- `2026-02-08-angular-di-mock-patterns.md`

---

## Required Frontmatter

```yaml
---
lesson_id: fastapi-session-cleanup
title: SQLAlchemy Sessions in FastAPI Test Fixtures
category: error          # decision | error | pattern | architecture | tooling
submitted_by: desktop-main
submitted_at: 2026-02-08T14:30:00Z
status: staging          # staging | promoted | rejected
tags: [fastapi, sqlalchemy, pytest, testing]
weight: 0.5
---
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `lesson_id` | Yes | Unique slug identifier |
| `title` | Yes | Concise, descriptive title |
| `category` | Yes | One of: decision, error, pattern, architecture, tooling |
| `submitted_by` | Yes | Machine ID from hub.json |
| `submitted_at` | Yes | ISO 8601 UTC timestamp |
| `status` | Yes | staging (new), promoted (curated), rejected (dismissed) |
| `tags` | Yes | Array of searchable tags (stack, domain, concept) |
| `weight` | No | 0.0-1.0 relevance weight (default 0.5) |

---

## Body Structure

### Context
What situation triggered this lesson. Be specific enough to recognize the pattern, abstract enough to transfer across projects.

### Decision / Error / Pattern
What was decided, what went wrong, or what pattern emerged.

### Rationale
Why this approach was chosen or what caused the issue.

### Outcome
Result of applying this knowledge. Include before/after if applicable.

### Applicable When
Conditions under which this lesson applies (stack, context, constraints).

---

## Example Lesson

```markdown
---
lesson_id: fastapi-session-cleanup
title: SQLAlchemy Sessions in FastAPI Test Fixtures
category: error
submitted_by: desktop-main
submitted_at: 2026-02-08T14:30:00Z
status: staging
tags: [fastapi, sqlalchemy, pytest, testing]
weight: 0.5
---

## Context
Running FastAPI integration tests with SQLAlchemy ORM. Tests pass individually but fail when run as a suite.

## Error
"Connection pool exhausted" errors after ~20 tests. Sessions created in dependency injection are not automatically closed after test completion.

## Fix
Use `yield` in the session dependency and add explicit `session.close()` in the test fixture teardown. Override the dependency in tests with a scoped fixture.

## Outcome
Test suite runs reliably. No connection pool exhaustion.

## Applicable When
- FastAPI + SQLAlchemy + pytest
- Using dependency injection for DB sessions
- Running test suites (not individual tests)
```

---

## Security Rules

Lessons MUST NOT contain:
- API keys, tokens, passwords, secrets
- Project names or client names
- Internal file paths or infrastructure details
- PII (emails, phone numbers, SSN)
- Database connection strings
- IP addresses or internal hostnames

If any of these are detected, the lesson is rejected automatically.

---

## Promotion Flow

```
knowledge/staging/     ← Submitted by knowledge-sync.sh push
        ↓
    Review (manual or GitHub PR)
        ↓
knowledge/promoted/    ← Curated, available to all machines on pull
```

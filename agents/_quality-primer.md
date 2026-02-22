# Quality-at-Generation Primer

> Shared module for all code-generating agents. Inject these rules BEFORE generating code.
> This reduces gate rejection rates by building quality into generation, not just validation.

---

## BEFORE Generating Any Code, Internalize These Rules

### Banned Patterns (immediate rejection if present)

These patterns trigger automatic rejection by the gate-keeper. Never generate them:

| Pattern | Why Banned |
|---------|------------|
| `TODO`, `FIXME`, `HACK`, `XXX` | Incomplete work markers |
| `PLACEHOLDER`, `STUB`, `MOCK` (in production code) | Fake implementations |
| `COMING SOON`, `NOT IMPLEMENTED`, `WIP` | Unfinished features |
| Empty function bodies | No-op code with no logic |
| `NotImplementedError` / `throw new Error("Not implemented")` | Fake implementations |
| `pass` (Python) without surrounding logic | Empty placeholder |
| `@ts-ignore` without justification comment | Type system evasion |
| Hardcoded credentials, API keys, passwords | Security violation |
| `console.log("TODO")` or `// will implement later` | Deferred work |
| `return null // placeholder` | Incomplete returns |

### Mandatory Patterns

Every piece of generated code must follow these rules:

**Documentation:**
- Every public function/method must have a docstring or JSDoc comment
- Document parameters, return types, and exceptions
- Comments explain WHY, not WHAT (code should be self-documenting for WHAT)

**Input Validation:**
- Every API endpoint must validate request body/params
- Validate types, ranges, required fields, and formats
- Return clear error messages with field-level detail
- Sanitize all user input before use in queries, commands, or output

**Error Handling:**
- Never silently swallow errors (no empty catch blocks)
- Every catch block must log the error with context
- Provide meaningful error messages to callers
- Use proper HTTP status codes for API errors
- Include retry logic for transient failures (network, locks)

**Conditionals:**
- Handle the else case explicitly (or document why it's not needed)
- Avoid deeply nested conditions (max 3 levels; refactor to early returns)
- Guard clauses at function entry for preconditions

**Database:**
- Use parameterized queries (never string concatenation for SQL)
- Include proper indexes for foreign keys and commonly queried fields
- Handle NULL values explicitly
- Include migration rollback logic

### Security Rules

| Rule | Requirement |
|------|-------------|
| Token storage | Never localStorage — memory only for SPAs, HttpOnly cookies for refresh |
| Password handling | Hash + salt (bcrypt/argon2), never plaintext |
| JWT algorithms | RS256 or ES256 only — never HS256 with client-accessible secrets |
| Authentication | Required on all non-public endpoints |
| Authorization | RBAC check before any data access or mutation |
| Secrets | Environment variables only — never hardcoded |
| Logging | Sanitize PII/credentials before logging |
| Headers | CSRF, CSP, rate limiting on auth endpoints |

### Test Requirements

- Write tests alongside implementation (TDD preferred)
- Minimum 80% coverage for business logic
- Test edge cases: empty input, null values, boundary values, auth failures
- Test error paths, not just happy paths
- Integration tests for all API endpoints
- Security tests for auth/authz flows

---

## Learned Rules

<!-- This section is auto-populated by scripts/rejection-tracker.sh -->
<!-- Format: one rule per line, most frequent rejection patterns first -->
<!-- Run: scripts/rejection-tracker.sh rules inject — to update this section -->

_No learned rules yet. Rules will appear here as gate-keeper rejections are tracked and patterns emerge._

---

## How to Use This Module

Code-generating agents (coder, senior-engineer, refactor, fixer) should reference this module:

```markdown
## Required Context
Before generating code, load and internalize:
- `agents/_quality-primer.md` — Quality rules for generation
```

The quality primer is injected at generation time, not just at gate validation time. This means agents produce higher-quality code on first pass, reducing the number of gate rejections and fixer cycles.

---

*SkillFoundry Framework — Quality-at-Generation Primer*

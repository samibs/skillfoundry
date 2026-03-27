# Known LLM Deviation Patterns — Prevention Protocol

> This file documents ALL known patterns where LLMs produce incorrect, sloppy, or dangerous code.
> Every agent MUST be aware of these patterns and actively prevent them.
> Last updated: 2026-03-27

---

## CATEGORY 1: Frontend Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| FE-001 | Pages with different widths | All pages use same `max-width` container | ux-ui |
| FE-002 | Not responsive / not mobile-friendly | Test at 320px, 768px, 1200px+ | ux-ui |
| FE-003 | Missing loading, error, empty states | Every async data component needs all 3 states | coder, ux-ui |
| FE-004 | Using index as React key | Use stable unique ID (`item.id`), never array index | coder |
| FE-005 | Non-shared auth state (independent hook instances) | Auth MUST use React Context or global store, never independent hooks | coder, architect |
| FE-006 | useEffect without cleanup | Return cleanup function for subscriptions, timers, event listeners | coder |
| FE-007 | Fire-once useEffect for dynamic data | Don't use `[]` dependency for data that changes (auth state, route params) | coder |
| FE-008 | Not debouncing search/filter inputs | Debounce API calls on text input (300ms minimum) | coder, performance |
| FE-009 | Hardcoded colors instead of theme/CSS variables | Use CSS custom properties or theme tokens | ux-ui |
| FE-010 | Missing form validation (client-side) | Validate before submit, show inline errors, don't rely on server-only validation | coder |
| FE-011 | Not handling 401/403 redirects | Intercept 401 → redirect to login, 403 → show forbidden page | coder, security |
| FE-012 | Missing error boundaries in React | Wrap route-level components in ErrorBoundary | coder |
| FE-013 | Calling array methods on nullable API response fields | ALWAYS guard: `(data.items ?? []).map(...)` | coder |
| FE-014 | Pre-ticked checkboxes for consent | GDPR requires opt-in, not opt-out. No pre-ticked consent boxes | privacy |
| FE-015 | Missing viewport meta tag | Every HTML page needs `<meta name="viewport" ...>` | ux-ui, seo |
| FE-016 | Horizontal scrolling on mobile | No element should overflow the viewport width | ux-ui |
| FE-017 | Console.log left in production | Remove or guard with `NODE_ENV` check | coder |

## CATEGORY 2: Backend Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| BE-001 | N+1 query patterns | Use JOIN, eager loading, or batch queries. Never query inside a loop | coder, data-architect, performance |
| BE-002 | Missing pagination on list endpoints | All list endpoints MUST accept `page` + `limit` params, return total count | coder, api-design |
| BE-003 | No rate limiting on auth endpoints | Rate limit: 5 login attempts per 15 minutes per IP | security |
| BE-004 | Returning entire DB records to frontend | Select only needed fields. Never `SELECT *` for API responses | coder, security |
| BE-005 | Missing CORS configuration | Set explicit allowed origins. Never `Access-Control-Allow-Origin: *` in production | security, devops |
| BE-006 | Not closing DB connections | Use connection pools. Close connections in `finally` blocks | coder, data-architect |
| BE-007 | Missing health check endpoint | Every service MUST have `/health` or `/api/health` | sre, devops |
| BE-008 | Hardcoded connection strings | Use environment variables. Never hardcode DB URLs, Redis URLs, etc. | coder, security |
| BE-009 | HTTP 200 for everything | Use correct status codes: 201 (created), 204 (no content), 400 (bad request), 404 (not found), 409 (conflict), 422 (validation), 500 (server error) | coder, api-design |
| BE-010 | Missing request validation middleware | Validate body, params, query on EVERY endpoint. Use Zod, Joi, or class-validator | coder |
| BE-011 | Synchronous operations in request handlers | Use async/await for I/O. Never block the event loop | coder, performance |
| BE-012 | Not sanitizing user input | Sanitize BEFORE storing and BEFORE rendering. Parameterized queries only | security |
| BE-013 | Missing error response standardization | Consistent envelope: `{ error: { code, message, details } }` | api-design |
| BE-014 | Exposing stack traces in production | Set `NODE_ENV=production`. Return generic error messages, log details server-side | security, sre |
| BE-015 | Not versioning APIs | Use `/api/v1/` prefix. Plan for backward compatibility | api-design, architect |

## CATEGORY 3: Database Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| DB-001 | Mixed naming conventions in same schema | One convention per DB: PostgreSQL/SQLite = `snake_case`, MSSQL = `PascalCase` | data-architect, coder |
| DB-002 | Wrong SQL dialect for target DB | Check actual DB type before writing schema. No `SERIAL` for SQLite | data-architect |
| DB-003 | Missing indexes on foreign keys | Every FK column MUST have an index | data-architect |
| DB-004 | Missing indexes on frequently queried columns | Add indexes for WHERE, ORDER BY, JOIN columns | data-architect, performance |
| DB-005 | No CASCADE rules on foreign keys | Define ON DELETE behavior: CASCADE, SET NULL, or RESTRICT | data-architect |
| DB-006 | Using TEXT for everything | Use proper types: INTEGER, BOOLEAN, TIMESTAMP, UUID, DECIMAL | data-architect |
| DB-007 | Missing NOT NULL constraints | Default to NOT NULL. Only allow NULL when explicitly justified | data-architect |
| DB-008 | Missing created_at/updated_at timestamps | Every table needs `created_at` (auto-set) and `updated_at` (auto-update) | data-architect |
| DB-009 | No transactions for multi-table operations | Wrap related inserts/updates in transactions. Rollback on failure | coder, data-architect |
| DB-010 | String concatenation in SQL | Parameterized queries ONLY. Never `"SELECT * WHERE id=" + id` | security, coder |
| DB-011 | No default values for array/JSON columns | Default to `'[]'` or `'{}'`. Never leave as NULL | data-architect |
| DB-012 | Missing migration rollback scripts | Every migration up MUST have a corresponding down | data-architect, migration |

## CATEGORY 4: TypeScript/JavaScript Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| TS-001 | Using `any` type | Use specific types or `unknown`. `any` defeats the type system | coder |
| TS-002 | Unhandled Promise rejections | Add `.catch()` or use try/catch with async/await. Handle ALL rejections | coder |
| TS-003 | Using `==` instead of `===` | Always use strict equality `===` and `!==` | coder |
| TS-004 | Mutating function parameters | Clone objects before modifying: `{ ...obj, key: newValue }` | coder |
| TS-005 | Missing optional chaining | Use `obj?.prop?.nested` instead of `obj && obj.prop && obj.prop.nested` | coder |
| TS-006 | Importing entire libraries | `import { specific } from 'lib'` not `import * as lib from 'lib'` | coder, performance |
| TS-007 | Forgetting async on await functions | Every function using `await` MUST be declared `async` | coder |
| TS-008 | Using `.get()` on typed objects | Use attribute access (`obj.field`), not dict-style (`.get('field')`) on Pydantic/TypeScript types | coder |
| TS-009 | Not typing function return values | Every exported function MUST have explicit return type | coder |
| TS-010 | Using `var` instead of `const`/`let` | Always `const` by default, `let` only when reassignment needed | coder |
| TS-011 | `require()` in ESM projects | Use `import` in ESM (`"type": "module"`) projects. Check package.json | coder |

## CATEGORY 5: Git/DevOps Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| GIT-001 | Committing .env files | Add `.env` to `.gitignore`. Provide `.env.example` with placeholders | devops, security |
| GIT-002 | Committing node_modules | Add `node_modules/` to `.gitignore` | devops |
| GIT-003 | Committing dist/build artifacts | Add `dist/`, `build/`, `.next/` to `.gitignore` | devops |
| GIT-004 | No .gitignore | Create `.gitignore` at project init. Include standard exclusions | devops |
| GIT-005 | Force pushing to main/master | NEVER `git push --force` to main. Use feature branches | devops |
| GIT-006 | Skipping cache cleanup during rebuild | ALWAYS `rm -rf .next node_modules/.cache` before `npm run build` | sre, devops |
| GIT-007 | Not using conventional commits | Format: `type(scope): description` — feat, fix, chore, docs, refactor, test | docs |

## CATEGORY 6: API Design Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| API-001 | Inconsistent response envelope | Standardize: `{ data, meta, error }` for ALL endpoints | api-design |
| API-002 | Using GET for mutations | GET = read-only. POST/PUT/PATCH/DELETE for mutations | api-design |
| API-003 | Missing pagination metadata | Return `{ data, meta: { total, page, limit, totalPages } }` | api-design |
| API-004 | Inconsistent date formats | Use ISO 8601 everywhere: `2026-03-27T10:30:00Z` | api-design, coder |
| API-005 | Missing 404 for non-existent resources | Return 404 with `{ error: { code: "NOT_FOUND", message: "..." } }` | coder |
| API-006 | No input validation on endpoints | Validate request body, params, query with schema validation (Zod/Joi) | coder |

## CATEGORY 7: Security Deviations (beyond BPSBS)

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| SEC-001 | Not validating file upload types/sizes | Validate MIME type, extension, and size server-side. Never trust client | security |
| SEC-002 | Missing Content-Security-Policy header | Set CSP header to prevent XSS and data injection | security |
| SEC-003 | Not rate limiting login attempts | Max 5 attempts per 15 min per IP. Lock after 10 failed attempts | security |
| SEC-004 | Storing sessions in memory only | Use Redis or DB for sessions. Memory sessions lost on restart | security, sre |
| SEC-005 | Not invalidating tokens on password change | Invalidate ALL active tokens when password changes | security |
| SEC-006 | Missing HTTPS redirect in production | Force HTTPS. Set HSTS header | security, devops |
| SEC-007 | Tokens in localStorage/sessionStorage | Access tokens in memory only. Refresh tokens in HttpOnly cookies | security |
| SEC-008 | Logging PII (email, password, phone) | Never log personal data. Use anonymized identifiers | privacy, security |

## CATEGORY 8: Testing Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| TEST-001 | Testing implementation details | Test behavior/output, not internal state or method calls | tester |
| TEST-002 | Not testing error paths | Test what happens on invalid input, network failure, empty data | tester |
| TEST-003 | Using real APIs in unit tests | Mock external services. Use fixtures for API responses | tester |
| TEST-004 | Not testing edge cases | Test: empty array, null, undefined, 0, "", false, very long strings, special chars | tester |
| TEST-005 | Flaky tests with time-dependent assertions | Use `vi.useFakeTimers()` or fixed dates. Never rely on `Date.now()` in assertions | tester |
| TEST-006 | Not testing auth/authz paths | Test: unauthenticated access, wrong role, expired token, invalid token | tester |
| TEST-007 | Zero test files with "all tests passed" | Vacuous pass detection — 0 test files = 0 tests ran = NOT passing | tester, gate-keeper |

## CATEGORY 9: Documentation Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| DOC-001 | README with technical internals | README = user-facing (install, usage). Technical → CHANGELOG/docs/ | docs |
| DOC-002 | No installation instructions | README MUST have: prerequisites, install command, first-run example | docs |
| DOC-003 | Missing API examples | Every endpoint needs at least one curl/fetch example | docs, api-design |
| DOC-004 | Outdated screenshots | Screenshots must match current UI. Re-capture on UI changes | docs |
| DOC-005 | Code comments describe "what" not "why" | Comments explain WHY, not WHAT. The code shows what | coder |

## CATEGORY 10: LLM-Specific Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| LLM-001 | Goal-completion bias (reporting false success) | Pipeline MUST halt on repeated blockers. Never report success with failures | all |
| LLM-002 | Self-inflicted regression blindness | Never dismiss errors in files the agent just modified as "pre-existing" | debugger, fixer |
| LLM-003 | Investigating complex before simple | Debug: data → binding → flow → THEN timing/race conditions | debugger, fixer |
| LLM-004 | Sourcing .env files in bash | NEVER `source .env`. Use `grep` to extract values | all |
| LLM-005 | Dict access on typed objects | Use `obj.field` not `obj.get('field')` on Pydantic/TypeScript types | coder |
| LLM-006 | Building backend then asking about frontend | Three-layer rule: DB → Backend → Frontend. All three. Every time | all |
| LLM-007 | Generating placeholder/mock/stub code | ONLY REAL LOGIC. No TODOs, no mocks in production, no "coming soon" | all |
| LLM-008 | Losing context and duplicating code | Check for existing code before suggesting changes. Structural diff on context restore | all |
| LLM-009 | Hallucinating API endpoints or library methods | Verify imports exist. Check docs. Don't invent methods | coder |
| LLM-010 | Mixing framework versions/syntax | Check actual installed version before writing code (React 18 vs 19, Next 13 vs 14) | coder |

---

## ENFORCEMENT

Every agent SHOULD reference this file: `See agents/_known-deviations.md for full deviation list.`

The `/certify` command checks for patterns in categories 1-8 via static analysis.
The `/gate-keeper` agent validates against these patterns during the forge pipeline.
The memory system records new deviations as they're discovered.

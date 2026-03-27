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

## CATEGORY 10: Authorization & Access Control Deviations

> BOLA/IDOR is the #1 API vulnerability. 53% of teams that shipped AI code found auth issues post-review.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| AUTH-001 | Missing object-level authorization (BOLA/IDOR) | Every endpoint returning user-scoped data MUST verify the requesting user owns the resource. Test: auth as User A, request User B's resource, expect 403 | security, coder, tester |
| AUTH-002 | Authorization looks correct but doesn't enforce | Check authorization at the DATA layer, not just the route. `getInvoice(id)` must filter by `user_id`, not just check "is logged in" | security, coder |
| AUTH-003 | Missing role-based access control on admin routes | Admin endpoints MUST check `user.role === 'admin'` server-side. Frontend-only guards are bypassable | security, coder |
| AUTH-004 | Session doesn't invalidate on password change | When password changes, invalidate ALL active sessions/tokens for that user | security |
| AUTH-005 | No brute force protection on login | Rate limit: max 5 attempts per 15 min per IP. Lock account after 10 failed attempts | security |
| AUTH-006 | JWT stored in localStorage (XSS-accessible) | Access tokens in memory only. Refresh tokens in HttpOnly Secure SameSite=Strict cookies | security |
| AUTH-007 | Missing CSRF protection on state-changing endpoints | POST/PUT/DELETE endpoints need CSRF tokens or SameSite cookie policy | security |
| AUTH-008 | Token refresh doesn't rotate refresh token | Issue new refresh token on each use. Detect and block reuse of old refresh tokens | security |

## CATEGORY 11: Frontend-Backend Contract Mismatches

> THE quintessential vibe-coding failure. The LLM builds frontend and backend in the same session but they don't agree on data shapes, endpoints, or request formats. Each layer works in isolation but breaks when connected.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| CONTRACT-001 | Frontend expects different data shape than backend returns | BEFORE writing any frontend fetch call, READ the actual backend endpoint code and verify the response shape. Write a TypeScript interface that matches the REAL response, not an assumed one | coder, architect |
| CONTRACT-002 | Frontend calls endpoint that doesn't exist | BEFORE writing `fetch('/api/modules/{id}/quiz')`, verify that exact route exists in the backend router. `grep` for it | coder |
| CONTRACT-003 | Frontend sends request body backend doesn't expect | Backend expects `list[int]` (answer indexes), frontend sends `{question_id, option_id}` objects. ALWAYS check the backend's request validation schema before writing the fetch call | coder |
| CONTRACT-004 | Field name mismatches (backend `correct_index`, frontend `correctAnswer`) | Use ONE shared type definition or API contract. If backend returns `correct_index`, frontend MUST read `correct_index`, not rename it to something else | coder, architect |
| CONTRACT-005 | Array of strings vs array of objects | Backend returns `options: ["A", "B", "C"]`, frontend expects `options: [{id: 1, text: "A"}]`. Transform at the API boundary, not deep in components | coder |
| CONTRACT-006 | Different ID formats (backend UUID, frontend expects integer) | Check the actual ID type from the API. Don't assume `number` when the backend returns `string` UUID | coder |
| CONTRACT-007 | Missing fields in API response that frontend requires | Frontend renders `item.description` but backend doesn't include `description` in the response. Check SELECT/serializer fields match frontend needs | coder |
| CONTRACT-008 | Pagination contract mismatch | Backend returns `{items, total, page}`, frontend expects `{data, meta: {totalPages, currentPage}}`. Agree on ONE pagination envelope | coder, api-design |
| CONTRACT-009 | Date format mismatch | Backend returns Unix timestamp, frontend expects ISO string (or vice versa). Standardize on ISO 8601 everywhere | coder |
| CONTRACT-010 | Error response format mismatch | Backend returns `{detail: "Not found"}` (FastAPI), frontend checks `response.error.message`. Standardize error envelope | coder, api-design |
| CONTRACT-011 | Authentication header format mismatch | Backend expects `Authorization: Bearer <token>`, frontend sends `X-Auth-Token: <token>`. Check the ACTUAL middleware code | coder, security |
| CONTRACT-012 | Content-Type mismatch | Backend expects `application/json`, frontend sends `multipart/form-data` (or vice versa). Check the endpoint's content type requirements | coder |

### Prevention Protocol (MANDATORY for /forge and /go)

```
BEFORE writing ANY frontend API call:
1. READ the actual backend route handler (not docs, not types — the real code)
2. VERIFY: endpoint path, HTTP method, request body schema, response shape
3. WRITE a TypeScript interface that matches the REAL response
4. VERIFY: error response format matches frontend error handling
5. IF mismatch found: fix the BACKEND to serve what the frontend needs,
   OR add a transform layer at the API boundary

NEVER assume the API shape. ALWAYS verify.
```

## CATEGORY 12: Silent Logic Failures

> 60% of AI code faults are silent logic errors — code compiles and runs but produces wrong results.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| LOGIC-001 | Happy path bias — only works with ideal input | Test with: null, undefined, empty string, 0, false, empty array, very long strings, special characters, Unicode, negative numbers | tester, coder |
| LOGIC-002 | Off-by-one errors in loops and pagination | Verify: first item, last item, empty set, single item, boundary between pages | tester, coder |
| LOGIC-003 | Incorrect comparison operators | `>` vs `>=`, `<` vs `<=`. Always test boundary values | tester |
| LOGIC-004 | Swallowed exceptions — catch without action | Every catch block MUST either: re-throw, log + return error response, or handle explicitly. NEVER empty catch | coder |
| LOGIC-005 | Floating point arithmetic for money | NEVER use float for currency. Use integer cents (amount * 100) or Decimal/BigNumber library | coder, data-architect |
| LOGIC-006 | Timezone bugs — using local time for storage | Store ALL timestamps as UTC. Convert to local time only at display | coder, data-architect |
| LOGIC-007 | Race conditions in async code | When multiple async operations modify shared state, use mutex/locks or sequential processing | coder |
| LOGIC-008 | Incorrect null coalescing (`??` vs `\|\|`) | `??` only catches null/undefined. `\|\|` catches all falsy (0, '', false). Know which you need | coder |
| LOGIC-009 | String comparison for version numbers | "10.0" < "9.0" as strings. Use semver library for version comparison | coder |
| LOGIC-010 | Incorrect boolean logic (De Morgan's law) | `!(a && b)` ≠ `(!a && !b)`. It equals `(!a \|\| !b)`. Review complex boolean expressions | coder |

## CATEGORY 12: Supply Chain & Dependency Deviations

> 20% of AI-generated code recommends non-existent packages. 5.2% of commercial model suggestions are hallucinated.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| SUPPLY-001 | Hallucinated package names (slopsquatting) | VERIFY every `npm install` / `pip install` suggestion exists on the registry BEFORE installing. Check npmjs.com or pypi.org | coder, security |
| SUPPLY-002 | Outdated packages with known CVEs | Run `npm audit` / `pip audit` after installing. Check last publish date — abandoned packages are risky | dependency-auditor |
| SUPPLY-003 | Unnecessary dependencies for simple tasks | Don't add a package for something achievable in 5 lines of code. `left-pad` syndrome | coder |
| SUPPLY-004 | Missing lockfile commitment | ALWAYS commit package-lock.json / yarn.lock / pnpm-lock.yaml for reproducible builds | devops |
| SUPPLY-005 | Wildcard versions in package.json | NEVER use `"*"` or `"latest"`. Pin major version: `"^4.17.0"` | coder, dependency-auditor |
| SUPPLY-006 | Dev dependencies in production bundle | Separate devDependencies from dependencies. Don't ship test frameworks to production | coder, devops |
| SUPPLY-007 | Importing deprecated or replaced packages | Check if package has a successor (e.g., `request` → `node-fetch`, `moment` → `dayjs`) | coder |

## CATEGORY 13: Performance & Scalability Deviations

> AI code has 8x more excessive I/O and 1.42x more performance issues than human code.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| PERF-001 | Fetching all records without pagination | EVERY list endpoint MUST support pagination. Default: `limit=20, offset=0` | coder, api-design |
| PERF-002 | N+1 queries (query in a loop) | Use JOINs, batch queries, or eager loading. NEVER `SELECT` inside a `for` loop | coder, data-architect |
| PERF-003 | No caching for expensive operations | Cache: DB query results (Redis/in-memory), API responses (HTTP cache headers), computed values | coder, performance |
| PERF-004 | Synchronous file I/O in request handlers | Use `async` fs operations in server code. `readFileSync` blocks the event loop | coder |
| PERF-005 | Loading entire file into memory | Stream large files. Don't `readFileSync` a 500MB CSV | coder |
| PERF-006 | Missing database indexes | Every WHERE, JOIN, ORDER BY column needs an index. Check EXPLAIN plans | data-architect, performance |
| PERF-007 | Unoptimized images | Compress images, use WebP, set dimensions, lazy-load below-fold images | ux-ui, performance |
| PERF-008 | Importing entire library when only one function needed | `import { debounce } from 'lodash/debounce'` not `import _ from 'lodash'` | coder |
| PERF-009 | Re-rendering entire component tree on state change | Use `React.memo`, `useMemo`, `useCallback`. Don't put volatile state in root context | coder, performance |
| PERF-010 | Missing connection pooling | Use pool for DB connections. Don't create new connection per request | coder, data-architect, sre |

## CATEGORY 14: Error Handling Deviations

> Error handling gaps are 2x more common in AI-generated code than human code.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| ERR-001 | Empty catch blocks (swallowed errors) | Every catch MUST: log, re-throw, or return meaningful error. NEVER `catch (e) {}` | coder |
| ERR-002 | Generic error messages to users | Show user-friendly message + log detailed error server-side. Never expose stack traces | coder |
| ERR-003 | Missing try/catch around external calls | EVERY fetch, DB query, file operation, and third-party API call needs error handling | coder |
| ERR-004 | Not handling network timeouts | Set timeouts on ALL HTTP requests (5s default). Handle timeout as a specific error case | coder, sre |
| ERR-005 | Returning HTTP 200 with error body | Use correct status codes: 400, 401, 403, 404, 409, 422, 500. NEVER 200 with `{ error: ... }` | coder, api-design |
| ERR-006 | Not distinguishing client vs server errors | 4xx = client's fault (bad input). 5xx = server's fault (bug). Log 5xx, alert on 5xx | coder, sre |
| ERR-007 | Missing global error handler | Express: `app.use((err, req, res, next) => ...)`. Next.js: `error.tsx`. React: `ErrorBoundary` | coder |
| ERR-008 | Unhandled promise rejections crash the process | Add `process.on('unhandledRejection', ...)` handler. Use `--unhandled-rejections=throw` in Node | coder, sre |

## CATEGORY 16: LLM-Specific Deviations

> AI code creates 1.7x more issues than human code. 66% of devs say AI solutions are "almost right, but not quite."

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
| LLM-011 | "Almost right" code that passes tests but fails in production | Test with REAL data, not ideal test fixtures. Include edge cases and adversarial input | tester, coder |
| LLM-012 | Suggesting deprecated or removed APIs | Check current docs before using any API. Verify method exists in installed version | coder |
| LLM-013 | Cross-file inconsistency (works in isolation, breaks together) | After multi-file changes, verify: imports resolve, types match, API contracts align | coder, architect |
| LLM-014 | Overcomplicating simple tasks | If a 5-line solution exists, don't write 50 lines. Avoid premature abstraction | coder |
| LLM-015 | Destroying existing data (database drops, file overwrites) | NEVER run destructive operations without explicit user confirmation. Back up first | all |
| LLM-016 | Ignoring the project's existing patterns | Read existing code BEFORE writing new code. Match the project's style, not your default | coder |
| LLM-017 | Generating tests that test the implementation, not behavior | Tests should verify OUTCOMES, not HOW the code works internally | tester |
| LLM-018 | Not reading error messages before "fixing" | Read the ACTUAL error message. Don't guess. The fix is usually in the error text | debugger, fixer |

---

## STATISTICS (Source: Research 2025-2026)

| Metric | Value | Source |
|--------|-------|--------|
| AI code with security vulnerabilities | 45-53% | Veracode GenAI Report 2025 |
| AI code issues vs human code | 1.7x more | CodeRabbit AI vs Human Report 2026 |
| XSS vulnerability increase with AI | 2.74x | IEEE/CodeRabbit |
| Silent logic failures in AI code | 60% of faults | IEEE Spectrum |
| Happy path bias | Majority of AI code | Multiple sources |
| Error handling gaps vs human code | 2x more common | CodeRabbit |
| Excessive I/O in AI code | 8x higher | CodeRabbit |
| Hallucinated package names | 5.2% (commercial), 21.7% (open-source) | USENIX Security 2025 |
| Teams discovering post-ship security issues | 53% | Autonoma |
| Devs saying AI code is "almost right" | 66% | Developer survey 2026 |

## ENFORCEMENT

Every agent SHOULD reference this file: `See agents/_known-deviations.md for full deviation list.`

The `/certify` command checks for patterns in categories 1-8 via static analysis.
The `/gate-keeper` agent validates against these patterns during the forge pipeline.
The memory system records new deviations as they're discovered.

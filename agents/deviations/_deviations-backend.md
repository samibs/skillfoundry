# Known LLM Deviation Patterns — Backend, API Design & Authorization

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

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

## CATEGORY 6: API Design Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| API-001 | Inconsistent response envelope | Standardize: `{ data, meta, error }` for ALL endpoints | api-design |
| API-002 | Using GET for mutations | GET = read-only. POST/PUT/PATCH/DELETE for mutations | api-design |
| API-003 | Missing pagination metadata | Return `{ data, meta: { total, page, limit, totalPages } }` | api-design |
| API-004 | Inconsistent date formats | Use ISO 8601 everywhere: `2026-03-27T10:30:00Z` | api-design, coder |
| API-005 | Missing 404 for non-existent resources | Return 404 with `{ error: { code: "NOT_FOUND", message: "..." } }` | coder |
| API-006 | No input validation on endpoints | Validate request body, params, query with schema validation (Zod/Joi) | coder |

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

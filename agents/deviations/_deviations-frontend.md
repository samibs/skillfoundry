# Known LLM Deviation Patterns — Frontend & Frontend-Backend Contracts

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

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

# Known LLM Deviation Patterns — Error Handling

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

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

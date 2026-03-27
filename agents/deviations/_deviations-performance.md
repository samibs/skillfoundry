# Known LLM Deviation Patterns — Performance & Scalability

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

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

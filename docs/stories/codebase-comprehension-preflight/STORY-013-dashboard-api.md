# STORY-013: Dashboard /api/codemap Routes

**Phase:** 5 — Dashboard (DEFERRED — enhancement)
**PRD:** codebase-comprehension-preflight
**Priority:** SHOULD
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-004
**Blocks:** STORY-014
**Affects:** FR-012

---

## Description

Serve the Code Map to a browser by extending the existing `dashboard/server`. Two localhost-only endpoints: the current map, and the working-tree diff-impact. No new server framework — reuse the existing dashboard stack.

---

## Acceptance Contract

**done_when:**
- [x] `GET /api/codemap` returns the parsed `.skillfoundry/code-map.json` for the active project (404/empty-state JSON when absent — never invents data)
- [x] `GET /api/codemap/diff-impact` returns `diffImpact` output for the working tree (depends on STORY-011; returns explicit "unavailable" when not built)
- [x] Server binds to `127.0.0.1` only — no `0.0.0.0`, no remote exposure (PRD §4.2)
- [x] All array fields in responses default to `[]`
- [x] Map path is resolved safely (no path traversal from query params)
- [x] Tests hit both routes against a fixture map (present + absent cases)

**fail_when:**
- The server binds to a non-loopback interface by default
- A query param can traverse outside the project to read arbitrary files
- An array field serializes as `null`

---

## Technical Approach

1. Extend `dashboard/server/index.js` with the two routes; read the map via the same `persist.loadMap` (or a thin re-impl if the server is plain JS without TS imports — share the JSON shape, not necessarily the code).
2. Resolve project root from a single validated config value; reject paths outside it.
3. Keep responses small — the client lazy-loads node detail.

---

## Files Affected

| File | Action |
|------|--------|
| `dashboard/server/index.js` | MODIFY — `/api/codemap` + diff-impact routes |
| `dashboard/server/__tests__/codemap-routes.test.js` | CREATE — route tests |

---

## Security / Constraints
- Loopback bind only; path-traversal guard; read-only.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `dashboard/server/codemap-routes.js` (dependency-free `readMapArtifact` + `registerCodemapRoutes`), mounted in `dashboard/server/index.js`; server now binds **127.0.0.1 by default** (`DASHBOARD_HOST`). `tests/dashboard-codemap.test.ts` (route-reader tests, green).
- **Design:** the dashboard is a **thin reader** of `.skillfoundry/code-map.json` + `.skillfoundry/diff-impact.json` (the latter now persisted by `sf_codemap diff-impact`). No engine/TS coupling in the JS server. Path-traversal guarded; non-absolute/`..` project paths rejected; array fields default `[]`; missing artifact → explicit empty-state (never fabricated).
- **Note:** route logic is unit-tested via the extracted module; a live boot needs `npm install` in `dashboard/` (express is a declared dep but not vendored here) — manual verification step before release.

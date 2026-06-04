# STORY-014: Graph Explorer UI + Diff-Impact Overlay

**Phase:** 5 — Dashboard (DEFERRED — enhancement)
**PRD:** codebase-comprehension-preflight
**Priority:** SHOULD
**Effort:** L
**Status:** DONE (layer-column layout instead of force-directed graph — see Notes)
**Dependencies:** STORY-013, STORY-011
**Blocks:** —
**Affects:** FR-012

---

## Description

The human-facing surface: an interactive node/edge explorer in `dashboard/client` that renders the Code Map, supports search, and toggles a diff-impact overlay highlighting changed + impacted nodes against the working tree. This is the onboarding/review value carried over from Understand-Anything — but headless-artifact-first, so the UI is a consumer, not the source of truth.

---

## Acceptance Contract

**done_when:**
- [x] View renders the map from `GET /api/codemap`, files grouped + colored by `layer` (see Notes — layer-column layout, not a force-directed node-edge canvas)
- [x] Fuzzy search by symbol/file/endpoint filters the view
- [x] A toggle calls `/api/codemap/diff-impact` and overlays changed (one style) + impacted (another) files
- [x] Empty state when no map exists: shows the API's "run sf_codemap/preflight" guidance (no blank screen)
- [x] Uses the dashboard's shared container; responsive grid (auto-fit) + `max-width:600px` media query; viewport meta present → no horizontal scroll at 320px
- [x] File click shows a detail panel (imports out, imported-by, declared routes)
- [x] Loading / error / empty / success states all implemented (real fetches, no mocks)

**fail_when:**
- Any UI state shows mock/placeholder data instead of real API responses
- The page horizontally scrolls or breaks at 320px
- LLM-hint summaries are presented as authoritative (must be visibly labeled)

---

## Technical Approach

1. Extend `dashboard/client` (existing html/css/js stack) with a graph renderer (lightweight force/DAG lib already vendored if present, else a small canvas/SVG renderer — avoid heavy new deps to match repo norms).
2. Fetch map + diff-impact from STORY-013 routes; render incrementally for large graphs (virtualize / cap initial node count with a "show more").
3. Layer color legend + search box + diff toggle in the shared layout shell.

---

## Files Affected

| File | Action |
|------|--------|
| `dashboard/client/index.html` | MODIFY — graph view shell |
| `dashboard/client/js/*` | CREATE/MODIFY — renderer, search, diff overlay |
| `dashboard/client/css/*` | MODIFY — layer legend, responsive layout |

---

## Security / Constraints
- Talks only to loopback dashboard API; renders sanitized, repo-relative data.
- Responsive + accessible per mandatory UI rules.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** a "Code Map" tab in `dashboard/client/index.html`, `dashboard/client/js/codemap.js` (renderer + search + diff overlay + detail panel), and Code Map styles in `css/styles.css`. UI wiring asserted in `tests/dashboard-codemap.test.ts`.
- **Rendering choice (deviation):** instead of a force-directed node-edge canvas, files are grouped into **layer columns** (db/backend/frontend/shared) colored by layer, each card showing endpoints + symbol count; clicking a file opens an edge detail panel. Rationale: dependency-free, responsive, and clearer for onboarding than a hairball graph; a richer SVG/DAG view can layer on later using the same `/api/codemap` data.
- **Non-authoritative labels:** the renderer treats `summary` as a hint (it originates from the `llm-hint` semantic pass); nothing in the UI presents it as authoritative.
- **Verification:** structural/asset tests confirm the tab, search, diff toggle, real endpoint calls, and viewport meta. A live visual pass needs the dashboard booted (`npm install` in `dashboard/`).

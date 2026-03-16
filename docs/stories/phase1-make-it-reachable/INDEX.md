# Stories Index: Phase 1 — Make It Reachable

**PRD:** `genesis/2026-03-16-phase1-make-it-reachable.md`
**Total Stories:** 9
**Phases:** 4 (A-D)

---

## Dependency Graph

```
STORY-001 (GitHub Actions release workflow)
    │
    ├─────────────────────────┐
    │                         │
    ▼                         ▼
STORY-002 (Homebrew + curl)   STORY-003 (Docusaurus setup)
                                   │
                              ┌────┴────────────────┐
                              │                     │
                              ▼                     ▼
                        STORY-004              STORY-005
                  (Getting Started +      (Config reference +
                   Architecture)            Recipes)
                              │                     │
                              └────┬────────────────┘
                                   │
                                   ▼
                             STORY-006 (Algolia DocSearch)

STORY-007 (sf metrics baseline + HTML report)
    │
    ▼
STORY-008 (Telemetry consent + privacy policy)

STORY-009 (VS Code Marketplace + 1.0.0)
    │
    └─ depends on STORY-007 (for "Open Last Report" command)
```

---

## Stories by Phase

### Phase A: Distribution (Epic 1)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-001 | GitHub Actions Release Workflow | S | None |
| STORY-002 | Homebrew Formula + curl\|bash Installer | M | STORY-001 |

### Phase B: Documentation Site (Epic 2)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-003 | Docusaurus Site Setup | M | STORY-001 (needs release workflow for deploy) |
| STORY-004 | Getting Started Guide + Architecture Deep-Dive | M | STORY-003 |
| STORY-005 | Configuration Reference + Recipes | M | STORY-003 |
| STORY-006 | Algolia DocSearch Integration | S | STORY-004, STORY-005 |

### Phase C: Telemetry MVP (Epic 3)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-007 | sf metrics baseline + HTML Report | L | None |
| STORY-008 | Telemetry Consent + Privacy Policy | M | STORY-007 |

### Phase D: VS Code Extension (Epic 4)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-009 | VS Code Marketplace Publish + 1.0.0 | M | STORY-007 (Open Last Report needs report.html) |

---

## Execution Waves

Parallel execution is possible within waves. A wave starts only when all its dependencies from prior waves are complete.

| Wave | Stories | Rationale |
|------|---------|-----------|
| 1 | STORY-001, STORY-007 | No dependencies; release workflow and telemetry can be built in parallel |
| 2 | STORY-002, STORY-003, STORY-008 | Depend on Wave 1 outputs |
| 3 | STORY-004, STORY-005, STORY-009 | Depend on Docusaurus being set up and report.html existing |
| 4 | STORY-006 | Needs all doc content in place before indexing |

---

## Completion Tracking

| Story | Status | Implemented By | Date |
|-------|--------|----------------|------|
| STORY-001 | Pending | — | — |
| STORY-002 | Pending | — | — |
| STORY-003 | Pending | — | — |
| STORY-004 | Pending | — | — |
| STORY-005 | Pending | — | — |
| STORY-006 | Pending | — | — |
| STORY-007 | Pending | — | — |
| STORY-008 | Pending | — | — |
| STORY-009 | Pending | — | — |

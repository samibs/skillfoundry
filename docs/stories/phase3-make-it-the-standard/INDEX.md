# Stories Index: Phase 3 — Make It the Standard

**PRD:** `genesis/2026-03-16-phase3-make-it-the-standard.md`
**Total Stories:** 14
**Phases:** 4 (Team Foundation, Performance, Distribution, Testing Rigor)
**Status:** All stories READY

---

## Dependency Graph

```
STORY-001 (Team Config + Policy Enforcement)
    │
    ├──────────────────────┬──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
STORY-002 (Audit Log)   STORY-003 (Shared Memory) STORY-004 (Policy as Code CI)
    │                      │                      │
    └──────────┬───────────┘                      │
               │                                  │
               ▼                                  │
STORY-005 (Parallel Gates) ◄──────────────────────┘
    │
    ▼
STORY-006 (File-Hash Caching)
    │
    ▼
STORY-007 (Incremental Pipeline)
    │
    └──────────────────────────────────────────────┐
                                                   │
STORY-008 (Central Skill Registry + sf publish) ◄──┘
    │
    ├──────────────────────┐
    │                      │
    ▼                      ▼
STORY-009 (Release WF)  STORY-010 (Version Pinning + sf upgrade)

STORY-005 (Parallel Gates)
    │
    ▼
STORY-014 (P95 Latency Enforcement) ◄── STORY-011 (Stryker Mutation Testing)
                                              │
STORY-012 (Quality Benchmark 50 Scenarios) ◄──┘
    │
    ▼
STORY-013 (E2E Pipeline Integration Tests)
```

---

## Stories by Phase

### Phase 1: Team Foundation (Epic 9)

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-001 | Team Config File + Org-Wide Policy Enforcement | READY | L | None |
| STORY-002 | Audit Logging (Append-Only Gate Decisions) | READY | M | STORY-001 |
| STORY-003 | Shared Team Memory Bank | READY | M | STORY-001 |
| STORY-004 | Policy as Code (Git-Versioned Gate Configs in CI) | READY | M | STORY-001 |

### Phase 2: Performance (Epic 10)

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-005 | Parallel Gate Execution | READY | L | STORY-001, STORY-002 |
| STORY-006 | File-Hash Gate Caching | READY | M | STORY-005 |
| STORY-007 | Incremental Pipeline (sf run --diff) | READY | M | STORY-006 |

### Phase 3: Distribution (Epic 11)

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-008 | Central Skill Registry + sf publish Command | READY | L | None |
| STORY-009 | GitHub Actions Release Workflow | READY | M | STORY-008 |
| STORY-010 | Version Pinning + sf upgrade | READY | M | STORY-008, STORY-001 |

### Phase 4: Testing Rigor (Epic 12)

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-011 | Stryker Mutation Testing Setup | READY | M | None |
| STORY-012 | Quality Benchmark Suite (50 Scenarios) | READY | L | None |
| STORY-013 | E2E Pipeline Integration Tests with LLM Fixtures | READY | L | STORY-007 |
| STORY-014 | Performance Regression Enforcement (P95 <500ms) | READY | M | STORY-005 |

---

## Functional Requirements Coverage

| FR | Description | Stories |
|----|-------------|---------|
| FR-001 | Team config file | STORY-001 |
| FR-002 | Audit log | STORY-002 |
| FR-003 | Shared team memory | STORY-003 |
| FR-004 | Policy as code | STORY-004 |
| FR-005 | Parallel gate execution | STORY-005 |
| FR-006 | File-hash gate caching | STORY-006 |
| FR-007 | Incremental pipeline | STORY-007 |
| FR-008 | Central skill registry | STORY-008 |
| FR-009 | sf publish command | STORY-008 |
| FR-010 | Release workflow | STORY-009 |
| FR-011 | Version pinning | STORY-010 |
| FR-012 | Quality benchmark | STORY-012 |
| FR-013 | Mutation testing | STORY-011 |
| FR-014 | E2E pipeline tests | STORY-013 |
| FR-015 | P95 gate latency enforcement | STORY-014 |

---

## Epic Mapping

| Epic | Stories | Theme |
|------|---------|-------|
| Epic 9 — Team & Cloud Mode | STORY-001 through STORY-004 | Organizational governance |
| Epic 10 — Pipeline Performance | STORY-005 through STORY-007 | Speed and efficiency |
| Epic 11 — Automated Platform Distribution | STORY-008 through STORY-010 | Publishing and versioning |
| Epic 12 — Benchmark Suite & Mutation Testing | STORY-011 through STORY-014 | Testing rigor |

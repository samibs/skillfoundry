# Stories Index: Competitive Leap

**PRD:** `genesis/2026-02-15-competitive-leap.md`
**Total Stories:** 17
**Phases:** 6 (Phase 0-5)

---

## Dependency Graph

```
STORY-001 (Bug fixes)
    │
    ▼
STORY-002 (CI pipeline) ──→ STORY-003 (CI sync check)
    │                              │
    ▼                              ▼
STORY-004 (Dead code cleanup) ──→ STORY-005 (CI badge + polish)
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
STORY-006 (Reference PRD)    STORY-008 (Agent Trace format)
    │                              │
    ▼                              ▼
STORY-007 (Reference build)  STORY-009 (Prompt capture)
                                   │
                                   ▼
                             STORY-010 (Cost-aware routing)
                                   │
                                   ▼
                             STORY-011 (Quality primer)
                                   │
                                   ▼
                             STORY-012 (Rejection tracker)
                                   │
                                   ▼
                             STORY-013 (Self-improving rules)
                                   │
                                   ├──────────────────┐
                                   │                  │
                                   ▼                  ▼
                             STORY-014 (A2A cards) STORY-016 (Compliance pipeline)
                                   │                  │
                                   ▼                  ▼
                             STORY-015 (Arena mode) STORY-017 (Compliance evidence)
```

---

## Stories by Phase

### Phase 0: Bug Fixes (v1.9.0.16)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-001 | Fix Known Script Bugs | S | None |

### Phase 1: CI/CD & Cleanup (v1.9.0.17)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-002 | GitHub Actions CI Pipeline | M | STORY-001 |
| STORY-003 | CI Platform Sync Verification | S | STORY-002 |
| STORY-004 | Remove Dead Code & Deprecated Files | S | STORY-002 |
| STORY-005 | CI Badge & README Polish | S | STORY-003, STORY-004 |

### Phase 2: Reference Project (v1.9.0.18)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-006 | Create Reference Project PRD | M | STORY-005 |
| STORY-007 | Build Reference Project with /forge | XL | STORY-006 |

### Phase 3: Standards & Capture (v1.10.0.0)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-008 | Agent Trace Format Support | M | STORY-005 |
| STORY-009 | Prompt/Response Capture System | L | STORY-008 |
| STORY-010 | Cost-Aware Agent Routing | L | STORY-009 |

### Phase 4: Quality & Intelligence (v1.10.0.1)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-011 | Quality-at-Generation Primer | M | STORY-010 |
| STORY-012 | Gate Rejection Tracker | M | STORY-011 |
| STORY-013 | Self-Improving Quality Rules | L | STORY-012 |

### Phase 5: Moonshots (v1.11.0.0)

| Story | Title | Effort | Dependencies |
|-------|-------|--------|--------------|
| STORY-014 | A2A Protocol Agent Cards | M | STORY-013 |
| STORY-015 | Arena Mode for Agents | XL | STORY-014 |
| STORY-016 | Compliance-as-Code Pipeline | L | STORY-013 |
| STORY-017 | Compliance Evidence Collection | M | STORY-016 |

---

*Generated from PRD: competitive-leap | Claude AS Framework v1.9.0.15*

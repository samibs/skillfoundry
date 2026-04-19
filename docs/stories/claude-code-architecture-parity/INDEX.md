# Claude Code Architecture Parity — Story Index

**PRD:** genesis/2026-04-01-claude-code-architecture-parity.md
**Feature:** Harness Engineering Upgrade for SkillFoundry MCP Server
**Total Stories:** 12
**Phases:** 4

---

## Dependency Graph

```
Phase 1: Foundation
  STORY-001 (Tool Module Interface) ──┐
  STORY-002 (Permission Engine)    ──┤
  STORY-003 (Tool Migration x3)   ──┘── depends on STORY-001, STORY-002

Phase 2: Session Intelligence
  STORY-004 (Session Config & Budget) ──┐
  STORY-005 (Transcript Compaction)  ──┤── depends on STORY-004
  STORY-006 (Session Persistence)    ──┘── depends on STORY-004

Phase 3: Streaming & Bootstrap
  STORY-007 (Streaming Protocol)     ── depends on Phase 1
  STORY-008 (Bootstrap Pipeline)     ── depends on Phase 1
  STORY-009 (Enhanced Health)        ── depends on STORY-008

Phase 4: Verification & Command Graph
  STORY-010 (Verification Agent)     ── depends on Phase 1
  STORY-011 (Command Graph)          ── depends on Phase 1
  STORY-012 (Full Tool Migration)    ── depends on STORY-003
```

## Execution Waves

```
Wave 1: [STORY-001, STORY-002]              ── parallel (no deps)
Wave 2: [STORY-003]                         ── depends on Wave 1
Wave 3: [STORY-004, STORY-007, STORY-008]   ── parallel (independent)
Wave 4: [STORY-005, STORY-006, STORY-009]   ── depends on Wave 3
Wave 5: [STORY-010, STORY-011]              ── parallel (independent)
Wave 6: [STORY-012]                         ── final migration
```

---

## Stories

| ID | Title | Phase | Priority | Complexity | Dependencies |
|----|-------|-------|----------|------------|-------------|
| STORY-001 | Tool Module Interface & Auto-Discovery | 1 | MUST | Medium | None |
| STORY-002 | Permission Engine (deny/prefix/simple/trust) | 1 | MUST | Medium | None |
| STORY-003 | Migrate 3 Tools to Folder Structure | 1 | MUST | Medium | STORY-001, STORY-002 |
| STORY-004 | Session Config & Token Budget Tracking | 2 | MUST | Medium | None |
| STORY-005 | Transcript Compaction Engine | 2 | MUST | Medium | STORY-004 |
| STORY-006 | Session Persistence & Resumption | 2 | SHOULD | Small | STORY-004 |
| STORY-007 | Streaming Event Protocol | 3 | MUST | Medium | Phase 1 |
| STORY-008 | Bootstrap Pipeline (7 stages) | 3 | SHOULD | Large | Phase 1 |
| STORY-009 | Enhanced Health Endpoint | 3 | SHOULD | Small | STORY-008 |
| STORY-010 | Verification Agent Tool | 4 | MUST | Medium | Phase 1 |
| STORY-011 | Command Graph Segmentation | 4 | SHOULD | Small | Phase 1 |
| STORY-012 | Full Tool Migration (remaining tools) | 4 | SHOULD | Large | STORY-003 |

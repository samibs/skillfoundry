# Stories Index: Correctness Contracts

**PRD:** `genesis/2026-03-08-correctness-contracts.md`
**Total Stories:** 5
**Phases:** 2 (Phase 1-2)
**Status:** All stories DONE

---

## Dependency Graph

```
STORY-001 (MG0 AC Validation Gate)
    │
    ├───────────────────────────┐
    │                           │
    ▼                           ▼
STORY-002 (T0 Contract Gate)   STORY-003 (MG1.5 Test Doc Gate)
    │                           │
    └───────────┬───────────────┘
                │
                ▼
        STORY-004 (Pipeline Integration)
                │
                ▼
        STORY-005 (Skill Commands)
```

---

## Stories by Phase

### Phase 1: Core Gates

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-001 | MG0 Pre-Generation AC Validation Gate | DONE | M | None |
| STORY-002 | T0 Correctness Contract Gate | DONE | S | STORY-001 |
| STORY-003 | MG1.5 Test Documentation Gate | DONE | M | STORY-001 |

### Phase 2: Integration & Skills

| Story | Title | Status | Effort | Dependencies |
|-------|-------|--------|--------|--------------|
| STORY-004 | Pipeline Integration | DONE | M | STORY-002, STORY-003 |
| STORY-005 | /ac and /doc-tests CLI Skills | DONE | M | STORY-004 |

---

## Functional Requirements Coverage

| FR | Description | Stories |
|----|-------------|---------|
| FR-001 | Story template done_when/fail_when blocks | STORY-001 |
| FR-002 | MG0 — Pre-Generation AC Gate | STORY-001, STORY-004 |
| FR-003 | T0 — Correctness Contract Check | STORY-002, STORY-004 |
| FR-004 | MG1.5 — Test Documentation Gate | STORY-003, STORY-004 |
| FR-005 | MG1.5 re-triggers tester, not fixer | STORY-003, STORY-004 |
| FR-006 | /ac skill | STORY-005 |
| FR-007 | /doc-tests skill | STORY-005 |

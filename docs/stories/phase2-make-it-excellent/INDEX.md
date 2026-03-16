# Phase 2: Make It Excellent — Stories

Source PRD: `genesis/2026-03-16-phase2-make-it-excellent.md`

## Story Map

### Epic 5 — Runtime Agent Orchestration
- STORY-001: Agent Message Bus (FR-001)
- STORY-002: AgentPool with Concurrency Control (FR-002)
- STORY-003: Runtime Status CLI + Structured Agent Logging (FR-003, FR-004)
- STORY-004: Agent Pair Contract Tests (FR-005)

### Epic 6 — Semantic Memory System
- STORY-005: Vector Embedding Service (FR-006)
- STORY-006: ChromaDB Local Integration (FR-007)
- STORY-007: Memory Search CLI Command (FR-008)
- STORY-008: Memory Precision Benchmark Suite (FR-009)

### Epic 7 — Security Scanning Full Coverage
- STORY-009: Gitleaks Secrets Scanning Integration (FR-010)
- STORY-010: Checkov IaC Scanning + License Compliance (FR-011, FR-012)
- STORY-011: Unified Security Report (FR-013)

### Epic 8 — PRD Semantic Validation
- STORY-012: LLM-Powered PRD Quality Scorer (FR-014, FR-017)
- STORY-013: PRD Review CLI + Pipeline Hard Block (FR-015, FR-016)

## Dependency Graph

```
Epic 5 (Orchestration):
  STORY-001 → STORY-002 → STORY-003
  STORY-001 → STORY-004
  STORY-002 → STORY-004

Epic 6 (Memory):
  STORY-005 → STORY-006 → STORY-007
  STORY-006 → STORY-008

Epic 7 (Security):
  STORY-009 → STORY-011
  STORY-010 → STORY-011

Epic 8 (PRD Validation):
  STORY-012 → STORY-013

Cross-Epic:
  (none — epics are independent and can execute in parallel)
```

## Execution Waves

| Wave | Stories | Rationale |
|------|---------|-----------|
| Wave A | STORY-001, STORY-005, STORY-009 | Foundations: message bus, embedding service, Gitleaks — no cross-dependencies |
| Wave B | STORY-002, STORY-006, STORY-010, STORY-012 | Core systems: pool, ChromaDB, IaC/license, PRD scorer — depend on Wave A foundations |
| Wave C | STORY-003, STORY-007, STORY-011, STORY-013 | CLI integration: all user-facing commands and pipeline hooks |
| Wave D | STORY-004, STORY-008 | Validation: contract tests and precision benchmarks (require working systems) |

## Effort Summary

| Story | Epic | Effort | Complexity |
|-------|------|--------|------------|
| STORY-001 | 5 | M | Medium |
| STORY-002 | 5 | M | High |
| STORY-003 | 5 | S | Low |
| STORY-004 | 5 | M | Medium |
| STORY-005 | 6 | M | Medium |
| STORY-006 | 6 | M | High |
| STORY-007 | 6 | S | Low |
| STORY-008 | 6 | M | Medium |
| STORY-009 | 7 | S | Low |
| STORY-010 | 7 | M | Medium |
| STORY-011 | 7 | M | Medium |
| STORY-012 | 8 | L | High |
| STORY-013 | 8 | M | Medium |

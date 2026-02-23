# SkillFoundry CLI Platform — Full Story Set

**PRD:** `genesis/2026-02-22-skillfoundry-cli-platform.md`  
**Scope:** Full PRD coverage (`FR-001..FR-058`)  
**Status:** Ready for `/go` execution sequencing

## Story Index

1. `STORY-001-tui-shell-foundation.md`
2. `STORY-002-streaming-timeline-and-dual-mode.md`
3. `STORY-003-diff-preview-and-approval-checkpoint.md`
4. `STORY-004-keyboard-first-command-system.md`
5. `STORY-005-error-recovery-and-accessibility-modes.md`
6. `STORY-006-cli-bootstrap-and-init.md`
7. `STORY-007-read-only-planning-pipeline.md`
8. `STORY-008-apply-flow-and-anvil-gates.md`
9. `STORY-009-chat-and-ask-experience.md`
10. `STORY-010-provider-routing-and-engine-adapters.md`
11. `STORY-011-policy-redaction-and-command-controls.md`
12. `STORY-012-budget-controls-and-cost-guardrails.md`
13. `STORY-013-memory-recall-and-lesson-capture.md`
14. `STORY-014-runlog-export-and-audit-bundle.md`
15. `STORY-015-github-memory-sync-integration.md`

## Recommended Execution Order

### Lane A — Core Execution Path

1. STORY-006
2. STORY-007
3. STORY-010
4. STORY-011
5. STORY-008
6. STORY-009
7. STORY-012
8. STORY-014
9. STORY-013
10. STORY-015

### Lane B — UX/TUI Path (can start after STORY-006)

1. STORY-001
2. STORY-002
3. STORY-003
4. STORY-004
5. STORY-005

## FR Coverage Matrix

| FR | Story |
|----|-------|
| FR-001 | STORY-006 |
| FR-002 | STORY-007 |
| FR-003 | STORY-008 |
| FR-004 | STORY-009 |
| FR-005 | STORY-009 |
| FR-006 | STORY-010 |
| FR-007 | STORY-011 |
| FR-008 | STORY-013 |
| FR-009 | STORY-014 |
| FR-020 | STORY-010 |
| FR-021 | STORY-010 |
| FR-022 | STORY-010 |
| FR-023 | STORY-010 |
| FR-030 | STORY-012 |
| FR-031 | STORY-011 |
| FR-032 | STORY-011 |
| FR-033 | STORY-008 |
| FR-040 | STORY-013 |
| FR-041 | STORY-013 |
| FR-042 | STORY-015 |
| FR-050 | STORY-001 |
| FR-051 | STORY-001 |
| FR-052 | STORY-002 |
| FR-053 | STORY-003 |
| FR-054 | STORY-004 |
| FR-055 | STORY-002 |
| FR-056 | STORY-005 |
| FR-057 | STORY-001 |
| FR-058 | STORY-005 |

## Global Done Criteria

- Every story passes its acceptance criteria.
- FR coverage matrix remains complete and one-to-many mapping stays intentional.
- Runlog evidence exists for each completed story implementation.

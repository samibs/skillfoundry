# Story: STORY-002 Deployment Guide for Real Scripts

**PRD Reference:** genesis/prd-from-orchestrator.md (Req #2)
**Priority:** MUST
**Phase:** 2
**Status:** DONE

---

## Context

### Why This Story Exists
The PRD asks for a deployment guide referencing `deploy.sh`. That file does not exist. The repository's real deploy/install surface is:

- `install-unified.sh` / `install-unified.ps1` — one-click cross-platform installer
- `update.sh` / `update.ps1` — framework update path
- `scripts/dashboard.sh` — live execution dashboard
- `scripts/knowledge-sync.sh` — knowledge-base sync daemon
- `package.json` `scripts.test` and the `sf_cli/` npm package

A user-facing deployment guide must reflect what exists, not what the PRD imagined.

### What Success Looks Like
`docs/DEPLOYMENT-GUIDE.md` documents prerequisites, the real install scripts, environment variables, and troubleshooting steps for the actual SkillFoundry installation flow.

### Dependencies
- **Requires:** None
- **Blocks:** STORY-003 (configuration reference links here)

---

## Implementation Requirements

| ID | Requirement | Implementation |
|----|-------------|----------------|
| FR-001 | Prerequisites listed | Node ≥ 20, Git, optional AI provider key |
| FR-002 | Install paths | `install-unified.sh` (Linux/macOS), `install-unified.ps1` (Windows) |
| FR-003 | Update path | `update.sh` / `update.ps1` |
| FR-004 | Env variables | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc., listed |
| FR-005 | Troubleshooting | Common failures (Node version, permissions, network) |

---

## Expected Changes (Anvil T4)

- **Create:** `docs/DEPLOYMENT-GUIDE.md`
- **Modify:** `docs/DOCUMENTATION-INDEX.md` (add link)

---

## Acceptance Criteria

```gherkin
Feature: Deployment guide exists for real scripts

  Scenario: Guide references real install scripts
    Given the file "docs/DEPLOYMENT-GUIDE.md" exists
    When I search for "install-unified.sh"
    Then it should be found
    And "update.sh" should be found
    And no reference to nonexistent "deploy.sh" should remain unqualified

  Scenario: Documentation index links the guide
    Given the file "docs/DOCUMENTATION-INDEX.md" exists
    When I search for "DEPLOYMENT-GUIDE.md"
    Then it should be found
```

---

## Definition of Done

- [x] `docs/DEPLOYMENT-GUIDE.md` created with real script names
- [x] `docs/DOCUMENTATION-INDEX.md` links the guide
- [x] No banned patterns (TODO/FIXME/PLACEHOLDER/STUB/COMING SOON)
- [x] Test added in `sf_cli/src/__tests__/docs-validation.test.ts`

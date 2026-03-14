# PRD: Prompt Analysis Integration — Industry Patterns for SkillFoundry

---
prd_id: prompt-analysis-integration
title: Prompt Analysis Integration
version: 1.0
status: DRAFT
created: 2026-03-15
author: Sami
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [core, quality, skills, agents, security]
priority: high
layers: []
---

---

## 1. Overview

### 1.1 Problem Statement

An analysis of system prompts from 12 leading AI coding tools (Cursor, Devin, Lovable, Manus, Bolt, Cline, Codex CLI, RooCode, Replit, Same.dev, v0, Windsurf) revealed that SkillFoundry is missing several high-impact patterns that these tools have independently converged on: think-before-act reasoning gates, post-edit verification loops, safe/unsafe command classification, never-modify-tests rules, and structured escalation after repeated failures. These gaps reduce reliability when agents encounter ambiguous situations, skip verification steps, or silently fail without escalation.

### 1.2 Proposed Solution

Integrate the highest-impact patterns from the prompt analysis into SkillFoundry's existing skill library and Anvil pipeline. This covers 6 high-priority additions (quick wins that harden existing skills) and 6 medium-priority enhancements (new capabilities inspired by industry patterns). No new architecture — these are targeted insertions into existing skill markdown files and pipeline code.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Skills with think-before-act gate | 0 | 6+ (architect, coder, debugger, fixer, review, refactor) | Grep for reasoning gate directive in skill files |
| Skills with post-edit verification | 0 (coder relies on Anvil at end) | 1+ (coder runs linter after each edit) | Check coder skill for verification instruction |
| Skills with escalation protocol | 2 (fixer, debugger have partial) | All pipeline skills | Grep for 3-attempt escalation pattern |
| Agent file-write restrictions | 0 | 1+ (architect restricted to .md) | Check architect skill for file restriction |
| Command safety classification | 0 | Implemented in secure-coder + pipeline | Check for safe/unsafe classification logic |

---

## 2. User Stories

### Primary User: Developer using SkillFoundry skills (IDE or CLI)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | agents to reason explicitly before taking actions | I can trust their decisions are considered, not reflexive | MUST |
| US-002 | developer | the coder agent to verify each edit immediately (linter/type-check) | errors are caught at the edit, not at the end of a long pipeline | MUST |
| US-003 | developer | agents to escalate after 3 failed attempts instead of looping | I don't waste tokens on unresolvable issues | MUST |
| US-004 | developer | the tester agent to never modify tests to make them pass | test integrity is preserved and failures always point to code bugs | MUST |
| US-005 | developer | shell commands classified as safe/unsafe with unsafe requiring approval | destructive actions don't execute without my knowledge | MUST |
| US-006 | developer | a pre-commit checklist that catches secrets and debug code | I never accidentally ship sensitive data | MUST |
| US-007 | developer | the architect agent restricted to planning files only (.md) | architecture decisions don't accidentally include code changes | SHOULD |
| US-008 | developer | decisions captured to memory_bank automatically during agent execution | I don't lose context between sessions | SHOULD |
| US-009 | developer | the refactor skill to use regex+LLM for bulk cross-file changes | large refactors are fast and consistent | SHOULD |
| US-010 | developer | the data-architect to require migration files for all schema changes | destructive DB operations are prevented by default | SHOULD |
| US-011 | developer | the ux-ui skill to include an accessibility checklist | web output meets a11y standards without manual review | SHOULD |
| US-012 | developer | a git-backed auto-checkpoint before major agent changes | any agent action can be rolled back independently | COULD |

---

## 3. Functional Requirements

### 3.1 Phase 1 — High-Priority Quick Wins

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Think-before-act reasoning gate | Add a mandatory reasoning step to architect, coder, debugger, fixer, review, and refactor skills. Before any file edit or tool call, the agent must output a brief reasoning block (2-4 lines) explaining what it will do and why. | Given any skill with the reasoning gate, When the agent is about to edit a file, Then it first outputs a reasoning block. No edit occurs without prior reasoning. |
| FR-002 | Post-edit verification gate | The coder skill must run the project's linter or type-checker after each file edit (not just at the end). If errors are introduced, fix them before proceeding to the next file. | Given the coder skill edits a file, When the edit is complete, Then `tsc --noEmit` or equivalent runs. If new errors appear, the coder fixes them before moving on. |
| FR-003 | 3-attempt escalation protocol | All pipeline skills (fixer, debugger, coder, tester, refactor, security) must stop and escalate after 3 failed attempts on the same issue. Escalation means: describe what failed, what was tried, and suggest next steps. | Given a skill fails to resolve an issue, When 3 attempts have been made, Then the skill stops, outputs a structured failure report, and asks for guidance. It does not attempt a 4th fix. |
| FR-004 | Never-modify-tests rule | The tester skill must never modify existing test assertions to make them pass. When tests fail, the tester must identify the root cause as a code bug, not a test problem. New tests may be written; existing test expectations must not be weakened. | Given a test failure, When the tester skill is invoked, Then it fixes the code under test, not the test assertions. If existing assertions are modified, the Anvil rejects the change. |
| FR-005 | Safe/unsafe command classification | All shell commands proposed by any agent must be classified as safe (read-only, non-destructive) or unsafe (writes, deletes, installs, network calls). Unsafe commands must be flagged and require explicit approval in supervised mode. | Given an agent proposes `rm -rf`, `DROP TABLE`, `npm install`, or `curl`, When the command is about to execute, Then it is tagged as UNSAFE and requires user approval. Read-only commands (`ls`, `cat`, `git status`) execute without prompt. |
| FR-006 | Pre-commit secret scanning | The ship and release skills must include a pre-commit checklist: scan for API keys, tokens, passwords, `.env` files, and debug statements (`console.log`, `debugger`, `print(`) in staged files. Block commit if secrets are found. | Given a developer runs `/ship`, When files are staged for commit, Then a scan runs for secret patterns. If any match, the commit is blocked with the file and line number. |

### 3.2 Phase 2 — Medium-Priority Enhancements

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-007 | Architect file restriction | The architect skill can only create/modify `.md`, `.mmd`, `.puml`, and planning files. It cannot write source code directly. If architecture requires code changes, it must delegate to the coder skill with explicit instructions. | Given the architect skill is active, When it attempts to write a `.ts`, `.py`, or other source file, Then the action is blocked with a message to delegate to coder. |
| FR-008 | Auto-capture decisions to memory | During agent execution (any skill), when the agent makes a significant decision (chooses library, picks architecture pattern, resolves ambiguity), it should emit a structured decision record to `memory_bank/knowledge/decisions.jsonl`. | Given an agent makes a decision during execution, When the decision involves a trade-off or choice between alternatives, Then a decision entry is written to the memory bank with content, rationale, and session context. |
| FR-009 | Regex+LLM bulk refactor | The refactor and refactoring-strategist skills should support a bulk-refactor mode: use regex to find all matching locations across files, then dispatch the LLM to transform each match point individually. | Given a refactoring task affecting 10+ locations, When the skill identifies matches via regex, Then each match is transformed individually by the LLM rather than editing files sequentially. |
| FR-010 | Migration-file-required for DB changes | The data-architect skill must require a migration file for every schema change. Direct `ALTER TABLE`, `DROP`, or `DELETE` operations are forbidden by default. All changes must go through the ORM migration system. | Given the data-architect proposes a schema change, When the change involves DDL, Then a migration file is created. Inline DDL in application code is rejected. |
| FR-011 | Accessibility checklist for web | The ux-ui skill must include a mandatory accessibility checklist for web work: semantic HTML, ARIA roles, sr-only text for screen readers, alt text for all images, keyboard navigation, color contrast ratio >= 4.5:1. | Given the ux-ui skill reviews a web component, When the review completes, Then each a11y item is checked and reported. Missing items are flagged as issues. |
| FR-012 | Git-backed auto-checkpoint | Before major agent changes (coder starting a story, refactor beginning a bulk edit), automatically create a git commit checkpoint. If the agent's work needs to be undone, `git reset` to the checkpoint. | Given an agent is about to make significant file changes, When the action begins, Then a checkpoint commit is created with message `[checkpoint] before {action}`. If the action fails, the checkpoint enables clean rollback. |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Reasoning gate overhead | < 100 tokens per gate (2-4 lines of reasoning) |
| Post-edit verification | < 5s per edit (linter/type-check) |
| Secret scanning | < 2s for typical staged file set |
| No token waste | 3-attempt limit prevents unbounded retry loops |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Command classification | All shell commands tagged safe/unsafe before execution |
| Secret scanning | Regex patterns for API keys, tokens, passwords, .env content |
| No test weakening | Existing test assertions are immutable during tester execution |
| File restrictions | Architect skill cannot write source code files |

---

## 5. Technical Specifications

### 5.1 Architecture

No new services or infrastructure. All changes are to existing skill markdown files (`.claude/commands/*.md`) and their platform mirrors (`.copilot/`, `.cursor/`, `.agents/`, `.gemini/`), plus targeted additions to pipeline TypeScript code where enforcement needs to be programmatic.

```
Changes target:
├── .claude/commands/          ← Primary skill files
│   ├── architect.md           ← FR-001 (think gate), FR-007 (file restriction)
│   ├── coder.md               ← FR-001, FR-002 (post-edit verify)
│   ├── debugger.md            ← FR-001, FR-003 (escalation)
│   ├── fixer.md               ← FR-001, FR-003
│   ├── tester.md              ← FR-004 (never modify tests)
│   ├── review.md              ← FR-001
│   ├── refactor.md            ← FR-001, FR-009 (bulk refactor)
│   ├── secure-coder.md        ← FR-005 (command classification)
│   ├── ship.md                ← FR-006 (secret scanning)
│   ├── release.md             ← FR-006
│   ├── data-architect.md      ← FR-010 (migration required)
│   ├── ux-ui.md               ← FR-011 (a11y checklist)
│   └── memory.md              ← FR-008 (auto-capture)
├── sf_cli/src/core/           ← CLI enforcement
│   └── pipeline.ts            ← FR-012 (auto-checkpoint)
└── platform mirrors           ← Synced from .claude/commands/
```

### 5.2 Skill Modification Patterns

**FR-001 — Reasoning Gate (added to 6 skills):**
```markdown
### MANDATORY: Think Before Acting

Before EVERY file edit or tool call, output a reasoning block:

REASONING:
- What I'm about to do: [1 sentence]
- Why: [1 sentence]
- Risk: [none/low/medium/high]
- Alternative considered: [if any]

Do NOT skip this step. Do NOT combine reasoning for multiple actions.
```

**FR-003 — Escalation Protocol (added to all pipeline skills):**
```markdown
### ESCALATION PROTOCOL

Track attempts on each issue:
- Attempt 1: Try the most likely fix
- Attempt 2: Try an alternative approach
- Attempt 3: STOP. Do not attempt a 4th fix.

After 3 attempts, output:
  ESCALATION REQUIRED
  Issue: [description]
  Attempts: [what was tried]
  Root cause hypothesis: [best guess]
  Suggested next steps: [for user or senior-engineer]
```

**FR-005 — Command Classification (added to secure-coder, referenced by all skills):**
```markdown
### COMMAND SAFETY CLASSIFICATION

Before executing any shell command, classify it:

SAFE (auto-execute):
  - Read-only: ls, cat, head, git status, git log, git diff, find, grep
  - Type checking: tsc --noEmit, mypy, cargo check
  - Linting: eslint --check, ruff check, clippy

UNSAFE (require approval in supervised mode):
  - File mutation: rm, mv (overwrite), truncate
  - Package install: npm install, pip install, cargo add
  - Database: DROP, DELETE, ALTER, TRUNCATE
  - Network: curl, wget, fetch (outbound)
  - Git destructive: git reset --hard, git push --force, git clean
  - Process: kill, pkill, systemctl stop

Tag each command: [SAFE] or [UNSAFE: reason]
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Existing skill files | Current | Base files to modify | None — they exist |
| Platform sync scripts | Current | Mirror changes to other platforms | Manual sync fallback |
| grep/ripgrep | Any | Secret scanning in FR-006 | Available on all platforms |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **No new skills**: All changes go into existing skill files. New skills are out of scope for Phase 1.
- **Backward compatible**: Skills must continue to work for users who haven't updated.
- **Platform parity**: Changes to `.claude/commands/` must be synced to `.copilot/`, `.cursor/`, `.agents/`, `.gemini/`.
- **Token budget**: Reasoning gates add ~100 tokens per action. This is acceptable overhead for improved reliability.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Agents follow markdown instructions for reasoning gates | Agents may skip the gate under token pressure | Add Anvil check for reasoning block presence |
| 3 attempts is the right escalation threshold | Some issues need 4-5 attempts | Make threshold configurable per skill |
| Secret scanning regex covers common patterns | Novel secret formats may be missed | Use established patterns from tools like trufflehog |

### 7.3 Out of Scope

- [ ] New standalone skills (frontend, escalation, cleanup, communication-style — documented in analysis as opportunities but deferred)
- [ ] Manus-style event-stream architecture rewrite
- [ ] RooCode 5-mode system (SkillFoundry already has multi-agent routing)
- [ ] v0-style Next.js/React component generation templates
- [ ] Windsurf persistent memory rewrite (SkillFoundry already has memory_bank)
- [ ] Changes to the PRD template or story generator
- [ ] UI/frontend changes (this is a skills-only PRD)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Reasoning gates add token overhead on every action | M | L | Cap at 100 tokens. Net positive: prevents expensive mistakes. |
| R-002 | Post-edit verification slows down coder | M | M | Only run type-checker, not full test suite. < 5s per check. |
| R-003 | Secret scanning false positives block legitimate commits | L | M | Use established regex patterns. Allow `--skip-scan` override. |
| R-004 | Architect file restriction frustrates users who want quick prototypes | L | L | Restriction is per-skill, not global. Use `/coder` for code. |
| R-005 | Platform sync drift after changes | M | M | Run sync scripts as part of the release process. |
| R-006 | Agents ignore markdown instructions under context pressure | M | H | Add Anvil programmatic checks for critical rules (FR-004, FR-005). |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Quick Wins | FR-001 through FR-006 (6 high-priority items) | None |
| 2 | Enhancements | FR-007 through FR-012 (6 medium-priority items) | Phase 1 complete |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Low | Low |
| 2 | L | Medium | Medium |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All 6 Phase 1 requirements implemented in `.claude/commands/` skill files
- [ ] Platform mirrors synced (`.copilot/`, `.cursor/`, `.agents/`, `.gemini/`)
- [ ] Reasoning gate present in architect, coder, debugger, fixer, review, refactor
- [ ] Post-edit verification instruction in coder skill
- [ ] 3-attempt escalation protocol in all pipeline skills
- [ ] Never-modify-tests rule in tester skill
- [ ] Safe/unsafe command classification in secure-coder skill
- [ ] Pre-commit secret scanning in ship and release skills
- [ ] Tests pass (existing 480+ tests unbroken)
- [ ] Version bumped and changelog updated

---

## 11. Appendix

### 11.1 Source Reference

Analysis document: `SkillFoundry-Prompt-Analysis.docx` — 12 tools analyzed, 7 pattern categories, 22 source files.

| Tool | Key Pattern Adopted |
|------|-------------------|
| Devin | Think-before-act gate, never-modify-tests rule |
| Cursor | 3-attempt circuit breaker |
| VS Code Copilot | Post-edit verification (get_errors after every edit) |
| Windsurf | Safe/unsafe command classification |
| Codex CLI | Pre-commit cleanup checklist |
| RooCode | File restrictions per agent role |
| Bolt | Migration-file-required for DB |
| v0 | Accessibility checklist |
| Manus | Auto-capture decisions |

### 11.2 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | Sami | Initial draft from prompt analysis document |

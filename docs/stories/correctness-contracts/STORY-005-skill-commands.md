# STORY-005: /ac and /doc-tests CLI Skills

**Phase:** 2 — Integration & Skills
**PRD:** correctness-contracts
**Priority:** SHOULD
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-004
**Blocks:** None
**Affects:** FR-006, FR-007

---

## Description

Create two new CLI skills for manual invocation outside the forge pipeline:

1. **`/ac`** — Acceptance criteria validation and generation. Subcommands: `validate` (check stories for weak ACs), `generate` (propose testable ACs from story descriptions), `enforce` (block forge if ACs missing).

2. **`/doc-tests`** — Test documentation remediation. Subcommands: `scan` (list undocumented test files), `fix` (AI pass to add intent blocks), `report` (coverage percentage).

Both skills are synced across all 5 platforms (Claude Code, Copilot, Cursor, Codex, Gemini).

---

## Acceptance Contract

**done_when:**
- [x] `/ac validate` scans stories in `docs/stories/` and reports weak or missing `done_when` blocks
- [x] `/ac generate` proposes testable ACs from a story description, outputting `done_when` / `fail_when` blocks
- [x] `/ac enforce` returns non-zero if any story in scope lacks measurable ACs
- [x] `/doc-tests scan` lists test files without `@test-suite` headers or GWT comments
- [x] `/doc-tests fix` adds intent blocks to undocumented test files via AI pass
- [x] `/doc-tests report` outputs coverage percentage (documented tests / total tests)
- [x] Skill file created at `.claude/commands/ac.md`
- [x] Skill file created at `.claude/commands/doc-tests.md`
- [x] Skills synced to all 5 platform copies (`.copilot/`, `.cursor/`, `.codex/`, `.gemini/`)
- [x] Each skill includes usage examples and help text

**fail_when:**
- `/ac validate` reports a false positive on a story with strong, measurable ACs
- `/doc-tests scan` misses a test file that lacks documentation
- Skills only work on one platform (must be cross-platform)

---

## Technical Approach

### /ac Skill Definition

Create `.claude/commands/ac.md` with three subcommands:

**`/ac validate [path]`**
- Default path: `docs/stories/`
- Recursively find story files (STORY-*.md)
- Parse each for `done_when` / `fail_when` blocks
- Run each criterion through the MG0 prompt (reuse from micro-gates)
- Output per-story verdict with suggested improvements for weak criteria

**`/ac generate "description"`**
- Take a free-text feature description
- Generate proposed `done_when` items (minimum 3, all objectively verifiable)
- Generate proposed `fail_when` items (minimum 1)
- Output as copy-pasteable markdown block

**`/ac enforce`**
- Run `/ac validate` in strict mode
- Return exit code 1 if any story fails
- Designed for CI/pre-forge checks

### /doc-tests Skill Definition

Create `.claude/commands/doc-tests.md` with three subcommands:

**`/doc-tests scan [path]`**
- Default path: project test directories
- Find all test files (*.test.*, *.spec.*)
- Check each for `@test-suite` header, `@rationale`, GWT comments, WHY comments
- Output list of undocumented files with specific missing elements

**`/doc-tests fix [file]`**
- Read the test file and its corresponding source/story
- AI generates appropriate `@test-suite` header and GWT+WHY comments
- Write documentation blocks into the test file
- Show diff for review

**`/doc-tests report`**
- Count total test files and documented test files
- Output coverage percentage and trend (if previous runs logged)

### Platform Sync

After creating `.claude/commands/ac.md` and `.claude/commands/doc-tests.md`, sync to:
- `.copilot/custom-agents/ac.md` and `doc-tests.md`
- `.cursor/rules/ac.md` and `doc-tests.md`
- `.codex/instructions/ac.md` and `doc-tests.md` (or equivalent)
- `.gemini/skills/ac.md` and `doc-tests.md`

---

## Files Affected

| File | Action |
|------|--------|
| `.claude/commands/ac.md` | CREATE — /ac skill definition |
| `.claude/commands/doc-tests.md` | CREATE — /doc-tests skill definition |
| `.copilot/custom-agents/ac.md` | CREATE — Copilot platform copy |
| `.copilot/custom-agents/doc-tests.md` | CREATE — Copilot platform copy |
| `.cursor/rules/ac.md` | CREATE — Cursor platform copy |
| `.cursor/rules/doc-tests.md` | CREATE — Cursor platform copy |
| `.gemini/skills/ac.md` | CREATE — Gemini platform copy |
| `.gemini/skills/doc-tests.md` | CREATE — Gemini platform copy |

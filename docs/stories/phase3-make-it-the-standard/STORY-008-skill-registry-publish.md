# STORY-008: Central Skill Registry + sf publish Command

**Phase:** 3 — Distribution
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** L
**Status:** READY
**Dependencies:** None
**Blocks:** STORY-009, STORY-010
**Affects:** FR-008, FR-009

---

## Description

Establish a `skills/` directory as the single source of truth for all SkillFoundry skills, replacing the current model where `agents/*.md` files are transformed by `sync-platforms.sh`. Create a `sf publish` command that reads skills from the registry, applies platform-specific transforms, and writes output to the target platform directory. The `sf publish` command replaces manual `sync-platforms.sh` invocations with a structured, validated, extensible workflow.

---

## Acceptance Contract

**done_when:**
- [ ] `skills/` directory exists at the framework root as the canonical skill registry
- [ ] Each skill in `skills/` is a directory containing: `skill.md` (content), `meta.json` (metadata: name, version, platforms, description)
- [ ] `meta.json` schema is validated with Zod: `name` (kebab-case, 1-60 chars), `version` (semver), `platforms` (array of "claude"|"copilot"|"cursor"|"codex"|"gemini"), `description` (1-200 chars)
- [ ] `sf publish --platform cursor` reads all skills, applies the Cursor transform, writes to `.cursor/rules/`
- [ ] `sf publish --platform copilot` applies the Copilot transform, writes to `.copilot/custom-agents/`
- [ ] `sf publish --platform codex` applies the Codex transform, writes to `.agents/skills/`
- [ ] `sf publish --platform gemini` applies the Gemini transform, writes to `.gemini/skills/`
- [ ] `sf publish --platform claude` applies the Claude transform, writes to `.claude/commands/`
- [ ] `sf publish --all` publishes to all 5 platforms in sequence
- [ ] `sf publish --dry-run` prints the files that would be written without writing them
- [ ] Each platform transform is a separate function in `sf_cli/src/core/platform-transforms.ts`, testable in isolation
- [ ] Transforms match the existing logic in `scripts/sync-platforms.sh` (verified by comparing output)
- [ ] If a skill's `meta.json` lists platforms, only those platforms receive the skill; otherwise all platforms receive it
- [ ] `sf publish` prints a summary: N skills published to <platform>, listing each skill name
- [ ] Unit tests in `sf_cli/src/__tests__/publish.test.ts` cover: single platform publish, all platforms, dry-run, invalid meta.json, platform-specific transform correctness, skill filtering by platform
- [ ] Migration: existing `agents/*.md` files are migrated to `skills/` format with a `scripts/migrate-agents-to-skills.sh` helper script

**fail_when:**
- A skill is published to a platform not listed in its `meta.json` platforms array
- `sf publish --dry-run` writes files to disk
- A platform transform produces output different from what `sync-platforms.sh` would produce for the same input
- A skill with invalid `meta.json` is silently published instead of producing a validation error

---

## Technical Approach

### Skill Registry Structure

```
skills/
├── ruthless-coder/
│   ├── skill.md          # The actual skill content (agent prompt)
│   └── meta.json         # { "name": "ruthless-coder", "version": "2.0.51", "platforms": ["claude", "cursor", "copilot", "codex", "gemini"], "description": "..." }
├── ruthless-tester/
│   ├── skill.md
│   └── meta.json
└── ...
```

### Platform Transform Functions

`sf_cli/src/core/platform-transforms.ts`:

```typescript
export interface TransformResult {
  outputPath: string;    // relative to framework root
  content: string;       // transformed content
  skillName: string;
}

export function transformForClaude(skill: SkillEntry): TransformResult {
  // .claude/commands/<name>.md — direct copy with command frontmatter
  return {
    outputPath: `.claude/commands/${skill.name}.md`,
    content: addClaudeFrontmatter(skill.content, skill.meta),
    skillName: skill.name,
  };
}

export function transformForCursor(skill: SkillEntry): TransformResult {
  // .cursor/rules/<name>.mdc — MDC format with cursor-specific headers
  return {
    outputPath: `.cursor/rules/${skill.name}.mdc`,
    content: convertToMdc(skill.content, skill.meta),
    skillName: skill.name,
  };
}

// Similar for Copilot (.copilot/custom-agents/<name>.md), Codex (.agents/skills/<name>.md), Gemini (.gemini/skills/<name>.md)
```

Each transform function mirrors the logic currently in `sync-platforms.sh` sections. The migration is one-to-one.

### Publish Command

`sf_cli/src/commands/publish.ts`:

1. Parse flags: `--platform <name>`, `--all`, `--dry-run`
2. Load all skills from `skills/` directory
3. Validate each `meta.json` against Zod schema
4. Filter skills by target platform (if skill specifies platforms)
5. Apply the appropriate transform function
6. If `--dry-run`, print output paths and exit
7. Write transformed files to platform directories
8. Print summary

### Migration Script

`scripts/migrate-agents-to-skills.sh`:
- For each `agents/*.md`, create a `skills/<name>/` directory
- Copy the agent file to `skills/<name>/skill.md`
- Generate `meta.json` from the agent file's frontmatter (if present) or defaults
- Print a migration report

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/commands/publish.ts` | CREATE — sf publish command implementation |
| `sf_cli/src/core/platform-transforms.ts` | CREATE — Per-platform transform functions |
| `sf_cli/src/__tests__/publish.test.ts` | CREATE — Unit tests for publish and transforms |
| `sf_cli/src/__tests__/platform-transforms.test.ts` | CREATE — Unit tests for each platform transform |
| `skills/` | CREATE — Directory structure with migrated skills |
| `scripts/migrate-agents-to-skills.sh` | CREATE — Migration helper from agents/ to skills/ |
| `sf_cli/src/commands/index.ts` | MODIFY — Register publish command |

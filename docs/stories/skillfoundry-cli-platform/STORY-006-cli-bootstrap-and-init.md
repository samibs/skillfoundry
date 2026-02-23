# STORY-006: CLI Bootstrap and Workspace Initialization

**Phase:** 1 — Core CLI Foundation
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** None
**Affects:** FR-001

---

## Description

Implement the `sf init` foundation so repositories can be prepared for deterministic CLI workflows with baseline config, policy, and run directories.

---

## Technical Approach

### Scope

- Implement `sf init` command.
- Create `.skillfoundry/` structure with default files:
  - `config.toml`
  - `policy.toml`
  - `runs/` directory
- Ensure idempotent behavior and optional `--force` overwrite semantics.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/init.*` | Create init command handler |
| `sf_cli/config/defaults.*` | Create default config templates |
| `sf_cli/filesystem/workspace.*` | Create workspace bootstrap utilities |
| `sf_cli/commands/root.*` | Register init command |

---

## Acceptance Criteria

```gherkin
Scenario: Initialize fresh repo
  Given a repo without .skillfoundry directory
  When the user runs "sf init"
  Then .skillfoundry/config.toml and .skillfoundry/policy.toml are created
  And .skillfoundry/runs directory exists

Scenario: Idempotent init
  Given .skillfoundry already exists
  When the user runs "sf init"
  Then existing files are preserved
  And command exits successfully with informative message

Scenario: Force reinitialize
  Given .skillfoundry already exists
  When the user runs "sf init --force"
  Then default config files are regenerated
```

---

## Testing

- Unit tests for directory/file creation and idempotency.
- Integration tests for force/non-force behavior.
- Permission tests for created files/directories.

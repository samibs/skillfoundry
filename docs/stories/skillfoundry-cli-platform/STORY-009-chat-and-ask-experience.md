# STORY-009: Chat and One-Shot Ask Experience

**Phase:** 2 — Core Interaction Layer
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-006, STORY-010
**Affects:** FR-004, FR-005

---

## Description

Implement both interactive chat (`sf chat`) and one-shot prompt (`sf ask`) experiences with consistent route metadata and context behavior.

---

## Technical Approach

### Scope

- Implement `sf chat` interactive loop with session context.
- Implement `sf ask` single-turn response path.
- Standardize output metadata: provider, engine, model, usage.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/chat.*` | Create interactive chat command |
| `sf_cli/commands/ask.*` | Create one-shot ask command |
| `sf_cli/session/chat_session.*` | Create session state manager |
| `sf_cli/output/response_formatter.*` | Create shared response formatter |

---

## Acceptance Criteria

```gherkin
Scenario: Chat returns contextual responses
  Given user starts "sf chat"
  When user sends multiple prompts
  Then responses include context continuity and route metadata

Scenario: Ask returns single response
  Given user runs "sf ask \"summarize this error\""
  When response arrives
  Then one formatted answer is printed
  And command exits without entering interactive loop

Scenario: Metadata is consistent across chat and ask
  Given either command is used
  When output is generated
  Then route/provider/usage fields follow shared contract
```

---

## Testing

- Unit tests for chat session state retention.
- Integration tests for ask and chat output contract.
- JSON output mode tests for machine-readable consistency.

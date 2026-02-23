# STORY-010: Provider Routing and Engine Adapters

**Phase:** 2 — Multi-Provider Core
**PRD:** skillfoundry-cli-platform
**Priority:** MUST
**Effort:** XL
**Dependencies:** STORY-006
**Affects:** FR-006, FR-020, FR-021, FR-022, FR-023

---

## Description

Build the provider control plane with API and CLI-broker engines, normalized response contracts, and policy-driven fallback routing.

---

## Technical Approach

### Scope

- Implement `sf provider set/list` config operations.
- Build `ApiEngine` adapters for configured providers.
- Build `CliBrokerEngine` adapters for installed vendor CLIs.
- Normalize responses across engines to shared contract.
- Implement fallback routing order and retry policy.

### Files to create/modify (expected)

| File | Action |
|------|--------|
| `sf_cli/commands/provider.*` | Create provider command handlers |
| `sf_cli/providers/router.*` | Create routing engine |
| `sf_cli/providers/api_engine.*` | Create API engine base and adapters |
| `sf_cli/providers/cli_broker_engine.*` | Create CLI broker engine base |
| `sf_cli/providers/response_contract.*` | Create normalized response schema |
| `sf_cli/providers/fallback_policy.*` | Create fallback/retry strategy |

---

## Acceptance Criteria

```gherkin
Scenario: Provider is configured from CLI
  Given initialized workspace
  When user runs "sf provider set xai"
  Then config is updated
  And provider route validates successfully

Scenario: API and broker engines both execute
  Given provider routes for api and broker modes are configured
  When commands run in each mode
  Then both paths return normalized responses

Scenario: Fallback route executes on primary failure
  Given primary provider route fails
  And fallback route is allowed by policy
  When router handles failure
  Then fallback provider/engine is attempted in configured order
```

---

## Testing

- Adapter contract tests for all supported providers.
- Fallback routing tests for failure and recovery scenarios.
- Cross-engine normalization tests for shared response fields.

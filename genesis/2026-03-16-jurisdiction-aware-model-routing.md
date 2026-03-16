# PRD: Jurisdiction-Aware Model Routing

**Version:** 1.0
**Status:** APPROVED
**Created:** 2026-03-16
**Author:** SBS + PRD Architect
**Last Updated:** 2026-03-16

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry's task classifier (`task-classifier.ts`) routes tasks as simple/complex between local and cloud models. But it has three blind spots:

1. **No jurisdiction enforcement.** If `gdpr_mode` or `ai_act_scope` is set, nothing prevents sensitive data from being sent to a cloud API. The router silently sends it anyway.
2. **No quality-gate fallback.** When a local model produces low-quality output, there's no mechanism to detect it and re-route to cloud. The user gets bad output.
3. **No declarative routing rules.** Routing logic is hardcoded in TypeScript. Teams can't customize rules (e.g., "always route security tasks to cloud") without modifying source code.

### 1.2 Proposed Solution

Extend the existing task classifier with:
- **Jurisdiction guards** — `data_jurisdiction` config field. When set to `eu` or `strict`, block cloud routing for tasks flagged as containing sensitive data. Raise a clear error instead of silently routing to cloud.
- **Quality-gate fallback** — After local model execution, optionally run a lightweight self-consistency check. If the output fails, re-route to cloud automatically.
- **Declarative routing rules** — A `[routing]` section in `config.toml` with typed rules that the classifier evaluates before the keyword heuristic.

### 1.3 Success Metrics

- Jurisdiction guard blocks 100% of cloud-bound requests when `data_jurisdiction = "strict"`
- Quality-gate fallback catches >80% of low-quality local outputs (measured by gate pass rate before/after)
- Routing rules are evaluable without code changes — config-only

---

## 2. User Stories

### Primary User: Developer using SkillFoundry with local + cloud models

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | EU developer | set `data_jurisdiction = "eu"` and have SkillFoundry refuse to send my code to cloud APIs when local can handle it | I comply with GDPR without thinking about it per-task | MUST |
| US-002 | developer | get automatic cloud fallback when my local model produces garbage | I don't waste time debugging bad local output | SHOULD |
| US-003 | team lead | define routing rules in config.toml like "security tasks always go to cloud" | my team gets consistent routing without code changes | SHOULD |
| US-004 | developer | see which model handled my task and why | I understand routing decisions and can tune them | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | `data_jurisdiction` config field (`"none"`, `"eu"`, `"strict"`) | Given `data_jurisdiction = "eu"`, when a simple task is classified, then it routes to local. When local can't handle it, it raises `JurisdictionError` instead of silently routing to cloud. |
| FR-002 | Jurisdiction guard in `selectProvider()` | Given `data_jurisdiction = "strict"`, when ANY task is routed, then cloud is never selected. All tasks go local or fail. |
| FR-003 | Quality-gate fallback flag | Given `quality_fallback = true` in config, when a local model output is returned, then a lightweight check runs. If it fails, the task is re-submitted to cloud. |
| FR-004 | Self-consistency check function | Given a prompt and local model response, when `checkOutputQuality()` is called, it returns pass/fail based on: (a) response is non-empty, (b) response doesn't contain refusal patterns, (c) response length is proportional to prompt complexity. |
| FR-005 | Declarative `[routing.rules]` in config.toml | Given rules like `security_tasks = "cloud"`, when a task matches the keyword set, then the rule overrides the default classifier. |
| FR-006 | Routing decision logging | Every routing decision is logged to the output channel with: task complexity, matched keywords, selected tier, reason, jurisdiction status. |

### 3.2 Config Schema Extension

```toml
# .skillfoundry/config.toml — new fields

# Jurisdiction control
# "none" = no restrictions (default)
# "eu" = prefer local, block cloud for simple tasks, warn for complex
# "strict" = never route to cloud, fail if local can't handle it
data_jurisdiction = "none"

# Quality-gate fallback: re-route to cloud if local output is low quality
quality_fallback = false

# Per-task-type routing overrides
[routing.rules]
security = "cloud"          # security tasks always go to Tier 1
orchestration = "cloud"     # orchestration always cloud
code_generation = "local"   # code gen prefers local
documentation = "local"     # docs always local
default = "auto"            # everything else uses classifier
```

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Routing decision: <1ms (keyword match only, no LLM calls)
- Quality check: <100ms (regex-based, no LLM calls)
- Zero additional API calls for routing

### 4.2 Security
- Jurisdiction guard must be fail-closed: if jurisdiction is set and routing is ambiguous, default to local
- No sensitive data in routing logs (log the decision, not the prompt content)

---

## 5. Technical Specifications

### 5.1 Files to Modify

| File | Change |
|------|--------|
| `sf_cli/src/types.ts` | Add `data_jurisdiction`, `quality_fallback`, `routing_rules` to `SfConfig` |
| `sf_cli/src/core/config.ts` | Add defaults for new fields, parse `[routing.rules]` section |
| `sf_cli/src/core/task-classifier.ts` | Add jurisdiction guard, rule-based overrides, quality check function |
| `sf_cli/src/core/task-classifier.test.ts` | Tests for all new paths |

### 5.2 No New Files
Everything extends existing modules. No new config file format — uses existing `config.toml`.

---

## 6. Constraints & Assumptions

### 6.1 Constraints
- Must not break existing `route_local_first` behavior when new fields are absent
- Quality check must be zero-cost (no LLM calls) — regex/heuristic only
- Config must remain backward-compatible (new fields optional with safe defaults)

### 6.2 Out of Scope
- LLM-based output quality evaluation (too expensive for routing)
- Per-file data classification (would require content scanning)
- Model benchmarking / arena mode
- Dynamic model switching within a single agent turn

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Quality check false positives (blocks good local output) | MEDIUM | MEDIUM | Conservative thresholds, log decisions for tuning |
| Jurisdiction setting too strict for developer workflow | LOW | MEDIUM | `"eu"` mode allows cloud for complex tasks with warning; only `"strict"` fully blocks |

---

## 8. Acceptance Criteria

- [ ] `data_jurisdiction = "strict"` prevents all cloud routing
- [ ] `data_jurisdiction = "eu"` blocks cloud for simple tasks, warns for complex
- [ ] `quality_fallback = true` re-routes to cloud when local output fails check
- [ ] `[routing.rules]` overrides classifier for specified task types
- [ ] All existing tests pass (no regression)
- [ ] New tests cover all jurisdiction modes and rule combinations

---

## 9. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-16 | SBS + PRD Architect | Initial draft |

# PRD: Local-First Development

---
prd_id: local-first-development
title: Local-First Development
version: 1.0
status: IMPLEMENTED
created: 2026-02-27
author: SkillFoundry Team
last_updated: 2026-02-27

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [multi-provider-routing]
  blocks: []
  shared_with: []

tags: [core, performance, cost, provider]
priority: medium
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

Developers using local AI models (Ollama, LM Studio) face two critical blockers that prevent effective offline-first workflows:

1. **Context overflow**: Cloud-oriented prompts send 8K-20K tokens of system context per turn. Local models with 4K-8K context windows choke, truncate, or hallucinate when they receive prompts larger than their context window. There is no mechanism to compact or adapt context for constrained models.

2. **No intelligent routing**: Developers must manually switch providers. Simple tasks (formatting, docs, boilerplate) that could run free on a local model instead consume cloud tokens at $3-15/MTok. There is no automatic routing based on task complexity or model capability.

These gaps prevent developers from reducing cloud API costs, working offline, and keeping sensitive code on-device.

### 1.2 Proposed Solution

Add three capabilities to the sf_cli:

1. **Context compaction engine** — Sliding-window message pruning and system prompt compression that adapts to each provider's context limit. Local models get compact prompts; cloud models get full context.

2. **Local-first cost routing** — Automatic routing that sends simple tasks to local models (free) and complex tasks to cloud models. Configurable via `route_local_first: true` in config.

3. **Provider health checks** — Ping local endpoints before sending requests. If localhost is down, fall back to cloud with a warning instead of a connection error.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Local model usability | Fails on prompts >4K tokens | Works with 4K-32K context models | Run 10 common tasks on qwen2.5-coder-7b (4K ctx) |
| Cloud cost reduction | 100% cloud for all tasks | 40-60% reduction for mixed workloads | Compare monthly spend with/without local routing |
| Offline capability | Zero (requires internet) | Simple tasks work offline | Complete docs/formatting tasks with no network |
| Fallback reliability | Connection error on localhost down | Graceful fallback with warning | Kill local model, verify cloud fallback |

---

## 2. User Stories

### Primary User: Developer using local models

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have sf_cli automatically compress context for my local model | prompts fit within my model's context window | MUST |
| US-002 | developer | route simple tasks to my local model automatically | I save cloud API costs on routine work | MUST |
| US-003 | developer | get a clear warning when my local model is offline | I know to start it or that cloud fallback is active | MUST |
| US-004 | developer | configure which tasks go to local vs cloud | I control the routing behavior | SHOULD |
| US-005 | developer | see how much I saved by using local models | I can quantify the cost benefit | SHOULD |
| US-006 | developer | get hardware recommendations for model selection | I pick the right model for my GPU/RAM | COULD |

---

## 3. Functional Requirements

### 3.1 Context Compaction Engine

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Context window detection | Detect or configure max context tokens per provider/model | Given a local model with 8K context, When a session starts, Then the compaction limit is set to 8K |
| FR-002 | System prompt compression | Compress system prompts for local models by removing examples, verbose instructions, and keeping core directives | Given a 6K system prompt, When targeting a 4K-context model, Then system prompt is compressed to <2K tokens leaving room for conversation |
| FR-003 | Message sliding window | Prune oldest messages when conversation exceeds context limit, keeping the system prompt, first user message, and last N turns | Given 20 turns of conversation on a 8K-context model, When sending the next turn, Then only the last 4-6 turns are included |
| FR-004 | Summary injection | When pruning messages, optionally inject a 1-2 sentence summary of pruned turns so the model retains context | Given 10 pruned messages, When the next turn is sent, Then a summary of pruned turns is prepended to the conversation |

### 3.2 Local-First Cost Routing

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-005 | Route configuration | Add `route_local_first` boolean to config.toml | Given config `route_local_first = true`, When a task is dispatched, Then routing logic is active |
| FR-006 | Task complexity classifier | Classify incoming tasks as simple (docs, formatting, boilerplate, explanations) or complex (architecture, security, multi-file refactoring) | Given the prompt "add a docstring to this function", When classified, Then it is tagged as "simple" |
| FR-007 | Automatic provider selection | Route simple tasks to the configured local provider, complex tasks to the configured cloud provider | Given a simple task with local model available, When dispatched, Then it uses the local provider |
| FR-008 | Cost savings tracking | Track how many tokens were routed locally (free) vs cloud (paid) and report savings | Given a mixed session, When `/cost` is run, Then it shows "Local: 50K tokens ($0.00), Cloud: 20K tokens ($0.15)" |

### 3.3 Provider Health Checks

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-009 | Endpoint ping | Before first request to a local provider, ping the base URL to verify it responds | Given LM Studio running on localhost:1234, When provider is selected, Then a health check confirms availability |
| FR-010 | Graceful fallback | If local endpoint is unreachable, fall back to configured cloud provider with a user-visible warning | Given LM Studio is not running, When a task is dispatched, Then fallback to cloud with message "Local model unavailable, using [cloud provider]" |
| FR-011 | Model listing | Query the local provider's /v1/models endpoint to discover available models | Given Ollama with 3 models loaded, When `/provider list` runs, Then it shows the available local models |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Health check latency | < 500ms (timeout and fallback) |
| Context compaction | < 50ms for message pruning |
| Classification latency | < 10ms (keyword-based, no LLM call) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Local model traffic | All localhost traffic stays on-device — no proxying |
| Credential isolation | Local providers require no API keys or credential storage |
| Code privacy | When routing locally, code never leaves the machine |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌─────────────────────────────────────────────┐
│                   sf_cli                     │
├─────────────────────────────────────────────┤
│  Task Classifier (keyword-based)            │
│  ┌──────────┐        ┌──────────┐           │
│  │  SIMPLE   │        │ COMPLEX  │           │
│  └────┬─────┘        └────┬─────┘           │
│       │                    │                 │
│  ┌────▼─────┐        ┌────▼─────┐           │
│  │  Local    │        │  Cloud   │           │
│  │  Provider │        │  Provider│           │
│  │  (free)   │        │  (paid)  │           │
│  └────┬─────┘        └──────────┘           │
│       │                                      │
│  ┌────▼───────────────────────────┐         │
│  │  Context Compaction Engine     │         │
│  │  - System prompt compression   │         │
│  │  - Message sliding window      │         │
│  │  - Summary injection           │         │
│  └────────────────────────────────┘         │
└─────────────────────────────────────────────┘
```

### 5.2 Context Window Defaults

| Provider | Default Context Window |
|----------|----------------------|
| Anthropic (Claude) | 200K tokens |
| OpenAI (GPT-4o) | 128K tokens |
| Gemini | 1M tokens |
| Ollama (local) | Model-dependent (typically 4K-32K) |
| LM Studio (local) | Model-dependent (typically 4K-32K) |

### 5.3 Task Complexity Keywords

**Simple** (route to local):
- "document", "docstring", "comment", "explain", "format", "lint", "typo", "rename", "boilerplate", "template", "readme", "changelog"

**Complex** (route to cloud):
- "architect", "security", "refactor", "migrate", "design", "performance", "test", "debug", "implement feature", "multi-file"

**Default**: If no keywords match, route to cloud (safer — local models may struggle with ambiguous tasks).

### 5.4 Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `sf_cli/src/core/compaction.ts` | NEW | Context compaction engine |
| `sf_cli/src/core/task-classifier.ts` | NEW | Simple vs complex classification |
| `sf_cli/src/core/health-check.ts` | NEW | Provider health check and fallback |
| `sf_cli/src/core/ai-runner.ts` | MODIFY | Integrate compaction before each turn |
| `sf_cli/src/core/config.ts` | MODIFY | Add route_local_first, context_window configs |
| `sf_cli/src/core/provider.ts` | MODIFY | Add health check before first request |
| `sf_cli/src/commands/cost.ts` | MODIFY | Show local vs cloud cost breakdown |

---

## 6. Constraints & Assumptions

### 6.1 Constraints

- **Technical**: Context compaction is token-estimation based (not exact tokenizer) since local models use different tokenizers
- **Technical**: Task classification is keyword-based only — no LLM call for routing decisions (that would defeat the purpose of cost savings)
- **Business**: Local models vary widely in quality; sf_cli cannot guarantee output quality on local models

### 6.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Local models support OpenAI-compatible /v1/chat/completions | Some models may not | Document supported backends (Ollama, LM Studio, vLLM) |
| 4:1 chars-to-tokens ratio is adequate for estimation | Undercount → overflow | Add configurable ratio, allow exact tokenizer |
| Simple tasks produce acceptable results on 7B models | Quality too low | Allow user to override routing per-task |

### 6.3 Out of Scope

- [ ] Training or fine-tuning local models
- [ ] Model downloading or installation (users must install Ollama/LM Studio themselves)
- [ ] GPU detection or hardware benchmarking
- [ ] Quantization recommendations
- [ ] Multi-model parallel inference (sending same prompt to local + cloud and comparing)

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Context compaction loses critical information | M | H | Keep first user message + last N turns; inject summary of pruned turns |
| R-002 | Local model produces low-quality output on "simple" tasks | M | M | Allow user to override routing; default to cloud for ambiguous tasks |
| R-003 | Health check adds latency to every request | L | L | Cache health check result for 60s; only check on first request |
| R-004 | Token estimation is inaccurate across model families | M | M | Use conservative 3.5:1 char-to-token ratio; allow override |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Context Compaction | FR-001 through FR-004 | LM Studio provider (done) |
| 2 | Health Checks | FR-009 through FR-011 | Phase 1 |
| 3 | Local-First Routing | FR-005 through FR-008 | Phase 2 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium | Medium |
| 2 | S | Low | Low |
| 3 | M | Medium | Medium |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] Context compaction works with Ollama (llama3.1, 8K context)
- [ ] Context compaction works with LM Studio (qwen2.5-coder-7b)
- [ ] Health check detects offline local provider and falls back
- [ ] Local-first routing classifies and routes 10 sample prompts correctly
- [ ] `/cost` shows local vs cloud token breakdown
- [ ] All existing tests pass (no regressions)
- [ ] New tests for compaction, classification, and health check modules

---

## 10. Appendix

### 10.1 References

- XDA Article: "How I built a Claude Code workflow with LM Studio for offline-first development" (Shekhar Vaidya, 2026)
- LM Studio docs: https://lmstudio.ai/docs
- Ollama docs: https://ollama.com
- OpenAI-compatible API spec: https://platform.openai.com/docs/api-reference

### 10.2 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-27 | SkillFoundry Team | Initial draft based on XDA article analysis |

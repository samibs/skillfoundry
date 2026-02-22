# PRD: Competitive Leap — From Framework to Industry Standard

---
prd_id: competitive-leap
title: Competitive Leap — From Framework to Industry Standard
version: 1.0
status: DRAFT
created: 2026-02-15
author: SBS + Claude
last_updated: 2026-02-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [framework-evolution]
  blocks: []
  shared_with: []

tags: [core, framework, ci-cd, standards, intelligence, quality, compliance]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry Framework (v1.9.0.15) is architecturally strong — 46 agents, 4 platforms, 6-tier quality gate, session observability — but a competitive audit against Cursor (Agent Trace, 8 parallel subagents, Cursor Blame), Entire.io ($60M, prompt/response capture, cost analytics), Windsurf (Arena Mode, auto-memories), Devin (autonomous agent), Google Antigravity (Manager View), and emerging standards (MCP, A2A, SKILL.md) reveals critical gaps:

1. **No CI/CD**: Zero automated testing. Every push is manual trust. Competitors ship with CI pipelines on day one.
2. **No reference project**: The framework has never been dogfooded on a real application. 46 agents have never forged a real product.
3. **Dead code**: Orphaned Node.js artifacts (`package.json`, `package-lock.json`) and deprecated scripts (`convert-to-copilot.sh`) pollute the repo.
4. **No standards adoption**: MCP, A2A, and Agent Trace are becoming industry standards. We support none.
5. **No prompt capture**: Entire.io records every prompt/response for audit trails. We record decisions but not the raw agent I/O.
6. **No cost-aware routing**: All agents are invoked equally regardless of task complexity. No routing to cheaper models for simple tasks.
7. **Bug debt**: `session-recorder.sh list` and `harvest.sh --status` exit code 1 on empty data, `.project-registry-meta.jsonl` is 0 bytes.

### 1.2 Proposed Solution

A six-phase evolution from framework to industry standard:

1. **Phase 0: Bug Fixes** — Fix known bugs in existing scripts.
2. **Phase 1: CI/CD & Cleanup** — GitHub Actions pipeline + remove dead code.
3. **Phase 2: Reference Project** — Dogfood the framework on a real CLI tool.
4. **Phase 3: Standards & Capture** — Agent Trace format, prompt/response capture, cost-aware routing.
5. **Phase 4: Quality & Intelligence** — Quality-at-generation primer, self-improving knowledge loop.
6. **Phase 5: Moonshots** — A2A protocol, arena mode, compliance-as-code pipeline.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| CI test pass rate | 0% (no CI) | 100% on every push | GitHub Actions badge |
| Real projects built with framework | 0 | 1+ with all 46 agents exercised | Reference project README |
| Dead/orphaned files | 4+ known | 0 | `git ls-files` audit |
| Standards supported | 0/3 (MCP/A2A/AgentTrace) | 1/3 minimum (Agent Trace) | Format compatibility test |
| Agent I/O captured | 0% | 100% of session prompts/responses | Session recorder audit |
| Known bugs | 4 | 0 | `tests/run-tests.sh` pass rate |
| Cost visibility | Per-session only | Per-agent, per-story, trend over time | `/cost` output |

---

## 2. User Stories

### Primary User: Framework Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have automated tests run on every push | I catch regressions before they reach main | MUST |
| US-002 | developer | see dead code and deprecated files removed | the repo is clean and trustworthy | MUST |
| US-003 | developer | see the framework used on a real project | I know it actually works end-to-end, not just in theory | MUST |
| US-004 | developer | have session attribution output in Agent Trace format | my attribution data is compatible with industry tools | SHOULD |
| US-005 | developer | have every prompt sent to and response received from agents captured | I have a complete audit trail for debugging and compliance | SHOULD |
| US-006 | developer | have agents routed to cheaper models for simple tasks | I reduce cost without sacrificing quality on complex work | SHOULD |
| US-007 | developer | have quality rules baked into agent generation prompts | agents produce higher-quality code on first pass, reducing gate rejections | SHOULD |
| US-008 | developer | have agents learn from their own mistakes across sessions | the same mistake is never made twice | COULD |
| US-009 | developer | have agents compete on the same task and pick the best output | I get the best possible solution via competition | COULD |
| US-010 | developer | have compliance checks codified as pipeline stages | HIPAA/SOC2/GDPR compliance is enforced automatically, not manually | COULD |
| US-011 | developer | have agents communicate via the A2A protocol | my framework is compatible with Google's agent ecosystem | COULD |
| US-012 | developer | have all known bugs fixed | existing tooling works reliably | MUST |

---

## 3. Functional Requirements

### 3.0 Phase 0: Bug Fixes

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-000 | Fix session-recorder.sh list | `session-recorder.sh list` exits code 1 when no sessions exist | Given no sessions exist, When `session-recorder.sh list` runs, Then exit code is 0 with "No sessions found" message |
| FR-001 | Fix harvest.sh --status | `harvest.sh --status` exits code 1 on empty data | Given no harvest data exists, When `harvest.sh --status` runs, Then exit code is 0 with "No harvests recorded" message |
| FR-002 | Remove convert-to-copilot.sh | Deprecated script still in repo | Given `scripts/convert-to-copilot.sh` exists, When this fix is applied, Then file is deleted and any references updated |
| FR-003 | Fix project-registry-meta.jsonl | `.project-registry-meta.jsonl` is 0 bytes | Given file is 0 bytes, When this fix is applied, Then file either has valid content or is removed with proper initialization logic |

### 3.1 Phase 1: CI/CD & Cleanup

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-010 | GitHub Actions CI pipeline | Automated test suite on every push and PR | Given code is pushed to any branch, When GitHub Actions triggers, Then `tests/run-tests.sh` runs and reports pass/fail |
| FR-011 | CI matrix testing | Test across multiple bash versions and OS | Given CI runs, When matrix includes Ubuntu 22.04/24.04 + macOS, Then tests pass on all platforms |
| FR-012 | CI badge in README | Visual pass/fail indicator | Given CI pipeline exists, When README is viewed, Then badge shows current test status |
| FR-013 | Remove Node.js dead code | `package.json` and `package-lock.json` are orphaned | Given these files exist with no Node.js code, When cleanup runs, Then files are removed and `.gitignore` updated |
| FR-014 | Audit and remove deprecated files | Identify all orphaned/deprecated files | Given a file audit, When deprecated files are found, Then they are removed with git history preserved |
| FR-015 | Sync platform check in CI | Verify all 4 platforms are in sync | Given CI runs, When `sync-platforms.sh check` executes, Then 0 drift, 0 missing across all platforms |

### 3.2 Phase 2: Reference Project

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-020 | Create reference project PRD | A real CLI tool built entirely with the framework | Given a PRD exists in genesis/, When `/go` is invoked, Then the framework builds a complete CLI application |
| FR-021 | Exercise all agent types | Reference project touches all 46 agents | Given the project is complete, When agent analytics are checked, Then all agent types were invoked at least once |
| FR-022 | Document lessons learned | Capture every friction point during dogfooding | Given the project is built, When lessons are harvested, Then a retrospective document exists with fixes applied |
| FR-023 | Publish as example | Reference project serves as a usage example | Given the project is complete, When README is updated, Then it links to the reference project as "Built with SkillFoundry" |

### 3.3 Phase 3: Standards & Capture

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-030 | Agent Trace format support | `attribution.sh` outputs Agent Trace compatible format | Given a session completes, When `attribution.sh report --format=agent-trace` runs, Then output is valid Agent Trace JSON |
| FR-031 | Prompt/Response capture | Session recorder captures raw agent I/O | Given an agent is invoked, When it processes a prompt, Then both the full prompt and response are logged to session JSONL |
| FR-032 | Prompt capture toggle | Users can enable/disable prompt capture | Given `session-recorder.sh start --capture-prompts`, When agent runs, Then prompts are captured; without flag, they are not (privacy default) |
| FR-033 | Cost-aware agent routing | Route simple tasks to cheaper models | Given a task complexity is assessed, When complexity is "low", Then route to haiku/fast model instead of opus/sonnet |
| FR-034 | Routing configuration | User-configurable routing rules | Given `.claude/routing.json` exists, When agents are dispatched, Then routing rules from config are applied |
| FR-035 | Cost tracking per agent | Token usage tracked per agent type | Given agents run, When `/cost` is invoked, Then per-agent token breakdown is shown |

### 3.4 Phase 4: Quality & Intelligence

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-040 | Quality-at-generation primer | Inject quality rules into agent system prompts | Given coder agent is invoked, When generating code, Then banned patterns, security rules, and test requirements are in the generation prompt, not just in gates |
| FR-041 | Quality primer shared module | Reusable quality injection module for all agents | Given `agents/_quality-primer.md` exists, When any code-generating agent runs, Then quality rules are injected before generation |
| FR-042 | Self-improving knowledge loop | Agents learn from gate rejections | Given gate-keeper rejects code for "missing input validation", When the rejection is recorded, Then coder agent receives this as a learned rule in future invocations |
| FR-043 | Rejection pattern analysis | Track and analyze gate rejection patterns | Given 10+ gate rejections exist, When `/analytics rejections` runs, Then top rejection categories and trends are shown |
| FR-044 | Auto-rule generation | Frequent rejections auto-generate quality rules | Given the same rejection type occurs 3+ times, When the pattern is confirmed, Then a new quality rule is auto-proposed for the primer |

### 3.5 Phase 5: Moonshots

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-050 | A2A protocol agent cards | Agents publish A2A-compatible agent cards | Given an agent exists, When `a2a-server.sh card coder` runs, Then a valid A2A agent card JSON is returned |
| FR-051 | A2A task endpoint | Framework can receive tasks via A2A protocol | Given an A2A task request arrives, When it matches an agent capability, Then the task is routed to the appropriate agent |
| FR-052 | Arena mode | Multiple agents solve same task competitively | Given `/go --arena` flag, When a story is implemented, Then 2-3 agents produce solutions and gate-keeper picks the best |
| FR-053 | Arena scoring | Objective scoring of competing solutions | Given arena produces 3 solutions, When gate-keeper evaluates, Then scores are assigned on correctness, quality, security, performance |
| FR-054 | Compliance-as-code pipeline | Codified compliance checks as pipeline stages | Given `/go --compliance=hipaa`, When pipeline runs, Then compliance checks execute as formal pipeline stages with pass/fail/evidence |
| FR-055 | Compliance evidence collection | Automated evidence gathering for auditors | Given compliance pipeline completes, When report is generated, Then evidence artifacts are collected in `compliance/evidence/` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| CI pipeline execution | < 5 minutes for full test suite |
| Prompt capture overhead | < 100ms per agent invocation |
| Cost routing decision | < 50ms per dispatch |
| Arena mode overhead | < 3x single-agent execution time |
| Quality primer injection | < 10ms per agent startup |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Prompt capture | Captured prompts must NOT contain credentials; sanitize before logging |
| CI secrets | GitHub Actions secrets for any tokens; never in code |
| A2A protocol | Authentication required for incoming task requests |
| Compliance evidence | Evidence files must be tamper-evident (checksummed) |
| Routing config | No model API keys in routing.json; reference env vars only |

### 4.3 Scalability

| Aspect | Requirement |
|--------|-------------|
| Prompt capture storage | Compressed JSONL; auto-rotate at 100MB per session log |
| Arena mode | Support 2-5 concurrent competing agents |
| Compliance presets | Support unlimited custom compliance profiles |
| CI matrix | Support 3+ OS targets without timeout |

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| CI false positive rate | < 1% (flaky tests must be fixed immediately) |
| Prompt capture data loss | 0% (write-ahead logging pattern) |
| Arena mode fallback | Auto-fallback to single-agent on resource constraint |
| Compliance pipeline idempotency | Same input always produces same result |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    COMPETITIVE LEAP ARCHITECTURE                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  CI/CD LAYER (Phase 1)                                                │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  .github/workflows/                                          │     │
│  │  ├── ci.yml (test on push/PR)                               │     │
│  │  ├── sync-check.yml (platform sync verification)            │     │
│  │  └── release.yml (version tag + changelog)                  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  STANDARDS LAYER (Phase 3)                                            │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  Agent Trace ←── attribution.sh --format=agent-trace         │     │
│  │  Prompt Capture ←── session-recorder.sh --capture-prompts    │     │
│  │  Cost Router ←── scripts/cost-router.sh                      │     │
│  │  Routing Config ←── .claude/routing.json                     │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  QUALITY LAYER (Phase 4)                                              │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  agents/_quality-primer.md (shared quality injection module) │     │
│  │       ↕                                                      │     │
│  │  Rejection DB ←── .claude/rejections.jsonl                   │     │
│  │       ↕                                                      │     │
│  │  Auto-rules ←── .claude/learned-rules.jsonl                  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  MOONSHOT LAYER (Phase 5)                                             │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  A2A Server ←── scripts/a2a-server.sh (agent card + task)    │     │
│  │  Arena Mode ←── agents/_arena-protocol.md                    │     │
│  │  Compliance ←── compliance/{profile}/checks.sh               │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Entity: PromptCapture**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| session_id | string | FK to session | Parent session |
| timestamp | ISO8601 | required | When the prompt was sent |
| agent | string | required | Agent that received the prompt |
| direction | enum | prompt/response | Whether this is input or output |
| content_hash | string | required | SHA-256 of content (for dedup) |
| content | string | required | The actual prompt or response text |
| token_count | int | estimated | Approximate token count |
| model | string | optional | Model used for this invocation |

**Entity: CostRoute**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| agent | string | required | Agent type being routed |
| task_complexity | enum | low/medium/high/critical | Assessed task complexity |
| model_tier | enum | fast/standard/advanced | Model tier to use |
| estimated_tokens | int | optional | Estimated token budget |
| actual_tokens | int | optional | Actual tokens used (post-execution) |
| cost_usd | float | optional | Estimated cost in USD |

**Entity: ArenaEntry**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| story_id | string | FK to story | Story being competed |
| contestant_id | string | PK | Unique ID per competing agent run |
| agent | string | required | Agent type |
| model | string | required | Model used |
| solution_hash | string | required | Hash of produced solution |
| score_correctness | float | 0-1 | Functional correctness score |
| score_quality | float | 0-1 | Code quality score |
| score_security | float | 0-1 | Security compliance score |
| score_performance | float | 0-1 | Performance characteristics score |
| total_score | float | 0-1 | Weighted composite score |
| selected | boolean | default false | Whether this solution was selected |

**Entity: ComplianceEvidence**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| profile | string | required | Compliance profile (hipaa, soc2, gdpr) |
| check_id | string | required | Unique check identifier |
| check_name | string | required | Human-readable check name |
| status | enum | pass/fail/warning/skip | Check result |
| evidence_path | string | optional | Path to evidence artifact |
| evidence_hash | string | optional | SHA-256 of evidence file |
| timestamp | ISO8601 | required | When check was executed |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| GitHub Actions | N/A | CI/CD pipeline | Manual testing only |
| jq | 1.6+ | JSON processing for all data models | Graceful degradation |
| bash | 4.0+ | Shell scripting | Framework won't function |
| sha256sum | coreutils | Content hashing for captures and evidence | Fallback to md5sum |
| curl | any | A2A protocol HTTP communication | A2A features disabled |
| gzip | any | Prompt capture log compression | Uncompressed logs |

### 5.4 New Files & Integration Points

**Phase 0: Bug Fixes**

| File | Action | Purpose |
|------|--------|---------|
| `scripts/session-recorder.sh` | Modify | Fix exit code on empty list |
| `scripts/harvest.sh` | Modify | Fix exit code on empty status |
| `scripts/convert-to-copilot.sh` | Delete | Remove deprecated script |
| `.project-registry-meta.jsonl` | Fix/Remove | Fix 0-byte file |

**Phase 1: CI/CD & Cleanup**

| File | Action | Purpose |
|------|--------|---------|
| `.github/workflows/ci.yml` | Create | Main CI pipeline |
| `.github/workflows/sync-check.yml` | Create | Platform sync verification |
| `package.json` | Delete | Remove orphaned Node.js artifact |
| `package-lock.json` | Delete | Remove orphaned Node.js artifact |
| `README.md` | Modify | Add CI badge |

**Phase 2: Reference Project**

| File | Action | Purpose |
|------|--------|---------|
| `genesis/2026-02-XX-reference-project.md` | Create | PRD for the reference project |
| `README.md` | Modify | Link to reference project |

**Phase 3: Standards & Capture**

| File | Action | Purpose |
|------|--------|---------|
| `scripts/attribution.sh` | Modify | Add `--format=agent-trace` output |
| `scripts/session-recorder.sh` | Modify | Add `--capture-prompts` flag |
| `scripts/cost-router.sh` | Create | Cost-aware agent routing engine |
| `.claude/routing.json` | Create | Default routing configuration |
| `agents/_prompt-capture.md` | Create | Shared module for capture protocol |
| `agents/_cost-routing.md` | Create | Shared module for routing protocol |

**Phase 4: Quality & Intelligence**

| File | Action | Purpose |
|------|--------|---------|
| `agents/_quality-primer.md` | Create | Quality injection module |
| `scripts/rejection-tracker.sh` | Create | Track gate rejection patterns |
| `.claude/rejections.jsonl` | Create | Rejection pattern database |
| `.claude/learned-rules.jsonl` | Create | Auto-generated quality rules |

**Phase 5: Moonshots**

| File | Action | Purpose |
|------|--------|---------|
| `scripts/a2a-server.sh` | Create | A2A protocol server |
| `agents/_arena-protocol.md` | Create | Arena mode shared module |
| `compliance/hipaa/checks.sh` | Create | HIPAA compliance checks |
| `compliance/soc2/checks.sh` | Create | SOC2 compliance checks |
| `compliance/gdpr/checks.sh` | Create | GDPR compliance checks |
| `compliance/evidence/` | Create | Evidence artifact directory |

---

## 6. Contract Specification

This is a CLI framework (no REST API). This section defines CLI contracts, state machines, and output standards.

### 6.1 Cost Router State Machine

```
[TASK_RECEIVED] → [COMPLEXITY_ASSESSED] → [MODEL_SELECTED] → [DISPATCHED]
                          ↓
                   [OVERRIDE] (user config forces specific model)
```

| Current State | Action | Next State | Trigger | Validations |
|---------------|--------|------------|---------|-------------|
| TASK_RECEIVED | Assess | COMPLEXITY_ASSESSED | Agent dispatch request | Task has description and agent type |
| COMPLEXITY_ASSESSED | Route | MODEL_SELECTED | Routing rules match | Model tier available |
| COMPLEXITY_ASSESSED | Override | MODEL_SELECTED | User config specifies model | Config file exists and is valid |
| MODEL_SELECTED | Dispatch | DISPATCHED | Model confirmed available | Token budget not exceeded |

### 6.2 Arena Mode State Machine

```
[STORY_QUEUED] → [CONTESTANTS_SPAWNED] → [ALL_COMPLETE] → [EVALUATED] → [WINNER_SELECTED]
                          ↓                     ↓
                    [TIMEOUT]            [PARTIAL_COMPLETE]
                          ↓                     ↓
                    [BEST_AVAILABLE]      [EVALUATE_PARTIAL]
```

| Current State | Action | Next State | Trigger | Side Effects |
|---------------|--------|------------|---------|--------------|
| STORY_QUEUED | Spawn contestants | CONTESTANTS_SPAWNED | Arena mode flag on | 2-3 agents started in parallel |
| CONTESTANTS_SPAWNED | All finish | ALL_COMPLETE | All agents report done | Solutions collected |
| CONTESTANTS_SPAWNED | Timeout | TIMEOUT | Max time exceeded | Kill remaining agents |
| ALL_COMPLETE | Evaluate | EVALUATED | Gate-keeper scores all | Scores recorded per contestant |
| TIMEOUT | Evaluate partial | EVALUATED | Available solutions scored | Incomplete solutions penalized |
| EVALUATED | Select winner | WINNER_SELECTED | Highest total score | Winner solution applied, others discarded |

### 6.3 Compliance Pipeline State Machine

```
[PROFILE_LOADED] → [CHECKS_RUNNING] → [EVIDENCE_COLLECTED] → [REPORT_GENERATED]
                          ↓
                    [CHECK_FAILED]
                          ↓
                    [REMEDIATION_SUGGESTED]
```

### 6.4 CLI Confirmation Matrix

| Command | Action Type | Confirmation Required | `--force` Bypass |
|---------|-------------|----------------------|------------------|
| `tests/run-tests.sh` | Read-only | None | N/A |
| `sync-platforms.sh check` | Read-only | None | N/A |
| `attribution.sh report --format=agent-trace` | Read-only | None | N/A |
| `cost-router.sh route` | Agent dispatch | None (follows config) | N/A |
| `session-recorder.sh --capture-prompts` | Write (append) | None (opt-in via flag) | N/A |
| `rejection-tracker.sh auto-rule` | Write (add rule) | Prompt: "Add rule: [description]?" | Yes |
| `a2a-server.sh start` | Network listener | Prompt: "Start A2A server on port [X]?" | Yes |
| `/go --arena` | Multi-agent execution | Prompt: "Arena mode uses 2-3x resources. Continue?" | Yes |
| `/go --compliance=hipaa` | Compliance pipeline | None (additive checks) | N/A |
| File deletion (cleanup) | Destructive | Prompt: "Delete [file]?" | Yes |

### 6.5 CLI Output Standards

All new scripts follow the established pattern from existing framework scripts:

```bash
# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Standard output patterns
echo -e "${GREEN}[PASS]${NC} Description"
echo -e "${YELLOW}[WARN]${NC} Description"
echo -e "${RED}[FAIL]${NC} Description"
echo -e "${CYAN}[INFO]${NC} Description"
echo -e "${BLUE}[STEP X/Y]${NC} Description"
```

All scripts support: `--help`, `--json` (where applicable), `--quiet`, `--verbose`.
Exit codes: 0=success, 1=error, 2=user cancellation.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** All core tooling remains shell-based (bash). No Node.js, Python, or other runtime for core features.
- **Technical:** GitHub Actions is the CI/CD platform (free tier sufficient for public repo).
- **Technical:** A2A protocol implementation is HTTP-based using curl + lightweight bash HTTP handling (no web framework).
- **Business:** Framework must remain zero-cost. No paid API dependencies for core features.
- **Resource:** Single developer workflow. Arena mode runs agents sequentially or in limited parallelism.
- **Privacy:** Prompt capture is opt-in by default. No prompts are captured without explicit flag.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| GitHub Actions free tier is sufficient | CI minutes exhausted on heavy use | Optimize test suite runtime; cache dependencies |
| Agent Trace format is stable enough to target | Format changes break compatibility | Version the format output; abstract behind `--format` flag |
| A2A protocol matures to production | Wasted effort on dead protocol | Minimal implementation; agent cards are useful regardless |
| Bash HTTP handling is sufficient for A2A | Complex requests fail | Limit to simple JSON POST/GET; document limitations |
| Arena mode adds value over single-agent | Extra cost without quality gain | Benchmark arena vs single-agent on same tasks; user decides |
| Reference project is small enough for one PRD | Scope creep | Keep it to a simple CLI tool (not a full-stack app) |

### 7.3 Out of Scope

- [ ] Web-based CI dashboard (GitHub Actions UI is sufficient)
- [ ] Custom model hosting or fine-tuning
- [ ] Real-time streaming of agent output during arena mode
- [ ] MCP server implementation (evaluate in future PRD once standard stabilizes)
- [ ] Multi-user arena tournaments
- [ ] Paid compliance certification (we provide checks, not certification)
- [ ] Migration from bash to another language
- [ ] Vector database for knowledge search (stay with TF-IDF based approach)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | CI pipeline is flaky due to shell test brittleness | M | H | Pin bash version in CI; use `set -euo pipefail`; fix SIGPIPE patterns |
| R-002 | Reference project reveals framework is not production-ready | M | H | This is the point — fix every friction found; document all issues |
| R-003 | Agent Trace format changes before v1.0 | M | L | Abstract behind `--format` flag; version the output |
| R-004 | Prompt capture creates massive log files | H | M | Compression, rotation at 100MB, configurable retention |
| R-005 | Cost routing adds complexity without clear cost savings | M | M | Default to passthrough (no routing); user opts in via config |
| R-006 | Arena mode is too slow for practical use | M | M | Time-bounded execution; fallback to single-agent |
| R-007 | A2A protocol doesn't gain adoption | M | L | Agent cards are useful standalone; minimal implementation cost |
| R-008 | Quality primer injection adds latency | L | L | Primer is static text; negligible injection time |
| R-009 | Self-improving rules generate false positive quality rules | M | H | Human approval gate for auto-generated rules; easy disable |
| R-010 | Dead code removal breaks something undocumented | L | M | Grep for all references before deletion; test after removal |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites | Version |
|-------|------|-------|---------------|---------|
| 0 | Bug Fixes | FR-000 to FR-003 | None | 1.9.0.16 |
| 1 | CI/CD & Cleanup | FR-010 to FR-015 | Phase 0 | 1.9.0.17 |
| 2 | Reference Project | FR-020 to FR-023 | Phase 1 (CI validates the project) | 1.9.0.18 |
| 3 | Standards & Capture | FR-030 to FR-035 | Phase 1 (CI tests new features) | 1.10.0.0 |
| 4 | Quality & Intelligence | FR-040 to FR-044 | Phase 3 (needs capture data) | 1.10.0.1 |
| 5 | Moonshots | FR-050 to FR-055 | Phase 3 + 4 | 1.11.0.0 |

### 9.2 Phase Dependency Graph

```
Phase 0: Bug Fixes
    │
    ▼
Phase 1: CI/CD & Cleanup
    │
    ├──────────────────┐
    │                  │
    ▼                  ▼
Phase 2: Reference  Phase 3: Standards
Project             & Capture
    │                  │
    │                  ▼
    │           Phase 4: Quality
    │           & Intelligence
    │                  │
    └──────────────────┘
             │
             ▼
      Phase 5: Moonshots
```

**Parallelism note:** Phase 2 (Reference Project) and Phase 3 (Standards & Capture) can run in parallel after Phase 1 completes. Phase 4 depends on Phase 3 (needs capture infrastructure). Phase 5 depends on Phase 3 and 4 (needs standards foundation + quality rules).

### 9.3 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 0 - Bug Fixes | S | Low | Low |
| 1 - CI/CD & Cleanup | M | Low | Low |
| 2 - Reference Project | XL | Medium | Medium |
| 3 - Standards & Capture | L | Medium | Medium |
| 4 - Quality & Intelligence | L | High | Medium |
| 5 - Moonshots | XL | High | High |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

**Phase 0: Bug Fixes**
- [ ] `session-recorder.sh list` returns exit code 0 on empty data
- [ ] `harvest.sh --status` returns exit code 0 on empty data
- [ ] `convert-to-copilot.sh` removed, no remaining references
- [ ] `.project-registry-meta.jsonl` either has valid content or is properly initialized
- [ ] All existing tests still pass

**Phase 1: CI/CD & Cleanup**
- [ ] `.github/workflows/ci.yml` exists and runs on push/PR
- [ ] CI runs `tests/run-tests.sh` and reports results
- [ ] CI runs `sync-platforms.sh check` and verifies 0 drift
- [ ] CI badge displays in README
- [ ] `package.json` and `package-lock.json` removed
- [ ] No orphaned or deprecated files remain
- [ ] All tests pass in CI on Ubuntu and macOS

**Phase 2: Reference Project**
- [ ] Reference project PRD created and validated
- [ ] `/go` successfully builds the project end-to-end
- [ ] All 46 agent types invoked during build (verified via analytics)
- [ ] Lessons learned documented and framework bugs fixed
- [ ] README links to reference project

**Phase 3: Standards & Capture**
- [ ] `attribution.sh report --format=agent-trace` outputs valid Agent Trace JSON
- [ ] `session-recorder.sh start --capture-prompts` captures agent I/O
- [ ] Prompt capture is opt-in (off by default)
- [ ] `cost-router.sh` routes based on task complexity
- [ ] `.claude/routing.json` defines default routing rules
- [ ] `/cost` shows per-agent token breakdown
- [ ] Tests cover all new features

**Phase 4: Quality & Intelligence**
- [ ] `agents/_quality-primer.md` exists and is referenced by code-generating agents
- [ ] Gate rejection patterns are tracked in `.claude/rejections.jsonl`
- [ ] `/analytics rejections` shows top rejection categories
- [ ] Auto-rules are proposed (with human approval) after 3+ identical rejections
- [ ] Tests cover rejection tracking and rule generation

**Phase 5: Moonshots**
- [ ] `a2a-server.sh card <agent>` returns valid A2A agent card JSON
- [ ] `/go --arena` spawns competing agents and selects winner
- [ ] `/go --compliance=hipaa` runs HIPAA-specific checks
- [ ] Compliance evidence is collected in `compliance/evidence/`
- [ ] Tests cover A2A cards, arena scoring, compliance pipeline

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Framework Author | SBS | Pending | |
| AI Partner | Claude | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Agent Trace | Cursor-pioneered format for recording agent actions and attribution | `agent_trace` |
| A2A | Google's Agent-to-Agent protocol for inter-agent communication | `a2a` |
| Arena Mode | Multiple agents compete on same task, best solution wins | `arena` |
| Cost Router | Engine that routes agents to appropriate model tiers based on task complexity | `cost_router` |
| Prompt Capture | Recording of raw prompts sent to and responses received from agents | `prompt_capture` |
| Quality Primer | Pre-generation injection of quality rules into agent system prompts | `quality_primer` |
| Rejection Tracker | System that tracks patterns in gate-keeper rejections for learning | `rejection_tracker` |
| Compliance Pipeline | Automated compliance checks executed as pipeline stages | `compliance_pipeline` |
| Reference Project | Real application built entirely using the framework to validate it works | `reference_project` |

### 11.2 References

- [Agent Trace RFC (Cursor)](https://cursor.com/blog/agent-trace) — Attribution format standard
- [A2A Protocol (Google/Linux Foundation)](https://google.github.io/A2A/) — Agent-to-Agent communication
- [MCP (Anthropic)](https://modelcontextprotocol.io/) — Model Context Protocol
- [Entire.io](https://entire.io/) — AI-native IDE with prompt capture and cost analytics
- [Windsurf Arena Mode](https://windsurf.com/) — Multi-agent competition approach
- [SkillFoundry Framework Assessment (2026-02-15)](../docs/competitive-assessment.md) — Internal competitive analysis

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-15 | SBS + Claude | Initial draft from competitive assessment |

---

# PRD: Phase 2 — Make It Excellent (Epics 5-8)

---
prd_id: phase2-make-it-excellent
title: "Phase 2: Make It Excellent — Runtime Orchestration, Semantic Memory, Security Coverage, PRD Validation"
version: 1.0
status: DRAFT
created: 2026-03-16
author: n00b73
last_updated: 2026-03-16

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: [real-autonomous-agents, semgrep-security-integration]
  recommends: [passive-memory-engine]
  blocks: []
  shared_with: [quality-intelligence-layer]

tags: [core, agents, memory, security, validation, phase2]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry v2.0.51 has a working agent system (53 registered agents, state machine, budget tracking, AI runner loop), a layered recall memory system, Semgrep-based security scanning, and a full T0-T6 gate pipeline. However, four critical depth gaps remain:

1. **Agents cannot communicate with each other.** Each agent runs in isolation. There is no message bus, no concurrency pool, and no way to monitor runtime state across agents. This prevents real multi-agent collaboration.
2. **Memory search is keyword-only.** The layered recall system uses TF-IDF scoring, which misses semantic relationships. A query for "authentication flow" will not match a memory about "login sequence" unless keywords overlap.
3. **Security scanning has blind spots.** Semgrep covers OWASP code patterns, and the dependency scanner covers known CVEs. But there is no secrets detection (leaked API keys, tokens), no IaC scanning (misconfigured Dockerfiles, Terraform), and no license compliance checking.
4. **PRD validation is structural, not semantic.** The pipeline checks that PRDs exist and have required sections, but cannot evaluate whether the content is specific, consistent, or complete enough to drive implementation.

These gaps mean SkillFoundry can orchestrate work but cannot coordinate agents, recall context semantically, catch all security issues, or prevent low-quality PRDs from entering the pipeline.

### 1.2 Proposed Solution

Deliver four focused capabilities across Epics 5-8:

- **Epic 5 — Runtime Agent Orchestration:** A typed message bus for cross-agent communication, an AgentPool with configurable concurrency, a `sf runtime status` CLI command, structured JSON logging per agent, and contract tests between agent pairs.
- **Epic 6 — Semantic Memory System:** Vector embeddings via Ollama (nomic-embed-text) with OpenAI fallback, ChromaDB local storage for similarity search, a `sf memory search` CLI command, and a precision benchmark suite.
- **Epic 7 — Security Scanning Full Coverage:** Gitleaks for secrets scanning, Checkov for IaC scanning, a license compliance checker, and a unified security report aggregating all scanners.
- **Epic 8 — PRD Semantic Validation:** An LLM-powered PRD quality scorer with a structured rubric, pipeline hard-block for low scores, a `sf prd review` CLI command, and precision benchmarks.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Agent-to-agent delegation | Not possible | Typed message bus with pub/sub | Unit test: agent A publishes, agent B receives within 50ms |
| Concurrent agent execution | Sequential only | 3+ parallel agents via AgentPool | Integration test: 3 agents complete tasks concurrently |
| Memory search recall | Keyword-only (TF-IDF) | Semantic similarity >0.75 precision | Benchmark suite: 50 query/result pairs |
| Secrets detection | None | Gitleaks catches test secrets in 100% of seeded repos | CI test with known-secret fixture |
| IaC scanning | None | Checkov flags misconfigured Dockerfiles/Terraform | Fixture-based test suite |
| License compliance | None | GPL flagged in commercial projects | Test with mixed-license fixture |
| PRD quality gating | Structural only | LLM scorer blocks PRDs <6/10 | 10 synthetic PRDs (5 good, 5 bad), >80% accuracy, <10% false positive |

---

## 2. User Stories

### Primary User: Framework Developer (using SkillFoundry to build software)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have agents delegate subtasks to each other via typed messages | complex multi-step workflows execute without manual intervention | MUST |
| US-002 | developer | run multiple agents concurrently with a configurable pool size | large projects process faster without overloading the system | MUST |
| US-003 | developer | see runtime status of all agents (state, queue depth, health) | I can monitor and debug agent orchestration | MUST |
| US-004 | developer | get structured JSON logs per agent with task correlation IDs | I can trace issues across multi-agent workflows | MUST |
| US-005 | developer | search memory semantically ("auth flow" finds "login sequence") | I find relevant context even when exact keywords differ | MUST |
| US-006 | developer | have memory search fall back to OpenAI embeddings when Ollama is unavailable | memory search works regardless of local model availability | SHOULD |
| US-007 | developer | scan for leaked secrets before code passes the T4 gate | accidental credential exposure is caught before merge | MUST |
| US-008 | developer | scan IaC files for misconfigurations | Dockerfiles and Terraform configs meet security baselines | SHOULD |
| US-009 | developer | check dependency licenses for GPL violations in commercial projects | legal compliance is enforced automatically | SHOULD |
| US-010 | developer | get a unified security report combining all scanners | I see the full security posture in one view | MUST |
| US-011 | developer | have PRDs scored by an LLM for completeness, specificity, consistency, and scope | low-quality PRDs are caught before they waste implementation effort | MUST |
| US-012 | developer | have PRDs scoring below 6/10 on any dimension blocked from the pipeline | the pipeline never executes against vague or incomplete requirements | MUST |
| US-013 | developer | run `sf prd review <path>` to get actionable improvement suggestions | I can fix PRD issues before submitting to the pipeline | MUST |

### Secondary User: CI/CD Pipeline

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-014 | CI pipeline | run Gitleaks as a pre-merge check | secrets never reach the main branch | MUST |
| US-015 | CI pipeline | consume the unified security report as JSON | automated dashboards and alerts can consume scan results | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

#### Epic 5 — Runtime Agent Orchestration

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Cross-Agent Message Bus | Typed EventEmitter supporting publish/subscribe with message envelope (sender, recipient, type, payload, correlationId, timestamp) | Given agent A publishes a `task:delegate` message, When agent B is subscribed to `task:delegate`, Then agent B receives the message within 50ms with correct envelope fields |
| FR-002 | AgentPool | Pool manager that limits concurrent agent execution to a configurable maximum (default: 3) with FIFO task queue | Given pool size is 3 and 5 tasks are submitted, When execution starts, Then 3 agents run concurrently and 2 wait in queue; When a running agent completes, Then the next queued task starts within 100ms |
| FR-003 | Runtime Status Command | `sf runtime status` CLI command showing per-agent state, task queue depth, active tasks, uptime, and health indicators | Given 2 agents are running and 1 is idle, When `sf runtime status` is invoked, Then output shows each agent's state, current task, and queue depth in a formatted table |
| FR-004 | Structured Agent Logging | JSON-structured log entries per agent containing agentId, taskId, correlationId, phase, duration, status, and message | Given an agent completes a task, Then a JSON log entry is written with all required fields and duration is accurate to millisecond precision |
| FR-005 | Agent Pair Contract Tests | Test suite validating message contracts between specific agent pairs: orchestrator-to-coder, coder-to-tester, tester-to-reporter | Given the orchestrator sends a `code:generate` message, When the coder agent receives it, Then the coder can parse the payload and its response matches the orchestrator's expected response schema |

#### Epic 6 — Semantic Memory System

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-006 | Vector Embedding Service | Embedding service using Ollama nomic-embed-text locally, falling back to OpenAI text-embedding-3-small when Ollama is unavailable | Given Ollama is running with nomic-embed-text, When text is submitted for embedding, Then a 768-dimension float array is returned within 500ms; Given Ollama is unavailable, When text is submitted, Then OpenAI fallback produces a 1536-dimension embedding within 2s |
| FR-007 | ChromaDB Local Integration | ChromaDB instance storing memory embeddings with metadata (source, timestamp, scope, tags) supporting similarity search with configurable top-k | Given 100 memories are indexed, When a similarity query is executed with top-k=5, Then the 5 most similar results are returned with distance scores in <200ms |
| FR-008 | Memory Search CLI | `sf memory search "<query>"` command exposing layered recall with semantic ranking, supporting `--mode index|preview|full` and `--top-k N` flags | Given memories exist in ChromaDB, When `sf memory search "authentication flow"` is run, Then results include semantically related memories (e.g., about login) ranked by similarity score |
| FR-009 | Precision Benchmark Suite | 50 manually curated query/result pairs testing recall precision, with automated scoring and regression detection | Given the benchmark suite runs against the current embedding model, When precision is calculated, Then the score is >0.75; Given a model change degrades precision below 0.75, Then the benchmark fails with a clear diff |

#### Epic 7 — Security Scanning Full Coverage

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-010 | Gitleaks Secrets Scanning | Gitleaks integration scanning staged files and full repo for secrets (API keys, tokens, passwords), mandatory pre-T4 gate | Given a file contains an AWS access key, When Gitleaks scan runs, Then the finding is reported with file path, line number, and secret type; Given Gitleaks runs at T4, When secrets are found, Then the gate fails with actionable output |
| FR-011 | Checkov IaC Scanning | Checkov integration scanning Terraform, Dockerfile, and CloudFormation files for misconfigurations | Given a Dockerfile uses `latest` tag, When Checkov scan runs, Then a finding is reported with severity and remediation; Given no IaC files exist, When Checkov scan runs, Then it completes with a clean report (no error) |
| FR-012 | License Compliance Checker | Scanner that reads dependency manifests (package.json, requirements.txt, Cargo.toml, go.mod, *.csproj) and flags GPL/AGPL licenses in projects marked as commercial | Given a project uses a GPL-licensed dependency and the project is marked commercial, When the license checker runs, Then the GPL dependency is flagged with license name and source package |
| FR-013 | Unified Security Report | Aggregator combining output from Semgrep, Gitleaks, Checkov, dependency scanner, and license checker into a single JSON report with optional HTML rendering | Given all scanners have run, When the unified report is generated, Then it contains sections per scanner with finding count, severity breakdown, and individual findings; The HTML report is readable in a browser with collapsible sections |

#### Epic 8 — PRD Semantic Validation

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-014 | LLM PRD Quality Scorer | LLM-powered scorer evaluating PRDs on four dimensions: completeness (all sections filled meaningfully), specificity (concrete acceptance criteria, no vague language), consistency (no contradictions between sections), and scope (clear boundaries, explicit exclusions) — each scored 1-10 | Given a well-written PRD, When the scorer runs, Then all four dimensions score >= 7/10 with justification text; Given a vague PRD with "TBD" markers, When the scorer runs, Then completeness and specificity score <= 4/10 |
| FR-015 | Pipeline Hard Block | PRDs scoring <6/10 on any dimension are blocked from entering the `/go` pipeline, with the blocking dimension and score clearly reported | Given a PRD scores 5/10 on specificity, When `/go` is invoked, Then the pipeline halts with message "PRD blocked: specificity scored 5/10 (minimum 6/10)" and lists specific improvement suggestions |
| FR-016 | PRD Review CLI | `sf prd review <path>` command that scores a PRD and outputs per-dimension scores, justifications, and actionable improvement suggestions | Given a PRD file exists, When `sf prd review genesis/my-feature.md` is run, Then output shows four dimension scores with justifications and 2-5 specific suggestions per low-scoring dimension |
| FR-017 | PRD Scorer Precision | Scorer achieves >80% accuracy on a benchmark of 10 synthetic PRDs (5 well-written, 5 poorly-written) with <10% false positive rate (good PRDs incorrectly blocked) | Given the 10-PRD benchmark runs, When results are evaluated, Then accuracy >80% and false positive rate <10%; Benchmark PRDs and expected scores are version-controlled |

### 3.2 User Interface Requirements

This PRD covers CLI-only features. No web UI is in scope.

**CLI Command: `sf runtime status`**
- Purpose: Display live agent orchestration state
- Key elements: Table with columns: Agent ID, State, Current Task, Queue Depth, Uptime, Health
- User flow: Developer runs command during or after pipeline execution

**CLI Command: `sf memory search "<query>"`**
- Purpose: Semantic search over project and framework memory
- Key elements: Ranked results with similarity score, source, timestamp; supports `--mode` and `--top-k` flags
- User flow: Developer searches for context before or during development

**CLI Command: `sf prd review <path>`**
- Purpose: Score and review a PRD before pipeline submission
- Key elements: Four dimension scores (1-10), justification text, improvement suggestions
- User flow: Developer writes PRD, runs review, iterates until scores pass threshold

### 3.3 API Requirements (if applicable)

No HTTP API. All features are CLI commands and internal TypeScript APIs consumed by the pipeline.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Message bus delivery latency | < 50ms between publish and subscriber callback |
| AgentPool task dispatch | < 100ms from queue to agent start |
| Embedding generation (Ollama, local) | < 500ms per text chunk |
| Embedding generation (OpenAI, fallback) | < 2000ms per text chunk |
| ChromaDB similarity query (100 memories) | < 200ms |
| ChromaDB similarity query (10,000 memories) | < 1000ms |
| Gitleaks full-repo scan | < 30s for repositories up to 10,000 files |
| Checkov scan | < 60s for 50 IaC files |
| PRD LLM scoring | < 15s per PRD (single LLM call with structured output) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Embedding API keys | Stored in environment variables, never logged or embedded in code |
| ChromaDB data | Local-only, stored in `.sf/memory/chroma/`, excluded from git via `.gitignore` |
| Gitleaks findings | Redacted in logs (show file:line but not the secret value) |
| LLM PRD scoring | PRD content sent to LLM provider; no secrets should be in PRDs by convention |
| Agent message bus | In-process only; no network exposure |

### 4.3 Scalability

The message bus and AgentPool are in-process, single-machine constructs. Scaling to distributed agents is explicitly out of scope. ChromaDB is local-only; migration to a hosted vector DB is a future consideration.

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Embedding fallback | Automatic failover from Ollama to OpenAI within 3s timeout |
| Scanner failure isolation | One scanner failing does not block others; unified report marks failed scanners |
| AgentPool crash recovery | If an agent throws, the pool recovers the slot and logs the failure |
| ChromaDB corruption | Rebuild from source memories (layered-recall JSONL files are the source of truth) |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Structured logging | All new modules use `getLogger()` from `src/utils/logger.ts` with JSON output |
| Agent logs | Include agentId, taskId, correlationId in every log entry |
| Scanner logs | Include scanner name, file count scanned, finding count, duration |
| Memory search logs | Include query text (truncated to 100 chars), result count, latency |
| Health check | `sf runtime status` serves as the health check for agent orchestration |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Layer (sf_cli)                     │
│  sf runtime status │ sf memory search │ sf prd review    │
├─────────────────────────────────────────────────────────┤
│                   Core Services                          │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│ │ Message Bus   │ │ Embedding    │ │ Security         │  │
│ │ AgentPool     │ │ Service      │ │ Aggregator       │  │
│ │ Agent Logger  │ │ ChromaDB     │ │ PRD Scorer       │  │
│ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘  │
│        │                │                   │            │
│ ┌──────┴───────┐ ┌──────┴───────┐ ┌────────┴─────────┐  │
│ │ agent.ts     │ │ layered-     │ │ semgrep-scanner  │  │
│ │ agent-       │ │ recall.ts    │ │ dependency-      │  │
│ │ registry.ts  │ │ memory-      │ │ scanner.ts       │  │
│ │ ai-runner.ts │ │ harvest.ts   │ │ gates.ts         │  │
│ └──────────────┘ └──────────────┘ └──────────────────┘  │
│                  (existing modules)                      │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Entity: AgentMessage**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, auto-generated | Unique message identifier |
| sender | string | Required, must match registered agent ID | Agent that published the message |
| recipient | string or "*" | Required | Target agent ID or "*" for broadcast |
| type | string (enum) | Required, from MessageType union | Message classification (task:delegate, result:complete, etc.) |
| payload | Record<string, unknown> | Required | Typed payload matching the message type |
| correlationId | string (UUID) | Required | Links related messages in a conversation |
| timestamp | number | Auto-generated (Date.now()) | Unix millisecond timestamp |

**Entity: EmbeddingRecord**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK | Unique embedding identifier |
| text | string | Required, max 8192 chars | Original text that was embedded |
| embedding | number[] | Required, 768 or 1536 dimensions | Float vector from embedding model |
| source | string | Required | Origin file path or memory category |
| scope | string | Required, enum: project/framework/global | Memory scope level |
| tags | string[] | Optional | Categorization tags |
| timestamp | number | Required | When the memory was created |

**Entity: SecurityFinding**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK | Unique finding identifier |
| scanner | string | Required, enum: semgrep/gitleaks/checkov/dependency/license | Which scanner found this |
| severity | string | Required, enum: critical/high/medium/low/info | Finding severity |
| file | string | Required | File path relative to project root |
| line | number | Optional | Line number in file |
| rule | string | Required | Scanner rule ID that triggered |
| message | string | Required | Human-readable description |
| remediation | string | Optional | Suggested fix |

**Entity: PrdScore**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| prdPath | string | Required | Path to the scored PRD file |
| completeness | number | Required, 1-10 | All sections filled meaningfully |
| specificity | number | Required, 1-10 | Concrete criteria, no vague language |
| consistency | number | Required, 1-10 | No contradictions between sections |
| scope | number | Required, 1-10 | Clear boundaries, explicit exclusions |
| justifications | Record<string, string> | Required | Per-dimension explanation |
| suggestions | string[] | Required | Actionable improvements |
| timestamp | number | Required | When the scoring was performed |
| model | string | Required | LLM model used for scoring |
| pass | boolean | Required | True if all dimensions >= 6 |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| chromadb-client (npm) | ^1.x | Vector storage and similarity search | Memory search falls back to TF-IDF keyword search |
| Ollama (system binary) | >=0.3 | Local embedding model host (nomic-embed-text) | Falls back to OpenAI text-embedding-3-small |
| OpenAI API | text-embedding-3-small | Fallback embedding provider | Memory search falls back to TF-IDF if both providers fail |
| Gitleaks (system binary) | >=8.18 | Secrets scanning | Gate logs warning, scan skipped with documented risk acceptance |
| Checkov (pip package) | >=3.0 | IaC security scanning | IaC scanning skipped, logged as gap in security report |
| spdx-license-list (npm) | ^6.x | License identification for compliance checking | License checking uses bundled known-license map as fallback |

### 5.4 Integration Points

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| agent.ts (existing) | Import/extend | Message bus integrates with Agent base class event emitter | Core team |
| agent-registry.ts (existing) | Import | AgentPool reads registered agents and their configurations | Core team |
| layered-recall.ts (existing) | Import/extend | ChromaDB augments existing TF-IDF search with semantic re-ranking | Core team |
| gates.ts (existing) | Hook | Gitleaks scan added as mandatory T4 pre-check | Core team |
| pipeline.ts (existing) | Hook | PRD semantic validation added before story generation | Core team |
| semgrep-scanner.ts (existing) | Import | Unified report aggregates Semgrep findings alongside new scanners | Core team |
| dependency-scanner.ts (existing) | Import | Unified report aggregates dependency findings; license checker reuses manifest parsing | Core team |

---

## 6. Contract Specification

Not applicable. This PRD covers CLI tools and internal TypeScript APIs, not HTTP APIs. Message contracts between agents are defined in STORY-001 and STORY-004.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** All vector storage must be local-only (no cloud vector DB). Ollama must be optional (graceful fallback).
- **Technical:** Gitleaks and Checkov are external binaries; installation is the user's responsibility. The framework must detect their absence and degrade gracefully.
- **Technical:** LLM PRD scoring uses the same provider already configured in SkillFoundry (via `sf_cli/src/core/provider.ts`). No additional LLM provider setup.
- **Resource:** Single developer. All features must be implementable incrementally (wave-based execution).

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Ollama nomic-embed-text produces 768-dimension embeddings | Dimension mismatch crashes ChromaDB inserts | Check model metadata at startup, configure collection dimensions dynamically |
| ChromaDB npm client supports local persistent storage | Need to spawn a separate ChromaDB server process | Fall back to chromadb-default-ef with SQLite backend |
| Gitleaks JSON output format is stable across minor versions | Parser breaks on upgrade | Pin to specific version range, validate output schema before parsing |
| Checkov SARIF output is available for all frameworks | Some framework results are text-only | Support both SARIF and JSON output parsing |
| LLM can reliably score PRDs with structured JSON output | Unstructured or hallucinated scores | Use function calling / JSON mode, validate response schema, retry once on parse failure |

### 7.3 Out of Scope

- Distributed agent communication (network-based message bus, gRPC, etc.)
- Cloud-hosted vector database (Pinecone, Weaviate, etc.)
- Web UI for runtime status, security reports, or PRD review
- Custom embedding model training or fine-tuning
- SBOM (Software Bill of Materials) generation
- Container image scanning (Trivy, Grype)
- PRD auto-generation or auto-fix (scoring and suggestions only)
- Multi-tenant or multi-user agent orchestration

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Ollama not installed on developer machines | M | M | OpenAI fallback with clear setup documentation; `sf setup` checks for Ollama |
| R-002 | ChromaDB npm client API instability (pre-1.0) | M | H | Pin version, wrap all calls in adapter layer, integration tests catch breaking changes |
| R-003 | Gitleaks false positives on test fixtures or documentation | H | L | Support `.gitleaksignore` file, document suppression workflow |
| R-004 | LLM scoring inconsistency (same PRD gets different scores on re-run) | M | M | Use temperature=0, structured JSON output, cache scores with TTL; benchmark detects drift |
| R-005 | ChromaDB storage grows unbounded | L | M | Configurable max collection size, prune oldest entries beyond threshold |
| R-006 | Checkov installation complexity (Python dependency) | M | L | Document pip install, detect absence gracefully, skip with warning |
| R-007 | Agent message bus contention under high concurrency | L | M | Async queue with backpressure; AgentPool limits concurrency at source |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| Wave A | Foundations | Message bus (STORY-001), Embedding service (STORY-005), Gitleaks integration (STORY-009) | Existing agent.ts, layered-recall.ts, gates.ts |
| Wave B | Core Systems | AgentPool (STORY-002), ChromaDB integration (STORY-006), Checkov + License checker (STORY-010), PRD scorer (STORY-012) | Wave A complete |
| Wave C | CLI & Integration | Runtime status CLI + logging (STORY-003), Memory search CLI (STORY-007), Unified security report (STORY-011), PRD review CLI + pipeline block (STORY-013) | Wave B complete |
| Wave D | Validation | Agent contract tests (STORY-004), Memory precision benchmark (STORY-008) | Wave C complete |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| Wave A | M | Medium | Low |
| Wave B | L | High | Medium |
| Wave C | M | Medium | Low |
| Wave D | M | Medium | Medium |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [x] All MUST-priority user stories implemented
- [x] All functional requirements pass acceptance criteria
- [x] Unit test coverage >= 80% for business logic (message bus, embedding service, scoring)
- [x] Integration tests for all CLI commands
- [x] Contract tests between agent pairs pass
- [x] Memory precision benchmark passes >0.75 threshold
- [x] PRD scorer benchmark passes >80% accuracy threshold
- [x] Security scanners degrade gracefully when external tools are missing
- [x] Structured JSON logging active for all new modules
- [x] All new CLI commands have `--help` documentation
- [x] No critical/high severity bugs open

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | n00b73 | Pending | |
| Security Review | Self | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Message Bus | Typed in-process pub/sub system for agent-to-agent communication | AgentMessageBus |
| Agent Pool | Concurrency-limited pool managing parallel agent execution | AgentPool |
| Embedding | Dense vector representation of text for similarity comparison | EmbeddingVector |
| ChromaDB | Local vector database for storing and querying embeddings | ChromaStore |
| Layered Recall | Existing memory system with index/preview/full retrieval modes | LayeredRecall |
| Gitleaks | Open-source tool for detecting hardcoded secrets in git repos | GitleaksScanner |
| Checkov | Open-source IaC scanner for Terraform, Docker, CloudFormation | CheckovScanner |
| PRD Score | Four-dimension quality assessment of a Product Requirements Document | PrdScore |
| Unified Report | Aggregated security report combining all scanner outputs | SecurityReport |

### 11.2 References

- Existing agent system: `sf_cli/src/core/agent.ts`, `sf_cli/src/core/agent-registry.ts`
- Existing AI runner: `sf_cli/src/core/ai-runner.ts`
- Existing memory: `sf_cli/src/core/layered-recall.ts`, `sf_cli/src/core/memory-harvest.ts`
- Existing security: `sf_cli/src/core/semgrep-scanner.ts`, `sf_cli/src/core/dependency-scanner.ts`
- Existing gates: `sf_cli/src/core/gates.ts`
- Existing pipeline: `sf_cli/src/core/pipeline.ts`
- Gitleaks: https://github.com/gitleaks/gitleaks
- Checkov: https://github.com/bridgecrewio/checkov
- ChromaDB: https://www.trychroma.com/
- Ollama: https://ollama.com/

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-16 | n00b73 | Initial draft — Epics 5-8 gap analysis and specification |

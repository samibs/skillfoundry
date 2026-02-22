# PRD: Framework Evolution - Swarm Intelligence & Collective Learning

---
prd_id: framework-evolution
title: Framework Evolution - Swarm Intelligence & Collective Learning
version: 1.1
status: DRAFT
created: 2026-02-07
author: SBS + Claude
last_updated: 2026-02-07

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [core, framework, agents, memory, swarm, knowledge]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry Framework (v1.7.0.2) has 41 agents operating in a top-down orchestration model: `/go` dispatches waves, agents execute in isolation, report back, next wave starts. This creates two limitations:

1. **Rigid coordination**: Agents cannot self-organize, hand off work mid-task, or dynamically respond to emerging needs. A tester waits for an entire wave to finish before testing code that was ready 30 seconds in.

2. **Knowledge is one-way**: The framework installs bootstrap knowledge into projects, but lessons learned during project execution (escalation decisions, error patterns, successful code patterns) are trapped in each project. The next project starts from scratch instead of benefiting from collective experience.

Additionally, developers lack real-time visibility into agent execution, have no cost tracking, and miss several quality-of-life features that would make the Dream Team significantly more productive.

### 1.2 Proposed Solution

A four-phase evolution of the framework:

1. **Bidirectional Knowledge Exchange** - Projects harvest learned knowledge back to the central framework, making every future installation smarter.
2. **Swarm Agent Coordination** - Agents self-organize around a shared task queue with real-time handoffs, replacing rigid wave-based orchestration.
3. **Developer Experience & Observability** - Live execution dashboard, cost tracking, execution replay, and quality-of-life commands.
4. **Advanced Intelligence** - Semantic knowledge search, agent learning profiles, compliance presets, and multi-project support.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Knowledge reuse across projects | 0% (one-way only) | 80%+ of escalation decisions reused | `memory.sh metrics` |
| Agent idle time during execution | ~40% (waiting for waves) | < 10% (swarm pulls next task) | Execution metrics dashboard |
| User interruptions per `/go` run | ~5-10 escalations | < 3 (knowledge pre-answers) | `logs/escalations.md` count |
| Time-to-insight on execution | Post-completion only | Real-time | Dashboard availability |
| Framework bootstrap knowledge | 15 entries (static) | 100+ entries (growing) | `memory.sh status` |

---

## 2. User Stories

### Primary User: Framework Developer (using the Dream Team)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have project lessons flow back to the central framework | the next project I start benefits from everything I've learned | MUST |
| US-002 | developer | have agents self-organize and hand off work dynamically | execution is faster and agents don't sit idle waiting for waves | MUST |
| US-003 | developer | see a live dashboard of what agents are doing right now | I know the execution state without waiting for completion | MUST |
| US-004 | developer | know how many tokens/cost each `/go` run consumed | I can budget and optimize agent usage | SHOULD |
| US-005 | developer | replay a completed execution step-by-step | I can understand what each agent did and why | SHOULD |
| US-006 | developer | search my knowledge base semantically | I can ask "how did we handle auth?" instead of grepping | SHOULD |
| US-007 | developer | have agents learn my code style and patterns | generated code matches my preferences out of the box | COULD |
| US-008 | developer | apply compliance presets (HIPAA, SOC2, GDPR) | gate-keeper enforces compliance-specific rules automatically | COULD |
| US-009 | developer | run `/go` across a monorepo with cross-package dependencies | multi-package projects work without manual coordination | COULD |
| US-010 | developer | run `/go --dry-run` to preview what would happen | I can review the plan before any files are touched | MUST |
| US-011 | developer | run `/go --review-only` on existing code | I get a quality audit without any implementation | SHOULD |
| US-012 | developer | see a project registry dashboard | I know the status of all my projects at a glance | COULD |
| US-013 | developer | have agents explain their last action in plain english | I understand decisions without reading agent logs | SHOULD |
| US-014 | developer | undo the last agent action | I can revert a single action without rolling back everything | SHOULD |
| US-015 | developer | see quality metrics trending over time | I can track improvement across versions | COULD |

---

## 3. Functional Requirements

### 3.1 Phase 1: Bidirectional Knowledge Exchange

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Knowledge Harvest | Extract learned knowledge from project memory_bank back to central framework | Given a project with escalation decisions, When `memory.sh harvest` runs, Then decisions are copied to central bootstrap with dedup |
| FR-002 | Knowledge Sync | Bidirectional push/pull between framework and project | Given framework has new bootstrap entries, When `memory.sh sync` runs, Then project gets new entries AND framework gets project lessons |
| FR-003 | Knowledge Deduplication | Prevent duplicate entries when harvesting from multiple projects | Given the same decision exists in 3 projects, When all 3 are harvested, Then only 1 entry exists in central with weight boosted |
| FR-004 | Knowledge Promotion | Quality gate for promoting project knowledge to central | Given a harvested entry, When it appears in 3+ projects OR has weight > 0.8, Then it's auto-promoted; otherwise flagged for review |
| FR-005 | Escalation Auto-Capture | Automatically capture user escalation decisions as knowledge | Given user answers an escalation, When they choose an option, Then a knowledge entry is created in project memory_bank |
| FR-006 | Harvest via Update | `update.sh` runs harvest during update cycle | Given `update.sh --all` runs, When visiting each project, Then harvest is performed before pushing updates |
| FR-007 | Knowledge Categories | Distinguish project-specific vs universal knowledge | Given a harvested entry, When it references project-specific entities, Then tag as `scope:project`; otherwise tag as `scope:universal` |

### 3.2 Phase 2: Swarm Agent Coordination

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-010 | Shared Task Queue | Central task queue that agents pull from | Given 10 stories queued, When 3 agents are available, Then each pulls the next available task without central dispatch |
| FR-011 | Dynamic Handoffs | Agent-to-agent handoff mid-task | Given coder completes a function, When tester capacity is available, Then tester picks up testing for that function immediately (no wave boundary) |
| FR-012 | Shared Scratchpad | Inter-agent communication channel | Given coder changes an interface, When writing a note to scratchpad, Then security agent and tester can see the note before their turn |
| FR-013 | Task Stealing | Idle agents can help busy agents (deferred to Phase 4 - requires mature swarm primitives) | Given agent A is idle and agent B has a large story, When B's story has parallelizable sub-tasks, Then A can steal a sub-task |
| FR-014 | Conflict Detection | Real-time detection of file conflicts between concurrent agents | Given two agents are writing, When both touch the same file, Then one is paused and the conflict is flagged |
| FR-015 | Swarm Mode Flag | Enable/disable swarm vs wave execution | Given `/go --swarm` flag, When execution starts, Then swarm coordination is used instead of wave dispatch |
| FR-016 | Swarm Fallback | Graceful degradation to wave mode | Given swarm execution encounters coordination failure, When retry fails, Then automatically fall back to wave mode |
| FR-017 | Agent Availability Pool | Track which agent types are available | Given the pool has 1 coder and 1 tester, When coder finishes, Then tester starts immediately; coder takes next task |

### 3.3 Phase 3: Developer Experience & Observability

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-020 | Dry Run Mode | Simulate `/go` without writing files | Given `/go --dry-run`, When pipeline runs, Then shows what would happen (stories, agents, files) but writes nothing |
| FR-021 | Review-Only Mode | Quality audit without implementation | Given `/go --review-only`, When run on existing code, Then gate-keeper + evaluator run and produce report |
| FR-022 | Cost Tracking | Token usage per agent, story, phase | Given a `/go` run completes, When `/go --cost` or `/cost` runs, Then breakdown by agent/story/phase is shown |
| FR-023 | Execution Explain | Explain last agent action | Given `/explain` runs, When previous agent action exists, Then plain-english explanation is shown |
| FR-024 | Single Action Undo | Revert last agent action | Given `/undo` runs, When previous action is reversible, Then it's reverted; otherwise user is warned |
| FR-025 | Framework Health Check | Self-diagnostic for framework installation | Given `/health` runs, When checking configs/versions/hooks, Then report of issues and recommendations |
| FR-026 | Notification Hooks | External notifications on completion/escalation | Given a hook is configured for Slack/Discord, When `/go` completes or escalates, Then notification is sent |
| FR-027 | Incremental Execution | Only re-run stories whose PRD sections changed | Given a PRD was partially modified, When `/go` runs, Then only affected stories are re-implemented |
| FR-028 | Live Execution Dashboard | Terminal UI showing agent progress | Given `/go` is running, When dashboard mode is enabled, Then real-time progress is shown (current agent, story, token usage) |

### 3.4 Phase 4: Advanced Intelligence

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-030 | Semantic Knowledge Search | Natural language search over knowledge base | Given `memory.sh search "how did we handle auth?"`, When knowledge exists about auth decisions, Then relevant entries are returned ranked by relevance |
| FR-031 | Agent Learning Profiles | Agents remember code style preferences per developer | Given coder generates code in 5 projects, When style patterns are consistent, Then coder adapts to match style in future projects |
| FR-032 | Cross-Agent Learning | Fixer patterns teach gate-keeper prevention | Given fixer fixes "missing input validation" 5 times, When coder generates new endpoints, Then coder proactively adds validation |
| FR-033 | Compliance Presets | Pre-built gate-keeper rule sets for regulations | Given `/go --compliance=hipaa`, When gate-keeper validates, Then HIPAA-specific rules are enforced (encryption, audit logging, access controls) |
| FR-034 | Dependency Audit Integration | Gate-keeper checks package vulnerabilities | Given a story adds new dependencies, When gate-keeper validates, Then `npm audit` / `pip audit` results are checked |
| FR-035 | Secret Scanning | Pre-commit style secret detection in framework | Given code is generated, When gate-keeper validates, Then secrets/credentials/API keys are detected and rejected |
| FR-036 | Monorepo Support | Cross-package dependency tracking | Given a monorepo with 3 packages, When `/go` runs, Then stories across packages are coordinated with cross-package dependencies |
| FR-037 | Project Registry Dashboard | Overview of all registered projects | Given `./scripts/registry.sh dashboard`, When multiple projects are registered, Then status/version/health of each is shown |
| FR-038 | Metrics Trending | Track quality metrics across versions | Given 5 `/go` runs have completed, When `/go --metrics` runs, Then trend charts (coverage, violations, auto-fixes) are shown |
| FR-039 | PRD Diffing | Show which stories are affected by PRD changes | Given a PRD is modified, When `/go --diff` runs, Then affected stories are listed with change summary |
| FR-040 | Template Inheritance | Specialized templates extend base templates | Given `prd-web-app-auth.md` extends `prd-web-app.md`, When wizard generates PRD, Then auth sections are pre-filled on top of web-app base |

### 3.5 User Interface Requirements

All features are CLI-based (terminal). No web frontend.

**Dashboard: Live Execution (FR-028)**
- Purpose: Real-time visibility into `/go` execution
- Key elements: Progress bars per story, current agent indicator, token counter, elapsed time, escalation queue
- Format: Terminal UI (ncurses-style or ASCII art), refreshes in-place

**Dashboard: Project Registry (FR-037)**
- Purpose: Status overview of all registered projects
- Key elements: Table with project path, platform, framework version, last update, health status
- Format: ASCII table output

**Dashboard: Cost Report (FR-022)**
- Purpose: Token usage breakdown
- Key elements: Table by agent, by story, by phase; totals; comparison to previous runs
- Format: ASCII table with optional JSON export

### 3.6 API Requirements

N/A - This is a CLI framework, no REST APIs.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Knowledge harvest time | < 5s per project |
| Knowledge sync (bidirectional) | < 10s per project |
| Swarm task handoff latency | < 1s between agents |
| Dashboard refresh rate | Every 2s during execution |
| Dry run execution | < 30s for analysis phase |
| Health check | < 5s for full diagnostic |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Knowledge sanitization | No secrets, credentials, or PII in harvested knowledge |
| Scratchpad isolation | Scratchpad entries are project-scoped, never cross project boundaries |
| Compliance presets | Rules are additive (never weaken existing gate-keeper rules) |
| Secret scanning | Detection only (no secrets stored in framework knowledge) |

### 4.3 Scalability

| Aspect | Requirement |
|--------|-------------|
| Knowledge base size | Support 10,000+ entries without performance degradation |
| Registered projects | Support 100+ projects in registry |
| Concurrent swarm agents | Support up to 5 concurrent agent tasks |
| Monorepo packages | Support up to 20 packages per monorepo |

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Swarm fallback to wave | 100% automatic on coordination failure |
| Knowledge corruption prevention | Atomic writes with backup before mutation |
| Harvest deduplication accuracy | > 95% (false positives acceptable, false negatives not) |
| State recovery after crash | Resume from last checkpoint (existing capability) |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FRAMEWORK EVOLUTION ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CENTRAL FRAMEWORK (~/dev_tools/skillfoundry/)                        │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │  memory_bank/knowledge/                                    │     │
│  │  ├── bootstrap.jsonl (grows via harvest)                   │     │
│  │  ├── decisions-universal.jsonl (promoted from projects)    │     │
│  │  ├── errors-universal.jsonl (promoted from projects)       │     │
│  │  └── patterns-universal.jsonl (code patterns)              │     │
│  │                                                            │     │
│  │  .project-registry (project paths + metadata)              │     │
│  └───────────────────────────────────────────────────────────┘     │
│           │ install/update          ▲ harvest                      │
│           ▼                         │                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │
│  │  PROJECT A     │  │  PROJECT B     │  │  PROJECT C     │       │
│  │  memory_bank/  │  │  memory_bank/  │  │  memory_bank/  │       │
│  │  ├── facts     │  │  ├── facts     │  │  ├── facts     │       │
│  │  ├── decisions │  │  ├── decisions │  │  ├── decisions │       │
│  │  └── errors    │  │  └── errors    │  │  └── errors    │       │
│  └────────────────┘  └────────────────┘  └────────────────┘       │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  SWARM COORDINATION (within a project)                             │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │                    TASK QUEUE                               │     │
│  │  [STORY-005] [STORY-004] [STORY-003] [STORY-002]         │     │
│  │       │           │           │           │                │     │
│  │       ▼           ▼           ▼           ▼                │     │
│  │  ┌─────────────────────────────────────────────┐          │     │
│  │  │           AGENT POOL                         │          │     │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │          │     │
│  │  │  │Coder │ │Tester│ │SecScan│ │Evaluator │  │          │     │
│  │  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───────┘  │          │     │
│  │  │     │        │        │        │            │          │     │
│  │  │     └────────┴────────┴────────┘            │          │     │
│  │  │              │                               │          │     │
│  │  │     ┌────────▼────────┐                     │          │     │
│  │  │     │  SCRATCHPAD     │                     │          │     │
│  │  │     │  (shared notes) │                     │          │     │
│  │  │     └─────────────────┘                     │          │     │
│  │  └─────────────────────────────────────────────┘          │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Entity: KnowledgeEntry (extended)**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| type | enum | fact/decision/error/pattern/preference | Knowledge category |
| content | string | required | The knowledge content |
| weight | float | 0.0-1.0 | Confidence/relevance weight |
| tags | string[] | optional | Categorization tags |
| scope | enum | project/universal | Whether project-specific or universal |
| source_project | string | optional | Project path where this originated |
| promotion_count | int | default 0 | How many projects this appeared in |
| harvested_at | ISO8601 | optional | When this was harvested to central |
| lineage | object | required | Origin tracking (agent, timestamp, context) |

**Entity: SwarmTask**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string | PK | Task identifier (STORY-XXX or sub-task) |
| story_id | string | FK | Parent story |
| status | enum | queued/claimed/in_progress/complete/failed/blocked | Current state |
| claimed_by | string | optional | Agent type that claimed this task |
| claimed_at | ISO8601 | optional | When claimed |
| dependencies | string[] | optional | Task IDs that must complete first |
| files_touched | string[] | optional | Files this task modifies (for conflict detection) |
| scratchpad_notes | object[] | optional | Notes left by/for other agents |
| result | object | optional | Completion result |

**Entity: ProjectRegistry (extended)**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| path | string | PK | Absolute project path |
| platform | enum | claude/copilot/cursor | Installed platform |
| framework_version | string | semver | Installed framework version |
| last_updated | ISO8601 | required | Last update timestamp |
| last_harvested | ISO8601 | optional | Last knowledge harvest |
| knowledge_count | int | default 0 | Total knowledge entries in project |
| health_status | enum | healthy/warning/error | Last health check result |
| total_go_runs | int | default 0 | Number of `/go` executions |
| total_tokens_used | int | default 0 | Cumulative token usage |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| jq | 1.6+ | JSON processing for knowledge/state files | Graceful degradation to grep-based parsing |
| bash | 4.0+ | Shell scripting for all tools | Framework won't function |
| realpath | coreutils | Path resolution for dedup | Fallback to readlink -f |
| bc | any | Weight calculations | Fallback to integer math |
| flock | util-linux | File locking for swarm coordination | Fallback to lockfile approach |

### 5.4 New Files & Integration Points

**Phase 1: Knowledge Exchange**

| File | Type | Purpose |
|------|------|---------|
| `scripts/harvest.sh` | Shell script | Extract knowledge from project → central |
| `scripts/registry.sh` | Shell script | Project registry CRUD + dashboard |
| `agents/knowledge-curator.md` | Agent | Evaluate and promote harvested knowledge |
| `memory_bank/knowledge/decisions-universal.jsonl` | Data | Promoted decisions from all projects |
| `memory_bank/knowledge/errors-universal.jsonl` | Data | Promoted error patterns from all projects |
| `memory_bank/knowledge/patterns-universal.jsonl` | Data | Promoted code patterns from all projects |

**Phase 2: Swarm Coordination**

| File | Type | Purpose |
|------|------|---------|
| `agents/_swarm-coordinator.md` | Agent module | Shared swarm coordination protocol |
| `parallel/swarm-queue.sh` | Shell script | Task queue CRUD operations |
| `parallel/swarm-scratchpad.sh` | Shell script | Scratchpad read/write operations |
| `parallel/conflict-detector.sh` | Shell script | Real-time file conflict detection |
| `.claude/commands/swarm.md` | Skill | `/swarm` command for swarm management |

**Phase 3: Developer Experience**

| File | Type | Purpose |
|------|------|---------|
| `.claude/commands/explain.md` | Skill | `/explain` last agent action |
| `.claude/commands/undo.md` | Skill | `/undo` last agent action |
| `.claude/commands/cost.md` | Skill | `/cost` token usage report |
| `.claude/commands/health.md` | Skill | `/health` framework diagnostic |
| `scripts/dashboard.sh` | Shell script | Live execution terminal UI |
| `scripts/cost-tracker.sh` | Shell script | Token counting and reporting |

**Phase 4: Advanced Intelligence**

| File | Type | Purpose |
|------|------|---------|
| `scripts/semantic-search.sh` | Shell script | TF-IDF based knowledge search |
| `agents/compliance-profiles/` | Directory | HIPAA, SOC2, GDPR rule sets |
| `agents/agent-profile.md` | Agent module | Learning profile protocol |
| `scripts/monorepo.sh` | Shell script | Cross-package dependency resolution |

---

## 6. Contract Specification

This is a CLI framework (no REST API). This section defines the CLI interface contract, state machines, and confirmation requirements.

### 6.1 SwarmTask State Transitions

```
                    ┌──────────┐
                    │  QUEUED   │
                    └────┬─────┘
                         │ agent claims task
                         ▼
                    ┌──────────┐
          ┌─────── │ CLAIMED   │
          │        └────┬─────┘
          │             │ agent begins work
          │             ▼
          │        ┌──────────────┐
          │        │ IN_PROGRESS  │──────────┐
          │        └──┬───────┬───┘          │
          │           │       │              │ dependency unmet
          │   success │       │ failure      │ or conflict
          │           ▼       ▼              ▼
          │     ┌──────────┐ ┌──────────┐ ┌──────────┐
          │     │ COMPLETE │ │  FAILED  │ │ BLOCKED  │
          │     └──────────┘ └────┬─────┘ └────┬─────┘
          │                       │             │
          │              retry    │  dependency  │
          │          (max 3)      │  resolved    │
          │                       ▼             │
          └───────────────── QUEUED ◄───────────┘
```

| Current State | Action | Next State | Who Can Trigger | Validations | Side Effects |
|---------------|--------|------------|-----------------|-------------|--------------|
| QUEUED | Claim | CLAIMED | Any idle agent | No file conflicts with in-progress tasks | Lock task, record agent type + timestamp |
| CLAIMED | Start work | IN_PROGRESS | Claiming agent | Agent has required capabilities | Update scratchpad, begin file tracking |
| CLAIMED | Abandon | QUEUED | Claiming agent or coordinator | Timeout (>60s without progress) | Release lock, clear agent assignment |
| IN_PROGRESS | Complete | COMPLETE | Working agent | All acceptance criteria met | Release file locks, notify dependent tasks, write result |
| IN_PROGRESS | Fail | FAILED | Working agent or coordinator | Max retries not exceeded | Log failure reason, increment retry count |
| IN_PROGRESS | Block | BLOCKED | Conflict detector | Dependency unmet or file conflict detected | Pause work, record blocking reason |
| FAILED | Retry | QUEUED | Coordinator | Retry count < 3 | Increment retry, exponential backoff (1s, 2s, 4s) |
| FAILED | Escalate | BLOCKED | Coordinator | Max retries exceeded | Flag for user intervention, log to escalations |
| BLOCKED | Unblock | QUEUED | Coordinator | Blocking condition resolved | Clear block reason, re-queue with priority boost |

**Invalid Transitions (must fail explicitly):**
- COMPLETE -> any state (terminal state, task is done)
- QUEUED -> IN_PROGRESS (must go through CLAIMED)
- BLOCKED -> COMPLETE (must re-execute through QUEUED -> CLAIMED -> IN_PROGRESS)
- QUEUED -> FAILED (cannot fail without attempting work)

### 6.2 KnowledgeEntry Promotion State

```
[PROJECT_LOCAL] → [HARVESTED] → [CANDIDATE] → [PROMOTED]
                                     ↓
                               [REJECTED]
```

| Current State | Action | Next State | Trigger | Validations |
|---------------|--------|------------|---------|-------------|
| PROJECT_LOCAL | Harvest | HARVESTED | `memory.sh harvest` | No secrets/PII in content |
| HARVESTED | Evaluate | CANDIDATE | Appears in 2+ projects | Content is not project-specific |
| CANDIDATE | Promote | PROMOTED | Appears in 3+ projects OR weight > 0.8 | Deduplication check passed |
| CANDIDATE | Reject | REJECTED | Flagged as project-specific or low-quality | Scope tagged as `project` |
| REJECTED | Re-evaluate | CANDIDATE | Manual override or weight increases | New evidence provided |

### 6.3 CLI Confirmation Matrix

Commands that modify state require varying levels of confirmation. This matrix defines which commands run freely vs which require `--force` or interactive confirmation.

| Command | Action Type | Confirmation Required | `--force` Bypass |
|---------|-------------|----------------------|------------------|
| `memory.sh harvest` | Read from project, write to central | None (additive only) | N/A |
| `memory.sh sync` | Bidirectional read/write | Prompt: "Sync will push X entries and pull Y entries. Continue?" | Yes |
| `memory.sh promote` | Elevate knowledge scope | None (automated by criteria) | N/A |
| `/go --swarm` | Full project implementation | Standard `/go` confirmation | N/A |
| `/go --dry-run` | Read-only simulation | None (no mutations) | N/A |
| `/go --review-only` | Read-only audit | None (no mutations) | N/A |
| `/undo` | Revert last action | Prompt: "Undo [action description]?" | Yes |
| `/cost` | Read-only report | None (no mutations) | N/A |
| `/explain` | Read-only report | None (no mutations) | N/A |
| `/health` | Read-only diagnostic | None (no mutations) | N/A |
| `harvest.sh --all` | Harvest all registered projects | Prompt: "Harvest from N projects?" | Yes |
| `registry.sh remove` | Unregister a project | Prompt: "Remove [path] from registry?" | Yes |
| `registry.sh dashboard` | Read-only display | None (no mutations) | N/A |
| `swarm-queue.sh reset` | Clear all queued tasks | Prompt: "Clear task queue? In-progress tasks will be abandoned." | Yes |
| `conflict-detector.sh resolve` | Auto-merge or serialize conflicts | Prompt: "Resolve conflict on [file]?" | Yes |

### 6.4 CLI Output Standards

All new scripts follow consistent output formatting:

```bash
# Success output
echo -e "${GREEN}[PASS]${NC} Description of what succeeded"

# Warning output
echo -e "${YELLOW}[WARN]${NC} Description of warning"

# Error output
echo -e "${RED}[FAIL]${NC} Description of failure"

# Info output
echo -e "${CYAN}[INFO]${NC} Description of information"

# Progress output
echo -e "${BLUE}[STEP X/Y]${NC} Description of current step"
```

All scripts support:
- `--help` flag for usage documentation
- `--json` flag for machine-readable output (where applicable)
- `--quiet` flag for suppressing non-essential output
- `--verbose` flag for detailed logging
- Exit code 0 for success, 1 for error, 2 for user cancellation

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** All tooling must be shell-based (bash). No Node.js, Python, or other runtime dependencies for core functionality. jq is the only external dependency.
- **Technical:** Swarm coordination uses file-based locking (flock/lockfile). No external message queue or database.
- **Technical:** Semantic search is TF-IDF based (no vector database or ML model dependency).
- **Business:** Framework must remain zero-cost to use (no paid API dependencies for core features).
- **Resource:** Single developer workflow (not designed for team collaboration on the same project simultaneously).

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| File-based locking is sufficient for swarm coordination | Race conditions under heavy concurrent load | Implement retry with exponential backoff; fallback to wave mode |
| JSONL is sufficient for 10,000+ knowledge entries | Performance degradation on large knowledge bases | Implement indexed search; archive old entries |
| Users run update.sh regularly enough for harvest to work | Knowledge doesn't flow back | Add reminder in `/go` output; auto-harvest on `/go` completion |
| TF-IDF is sufficient for "semantic" search | Poor search results for complex queries | Clearly document as keyword-weighted search, not true semantic |
| Project memory_bank directories persist between sessions | Knowledge lost if project is deleted | Central framework retains harvested copies |

### 7.3 Out of Scope

- [ ] Web-based dashboard (all UI is terminal-based)
- [ ] Multi-user collaboration on the same project simultaneously
- [ ] Vector database or ML-based semantic search
- [ ] Paid API integrations (OpenAI embeddings, Pinecone, etc.)
- [ ] Real-time inter-machine agent coordination (agents run on single machine)
- [ ] Automatic code generation from learned patterns (patterns are reference, not generators)
- [ ] Git-based knowledge versioning (knowledge uses JSONL append-only, not git)
- [ ] Agent personality customization (agents follow fixed agent definitions)
- [ ] Cross-framework compatibility (only SkillFoundry, not other AI frameworks)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Knowledge pollution - low-quality entries contaminate central bootstrap | M | H | Promotion threshold: entry must appear in 3+ projects OR have weight > 0.8 before promotion |
| R-002 | Swarm file conflicts - two agents edit same file simultaneously | H | M | Conflict detector runs pre-claim; file locking during writes; automatic serialization on conflict |
| R-003 | Swarm complexity makes debugging harder | M | M | Execution replay captures every action; fallback to wave mode always available |
| R-004 | Knowledge base grows too large for grep-based search | L | M | Implement archival for entries with weight < 0.1; indexed search for large bases |
| R-005 | Harvested knowledge contains project-specific references | H | L | Scope tagging (project vs universal); sanitization pass during harvest |
| R-006 | Token cost tracking is inaccurate | M | L | Track at agent dispatch level; acknowledge estimates are approximate |
| R-007 | Dashboard refresh impacts execution performance | L | M | Dashboard reads state file passively; never blocks agent execution |
| R-008 | Monorepo cross-package deps create circular dependencies | M | H | Circular dep detection (existing in wave-planner.sh); fail fast with clear error |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites | Version |
|-------|------|-------|---------------|---------|
| 1 | Knowledge Exchange | FR-001 to FR-007 (harvest, sync, dedup, promotion, auto-capture) | None | 1.8.0.0 |
| 2 | Swarm Coordination | FR-010 to FR-012, FR-014 to FR-017 (task queue, handoffs, scratchpad, conflict detection) | Phase 1 (agents need shared knowledge for coordination) | 1.8.0.1 |
| 3 | Developer Experience | FR-020 to FR-028 (dry-run, cost, explain, undo, health, dashboard) | Phase 1 (some features reference knowledge base) | 1.8.0.2 |
| 4 | Advanced Intelligence | FR-013, FR-030 to FR-040 (task stealing, semantic search, learning, compliance, monorepo) | Phase 1 + 2 + 3 | 1.9.0.0 |

### 9.3 Phase Dependency Graph

```
Phase 1: Knowledge Exchange
    │
    ├──────────────────┐
    │                  │
    ▼                  ▼
Phase 2: Swarm    Phase 3: DX
(can run in       (can run in
 parallel)         parallel)
    │                  │
    └──────────────────┘
             │
             ▼
    Phase 4: Advanced
    (requires 1 + 2 + 3)
```

**Parallelism note**: Phase 2 (Swarm Coordination) and Phase 3 (Developer Experience) are independent of each other. Both depend only on Phase 1 (Knowledge Exchange). They can be developed and released in parallel or in either order. Phase 4 requires all three preceding phases as it builds on swarm primitives (for task stealing), knowledge exchange (for semantic search), and DX tooling (for metrics trending).

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 - Knowledge Exchange | M | Medium | Low |
| 2 - Swarm Coordination | XL | High | Medium |
| 3 - Developer Experience | L | Medium | Low |
| 4 - Advanced Intelligence | XL | High | Medium |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

**Phase 1: Knowledge Exchange**
- [ ] `memory.sh harvest` extracts project knowledge to central framework
- [ ] `memory.sh sync` performs bidirectional knowledge exchange
- [ ] `update.sh --all` includes harvest step
- [ ] Deduplication prevents duplicate entries (>95% accuracy)
- [ ] Promotion criteria enforced (3+ projects OR weight > 0.8)
- [ ] Escalation decisions auto-captured as knowledge entries
- [ ] Scope tagging (project vs universal) applied correctly
- [ ] Tests cover harvest, sync, dedup, promotion flows
- [ ] Documentation updated (AUTONOMOUS-EXECUTION.md, DOCUMENTATION-INDEX.md)

**Phase 2: Swarm Coordination**
- [ ] `/go --swarm` enables swarm mode
- [ ] Agents pull tasks from shared queue
- [ ] Dynamic handoffs work (coder → tester without wave boundary)
- [ ] Scratchpad allows inter-agent communication
- [ ] File conflict detection prevents concurrent writes to same file
- [ ] Automatic fallback to wave mode on coordination failure
- [ ] SwarmTask state transitions enforced per Section 6.1 contract
- [ ] Performance: swarm execution faster than wave for 5+ independent stories
- [ ] Tests cover task queue, handoffs, conflicts, fallback, state transitions
- [ ] Documentation for swarm mode added

**Phase 3: Developer Experience**
- [ ] `/go --dry-run` shows execution plan without writing files
- [ ] `/go --review-only` runs quality audit on existing code
- [ ] `/cost` shows token usage breakdown
- [ ] `/explain` describes last agent action in plain english
- [ ] `/undo` reverts last reversible agent action
- [ ] `/health` produces framework diagnostic report
- [ ] All new commands have `--help` documentation
- [ ] Tests cover each new command

**Phase 4: Advanced Intelligence**
- [ ] Task stealing allows idle agents to help busy agents (FR-013, deferred from Phase 2)
- [ ] Semantic search returns relevant results for natural language queries
- [ ] Compliance presets add rules without weakening existing gate-keeper
- [ ] Dependency audit integrated into gate-keeper validation
- [ ] Secret scanning catches hardcoded credentials
- [ ] Monorepo support handles cross-package dependencies
- [ ] Project registry dashboard shows all registered projects
- [ ] Tests cover task stealing, search, compliance, scanning, monorepo flows

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
| Harvest | Extracting learned knowledge from a project back to central framework | `harvest` |
| Promotion | Elevating project-scoped knowledge to universal scope | `promote` |
| Swarm | Self-organizing agent coordination model (vs top-down wave dispatch) | `swarm` |
| Wave | Existing batch-based execution model (groups of independent tasks) | `wave` |
| Scratchpad | Shared inter-agent communication channel within a swarm | `scratchpad` |
| Task Queue | Ordered list of tasks that agents pull from in swarm mode | `task_queue` |
| Handoff | Transfer of work from one agent to another mid-execution | `handoff` |
| Dry Run | Simulated execution that shows what would happen without modifying files | `dry_run` |
| Knowledge Entry | A single fact, decision, error pattern, or code pattern in the knowledge base | `knowledge_entry` |
| Scope | Whether knowledge is project-specific or universally applicable | `scope` |
| Compliance Preset | Pre-built set of gate-keeper rules for a specific regulation | `compliance_preset` |

### 11.2 References

- [Parallel Dispatch Protocol](../agents/_parallel-dispatch.md) - Current wave-based dispatch
- [Parallel Execution Docs](../docs/PARALLEL-EXECUTION.md) - DAG-based coordination
- [Autonomous Execution](../docs/AUTONOMOUS-EXECUTION.md) - Permission profile setup
- [Escalation Criteria](../docs/ESCALATION-CRITERIA.md) - Auto-fix vs escalation matrix
- [Memory Bank Architecture](../memory_bank/README.md) - Current knowledge system
- [Fixer Orchestrator](../agents/fixer-orchestrator.md) - Auto-remediation routing

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-07 | SBS + Claude | Initial draft from brainstorming session |
| 1.1 | 2026-02-07 | SBS + Claude | Added SwarmTask state machine (6.1), KnowledgeEntry promotion states (6.2), CLI confirmation matrix (6.3), CLI output standards (6.4), Phase 2/3 parallelism graph (9.3), deferred FR-013 to Phase 4 |

---

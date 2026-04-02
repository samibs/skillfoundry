# PRD: Claude Code Architecture Parity — Harness Engineering Upgrade

---
prd_id: claude-code-architecture-parity
title: Claude Code Architecture Parity — Harness Engineering Upgrade
version: 1.0
status: DRAFT
created: 2026-04-01
author: n00b73
last_updated: 2026-04-01

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [skillfoundry-v3-mcp-agent-server]
  blocks: []
  shared_with: [real-autonomous-agents]

tags: [core, architecture, mcp, tools, agents, harness]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry v3 has a working MCP server with 20+ tools and 17 agents, but its harness architecture lacks several battle-tested patterns found in production-grade agentic systems. Analysis of Claude Code's internal architecture (1,902 TypeScript files, 207 commands, 184 tool entries, 43 tool modules across 35 subsystems) reveals critical patterns SkillFoundry is missing:

1. **No tool-per-folder self-containment** — Tools lack dedicated prompt files, UI renderers, constants, and permission modules. Everything lives in monolithic handler files.
2. **No layered permission system** — No deny-lists, prefix-blocking, simple-mode, or trust-gated deferred init. All tools are always available.
3. **No streaming protocol** — MCP responses are fire-and-forget. No incremental `message_start → tool_match → message_delta → message_stop` event stream.
4. **No session transcript compaction** — Context window fills up and dies. No automatic pruning or budget enforcement.
5. **No command segmentation** — No separation between builtins, plugin-like, and skill-like commands. Everything is flat.
6. **No bootstrap pipeline** — No staged startup with trust gates, prefetch side effects, or deferred initialization.
7. **No built-in verification agent** — No agent that specifically verifies other agents' work with tool evidence.

These gaps make SkillFoundry fragile in long sessions, insecure in untrusted workspaces, and less composable than the architecture it competes with.

### 1.2 Proposed Solution

Upgrade SkillFoundry's MCP server harness with 7 architectural patterns extracted from Claude Code's production architecture:

1. **Tool Module System** — Self-contained tool folders with prompt, constants, permissions, UI schema
2. **Permission Engine** — Deny-list + prefix-blocking + simple-mode + trust gates
3. **Streaming Event Protocol** — Incremental SSE events for tool execution lifecycle
4. **Transcript Compaction Engine** — Automatic context window management with token budgets
5. **Command Graph** — Segmented command registry (builtins / plugins / skills)
6. **Bootstrap Pipeline** — Staged startup with prefetch, trust gates, deferred init
7. **Verification Agent** — Built-in agent that validates other agents' output with tool evidence

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Tool self-containment | 0% (monolithic handlers) | 100% (folder-per-tool) | Each tool has its own directory with prompt.ts, constants.ts, permissions check |
| Permission denials enforced | 0 (all tools exposed) | deny-list + prefix + simple-mode | Unit tests for ToolPermissionContext |
| Streaming events per tool call | 0 | 4+ events (start, match, delta, stop) | SSE event count per tool invocation |
| Context overflow crashes | Frequent in long sessions | 0 (auto-compaction) | Session length before failure |
| Startup stages | 1 (direct load) | 7 (staged bootstrap) | Bootstrap pipeline stage count |
| Agent output verification | Manual | Automated via verification agent | Verification agent invocation rate |

---

## 2. User Stories

### Primary User: AI Developer using SkillFoundry MCP Server

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have tools with self-contained prompts and permissions | I can add/modify tools without touching monolithic files | MUST |
| US-002 | developer | restrict which tools are available per workspace | untrusted projects can't access destructive tools | MUST |
| US-003 | developer | see streaming progress during long tool executions | I know what's happening instead of staring at a spinner | MUST |
| US-004 | developer | have sessions that survive long conversations | context window overflow doesn't kill my session | MUST |
| US-005 | developer | have categorized commands (builtin/plugin/skill) | I can filter and discover capabilities by category | SHOULD |
| US-006 | developer | have a staged startup that validates environment | misconfigured workspaces fail fast with clear errors | SHOULD |
| US-007 | developer | have a verification agent that checks work automatically | I catch agent hallucinations before they ship | MUST |
| US-008 | developer | block specific tools by name or prefix | I can create safe execution environments for CI/CD | SHOULD |
| US-009 | developer | run in "simple mode" with only core tools | I can debug issues without tool noise | COULD |
| US-010 | developer | have token budget enforcement per session | runaway sessions don't burn through API credits | SHOULD |

---

## 3. Functional Requirements

### 3.1 FR-100: Tool Module System

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-101 | Tool folder structure | Each MCP tool lives in its own directory with standardized files | Given any tool, When I look in `src/tools/{ToolName}/`, Then I find `{ToolName}.ts`, `prompt.ts`, `constants.ts` at minimum |
| FR-102 | Tool prompt isolation | Each tool has its own system prompt template | Given a tool invocation, When the prompt is assembled, Then it reads from `tools/{ToolName}/prompt.ts` |
| FR-103 | Tool constants | Each tool exports its own constants (name, description, schema) | Given tool registration, When schemas are loaded, Then they come from `tools/{ToolName}/constants.ts` |
| FR-104 | Tool permission check | Each tool can define its own permission requirements | Given a tool with elevated permissions, When invoked in restricted mode, Then the permission check from the tool folder runs |
| FR-105 | Tool registry auto-discovery | Tools are discovered by scanning the `tools/` directory | Given a new tool folder added to `src/tools/`, When the server starts, Then the tool is automatically registered |

**Target directory structure per tool:**
```
src/tools/
├── BashTool/
│   ├── BashTool.ts          # Main execution logic
│   ├── prompt.ts            # System prompt for this tool
│   ├── constants.ts         # Name, description, schema
│   └── permissions.ts       # Permission requirements
├── BuildAgent/
│   ├── BuildAgent.ts
│   ├── prompt.ts
│   ├── constants.ts
│   └── permissions.ts
├── SecurityScanAgent/
│   ├── SecurityScanAgent.ts
│   ├── prompt.ts
│   ├── constants.ts
│   └── permissions.ts
└── [... all 20+ tools]
```

### 3.2 FR-200: Permission Engine

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-201 | Deny-list by name | Block specific tools by exact name (case-insensitive) | Given `deny_names: ["sf_security_scan"]`, When tool "sf_security_scan" is requested, Then it returns permission denied |
| FR-202 | Deny by prefix | Block tools matching a prefix pattern | Given `deny_prefixes: ["sf_docker"]`, When "sf_docker_build" or "sf_docker_compose" is requested, Then both are blocked |
| FR-203 | Simple mode | Restrict to core tools only (build, test, git_status) | Given `simple_mode: true`, When tools are listed, Then only sf_build, sf_run_tests, sf_git_status are available |
| FR-204 | Trust-gated init | Deferred features only load in trusted workspaces | Given `trusted: false`, When server starts, Then sf_security_scan, sf_verify_auth, sf_harvest_knowledge are not loaded |
| FR-205 | Permission context | Composable permission object passed through tool chain | Given a ToolPermissionContext, When tools are filtered, Then deny_names + deny_prefixes + simple_mode all apply |

**Permission context model:**
```typescript
interface ToolPermissionContext {
  deny_names: Set<string>;       // Exact tool names to block (lowercased)
  deny_prefixes: string[];       // Prefix patterns to block
  simple_mode: boolean;          // Core tools only
  trusted: boolean;              // Trust gate for workspace
}
```

### 3.3 FR-300: Streaming Event Protocol

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-301 | message_start event | Emitted when tool execution begins | Given a tool call, When execution starts, Then SSE yields `{type: "message_start", session_id, tool_name}` |
| FR-302 | tool_match event | Emitted when tool is resolved from registry | Given a tool request, When the tool is found, Then SSE yields `{type: "tool_match", tool_name, tier}` |
| FR-303 | message_delta event | Emitted with partial output during execution | Given a long-running tool, When output is produced, Then SSE yields `{type: "message_delta", text}` incrementally |
| FR-304 | message_stop event | Emitted when tool execution completes | Given tool completion, When result is ready, Then SSE yields `{type: "message_stop", usage, stop_reason}` |
| FR-305 | permission_denial event | Emitted when a tool is blocked | Given a blocked tool, When invocation is attempted, Then SSE yields `{type: "permission_denial", tool_name, reason}` |

### 3.4 FR-400: Transcript Compaction Engine

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-401 | Token budget tracking | Track cumulative input/output tokens per session | Given a session, When tokens are consumed, Then UsageSummary reflects accurate totals |
| FR-402 | Budget enforcement | Stop processing when budget is exceeded | Given `max_budget_tokens: 50000`, When cumulative usage exceeds limit, Then session returns `stop_reason: "max_budget_reached"` |
| FR-403 | Automatic compaction | Prune old messages when threshold is hit | Given `compact_after_turns: 20`, When message count exceeds 20, Then oldest messages are pruned to keep last 20 |
| FR-404 | Session persistence | Save session state to disk for resumption | Given an active session, When persist is called, Then session JSON is written to `.sf_sessions/{id}.json` |
| FR-405 | Session resumption | Resume a previously persisted session | Given a session ID, When loaded, Then messages, usage, and transcript are restored |

**Configuration model:**
```typescript
interface SessionConfig {
  max_turns: number;              // Default: 50
  max_budget_tokens: number;      // Default: 100000
  compact_after_turns: number;    // Default: 30
  persist_directory: string;      // Default: '.sf_sessions'
}
```

### 3.5 FR-500: Command Graph

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-501 | Command segmentation | Commands categorized as builtin, plugin, or skill | Given the command registry, When queried with `category: "builtin"`, Then only core commands return |
| FR-502 | Command graph builder | Auto-classify commands by source | Given a command with source in `agents/`, When classified, Then it's tagged as "skill" |
| FR-503 | Filtered listing | List commands by category | Given `GET /api/v1/agents?category=builtin`, When called, Then only builtin agents return |

**Categories:**
```
builtin  → Core MCP tools (sf_build, sf_run_tests, sf_git_*)
plugin   → External tool integrations (Playwright, Semgrep)
skill    → Agent/skill definitions loaded from agents/ folder
dynamic  → Skills created by iznir skill factory at runtime
```

### 3.6 FR-600: Bootstrap Pipeline

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-601 | Staged startup | Server boots through defined stages | Given server start, When bootstrap runs, Then it executes 7 stages in order |
| FR-602 | Prefetch side effects | Environment scan, config load, DB init run first | Given startup, When prefetch runs, Then workspace is scanned, DB initialized, config loaded |
| FR-603 | Trust gate | Untrusted workspaces get restricted tool set | Given `trusted: false`, When deferred init runs, Then plugins, skills, MCP prefetch, and session hooks are skipped |
| FR-604 | Health during bootstrap | Health endpoint reports bootstrap progress | Given server bootstrapping, When `/health` is called, Then it returns `{stage: "loading_tools", progress: 4/7}` |
| FR-605 | Fail-fast on bad environment | Missing dependencies detected at startup | Given missing Playwright binary, When bootstrap stage 3 runs, Then startup fails with `"playwright not installed"` instead of failing at first tool call |

**Bootstrap stages:**
```
Stage 1: Prefetch side effects (env scan, config load)
Stage 2: Environment guards (Node version, required binaries)
Stage 3: Tool registry initialization (scan tools/ directory)
Stage 4: Agent/skill parallel load (agents/ folder + dynamic skills from DB)
Stage 5: Trust-gated deferred init (Playwright, Semgrep, MCP prefetch)
Stage 6: Permission context assembly (workspace-level deny rules)
Stage 7: SSE transport ready (accept connections)
```

### 3.7 FR-700: Verification Agent

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-701 | Verification agent tool | New MCP tool `sf_verify` that validates prior agent output | Given agent output, When `sf_verify` is called, Then it checks output against tool evidence |
| FR-702 | Multi-strategy verification | Verify via build, test, type-check, or custom check | Given verification request with strategy `build`, When run, Then it executes `sf_build` and compares result to claimed output |
| FR-703 | Verification report | Structured report of what passed/failed | Given verification run, When complete, Then returns `{verified: boolean, checks: [{name, passed, evidence}]}` |
| FR-704 | Auto-verification hook | Optionally verify after every agent execution | Given `auto_verify: true` in config, When any sf_* tool completes, Then sf_verify runs automatically |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Tool registration time | < 500ms for 50 tools (directory scan + schema load) |
| Permission check latency | < 1ms per tool (in-memory deny-set lookup) |
| Streaming event latency | < 50ms between event and SSE delivery |
| Session persistence write | < 100ms for 1000-message session |
| Bootstrap total time | < 3s for full 7-stage pipeline |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Permission bypass | No tool can execute without passing ToolPermissionContext filter |
| Trust escalation | Untrusted → trusted requires explicit user action (config change + restart) |
| Session isolation | Sessions cannot access other sessions' persisted data |
| Deny-list enforcement | Case-insensitive, applied before any tool logic runs |
| Tool injection | Tool names validated against registry; no dynamic tool creation without iznir certification |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Bootstrap success rate | 100% on valid environments (fail-fast on invalid) |
| Session recovery | 100% from persisted state |
| Compaction data loss | 0% for messages within retention window |
| Streaming event ordering | Guaranteed: start → match → delta* → stop |

### 4.4 Observability

| Aspect | Requirement |
|--------|-------------|
| Bootstrap logging | Each stage logs start/complete/duration |
| Permission denials | Logged with tool name, reason, and requesting context |
| Token usage | Tracked per session, per tool, per agent |
| Compaction events | Logged when messages are pruned (count pruned, count retained) |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

| Dependency | Version | Maturity | Known Quirks | Verification Required |
|-----------|---------|----------|-------------|----------------------|
| @modelcontextprotocol/sdk | latest | Stable | SSE transport quirks on reconnect | Build + integration tests |
| express | 4.x | Stable | None relevant | Build |
| better-sqlite3 | latest | Stable | None | Build |
| playwright | latest | Stable | Binary must be installed separately | Build + binary check |

### 5.1 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   MCP Server v3.1                    │
├─────────────────────────────────────────────────────┤
│  Bootstrap Pipeline (7 stages)                       │
│    ├─ Prefetch → Guards → Tool Registry              │
│    ├─ Agent Load → Deferred Init                     │
│    └─ Permission Assembly → SSE Ready                │
├─────────────────────────────────────────────────────┤
│  Permission Engine                                   │
│    ├─ ToolPermissionContext (deny/prefix/simple/trust)│
│    └─ Per-tool permission checks                     │
├─────────────────────────────────────────────────────┤
│  Tool Registry (auto-discovered from tools/)         │
│    ├─ tools/BuildAgent/                              │
│    ├─ tools/TestRunner/                              │
│    ├─ tools/SecurityScan/                            │
│    ├─ tools/VerificationAgent/   ← NEW              │
│    └─ [... 20+ self-contained tool folders]          │
├─────────────────────────────────────────────────────┤
│  Session Engine                                      │
│    ├─ Transcript Compaction                          │
│    ├─ Token Budget Enforcement                       │
│    ├─ Session Persistence (.sf_sessions/)            │
│    └─ Streaming Event Protocol (SSE)                 │
├─────────────────────────────────────────────────────┤
│  Command Graph                                       │
│    ├─ Builtins (core MCP tools)                      │
│    ├─ Plugins (Playwright, Semgrep)                  │
│    ├─ Skills (agents/ folder)                        │
│    └─ Dynamic (iznir-created at runtime)             │
└─────────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Entity: StoredSession**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| session_id | string | PK, UUID | Unique session identifier |
| messages | string[] | | Conversation message history |
| input_tokens | number | >= 0 | Cumulative input token count |
| output_tokens | number | >= 0 | Cumulative output token count |
| created_at | string | ISO 8601 | Session creation timestamp |
| last_active | string | ISO 8601 | Last activity timestamp |
| tool_invocations | object[] | | History of tool calls with results |

**Entity: ToolPermissionContext**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| deny_names | Set<string> | lowercased | Exact tool names to block |
| deny_prefixes | string[] | lowercased | Prefix patterns to block |
| simple_mode | boolean | | Core tools only mode |
| trusted | boolean | | Workspace trust level |

**Entity: StreamEvent**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| type | enum | message_start, tool_match, message_delta, message_stop, permission_denial | Event type |
| session_id | string | | Session this event belongs to |
| tool_name | string | optional | Tool being executed |
| text | string | optional | Output text (for delta events) |
| usage | object | optional | Token usage (for stop events) |
| stop_reason | string | optional | Why execution stopped |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| @modelcontextprotocol/sdk | ^1.x | MCP protocol | Core — server won't function |
| express | ^4.x | HTTP server, SSE transport | Core — no connections |
| better-sqlite3 | ^11.x | Session persistence, knowledge DB | Sessions won't persist (graceful degradation) |
| glob | ^11.x | Tool directory auto-discovery | Must fall back to manual registration |

### 5.5 Directory Structure

```
mcp-server/src/
├── server.ts                    # Entry point (bootstrap pipeline)
├── bootstrap/
│   ├── pipeline.ts              # 7-stage bootstrap orchestrator
│   ├── prefetch.ts              # Stage 1: environment scan
│   ├── guards.ts                # Stage 2: binary & version checks
│   └── deferred-init.ts         # Stage 5: trust-gated loading
├── tools/                       # Self-contained tool modules
│   ├── BuildAgent/
│   │   ├── BuildAgent.ts
│   │   ├── prompt.ts
│   │   ├── constants.ts
│   │   └── permissions.ts
│   ├── TestRunner/
│   │   ├── TestRunner.ts
│   │   ├── prompt.ts
│   │   ├── constants.ts
│   │   └── permissions.ts
│   ├── SecurityScan/
│   │   ├── SecurityScan.ts
│   │   ├── prompt.ts
│   │   ├── constants.ts
│   │   └── permissions.ts
│   ├── VerificationAgent/       # NEW
│   │   ├── VerificationAgent.ts
│   │   ├── prompt.ts
│   │   ├── constants.ts
│   │   └── permissions.ts
│   └── [... all tools]
├── permissions/
│   ├── context.ts               # ToolPermissionContext
│   ├── filter.ts                # Permission filtering logic
│   └── trust.ts                 # Trust gate implementation
├── session/
│   ├── engine.ts                # Session lifecycle manager
│   ├── transcript.ts            # Transcript store + compaction
│   ├── budget.ts                # Token budget enforcement
│   ├── persistence.ts           # File-based session store
│   └── config.ts                # SessionConfig
├── streaming/
│   ├── protocol.ts              # Event type definitions
│   └── emitter.ts               # SSE event emitter
├── registry/
│   ├── tool-registry.ts         # Auto-discovery tool registry
│   ├── command-graph.ts         # Builtin/plugin/skill segmentation
│   └── execution-registry.ts    # Tool dispatch
├── mcp/
│   ├── handler.ts               # MCP protocol handler
│   └── tool-dispatch.ts         # Route MCP calls to tools
├── agents/                      # Existing agent implementations
├── skills/                      # Skill loading
├── knowledge/                   # Memory gate, harvester
├── api/
│   └── routes.ts                # REST API
└── state/
    ├── db.ts                    # SQLite
    └── metrics.ts               # Metrics tracking
```

### 5.7 Environment Variables

| Variable | Example | Generation Method | Required | Notes |
|----------|---------|-------------------|----------|-------|
| SKILLFOUNDRY_PORT | 9877 | Derived | No | Default: 9877 |
| SKILLFOUNDRY_TRUST | true | Manual | No | Default: true for local, false for CI |
| SKILLFOUNDRY_SESSION_DIR | .sf_sessions | Derived | No | Default: .sf_sessions |
| SKILLFOUNDRY_MAX_BUDGET_TOKENS | 100000 | Manual | No | Default: 100000 |
| SKILLFOUNDRY_SIMPLE_MODE | false | Manual | No | Default: false |
| SKILLFOUNDRY_DENY_TOOLS | sf_docker_build,sf_nginx_config | Manual | No | Comma-separated deny list |
| SKILLFOUNDRY_DENY_PREFIXES | sf_docker | Manual | No | Comma-separated prefix deny |
| SKILLFOUNDRY_AUTO_VERIFY | false | Manual | No | Auto-verify after tool execution |

---

## 6. Contract Specification

### 6.1 API Endpoints (Extensions to Existing)

**`GET /api/v1/agents?category={builtin|plugin|skill|dynamic}`** — List agents by category

**`GET /api/v1/session/:id`** — Get session state
```json
{
  "data": {
    "session_id": "abc-123",
    "messages": 15,
    "input_tokens": 3200,
    "output_tokens": 4100,
    "budget_remaining": 92700,
    "last_active": "2026-04-01T10:30:00Z"
  }
}
```

**`POST /api/v1/session/:id/compact`** — Force transcript compaction

**`GET /api/v1/permissions`** — Get current permission context
```json
{
  "data": {
    "deny_names": ["sf_docker_build"],
    "deny_prefixes": ["sf_nginx"],
    "simple_mode": false,
    "trusted": true,
    "available_tools": 18,
    "blocked_tools": 2
  }
}
```

**`GET /health`** — Enhanced with bootstrap stage
```json
{
  "status": "healthy",
  "bootstrap": {
    "stage": "ready",
    "completed": 7,
    "total": 7,
    "duration_ms": 1850
  },
  "session": {
    "active_sessions": 3,
    "total_tokens_consumed": 45000
  }
}
```

### 6.2 Streaming Event Protocol (SSE)

Events emitted on `/mcp/sse`:

```
event: message_start
data: {"type":"message_start","session_id":"abc","tool_name":"sf_build","timestamp":"..."}

event: tool_match
data: {"type":"tool_match","tool_name":"sf_build","tier":"TIER1","category":"builtin"}

event: message_delta
data: {"type":"message_delta","text":"Running npm run build...","progress":0.3}

event: message_delta
data: {"type":"message_delta","text":"Build completed successfully","progress":1.0}

event: message_stop
data: {"type":"message_stop","usage":{"input_tokens":150,"output_tokens":80},"stop_reason":"completed"}
```

### 6.3 Error Codes (New)

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `PERMISSION_DENIED` | 403 | Tool blocked by ToolPermissionContext |
| `BUDGET_EXCEEDED` | 429 | Session token budget exhausted |
| `SESSION_NOT_FOUND` | 404 | Invalid session ID for resumption |
| `BOOTSTRAP_INCOMPLETE` | 503 | Server still starting up |
| `TRUST_REQUIRED` | 403 | Tool requires trusted workspace |
| `VERIFICATION_FAILED` | 422 | Verification agent detected issues |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must maintain backward compatibility with existing MCP tool schemas. Existing sf_* tools must keep working during migration.
- **Architecture:** Tool folder migration must be incremental — migrate one tool at a time, not all-or-nothing.
- **Resource:** Single developer. Phased approach mandatory.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| MCP SDK supports streaming events natively | Must implement custom SSE layer | Already have Express SSE endpoint; can emit events manually |
| SQLite is sufficient for session persistence | Performance issues with large sessions | JSON file fallback already exists |
| Tool auto-discovery via directory scan is fast enough | Slow startup with many tools | Cache discovered tools, invalidate on file change |

### 7.3 Out of Scope

- [ ] UI/frontend for streaming events (consume in IDE extensions later)
- [ ] Multi-node session sharing (single-server only)
- [ ] Plugin marketplace (separate PRD)
- [ ] Remote agent execution (covered by existing remote infrastructure)
- [ ] Model migration logic (not relevant to SkillFoundry)
- [ ] Companion/buddy system (nice-to-have, not core)
- [ ] Voice mode integration
- [ ] Vim mode integration

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Tool migration breaks existing MCP clients | M | H | Maintain schema compatibility. Old handler.ts stays as fallback until all tools migrated. |
| R-002 | Permission engine too restrictive by default | L | M | Default to all-permissive. Restrictions are opt-in via env vars. |
| R-003 | Transcript compaction loses important context | M | H | Only compact messages beyond threshold. Never compact the last N messages. Log what was compacted. |
| R-004 | Bootstrap pipeline slows server startup | L | M | Parallel loading where possible (tools + agents load concurrently). Target < 3s. |
| R-005 | Verification agent overhead on every tool call | M | M | Auto-verify is opt-in. Default off. Only verify when explicitly requested. |
| R-006 | Streaming events not consumed by any client | L | L | Events are fire-and-forget on SSE. No overhead if no client listens. |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Foundation | Tool module system + permission engine + tool auto-discovery | None |
| 2 | Session Intelligence | Transcript compaction + token budget + session persistence | Phase 1 |
| 3 | Streaming & Observability | Streaming event protocol + bootstrap pipeline + enhanced health | Phase 1 |
| 4 | Verification & Command Graph | Verification agent + command segmentation + API extensions | Phases 1-3 |

### Phase 1: Foundation (MUST)

**Deliverables:**
1. Define `ToolModule` interface: `{name, execute, prompt, constants, permissions}`
2. Create `src/tools/` directory structure — migrate 3 tools as proof (BuildAgent, TestRunner, GitAgent)
3. Implement `ToolPermissionContext` with deny_names, deny_prefixes, simple_mode, trusted
4. Implement `filter_tools_by_permission_context()`
5. Wire permission engine into MCP handler (filter before dispatch)
6. Add tool auto-discovery: scan `src/tools/*/constants.ts` at startup

### Phase 2: Session Intelligence (MUST)

**Deliverables:**
1. Implement `SessionConfig` with max_turns, max_budget_tokens, compact_after_turns
2. Implement `UsageSummary` with functional `.add_turn()` method
3. Implement `TranscriptStore` with append, compact, replay, flush
4. Implement `SessionEngine` that orchestrates budget enforcement + compaction
5. Implement file-based session persistence (`.sf_sessions/{id}.json`)
6. Add session resumption via `load_session(id)`

### Phase 3: Streaming & Observability (SHOULD)

**Deliverables:**
1. Define `StreamEvent` types: message_start, tool_match, message_delta, message_stop, permission_denial
2. Implement `StreamEmitter` that yields SSE events during tool execution
3. Implement 7-stage bootstrap pipeline
4. Add prefetch (env scan), guards (binary check), deferred init (trust-gated)
5. Enhanced `/health` with bootstrap stage reporting
6. Structured logging for permission denials and compaction events

### Phase 4: Verification & Command Graph (SHOULD)

**Deliverables:**
1. Implement `VerificationAgent` tool in `src/tools/VerificationAgent/`
2. Multi-strategy verification: build, test, typecheck, custom
3. Verification report format: `{verified, checks: [{name, passed, evidence}]}`
4. Optional auto-verify hook after agent execution
5. Implement `CommandGraph` with builtin/plugin/skill/dynamic segmentation
6. Add `GET /api/v1/agents?category=` filtering
7. Migrate remaining tools to folder structure

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 — Foundation | M | Medium | Low |
| 2 — Session Intelligence | M | Medium | Medium |
| 3 — Streaming & Observability | L | High | Medium |
| 4 — Verification & Command Graph | M | Medium | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] At least 3 tools migrated to folder structure with working auto-discovery
- [ ] ToolPermissionContext blocks tools by name, prefix, and simple mode
- [ ] Sessions survive 50+ turns without context overflow
- [ ] Token budget enforcement stops sessions at configured limit
- [ ] Session persistence saves and loads from disk
- [ ] Streaming events emitted during tool execution (4 event types)
- [ ] Bootstrap pipeline executes 7 stages with logging
- [ ] Verification agent validates build/test output against claims
- [ ] `/health` reports bootstrap stage and session metrics
- [ ] Unit tests for permission engine (100% coverage)
- [ ] Integration tests for session compaction and persistence
- [ ] No regression in existing MCP tool functionality

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Tool Module | Self-contained tool directory with execution, prompt, constants, permissions | `ToolModule` |
| Permission Context | Composable object that filters available tools | `ToolPermissionContext` |
| Transcript Compaction | Automatic pruning of old messages to manage context window | `TranscriptStore.compact()` |
| Token Budget | Maximum cumulative token usage per session | `SessionConfig.max_budget_tokens` |
| Stream Event | SSE event emitted during tool execution lifecycle | `StreamEvent` |
| Bootstrap Pipeline | Staged server startup with 7 sequential/parallel stages | `BootstrapPipeline` |
| Trust Gate | Feature gate that restricts capabilities in untrusted workspaces | `DeferredInit.trusted` |
| Command Graph | Categorized command registry (builtin/plugin/skill/dynamic) | `CommandGraph` |
| Verification Agent | Agent that validates other agents' output with tool evidence | `sf_verify` |
| Simple Mode | Restricted mode with only core tools available | `ToolPermissionContext.simple_mode` |

### 11.2 References

- Source analysis: `deepwiki.com/instructkr/claw-code` — Clean-room architecture study of Claude Code
- Original TypeScript codebase: 1,902 files, 207 commands, 184 tool entries, 43 tool modules
- Key patterns: tool-per-folder, permission layering, streaming protocol, transcript compaction, bootstrap pipeline, command segmentation, verification agent

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-01 | n00b73 | Initial draft from Claude Code architecture analysis |

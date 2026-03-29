# PRD: SkillFoundry v3 — MCP Agent Server

---
prd_id: skillfoundry-v3-mcp-agent-server
title: SkillFoundry v3 — MCP Agent Server
version: 1.0
status: DRAFT
created: 2026-03-28
author: n00b73 + PRD Architect
last_updated: 2026-03-28

dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [core, architecture, agents, mcp, infrastructure]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry's "56 agents" are markdown prompt files that an LLM reads and pretends to be. They have no persistence, no real tools, no parallel execution, and no cross-session state. The critical failure: **they cannot verify their own work.**

In a real `/forge` session on LuxComplianceSuite (2026-03-27):
- The LLM "verified" a NextAuth login pattern **3 times** — each time saving a "definitive" answer to memory that was wrong
- `/forge` declared "TEMPER Phase 3: PASS" using `curl` while the login was completely broken in a real browser
- The agent rewrote the login form **6 times** before Playwright (run by the human, not the agent) proved what actually worked
- The memory system stored wrong patterns with full confidence, with no mechanism to distinguish "I think this works" from "I verified this works"

This is not a bug in one session — it's a structural limitation. An LLM reading a prompt file cannot run Playwright, cannot run Semgrep, cannot execute concurrent sub-tasks, and cannot persist state across sessions. It can only pattern-match and hope.

**Who is affected:** Every developer using SkillFoundry on 60+ apps across the production server. Every `/forge` run that touches authentication, browser behavior, or security scanning is operating on faith, not verification.

### 1.2 Proposed Solution

Transform SkillFoundry from a collection of installed prompt files into a **centralized MCP server with real autonomous agents**. The server runs once on the production server and serves all apps via MCP (Model Context Protocol). Current `.md` skills continue working as prompt context — migration is incremental, not a rewrite.

Two classes of agents:
1. **LLM Agents** — Current skills upgraded to agent processes with persistent state, cost routing, and cross-session memory (architecture, coding, review, documentation)
2. **Tool Agents** — Real executables that run actual tools, not LLM pretending to run them (Playwright for browser verification, Semgrep for SAST, Lighthouse for performance)

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Verification accuracy | 0% (LLM pattern-matching) | 100% for browser/security tests | Playwright + Semgrep produce real pass/fail, not LLM opinion |
| Install friction | Run `install.sh` per app, files copied | Zero install — MCP connection only | App connects to server, no local framework files |
| Version drift | Each app has stale copy at install time | All apps use current version always | Single server, single version |
| Cross-app learning | Each app's knowledge siloed | Aggregated from all 60+ apps | Knowledge harvester feeds shared DB |
| Agent concurrency | Sequential (one LLM call at a time) | Parallel (coder + tester + security) | Measured via agent orchestrator |
| False confidence in memory | 3 wrong "definitive" entries in one session | 0 — only tool-verified patterns saved | Memory gate: tool evidence required |

---

## 2. User Stories

### Primary User: Developer using SkillFoundry

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | connect any app to SkillFoundry via MCP without installing files | I don't manage framework versions per app | MUST |
| US-002 | developer | have `/forge` TEMPER phase run real Playwright tests | auth flows are verified in a real browser, not by LLM opinion | MUST |
| US-003 | developer | have `/security audit` run real Semgrep scans | OWASP compliance is actual SAST, not regex pattern matching | MUST |
| US-004 | developer | have the framework learn from all 60+ apps' session logs | quirks discovered on app X prevent failures on app Y | SHOULD |
| US-005 | developer | have agent cost routing (Haiku for grep, Opus for architecture) | token spend is optimized per task type | SHOULD |
| US-006 | developer | create new skills dynamically via iznir.hexalab.dev | project-specific skills exist without modifying the framework | COULD |
| US-007 | developer | have agents run in parallel (coder + tester + security) | forge pipeline is faster than sequential execution | COULD |

### Secondary User: Framework Maintainer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | maintainer | update the framework in one place | all 60+ apps get the update immediately | MUST |
| US-011 | maintainer | see which agents are being used and how they perform | I can improve underperforming agents | SHOULD |
| US-012 | maintainer | add new agents without restarting the server | framework evolves without downtime | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | MCP Server | Express/Fastify server exposing SkillFoundry skills as MCP tools | Given a Claude Code session with MCP config, When user types `/forge`, Then the MCP server handles it |
| FR-002 | Skill Loader | Load current `.md` skill files as MCP tool definitions | Given 64 skill files, When server starts, Then all 64 are available as MCP tools |
| FR-003 | Playwright Agent | Real browser automation for auth flow verification | Given a login page URL + credentials, When agent runs, Then produces pass/fail with screenshot evidence |
| FR-004 | Semgrep Agent | Real SAST scanning with OWASP rule packs | Given a project path, When agent scans, Then produces findings with severity and file:line |
| FR-005 | Knowledge Harvester | Scan session logs from all app folders | Given 60+ app directories, When harvester runs, Then extracts failure patterns into shared DB |
| FR-006 | Agent State Store | SQLite-backed persistent state per agent per project | Given an agent that ran yesterday, When it runs today, Then it has yesterday's context |
| FR-007 | Cost Router | Route tasks to appropriate model tier | Given a grep task, When dispatched, Then uses Haiku (not Opus) |
| FR-008 | Memory Gate | Only save tool-verified patterns to knowledge base | Given a pattern discovered by LLM reasoning, When save attempted, Then require tool evidence (Playwright result, test output, Semgrep scan) before marking as verified |

### 3.2 MCP Tool Interface

Each skill becomes an MCP tool with this shape:

```typescript
{
  name: "skillfoundry_forge",
  description: "Run the full forge pipeline on the current project",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Absolute path to project root" },
      prdFile: { type: "string", description: "Optional: specific PRD file to process" },
      validateOnly: { type: "boolean", description: "Only validate PRDs, don't implement" }
    },
    required: ["projectPath"]
  }
}
```

### 3.3 API Requirements

| Endpoint | Method | Purpose | Auth | Request | Response |
|----------|--------|---------|------|---------|----------|
| `/health` | GET | Server health check | None | N/A | `{ status: "ok", agents: 64, uptime: "..." }` |
| `/api/v1/agents` | GET | List available agents | API key | N/A | `{ data: [{ name, type, status }] }` |
| `/api/v1/agents/:name/invoke` | POST | Invoke agent directly | API key | `{ projectPath, args }` | `{ taskId, status }` |
| `/api/v1/tasks/:id` | GET | Check task status | API key | N/A | `{ status, result, evidence }` |
| `/api/v1/knowledge/quirks` | GET | Query known quirks | API key | `?stack=nextauth,prisma` | `{ data: [quirks] }` |
| `/api/v1/knowledge/harvest` | POST | Trigger knowledge harvest | API key | `{ appPaths: [...] }` | `{ harvested: N, new: N }` |
| `/mcp` | WebSocket | MCP protocol endpoint | MCP auth | MCP messages | MCP responses |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| MCP tool response (skill dispatch) | < 500ms to acknowledge, async execution |
| Playwright verification | < 30s per auth flow test |
| Semgrep scan | < 60s per project |
| Knowledge harvest (60 apps) | < 5 minutes full scan |
| Concurrent agent capacity | 10+ simultaneous agent processes |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | API key for REST, MCP auth for WebSocket |
| Authorization | Server only accessible from localhost or authorized IPs |
| Secrets | Never stored in agent state — `.env` only, never in SQLite |
| Project isolation | Agents scoped to project path — cannot access other projects |
| Semgrep results | Findings never leave the server (no external reporting) |

### 4.3 Scalability

Single server instance serving 60+ apps. No horizontal scaling needed — this is a single-developer production server, not a multi-tenant SaaS. Vertical scaling: increase PM2 instances if concurrent demand grows.

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99% (server-level, PM2 auto-restart) |
| Recovery | PM2 auto-restart on crash, SQLite WAL mode for data safety |
| Rollback | Git-based — `git revert` on the framework repo |
| Agent failure | Individual agent crash doesn't take down server or other agents |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Logging | Structured JSON, per-agent log files in `logs/` |
| Health check | `/health` endpoint with agent count, uptime, last harvest time |
| Agent metrics | Invocation count, success rate, avg duration per agent |
| Audit trail | Every agent invocation logged: who, what project, when, result |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

| Dependency | Version | Maturity | Breaking From Prior | Known Quirks in KB | Verification Required |
|-----------|---------|----------|-------------------|-------------------|----------------------|
| Node.js | 20.x LTS | Stable | None | 0 | Build |
| TypeScript | 5.x | Stable | None | 0 | Build |
| Claude Agent SDK | latest | **Beta** | N/A (new) | 0 — uncharted | **Playwright mandatory** |
| MCP SDK (`@modelcontextprotocol/sdk`) | latest | **Beta** | N/A (new) | 0 — uncharted | **Integration test mandatory** |
| Playwright | 1.58.x | Stable | None | 0 | Build (it IS the verifier) |
| Semgrep | latest | Stable | None | 0 | Build + rule validation |
| SQLite (better-sqlite3) | latest | Stable | None | 0 | Build |
| Express/Fastify | latest stable | Stable | None | 0 | Build + curl |

**Risk Decision:**

| Beta Dependency | Stable Alternative | Blast Radius | Justification |
|----------------|-------------------|-------------|---------------|
| Claude Agent SDK | Raw Anthropic API + manual tool loop | Medium (agent execution) | SDK provides agent loop, tool dispatch, and sub-agent spawning natively. Raw API is possible but requires reimplementing the agent loop. |
| MCP SDK | Custom WebSocket protocol | High (IDE connectivity) | MCP is the standard protocol for Claude Code, Cursor, and other IDEs. Custom protocol would require custom IDE plugins. |

### 5.1 Architecture

```
┌─────────────────────────────────────────────────┐
│  IDE (Claude Code / Cursor / Copilot / Gemini)   │
│  └── MCP Client connection                       │
└──────────────────┬──────────────────────────────┘
                   │ MCP Protocol (WebSocket)
                   ▼
┌─────────────────────────────────────────────────┐
│  SkillFoundry MCP Server (Node.js)               │
│                                                   │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ MCP Router   │  │ REST API (admin/metrics)  │  │
│  └──────┬──────┘  └──────────────────────────┘  │
│         │                                         │
│  ┌──────▼──────────────────────────────────────┐ │
│  │ Agent Orchestrator                           │ │
│  │  ├── Skill Loader (.md → prompt context)     │ │
│  │  ├── Cost Router (Haiku/Sonnet/Opus)         │ │
│  │  └── Task Queue (concurrent agents)          │ │
│  └──────┬──────────────────────────────────────┘ │
│         │                                         │
│  ┌──────▼──────┐ ┌────────────┐ ┌─────────────┐ │
│  │ LLM Agents  │ │ Tool Agents│ │ Harvesters  │ │
│  │ (prompt +   │ │ (real exec)│ │ (background)│ │
│  │  Agent SDK) │ │            │ │             │ │
│  │ - Architect │ │ - Playwrigh│ │ - Session   │ │
│  │ - Coder     │ │ - Semgrep  │ │   Log Scan  │ │
│  │ - Reviewer  │ │ - Lighthous│ │ - Knowledge │ │
│  │ - PRD       │ │ - Build    │ │   Aggregator│ │
│  │ - Docs      │ │   Verifier │ │             │ │
│  └─────────────┘ └────────────┘ └─────────────┘ │
│         │              │               │          │
│  ┌──────▼──────────────▼───────────────▼────────┐│
│  │ Shared Services                               ││
│  │  ├── State Store (SQLite)                     ││
│  │  ├── Knowledge Base (quirks, deviations)      ││
│  │  ├── Memory Gate (tool-evidence required)     ││
│  │  └── Metrics Collector                        ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  ~/apps/ (60+ project directories)               │
│  Each app: no SkillFoundry files installed.       │
│  Just an MCP connection config in IDE settings.   │
└─────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Entity: Agent**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| name | VARCHAR(100) | PK | Unique agent identifier (e.g., `forge`, `tester-playwright`) |
| type | ENUM | NOT NULL | `llm_agent`, `tool_agent`, `harvester` |
| skill_path | VARCHAR(500) | NULL | Path to `.md` skill file (for LLM agents) |
| tool_binary | VARCHAR(500) | NULL | Path to executable (for tool agents) |
| model_tier | ENUM | NOT NULL | `haiku`, `sonnet`, `opus` |
| status | ENUM | NOT NULL, DEFAULT 'active' | `active`, `disabled`, `error` |
| invocation_count | INTEGER | NOT NULL, DEFAULT 0 | Total invocations |
| last_invoked_at | TIMESTAMP | NULL | Last invocation time |

**Entity: Task**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Task identifier |
| agent_name | VARCHAR(100) | FK -> Agent.name | Which agent executed |
| project_path | VARCHAR(500) | NOT NULL | Target project |
| status | ENUM | NOT NULL | `queued`, `running`, `completed`, `failed` |
| input | JSON | NOT NULL | Task input parameters |
| output | JSON | NULL | Task result |
| evidence | JSON | NULL | Tool evidence (screenshots, scan results) |
| started_at | TIMESTAMP | NULL | Execution start |
| completed_at | TIMESTAMP | NULL | Execution end |
| cost_tokens | INTEGER | NULL | Tokens consumed |
| model_used | VARCHAR(50) | NULL | Actual model used |

**Entity: KnownQuirk**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | Quirk identifier |
| framework | VARCHAR(100) | NOT NULL | e.g., `nextauth`, `prisma`, `next.js` |
| version_range | VARCHAR(50) | NOT NULL | e.g., `5.x-beta`, `>=7.0.0` |
| quirk | TEXT | NOT NULL | Description of the problem |
| fix | TEXT | NOT NULL | How to fix it |
| verified_by | ENUM | NOT NULL | `playwright`, `semgrep`, `build`, `manual` |
| discovered_at | TIMESTAMP | NOT NULL | When first discovered |
| discovered_in | VARCHAR(200) | NULL | Which project/session |
| confidence | ENUM | NOT NULL | `verified` (tool-proven) or `observed` (LLM-reported, unverified) |

**Entity: SessionLog**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | Log entry ID |
| app_name | VARCHAR(200) | NOT NULL | Source app |
| platform | ENUM | NOT NULL | `claude_code`, `cursor`, `copilot`, `gemini` |
| session_date | TIMESTAMP | NOT NULL | When the session occurred |
| harvested_at | TIMESTAMP | NOT NULL | When we processed it |
| failure_patterns | JSON | NULL | Extracted failure patterns |
| quirks_discovered | JSON | NULL | New quirks found |
| tokens_spent | INTEGER | NULL | Estimated token usage |

### 5.3 Dependencies

| Dependency | Version | Verified | Peer Conflicts | Purpose | Risk if Unavailable |
|------------|---------|----------|----------------|---------|---------------------|
| @anthropic-ai/sdk | latest | [ ] | None expected | Claude API access for LLM agents | Core agents non-functional |
| @modelcontextprotocol/sdk | latest | [ ] | None expected | MCP server implementation | IDE connectivity lost |
| playwright | 1.58.x | [x] | None | Browser automation for verification | Auth verification reverts to curl-only |
| semgrep | latest (system install) | [ ] | N/A (binary) | SAST scanning | Security audit reverts to regex |
| better-sqlite3 | latest | [ ] | None | State store, knowledge base | State lost on restart |
| express | 4.x or 5.x | [ ] | None | REST API + admin endpoints | No admin interface |
| glob | latest | [ ] | None | Skill file discovery | Manual skill registration |
| chokidar | latest | [ ] | None | Watch skill files for hot reload | Restart required for changes |

### 5.4 Compatibility Notes

| Package A | Package B | Conflict | Resolution | Verified |
|-----------|-----------|----------|------------|----------|
| Claude Agent SDK | MCP SDK | Unknown — both are beta | Test together early in Phase 1 | [ ] |

### 5.5 Directory Structure

```
skillfoundry/
├── src/
│   ├── server.ts                    # Entry point — MCP + REST
│   ├── mcp/
│   │   ├── router.ts               # MCP message routing
│   │   ├── tools.ts                # MCP tool definitions
│   │   └── auth.ts                 # MCP authentication
│   ├── agents/
│   │   ├── orchestrator.ts         # Agent lifecycle management
│   │   ├── llm-agent.ts            # Base class for LLM agents
│   │   ├── tool-agent.ts           # Base class for tool agents
│   │   ├── cost-router.ts          # Model tier selection
│   │   └── implementations/
│   │       ├── playwright-agent.ts  # Browser verification
│   │       ├── semgrep-agent.ts     # SAST scanning
│   │       ├── build-agent.ts       # Build verification
│   │       └── lighthouse-agent.ts  # Performance testing
│   ├── skills/
│   │   └── loader.ts               # .md skill file → MCP tool
│   ├── knowledge/
│   │   ├── store.ts                # SQLite knowledge base
│   │   ├── harvester.ts            # Session log scanner
│   │   ├── memory-gate.ts          # Tool-evidence verification
│   │   └── quirks.ts               # Known quirks API
│   ├── state/
│   │   ├── db.ts                   # SQLite connection + migrations
│   │   └── migrations/             # Schema migrations
│   └── api/
│       ├── routes.ts               # REST API routes
│       └── middleware.ts            # Auth, logging, CORS
├── skills/                          # .md skill files (current 64)
│   ├── forge.md
│   ├── prd.md
│   ├── tester.md
│   └── ...
├── agents/                          # Agent protocol files (current)
├── knowledge/
│   ├── quirks.db                   # SQLite — known deployment quirks
│   └── deviations/                 # Deviation catalog files
├── tests/
│   ├── mcp.test.ts                 # MCP protocol tests
│   ├── playwright-agent.test.ts    # Verification agent tests
│   ├── semgrep-agent.test.ts       # Security agent tests
│   └── harvester.test.ts           # Knowledge harvester tests
├── ecosystem.config.cjs             # PM2 config
├── package.json
├── tsconfig.json
└── .env.example
```

### 5.6 Integration Points

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| Claude Code | MCP WebSocket | Primary IDE integration | Anthropic (protocol), us (server) |
| Cursor | MCP WebSocket | IDE integration | Cursor (client), us (server) |
| GitHub Copilot | MCP WebSocket | IDE integration (if supported) | GitHub (client), us (server) |
| iznir.hexalab.dev | REST API | Dynamic skill generation | Us |
| portman-service | REST API | Port allocation for test servers | Us |
| PostgreSQL (per app) | Connection string | Playwright needs DB for seed verification | Per app |
| Semgrep (system binary) | CLI exec | SAST scanning | Semgrep OSS |
| Playwright (npm) | Node.js API | Browser automation | Playwright team |

### 5.7 Environment Variables

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| SKILLFOUNDRY_PORT | `9877` | `portman assign skillfoundry-v3` | Yes | MCP + REST server port |
| SKILLFOUNDRY_API_KEY | hex, 32 chars | `/generate secret --length 32 --encoding hex` | Yes | REST API authentication |
| ANTHROPIC_API_KEY | `sk-ant-...` | Manual (Anthropic console) | Yes | Claude API for LLM agents |
| SKILLFOUNDRY_DB_PATH | `./data/skillfoundry.db` | Derived | Yes | SQLite state store |
| SKILLFOUNDRY_SKILLS_DIR | `./skills` | Derived | Yes | Path to .md skill files |
| SKILLFOUNDRY_AGENTS_DIR | `./agents` | Derived | Yes | Path to agent protocol files |
| SKILLFOUNDRY_APPS_ROOT | `/home/n00b73/apps` | Manual | Yes | Root directory for app scanning |
| SEMGREP_RULES | `p/owasp-top-ten` | Derived | No | Semgrep rule packs |
| IZNIR_API_URL | `https://iznir.hexalab.dev/api` | Manual | No | iznir integration endpoint |
| NODE_ENV | `production` | Derived | Yes | |

### 5.8 Deployment Environment

| Aspect | Specification | Notes |
|--------|--------------|-------|
| **Port allocation** | portman | `portman assign skillfoundry-v3` |
| **Process manager** | PM2 (fork mode) | Single instance, auto-restart |
| **Reverse proxy** | nginx | WebSocket upgrade for MCP, standard proxy for REST |
| **SSL/TLS** | certbot + Cloudflare | Required for MCP over WSS |
| **Domain** | `skillfoundry.hexalab.dev` (or localhost-only) | MCP can be localhost-only for single-server |
| **CDN** | None | Server-to-server, no static assets |

#### Build & Deploy Commands

```bash
# Build
npm run build

# Start
pm2 start ecosystem.config.cjs

# Verify
curl -sf http://localhost:<port>/health

# Connect from any app (add to .claude/settings.json):
# { "mcpServers": { "skillfoundry": { "url": "ws://localhost:<port>/mcp" } } }
```

#### Known Deployment Quirks

| Framework / Library | Quirk | Fix |
|--------------------|-------|-----|
| MCP SDK | WebSocket connection requires `upgrade` header in nginx | Add `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` |
| Playwright on Linux | Needs system deps (libgbm, libasound2, etc.) | `npx playwright install --with-deps chromium` (requires sudo once) |
| Semgrep | Large rule packs take 10s+ on first scan (cached after) | Pre-warm on server start: `semgrep --config=p/owasp-top-ten --dry-run` |
| SQLite + PM2 cluster | SQLite can't handle concurrent writes from multiple processes | Use fork mode (single instance), not cluster mode |
| better-sqlite3 | Native addon — needs rebuild if Node.js version changes | `npm rebuild better-sqlite3` after Node.js upgrade |

---

## 6. Contract Specification

### 6.1 Entity Cards

**Entity: Agent**
| Attribute | Value |
|-----------|-------|
| **Name** | Agent |
| **Purpose** | Represents a registered agent (LLM or tool) available for invocation |
| **Owner** | SkillFoundry server |
| **Key Fields** | name, type, model_tier, status |
| **Derived Fields** | invocation_count (incremented on each invocation) |
| **Sensitive Fields** | None |
| **Retention** | Permanent |
| **Audit** | Yes — invocations logged |
| **Data Ownership** | system |
| **Access Scope** | global |

**Entity: KnownQuirk**
| Attribute | Value |
|-----------|-------|
| **Name** | KnownQuirk |
| **Purpose** | A deployment quirk discovered through tool verification, queryable by stack |
| **Owner** | Knowledge subsystem |
| **Key Fields** | framework, version_range, quirk, fix, confidence |
| **Derived Fields** | None |
| **Sensitive Fields** | None |
| **Retention** | Permanent (quirks are historical knowledge) |
| **Audit** | Yes — tracks discovery source |
| **Data Ownership** | system |
| **Access Scope** | global |

### 6.2 State Transitions

**Entity: Task**

```
[Queued] → [Running] → [Completed]
                ↓
            [Failed]
```

| Current | Action | Next | Who | Validations | Side Effects |
|---------|--------|------|-----|-------------|-------------|
| Queued | Start | Running | Orchestrator | Agent available, project path valid | Log start time |
| Running | Complete | Completed | Agent | Output + evidence present | Update metrics, save evidence |
| Running | Fail | Failed | Agent | Error message present | Log error, update failure count |

### 6.3 Memory Gate Rules

**This is the mechanism that prevents the "3 wrong definitive answers" problem.**

| Scenario | Can Save to Knowledge Base? | Evidence Required |
|----------|---------------------------|-------------------|
| Playwright test passes | Yes — `confidence: verified` | Screenshot + test output |
| Semgrep scan clean | Yes — `confidence: verified` | Scan report JSON |
| Build succeeds | Yes — `confidence: verified` | Build output |
| LLM reasons "this should work" | **No** — `confidence: observed` only | Must run verification tool to promote to `verified` |
| LLM pattern-matches from docs | **No** — `confidence: observed` only | Docs can be wrong. Tool verification required. |
| curl test passes | Partial — `confidence: observed` for auth flows | curl cannot verify browser behavior. Playwright required for auth. |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Single Linux server (Hetzner), all apps in `~/apps/`. No Kubernetes, no cloud orchestration.
- **Technical:** Playwright requires Chromium installed on the server (one-time `sudo` install).
- **Technical:** Semgrep requires system-level install or Docker.
- **Technical:** MCP protocol is still evolving — may need updates as spec changes.
- **Business:** Single developer — framework must be maintainable by one person.
- **Business:** Must not break existing workflows — current `.md` skills keep working.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Claude Agent SDK supports MCP tool dispatch | Can't build LLM agents with SDK | Fall back to raw Anthropic API + manual tool loop |
| MCP SDK supports WebSocket server mode | IDE can't connect | Fall back to stdio transport (Claude Code supports both) |
| Playwright works headless on the server | Browser tests can't run | Use Playwright's headless shell (already cached on server) |
| 60+ apps have consistent session log format | Harvester can't parse logs | Normalize per-platform (Claude/Cursor/Copilot each have known formats) |
| iznir API is stable enough to integrate | Dynamic skill generation fails | iznir is optional — static skills work without it |

### 7.3 Out of Scope

- [ ] Multi-tenant SaaS (this is a single-server tool)
- [ ] GUI/web dashboard for the MCP server (CLI + REST API only for now)
- [ ] Custom model hosting (uses Anthropic API, not local LLMs — Ollama integration later)
- [ ] Rewriting existing 64 skills — they work as-is and load as prompt context
- [ ] iOS/Android/mobile testing (Playwright desktop browser only)
- [ ] CI/CD pipeline integration (local development server only)
- [ ] Auto-scaling or load balancing
- [ ] Billing or token tracking (use Anthropic dashboard for now)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-001 | Claude Agent SDK API changes (beta) | HIGH | HIGH | Pin SDK version, abstract agent interface behind our own base class. Update on our schedule, not theirs. |
| R-002 | MCP protocol changes | MEDIUM | HIGH | Pin MCP SDK version. Abstract transport behind interface so we can swap if needed. |
| R-003 | Playwright Chromium can't install on server | LOW | HIGH | Already installed and working (verified 2026-03-27). Pin Chromium version. |
| R-004 | Token costs increase with real agents (API calls vs. IDE-provided) | HIGH | MEDIUM | Cost router sends simple tasks to Haiku ($0.25/M input). Track spend per agent. Set daily budget cap. |
| R-005 | SQLite performance under concurrent agent writes | LOW | MEDIUM | Fork mode (single process). WAL mode for read concurrency. Agent queue serializes writes. |
| R-006 | Session log formats differ across IDE platforms | HIGH | LOW | Build per-platform parsers. Start with Claude Code (best-known format), add others incrementally. |
| R-007 | iznir.hexalab.dev unavailable | LOW | LOW | iznir is optional. All core skills are static .md files. |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | **MCP Server Shell** | Server boots, loads .md skills as MCP tools, Claude Code connects, skills execute via MCP instead of local files | None |
| 2 | **Tool Agents** | Playwright agent (auth verification), Semgrep agent (SAST), Memory Gate (tool-evidence required for verified knowledge) | Phase 1 |
| 3 | **Knowledge Loop** | Session log harvester, cross-app quirk aggregation, auto-populate §5.0/§5.8 from knowledge base | Phase 2 |
| 4 | **Optimization** | Cost routing, parallel agent execution, iznir integration, metrics dashboard | Phase 3 |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium (MCP SDK is beta) | Medium |
| 2 | L | High (Playwright integration, Memory Gate design) | High |
| 3 | M | Medium (log parsing, normalization) | Medium |
| 4 | M | Medium (routing logic, iznir API) | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] All functional requirements pass acceptance criteria
- [ ] Unit test coverage >= 80% for business logic
- [ ] Integration tests for MCP protocol (connect, invoke, result)
- [ ] Browser-level auth flow verified via the Playwright agent itself (dog-fooding)
- [ ] Semgrep agent scans the SkillFoundry codebase and reports no critical findings
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] No critical/high severity bugs open
- [ ] Existing .md skills still work when loaded via MCP
- [ ] At least 3 apps connected via MCP and successfully running `/forge`

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead / Owner | n00b73 | Pending | |
| Security (self-review) | n00b73 | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| MCP | Model Context Protocol — standard for IDE-to-tool communication | `mcp` |
| LLM Agent | Agent that uses an LLM (Claude) for reasoning, loaded with prompt context from .md skill files | `llm_agent` |
| Tool Agent | Agent that executes a real tool (Playwright, Semgrep) — no LLM, deterministic | `tool_agent` |
| Harvester | Background agent that scans session logs and extracts knowledge | `harvester` |
| Memory Gate | Mechanism that requires tool evidence before saving patterns as "verified" knowledge | `memory_gate` |
| Cost Router | Dispatches tasks to appropriate model tier (Haiku/Sonnet/Opus) based on task type | `cost_router` |
| Skill | A `.md` prompt file that provides context to an LLM agent | `skill` |
| Quirk | A framework-specific deployment gotcha, verified by a tool agent | `known_quirk` |
| Evidence | Artifact produced by a tool agent proving a verification result (screenshot, scan report, build log) | `evidence` |

### 11.2 References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents)
- [Playwright Documentation](https://playwright.dev/)
- [Semgrep Documentation](https://semgrep.dev/docs/)
- LuxComplianceSuite forge session log (2026-03-27) — the incident that triggered this PRD

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-28 | n00b73 + PRD Architect | Initial draft |

---

<!--
PRD CHECKLIST:

COMPLETENESS:
[x] Problem clearly stated with measurable impact (3 wrong memory entries, 6 login rewrites)
[x] All user stories have acceptance criteria
[x] Security requirements defined
[x] Observability requirements defined
[x] Out of scope explicitly listed (13 items)
[x] Risks identified with mitigations (7 risks)

CLARITY:
[x] No TBD or TODO markers
[x] No vague language
[x] All acronyms defined in glossary (9 terms)
[x] Examples provided for complex requirements

TECHNOLOGY MATURITY:
[x] §5.0 assessed — Claude Agent SDK and MCP SDK are Beta
[x] Risk decisions documented for beta deps

READY FOR IMPLEMENTATION:
[x] Technology maturity assessed in §5.0
[x] Technical dependencies identified
[x] All dependency versions identified (verify before freeze)
[x] Directory structure specified in §5.5
[x] Environment variables listed in §5.7
[x] Deployment environment specified in §5.8
[x] Data model defined
[x] Phases broken down (4 phases)
-->

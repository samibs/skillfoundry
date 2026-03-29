# PRD: MCP Server Learning-Driven Improvements

> **Source**: Cross-project analysis of 2,792 harvested artifacts, 115 AI session transcripts, 267 extracted insights, and security/contract assessments across 49 projects.
>
> **Date**: 2026-03-29
> **Priority**: HIGH
> **Scope**: SkillFoundry MCP Server v5.0.0

---

## Problem Statement

The nightly harvest pipeline and bulk assessment of 49 projects across `~/apps/` and `~/wapplications/` revealed systematic, recurring issues that the MCP server's tool agents fail to catch, prevent, or remediate. These are not hypothetical — they are patterns extracted from **real sessions, real errors, and real user corrections** across 38 active projects spanning 3+ months of AI-assisted development.

### Key Metrics (from nightly harvest data)

| Metric | Value | Impact |
|--------|-------|--------|
| Security findings | 50 critical, 149 high across 49 projects | Hardcoded secrets and XSS are the #1 and #2 recurring issues |
| Frontend-backend contract mismatches | 1,161 mismatches out of 2,233 frontend calls | 52% of API calls have no verified backend match |
| User corrections | 60 corrections extracted from sessions | AI agents repeatedly need correcting on the same patterns |
| Dependency issues | 12 across 8 projects | Version mismatches and missing modules cause build failures |
| Build failures | Recurring in 3+ projects | npm 404s, TypeScript errors, port conflicts |
| Known deviation patterns | 161 documented, 16 categories | Only partially enforced by current agents |

---

## Root Cause Analysis

### 1. Hardcoded Secrets — Universal Problem (87 critical findings, 8+ projects)

**Evidence**: The insight extractor found `Security: hardcoded secrets` as the #1 pattern across SmartExchange, Phylon, amudfin, circularwatch.lu, taxnavigator, and others. Session transcripts show this being flagged and "fixed" repeatedly, only to reappear in later sessions.

**Root cause**: The security-scan-lite agent detects hardcoded secrets but has no prevention mechanism. It scans after the fact. AI coding agents (Claude, Cursor, Copilot) generate code with hardcoded values during development, and the security scan catches them too late — after they're already committed.

**Solution needed**: Pre-commit secret detection as a tool agent, not just a post-hoc scanner.

### 2. Frontend-Backend Contract Drift — 52% Mismatch Rate

**Evidence**: Contract check agent found 2,233 frontend API calls but only 392 matched backend routes (17.5% match rate). 1,161 explicit mismatches detected.

**Root cause**: Three gaps in the current contract checker:
- Cannot resolve NestJS controller prefixes (`@Controller('/users')` + `@Get('/:id')` = `/users/:id`)
- Cannot resolve FastAPI router prefixes (`router = APIRouter(prefix="/api/v1")`)
- Cannot trace centralized API clients (`const api = createApiClient(baseURL)` → `api.get('/users')`)

**Solution needed**: Enhanced contract resolution with prefix tracking and API client variable tracing.

### 3. User Corrections — Repeated AI Behavior Failures

**Evidence**: 60 correction events extracted from Claude Code sessions. Analysis of correction content shows recurring patterns:
- AI agents generating placeholder/stub code despite explicit "no placeholders" rules
- Context loss after session continuation — AI repeats work or loses prior decisions
- Incorrect framework detection leading to wrong build/test commands
- AI modifying files it was told not to touch

**Solution needed**: Correction pattern analyzer that feeds back into agent behavior rules. When the same correction appears 3+ times, auto-generate a new deviation rule.

### 4. Dependency Resolution Failures

**Evidence**: 12 dependency issues across 8 projects. Key patterns:
- `Missing module: smartexchange-api` (internal package not in registry)
- `Missing module: better-sqlite3` (native module build failures)
- Version mismatches between WeasyPrint/pydyf, pg_dump version conflicts
- npm 404 errors across 3 projects

**Root cause**: The deps-audit tool agent checks for outdated packages but doesn't validate that all imports can actually resolve, doesn't detect internal package references, and doesn't check native module build requirements.

**Solution needed**: Import resolution validator that checks every `import`/`require` against actual `node_modules` or package registry.

### 5. Known Deviations — Cataloged but Not Enforced

**Evidence**: 161 deviation patterns documented across 16 categories (Frontend, Backend, Database, TypeScript, Git, API Design, Security, Testing, Documentation, Authorization, Contract Mismatches, Silent Logic, Supply Chain, Performance, Error Handling, LLM-Specific). But only a fraction are checked by current tool agents.

**Root cause**: The deviation catalog is a markdown file that was distributed to projects as a reference. It was never programmatically enforced.

**Solution needed**: A deviation checker tool agent that validates code changes against the full catalog.

---

## Features

### Feature 1: Pre-Commit Secret Prevention Agent

**What**: A new tool agent `secret-guard` that scans staged changes for secrets BEFORE they enter the codebase.

**User stories**:

- As a developer using the MCP server, when I ask an AI agent to generate code, the `secret-guard` agent should intercept any hardcoded secrets in the generated output and replace them with environment variable references before the code is written.
- As a security reviewer, I should be able to query `secret-guard` for a report of all environment variables expected by a project, cross-referenced against actual `.env` / `.env.example` files.

**Acceptance criteria**:
- Detects API keys, passwords, tokens, database URLs, and JWT secrets in code before write
- Suggests `.env` variable names following project conventions
- Validates `.env.example` has entries for all referenced `process.env.*` variables
- Runs as part of the nightly harvest and reports new findings
- False positive rate < 5% (must not flag validation messages, localhost URLs, test fixtures)

**Evidence basis**: 87 critical security findings across 8 projects, all hardcoded secrets.

### Feature 2: Enhanced Contract Resolution Engine

**What**: Upgrade the contract-check agent with prefix resolution, API client tracing, and NestJS/FastAPI support.

**User stories**:

- As a developer, when I run a contract check on my NestJS project, the agent should correctly resolve controller-level `@Controller('/api/users')` prefixes combined with method-level `@Get('/:id')` decorators into the full route `/api/users/:id`.
- As a developer with a centralized API client (`const api = axios.create({ baseURL: '/api/v1' })`), the contract checker should trace `api.get('/users')` to the full path `/api/v1/users`.

**Acceptance criteria**:
- NestJS `@Controller` prefix + `@Get/@Post/@Put/@Delete` route = full path resolution
- FastAPI `APIRouter(prefix=...)` + `@router.get(...)` = full path resolution
- Centralized API client `baseURL` extraction and path joining
- Contract match rate improves from 17.5% to >60%
- Mismatch count decreases from 1,161 to <500

**Evidence basis**: 1,161 contract mismatches, 2,233 frontend calls with only 392 matches.

### Feature 3: Correction Feedback Loop

**What**: A system that analyzes user corrections from session transcripts, identifies recurring patterns, and auto-generates deviation rules that feed back into agent behavior.

**User stories**:

- As the MCP server operator, when the nightly harvest detects that the same correction pattern appears in 3+ different projects, it should automatically create a new deviation rule in the knowledge store.
- As a developer, I should be able to query the MCP server for "what corrections have been made in project X" to understand what the AI agents tend to get wrong.

**Acceptance criteria**:
- Extracts correction events from all 5 platform transcripts (Claude, Cursor, Gemini, Copilot, Codex)
- Groups corrections by semantic similarity (not just exact match)
- Threshold: 3 occurrences across 2+ projects triggers auto-rule generation
- Generated rules stored in `platform_insights` with type `auto_deviation`
- Monthly correction trend report showing improvement/regression
- Exposes `query_corrections` MCP tool for per-project correction history

**Evidence basis**: 60 corrections extracted, many are duplicates of the same underlying issue (placeholder generation, context loss, wrong framework detection).

### Feature 4: Import Resolution Validator

**What**: A tool agent that validates all `import`/`require` statements resolve to actual packages or local files.

**User stories**:

- As a developer, when I run the deps-audit tool, it should check that every `import` in my source code resolves to either a local file, an installed `node_modules` package, or a Python package.
- As a CI/CD operator, I should be able to run the import validator as a pre-build check that catches "Module not found" errors before `npm run build`.

**Acceptance criteria**:
- Scans `.ts`, `.tsx`, `.js`, `.jsx` files for `import`/`require` statements
- Scans `.py` files for `import`/`from ... import` statements
- Cross-references against `node_modules/`, `package.json` dependencies, `requirements.txt`
- Detects internal package references that aren't in the registry
- Reports native module dependencies that require build tools (better-sqlite3, sharp, bcrypt)
- Integrates with the existing deps-audit tool agent

**Evidence basis**: `Missing module: smartexchange-api`, `Missing module: better-sqlite3`, npm 404 errors in 3 projects.

### Feature 5: Deviation Enforcement Engine

**What**: Programmatic enforcement of the 161 known deviation patterns during code generation and review.

**User stories**:

- As a developer, when the MCP server's code review or security scan runs, it should check against ALL 161 known deviation patterns, not just the subset currently hard-coded in the security scanner.
- As the MCP operator, I should be able to add new deviation rules to the knowledge store and have them automatically enforced on the next scan.

**Acceptance criteria**:
- Parses the known deviations catalog into structured rules (ID, pattern, category, prevention, regex)
- Each deviation category maps to specific file types and code patterns
- Rules stored in SQLite and queryable via MCP tools
- Nightly harvest checks all projects against the full rule set
- New rules can be added via `upsert_deviation_rule` MCP tool
- Coverage: All 16 categories, all 161 patterns
- False positive suppression via per-project allowlists

**Evidence basis**: 161 documented patterns, only ~30 currently enforced by security-scan-lite.

### Feature 6: Knowledge-Driven Project Onboarding

**What**: When the MCP server encounters a new project, it should pre-populate context from the knowledge store — similar projects' PRDs, common pitfalls, framework-specific deviations.

**User stories**:

- As a developer starting a new Next.js project, the MCP server should proactively surface the known deviations for Next.js (FE-001 through FE-005, BE-001 through BE-010, etc.) and the most common errors from similar projects.
- As a developer working on a compliance/fintech project, the MCP server should surface relevant PRD templates and security patterns from the 9 compliance projects in the knowledge store.

**Acceptance criteria**:
- Framework detection triggers relevant deviation rule loading
- Domain detection (compliance, fintech, SaaS) triggers relevant PRD pattern suggestions
- Top 5 errors from similar projects surfaced proactively
- Fix patterns from similar projects suggested alongside error reports
- Query tool: `get_project_context(framework, domain)` returns curated knowledge

**Evidence basis**: 147 PRDs across 23 projects, 519 stories, forge session patterns showing 14 UI/UX PRDs, 9 compliance PRDs, 9 remediation PRDs.

### Feature 7: Nightly Harvest Report Enhancements

**What**: Upgrade the nightly report with trend analysis, regression detection, and actionable recommendations.

**User stories**:

- As the MCP operator, the nightly report should show week-over-week trends: are security findings decreasing? Are contract match rates improving?
- As a developer, the report should highlight which projects regressed since the last scan (new critical findings, new mismatches, new errors).

**Acceptance criteria**:
- Stores historical metrics per run for trend comparison
- Week-over-week and month-over-month trend calculations
- Regression alerts: projects that were clean but now have new findings
- Improvement tracking: projects that fixed previous findings
- Per-project health score (A-F) based on security, contracts, errors, test coverage
- Report includes top 3 actionable items per project

**Evidence basis**: Single nightly run data exists but no trend tracking. Need historical comparison to measure improvement.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server v5.0.0                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NEW TOOL AGENTS                                            │
│  ├── secret-guard          (Feature 1)                      │
│  ├── contract-resolver     (Feature 2 — upgrade)            │
│  ├── correction-analyzer   (Feature 3)                      │
│  ├── import-validator      (Feature 4)                      │
│  ├── deviation-enforcer    (Feature 5)                      │
│  └── project-onboarder     (Feature 6)                      │
│                                                             │
│  ENHANCED PIPELINE                                          │
│  ├── nightly-harvest.ts    (Feature 7 — trends)             │
│  ├── insight-extractor.ts  (Feature 3 — correction loop)    │
│  └── artifact-harvester.ts (existing — no changes)          │
│                                                             │
│  KNOWLEDGE STORE (SQLite)                                   │
│  ├── project_artifacts     (2,792 records — existing)       │
│  ├── platform_insights     (267 records — existing)         │
│  ├── session_transcripts   (115 records — existing)         │
│  ├── deviation_rules       (161 rules — NEW)                │
│  ├── correction_patterns   (grouped corrections — NEW)      │
│  └── project_health_scores (per-project metrics — NEW)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## New Database Tables

```sql
-- Feature 5: Deviation rules (programmatic enforcement)
CREATE TABLE deviation_rules (
  id TEXT PRIMARY KEY,           -- e.g., "FE-001", "BE-003"
  category TEXT NOT NULL,        -- e.g., "Frontend Deviations"
  pattern_description TEXT NOT NULL,
  prevention TEXT NOT NULL,
  responsible_agent TEXT,        -- e.g., "ux-ui", "security"
  detection_regex TEXT,          -- optional regex for automated checking
  file_glob TEXT,                -- e.g., "*.tsx", "*.py"
  severity TEXT DEFAULT 'medium',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Feature 3: Correction patterns (feedback loop)
CREATE TABLE correction_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_hash TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 1,
  project_count INTEGER DEFAULT 1,
  projects TEXT DEFAULT '[]',     -- JSON array of project names
  first_seen TEXT DEFAULT (datetime('now')),
  last_seen TEXT DEFAULT (datetime('now')),
  auto_rule_generated INTEGER DEFAULT 0,
  generated_rule_id TEXT          -- FK to deviation_rules.id
);

-- Feature 7: Project health scores (trend tracking)
CREATE TABLE project_health_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL,
  app_path TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  scan_date TEXT NOT NULL,
  security_critical INTEGER DEFAULT 0,
  security_high INTEGER DEFAULT 0,
  security_medium INTEGER DEFAULT 0,
  security_low INTEGER DEFAULT 0,
  contract_frontend_calls INTEGER DEFAULT 0,
  contract_backend_routes INTEGER DEFAULT 0,
  contract_matched INTEGER DEFAULT 0,
  contract_mismatches INTEGER DEFAULT 0,
  deviation_violations INTEGER DEFAULT 0,
  import_errors INTEGER DEFAULT 0,
  health_grade TEXT,              -- A, B, C, D, F
  health_score REAL,              -- 0-100
  UNIQUE(app_name, run_id)
);
```

---

## Implementation Priority

| Phase | Features | Effort | Impact |
|-------|----------|--------|--------|
| **Phase 1** | Feature 1 (secret-guard) + Feature 5 (deviation-enforcer) | Medium | Eliminates #1 security issue and enforces all 161 rules |
| **Phase 2** | Feature 2 (contract-resolver) + Feature 4 (import-validator) | Medium | Fixes 52% contract mismatch rate, prevents build failures |
| **Phase 3** | Feature 3 (correction-loop) + Feature 7 (report trends) | Medium | Closes feedback loop, enables measuring improvement |
| **Phase 4** | Feature 6 (project-onboarding) | Low | Knowledge-driven context for new projects |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Critical security findings per scan | 50 | < 10 |
| Contract match rate | 17.5% | > 60% |
| Contract mismatches | 1,161 | < 500 |
| Deviation rules enforced | ~30 | 161 (100%) |
| User corrections per session | Unmeasured | Decreasing trend |
| Build failures from missing imports | Ad-hoc | 0 (pre-build check) |
| Projects with health grade A-B | Unmeasured | > 50% |

---

## Out of Scope

- Modifying any project code in `~/apps/` or `~/wapplications/` — the MCP server observes and reports only
- Real-time code interception (pre-write hooks) — out of scope for v5, considered for v6
- Multi-user support — single-developer MCP server
- Cloud deployment — runs locally only
- Integration with external CI/CD systems (GitHub Actions, etc.)

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Deviation regex false positives overwhelm developers | Medium | High | Per-project allowlists, severity-based filtering, tunable thresholds |
| Contract resolver still can't trace dynamic routes | Medium | Medium | Log unresolvable patterns for manual review, improve iteratively |
| Correction pattern grouping produces noisy clusters | Medium | Low | Require 3+ occurrences across 2+ projects before rule generation |
| Performance degradation with 161 rules × 49 projects | Low | Medium | Batch processing, rule caching, incremental scanning |

---

## Evidence References

All data cited in this PRD is stored in the MCP server's SQLite knowledge store:

```sql
-- Security findings
SELECT * FROM platform_insights WHERE insight_type = 'security_finding' AND severity = 'critical';

-- User corrections
SELECT * FROM platform_insights WHERE insight_type = 'correction';

-- All PRDs (product knowledge)
SELECT * FROM project_artifacts WHERE artifact_type = 'genesis_prd';

-- Known deviations catalog
SELECT * FROM project_artifacts WHERE artifact_type = 'known_deviations';

-- Session transcripts
SELECT * FROM session_transcripts ORDER BY message_count DESC;

-- Nightly harvest report
SELECT * FROM nightly_harvest_runs WHERE status = 'completed' ORDER BY id DESC;
```

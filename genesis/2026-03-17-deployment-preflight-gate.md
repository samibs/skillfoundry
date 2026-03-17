# PRD: Deployment Pre-Flight Gate (T7)

**Version:** 1.0
**Status:** APPROVED
**Created:** 2026-03-17
**Author:** SBS + PRD Architect
**Last Updated:** 2026-03-17

---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry gate system (T0-T6) validates code quality but **not deployment readiness**. A session on the TaxNavigator project revealed that all 7 code gates passed, yet production deployment failed with:

- **DB schema mismatch**: PostgreSQL enum types didn't exist, causing 500 errors on every dashboard endpoint
- **CORS misconfiguration**: Frontend served from `www.` subdomain but API `CORS_ORIGINS` only listed apex domain
- **API contract violations**: Frontend requested `page_size=500` but API limit was 100
- **Env variable drift**: Production `.env` had stale values that didn't match the deployed code

These are not code quality issues — they're **deployment environment issues** that the current T0-T6 gates cannot catch. The AI agent spent 4+ rounds of trial-and-error debugging in production, burning tokens on problems that a pre-flight check would have caught in seconds.

### 1.2 Proposed Solution

Add a **T7: Deployment Pre-Flight** gate that validates the runtime environment before deployment. It checks:

1. **DB schema alignment** — models vs actual database (enum types, missing tables, column type mismatches)
2. **Endpoint smoke test** — hit every defined API endpoint with a health check
3. **Env/config consistency** — CORS origins include the served domain, required env vars are set
4. **API contract validation** — frontend API calls don't violate backend constraints

### 1.3 Success Metrics

- Zero DB-related 500 errors after deployment (currently: 4+ per session)
- Zero CORS errors after deployment (currently: 1+ per session)
- Deployment debugging reduced from 4+ rounds to 0

---

## 2. User Stories

### Primary User: AI Developer Agent

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | Developer/Agent | Run a pre-flight check before deploying | I catch DB/env/API issues before they hit production | MUST |
| US-002 | Developer/Agent | See which DB migrations are pending | I don't deploy with schema mismatches | MUST |
| US-003 | Developer/Agent | Validate CORS config matches served domains | I don't get cross-origin errors in production | MUST |
| US-004 | Developer/Agent | Smoke-test API endpoints after restart | I know the server actually serves requests | SHOULD |
| US-005 | Developer/Agent | Run T7 as part of the full gate suite | Pre-flight is automatic, not opt-in | MUST |

---

## 3. Functional Requirements

### FR-001: DB Schema Validation

Detect project database type (PostgreSQL, SQLite, MSSQL) and validate:
- Pending migrations exist that haven't been applied
- Model-defined enum types exist in the database
- Tables referenced by models exist
- Column types match model definitions

**Implementation**: Parse Alembic migration state, SQLAlchemy model definitions, or Prisma schema. Run `alembic current` vs `alembic heads` for migration state.

**Acceptance Criteria**:
- Given a project with unapplied Alembic migrations, when T7 runs, then status is FAIL with "N pending migrations"
- Given a project with all migrations applied, when T7 runs, then DB check passes

### FR-002: Environment Variable Validation

Check that required environment variables are set and consistent:
- `CORS_ORIGINS` includes all domains the frontend is served from
- `DATABASE_URL` is set and the database is reachable
- Required API keys/secrets are present (non-empty)
- `VITE_API_URL` (or equivalent) is relative or matches the served domain

**Acceptance Criteria**:
- Given a frontend with `VITE_API_URL=https://example.com` but served from `www.example.com`, when T7 runs, then WARN with "API URL domain mismatch"
- Given a backend with `CORS_ORIGINS` missing `www.` variant, when T7 runs, then WARN with "CORS origins may be incomplete"

### FR-003: API Endpoint Smoke Test

If a dev server is running (detected by port check), hit key endpoints:
- Health/status endpoint
- Auth endpoint (unauthenticated — expects 401/403, not 500)
- One CRUD endpoint (expects 401/403 or 200, not 500)

**Acceptance Criteria**:
- Given a running backend returning 500 on `/api/v1/dashboard`, when T7 runs, then status is FAIL with endpoint and error
- Given no running backend, when T7 runs, then smoke test is SKIP (not FAIL)

### FR-004: Frontend-Backend Contract Check

Scan frontend API calls for constraint violations:
- Page size parameters exceeding backend limits
- Endpoints called in frontend that don't exist in backend routes
- Request methods that don't match backend route definitions

**Acceptance Criteria**:
- Given frontend code with `page_size=500` but backend limit of 100, when T7 runs, then WARN with "Frontend requests page_size=500, backend max is 100"

### FR-005: Integration into Gate Pipeline

T7 runs as part of `runAllGates()`:
- Executes after T6 (scope validation)
- Runs in the sequential phase (not parallelized — needs network access)
- Results included in `GateRunSummary`
- Available via `/gate t7` command in sf_cli
- Available via `sf-runner.mjs --gate T7`

**Acceptance Criteria**:
- Given `/gate all` is invoked, when gates run, then T7 appears in results
- Given `/gate t7` is invoked, when gate runs, then only T7 executes

### FR-006: Graceful Degradation

T7 must never block projects that don't have deployable backends:
- Skip if no backend framework detected (no FastAPI, Express, Django, .NET)
- Skip individual checks if tooling not available (no alembic, no running server)
- Never FAIL on missing tooling — only FAIL on detected mismatches

**Acceptance Criteria**:
- Given a frontend-only project, when T7 runs, then status is SKIP
- Given a Python project without alembic, when T7 runs, then DB migration check skips

---

## 4. Non-Functional Requirements

### 4.1 Performance
- T7 must complete within 15 seconds (network calls have 5s timeout each)
- No LLM calls — purely static analysis + shell commands

### 4.2 Compatibility
- Cross-platform: Linux, macOS, Windows (Git Bash/WSL)
- Framework-agnostic: detect FastAPI, Express, Django, .NET, Rails patterns

---

## 5. Technical Specifications

### 5.1 Architecture

T7 is implemented as a function `runT7(workDir: string)` in `gates.ts`, following the same pattern as T0-T6.

Sub-checks:
- `checkDbMigrations(workDir)` — Alembic/Prisma migration state
- `checkEnvConsistency(workDir)` — .env file validation
- `checkEndpointSmoke(workDir)` — HTTP health checks
- `checkApiContracts(workDir)` — Frontend↔Backend constraint scan

### 5.2 Detection Heuristics

| Signal | Backend Type |
|--------|-------------|
| `requirements.txt` + `alembic/` | Python/FastAPI/Django |
| `package.json` + `prisma/` | Node.js/Prisma |
| `*.csproj` + `Migrations/` | .NET/EF Core |
| `Gemfile` + `db/migrate/` | Ruby/Rails |

---

## 6. Constraints & Assumptions

### 6.1 Constraints
- No database credentials stored — T7 only checks migration state files, not actual DB connections
- Smoke tests only run against localhost (never production URLs)

### 6.2 Out of Scope
- Full integration test suite (that's T3)
- Performance/load testing
- Cloud deployment validation (Kubernetes, Docker)
- DNS/SSL certificate checks

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False positives on env checks | MEDIUM | LOW | WARN, never FAIL on env issues |
| Smoke test hits prod accidentally | LOW | HIGH | Only test localhost URLs |
| Slow network timeouts | MEDIUM | LOW | 5s per-check timeout, 15s total cap |

---

## 8. Implementation Plan

### 8.1 Phases
| Phase | Scope | Dependencies |
|-------|-------|--------------|
| 1 | T7 gate function + DB migration check + env validation | None |
| 2 | Smoke test + API contract check | Phase 1 |

### 8.2 Estimated Effort
Phase 1: S — Phase 2: S

---

## 9. Acceptance Criteria

### 9.1 Definition of Done
- [ ] T7 function implemented in gates.ts
- [ ] Tests covering all sub-checks (pass, fail, skip scenarios)
- [ ] `/gate t7` and `/gate all` include T7
- [ ] sf-runner.mjs supports `--gate T7`
- [ ] CHANGELOG updated

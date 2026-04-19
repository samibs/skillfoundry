# PRD: Tenant Isolation Auditor — Multi-Tenant Security Gate

---
prd_id: tenant-isolation-auditor
title: Tenant Isolation Auditor — Multi-Tenant Security Gate
version: 1.0
status: DRAFT
created: 2026-04-02
author: n00b73
last_updated: 2026-04-02

dependencies:
  requires: []
  recommends: [claude-code-architecture-parity]
  blocks: []
  shared_with: []

tags: [security, core, mcp, agents, multi-tenant]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

LLM agents building multi-tenant applications consistently introduce critical security gaps:

1. **Unprotected download endpoints** — File-serving routes created without authentication. Any user (or anonymous visitor) can download any file by guessing the job/resource ID.
2. **Flat file storage** — Files stored in `uploads/{job_id}/` instead of tenant-scoped paths like `tenants/{tenant_id}/clients/{client_id}/`. No filesystem-level isolation.
3. **Bypassed security patterns** — A proper `FileStorageService` with tenant isolation exists in the same codebase, but new features use a simpler flat client instead. The agent doesn't audit existing patterns before building new ones.
4. **Missing ownership checks** — CRUD endpoints return all records to any authenticated user instead of scoping queries by `tenant_id` or `user_id`.
5. **Hardcoded credentials** — Default `admin:admin` in config files that never get changed in production.
6. **Path traversal in downloads** — Download endpoints accept raw file paths without validating they belong to the requesting tenant.

This is not a one-off bug — it's a **systemic LLM behavior pattern**. Every multi-tenant app built with AI assistance is vulnerable unless the framework actively prevents it. The AutoKYC incident (2026-04-02) is the latest example, but RUE-2026 had similar issues with download path traversal.

**Impact:** Data breach — User A accesses User B's files, financial documents, tax declarations, personal data. In regulated industries (finance, healthcare, legal), this is a compliance violation.

### 1.2 Proposed Solution

Add a **Tenant Isolation Auditor** to SkillFoundry that runs as:
1. A new MCP tool agent (`sf_tenant_audit`) that scans a project's codebase for multi-tenant security violations
2. A new check integrated into the Anvil gate system (runs automatically during `/forge` and `/go`)
3. A new skill (`/tenant-audit`) for on-demand scanning

The auditor performs static analysis on the codebase — no runtime execution needed. It reads source files, parses route definitions, checks storage paths, and reports violations.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Unprotected download endpoints caught | 0 (manual review only) | 100% detection | False negative rate on known-vulnerable codebases |
| Flat storage patterns detected | 0 | 100% detection | Test against AutoKYC + RUE-2026 patterns |
| Hardcoded credential detection | Partial (BPSBS rule) | 100% detection | Scan config files for default passwords |
| Auth bypass on new endpoints | 0 | 100% detection | Compare auth middleware usage across routes |
| False positive rate | N/A | < 10% | Manual review of flagged issues |

---

## 2. User Stories

### Primary User: Developer using SkillFoundry on a multi-tenant project

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have download endpoints automatically checked for auth | unauthenticated file access is caught before it ships | MUST |
| US-002 | developer | have file storage paths checked for tenant isolation | flat storage patterns are flagged immediately | MUST |
| US-003 | developer | have new endpoints compared against existing auth patterns | auth bypass is caught when a new route skips middleware | MUST |
| US-004 | developer | have query scoping checked for tenant_id/user_id | "return all records" endpoints are flagged | MUST |
| US-005 | developer | have hardcoded credentials detected in config files | default passwords don't reach production | MUST |
| US-006 | developer | have download paths checked for traversal risks | path manipulation attacks are caught | SHOULD |
| US-007 | developer | run the audit on-demand via `/tenant-audit` | I can check any project at any time | SHOULD |
| US-008 | developer | have the audit run automatically in /forge pipelines | multi-tenant violations block the pipeline | SHOULD |

---

## 3. Functional Requirements

### 3.1 Detection Rules

The auditor scans source code files and applies these detection rules:

#### RULE 1: Unprotected File-Serving Endpoints (CRITICAL)

**What:** Any route that serves files (FileResponse, send_file, StreamingResponse with file content, static file serving) without authentication middleware.

**Detection patterns:**
```
# Python/FastAPI
FileResponse(...)  without  Depends(get_current_user)
StreamingResponse(open(...))  without  Depends(get_current_user)
send_file(...)  without  @login_required

# Node/Express
res.sendFile(...)  without  authMiddleware
res.download(...)  without  requireAuth
createReadStream(...)  in route handler  without  auth check

# Any framework
Route containing "/download/" without auth dependency
Route containing "/export/" without auth dependency
Route containing "/file/" without auth dependency
```

**Output:** `CRITICAL: Unprotected file download at {file}:{line} — route {path} serves files without authentication`

#### RULE 2: Flat File Storage (CRITICAL)

**What:** File storage paths that use only a job/resource ID without tenant scoping.

**Detection patterns:**
```
# Path patterns WITHOUT tenant isolation
uploads/{id}/
storage/{id}/
files/{id}/
tmp/{id}/

# SAFE patterns (tenant-scoped)
tenants/{tenant_id}/...
{tenant_id}/uploads/...
storage/{tenant_id}/{client_id}/...
```

**Heuristic:** If the project has ANY model with `tenant_id` field, ALL file storage paths must include a tenant component.

**Output:** `CRITICAL: Flat file storage at {file}:{line} — path "{pattern}" has no tenant isolation`

#### RULE 3: Auth Middleware Inconsistency (HIGH)

**What:** Some routes in the same router use auth middleware but others don't.

**Detection:**
1. Scan all route files in the project
2. For each router/controller, identify which routes have auth dependencies
3. Flag routes that DON'T have auth in a file where most routes DO

**Output:** `HIGH: Auth inconsistency at {file}:{line} — route {path} has no auth, but {N} other routes in this file require auth`

#### RULE 4: Missing Query Scoping (HIGH)

**What:** Database queries that return records without filtering by tenant_id or user_id.

**Detection patterns:**
```
# Unscoped queries (dangerous in multi-tenant)
SELECT * FROM jobs  (no WHERE tenant_id = ...)
Model.query.all()
db.query(Model).all()
Model.find({})  (no tenant filter)
prisma.job.findMany({})  (no where clause with tenantId)

# SAFE patterns
.filter(tenant_id=current_user.tenant_id)
.where({ tenantId: req.user.tenantId })
WHERE tenant_id = $1
```

**Heuristic:** Only flag if the model has a `tenant_id` or `user_id` field.

**Output:** `HIGH: Unscoped query at {file}:{line} — {model} query returns all records without tenant/user filter`

#### RULE 5: Hardcoded Credentials (HIGH)

**What:** Default passwords, API keys, or secrets in configuration files.

**Detection patterns:**
```
# Config files with defaults
password: str = "admin"
password: str = Field("password", ...)
DEFAULT_PASSWORD = "..."
admin_password: str = Field("admin", env="...")

# Common weak defaults
admin:admin
root:root
password:password
secret:secret
changeme
CHANGE_ME
```

**Output:** `HIGH: Hardcoded credential at {file}:{line} — default value "{value}" for {field}`

#### RULE 6: Path Traversal in Downloads (HIGH)

**What:** Download endpoints that accept user-supplied file paths without validation.

**Detection patterns:**
```
# Dangerous: raw path from request used in file operations
FileResponse(path=request.path_param)
open(user_supplied_filename)
send_file(os.path.join(base, user_input))

# SAFE patterns
os.path.basename(filename)  # Strip directory components
path.resolve() checked against allowed base
Whitelist of allowed filenames
```

**Output:** `HIGH: Path traversal risk at {file}:{line} — user-supplied path used in file operation without validation`

### 3.2 MCP Tool Agent (`sf_tenant_audit`)

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-201 | Scan project | Accept projectPath, scan all source files | Given a project path, When sf_tenant_audit runs, Then all .py/.ts/.js files in src/app/api are scanned |
| FR-202 | Apply all rules | Run all 6 detection rules | Given a scan, When complete, Then results include findings from all applicable rules |
| FR-203 | Structured report | Return findings grouped by severity | Given findings, When reported, Then they are grouped as CRITICAL/HIGH/MEDIUM with file:line references |
| FR-204 | Framework detection | Auto-detect framework (FastAPI/Express/Next.js/Django) | Given a project, When scanned, Then the correct framework patterns are used for detection |
| FR-205 | Multi-tenant detection | Determine if project is multi-tenant | Given a project, When models are scanned, Then presence of tenant_id/org_id/fiduciary_id indicates multi-tenant |

**Tool schema:**
```typescript
{
  name: "sf_tenant_audit",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Project root path" },
      strict: { type: "boolean", description: "Fail on any HIGH+ finding (default: true)" },
      rules: {
        type: "array",
        items: { type: "string", enum: ["unprotected_downloads", "flat_storage", "auth_inconsistency", "unscoped_queries", "hardcoded_creds", "path_traversal"] },
        description: "Specific rules to run (default: all)"
      }
    },
    required: ["projectPath"]
  }
}
```

**Output format:**
```json
{
  "passed": false,
  "isMultiTenant": true,
  "framework": "fastapi",
  "findings": [
    {
      "rule": "unprotected_downloads",
      "severity": "CRITICAL",
      "file": "routers/export.py",
      "line": 45,
      "message": "Route GET /api/v1/jobs/{id}/download serves files without authentication",
      "evidence": "FileResponse(path=...) with no Depends(get_current_user)",
      "fix": "Add Depends(get_current_active_user) to route parameters"
    }
  ],
  "summary": {
    "critical": 2,
    "high": 3,
    "medium": 1,
    "total": 6,
    "filesScanned": 24,
    "modelsWithTenantId": 3,
    "routesWithAuth": 12,
    "routesWithoutAuth": 4
  }
}
```

### 3.3 Anvil Integration

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-301 | Auto-run in forge | Run tenant audit after Tester phase in /forge | Given /forge running on a multi-tenant project, When Tester completes, Then sf_tenant_audit runs automatically |
| FR-302 | Block on CRITICAL | CRITICAL findings block the pipeline | Given a CRITICAL finding, When Anvil evaluates, Then the story is marked BLOCKED |
| FR-303 | Warn on HIGH | HIGH findings produce warnings but don't block | Given a HIGH finding, When Anvil evaluates, Then a warning is logged and the user is notified |
| FR-304 | Skip for non-multi-tenant | Don't run on projects without tenant models | Given a single-tenant project, When audit checks, Then it skips with "not multi-tenant — skipping" |

### 3.4 Slash Command (`/tenant-audit`)

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-401 | On-demand scan | `/tenant-audit` runs the full audit | Given /tenant-audit invoked, When scan completes, Then report is displayed |
| FR-402 | Specific rules | `/tenant-audit --rules=unprotected_downloads,flat_storage` | Given --rules flag, When invoked, Then only specified rules run |
| FR-403 | Fix suggestions | Each finding includes a concrete fix | Given a finding, When displayed, Then it includes a code-level fix suggestion |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Scan time | < 5s for a 500-file project |
| Memory | < 100MB during scan |
| No external dependencies | Pure source code analysis — no runtime, no database connection needed |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| No code execution | Auditor reads files only — never executes project code |
| No network access | All analysis is local — no data sent externally |
| Credential masking | Hardcoded creds in findings are partially masked in output |

### 4.3 Accuracy

| Metric | Target |
|--------|--------|
| True positive rate (known-vulnerable projects) | > 95% |
| False positive rate | < 10% |
| Framework support | FastAPI, Express, Next.js, Django (expandable) |

---

## 5. Technical Specifications

### 5.1 Architecture

```
sf_tenant_audit (MCP Tool)
    │
    ├── Framework Detector
    │   └── Scan package.json / requirements.txt / pyproject.toml
    │
    ├── Multi-Tenant Detector
    │   └── Scan models for tenant_id / org_id / user_id fields
    │
    ├── Rule Engine
    │   ├── Rule 1: Unprotected Downloads
    │   ├── Rule 2: Flat Storage
    │   ├── Rule 3: Auth Inconsistency
    │   ├── Rule 4: Unscoped Queries
    │   ├── Rule 5: Hardcoded Credentials
    │   └── Rule 6: Path Traversal
    │
    └── Report Generator
        └── Structured JSON with fix suggestions
```

### 5.2 Tool Module Structure

```
mcp-server/src/tools/TenantAuditAgent/
├── index.ts                # ToolModule export
├── TenantAuditAgent.ts     # Main orchestrator
├── constants.ts            # Tool name, schema
├── prompt.ts               # System prompt
├── permissions.ts          # No trust required
├── detectors/
│   ├── framework.ts        # Detect FastAPI/Express/Next.js/Django
│   └── multi-tenant.ts     # Detect tenant_id in models
├── rules/
│   ├── unprotected-downloads.ts
│   ├── flat-storage.ts
│   ├── auth-inconsistency.ts
│   ├── unscoped-queries.ts
│   ├── hardcoded-creds.ts
│   └── path-traversal.ts
└── types.ts                # Finding, AuditReport interfaces
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk |
|-----------|---------|---------|------|
| Node.js built-in `fs` | N/A | Read source files | None |
| Node.js built-in `path` | N/A | Path manipulation | None |
| No external deps | — | Pure static analysis | None |

### 5.4 Skill File

Create `.claude/commands/tenant-audit.md` for slash command access:

```markdown
# /tenant-audit - Multi-Tenant Security Auditor

Scan the project for multi-tenant security violations: unprotected downloads,
flat file storage, auth bypass, unscoped queries, hardcoded credentials,
and path traversal risks.

Uses the sf_tenant_audit MCP tool.
```

---

## 6. Detection Examples (from Real Incidents)

### AutoKYC Incident (2026-04-02)

**Would have caught:**
```
CRITICAL: Flat file storage at services/storage.py:19
  Path "uploads/{job_id}" has no tenant isolation
  Fix: Change to "tenants/{tenant_id}/uploads/{job_id}"

CRITICAL: Unprotected file download at routers/export.py:30
  Route GET /api/v1/jobs/{job_id}/export uses HTTPBasic only
  Fix: Replace with proper JWT/session auth middleware

HIGH: Hardcoded credential at config.py:17
  Default value "admin" for admin_username
  Fix: Remove default, require env var ADMIN_USERNAME

HIGH: Missing tenant model at models.py:17
  IngestionJob has no tenant_id field
  Fix: Add tenant_id: UUID = Field(foreign_key="tenants.id")

HIGH: Unscoped query at routers/jobs.py:12
  GET /jobs returns all jobs without tenant filter
  Fix: Add .filter(tenant_id=current_user.tenant_id)
```

### RUE-2026 Path Traversal

**Would have caught:**
```
HIGH: Path traversal risk at services/storage.py:96
  download_file(file_path: str) accepts unvalidated path
  Fix: Validate file_path starts with tenants/{current_tenant_id}/

HIGH: Path traversal risk at api/v1/audit_packages.py:359
  FileResponse(path=package.file_path) without path validation
  Fix: Verify package.tenant_id == current_user.tenant_id before serving
```

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Static analysis only** — no running project code, no database connections
- **Pattern matching** — not a full AST parser; uses regex + heuristics
- **Framework-specific** — must know the framework to apply correct patterns

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Multi-tenant projects have tenant_id in models | Some use org_id, company_id, etc. | Detect multiple field names |
| Auth middleware has standard naming | Custom auth decorators may be missed | Allow configurable auth patterns |
| File storage is via standard libraries | Custom storage abstractions may be missed | Flag any file serving without auth |

### 7.3 Out of Scope

- [ ] Runtime testing (use sf_verify_auth for that)
- [ ] Database-level RLS auditing
- [ ] Network-level security (firewalls, VPNs)
- [ ] Frontend security (XSS, CSRF — covered by existing security scanner)
- [ ] Custom framework support (only FastAPI, Express, Next.js, Django)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-001 | False positives on intentionally public endpoints | M | M | Allow `# sf:public` comment to whitelist routes |
| R-002 | Misdetecting single-tenant as multi-tenant | L | L | Require 2+ models with tenant_id before flagging |
| R-003 | New frameworks not supported | M | M | Extensible rule system — add patterns per framework |
| R-004 | Pattern matching misses obfuscated code | L | M | Combine with Semgrep for deeper analysis |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Core Rules | Rules 1-3 (downloads, storage, auth inconsistency) + framework detection | Tool module system (STORY-001 from v5.1.0) |
| 2 | Advanced Rules | Rules 4-6 (queries, creds, traversal) + multi-tenant detection | Phase 1 |
| 3 | Integration | Anvil gate + /tenant-audit skill + auto-run in /forge | Phase 2 |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 — Core Rules | M | Medium | Low |
| 2 — Advanced Rules | M | Medium | Medium |
| 3 — Integration | S | Low | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] sf_tenant_audit MCP tool scans projects and returns structured findings
- [ ] All 6 rules implemented with framework-specific patterns
- [ ] AutoKYC codebase scan produces all expected findings (regression test)
- [ ] RUE-2026 codebase scan catches path traversal issues
- [ ] False positive rate < 10% on 3+ real projects
- [ ] Integrated into Anvil gate system (CRITICAL = block, HIGH = warn)
- [ ] /tenant-audit slash command available
- [ ] Fix suggestions are actionable (not generic)

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Tenant Isolation | Data and file access scoped to a specific organization/user | `tenant_id` |
| Unprotected Endpoint | Route serving data/files without authentication middleware | N/A |
| Flat Storage | File storage without directory-level tenant scoping | N/A |
| Auth Inconsistency | Routes in the same file with different auth requirements | N/A |
| Query Scoping | Database queries filtered by tenant/user ownership | `WHERE tenant_id = ?` |

### 11.2 References

- AutoKYC incident (2026-04-02) — flat storage, hardcoded creds, no tenant model
- RUE-2026 path traversal — download_file() accepts unvalidated paths
- OWASP A01:2021 Broken Access Control
- OWASP A04:2021 Insecure Design
- Memory: `feedback_bypass_existing_security.md`

# PRD: [Feature Name]

---
prd_id: [kebab-case-identifier]
title: [Feature Name]
version: 1.0
status: DRAFT
created: [YYYY-MM-DD]
author: [Your Name]
last_updated: [YYYY-MM-DD]

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []        # PRD IDs that MUST complete before this one
  recommends: []      # PRD IDs that SHOULD complete first (soft dependency)
  blocks: []          # PRD IDs that are waiting for this one
  shared_with: []     # PRD IDs that share components with this one

tags: []              # Categorization: [auth, security, core, feature, etc.]
priority: medium      # high | medium | low
layers: []            # Affected layers: [database, backend, frontend]
---

---

## 1. Overview

### 1.1 Problem Statement
<!-- What problem exists? Why does it matter? Who is affected? Be specific. -->

[Describe the problem in 2-3 sentences. Include who experiences this problem and what impact it has.]

### 1.2 Proposed Solution
<!-- High-level description of what we're building -->

[Describe the solution approach in 2-3 sentences. Focus on WHAT, not HOW.]

### 1.3 Success Metrics
<!-- How do we measure if this worked? -->

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| [Metric 1] | [baseline] | [goal] | [measurement method] |
| [Metric 2] | [baseline] | [goal] | [measurement method] |

---

## 2. User Stories

### Primary User: [Role Name]

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | [role] | [action] | [benefit] | MUST |
| US-002 | [role] | [action] | [benefit] | SHOULD |
| US-003 | [role] | [action] | [benefit] | COULD |

### Secondary Users (if applicable)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | [role] | [action] | [benefit] | [priority] |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | [Name] | [What it does] | Given [context], When [action], Then [result] |
| FR-002 | [Name] | [What it does] | Given [context], When [action], Then [result] |

### 3.2 User Interface Requirements

<!-- Describe key screens, flows, and interactions -->

**Screen: [Screen Name]**
- Purpose: [why this screen exists]
- Key elements: [list main UI components]
- User flow: [how user navigates to/from this screen]

### 3.3 API Requirements (if applicable)

| Endpoint | Method | Purpose | Auth | Request Body | Response |
|----------|--------|---------|------|--------------|----------|
| `/api/v1/[resource]` | GET | [purpose] | [JWT/None] | N/A | `{ data: [...] }` |
| `/api/v1/[resource]` | POST | [purpose] | [JWT/None] | `{ field: value }` | `{ id: ... }` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| API Response Time | < [X]ms (95th percentile) |
| Page Load Time | < [X]s |
| Concurrent Users | Support [X] simultaneous users |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | [method: JWT, OAuth, Session] |
| Authorization | [RBAC roles: Admin, User, etc.] |
| Data Protection | [encryption at rest/transit, PII handling] |
| Input Validation | [sanitization, max string length, max array size, max nesting depth] |
| Session Lifecycle | [token expiry duration, refresh token rotation, invalidation on password change] |
| Rate Limiting | [per-endpoint limits, response on exceed: 429 + Retry-After] |
| File Uploads | [max size, allowed types, validation method: magic bytes] |
| Error Handling | [structured error codes, no stack traces/SQL/IPs in responses] |
| CORS Policy | [allowed origins (specific, not *), credentials mode] |
| Concurrent Access | [optimistic locking via ETag/version field on shared resources] |

### 4.2.1 Multi-Tenant Isolation (REQUIRED if multi-user or multi-tenant)

<!-- MANDATORY if this app serves multiple users, tenants, organizations, or clients. -->
<!-- If this section is skipped, the story generator will NOT inject tenant isolation stories. -->
<!-- If this section is filled, the gate keeper WILL enforce tenant isolation at every checkpoint. -->

| Aspect | Requirement |
|--------|-------------|
| Tenancy Model | [single-tenant / multi-tenant / per-user isolation] |
| Tenant Identifier | [field name: tenant_id / org_id / user_id / fiduciary_id] |
| Data Scoping | [every query filtered by tenant / RLS at database level / both] |
| File Storage Isolation | [tenant-scoped paths: tenants/{id}/... / S3 prefix per tenant / encrypted per-tenant] |
| Cross-Tenant Testing | [required: User A cannot access User B's data/files] |
| Download Security | [all file-serving endpoints require auth + tenant ownership verification] |

<!-- If ANY row says "not applicable" for a multi-user app, explain WHY in Constraints section. -->
<!-- Leaving this section empty on a multi-tenant app is a BLOCKING issue during PRD validation. -->

### 4.3 Scalability

<!-- How should this scale? Horizontal/vertical? Auto-scaling triggers? -->

[Describe scaling expectations]

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Uptime | [99.x%] |
| Recovery Time Objective (RTO) | [X minutes/hours] |
| Recovery Point Objective (RPO) | [X minutes/hours] |
| Backup Strategy | [daily/hourly, retention period] |
| Rollback Strategy | [feature flag / API versioning / migration rollback] |
| External Service Failure | [retry with backoff / circuit breaker / graceful degradation] |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Logging Format | [structured JSON with correlation ID] |
| PII in Logs | [must be redacted — no tokens, passwords, SSNs in logs] |
| Health Check | [/health endpoint required] |
| Readiness Probe | [/ready endpoint for load balancer] |
| Audit Logging | [WHO did WHAT to WHICH resource WHEN — including failed access] |
| Monitoring | [SLI/SLO definitions, alerting thresholds] |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

<!-- MANDATORY: Evaluate every major dependency BEFORE writing implementation stories. -->
<!-- This section determines the VERIFICATION LEVEL required in TEMPER (Phase 3). -->
<!-- Beta/unstable deps with 0 known quirks = uncharted territory = Playwright mandatory. -->

#### Maturity Classification

| Maturity | Definition | Verification Level |
|----------|-----------|-------------------|
| **Stable** | GA release, no breaking changes in 6+ months | Build + curl + unit tests |
| **Recent Major** | GA but breaking changes from prior version (e.g., Prisma 5→7) | Build + integration tests + migration verification |
| **RC/Preview** | Release candidate, API mostly frozen | Build + integration tests + browser smoke test |
| **Beta** | API unstable, may change between patches | **Playwright/browser mandatory** — curl is NOT sufficient |
| **Alpha/Experimental** | Not recommended for production | **Playwright mandatory + human sign-off before deploy** |

#### Stack Assessment

<!-- Fill this for EVERY major dependency. The "Known Quirks in KB" column checks -->
<!-- the framework's knowledge base (memory_bank/, deployment quirks from prior projects). -->
<!-- 0 known quirks on a Beta dep = you are the first to hit the problems. Plan accordingly. -->

| Dependency | Version | Maturity | API Stability | Breaking Changes From Prior | Known Quirks in KB | Verification Required |
|-----------|---------|----------|--------------|---------------------------|-------------------|----------------------|
| [e.g., Next.js] | [16.2.1] | Stable | Minor changes from 15 | [standalone output path changed, middleware deprecated] | [2 quirks] | Build + curl |
| [e.g., NextAuth] | [5.0.0-beta.30] | **Beta** | **Unstable** | [Complete rewrite from v4] | [0 — uncharted] | **Playwright mandatory** |
| [e.g., Prisma] | [7.5.0] | Recent Major | Breaking from v5 | [Adapter required, no datasource URL in schema] | [1 quirk] | Build + seed test |
| [e.g., React] | [19.2.4] | Stable | Stable | [None relevant] | [0] | Build |

<!-- Replace examples with your actual stack. Delete this comment when done. -->

#### Risk Decision

<!-- For any dependency marked Beta or Alpha: -->
<!-- 1. Is there a stable alternative? If yes, justify why you're using the beta. -->
<!-- 2. What's the blast radius if it doesn't work? (auth = critical, styling = low) -->
<!-- 3. Who owns the debugging when the beta breaks? (agent alone = high risk) -->

| Beta/Alpha Dependency | Stable Alternative | Blast Radius | Justification |
|----------------------|-------------------|-------------|---------------|
| [e.g., NextAuth v5 beta] | [NextAuth v4 (stable)] | **Critical** (auth) | [v5 is the only version supporting Next.js 16 App Router natively] |

### 5.1 Architecture

<!-- Component diagram or text description -->

```mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Service]
    C --> D[Database]
```

### 5.2 Data Model

<!-- Entity descriptions and relationships -->

**Entity: [EntityName]**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| [field] | [type] | [constraints] | [description] |

### 5.3 Dependencies

<!-- CRITICAL: Every version MUST be verified before freezing this PRD. -->
<!-- Run: npm view <pkg> versions --json | tail -5  (or pip index versions <pkg>) -->
<!-- If a package only exists as a pre-release (beta/rc/alpha), note it explicitly. -->
<!-- Using --legacy-peer-deps or --force to install is a RED FLAG — document why. -->

| Dependency | Version | Verified | Peer Conflicts | Purpose | Risk if Unavailable |
|------------|---------|----------|----------------|---------|---------------------|
| [library/service] | [exact version] | [ ] | [conflicts with X, needs --legacy-peer-deps] or None | [why needed] | [impact] |

### 5.4 Compatibility Notes

<!-- Required when using 3+ major dependencies that must interoperate. -->
<!-- Document known conflicts BEFORE implementation begins, not after install fails. -->

| Package A | Package B | Conflict | Resolution | Verified |
|-----------|-----------|----------|------------|----------|
| [e.g., next@16] | [e.g., next-auth@5-beta] | [peer dep mismatch on react] | [--legacy-peer-deps / pin react@19] | [ ] |

### 5.5 Directory Structure

<!-- Required for file-system-routed frameworks (Next.js App Router, Nuxt, SvelteKit, Remix). -->
<!-- The directory structure IS the routing — it's an architectural decision, not an implementation detail. -->
<!-- This prevents the agent from improvising the layout and getting it wrong. -->

```
src/
├── app/
│   ├── (auth)/                    # Auth route group (no layout nesting)
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (portal)/                  # Main app route group
│   │   └── dashboard/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── v1/[resource]/route.ts
│   │   ├── health/route.ts
│   │   └── ready/route.ts
│   ├── layout.tsx                 # Root layout
│   └── page.tsx                   # Landing page
├── lib/                           # Shared server-side utilities
├── components/                    # Shared UI components
└── types/                         # TypeScript type definitions
```

<!-- Adapt the tree above to match your actual project. Delete this comment block when done. -->

### 5.6 Integration Points

<!-- External systems, APIs, services this feature connects to -->

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| [system] | [API/Event/File] | [why] | [team/person] |

### 5.7 Environment Variables

<!-- List ALL env vars the project needs. This is the source of truth for .env.example generation. -->
<!-- /generate auto uses this table to create .env.example and auto-fill secrets during /forge. -->
<!-- Generation Method tells the agent HOW to produce each value: -->
<!--   /generate ...  = auto-generated by SkillFoundry (no user input needed) -->
<!--   Manual         = user must provide (API keys, passwords, external service credentials) -->
<!--   Derived        = computed from other vars or project config (e.g., NEXTAUTH_URL from domain) -->

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| DATABASE_URL | `postgresql://app_user:pass@localhost:5432/mydb` | Manual | Yes | App user with limited privileges |
| NEXTAUTH_SECRET | base64, 32 bytes | `/generate secret --length 32 --encoding base64` | Yes | Session encryption |
| NEXTAUTH_PRIVATE_KEY | RS256 PEM (newlines escaped as `\n`) | `/generate keypair --alg RS256` | Yes | JWT signing |
| EMAIL_SERVER_PASSWORD | — | Manual (provider app password) | Yes | Never use account password |
| NODE_ENV | `production` | Derived | Yes | Set per environment |

<!-- Replace the examples above with your actual project variables. -->

### 5.8 Deployment Environment

<!-- Specify the target deployment infrastructure so the agent doesn't improvise it at runtime. -->
<!-- Every item here prevents a "works locally, broken in production" failure. -->

#### Infrastructure

| Aspect | Specification | Notes |
|--------|--------------|-------|
| **Port allocation** | [portman / manual / dynamic] | If portman: `portman assign <app>`. If manual: specify exact port. Never hardcode 3000 without checking. |
| **Process manager** | [PM2 / systemd / Docker / none] | Include ecosystem.config.js pattern if PM2 |
| **Reverse proxy** | [nginx / Caddy / Cloudflare / none] | Specify upstream port and proxy headers needed |
| **SSL/TLS** | [certbot + webroot / Cloudflare origin cert / self-signed / none] | Include domain and cert renewal method |
| **Domain** | [exact domain] | Must match NEXTAUTH_URL / CORS origins |
| **CDN** | [Cloudflare / none] | If Cloudflare: note cache purge needed after deploys |

#### Build & Deploy Commands

<!-- The exact sequence to go from code to running production. No improvisation. -->

```bash
# Build
npm run build

# Post-build steps (framework-specific)
# Example: Next.js standalone requires copying static assets
cp -r .next/static .next/standalone/<app-path>/.next/static
cp -r public .next/standalone/<app-path>/public

# Start
pm2 start ecosystem.config.js
# OR: systemctl restart <service>
# OR: docker compose up -d --build

# Verify
curl -sf http://localhost:<port>/api/health
```

#### Known Deployment Quirks

<!-- CRITICAL: List framework-specific gotchas that will break production if not handled. -->
<!-- These save hours of debugging. Add any quirk discovered during development. -->

| Framework / Library | Quirk | Fix |
|--------------------|----|-----|
| [e.g., Next.js standalone] | [`.next/static/` and `public/` not included in standalone output] | [Copy after build: `cp -r .next/static .next/standalone/...`] |
| [e.g., NextAuth v5 beta] | [`trustHost: true` required behind reverse proxy] | [Add to NextAuth config or set `AUTH_TRUST_HOST=true`] |
| [e.g., NextAuth v5 beta] | [Credentials login: 5 of 6 approaches fail. Default redirect, fetch(), native form POST, getCsrfToken() all broken.] | [`signIn("credentials", { redirect: false, email, password })` + manual `window.location.href` + `SessionProvider`. Playwright-verified.] |
| [e.g., NextAuth v5 + Next.js 16] | [Middleware: `getToken()` can't decrypt JWE tokens, `auth()` wrapper crashes (Prisma/pg not edge-compatible)] | [Check cookie existence only (`__Secure-authjs.session-token`). Let server-side `auth()` validate.] |
| [e.g., Next.js 16 standalone] | [Incremental builds leave stale server chunks → `InvariantError: client reference manifest`] | [Always `rm -rf .next` before `npm run build`. Never incremental.] |
| [e.g., Prisma 7] | [Adapter required everywhere — including seed scripts] | [Use shared prisma client that includes adapter, not `new PrismaClient()`] |
| [e.g., Browser fetch API] | [`fetch()` silently drops `set-cookie` from 302 redirect responses — session cookies never get set] | [Use native `<form method="POST" action="...">` for auth flows, not `fetch()` with `redirect: "follow"`] |

<!-- Delete example rows and replace with your project's actual quirks. -->

---

## 6. Contract Specification (Required for API Features)

<!-- This section MUST be completed and FROZEN before backend implementation begins -->
<!-- Contract freeze = no changes without explicit approval and version bump -->

### 6.1 Entity Cards

<!-- One card per domain entity. This is the single source of truth for entity structure. -->

**Entity: [EntityName]**
| Attribute | Value |
|-----------|-------|
| **Name** | [Exact name as used in code - no synonyms allowed] |
| **Purpose** | [Single sentence: why this entity exists] |
| **Owner** | [Team/service responsible] |
| **Key Fields** | [List primary fields with exact names] |
| **Derived Fields** | [Computed/calculated fields] |
| **Sensitive Fields** | [PII, credentials, financial - requires encryption/masking] |
| **Retention** | [How long data is kept, deletion policy] |
| **Audit** | [yes/no - whether changes are logged] |
| **Data Ownership** | [Column that scopes rows to owner: user_id, tenant_id, org_id — or "system" if globally shared] |
| **Access Scope** | [own = user sees only their rows / tenant = user sees org rows / global = all rows visible / hierarchical = user sees self + subordinates] |

### 6.2 State Transitions

<!-- Required for any entity with a status/state field -->
<!-- Backend MUST enforce these transitions - UI cannot bypass -->

**Entity: [EntityName]**

```
[Draft] → [Submitted] → [Approved] → [Archived]
              ↓
         [Rejected]
```

| Current State | Action | Next State | Who Can Trigger | Validations | Side Effects |
|---------------|--------|------------|-----------------|-------------|--------------|
| Draft | Submit | Submitted | Author, Admin | Has required fields | Notify reviewers |
| Submitted | Approve | Approved | Reviewer, Admin | Review completed | Notify author |
| Submitted | Reject | Rejected | Reviewer, Admin | Reason provided | Notify author |
| Approved | Archive | Archived | Admin | None | None |
| Rejected | Resubmit | Submitted | Author | Issues addressed | Reset review |

**Invalid Transitions (must fail explicitly):**
- Draft → Approved (cannot skip review)
- Archived → any state (terminal state)
- Rejected → Approved (must go through Submitted)

### 6.3 Permissions Matrix

<!-- Who can do what. Backend MUST enforce - UI only hides/disables. -->

| Action | Admin | Manager | User | Guest | Data Scope | Notes |
|--------|-------|---------|------|-------|------------|-------|
| Create | ✅ | ✅ | ✅ | ❌ | own | |
| Read (own) | ✅ | ✅ | ✅ | ❌ | `WHERE owner_id = :userId` | |
| Read (all) | ✅ | ✅ | ❌ | ❌ | unscoped | |
| Update (own) | ✅ | ✅ | ✅ | ❌ | `WHERE owner_id = :userId` | Only in Draft state |
| Update (any) | ✅ | ✅ | ❌ | ❌ | unscoped | |
| Delete | ✅ | ❌ | ❌ | ❌ | `WHERE owner_id = :userId` | Soft delete only |
| Approve | ✅ | ✅ | ❌ | ❌ | unscoped | Cannot approve own |

### 6.4 API Contract

<!-- This is the FROZEN contract. Implementation must match EXACTLY. -->
<!-- Generate clients/types from this - single source of truth. -->

#### Standard Response Wrapper
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  },
  "correlationId": "uuid-here"
}
```

#### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human readable message",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  },
  "correlationId": "uuid-here"
}
```

#### Endpoints

**`GET /api/v1/[resource]`** - List resources
| Aspect | Specification |
|--------|---------------|
| Auth | JWT required |
| Data Scope | `WHERE owner_id = :currentUser` (unless admin) |
| Query Params | `page`, `pageSize` (max: 100, default: 20), `sort`, `filter` |
| Success | `200` with wrapped array |
| Errors | `401` Unauthorized, `403` Forbidden |
| Rate Limit | [X requests/minute], `429` + `Retry-After` header |

**Request Example:**
```http
GET /api/v1/resource?page=1&pageSize=20&sort=-createdAt
Authorization: Bearer <token>
```

**Response Example (Success):**
```json
{
  "data": [
    { "id": "uuid-1", "name": "Example", "status": "active" }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1 },
  "correlationId": "abc-123"
}
```

**`POST /api/v1/[resource]`** - Create resource
| Aspect | Specification |
|--------|---------------|
| Auth | JWT required |
| Headers | `Idempotency-Key` (recommended for non-idempotent ops) |
| Body | See request example (all fields have max length/size) |
| Success | `201` with created resource |
| Errors | `400` Validation, `401` Unauthorized, `409` Conflict/Idempotency |
| Rate Limit | [X requests/minute], `429` + `Retry-After` header |

**Request Example:**
```json
{
  "name": "New Resource",
  "description": "Optional description"
}
```

**Response Example (Success):**
```json
{
  "data": { "id": "uuid-new", "name": "New Resource", "status": "draft" },
  "correlationId": "abc-124"
}
```

**Response Example (Validation Error):**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [
      { "field": "name", "message": "Name is required" }
    ]
  },
  "correlationId": "abc-125"
}
```

### 6.5 Error Codes

<!-- Stable error codes. Do not change once shipped. -->

| Code | HTTP Status | Meaning | When Used |
|------|-------------|---------|-----------|
| `VALIDATION_FAILED` | 400 | Request body invalid | Missing/invalid fields |
| `UNAUTHORIZED` | 401 | No valid auth token | Missing/expired JWT |
| `FORBIDDEN` | 403 | Valid token, no permission | RBAC check failed |
| `NOT_FOUND` | 404 | Resource doesn't exist | Invalid ID |
| `CONFLICT` | 409 | Duplicate or state conflict | Unique constraint, invalid transition |
| `INVALID_STATE_TRANSITION` | 422 | State change not allowed | Violates state machine |
| `VERSION_CONFLICT` | 409 | Resource modified by another user | ETag/version mismatch (optimistic lock) |
| `IDEMPOTENCY_CONFLICT` | 409 | Duplicate request with different body | Idempotency-Key reused with changed payload |
| `RATE_LIMITED` | 429 | Too many requests | Rate limit exceeded (include Retry-After) |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds limit | File upload or body size exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Unhandled exception (never expose details) |

### 6.6 UI States Specification

<!-- Every screen must handle all these states. No exceptions. -->

| State | When | UI Behavior |
|-------|------|-------------|
| Loading | Data being fetched | Skeleton/spinner, no interaction |
| Empty | No data exists | Empty state message + CTA |
| Error | Request failed | Error message + retry button |
| No Permission | User can't access | Permission denied message |
| Success | Data loaded | Display data |
| Submitting | Form being submitted | Disable inputs, show spinner |
| Confirmation | Destructive action | Modal with confirm/cancel |

### 6.7 Data Isolation Specification

<!-- Required for any entity with Data Ownership != "system" in entity card -->
<!-- Backend MUST enforce scoping — frontend filtering is NOT sufficient -->

#### Query Scope Rules

| Entity | Ownership Column | Default Scope | Unscoped Access |
|--------|-----------------|---------------|-----------------|
| [EntityName] | [user_id/tenant_id/org_id] | `WHERE [column] = :currentUser` | [Admin only / Never / Specific endpoint] |

#### Isolation Enforcement Rules

- **Every SELECT** on a scoped entity MUST include the ownership column in the WHERE clause
- **ORM/Repository layer** must enforce scoping by default (opt-out for admin, never opt-out silently)
- **API list endpoints** must scope to the authenticated user/tenant unless the role explicitly permits unscoped access per the Permissions Matrix
- **JOIN queries** must not leak rows from scoped tables through unscoped joins
- **Bulk operations** (export, report, batch update) must respect the same scope rules

#### Cross-Tenant Isolation (if multi-tenant)

- Tenant ID must be derived from the authenticated session, never from request parameters
- Queries must never allow a user to specify another tenant's ID
- Database-level Row Level Security (RLS) is recommended as defense-in-depth

#### Mandatory Test Cases

| Test | Expected Result |
|------|-----------------|
| User A queries list endpoint | Returns only User A's rows |
| User A requests User B's resource by ID | Returns 404 (not 403, to avoid enumeration) |
| Admin queries list endpoint | Returns all rows (if permitted by Permissions Matrix) |
| API call with tampered tenant/user ID in body | Ignored — scope derived from auth token |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

<!-- Hard limits that cannot be negotiated -->

- **Technical:** [e.g., must use existing database, no new infrastructure]
- **Business:** [e.g., must comply with GDPR, must work with existing auth]
- **Resource:** [e.g., single developer, limited budget]

### 7.2 Assumptions

<!-- Things we believe to be true but haven't verified -->

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| [assumption] | [impact] | [how to reduce risk] |

### 7.3 Out of Scope

<!-- Explicitly excluded from this PRD - prevents scope creep -->

- [ ] [Feature/capability explicitly NOT included]
- [ ] [Another exclusion]
- [ ] [Another exclusion]

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | [risk description] | H/M/L | H/M/L | [how to prevent/handle] |
| R-002 | [risk description] | H/M/L | H/M/L | [how to prevent/handle] |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | MVP | [minimal viable scope] | None |
| 2 | Enhancement | [additional features] | Phase 1 complete |
| 3 | Polish | [refinements, edge cases] | Phase 2 complete |

### 9.2 Effort Estimate

<!-- T-shirt sizing only - NO time estimates -->

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | S/M/L/XL | Low/Med/High | Low/Med/High |
| 2 | S/M/L/XL | Low/Med/High | Low/Med/High |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] All functional requirements pass acceptance criteria
- [ ] Unit test coverage >= 80% for business logic
- [ ] Integration tests for all API endpoints
- [ ] Browser-level auth flow verified (login/logout/protected routes — curl is NOT sufficient)
- [ ] Security review completed (if applicable)
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] No critical/high severity bugs open

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | [name] | Pending | |
| Product Owner | [name] | Pending | |
| Security | [name] | Pending | |

---

## 11. Appendix

### 11.1 Glossary

<!-- CRITICAL: This is the naming authority. Field names in code MUST match exactly. -->
<!-- No synonyms allowed. If glossary says "userId", never use "user_id" or "uid". -->

| Term | Definition | Code Name |
|------|------------|-----------|
| [term] | [definition] | [exact_field_name] |

### 11.2 References

- [Link to related documentation]
- [Link to design mockups]
- [Link to technical specs]

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [date] | [author] | Initial draft |

---

<!--
PRD CHECKLIST (remove before finalizing):

COMPLETENESS:
[ ] Problem clearly stated with measurable impact
[ ] All user stories have acceptance criteria
[ ] Security requirements defined (auth, rate limits, input limits, CORS, session lifecycle)
[ ] Observability requirements defined (logging, health checks, monitoring)
[ ] Out of scope explicitly listed
[ ] Risks identified with mitigations

CLARITY:
[ ] No TBD or TODO markers remain
[ ] No vague language ("might", "maybe", "possibly")
[ ] All acronyms defined in glossary
[ ] Examples provided for complex requirements

CONTRACT SPECIFICATION (Required for API features):
[ ] Entity cards completed for all domain entities
[ ] State transitions documented (if entity has status field)
[ ] Permissions matrix completed
[ ] API endpoints with request/response examples
[ ] Error codes defined and stable (including VERSION_CONFLICT, RATE_LIMITED)
[ ] Pagination defined with max pageSize cap
[ ] Rate limits defined per endpoint
[ ] Concurrent modification strategy defined (ETag/version)
[ ] UI states specified (loading, empty, error, success)
[ ] Data isolation specified (ownership column, scope rules, test cases)
[ ] Glossary includes all field names with exact code names

CONTRACT FREEZE GATE:
[ ] Contract section reviewed and approved
[ ] No TBD in contract specification
[ ] Examples are concrete (not placeholders)
[ ] Ready to generate clients/types from contract

READY FOR IMPLEMENTATION:
[ ] Technology maturity assessed in §5.0 (Beta deps → Playwright mandatory in TEMPER)
[ ] Technical dependencies identified
[ ] All dependency versions verified (npm view / pip index — no unverified versions)
[ ] Peer dependency conflicts documented in §5.4 (or confirmed "None")
[ ] Directory structure specified in §5.5 (required for file-system-routed frameworks)
[ ] Environment variables listed in §5.7 with generation methods (/generate auto or Manual)
[ ] Deployment environment specified in §5.8 (port, process manager, proxy, SSL, domain, known quirks)
[ ] Data model defined
[ ] API contracts specified and FROZEN
[ ] Phases broken down appropriately
-->

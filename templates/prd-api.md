# PRD: {{PROJECT_NAME}}

---
prd_id: {{PROJECT_NAME_KEBAB}}
title: {{PROJECT_NAME}}
version: 1.0
status: DRAFT
created: {{DATE}}
author: Quick Start Wizard
last_updated: {{DATE}}

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [api, backend]
priority: high
layers: [database, backend]
---

---

## 1. Overview

### 1.1 Problem Statement

{{PROJECT_DESC}}

### 1.2 Proposed Solution

Build a RESTful API service with secure authentication, input validation, rate limiting, and comprehensive error handling. No frontend - API-only service consumed by external clients.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Feature completeness | 0% | 100% | All endpoints implemented |
| Test coverage | 0% | 80%+ | Automated test suite |
| API P95 latency | N/A | < 500ms | Backend metrics |
| Error rate | N/A | < 1% | Monitoring dashboard |

---

## 2. User Stories

### Primary User: API Consumer (Developer)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | authenticate with API credentials | I can access protected endpoints | MUST |
| US-002 | developer | list, create, read, update, delete resources via REST | I can integrate with the API | MUST |
| US-003 | developer | receive consistent error responses | I can handle errors predictably | MUST |
| US-004 | developer | paginate and filter large result sets | I can retrieve data efficiently | MUST |
| US-005 | developer | read OpenAPI/Swagger documentation | I can understand the API contract | SHOULD |
| US-006 | developer | receive rate limit headers | I know my usage limits | SHOULD |

### Secondary User: Administrator

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | admin | manage API keys and permissions | I can control access | MUST |
| US-011 | admin | view API usage metrics | I can monitor consumption | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Authentication | JWT-based auth with API key support | Given valid API key, When requesting token, Then JWT is issued |
| FR-002 | CRUD Endpoints | RESTful CRUD for all resources | Given valid request, When calling endpoint, Then correct HTTP status and response |
| FR-003 | Pagination | Cursor or offset-based pagination | Given large dataset, When listing with page params, Then paginated response returned |
| FR-004 | Filtering & Sorting | Query parameter-based filtering | Given filter params, When listing, Then filtered results returned |
| FR-005 | Rate Limiting | Per-client rate limiting | Given exceeded limit, When requesting, Then 429 returned with Retry-After |
| FR-006 | API Documentation | Auto-generated OpenAPI spec | Given /docs endpoint, When accessed, Then Swagger UI renders |

### 3.2 API Requirements

| Endpoint | Method | Purpose | Auth | Request Body | Response |
|----------|--------|---------|------|--------------|----------|
| `/auth/token` | POST | Get access token | API Key | `{ api_key, api_secret }` | `{ access_token, expires_in }` |
| `/api/v1/resources` | GET | List resources | JWT | N/A | `{ data: [...], meta: { page, total } }` |
| `/api/v1/resources` | POST | Create resource | JWT | `{ ...fields }` | `201 { data: { id, ... } }` |
| `/api/v1/resources/:id` | GET | Get resource | JWT | N/A | `{ data: { ... } }` |
| `/api/v1/resources/:id` | PUT | Update resource | JWT | `{ ...fields }` | `{ data: { ... } }` |
| `/api/v1/resources/:id` | DELETE | Delete resource | JWT | N/A | `204 No Content` |
| `/health` | GET | Health check | None | N/A | `{ status, version, uptime }` |
| `/metrics` | GET | Prometheus metrics | Internal | N/A | Prometheus text format |
| `/docs` | GET | OpenAPI UI | None | N/A | Swagger UI HTML |

### Standard Response Wrapper

```json
{
  "data": { ... },
  "meta": { "page": 1, "pageSize": 20, "total": 100 },
  "correlationId": "uuid"
}
```

### Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "Invalid format" }]
  },
  "correlationId": "uuid"
}
```

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| API P50 Latency | < 100ms |
| API P95 Latency | < 500ms |
| API P99 Latency | < 1s |
| Throughput | > 1000 RPS |
| Database Query Time | < 50ms average |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | JWT with RS256 algorithm |
| Authorization | Scope-based permissions on all endpoints |
| Input Validation | Strict schema validation, parameterized queries |
| Rate Limiting | Per-client: 100/min default, configurable per API key |
| Headers | CORS, CSP, HSTS, X-Content-Type-Options |
| Logging | Structured JSON, no PII in logs |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99.9% |
| Recovery Time Objective | 5 minutes |
| Recovery Point Objective | 1 hour |
| Backup Strategy | Daily automated, 30-day retention |

---

## 5. Technical Specifications

### 5.1 Architecture

```
Client --> Load Balancer --> API Server --> Database
                                 |
                              Cache (Redis)
```

### 5.2 Data Model

**Entity: Resource**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Resource name |
| status | ENUM | NOT NULL, DEFAULT 'active' | active, archived |
| owner_id | UUID | FK -> users.id | Resource owner |
| created_at | TIMESTAMP | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL | Last update |
| deleted_at | TIMESTAMP | NULL | Soft delete marker |

### 5.3 Dependencies

<!-- CRITICAL: Verify every version exists before freezing. Run: npm view <pkg> versions --json | tail -5 -->

| Dependency | Version | Verified | Peer Conflicts | Purpose | Risk if Unavailable |
|------------|---------|----------|----------------|---------|---------------------|
| Database (PostgreSQL) | Latest stable | [ ] | None | Data persistence | API non-functional |
| Redis | Latest stable | [ ] | None | Caching, rate limiting | Degraded performance |

### 5.4 Compatibility Notes

| Package A | Package B | Conflict | Resolution | Verified |
|-----------|-----------|----------|------------|----------|

### 5.5 Directory Structure

<!-- Required for file-system-routed frameworks. Adapt or remove if not applicable. -->

```
src/
├── routes/                        # API route handlers
├── middleware/                     # Auth, validation, rate limiting
├── services/                      # Business logic
├── models/                        # Database models / entities
├── lib/                           # Shared utilities
└── types/                         # TypeScript type definitions
```

### 5.6 Environment Variables

<!-- Source of truth for .env.example. /generate auto uses this to create secrets. -->

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| DATABASE_URL | `postgresql://app_user:pass@localhost:5432/mydb` | Manual | Yes | App user |
| JWT_SECRET | hex, 64 chars | `/generate secret --length 64 --encoding hex` | Yes | Token signing |
| REDIS_URL | `redis://localhost:6379` | Manual | No | Caching / rate limiting |
| PORT | `3000` | Derived | Yes | |

---

## 6. Constraints & Assumptions

### 6.1 Constraints
- **Technical:** Backend-only, no frontend UI (API docs via Swagger only)
- **Security:** All endpoints require authentication except /health, /docs

### 6.2 Out of Scope
- [ ] Frontend UI / admin dashboard
- [ ] WebSocket or real-time streaming
- [ ] File upload / media handling
- [ ] GraphQL endpoint
- [ ] Multi-tenant data isolation

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Breaking API changes for consumers | M | H | API versioning, deprecation headers |
| R-002 | Database bottleneck under load | M | M | Connection pooling, query optimization, caching |
| R-003 | Rate limiting bypass | L | H | Multiple rate limit layers, abuse detection |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Database & Auth | Schema, migrations, auth endpoints | None |
| 2 | Core CRUD | Resource endpoints, validation, pagination | Phase 1 |
| 3 | Hardening | Rate limiting, caching, monitoring, docs | Phase 2 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Med | Med |
| 2 | M | Med | Low |
| 3 | M | Med | Low |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] All endpoints tested with integration tests (100% hit rate)
- [ ] Unit test coverage >= 80% for business logic
- [ ] Security review completed
- [ ] OpenAPI documentation generated and accurate
- [ ] Rate limiting tested and verified
- [ ] Load testing passed (>1000 RPS target)
- [ ] No critical/high severity bugs open
- [ ] Three-layer validation passed (`/layer-check db` + `/layer-check backend`)

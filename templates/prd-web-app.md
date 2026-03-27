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

tags: [web-app, fullstack]
priority: high
layers: [database, backend, frontend]
---

---

## 1. Overview

### 1.1 Problem Statement

{{PROJECT_DESC}}

### 1.2 Proposed Solution

Build a full-stack web application with a modern frontend, secure API backend, and persistent database storage. The application will include user authentication, role-based access control, and a responsive UI.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Feature completeness | 0% | 100% | All user stories implemented |
| Test coverage | 0% | 80%+ | Automated test suite |
| Page load time | N/A | < 2.5s LCP | Lighthouse CI |
| API response time | N/A | < 500ms P95 | Backend metrics |

---

## 2. User Stories

### Primary User: End User

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | user | register an account with email and password | I can access the application | MUST |
| US-002 | user | log in and log out securely | my account is protected | MUST |
| US-003 | user | view a dashboard after login | I can see relevant information at a glance | MUST |
| US-004 | user | create, read, update, and delete my resources | I can manage my data | MUST |
| US-005 | user | receive clear error messages | I know what went wrong and how to fix it | SHOULD |
| US-006 | user | use the app on mobile and desktop | I can work from any device | SHOULD |

### Secondary User: Administrator

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | admin | manage user accounts | I can control access | MUST |
| US-011 | admin | view system health metrics | I can monitor the application | SHOULD |
| US-012 | admin | export data as CSV/PDF | I can generate reports | COULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | User Authentication | Secure registration, login, logout with JWT | Given valid credentials, When user logs in, Then JWT is issued and stored securely |
| FR-002 | CRUD Operations | Full create, read, update, delete for primary resource | Given authenticated user, When performing CRUD, Then data is persisted and UI updates |
| FR-003 | Dashboard | Overview page with KPIs and summaries | Given authenticated user, When visiting dashboard, Then relevant metrics are displayed |
| FR-004 | Role-Based Access | Admin and user roles with permission enforcement | Given non-admin user, When accessing admin routes, Then 403 is returned |
| FR-005 | Responsive UI | Mobile-first responsive design | Given any screen size, When viewing app, Then UI adapts properly |

### 3.2 User Interface Requirements

**Screen: Login/Register**
- Purpose: User authentication entry point
- Key elements: Email field, password field, submit button, toggle between login/register
- User flow: Landing page -> Login -> Dashboard

**Screen: Dashboard**
- Purpose: Overview of user's data and system status
- Key elements: Summary cards, recent activity list, quick actions
- User flow: Login -> Dashboard -> Detail views

**Screen: Resource Management**
- Purpose: CRUD operations on primary resource
- Key elements: Data table, create form, edit modal, delete confirmation
- User flow: Dashboard -> Resource list -> Create/Edit/Delete

### 3.3 API Requirements

| Endpoint | Method | Purpose | Auth | Request Body | Response |
|----------|--------|---------|------|--------------|----------|
| `/auth/register` | POST | User registration | None | `{ email, password }` | `{ user, token }` |
| `/auth/login` | POST | User login | None | `{ email, password }` | `{ user, token }` |
| `/auth/logout` | POST | User logout | JWT | N/A | `{ success: true }` |
| `/me` | GET | Current user profile | JWT | N/A | `{ user }` |
| `/api/v1/resources` | GET | List resources | JWT | N/A | `{ data: [...], meta }` |
| `/api/v1/resources` | POST | Create resource | JWT | `{ ...fields }` | `{ data: { id, ... } }` |
| `/api/v1/resources/:id` | GET | Get resource | JWT | N/A | `{ data: { ... } }` |
| `/api/v1/resources/:id` | PUT | Update resource | JWT | `{ ...fields }` | `{ data: { ... } }` |
| `/api/v1/resources/:id` | DELETE | Delete resource | JWT | N/A | `{ success: true }` |
| `/admin/users` | GET | List users (admin) | JWT+Admin | N/A | `{ data: [...] }` |
| `/health` | GET | Health check | None | N/A | `{ status: "ok" }` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| API Response Time | < 500ms (95th percentile) |
| Largest Contentful Paint | < 2.5s |
| First Input Delay | < 100ms |
| Total Bundle Size | < 200KB gzipped |
| Database Query Time | < 50ms average |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | JWT with RS256, access token in memory, refresh token in HttpOnly cookie |
| Authorization | RBAC (Admin, User roles), enforced server-side |
| Data Protection | HTTPS-only, passwords hashed with bcrypt/argon2, PII encryption at rest |
| Input Validation | Server-side validation on all endpoints, parameterized queries |
| Headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| Rate Limiting | Auth endpoints: 5/min, API endpoints: 100/min |

### 4.3 Scalability

Horizontal scaling via stateless API servers. Database connection pooling. Redis for session/cache if needed.

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99.9% |
| Recovery Time Objective | 15 minutes |
| Recovery Point Objective | 1 hour |
| Backup Strategy | Daily automated, 30-day retention |

---

## 5. Technical Specifications

### 5.1 Architecture

```
Frontend (SPA) --> API Gateway --> Backend API --> Database
                                       |
                                    Cache (Redis)
```

### 5.2 Data Model

**Entity: User**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User email |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt/Argon2 hash |
| role | ENUM | NOT NULL, DEFAULT 'user' | user, admin |
| created_at | TIMESTAMP | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL | Last update timestamp |
| deleted_at | TIMESTAMP | NULL | Soft delete marker |

### 5.3 Dependencies

<!-- CRITICAL: Verify every version exists before freezing. Run: npm view <pkg> versions --json | tail -5 -->

| Dependency | Version | Verified | Peer Conflicts | Purpose | Risk if Unavailable |
|------------|---------|----------|----------------|---------|---------------------|
| Database (PostgreSQL/SQLite) | Latest stable | [ ] | None | Data persistence | App non-functional |
| JWT library | Latest stable | [ ] | None | Authentication | Auth non-functional |

### 5.4 Compatibility Notes

| Package A | Package B | Conflict | Resolution | Verified |
|-----------|-----------|----------|------------|----------|

### 5.5 Directory Structure

<!-- Required for file-system-routed frameworks (Next.js App Router, Nuxt, SvelteKit, Remix). -->
<!-- The directory structure IS the routing — adapt this tree to your project. -->

```
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (portal)/dashboard/page.tsx
│   ├── api/health/route.ts
│   ├── layout.tsx
│   └── page.tsx
├── lib/
├── components/
└── types/
```

### 5.6 Environment Variables

<!-- Source of truth for .env.example. /generate auto uses this to create secrets. -->

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| DATABASE_URL | `postgresql://app_user:pass@localhost:5432/mydb` | Manual | Yes | App user |
| NEXTAUTH_SECRET | base64, 32 bytes | `/generate secret --length 32 --encoding base64` | Yes | Session encryption |
| NEXTAUTH_PRIVATE_KEY | RS256 PEM | `/generate keypair --alg RS256` | Yes | JWT signing |
| NODE_ENV | `production` | Derived | Yes | |

### 5.8 Deployment Environment

| Aspect | Specification | Notes |
|--------|--------------|-------|
| **Port allocation** | [portman / manual] | `portman assign <app>` or specify exact port |
| **Process manager** | PM2 (cluster mode) | ecosystem.config.js in project root |
| **Reverse proxy** | nginx | Proxy to localhost:\<port\>, security headers, static asset caching |
| **SSL/TLS** | certbot + webroot | Domain must be configured before cert request |
| **Domain** | [exact domain] | Must match NEXTAUTH_URL |

**Known Deployment Quirks:**
| Framework | Quirk | Fix |
|-----------|-------|-----|
| Next.js standalone | `.next/static/` and `public/` not in output | Copy after build |
| NextAuth v5 beta | `trustHost: true` required behind proxy | Add to NextAuth config |
| Browser fetch API | `fetch()` drops `set-cookie` from 302 redirects | Use native `<form>` POST for auth, not `fetch()` |

---

## 6. Constraints & Assumptions

### 6.1 Constraints
- **Technical:** Must follow BPSBS standards (no TODOs, no mocks, three-layer validation)
- **Security:** Must comply with OWASP Top 10 mitigations

### 6.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Users have modern browsers | Broken UI | Progressive enhancement |
| Single database is sufficient | Performance bottleneck | Connection pooling, read replicas |

### 6.3 Out of Scope
- [ ] Mobile native application
- [ ] Third-party OAuth providers (Google, GitHub login)
- [ ] Real-time WebSocket features
- [ ] Multi-tenant architecture
- [ ] Internationalization (i18n)

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Security vulnerability in auth flow | M | H | Security review, penetration testing |
| R-002 | Performance degradation under load | M | M | Load testing, caching strategy |
| R-003 | Scope creep in UI features | H | M | Strict adherence to PRD |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Database & Auth | Schema, migrations, auth endpoints, JWT | None |
| 2 | Core API | CRUD endpoints, validation, error handling | Phase 1 |
| 3 | Frontend | UI components, API integration, routing | Phase 2 |
| 4 | Admin & Polish | Admin panel, responsive design, testing | Phase 3 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Med | Med |
| 2 | M | Med | Low |
| 3 | L | Med | Med |
| 4 | M | Low | Low |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] All API endpoints tested with integration tests
- [ ] Unit test coverage >= 80% for business logic
- [ ] Security review completed (no OWASP Top 10 violations)
- [ ] Responsive design verified on mobile and desktop
- [ ] Documentation updated (README, API reference)
- [ ] No critical/high severity bugs open
- [ ] Three-layer validation passed (`/layer-check`)

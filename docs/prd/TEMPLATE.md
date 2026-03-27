# PRD: [Feature Name]

**Version:** 1.0
**Status:** DRAFT
**Created:** [YYYY-MM-DD]
**Author:** [Your Name] + PRD Architect
**Last Updated:** [YYYY-MM-DD]

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
| Input Validation | [sanitization requirements] |

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

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

<!-- MANDATORY: Evaluate every dependency BEFORE implementation. Determines verification level. -->

| Maturity | Definition | Verification Level |
|----------|-----------|-------------------|
| **Stable** | GA, no breaking changes 6+ months | Build + curl + unit tests |
| **Recent Major** | GA but breaking from prior version | Build + integration + migration test |
| **Beta** | API unstable, may change between patches | **Playwright/browser mandatory** |
| **Alpha** | Not production-ready | **Playwright mandatory + human sign-off** |

#### Stack Assessment

| Dependency | Version | Maturity | Breaking From Prior | Known Quirks in KB | Verification Required |
|-----------|---------|----------|-------------------|-------------------|----------------------|
| [dependency] | [version] | [Stable/Beta/Alpha] | [what changed] | [N quirks or 0 — uncharted] | [Build+curl / **Playwright**] |

#### Risk Decision (Beta/Alpha deps only)

| Beta Dependency | Stable Alternative | Blast Radius | Justification |
|----------------|-------------------|-------------|---------------|
| [dep] | [alternative] | [Critical/Medium/Low] | [why beta over stable] |

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
<!-- Generation Method: /generate ... = auto-generated | Manual = user provides | Derived = computed -->

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

#### Infrastructure

| Aspect | Specification | Notes |
|--------|--------------|-------|
| **Port allocation** | [portman / manual / dynamic] | If portman: `portman assign <app>`. Never hardcode 3000 without checking. |
| **Process manager** | [PM2 / systemd / Docker / none] | Include ecosystem.config.js pattern if PM2 |
| **Reverse proxy** | [nginx / Caddy / Cloudflare / none] | Specify upstream port and proxy headers |
| **SSL/TLS** | [certbot + webroot / Cloudflare origin cert / none] | Include domain and renewal method |
| **Domain** | [exact domain] | Must match NEXTAUTH_URL / CORS origins |
| **CDN** | [Cloudflare / none] | Note cache purge needed after deploys |

#### Build & Deploy Commands

```bash
# Build
npm run build

# Post-build steps (framework-specific, e.g., Next.js standalone static copy)
cp -r .next/static .next/standalone/<app-path>/.next/static
cp -r public .next/standalone/<app-path>/public

# Start
pm2 start ecosystem.config.js

# Verify
curl -sf http://localhost:<port>/api/health
```

#### Known Deployment Quirks

<!-- Framework-specific gotchas that will break production if not handled. -->

| Framework / Library | Quirk | Fix |
|--------------------|----|-----|
| [e.g., Next.js standalone] | [`.next/static/` not in standalone output] | [Copy after build] |
| [e.g., NextAuth v5 beta] | [`trustHost: true` required behind reverse proxy] | [Add to NextAuth config] |
| [e.g., NextAuth v5 beta] | [Credentials login: 5 of 6 approaches fail silently] | [`signIn("credentials", { redirect: false, ...fields })` + manual redirect + `SessionProvider`] |
| [e.g., NextAuth v5 + Next.js 16] | [Middleware: `getToken()` and `auth()` both fail in edge runtime] | [Check cookie existence only, validate server-side] |
| [e.g., Next.js 16 standalone] | [Stale server chunks on incremental builds → 500 errors] | [Always `rm -rf .next` before build] |
| [e.g., Browser fetch API] | [`fetch()` silently drops `set-cookie` from 302 redirects] | [Use native `<form method="POST">` for auth flows] |
| [e.g., Prisma 7] | [Adapter required everywhere, including seed scripts] | [Use shared client] |

---

## 6. Constraints & Assumptions

### 6.1 Constraints

<!-- Hard limits that cannot be negotiated -->

- **Technical:** [e.g., must use existing database, no new infrastructure]
- **Business:** [e.g., must comply with GDPR, must work with existing auth]
- **Resource:** [e.g., single developer, limited budget]

### 6.2 Assumptions

<!-- Things we believe to be true but haven't verified -->

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| [assumption] | [impact] | [how to reduce risk] |

### 6.3 Out of Scope

<!-- Explicitly excluded from this PRD - prevents scope creep -->

- [ ] [Feature/capability explicitly NOT included]
- [ ] [Another exclusion]
- [ ] [Another exclusion]

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | [risk description] | H/M/L | H/M/L | [how to prevent/handle] |
| R-002 | [risk description] | H/M/L | H/M/L | [how to prevent/handle] |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | MVP | [minimal viable scope] | None |
| 2 | Enhancement | [additional features] | Phase 1 complete |
| 3 | Polish | [refinements, edge cases] | Phase 2 complete |

### 8.2 Effort Estimate

<!-- T-shirt sizing only - NO time estimates -->

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | S/M/L/XL | Low/Med/High | Low/Med/High |
| 2 | S/M/L/XL | Low/Med/High | Low/Med/High |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] All MUST-priority user stories implemented
- [ ] All functional requirements pass acceptance criteria
- [ ] Unit test coverage >= 80% for business logic
- [ ] Integration tests for all API endpoints
- [ ] Browser-level auth flow verified (login/logout/protected routes — curl is NOT sufficient)
- [ ] Security review completed (if applicable)
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] No critical/high severity bugs open

### 9.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | [name] | Pending | |
| Product Owner | [name] | Pending | |
| Security | [name] | Pending | |

---

## 10. Appendix

### 10.1 Glossary

| Term | Definition |
|------|------------|
| [term] | [definition] |

### 10.2 References

- [Link to related documentation]
- [Link to design mockups]
- [Link to technical specs]

### 10.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [date] | [author] | Initial draft |

---

<!--
PRD CHECKLIST (remove before finalizing):

COMPLETENESS:
[ ] Problem clearly stated with measurable impact
[ ] All user stories have acceptance criteria
[ ] Security requirements defined
[ ] Out of scope explicitly listed
[ ] Risks identified with mitigations

CLARITY:
[ ] No TBD or TODO markers remain
[ ] No vague language ("might", "maybe", "possibly")
[ ] All acronyms defined in glossary
[ ] Examples provided for complex requirements

READY FOR IMPLEMENTATION:
[ ] Technology maturity assessed in §5.0 (Beta deps → Playwright mandatory in TEMPER)
[ ] Technical dependencies identified
[ ] All dependency versions verified (npm view / pip index — no unverified versions)
[ ] Peer dependency conflicts documented in §5.4 (or confirmed "None")
[ ] Directory structure specified in §5.5 (required for file-system-routed frameworks)
[ ] Environment variables listed in §5.7 with generation methods (/generate auto or Manual)
[ ] Deployment environment specified in §5.8 (port, process manager, proxy, SSL, domain, known quirks)
[ ] Data model defined
[ ] API contracts specified
[ ] Phases broken down appropriately
-->

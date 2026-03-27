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
[ ] Technical dependencies identified
[ ] All dependency versions verified (npm view / pip index — no unverified versions)
[ ] Peer dependency conflicts documented in §5.4 (or confirmed "None")
[ ] Directory structure specified in §5.5 (required for file-system-routed frameworks)
[ ] Data model defined
[ ] API contracts specified
[ ] Phases broken down appropriately
-->

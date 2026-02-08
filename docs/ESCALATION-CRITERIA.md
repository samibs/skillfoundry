# Escalation Criteria Matrix

**Version:** 1.0.0
**Last Updated:** 2026-02-05
**Purpose:** Define when to auto-fix violations vs. escalate to user

---

## Quick Reference

| Decision Type | Auto-Fix? | Rationale |
|---------------|-----------|-----------|
| **Technical Standards** | ✅ Yes | Deterministic solutions, no trade-offs |
| **Architectural Choices** | ❌ No | Multiple valid approaches, business impact |
| **Business Logic** | ❌ No | Domain expertise required |
| **Security Policy** | ❌ No | Compliance and risk tolerance decisions |

---

## Auto-Fix Categories (No Escalation)

### 1. Code Quality & Standards

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| Missing unit tests | Tester | Standard practice, coverage targets defined |
| Test coverage < 80% | Tester | Measurable threshold, no ambiguity |
| Dead code detected | Refactor | No functional impact, safe removal |
| Code duplication (DRY) | Refactor | Clear anti-pattern, refactor to shared functions |
| Missing documentation | Documentation Codifier | Standard requirement, inferable from code |
| Code style violations | Standards Oracle | Automated formatting rules |
| Linting errors | Standards Oracle | Defined ruleset |

### 2. Security (Routine)

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| Missing security headers | Security Specialist | Standard headers (CSP, X-Frame-Options, etc.) |
| CSRF token missing | Security Specialist | Standard mitigation |
| SQL injection vulnerability | Security Specialist | Parameterized queries (standard fix) |
| XSS vulnerability (output encoding) | Security Specialist | Standard escaping/sanitization |
| Hardcoded secrets detected | Security Specialist | Move to environment variables |
| Dependency vulnerability (patch available) | Dependency Manager | Known CVE, update to patched version |

### 3. Performance

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| N+1 query pattern | Data Architect | Standard optimization (eager loading) |
| Missing database index | Data Architect | Query analysis identifies needed indexes |
| Unoptimized loop | Performance Optimizer | Standard algorithm improvement |
| Memory leak (unclosed resource) | Performance Optimizer | Clear fix (close resources in finally block) |

### 4. Accessibility

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| Missing ARIA labels | Accessibility Specialist | WCAG standards, clear requirements |
| Color contrast violation | Accessibility Specialist | Measurable threshold (WCAG AA/AAA) |
| Keyboard navigation broken | Accessibility Specialist | Standard fix (tabindex, event handlers) |
| Missing alt text on images | Accessibility Specialist | Required by WCAG |

### 5. Internationalization

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| Hardcoded UI strings | i18n Specialist | Move to translation files |
| Missing locale formatting | i18n Specialist | Standard library (Intl.NumberFormat, etc.) |
| Date/time not localized | i18n Specialist | Use locale-aware formatting |

### 6. Infrastructure & Observability

| Violation | Agent | Rationale |
|-----------|-------|-----------|
| Missing health check endpoint | SRE Specialist | Standard practice (/health, /ready) |
| No structured logging | SRE Specialist | JSON logging library integration |
| Missing metrics/tracing | SRE Specialist | OpenTelemetry integration |

---

## Escalation Categories (Require User Input)

### 1. Architectural Decisions

**When to Escalate:**
- Multiple valid approaches with different trade-offs
- Choice affects system architecture significantly
- Decision has long-term implications

| Scenario | Why Escalate | Example |
|----------|--------------|---------|
| **Caching Strategy** | Trade-offs: Redis vs. in-memory vs. CDN | "Use Redis (persistence, shared) or in-memory (faster, isolated)?" |
| **State Management** | Different complexity/capability trade-offs | "Redux (complex, powerful) or Context API (simple, limited)?" |
| **Database Choice** | Different strengths (relational vs. document) | "PostgreSQL (relational) or MongoDB (document)?" |
| **Authentication Method** | Security vs. complexity trade-offs | "Sessions (simple) or JWT (stateless, distributed)?" |
| **API Paradigm** | Different client requirements | "REST (simple) or GraphQL (flexible, complex)?" |

**Escalation Format:**
```markdown
## Architectural Decision Required

**Decision:** [Summary]
**Impact:** [What this affects]

**Option A:** [Approach 1]
- Pros: [benefits]
- Cons: [drawbacks]
- Complexity: [high/medium/low]

**Option B:** [Approach 2]
- Pros: [benefits]
- Cons: [drawbacks]
- Complexity: [high/medium/low]

**Recommendation:** [Agent's suggestion with rationale]

**Your decision:** [A / B / Other]
```

### 2. Business Logic Ambiguities

**When to Escalate:**
- PRD doesn't specify behavior for edge case
- Business rule requires domain knowledge
- Multiple interpretations possible

| Scenario | Why Escalate | Example |
|----------|--------------|---------|
| **Payment Gateway** | Business/cost implications | "Stripe (2.9% fee) or self-hosted (dev cost, PCI compliance)?" |
| **Data Retention** | Compliance/legal requirements | "How long to retain user data after deletion?" |
| **Pricing Logic** | Business model decision | "How to handle proration on plan changes?" |
| **Notification Timing** | User experience preference | "Send email immediately or batch daily?" |
| **Validation Rules** | Domain-specific constraints | "What qualifies as a valid Luxembourg address format?" |

**Escalation Format:**
```markdown
## Business Logic Clarification Required

**Question:** [What needs to be specified]
**Context:** [Background from PRD]
**Impact:** [What depends on this decision]

**Ambiguity:** [What is unclear]

**Suggested Approaches:**
1. [Option 1]
2. [Option 2]

**Your input:** [Answer/clarification]
```

### 3. Security & Compliance Policies

**When to Escalate:**
- Compliance requirements (GDPR, PCI-DSS, HIPAA)
- Risk tolerance decisions
- Security policy choices

| Scenario | Why Escalate | Example |
|----------|--------------|---------|
| **Token Storage** | Security vs. UX trade-off | "Refresh token in httpOnly cookie (secure) or localStorage (convenient)?" |
| **Password Policy** | Security vs. UX trade-off | "Require 2FA for all users or only admins?" |
| **Data Encryption** | Performance vs. security | "Encrypt all database columns or only sensitive fields?" |
| **GDPR Compliance** | Legal interpretation | "Is IP address PII requiring consent?" |
| **Session Timeout** | Security vs. UX | "15 minutes (secure) or 60 minutes (convenient)?" |

**Escalation Format:**
```markdown
## Security/Compliance Decision Required

**Policy Area:** [Authentication/Authorization/Data Protection/etc.]
**Standard/Regulation:** [GDPR/PCI-DSS/OWASP/etc.]

**Decision Needed:** [Summary]

**Security-First Approach:**
- Description: [most secure option]
- Impact: [user experience/performance impact]

**Balanced Approach:**
- Description: [balanced option]
- Trade-offs: [what is compromised]

**Recommendation:** [Agent's suggestion]

**Your decision:** [Chosen approach]
```

### 4. Breaking Changes

**When to Escalate:**
- API changes affecting external consumers
- Database migrations with potential data loss
- Changes to public contracts (interfaces, webhooks)

| Scenario | Why Escalate | Example |
|----------|--------------|---------|
| **API Version** | Impact on external clients | "Breaking change requires new API version (v2)?" |
| **Column Removal** | Potential data loss | "Remove deprecated column (data will be lost)?" |
| **Contract Change** | Integration breakage | "Change webhook payload format?" |

### 5. Domain Expertise Required

**When to Escalate:**
- Tax calculations (country-specific)
- Legal requirements (jurisdiction-specific)
- Industry-specific regulations

| Scenario | Why Escalate | Example |
|----------|--------------|---------|
| **Tax Calculation** | Country-specific rules | "Luxembourg tax brackets and deductions?" |
| **Holiday Calendars** | Country-specific | "Belgium public holidays and regional variations?" |
| **Wage Calculations** | Legal requirements | "French overtime rules and coefficients?" |

---

## Escalation Process

### 1. Detection
- Gate Keeper or specialist agent detects violation/ambiguity
- Classify as auto-fixable or escalation

### 2. Routing
If escalation required:
- Fixer Orchestrator generates escalation report
- Logs to `logs/escalations.md`
- Pauses story execution (semi-auto/supervised modes)
- OR logs for later review (autonomous mode)

### 3. User Review
- User receives escalation report with context
- Options presented with pros/cons
- Recommendation provided (agent's suggestion)

### 4. Decision
- User makes decision
- Decision logged for audit
- May become precedent for future similar cases

### 5. Continue
- Implementation proceeds with user's decision
- Update PRD or story if clarification affects scope

---

## Escalation Metrics

Track these to refine auto-fix vs. escalation decisions:

| Metric | Target | Purpose |
|--------|--------|---------|
| **Auto-Fix Rate** | > 90% | Efficiency of autonomous remediation |
| **Escalation Rate** | < 10% | User interruption frequency |
| **Escalation Response Time** | < 24h | User engagement |
| **Re-Escalation Rate** | < 5% | Quality of escalation reports |
| **Precedent Reuse** | Track | How often decisions become patterns |

---

## Precedent Tracking

When a decision is made:
1. Log the decision with full context
2. Identify if this creates a reusable pattern
3. Update escalation criteria if pattern emerges

Example:
```
Decision: "Always use Redis for distributed caching"
Context: Microservices architecture, multiple instances
Date: 2026-02-05
Affected Future Decisions: Caching strategy escalations

Future Behavior: If PRD mentions distributed caching → auto-select Redis
```

---

## Refining Criteria Over Time

### Monthly Review
- Analyze escalation logs
- Identify patterns in escalations
- Move resolved patterns to auto-fix (if deterministic)
- Update routing table in Fixer Orchestrator

### Continuous Improvement
- False escalations (should have been auto-fixed) → Update routing
- Missed escalations (auto-fixed but should have asked) → Add criteria
- Unclear escalation reports → Improve templates

---

**Remember:** When in doubt, escalate. False escalation is better than incorrect auto-fix with business impact.

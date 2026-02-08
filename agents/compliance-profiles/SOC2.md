# SOC 2 Compliance Preset

> Gate-keeper rule set for SOC 2 (Service Organization Control 2) compliance.
> Activated via: `/go --compliance=soc2`

---

## Scope

Applies to SaaS products and service organizations. Based on the five Trust Service Criteria: Security, Availability, Processing Integrity, Confidentiality, and Privacy. Rules are **additive** - they extend existing gate-keeper rules, never weaken them.

---

## Trust Service Criteria Rules

### CC1 - Security (Common Criteria)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-SEC-001 | All endpoints must require authentication (no anonymous access to data) | CRITICAL | No |
| SOC2-SEC-002 | Role-based access control (RBAC) must be implemented | CRITICAL | No |
| SOC2-SEC-003 | All authentication events must be logged | CRITICAL | No |
| SOC2-SEC-004 | Password policy: minimum 12 chars, complexity requirements | HIGH | No |
| SOC2-SEC-005 | Account lockout after 5 failed attempts | HIGH | No |
| SOC2-SEC-006 | Security headers must be present (CSP, HSTS, X-Frame-Options) | HIGH | Yes |
| SOC2-SEC-007 | Dependencies must be scanned for known vulnerabilities | HIGH | No |
| SOC2-SEC-008 | Input validation on all user-facing endpoints | CRITICAL | No |

### CC2 - Availability

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-AVL-001 | Health check endpoint must exist (`/health` or `/status`) | HIGH | Yes |
| SOC2-AVL-002 | Application must handle graceful shutdown (SIGTERM) | HIGH | No |
| SOC2-AVL-003 | Database connections must have retry logic | MEDIUM | No |
| SOC2-AVL-004 | External service calls must have timeouts and circuit breakers | HIGH | No |
| SOC2-AVL-005 | Backup and restore procedures must be documented | HIGH | No |

### CC3 - Processing Integrity

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-INT-001 | All data mutations must be logged (create, update, delete) | CRITICAL | No |
| SOC2-INT-002 | Database transactions must be used for multi-step operations | HIGH | No |
| SOC2-INT-003 | Data validation must occur at API boundary (not just frontend) | CRITICAL | No |
| SOC2-INT-004 | Idempotency keys required for financial/critical operations | HIGH | No |
| SOC2-INT-005 | Error responses must not expose internal system details | HIGH | Yes |

### CC4 - Confidentiality

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-CON-001 | Data must be encrypted at rest (AES-256) | CRITICAL | No |
| SOC2-CON-002 | Data must be encrypted in transit (TLS 1.2+) | CRITICAL | No |
| SOC2-CON-003 | Sensitive data must not appear in logs | CRITICAL | Yes |
| SOC2-CON-004 | API keys and secrets must use environment variables | CRITICAL | Yes |
| SOC2-CON-005 | Data classification labels must exist in data models | MEDIUM | No |

### CC5 - Privacy

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-PRV-001 | PII fields must be identified and documented | HIGH | No |
| SOC2-PRV-002 | Data retention policies must be defined | HIGH | No |
| SOC2-PRV-003 | User data export capability required (data portability) | MEDIUM | No |
| SOC2-PRV-004 | User data deletion capability required | HIGH | No |
| SOC2-PRV-005 | Consent tracking for data collection | HIGH | No |

---

## Change Management Rules

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| SOC2-CHG-001 | All changes must be tracked in version control | CRITICAL | No |
| SOC2-CHG-002 | Code review required before merge to main branch | HIGH | No |
| SOC2-CHG-003 | Automated tests must pass before deployment | HIGH | No |
| SOC2-CHG-004 | Deployment procedures must be documented | MEDIUM | No |
| SOC2-CHG-005 | Rollback procedures must exist for every deployment | HIGH | No |

---

## Scan Patterns

Gate-keeper scans code for these patterns when SOC 2 compliance is active:

```
Banned Patterns:
├── Endpoints without authentication middleware
├── Missing CORS configuration
├── Missing rate limiting on authentication endpoints
├── Hardcoded credentials or API keys
├── Missing input validation (unsanitized user input)
├── SQL injection vectors (string concatenation in queries)
├── Missing security headers in HTTP responses
├── Unencrypted database connections
├── Missing error handling (uncaught exceptions)
└── Verbose error messages exposing internals in production
```

---

## Monitoring Requirements

When SOC 2 is active, gate-keeper verifies these monitoring capabilities exist:

```
Required Monitoring:
├── Application error rate tracking
├── Authentication failure monitoring
├── API response time tracking
├── Resource utilization (CPU, memory, disk)
├── Uptime monitoring with alerting
├── Security event logging
└── Audit trail for data access
```

---

## Integration

When activated, these rules are injected into the gate-keeper validation pipeline:

1. Gate-keeper loads this preset file
2. Rules are merged with existing gate-keeper rules (additive only)
3. Security scan runs on all new/modified files
4. Change management verification checks git history
5. Monitoring capability verification runs on infrastructure files
6. Results are included in the gate-keeper report

---

*SOC 2 Compliance Preset v1.0 - Claude AS Framework*

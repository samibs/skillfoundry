# BPSBS Production Rules — Recovered Knowledge

> These rules were present in the original BPSBS.md (2,023 lines) but were dropped during
> template simplification to the 434-line v3 standard. Cross-project analysis confirmed
> that their absence directly caused security violations, data leaks, and deployment failures
> in 5+ projects. These rules are now encoded here for agent reference.

---

## 1. Authentication & Token Security

**Referenced by:** `security-specialist`, `secure-coder`, `security-guardian`

### Mandatory Token Rules

- **NEVER** store tokens in `localStorage` or `sessionStorage` — use HttpOnly cookies only
- **Cookie flags**: Always set `HttpOnly: true`, `Secure: true`, `SameSite: 'Strict'`
- **JWT algorithms**: Use RS256 or ES256 only — **NEVER** HS256 with client-accessible secrets
  - Real-world violation: amudfin had to delete entire HS256 auth and rewrite with RS256
- **Refresh token rotation**: Issue new refresh token on each use, invalidate the old one
- **Token expiry**: Access tokens ≤15 minutes, refresh tokens ≤7 days

### Security Audit Checklist (Auth)

```
□ No tokens in localStorage/sessionStorage
□ HttpOnly + Secure + SameSite=Strict on all auth cookies
□ JWT uses RS256/ES256, never HS256 with hardcoded secret
□ Refresh tokens rotate on use
□ Access token TTL ≤ 15 minutes
□ Logout invalidates all tokens server-side
□ CSRF protection on state-changing endpoints
□ Rate limiting on /login, /register, /forgot-password
```

---

## 2. Centralized Logger (Replace console.log)

**Referenced by:** `production-orchestrator`, `ops-tooling-generator`, `production-cleaner`

### The Problem
- circularwatch.lu shipped with 314 `console.log` calls
- financialai-v2 shipped with 173 `console.log` calls
- `console.log` in production leaks sensitive data and provides no log level control

### Mandatory Pattern (TypeScript)

```typescript
// lib/logger.ts
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0, warn: 1, info: 2, debug: 3,
};

const CURRENT_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'error' : 'debug');

const SENSITIVE_PATTERNS = /password|secret|token|key|credential|authorization|cookie/i;

function sanitize(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (typeof arg === 'string' && SENSITIVE_PATTERNS.test(arg)) return '[REDACTED]';
    if (typeof arg === 'object' && arg !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(arg)) {
        sanitized[k] = SENSITIVE_PATTERNS.test(k) ? '[REDACTED]' : v;
      }
      return sanitized;
    }
    return arg;
  });
}

export const logger = {
  error: (...args: unknown[]) => log('error', args),
  warn: (...args: unknown[]) => log('warn', args),
  info: (...args: unknown[]) => log('info', args),
  debug: (...args: unknown[]) => log('debug', args),
};

function log(level: LogLevel, args: unknown[]) {
  if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[CURRENT_LEVEL]) return;
  const safe = sanitize(args);
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: safe.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '),
  };
  console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
}
```

### ESLint Rule

```json
{ "no-console": ["error", { "allow": ["warn", "error"] }] }
```

---

## 3. .gitignore Security Template

**Referenced by:** `security-guardian`, `secure-coder`, `production-cleaner`

### Required .gitignore Entries

```gitignore
# Secrets — NEVER commit these
.env
.env.local
.env.production
.env.*.local
*.pem
*.key
*.p12
*.pfx
credentials.json
service-account*.json
*-credentials.json

# Auth tokens
.npmrc
.pypirc
.docker/config.json

# IDE secrets
.vscode/launch.json
.idea/workspace.xml

# OS artifacts
.DS_Store
Thumbs.db

# Build artifacts
node_modules/
dist/
build/
.next/
__pycache__/
*.pyc
venv/
.venv/

# Logs
*.log
logs/
```

### Pre-commit Hook (detect accidental secret commits)

```bash
# Check staged files for potential secrets
SECRETS=$(git diff --cached --name-only | xargs grep -l \
  -e 'BEGIN.*PRIVATE KEY' \
  -e 'password\s*=' \
  -e 'api_key\s*=' \
  -e 'secret\s*=' \
  2>/dev/null || true)

if [ -n "$SECRETS" ]; then
  echo "WARNING: Possible secrets in staged files:"
  echo "$SECRETS"
  echo "Review carefully before committing."
fi
```

---

## 4. Database Migration Strategy

**Referenced by:** `data-architect`, `migration` (skill)

### Migration Workflow

1. **Create migration**: `npx prisma migrate dev --name <descriptive-name>`
2. **Review SQL**: Always read the generated SQL before applying
3. **Test rollback**: Every migration must have a working rollback
4. **Apply to staging first**: Never apply untested migrations to production

### Dangerous Operations Matrix

| Operation | Risk | Mitigation |
|-----------|------|------------|
| `DROP TABLE` | Data loss | Backup table first, verify no references |
| `DROP COLUMN` | Data loss | Mark deprecated, wait 2 releases, then drop |
| `RENAME COLUMN` | App breakage | Add new column → migrate data → remove old |
| `ALTER TYPE` | Data corruption | Create new column → cast data → swap |
| `TRUNCATE` | Data loss | Never in migration — use seed script |
| `ADD NOT NULL` | Insert failures | Add with DEFAULT first, then set NOT NULL |

### Migration Chain Rules

- **Linear chain only**: Each migration's `down_revision` must point to the immediately preceding migration
- Real-world violation: amudfin agent set `down_revision='add_share_classes'` instead of `'add_approval_engine'`, breaking the chain
- **Never edit applied migrations**: Create a new migration to fix issues
- **Test with real data**: Mock DB tests hide migration failures (regpilot incident)

---

## 5. Incident Response Protocol

**Referenced by:** `sre-specialist`, `production-orchestrator`, `ops-tooling-generator`

### Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|--------------|---------|
| **P0** | Service down, data loss, security breach | 15 minutes | DB corruption, leaked credentials |
| **P1** | Major feature broken, significant user impact | 1 hour | Auth not working, payments failing |
| **P2** | Feature degraded, workaround exists | 4 hours | Slow queries, intermittent errors |
| **P3** | Minor issue, cosmetic, documentation | 24 hours | UI alignment, typo in error message |
| **P4** | Enhancement request | Next sprint | Feature suggestion, UX improvement |

### Incident Response Steps

```
1. DETECT    → Alert fires or user reports
2. TRIAGE    → Assign severity level (P0-P4)
3. CONTAIN   → Stop the bleeding (revert, feature flag, circuit breaker)
4. DIAGNOSE  → Find root cause (logs, traces, git blame)
5. FIX       → Implement fix with test
6. VERIFY    → Confirm fix in staging, then production
7. DOCUMENT  → Write incident report (what, why, how, prevention)
8. PREVENT   → Add monitoring/test/guard to prevent recurrence
```

### Post-Incident Template

```markdown
## Incident Report: [TITLE]

**Severity:** P[0-4]
**Duration:** [start] to [end]
**Impact:** [what was affected, how many users]

### Timeline
- [HH:MM] Alert fired / Report received
- [HH:MM] Triage: assigned P[X]
- [HH:MM] Root cause identified
- [HH:MM] Fix deployed
- [HH:MM] Verified resolved

### Root Cause
[Technical explanation]

### Fix Applied
[What was changed, link to PR/commit]

### Prevention
- [ ] Added monitoring for [specific metric]
- [ ] Added test for [specific scenario]
- [ ] Updated documentation
```

---

## 6. PM2 Production Scripts

**Referenced by:** `ops-tooling-generator`, `sre-specialist`, `devops` (skill)

### Required Scripts

Every PM2-managed app must have these in `package.json`:

```json
{
  "scripts": {
    "start:prod": "pm2 start ecosystem.config.cjs",
    "stop:prod": "pm2 stop ecosystem.config.cjs",
    "restart:prod": "pm2 restart ecosystem.config.cjs",
    "status": "pm2 status",
    "logs": "pm2 logs --lines 50"
  }
}
```

### ecosystem.config.cjs Template

```javascript
module.exports = {
  apps: [{
    name: '<app-name>',
    script: '<entry-point>',
    instances: process.env.NODE_ENV === 'production' ? 2 : 1,
    exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: '<assigned-port>',
    },
    max_memory_restart: '500M',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }]
};
```

---

## 7. Observability Stack

**Referenced by:** `sre-specialist`, `performance-guardian`, `ops-tooling-generator`

### Required Metrics (RED Method)

| Metric | What | Alert Threshold |
|--------|------|----------------|
| **Rate** | Requests per second | > 2x normal = investigate |
| **Errors** | Error rate (%) | > 1% = P2, > 5% = P1, > 20% = P0 |
| **Duration** | p50, p95, p99 latency | p95 > 2s = P2, p95 > 5s = P1 |

### Structured Log Format

```json
{
  "ts": "2026-03-29T12:00:00.000Z",
  "level": "error",
  "service": "app-name",
  "msg": "Failed to process request",
  "method": "POST",
  "path": "/api/users",
  "status": 500,
  "duration_ms": 234,
  "request_id": "uuid",
  "user_id": "uuid",
  "error": "Connection refused"
}
```

---

_These rules are encoded from cross-project analysis of 37 apps on 2026-03-29.
Source incidents: regpilot (hardcoded secrets), amudfin (HS256 auth, broken migrations),
circularwatch.lu (314 console.logs), Phylon (missing auth guards)._

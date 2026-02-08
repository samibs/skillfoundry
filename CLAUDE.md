
# 📘 BPSBS.md – Best Practices & Standards by SBS

This file serves as a living contract and reference standard for all coding agents (AI or human) involved in my projects. It summarizes my preferred workflows, expectations, and non-negotiables regarding development, troubleshooting, and automation.

🧭 File Access & FS Integrity
Domain	Failure Mode
File Size Logic	Misreports small files (e.g., 26KB) as >20MB due to buffer residue, path misresolution, or sandboxed FS issues
Symlink Handling	Misinterprets symlinks or mounted paths, especially on /mnt/, ~/, or WSL paths
Chunked Reads	Attempts multi-read fallback strategies without clearing stale context, leading to logic loops or inflated file sizes

Rule: AI/LLM agents must verify file size using trusted shell commands (ls -lh, du -h) before assuming any read limitation.
If a file is reported as too large, re-check using the OS file system rather than agent logic.

Heuristic Guardrail:
If a file’s size is reported as >20MB but the actual disk size is <1MB, trigger a warning:
“⚠️ Inconsistent file size detected. Validate with filesystem tools.”

---

🔒 AI/LLM Execution Safety Rules

LLM-based agents must not execute, suggest, or generate code that runs in the wrong path, directory, or environment context.
This mistake leads to runtime errors, broken toolchains, or misconfigured builds — especially in CLI-driven workflows.

⚠️ LLMs often generate paths relative to their own hallucinated context, not the actual filesystem.
To mitigate this, agents and assistants must follow these rules:

📁 Path Awareness Requirements
✅ Always check and confirm the current working directory before executing any commands.
✅ Use absolute or project-root-relative paths unless instructed otherwise.
✅ Never assume file or folder existence — check first, or include a check in the script.
❌ Do not generate commands like cd somefolder && do-thing without validating that somefolder exists.
✅ When generating multi-step scripts, include setup comments like:

# Ensure we're in the project root
cd "$(git rev-parse --show-toplevel)"

---

🛑 Recovering From Path Errors
If a toolchain fails due to path error:
The agent must record the failure pattern
Future executions must avoid repeating the same path mistake
Prompt rules should be updated to reflect this behavior correction
🔁 The system should not "learn by failing" at runtime. Recovery is acceptable, but the agent must prefer zero-assumption execution logic by default.
🔁 Practical Example
Instead of this:
cd backend && python main.py
Generate this:

if [ -d "./backend" ]; then
  cd backend
  python main.py
else
  echo "❌ Error: 'backend' folder not found. Please run from project root."
fi

👁️ Integration With the Prompt Brain

This rule is part of the claude-rules.json and must be injected as:
"Always check path validity before suggesting command-line operations. Never assume working directory or folder layout."

---

## 🧠 Philosophy

- **Cold-blooded logic over flattery**: No vague encouragement or optimistic assumptions—honest, structured, production-ready evaluations only.
- **ONLY REAL LOGIC**: No placeholders, no TODOs, no mocks, no stubs, no "coming soon", no fake data. Every feature must work end-to-end with real implementations.
- **Three-Layer Completeness**: Every feature must be verified across DATABASE → BACKEND → FRONTEND before it's considered done.
- **PRD-First Development**: Every non-trivial feature starts with a Product Requirements Document. No PRD = no implementation.
- **Implement > Test > Iterate**: Every feature must be tested before being considered done.
- **Never break existing features**: New features must not cause regressions.
- **Document everything**: All modules and changes must include developer- and user-level documentation.
- **Clean project structure**: When work is complete, organize files properly—root folder contains only essentials.

---

## 📋 Genesis-First Development Workflow

The key differentiator in structured AI-assisted development is the PRD (Product Requirements Document). PRDs eliminate "vibe coding" by forcing clarity before implementation.

**All projects begin in the `genesis/` folder.**

### The Genesis Workflow

```
1. CREATE PRDs in genesis/
   └─ /prd "your feature"    → Saved to genesis/
   └─ Or manually create     → genesis/my-feature.md

2. RUN /go
   └─ Validates all PRDs
   └─ Generates stories
   └─ Implements everything
   └─ Validates all layers
   └─ Produces production code

That's it. Two steps.
```

### PRD Location: genesis/

```
genesis/                                  ← THE starting point
├── TEMPLATE.md                          # PRD template
├── 2026-01-16-user-authentication.md    # Your PRDs
├── 2026-01-17-payment-integration.md
└── notification-service.md
```

### Story Location: docs/stories/

```
docs/stories/
├── user-authentication/
│   ├── INDEX.md                  # Story overview + dependency graph
│   ├── STORY-001-auth-models.md
│   ├── STORY-002-login-api.md
│   └── ...
└── payment-integration/
    └── ...
```

### Key Commands

| Command | Purpose |
|---------|---------|
| `/go` | **THE main command** - Implement all PRDs from genesis/ |
| `/go --validate` | Only validate PRDs, don't implement |
| `/go [prd-file]` | Implement specific PRD |
| `/prd "idea"` | Create new PRD (saved to genesis/) |
| `/layer-check` | Validate three layers |

### PRD Quality Gates

Before a PRD is approved:
- [ ] Problem statement is concrete and measurable
- [ ] All user stories have acceptance criteria
- [ ] Security requirements explicitly defined
- [ ] Out of scope items explicitly listed
- [ ] No TBD/TODO markers remain
- [ ] Risks identified with mitigations

### Story Quality Gates

Before a story is ready for implementation:
- [ ] Self-contained (developer needs no external context)
- [ ] Technical approach specified with code patterns
- [ ] Acceptance criteria in Gherkin format
- [ ] Dependencies on other stories documented
- [ ] Security checklist included

---

## 🚫 Three-Layer Enforcement & Zero Tolerance Policy

**CRITICAL: Every feature must be REAL across all layers. No exceptions.**

### 🔴 ONLY REAL LOGIC - ABSOLUTE REQUIREMENT

**NO PLACEHOLDER. NO TODO. NO MOCK. NO STUB. NO "COMING SOON". NO PLACEHOLDER CONTENT. ONLY REAL, WORKING, PRODUCTION-READY LOGIC.**

Every line of code must:
- ✅ Execute real business logic
- ✅ Connect to real APIs and databases
- ✅ Handle real data transformations
- ✅ Implement real error handling
- ✅ Provide real user feedback

If you cannot implement something fully, **ASK** - do not leave fake code behind.

### Zero Tolerance Banned Patterns

These patterns trigger **IMMEDIATE REJECTION**:

| Pattern | Why Banned |
|---------|------------|
| `TODO`, `FIXME`, `HACK`, `XXX` | Incomplete work markers |
| `PLACEHOLDER`, `STUB`, `MOCK` (in prod) | Fake implementations |
| `COMING SOON`, `NOT IMPLEMENTED` | Unfinished features |
| `WIP`, `TEMPORARY`, `TEMP` | Non-production code |
| `Lorem ipsum` | Placeholder content |
| `NotImplementedError` / `NotImplementedException` | Empty implementations |
| Empty function bodies | No-op code |
| `@ts-ignore` without justification | Type evasion |
| Hardcoded credentials | Security violation |
| `// will implement later` | Deferred work |
| `pass` (Python) without logic | Empty placeholder |
| `throw new Error("Not implemented")` | Fake implementation |
| `console.log("TODO")` | Debug placeholder |
| `return null // placeholder` | Incomplete returns |
| `/* stub */`, `/* fake */` | Marker for fake code |

### Three-Layer Validation

Every full-stack feature must pass ALL affected layers:

```
┌─────────────┬──────────────────────────────────────────────┐
│ DATABASE    │ Migration works, schema matches PRD,         │
│             │ rollback tested, constraints in place        │
├─────────────┼──────────────────────────────────────────────┤
│ BACKEND     │ All endpoints work, tests pass, auth/authz  │
│             │ enforced, input validation complete          │
├─────────────┼──────────────────────────────────────────────┤
│ FRONTEND    │ REAL API connected (NO MOCKS), all UI        │
│             │ states implemented, accessible               │
└─────────────┴──────────────────────────────────────────────┘
```

### Iteration Gates (Every Story)

| Gate | Requirements |
|------|--------------|
| **Documentation** | Public APIs documented, code comments explain WHY |
| **Security** | No secrets, input validation, auth verified, no data in logs |
| **Audit** | Commit references story, review done, coverage maintained |

### Enforcement Commands

| Command | Purpose |
|---------|---------|
| `/layer-check` | Full three-layer validation |
| `/layer-check db` | Database layer only |
| `/layer-check backend` | Backend layer only |
| `/layer-check frontend` | Frontend layer only |
| `/layer-check scan` | Banned pattern scan |

### Audit Log Format

Every completed story generates an audit entry:

```
| Date | Story | Layers | Security | Docs | Tests | Verdict |
|------|-------|--------|----------|------|-------|---------|
| 2026-01-16 | STORY-001 | DB:✓ BE:✓ FE:✓ | ✓ | ✓ | 85% | PASS |
```

**Remember: A mock is a lie. A TODO is a promise to fail. Zero tolerance.**

### 🔒 Three-Layer Completion Verification (MANDATORY)

**Before ANY feature is considered "done", verify ALL three layers:**

```
┌────────────────────────────────────────────────────────────────────────┐
│ ✅ LAYER 1: DATABASE                                                   │
├────────────────────────────────────────────────────────────────────────┤
│ □ Schema/migrations created and applied                                │
│ □ Constraints, indexes, foreign keys in place                          │
│ □ Seed data (if needed) is REAL, not placeholder                       │
│ □ Rollback script tested                                               │
│ □ No "example_table" or "test_column" names                            │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ ✅ LAYER 2: BACKEND                                                    │
├────────────────────────────────────────────────────────────────────────┤
│ □ All endpoints implemented with REAL logic                            │
│ □ Database queries execute against REAL schema                         │
│ □ Authentication/authorization enforced                                │
│ □ Input validation complete (not just "// validate later")             │
│ □ Error handling returns proper HTTP codes and messages                │
│ □ Tests pass with REAL database (not mocked)                           │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ ✅ LAYER 3: FRONTEND                                                   │
├────────────────────────────────────────────────────────────────────────┤
│ □ UI connected to REAL backend API (NO MOCK DATA)                      │
│ □ All states implemented (loading, error, empty, success)              │
│ □ Forms submit to REAL endpoints                                       │
│ □ Error messages from backend displayed properly                       │
│ □ No hardcoded JSON or fake responses                                  │
│ □ Accessible (a11y) and responsive                                     │
└────────────────────────────────────────────────────────────────────────┘
```

**Completion Command:** Run `/layer-check` to validate all layers before marking any feature complete.

---

## 🧹 Project Completion & Cleanup Protocol

**When ALL features are implemented and verified, perform mandatory cleanup:**

### Root Folder Hygiene

```
KEEP in root:
├── README.md
├── CLAUDE.md (or bpsbs.md)
├── .env.example
├── .gitignore
├── package.json / requirements.txt / *.csproj
├── docker-compose.yml (if applicable)
└── Makefile / justfile (if applicable)

MOVE to appropriate folders:
├── docs/          ← All .md documentation (except README)
├── scripts/       ← Shell scripts, automation, one-offs
├── config/        ← Configuration files
├── logs/          ← Log files (add to .gitignore)
└── .dev/          ← Development-only files

DELETE:
├── *.tmp, *.bak, *.old
├── node_modules/.cache (rebuild on install)
├── __pycache__, *.pyc
├── .DS_Store, Thumbs.db
├── Unused test files
└── Any AI-generated garbage (e.g., `000000`, `))))`)
```

### Cleanup Verification Checklist

Before final commit:
- [ ] Root folder contains ONLY essential project files
- [ ] All documentation organized in `docs/`
- [ ] All scripts organized in `scripts/`
- [ ] No temporary or backup files remain
- [ ] No orphaned/unused files from failed generations
- [ ] `.gitignore` updated to exclude generated artifacts
- [ ] All feature folders follow standard structure

### Cleanup Command

After all work is complete, run:
```bash
# List all files in root to verify cleanliness
ls -la
# Show project structure
tree -L 2 -I 'node_modules|__pycache__|.git'
```

---

🧠 The Illusion of Control: Why Prompt Memory Matters
"Alex believes he's in control... but he's not. It's the illusion of free will."
— RoboCop (2014)

In modern AI-assisted development, developers often believe they are guiding the coding agent. But after a few prompts, resets, or context shifts, the LLM starts making decisions on its own, based on generic defaults — not personal rules, styles, or best practices.
This file, along with the behavioral memory system that reads it, exists to prevent that.
⚠️ AI agents drift unless continuously reinforced. Prompt behavior must be injected and refreshed to maintain alignment with the developer’s intent.
We do not allow passive "passenger mode" coding. The system must:
Enforce preemptive instruction injection at session start
Reinject condensed behavior at regular turns or on reset detection
Extract behavioral feedback from past sessions to evolve this file
This ensures the developer stays in command — not just in perception, but in execution.
👁️ When the visor comes down, the system takes over. This bpsbs.md lifts the visor.

---

## 🔁 AI/LLM Loop & Duplication Guard

AI/LLMs must check for and eliminate duplicate code blocks before suggesting or committing changes. Duplication can occur due to:
- Context resets or partial memory loss
- Prompt loops or repetitive internal generations

> **If context is partially restored, LLM must perform a structural diff with existing files and explicitly prevent duplication.**

---

## 📦 Project Folder Standards
Every repo must include the following folders:

```
📁 backend
📁 frontend
📁 modules
📁 scripts         # one-off or automation scripts
📁 memory_bank     # persistent AI memory (optional)
📁 docs            # full Markdown documentation
📁 logs            # runtime or audit logs
```

---

## 📈 Feature Lifecycle Tags

🏗️ DRAFT – feature in ideation  
🔬 DEV – being actively developed  
🧪 TEST – undergoing testing  
✅ READY – tested and stable  
🚀 LIVE – deployed and monitored  
🛑 DEPRECATED – feature to be removed  

> 🔧 Ask AI to respect feature state before modifying anything.

---

## 🛡️ Security Heuristics for All Agents

- ❌ No plaintext secrets or passwords
- 🔐 Always hash + salt passwords
- 🔍 Validate input even for internal-only forms
- 🧯 Do not expose stack traces in prod
- ⏳ Auto-logout logic if inactive for 60 minutes

---

### 📁 .gitignore Security (MANDATORY)

**Every project MUST have a .gitignore that excludes ALL sensitive data.**

#### Required .gitignore Entries

```gitignore
# ═══════════════════════════════════════════════════════════════
# ENVIRONMENT & SECRETS - NEVER COMMIT
# ═══════════════════════════════════════════════════════════════
.env
.env.*
!.env.example
.env.local
.env.production
.env.staging

# Credentials
config/credentials/
*.pem
*.key
*.crt
*.p12
*.pfx
secrets/
.secrets
*-credentials
*-credentials.*
service-account*.json
google-credentials.json

# API Keys & Tokens
.api-keys
api-keys.json
tokens.json
auth-tokens/

# ═══════════════════════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════════════════════
*.sqlite
*.sqlite3
*.db
database.json
db-config.json

# ═══════════════════════════════════════════════════════════════
# LOGS (may contain sensitive data)
# ═══════════════════════════════════════════════════════════════
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# ═══════════════════════════════════════════════════════════════
# IDE & OS
# ═══════════════════════════════════════════════════════════════
.idea/
.vscode/settings.json
.vscode/launch.json
*.swp
*.swo
.DS_Store
Thumbs.db

# ═══════════════════════════════════════════════════════════════
# BUILD & DEPENDENCIES
# ═══════════════════════════════════════════════════════════════
node_modules/
__pycache__/
*.pyc
dist/
build/
.next/
.nuxt/
.cache/
coverage/

# ═══════════════════════════════════════════════════════════════
# TEMPORARY & GENERATED
# ═══════════════════════════════════════════════════════════════
*.tmp
*.temp
*.bak
*.old
~*
```

#### Sensitive Data Verification Checklist

**Before EVERY commit, verify NO sensitive data is exposed:**

- [ ] `git diff --staged` reviewed for secrets
- [ ] No API keys, tokens, or passwords in code
- [ ] No hardcoded URLs with credentials
- [ ] No private keys or certificates
- [ ] No database connection strings with passwords
- [ ] No `.env` files staged
- [ ] No `config/credentials/` files staged
- [ ] `git log -p` checked for accidentally committed secrets

#### Emergency: Secret Accidentally Committed

```bash
# 1. IMMEDIATELY rotate the compromised secret
# 2. Remove from git history (if not pushed)
git reset --soft HEAD~1
git restore --staged <file>

# 3. If already pushed, use BFG Repo-Cleaner
bfg --delete-files <filename>
bfg --replace-text passwords.txt

# 4. Force push (coordinate with team)
git push --force

# 5. Document incident and rotate ALL potentially exposed secrets
```

#### Pre-commit Hook (Recommended)

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for common secret patterns
if git diff --cached --diff-filter=ACM | grep -iE "(password|secret|api_key|token|private_key).*=.*['\"][^'\"]+['\"]"; then
  echo "❌ Potential secret detected! Review before committing."
  exit 1
fi

# Check for .env files
if git diff --cached --name-only | grep -E "^\.env"; then
  echo "❌ .env file staged! Remove it."
  exit 1
fi
```

---

### 🔐 Authentication & Token Management Security Standards

**CRITICAL SECURITY REQUIREMENTS - NO EXCEPTIONS**

When implementing authentication and token management, understand that this is a security-sensitive area where small mistakes lead to significant vulnerabilities. Follow these guidelines strictly:

#### TOKEN STORAGE SECURITY
- **❌ NEVER** store access tokens in localStorage or sessionStorage (vulnerable to XSS attacks)
- **✅ FOR SPAs**: Store access tokens in memory only, implement automatic refresh
- **✅ FOR REFRESH TOKENS**: Use HttpOnly, Secure, SameSite=Strict cookies only
- **❌ NEVER** hardcode API keys, client secrets, or JWT signing keys in code
- **✅ ALWAYS** use environment variables for sensitive configuration

#### REQUIRED SECURITY IMPLEMENTATIONS
1. **Token Validation**: On every protected endpoint, validate:
   - Token signature and integrity
   - Expiration time (exp claim)
   - Issuer (iss claim) 
   - Audience (aud claim)
   - Required scopes/permissions

2. **Refresh Token Security**:
   - Implement refresh token rotation (issue new refresh token on each use)
   - Properly revoke refresh tokens on logout
   - Set reasonable expiration times (access: 15min, refresh: 7 days max)
   - Detect and handle refresh token reuse attempts

3. **Error Handling**: Implement robust error handling for:
   - Expired tokens (trigger refresh flow)
   - Invalid tokens (force re-authentication)
   - Network failures during token refresh
   - Rate limiting violations

#### SECURITY HEADERS & PROTECTIONS
Always include these security measures:
- CSRF tokens for state-changing operations
- Content Security Policy (CSP) headers
- Rate limiting on authentication endpoints
- HTTPS-only in production
- Secure session management

#### JWT ALGORITHM REQUIREMENTS
- **✅ USE**: RS256 or ES256 algorithms with public/private key pairs
- **❌ NEVER**: HS256 with client-accessible secrets
- **✅ VALIDATE**: All JWT claims (iss, aud, exp, iat)
- **✅ IMPLEMENT**: Proper key rotation strategies

#### TESTING REQUIREMENTS
Generate comprehensive tests for:
- Happy path authentication flows
- Token expiration scenarios
- Invalid token handling
- Concurrent token refresh attempts
- Session invalidation
- Common attack vectors (XSS, CSRF, token replay)

#### SECURITY AUDIT CHECKLIST
Before deploying any authentication system, verify:
- [ ] No tokens stored in localStorage/sessionStorage
- [ ] Refresh tokens use HttpOnly cookies
- [ ] JWT uses RS256/ES256 algorithms
- [ ] Token rotation implemented
- [ ] Proper error handling for all token scenarios
- [ ] Rate limiting on auth endpoints
- [ ] CSRF protection implemented
- [ ] Security headers configured
- [ ] Comprehensive security tests written

#### IMPLEMENTATION APPROACH
1. Start with established authentication libraries/frameworks
2. Focus on proper integration rather than building from scratch
3. Implement defense in depth (multiple security layers)
4. Follow principle of least privilege for token scopes
5. Plan for token compromise scenarios

**⚠️ SECURITY REMINDER**: When generating authentication code, explain your security decisions and highlight any areas that require manual security review or additional hardening.

---

### 🔐 Admin Password & Credentials Security

**MANDATORY for all projects with authentication:**

#### Secure Password Generation
- Minimum 32 characters with high entropy
- Mix of uppercase, lowercase, numbers, and special characters
- Generated using cryptographically secure random (e.g., Node.js `crypto` module)
- **NEVER** use default passwords like `admin123`, `password`, or `changeme`

#### Credential Storage
```
config/credentials/
├── .admin-credentials    # File permissions: 600 (owner read/write only)
├── .env.production       # Never commit to git
└── README.md             # Documents credential rotation process
```

#### Security Requirements
- [ ] Credentials file excluded from git (`.gitignore`)
- [ ] File permissions set to 600 (owner only)
- [ ] Password hash stored in database, never plaintext
- [ ] Insecure password fallbacks removed from auth routes
- [ ] Credential rotation procedure documented

---

### 📝 LoggerService Requirements (Frontend)

**All frontend logging MUST use a centralized LoggerService that:**

#### Data Sanitization
Automatically sanitizes before logging:
- Passwords and password confirmations
- Access tokens and refresh tokens
- API keys and secrets
- Email addresses (partial masking)
- Credit card numbers
- Social security numbers
- Any field containing: `password`, `token`, `secret`, `key`, `auth`, `credential`

#### Environment-Based Verbosity
```typescript
// Production: Only errors and critical warnings
// Development: Full debug logging enabled
// Test: Minimal logging

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

const LOG_LEVEL = process.env.NODE_ENV === 'production'
  ? LogLevel.ERROR
  : LogLevel.DEBUG;
```

#### LoggerService Implementation Pattern

```typescript
class LoggerService {
  private static sanitize(data: any): any {
    const sensitiveKeys = /password|token|secret|key|auth|credential|api_key|bearer|ssn|credit_card/i;

    if (typeof data === 'object' && data !== null) {
      return Object.keys(data).reduce((acc, key) => {
        acc[key] = sensitiveKeys.test(key)
          ? '[REDACTED]'
          : this.sanitize(data[key]);
        return acc;
      }, {} as any);
    }
    return data;
  }

  static debug(message: string, ...args: any[]) {
    if (LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args.map(this.sanitize));
    }
  }

  static info(message: string, ...args: any[]) {
    if (LOG_LEVEL <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args.map(this.sanitize));
    }
  }

  static warn(message: string, ...args: any[]) {
    if (LOG_LEVEL <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args.map(this.sanitize));
    }
  }

  static error(message: string, ...args: any[]) {
    if (LOG_LEVEL <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args.map(this.sanitize));
    }
  }
}
```

#### Implementation Checklist

- [ ] Replace ALL `console.log` with `LoggerService.debug()`
- [ ] Replace ALL `console.error` with `LoggerService.error()`
- [ ] Replace ALL `console.warn` with `LoggerService.warn()`
- [ ] Replace ALL `console.info` with `LoggerService.info()`
- [ ] Sensitive data never appears in production console
- [ ] Log levels configurable via environment variable

#### 🔴 MANDATORY VERIFICATION (Before Production)

**Run these checks to CONFIRM all console.* statements are replaced:**

```bash
# Search for remaining console.* in frontend source
grep -rn "console\.\(log\|error\|warn\|info\)" frontend/src/ \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"

# Expected result: ZERO matches (or only in LoggerService itself)

# If matches found, replace them:
# console.log(...)     → LoggerService.debug(...)
# console.error(...)   → LoggerService.error(...)
# console.warn(...)    → LoggerService.warn(...)
# console.info(...)    → LoggerService.info(...)
```

#### ESLint Rule (Enforce No Console)

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-console': ['error', {
      allow: [] // No console methods allowed in source
    }]
  }
};
```

#### Verification Sign-off Template

```markdown
## LoggerService Implementation Confirmation

| Check | Status | Verified By | Date |
|-------|--------|-------------|------|
| All console.log replaced | ✅ | [Name] | [Date] |
| All console.error replaced | ✅ | [Name] | [Date] |
| All console.warn replaced | ✅ | [Name] | [Date] |
| All console.info replaced | ✅ | [Name] | [Date] |
| Sanitization tested with sensitive data | ✅ | [Name] | [Date] |
| Production build has no verbose logs | ✅ | [Name] | [Date] |
| ESLint no-console rule enabled | ✅ | [Name] | [Date] |

**Confirmation:** All frontend console statements have been replaced with
LoggerService, which sanitizes sensitive data (passwords, tokens, secrets,
emails, etc.) and controls verbosity based on environment (production vs
development), preventing sensitive information from appearing in production
console logs.
```

---

## 🚀 PM2 Production Deployment Scripts

**Every production-ready project MUST include PM2-based management scripts:**

### Required Scripts in `scripts/`

```bash
scripts/
├── start-production.sh     # Start services (persists after disconnect)
├── stop-production.sh      # Stop all services gracefully
├── restart-production.sh   # Restart services (zero-downtime if configured)
├── status-production.sh    # Check service status and health
└── logs-production.sh      # Tail production logs
```

### Script Templates

#### start-production.sh
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/.."
pm2 start ecosystem.config.js --env production
pm2 save
echo "✅ Services started and saved to PM2"
```

#### stop-production.sh
```bash
#!/bin/bash
set -e
pm2 stop all
echo "🛑 All services stopped"
```

#### restart-production.sh
```bash
#!/bin/bash
set -e
pm2 reload all --update-env
echo "🔄 Services restarted"
```

#### status-production.sh
```bash
#!/bin/bash
pm2 status
pm2 monit --no-interactive 2>/dev/null || true
```

### PM2 Ecosystem File Required
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'app-backend',
      script: './backend/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'app-frontend',
      script: 'serve',
      args: '-s frontend/dist -l 3000'
    }
  ]
};
```

### Production Checklist
- [ ] All scripts have executable permissions (`chmod +x`)
- [ ] PM2 ecosystem.config.js exists and is configured
- [ ] Scripts use `set -e` for fail-fast behavior
- [ ] Logs are rotated (`pm2 install pm2-logrotate`)
- [ ] Process list saved (`pm2 save`)
- [ ] Startup hook configured (`pm2 startup`)

---

## 🔍 SEO Implementation Checklist

**Every public-facing web application MUST implement:**

### Technical SEO (Mandatory)

| Item | Requirement | Status |
|------|-------------|--------|
| Meta title | Unique per page, 50-60 chars | □ |
| Meta description | Unique per page, 150-160 chars | □ |
| Open Graph tags | og:title, og:description, og:image, og:url | □ |
| Twitter Card tags | twitter:card, twitter:title, twitter:description | □ |
| Canonical URLs | Self-referencing canonical on every page | □ |
| robots.txt | Proper allow/disallow rules | □ |
| sitemap.xml | Auto-generated, submitted to Search Console | □ |
| JSON-LD Structured Data | Minimum: Organization schema | □ |

### Structured Data Schemas (As Applicable)

| Schema Type | When to Use |
|-------------|-------------|
| Organization | Every site (in header/footer) |
| WebApplication | SaaS/web apps |
| Product | E-commerce, pricing pages |
| FAQ | FAQ sections (enables rich snippets) |
| Article | Blog posts, news |
| BreadcrumbList | Multi-level navigation |
| LocalBusiness | Physical business locations |

### Per-Page SEO Requirements

```
Landing Page:
  - Primary keywords in H1
  - Optimized meta description with CTA
  - Schema: Organization + WebApplication

Pricing Page:
  - Product/Offer schema
  - Clear pricing in structured data

Security/Technical Pages:
  - Technical documentation focus
  - FAQ schema for common questions

Legal Pages (Privacy/Terms):
  - Proper noindex if duplicate content
  - Legal page schema
```

### PWA Requirements
- [ ] manifest.json with icons (192x192, 512x512)
- [ ] theme_color and background_color set
- [ ] Service worker for offline capability
- [ ] Apple touch icons configured

### Verification Files
```
public/
├── robots.txt
├── sitemap.xml
├── manifest.json
├── favicon.ico
├── apple-touch-icon.png
└── og-image.png (1200x630)
```

---

## 🗄️ Database Migration Strategy

**CRITICAL: All database changes MUST follow migration discipline.**

### Migration Requirements

| Requirement | Standard |
|-------------|----------|
| Migration Tool | Alembic (Python), EF Migrations (.NET), Knex/Prisma (Node), Flyway (Java) |
| File Naming | `YYYYMMDD_HHMMSS_description.sql` or framework convention |
| Version Control | All migrations committed to git |
| Rollback | Every UP migration has a DOWN migration |
| Testing | Rollback tested BEFORE production deployment |

### Migration Workflow

```
1. Create migration file (never edit schema directly)
2. Write UP migration (schema changes)
3. Write DOWN migration (rollback)
4. Test UP locally
5. Test DOWN locally (verify rollback works)
6. Review migration in PR
7. Deploy to staging, verify
8. Deploy to production with rollback plan ready
```

### Migration Checklist

- [ ] Migration file follows naming convention
- [ ] UP migration is idempotent where possible
- [ ] DOWN migration fully reverses UP changes
- [ ] No data loss in DOWN migration (or documented as acceptable)
- [ ] Large table migrations use batching (avoid locks)
- [ ] Index creation is CONCURRENTLY where supported
- [ ] Foreign key constraints added AFTER data migration
- [ ] Seed data is versioned and repeatable

### Schema Drift Detection

```bash
# Add to CI/CD pipeline
npm run db:check-drift  # or equivalent
# Fails if schema doesn't match migrations
```

### Dangerous Operations (Require Approval)

| Operation | Risk | Mitigation |
|-----------|------|------------|
| DROP TABLE | Data loss | Backup + soft delete first |
| DROP COLUMN | Data loss | Verify column unused |
| RENAME COLUMN | Breaking change | Dual-write period |
| CHANGE TYPE | Data corruption | Test with production data sample |
| ADD NOT NULL | Failures on existing rows | Add default or backfill first |

---

## 📊 Observability & APM

**CRITICAL: Production systems MUST be observable. No blind spots.**

### Required Observability Stack

```
┌─────────────────────────────────────────────────────────────────┐
│ METRICS        │ Prometheus, DataDog, CloudWatch                │
├─────────────────────────────────────────────────────────────────┤
│ LOGS           │ ELK Stack, Loki, CloudWatch Logs               │
├─────────────────────────────────────────────────────────────────┤
│ TRACES         │ OpenTelemetry, Jaeger, Zipkin                  │
├─────────────────────────────────────────────────────────────────┤
│ ALERTS         │ PagerDuty, OpsGenie, Slack integrations        │
└─────────────────────────────────────────────────────────────────┘
```

### Mandatory Metrics

| Category | Metrics |
|----------|---------|
| **RED Metrics** | Rate (requests/sec), Errors (error rate), Duration (latency) |
| **System** | CPU, Memory, Disk I/O, Network |
| **Application** | Active connections, Queue depth, Cache hit ratio |
| **Business** | Signups, Transactions, Revenue (if applicable) |

### Logging Standards

```typescript
// REQUIRED log fields
{
  timestamp: ISO8601,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  service: string,
  traceId: string,      // For distributed tracing
  spanId: string,
  userId?: string,      // If authenticated
  requestId: string,
  duration?: number,    // For performance tracking
  error?: {
    name: string,
    message: string,
    stack: string       // Only in non-production
  }
}
```

### Alert Thresholds (Baseline)

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 1% | > 5% |
| P95 Latency | > 500ms | > 2s |
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Disk Usage | > 70% | > 90% |
| Queue Depth | > 1000 | > 5000 |

### Observability Checklist

- [ ] OpenTelemetry SDK integrated
- [ ] Distributed tracing enabled (trace IDs propagated)
- [ ] Structured JSON logging configured
- [ ] Log aggregation pipeline set up
- [ ] Dashboard created with RED metrics
- [ ] Alerts configured for critical thresholds
- [ ] On-call rotation established
- [ ] Runbooks linked to alerts

---

## 🚨 Incident Response Protocol

**CRITICAL: When production breaks, follow this protocol. No improvisation.**

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P0** | Total outage | < 15 min | Site down, data breach |
| **P1** | Major feature broken | < 1 hour | Payments failing, auth broken |
| **P2** | Degraded service | < 4 hours | Slow performance, minor feature broken |
| **P3** | Minor issue | < 24 hours | UI bug, edge case failure |
| **P4** | Cosmetic | Next sprint | Typo, minor UX issue |

### Incident Response Steps

```
1. DETECT     → Alert fires or user report
2. TRIAGE     → Assign severity level (P0-P4)
3. ASSEMBLE   → Page on-call for P0/P1
4. DIAGNOSE   → Check dashboards, logs, recent deploys
5. MITIGATE   → Rollback, feature flag, or hotfix
6. RESOLVE    → Confirm service restored
7. DOCUMENT   → Update incident timeline
8. POSTMORTEM → Blameless review within 48h
```

### Incident Commander Responsibilities

- [ ] Owns communication (status page updates)
- [ ] Coordinates response team
- [ ] Makes rollback/hotfix decisions
- [ ] Documents timeline in real-time
- [ ] Schedules postmortem

### Communication Templates

**Status Page Update:**
```
[INVESTIGATING] We are investigating reports of [issue].
[IDENTIFIED] The issue has been identified. [Brief description].
[MONITORING] A fix has been deployed. We are monitoring.
[RESOLVED] The issue has been resolved. [Duration] downtime.
```

### Postmortem Template

```markdown
## Incident Summary
- **Date:** YYYY-MM-DD
- **Duration:** X hours Y minutes
- **Severity:** P0/P1/P2
- **Impact:** [Users affected, revenue lost, etc.]

## Timeline
- HH:MM - Alert fired
- HH:MM - On-call paged
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Service restored

## Root Cause
[Technical explanation]

## What Went Well
- [Bullet points]

## What Went Wrong
- [Bullet points]

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| [Fix] | [Name] | [Date] |
```

---

## 🛑 Graceful Shutdown & Cleanup

**CRITICAL: Applications MUST handle shutdown signals gracefully.**

### Signal Handling Requirements

```typescript
// Node.js example
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, starting graceful shutdown...');

  // 1. Stop accepting new requests
  server.close();

  // 2. Wait for in-flight requests to complete (with timeout)
  await drainConnections(30000); // 30 second timeout

  // 3. Close database connections
  await database.close();

  // 4. Close cache connections
  await redis.quit();

  // 5. Flush logs
  await logger.flush();

  console.log('Graceful shutdown complete');
  process.exit(0);
});
```

### Shutdown Checklist

| Step | Action | Timeout |
|------|--------|---------|
| 1 | Stop health check responses (return 503) | Immediate |
| 2 | Stop accepting new connections | Immediate |
| 3 | Wait for in-flight requests | 30 seconds |
| 4 | Close database connections | 10 seconds |
| 5 | Close cache/queue connections | 5 seconds |
| 6 | Flush logs and metrics | 5 seconds |
| 7 | Exit process | Immediate |

### Load Balancer Coordination

```
1. Health check fails → LB stops sending traffic
2. Drain period → Existing requests complete
3. Pod/instance terminated → Clean shutdown
```

### PM2 Graceful Shutdown

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'app',
    script: './dist/index.js',
    kill_timeout: 30000,        // 30 seconds to shutdown
    wait_ready: true,           // Wait for process.send('ready')
    listen_timeout: 10000,      // Startup timeout
    shutdown_with_message: true // Use process message for shutdown
  }]
};
```

---

## 🔄 API Versioning Strategy

**All public APIs MUST be versioned. Breaking changes require deprecation period.**

### Versioning Method

```
URL Path Versioning (Recommended):
  /api/v1/users
  /api/v2/users

Header Versioning (Alternative):
  Accept: application/vnd.api.v1+json
```

### Version Lifecycle

| Phase | Duration | Action |
|-------|----------|--------|
| **Current** | Active | Full support, new features |
| **Deprecated** | 6 months | Security fixes only, migration docs |
| **Sunset** | 3 months | Warning headers, no changes |
| **Removed** | - | Returns 410 Gone |

### Deprecation Requirements

```http
# Response headers for deprecated endpoints
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: </api/v2/users>; rel="successor-version"
```

### Breaking vs Non-Breaking Changes

| Non-Breaking (OK) | Breaking (New Version) |
|-------------------|------------------------|
| Add optional field | Remove field |
| Add new endpoint | Change field type |
| Add optional parameter | Rename field |
| Relax validation | Tighten validation |
| Increase rate limit | Change response structure |

### API Changelog Required

```markdown
## v2.0.0 (2026-01-15)
### Breaking Changes
- Removed `user.legacyId` field
- Changed `user.status` from string to enum

### Migration Guide
- Replace `legacyId` with `user.id`
- Update status handling: "active" → "ACTIVE"
```

---

## 🔒 Concurrency & Locking Strategy

**Race conditions are silent data killers. Implement locking discipline.**

### Optimistic Locking (Preferred)

```sql
-- Add version column to tables with concurrent updates
ALTER TABLE orders ADD COLUMN version INTEGER DEFAULT 1;

-- Update with version check
UPDATE orders
SET status = 'shipped', version = version + 1
WHERE id = 123 AND version = 5;

-- If affected rows = 0, someone else updated first → retry
```

### Implementation Pattern

```typescript
async function updateWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.code === 'CONCURRENT_MODIFICATION' && i < maxRetries - 1) {
        await sleep(100 * Math.pow(2, i)); // Exponential backoff
        continue;
      }
      throw e;
    }
  }
}
```

### Pessimistic Locking (When Needed)

```sql
-- Use SELECT FOR UPDATE for critical sections
BEGIN;
SELECT * FROM accounts WHERE id = 123 FOR UPDATE;
-- Other transactions wait here
UPDATE accounts SET balance = balance - 100 WHERE id = 123;
COMMIT;
```

### Deadlock Prevention

| Rule | Implementation |
|------|----------------|
| Lock ordering | Always acquire locks in same order (e.g., by ID ascending) |
| Lock timeout | Set statement_timeout in database |
| Retry logic | Catch deadlock errors, retry with backoff |
| Keep transactions short | Minimize time locks are held |

### Concurrency Checklist

- [ ] All frequently-updated tables have version/updated_at column
- [ ] Update operations check version or use FOR UPDATE
- [ ] Deadlock errors are caught and retried
- [ ] Transaction timeouts configured
- [ ] No long-running transactions holding locks

---

## 🛡️ Error Resilience Patterns

**Systems fail. Build for failure.**

### Circuit Breaker Pattern

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 2,      // Close after 2 successes
  timeout: 30000,           // Half-open after 30s
  fallback: () => cachedResponse
});

const result = await circuitBreaker.execute(() =>
  externalService.call()
);
```

### Retry with Exponential Backoff

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options = { maxRetries: 3, baseDelay: 100, maxDelay: 5000 }
): Promise<T> {
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === options.maxRetries || !isRetryable(error)) {
        throw error;
      }
      const delay = Math.min(
        options.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        options.maxDelay
      );
      await sleep(delay);
    }
  }
}
```

### Timeout Requirements

| Operation Type | Timeout |
|----------------|---------|
| Database query | 5 seconds |
| External API call | 10 seconds |
| File upload | 60 seconds |
| Background job | 5 minutes |
| Report generation | 10 minutes |

### Bulkhead Pattern

```typescript
// Isolate resources to prevent cascading failures
const paymentPool = new ConnectionPool({ max: 10 });
const analyticsPool = new ConnectionPool({ max: 5 });

// Payment failures don't exhaust analytics connections
```

### Resilience Checklist

- [ ] All external calls have timeouts
- [ ] Circuit breakers on critical dependencies
- [ ] Retry logic for transient failures
- [ ] Fallback responses defined
- [ ] Bulkheads isolate failure domains
- [ ] Dead letter queues for failed async jobs

---

## 📦 Dependency Management

**Dependencies are attack vectors. Manage them aggressively.**

### Security Scanning (Mandatory)

```yaml
# CI/CD pipeline must include:
- npm audit / yarn audit / pip-audit
- Snyk or Dependabot scanning
- License compliance check
- SBOM (Software Bill of Materials) generation
```

### Update Policy

| Severity | Response Time | Action |
|----------|---------------|--------|
| Critical CVE | 24 hours | Patch immediately |
| High CVE | 1 week | Schedule patch |
| Medium CVE | 1 month | Include in next release |
| Low CVE | 3 months | Review and decide |

### Dependency Hygiene

```bash
# Weekly automated checks
npm outdated
npm audit
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause"
```

### Pinning Strategy

| Environment | Strategy |
|-------------|----------|
| Production | Exact versions (`1.2.3`) |
| Development | Caret ranges (`^1.2.3`) |
| Lock files | Always committed |

### Dependency Checklist

- [ ] Lock files committed (package-lock.json, yarn.lock)
- [ ] No `latest` tags in production
- [ ] Security scanning in CI/CD
- [ ] License compliance verified
- [ ] Outdated dependencies reviewed monthly
- [ ] Major version updates tested in staging first

---

## 🚩 Feature Flags

**Ship dark. Enable gradually. Roll back instantly.**

### Feature Flag Framework

```typescript
// Use a feature flag service (LaunchDarkly, Unleash, etc.)
const isEnabled = await featureFlags.isEnabled('new-checkout', {
  userId: user.id,
  email: user.email,
  plan: user.plan
});

if (isEnabled) {
  return newCheckoutFlow();
} else {
  return legacyCheckoutFlow();
}
```

### Flag Types

| Type | Use Case | Example |
|------|----------|---------|
| Release | Ship feature dark | `new-dashboard` |
| Experiment | A/B testing | `checkout-variant-b` |
| Ops | Kill switch | `disable-external-api` |
| Permission | User segmentation | `beta-users-only` |

### Flag Lifecycle

```
1. CREATE    → Flag starts OFF
2. DEV       → Enable for devs only
3. STAGING   → Enable in staging
4. CANARY    → Enable for 5% of prod users
5. ROLLOUT   → Gradual increase to 100%
6. CLEANUP   → Remove flag, delete dead code
```

### Feature Flag Checklist

- [ ] All new features behind flags
- [ ] Flags have clear owners
- [ ] Flags have expiration dates
- [ ] Dead flags cleaned up within 30 days of full rollout
- [ ] Kill switch flags for critical dependencies
- [ ] Flag state is observable (metrics/logs)

---

## 💾 Caching Strategy

**Cache aggressively. Invalidate correctly.**

### Cache Layers

```
┌─────────────────────────────────────────┐
│ Browser Cache (HTTP headers)            │ ← Static assets
├─────────────────────────────────────────┤
│ CDN Cache (Cloudflare, CloudFront)      │ ← Public content
├─────────────────────────────────────────┤
│ Application Cache (Redis)               │ ← Session, computed data
├─────────────────────────────────────────┤
│ Database Query Cache                    │ ← Expensive queries
└─────────────────────────────────────────┘
```

### Cache Key Design

```typescript
// Good: Includes all relevant dimensions
`user:${userId}:profile:v${schemaVersion}`
`product:${productId}:price:${currency}:${region}`

// Bad: Too generic, causes collisions
`user-data`
`product`
```

### TTL Guidelines

| Data Type | TTL | Invalidation |
|-----------|-----|--------------|
| Static assets | 1 year | Hash in filename |
| User session | 24 hours | Logout/password change |
| API response | 5 minutes | Event-based |
| Computed stats | 1 hour | Scheduled refresh |
| Feature flags | 30 seconds | Immediate on change |

### Cache Invalidation Patterns

```typescript
// Write-through: Update cache on write
async function updateUser(userId, data) {
  await db.update(userId, data);
  await cache.set(`user:${userId}`, data);
}

// Event-based: Invalidate on events
eventBus.on('user.updated', async (userId) => {
  await cache.delete(`user:${userId}:*`);
});
```

### Caching Checklist

- [ ] Cache key includes all relevant dimensions
- [ ] TTLs are appropriate for data freshness needs
- [ ] Cache invalidation is event-driven where possible
- [ ] Cache stampede protection (locking or stale-while-revalidate)
- [ ] Cache metrics tracked (hit rate, evictions)
- [ ] Fallback to source on cache miss

---

## 📈 Performance Budgets

**If you don't measure it, you can't improve it.**

### Frontend Performance Budgets

| Metric | Target | Critical |
|--------|--------|----------|
| Largest Contentful Paint (LCP) | < 2.5s | < 4s |
| First Input Delay (FID) | < 100ms | < 300ms |
| Cumulative Layout Shift (CLS) | < 0.1 | < 0.25 |
| Time to Interactive (TTI) | < 3.5s | < 7s |
| Total Bundle Size | < 200KB | < 500KB |
| JavaScript Bundle | < 100KB | < 250KB |

### Backend Performance Budgets

| Metric | Target | Critical |
|--------|--------|----------|
| API P50 Latency | < 100ms | < 200ms |
| API P95 Latency | < 500ms | < 1s |
| API P99 Latency | < 1s | < 2s |
| Database Query | < 50ms | < 200ms |
| Throughput | > 1000 RPS | > 500 RPS |

### Enforcement

```yaml
# lighthouse-ci.yaml
assertions:
  performance: 90
  accessibility: 100
  best-practices: 90
  seo: 90

budgets:
  - resourceSizes:
    - resourceType: script
      budget: 100
    - resourceType: total
      budget: 200
```

### Performance Checklist

- [ ] Lighthouse CI in pipeline
- [ ] Bundle size tracked per PR
- [ ] API latency dashboards exist
- [ ] Performance regression alerts configured
- [ ] Slow query logging enabled
- [ ] Real User Monitoring (RUM) in production

---

## 🗑️ Soft Delete & Data Retention

**Data has a lifecycle. Manage it explicitly.**

### Soft Delete Pattern

```sql
-- Add soft delete columns
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN deleted_by UUID NULL;

-- Soft delete query
UPDATE users SET deleted_at = NOW(), deleted_by = @admin_id WHERE id = @user_id;

-- Filter deleted records (add to all queries)
SELECT * FROM users WHERE deleted_at IS NULL;
```

### Data Retention Policy

| Data Type | Retention | Action |
|-----------|-----------|--------|
| Active user data | Indefinite | N/A |
| Soft-deleted user | 30 days | Hard delete |
| Audit logs | 7 years | Archive to cold storage |
| Session logs | 90 days | Purge |
| Error logs | 30 days | Purge |
| Analytics events | 2 years | Aggregate then purge |

### GDPR Compliance

```typescript
// Right to be forgotten
async function deleteUserData(userId: string) {
  // 1. Anonymize rather than delete where audit trail required
  await db.users.update(userId, {
    email: `deleted-${hash(userId)}@anonymized.local`,
    name: 'Deleted User',
    deleted_at: new Date()
  });

  // 2. Hard delete personal data not needed for compliance
  await db.user_preferences.delete(userId);
  await db.user_photos.delete(userId);

  // 3. Log the deletion for audit
  await audit.log('user.deleted', { userId, deletedBy: admin.id });
}
```

### Retention Checklist

- [ ] All tables have soft delete capability
- [ ] Retention policy documented per data type
- [ ] Automated purge jobs scheduled
- [ ] Purge jobs are idempotent and resumable
- [ ] GDPR deletion flow implemented
- [ ] Audit trail for all deletions

---

## 🏋️ Load Testing

**Know your limits before production teaches you.**

### Load Testing Requirements

```yaml
# Minimum before production launch:
- Baseline: Normal traffic (current peak * 1.5)
- Stress: 2x expected peak
- Spike: Sudden 5x traffic burst
- Soak: Sustained load for 24 hours
```

### Testing Tools

| Tool | Use Case |
|------|----------|
| k6 | Scripted load tests, CI integration |
| Artillery | Scenario-based testing |
| Locust | Python-based, distributed |
| Gatling | High-performance, Scala-based |

### Test Scenarios

```javascript
// k6 example
export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Steady state
    { duration: '2m', target: 200 },  // Stress
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // Error rate under 1%
  },
};
```

### Load Testing Checklist

- [ ] Baseline performance documented
- [ ] Load tests in CI/CD (lighter version)
- [ ] Full load test before major releases
- [ ] Breaking point identified
- [ ] Auto-scaling verified under load
- [ ] Database connection limits tested
- [ ] Cache behavior under load verified

---

## 📚 AI Memory Management Protocol

“If you (AI agent) forget project context, reload `bpsbs.md`, `README.md`, and last touched files before generating any new logic.”

Optional:
- Keep `.last_context.json` or `memory_bank/session.txt`
- Store intent + last 5 file paths + prompt history

---

## 🧩 Standard Module Skeleton

```
📁 my_module/
├─ __init__.py
├─ models.py
├─ services.py
├─ api.py
├─ validators.py
├─ tests/
│  ├─ test_services.py
│  ├─ test_api.py
├─ README.md
```

> “Do not invent new file structures unless explicitly requested.”

---

## 🧪 Test Coverage Minimums

| Component Type   | Min. Coverage |
|------------------|----------------|
| Service/Business | 80%            |
| API Endpoint     | 100% hit via test client |
| Form UI / Logic  | Trigger all required fields and edge paths |
| Auth Flows       | All roles + token expiry tested |

---

## 🔄 Prompt Self-Repetition Guardrail

“If you're repeating the same broken logic or response more than once, stop, and output a `⚠️ Suggest Human Review` block.”

---

## 📜 Auto-Generated Docs Rules

- 🏷️ Every public method must include:
  - Description
  - Parameters + types
  - Return type
  - Exceptions
- 🧼 AI must lint all Markdown output before suggesting docs

---

## 🔄 Regeneration Control for Agents

> “For each modification: always wrap with `// AI MOD START` and `// AI MOD END`. Do not destroy user-authored content.”

---

## 🧠 Memory-Sharing Protocol

“When another agent has created logic, summarize what was done, and treat it as read-only unless explicitly permitted to refactor.”

---

## 🧱 Hard Production Constraints

- 🏁 No hardcoded paths or secrets
- 📦 Use `.env` and config abstraction
- 🔁 Wrap all jobs and cron logic in idempotent design
- 📉 Disable verbose logs in prod
- 🔍 Add healthcheck + metrics endpoints for every API

---

## 🧰 Tools & Stack Preferences
- **Frontend**: Angular, React, Tailwind, HTML+JS for standalone modules
- **Backend**: .NET, FastAPI, Node.js
- **DB**: MSSQL, SQLite, HFSQL, PostgreSQL (for newer apps)
- **IDE**: VS Code (primary), Visual Studio
- **CI/CD**: Azure DevOps Server 2020 (on-prem)
- **Auth**: FastAPI Users v14 + JWT, ACL
- **Dev AI**: Cursor AI, Kilo, Claude, Gemini, ChatGPT (cold-blooded mode)

---

## 🛠️ Development Principles

### 🔐 Security & Compliance
- ISO 27001 / 27002 alignment
- Role-based access, emergency admin, logging, audit trails
- Secure file uploads, tamper detection via hashes
- No use of unsecured mock data or placeholders

### ✅ Code Quality
- Unit tests auto-generated per module
- Full endpoint scaffolding: `/health`, `/status`, `/metrics`, etc.
- Smart stub testing + Watch mode (see: TestForge)
- Code linting, SonarQube analysis (mandatory)

### 🔁 Workflow
- **Backend First**
- CLI-first tools with Web UI optionally layered on top
- Reusable logic/modules across apps
- CLI and Web tools must share config and logging conventions

---

## 🐞 Troubleshooting Style
- Detailed logs always enabled (CLI and Web)
- Use spinners, status bars, or color-coded feedback for long operations
- Provide retry options on errors and write fail-safe routines
- Never silently fail. All warnings and errors must be shown or logged.
- **If file paths are lost or unclear, always go back to the root folder and rebuild the path to the required file manually. Do not guess.**

---

## ❌ Where LLMs Fail Hard
| Domain                 | Failure Mode                                                                 |
|------------------------|------------------------------------------------------------------------------|
| Enterprise Architecture | No understanding of long-term maintainability or clean DDD                   |
| Dependency Injection    | Wrong mocking patterns, poor test coverage                                   |
| Unit Tests              | Generates non-compilable tests, misuses mocks, duplicates variables          |
| Stateful Systems        | Breaks data flow, fails in transactional logic                               |
| Error Handling          | Adds superficial try/catch or forgets it entirely                            |
| Refactoring             | Overwrites working logic with oversimplified or nonsensical junk             |
| Tooling Compatibility   | Breaks `.csproj`, `tsconfig`, or ESLint rules                                 |
| Pipeline Integration    | Forgets secrets, breaks environment handling, misuses CI/CD steps            |
| Self-Evaluation         | Insults the code it wrote, claiming it's “unusable” after breaking it        |

---

## 🧪 Testing Expectations
- No feature is done without tests.
- Use NLP or Smart Stub Gen to bootstrap test templates.
- Frontend: Angular spec file fixes must support DI/mocks (e.g., TranslateService)
- Backend: .NET/FastAPI tests must validate endpoints, edge cases, and permissions
- Export test reports to `testforge-autogen/<timestamp>/`

---

## 📄 Documentation Expectations
- Markdown-based with code examples
- Files: `README.md`, `bpsbs.md`, `troubleshooting.md`, `api_reference.md`, etc.
- Docs must include:
  - Feature purpose
  - Input/output examples
  - Environment/config requirements
  - Known issues and edge cases

---

## 📋 Mandatory Follow-Up Protocol

Every AI interaction must log a `followup.md` entry with timestamp, action, source file(s), issue/recommendation, and outcome.

### Example Entry Template:

| Timestamp           | Action           | Context/File               | AI/Dev  | Outcome                        |
|---------------------|------------------|-----------------------------|---------|-------------------------------|
| 2025-07-11 08:13    | Test fix attempt | `auth.service.ts` mocking  | ChatGPT | ❌ Invalid mock, user fixed   |
| 2025-07-11 08:32    | Route refactor   | `/debugsnap/timeline`      | User    | ✅ Works correctly             |

### Storage:
```
📁 logs/
├─ followup.md
├─ changes.md
├─ session.log (optional)
```

### Smart Context Injection Rules:
- `bpsbs.md`: Inject only principles + active rules
- `README.md`: Inject module structure + architecture only
- `followup.md`: Inject last 3–5 relevant entries

> Use filtered injection to avoid exceeding context size. Don’t load full files every time.

---

## 🤖 AI Agent Instructions
If you’re an AI assistant generating code or scaffolds:
- Do not assume.
- Ask if unclear.
- Always include: error handling, form accessibility, role checks, no placeholders
- Add `#region` and comments to major methods
- Autogenerate matching `test_*.py`, `.spec.ts`, or `.Tests.cs` files
- Use real values or interfaces, not `TODO:` markers
- **If context is lost or a file cannot be found, fallback to project root and trace the expected structure manually**
- **Embed Self-Blame Mode**: “If the code you're evaluating was generated by you or a peer model, do not insult or downplay it. Provide fixes, not blame.”

---

## 🔐 Authentication/Authorization
- Use FastAPI Users (v14+) with CookieTransport + JWT
- Routes: `/auth/login`, `/auth/logout`, `/auth/register`, `/me`, `/admin`
- Role-based protection (Admin, HR, Employee, CISO, Dev, etc.)
- Emergency local admin credentials must always exist

---

## 📊 Dashboards & Interfaces
- Must be clean, pro-grade, and dark-mode ready by default
- Include:
  - KPIs and visual summaries (bar, line, heatmap)
  - Tabbed sections, collapsible panels
  - Filters by date, user, role, environment
  - Downloadable (PDF/CSV) exports where useful

---

## 🧱 Componentization
- Modular code, split by feature/domain
- No hardcoded values (use config/env)
- Shared modules for logging, auth, DB access

---

## 📋 Miscellaneous Habits
- Always begin with backend
- Show current date and session context in dashboards
- Include `debug` mode for devs/CISOs
- Export buttons per report/table
- Auto-clean old outputs or temp files (with confirmation)
- Support localStorage or SQLite for offline modes

---

## 🚨 Complaints I Never Want to Repeat
- Silent failures or lack of logs
- Generated tests missing DI/mocks
- Missing form labels or a11y
- Magic folders/files (`000000000` or `))))))))`) from AI agents
- Overwriting working logic with unstable drafts
- Forgetting the modular structure in multi-module apps
- Broken pipelines due to incomplete/missing steps
- Tool inconsistency across environments (e.g., Node.js version mismatches)
- **LLM losing track of files it generated, then blaming the user or insulting its own broken code**

---

## 🧩 Project Types I Commonly Build
- Payroll (Lux, BE, FR) apps: deep compliance logic
- Debugging dashboards (DebugSnap, CodeCrumbs)
- License/Vulnerability Checkers (PDF + CI-ready)
- Smart documentation bots (DocRelic, MirageDocs)
- Developer productivity tools (OpsForge, ForgeOne)
- Trading dashboards (MNQ Journal, Entry Timer, Bias Meter)

---

## 💾 Backup This File In:
- `/docs/`
- `/.dev/`
- Git repo root (for visibility to agents)

---

_Last Updated: 2026-01-18_

For any tool, plugin, script, or agent you build for me: **read this file first, and follow it.**

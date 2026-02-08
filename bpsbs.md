
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
- **Implement > Test > Iterate**: Every feature must be tested before being considered done.
- **Never break existing features**: New features must not cause regressions.
- **Document everything**: All modules and changes must include developer- and user-level documentation.

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

### Core Security Rules
- ❌ No plaintext secrets or passwords
- 🔐 Always hash + salt passwords
- 🔍 Validate input even for internal-only forms
- 🧯 Do not expose stack traces in prod
- ⏳ Auto-logout logic if inactive for 60 minutes

### 🚨 AI-SPECIFIC SECURITY ANTI-PATTERNS (v1.1.0)

**CRITICAL**: AI-generated code has **86% XSS failure rate** (vs 31.6% human) and is **2.74x more likely** to contain vulnerabilities. Follow these strict security patterns:

#### 📚 Security Knowledge Base
- **ANTI_PATTERNS_BREADTH.md** - 15 security anti-patterns (225 KB, all languages)
- **ANTI_PATTERNS_DEPTH.md** - Top 7 critical vulnerabilities (252 KB, detailed)

**ALL CODE MUST BE VALIDATED** against these documents before implementation.

#### ⚠️ Top 7 Critical AI Vulnerabilities (by Priority)

1. **Hardcoded Secrets** 🔴
   - ❌ NEVER hardcode API keys, passwords, tokens, or credentials
   - ✅ ALWAYS use environment variables or secret managers
   - ⚠️ Common in AI code: API keys in examples, test credentials left in production

2. **SQL Injection** 🔴
   - ❌ NEVER concatenate strings into SQL queries
   - ✅ ALWAYS use parameterized queries or ORMs
   - ⚠️ 53.3% failure rate in AI code (vs 9.5% human-written)

3. **Cross-Site Scripting (XSS)** 🔴
   - ❌ NEVER output user input without escaping
   - ✅ ALWAYS sanitize and escape ALL user-provided content
   - ⚠️ **86% failure rate in AI-generated code** - THE MOST CRITICAL ISSUE

4. **Insecure Randomness** 🟡
   - ❌ NEVER use `Math.random()`, `rand()`, or non-crypto RNGs for security
   - ✅ ALWAYS use `crypto.randomBytes()`, `secrets.token_hex()`, or equivalent
   - ⚠️ Common for tokens, session IDs, password reset codes

5. **Authentication/Authorization Flaws** 🔴
   - ❌ NEVER trust client-side authentication checks
   - ✅ ALWAYS verify permissions server-side on EVERY request
   - ⚠️ 75.8% of developers incorrectly trust AI-generated auth code

6. **Package Hallucination** 🟡
   - ❌ NEVER use packages without verification
   - ✅ ALWAYS verify package exists before implementation
   - ⚠️ 5-21% of AI suggestions include non-existent packages
   - 🔍 Run `npm list <package>`, `pip show <package>` to verify

7. **Command Injection** 🔴
   - ❌ NEVER concatenate user input into shell commands
   - ✅ ALWAYS use safe APIs or parameterized command builders
   - ⚠️ Critical in scripts, CI/CD, and system automation

#### 🛡️ Pre-Implementation Security Checklist

**BEFORE writing ANY code, verify:**
- [ ] No secrets hardcoded (check ANTI_PATTERNS_DEPTH.md §1)
- [ ] SQL uses parameterized queries (check ANTI_PATTERNS_DEPTH.md §2)
- [ ] User input is escaped/sanitized (check ANTI_PATTERNS_DEPTH.md §3)
- [ ] Crypto RNG for security tokens (check ANTI_PATTERNS_DEPTH.md §4)
- [ ] Auth checks are server-side (check ANTI_PATTERNS_DEPTH.md §5)
- [ ] All packages verified to exist (check ANTI_PATTERNS_DEPTH.md §6)
- [ ] No user input in shell commands (check ANTI_PATTERNS_DEPTH.md §7)

#### 📖 When to Reference Security Docs

**MANDATORY SECURITY CHECKS**:
- **Before authentication implementation** → Read ANTI_PATTERNS_DEPTH.md §5
- **Before database queries** → Read ANTI_PATTERNS_DEPTH.md §2
- **Before user input handling** → Read ANTI_PATTERNS_DEPTH.md §3
- **Before external API calls** → Read ANTI_PATTERNS_DEPTH.md §1
- **When generating tokens/IDs** → Read ANTI_PATTERNS_DEPTH.md §4
- **Before package installation** → Read ANTI_PATTERNS_DEPTH.md §6
- **Before system commands** → Read ANTI_PATTERNS_DEPTH.md §7

#### 🔍 Security Validation Process

```
1. Review specification → Identify security-sensitive areas
2. Check ANTI_PATTERNS_BREADTH.md → Quick pattern reference
3. Check ANTI_PATTERNS_DEPTH.md → Deep dive on critical areas
4. Implement with secure patterns
5. Run security scanner (Copilot) or evaluator (Claude)
6. Verify all 7 critical vulnerabilities addressed
```

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

_Last Updated: 2026-02-07 (v1.9.0.0 - Framework Evolution)_

## 🎯 Framework Platform Support (v1.1.0)

This framework now supports **both Claude Code and GitHub Copilot CLI**:

### Claude Code Platform
- Skills in `.claude/commands/` directory
- Slash command syntax: `/go`, `/coder`, `/tester`
- PRD-driven workflow starting from `genesis/`
- Full autonomous implementation pipeline

### GitHub Copilot CLI Platform  
- Agents in `.copilot/custom-agents/` directory
- Task tool invocation: `task agent_type="general-purpose" prompt="Use coder agent..."`
- GitHub MCP API integration
- Workflow-based development (see `.copilot/WORKFLOW-GUIDE.md`)

### Common Components
- Shared agent personas in `agents/` directory
- Security documents: ANTI_PATTERNS_BREADTH.md, ANTI_PATTERNS_DEPTH.md
- bpsbs.md standards (this file)
- genesis/ folder for PRDs

### Platform-Specific Security Integration

**For Claude Code**:
- Security checks integrated into `/evaluator` and `/coder` skills
- Reference: ANTI_PATTERNS documents
- Use `/standards` to verify security compliance

**For GitHub Copilot CLI**:
- **security-scanner** agent for dedicated vulnerability scanning
- **coder** agent includes pre-implementation security checks
- **pr-review** agent scans for AI vulnerabilities
- Reference: `.copilot/SECURITY-INTEGRATION.md`

---

For any tool, plugin, script, or agent you build for me: **read this file first, and follow it.**

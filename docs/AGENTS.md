# SkillFoundry - Complete Agent Team Reference

**Version 2.0.6** | **The Forge: 53 Core Agents / 60 Skills** | **Penta Platform** (Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex, Google Gemini) | **62 A2A Cards** | **37 Compliance Checks**

---

## Team Overview

Your complete AI development team, covering the full software development lifecycle from product requirements to production reliability.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THE FORGE (53 Core Agents / 60 Skills)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LEADERSHIP        ARCHITECTURE         IMPLEMENTATION       QUALITY       │
│  ───────────       ────────────         ──────────────       ───────       │
│  tech-lead         architect            coder                tester        │
│                    api-design           senior-engineer      review        │
│                    data-architect       refactor             evaluator     │
│                                                              gate-keeper   │
│                                                              fixer ★NEW    │
│                                                                             │
│  SECURITY          RELIABILITY          SPECIALIZED          RELEASE       │
│  ────────          ───────────          ───────────          ───────       │
│  security          sre                  ux-ui                release       │
│                    performance          accessibility                      │
│                    devops               migration                          │
│                                         dependency                         │
│                                         i18n                               │
│                                                                             │
│  ORCHESTRATION     STANDARDS            SUPPORT              MANAGEMENT    │
│  ─────────────     ─────────            ───────              ──────────    │
│  auto              bpsbs                debugger             prd           │
│  go                standards            docs                 stories       │
│  orchestrate       layer-check          learn                context       │
│  delegate                               math-check           memory        │
│  workflow                               version ★NEW         metrics       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Categories

### 1. Leadership (1 Agent)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Tech Lead** | `/tech-lead` | Technical decision arbitration, cross-team coordination, mentorship, strategic planning |

**When to use**: Technical disagreements, architecture decisions, project planning, mentoring developers.

---

### 2. Orchestration (5 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Auto Pilot** | `/auto` | Master workflow orchestrator for autonomous operation |
| **Project Kickstart** | `/go` | **THE main command** - PRD → full implementation pipeline |
| **Project Orchestrator** | `/orchestrate` | Multi-project coordination |
| **Agent Orchestrator** | `/delegate` | Parallel agent dispatching with DAGs |
| **Workflow** | `/workflow` | Workflow guidance and best practices |

**When to use**: Starting projects, coordinating complex multi-step tasks, parallel execution.

---

### 3. Architecture (3 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Cold-Blooded Architect** | `/architect` | Multi-persona architecture review (8 perspectives) |
| **API Design Specialist** | `/api-design` | RESTful/GraphQL API design, OpenAPI specs |
| **Data Architect** | `/data-architect` | Schema design, query optimization, normalization, migrations |

**When to use**: System design, database schema decisions, API contracts, architectural reviews.

---

### 4. Implementation (3 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Ruthless Coder** | `/coder` | TDD implementation with mandatory security validation |
| **Senior Engineer** | `/senior-engineer` | Assumption surfacing, push-back, simplicity enforcement, scope discipline |
| **Refactor Agent** | `/refactor` | Code quality improvement with safety net |

**When to use**: Writing code, implementing features, improving existing code quality.

---

### 5. Quality (5 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Ruthless Tester** | `/tester` | Brutal testing, edge cases, security tests |
| **Code Review** | `/review` | Merciless code review with high signal-to-noise |
| **Merciless Evaluator** | `/evaluator` | BPSBS compliance verification |
| **Gate Keeper** | `/gate-keeper` | Capability verification, gate checks, auto-fix routing |
| **Fixer Orchestrator** ★NEW | `/fixer` | Auto-remediation router, retry coordinator, smart escalation |

**Fixer Modes**:
- `/fixer --violation="type" --file="path"` - Manual remediation routing
- `/fixer --retry --story="ID"` - Retry specific fix
- `/fixer --stats` - View remediation statistics
- `/fixer --escalations` - Review all escalations

**When to use**: Testing, code reviews, compliance checks, pre-release verification, auto-fixing violations.

---

### 6. Standards (3 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **BPSBS Enforcement** | `/bpsbs` | Best practices and standards enforcement |
| **Standards Oracle** | `/standards` | Code standards verification |
| **Layer Check** | `/layer-check` | Three-layer validation (DB/Backend/Frontend) |

**When to use**: Verifying code meets standards, ensuring all layers are complete.

---

### 7. Security (2 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Security Specialist** | `/security` | STRIDE threat modeling, OWASP audits, penetration testing mindset, vulnerability hunting |
| **Security Scanner** | `/security-scanner` | AI-generated code vulnerability detection using ANTI_PATTERNS databases |

**Security Specialist Modes**:
- `/security audit [target]` - Full security audit
- `/security threat-model [feature]` - STRIDE analysis
- `/security pentest [endpoint]` - Attack vector enumeration
- `/security review [code]` - Security-focused code review
- `/security incident [desc]` - Incident response
- `/security harden [system]` - Hardening recommendations

**When to use Security Specialist**: Before releases, when handling sensitive data, auth implementations, any user input handling.

**Security Scanner Modes**:
- Quick scan (top 7 critical patterns from docs/ANTI_PATTERNS_DEPTH.md)
- Comprehensive scan (all 15 patterns from both ANTI_PATTERNS files)
- Targeted scan (deep dive on specific vulnerability type)

**When to use Security Scanner**: Automated vulnerability scanning, CI/CD security gates, AI-generated code review.

---

### 8. Reliability (3 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **SRE Specialist** | `/sre` | Incident response, SLOs/SLIs, monitoring, chaos engineering, runbooks |
| **Performance Optimizer** | `/performance` | Performance bottleneck identification, optimization |
| **DevOps Specialist** | `/devops` | CI/CD pipelines, infrastructure as code, deployment |

**SRE Modes**:
- `/sre incident [desc]` - Guide incident response
- `/sre postmortem [incident]` - Blameless postmortem
- `/sre slo [service]` - Define SLOs, SLIs, error budgets
- `/sre monitor [system]` - Design monitoring/alerting
- `/sre runbook [scenario]` - Create operational runbook
- `/sre chaos [target]` - Chaos engineering experiments

**When to use**: Production issues, setting up monitoring, incident response, reliability improvements.

---

### 9. Specialized (5 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **UX/UI Specialist** | `/ux-ui` | UI audit, design, migration, rewrite, design system enforcement |
| **Accessibility Specialist** | `/accessibility` | WCAG 2.1 Level AA compliance |
| **Migration Specialist** | `/migration` | Safe database schema changes with rollback |
| **Dependency Manager** | `/dependency` | Dependency management, vulnerability scanning |
| **i18n Specialist** | `/i18n` | Internationalization, localization, RTL support, multi-language |

**UX/UI Modes**:
- `/ux-ui audit` - Analyze existing UI for problems
- `/ux-ui design [component]` - Design new UI
- `/ux-ui migrate [from] [to]` - Framework migration
- `/ux-ui rewire [component]` - Restructure without changing visuals
- `/ux-ui rewrite [component]` - Complete rewrite of bad UI
- `/ux-ui system` - Design system enforcement

**i18n Modes**:
- `/i18n setup [stack]` - Set up i18n infrastructure
- `/i18n audit` - Find hardcoded strings
- `/i18n extract` - Extract translatable strings
- `/i18n locale [locale]` - Add new locale
- `/i18n rtl` - RTL support

**When to use**: UI improvements, accessibility audits, database migrations, adding languages.

---

### 10. Release (1 Agent)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Release Manager** | `/release` | Versioning, changelogs, release notes, deployment coordination, rollback plans |

**Modes**:
- `/release prepare [version]` - Version bump, changelog, checklist
- `/release changelog [from] [to]` - Generate changelog
- `/release notes [version]` - User-facing release notes
- `/release checklist` - Pre-release verification
- `/release rollback [version]` - Rollback plan
- `/release hotfix [issue]` - Emergency hotfix process

**When to use**: Preparing releases, generating changelogs, hotfix situations.

---

### 11. Support (5 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Debug Hunter** | `/debugger` | Four-phase systematic debugging, root cause analysis |
| **Documentation Codifier** | `/docs` | Documentation generation |
| **Project Educator** | `/educate` | End-user learning materials: tutorials, guides, glossary, user journeys |
| **Ops Tooling Generator** | `/ops` | Admin panels, debug overlays, feedback systems for completed projects |
| **Learning Assistant** | `/learn` | AI workflow learning guide |
| **Math Checker** | `/math-check` | Mathematical formula validation |

**Ops Tooling Modes:**
- `/ops admin` - Admin/monitoring panel (log viewer, API health, system metrics)
- `/ops debug` - Debug overlay with Ctrl+Shift+D toggle (element inspector, network panel, state diff)
- `/ops feedback` - End-user feedback system (bug reports, feature requests, screenshot upload)
- `/ops all` - Generate all three components

**When to use**: Debugging issues, generating docs, creating admin/debug tooling, learning the framework, verifying calculations.

---

### 12. Management (6 Agents)

| Agent | Command | Purpose |
|-------|---------|---------|
| **PRD Architect** | `/prd` | Create structured PRDs (saved to genesis/) |
| **Story Generator** | `/stories` | PRD to implementation stories |
| **Context Manager** | `/context` | Token budget control |
| **Memory Manager** | `/memory` | Persistent knowledge storage |
| **Metrics Dashboard** | `/metrics` | Execution metrics, performance tracking |
| **Version Manager** | `/version` | Show version info, check for updates, explain version semantics |

**Version Manager Modes:**
- `/version` - Show current version and check for updates
- `/version --check` - Check for updates only
- `/version --info` - Detailed version breakdown
- `/version --history` - Show version history from changelog

**When to use**: Project planning, tracking progress, managing context, checking framework version.

---

### 13. Knowledge & Intelligence (v1.8.0+) (1 Agent)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Knowledge Curator** | `/memory harvest` | Knowledge evaluation, promotion pipeline, cross-project learning |

**When to use**: After completing projects to extract reusable knowledge, before starting projects to apply learned patterns.

---

### 14. Swarm Coordination (v1.8.0.1+) (1 Agent)

| Agent | Module | Purpose |
|-------|--------|---------|
| **Swarm Coordinator** | `agents/_swarm-coordinator.md` | Self-organizing agent coordination, task queue management, conflict resolution |

**Swarm Tools:**
- `parallel/swarm-queue.sh` - Shared task queue with state machine
- `parallel/swarm-scratchpad.sh` - Inter-agent communication
- `parallel/conflict-detector.sh` - File conflict detection
- `/swarm status` - View swarm state

**When to use**: Parallel execution with dynamic agent assignment, multi-agent coordination.

---

### 15. Agent Learning (v1.9.0.0) (1 Agent)

| Agent | Module | Purpose |
|-------|--------|---------|
| **Agent Learning Profile** | `agents/agent-profile.md` | Code style learning, cross-agent knowledge transfer, preference adaptation |

**Capabilities:**
- Detects naming conventions, formatting, import organization, error handling patterns
- Promotes patterns from project-local to universal across 5+ observations
- Cross-agent learning: fixer patterns teach gate-keeper prevention

**When to use**: Automatically active during code generation to apply learned developer preferences.

---

### 16. Developer Experience (v1.8.0.2+) (5 Commands)

| Command | Purpose |
|---------|---------|
| `/explain` | Explain last agent action in plain English |
| `/undo` | Revert last reversible agent action |
| `/cost` | Token usage report by agent/story/phase |
| `/health` | Framework self-diagnostic |
| `/swarm` | Swarm coordination management |

**When to use**: Understanding agent decisions, reverting mistakes, monitoring costs, checking framework health.

---

## Platform Invocation

| Platform | Syntax | Example |
|----------|--------|---------|
| **Claude Code** | `/command` | `/security audit src/` |
| **GitHub Copilot CLI** | `task(agent)` | `task("security", "audit src/")` |
| **Cursor** | Rule reference | "use security rule to audit src/" |
| **OpenAI Codex** | `$skill-name` | `$security audit src/` |

### OpenAI Codex

Skills are stored in `.agents/skills/*/SKILL.md` and invoked via `$skill-name` syntax. Codex supports auto-discovery: skills are implicitly activated based on their description fields, so explicit invocation is not always required. The agent will match a relevant skill when the user's prompt aligns with the skill's declared purpose.

---

## Agent Selection Guide

### By Task Type

| Task | Primary Agent | Support Agents |
|------|---------------|----------------|
| **New feature** | `/go` | `/prd`, `/architect`, `/coder` |
| **Bug fix** | `/debugger` | `/coder`, `/tester` |
| **Code review** | `/review` | `/security`, `/evaluator` |
| **Performance issue** | `/performance` | `/sre`, `/data-architect` |
| **Security audit** | `/security` | `/review`, `/dependency` |
| **UI redesign** | `/ux-ui` | `/accessibility`, `/architect` |
| **Database changes** | `/data-architect` | `/migration`, `/coder` |
| **Release** | `/release` | `/tester`, `/devops` |
| **Production incident** | `/sre` | `/debugger`, `/security` |
| **Technical decision** | `/tech-lead` | `/architect`, `/senior-engineer` |
| **Multi-language app** | `/i18n` | `/ux-ui`, `/tester` |

### By Lifecycle Phase

```
PLANNING          DEVELOPMENT        QUALITY           RELEASE           PRODUCTION
─────────         ───────────        ───────           ───────           ──────────
/prd              /coder             /tester           /release          /sre
/architect        /senior-engineer   /review           /devops           /debugger
/tech-lead        /refactor          /security         /dependency       /performance
/stories          /data-architect    /evaluator
                  /ux-ui             /accessibility
                  /i18n              /layer-check
```

---

## Common Workflows

### 1. Full Feature Implementation

```bash
/prd "User authentication with JWT"     # Create PRD
/go --validate                          # Validate PRD
/security threat-model "auth"           # Security analysis
/go                                     # Implement
/layer-check                            # Verify all layers
/release prepare v1.1.0                 # Prepare release
```

### 2. Code Quality Improvement

```bash
/review src/                            # Code review
/evaluator src/                         # BPSBS compliance
/ux-ui audit                            # UI audit
/refactor src/utils/                    # Refactor identified issues
/tester                                 # Verify no regressions
```

### 3. Production Incident

```bash
/sre incident "API returning 500s"      # Start incident response
/debugger                               # Root cause analysis
/coder                                  # Implement fix
/tester                                 # Verify fix
/release hotfix "API-500-fix"           # Deploy hotfix
/sre postmortem "api-500-incident"      # Document learnings
```

### 4. Security Hardening

```bash
/security audit src/                    # Full security audit
/dependency                             # Check for CVEs
/security review src/auth/              # Deep auth review
/coder                                  # Fix vulnerabilities
/security audit src/                    # Verify fixes
```

### 5. Multi-Country Deployment

```bash
/i18n setup react                       # Set up i18n
/i18n audit                             # Find hardcoded strings
/i18n locale fr-FR                      # Add French
/i18n locale de-DE                      # Add German
/ux-ui rtl                              # If needed: RTL support
/tester                                 # Test all locales
```

---

## Agent Relationships

```
                              ┌─────────────┐
                              │  tech-lead  │
                              └──────┬──────┘
                                     │ arbitrates
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   ARCHITECTURE  │       │ IMPLEMENTATION  │       │     QUALITY     │
│  architect      │◄─────►│  coder          │◄─────►│  tester         │
│  api-design     │       │  senior-engineer│       │  review         │
│  data-architect │       │  refactor       │       │  evaluator      │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │                         ▼                         │
         │               ┌─────────────────┐                 │
         └──────────────►│    security     │◄────────────────┘
                         └─────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │   sre    │ │  devops  │ │ release  │
              └──────────┘ └──────────┘ └──────────┘
```

---

## Quick Reference Card

### Most Used Commands

| Command | Purpose |
|---------|---------|
| `/go` | Implement all PRDs |
| `/prd "idea"` | Create new PRD |
| `/coder` | Write code with TDD |
| `/review` | Code review |
| `/tester` | Run tests |
| `/security audit` | Security check |
| `/layer-check` | Verify all layers |

### New in v1.6.0

| Command | Purpose |
|---------|---------|
| `/security` | Dedicated security specialist |
| `/security-scanner` | AI vulnerability scanner |
| `/data-architect` | Database/schema expert |
| `/release` | Release management |
| `/i18n` | Internationalization |
| `/tech-lead` | Technical leadership |
| `/sre` | Site reliability |
| `/ux-ui` | UI/UX specialist |
| `/senior-engineer` | Senior engineering practices |

---

## Copilot-Only Agents (5 GitHub-Specific)

These agents are available only on GitHub Copilot CLI as they require GitHub MCP integration:

| Agent | Purpose |
|-------|---------|
| **commit-message** | AI-powered conventional commit message generation |
| **github-actions** | GitHub Actions workflow creation and debugging |
| **github-orchestrator** | GitHub-specific project orchestration |
| **pr-review** | Pull request review with GitHub API integration |
| **security-scanner** (extended) | PR-specific security scanning via GitHub diff API |

These agents are not ported to Claude Code or Cursor because they depend on GitHub-specific APIs and MCP server integrations.

---

## Shortcut Commands (12)

Quick-access shortcuts for common workflows. Available on all 4 platforms.

| Shortcut | Name | What it does |
|----------|------|--------------|
| `/forge` | **Summon The Forge** | Full pipeline: validate + implement + test + audit + harvest + debrief |
| `/gosm` | Go Semi-Auto | `/go --mode=semi-auto` — recommended default |
| `/goma` | Go Autonomous | `/go --mode=autonomous` — full autonomy |
| `/blitz` | Blitz Mode | `/go --mode=semi-auto --parallel --tdd` — max speed with safety |
| `/gohm` | Harvest Memory | Extract lessons to `memory_bank/knowledge/` (`--push` to auto-commit) |
| `/ship` | Ship It | Layer-check + security audit + release prepare |
| `/nuke` | Nuke & Rebuild | Rollback all changes + clear state (requires confirmation) |
| `/status` | Status Dashboard | PRDs, stories, layers, memory, execution state |
| `/profile` | Session Profiles | Load/create workflow presets (default, blitz, cautious, autonomous) |
| `/replay` | Replay Execution | Re-run last `/go` or `/forge` with same params |
| `/analytics` | Agent Analytics | Invocation stats, success rates, performance trends |
| `/anvil` | **Anvil Quality Gate** | Run 6-tier validation (T1-T6) on changed files or specific tiers |

---

## Statistics

| Category | Count |
|----------|-------|
| **Total Agents** | 53 (core roster) |
| **Shortcut Commands** | 12 |
| **Claude Code Skills** | 60 |
| **Copilot CLI Agents** | 63 (46 + 12 + 5 GitHub-specific) |
| **Cursor Rules** | 53 (41 + 12) |
| **Codex Skills** | 60 |
| **Shared Modules** | 46 |
| **Session Profiles** | 4 (default, blitz, cautious, autonomous) |
| **PRD Templates** | 4 (api-service, cli-tool, fullstack-feature, dashboard) |
| **Compliance Presets** | 3 (HIPAA, SOC2, GDPR) |
| **Platforms Supported** | 4 |

---

*SkillFoundry Framework v2.0.6 - February 2026 - The Forge*

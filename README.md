# Claude AS - Agents & Skills Framework

A comprehensive AI agent and skills framework for structured, production-ready AI-assisted development. **Now supports Claude Code, GitHub Copilot CLI, and Cursor** with advanced GitHub integration and AI-specific security hardening.

## 🆕 What's New - Version 1.9.0 (Framework Evolution)

### Auto-Memory Recording (v1.9.0.10)
- **Agents now write lessons automatically** — Orchestrator and Coder record to `memory_bank/knowledge/` after each story
- **Three knowledge types**: `decisions.jsonl` (architectural choices), `corrections.jsonl` (bugs/fixes), `patterns.jsonl` (reusable patterns)
- **All 3 platforms** — Works on Claude Code, Cursor, and Copilot (8 agent files updated)
- **Full lifecycle**: Install creates dir → Agents learn automatically → `scripts/memory.sh harvest` → Git push → Available everywhere

### Memory Bank Install Fix (v1.9.0.10)
- **`memory_bank/knowledge/` now created on install** — Previously missing, so harvest and lesson sync never worked
- **Seeded with `bootstrap.jsonl`** — Agents can write lessons from session one

### Documentation Deduplication (v1.9.0.8)
- **CLAUDE.md slimmed**: 2023 lines → 267 lines (framework-specific only)
- **New `docs/enterprise-standards.md`** (1352 lines) — Production patterns loaded on demand, not every session
- **Three-tier documentation**: Global `~/.claude/CLAUDE.md` → Framework `CLAUDE.md` → `docs/enterprise-standards.md`
- **ANTI_PATTERNS moved**: Install to `docs/` instead of project root; `update.sh` auto-migrates existing projects
- **bpsbs.md retired**: No longer copied to projects (covered by CLAUDE.md + global rules)
- **~13K tokens/session saved** by eliminating triple-injection of same rules

### Deliberation Protocol (v1.9.0.7)
- **`agents/_deliberation-protocol.md`** - Structured multi-perspective review before implementation
- **Triggers**: Architectural decisions, security-sensitive changes, multiple valid approaches
- **3-phase flow**: Proposal (architect) → Challenge (perspectives) → Synthesis (decision record)
- **Integrated**: project-orchestrator adds Deliberation Phase, architect opens/closes deliberation

### NASAB Framework Integration (v1.9.0.6)
- **Evidence-Based Gates** — 5 capability levels with evidence accumulation in gate-keeper
- **Constraint Classification** — 4 constraint types (Physical/Conventional/Regulatory/BestPractice) in architect
- **Bidirectional Iteration** (`agents/_bidirectional-iteration.md`) — Track fix-break cycles, detect oscillation
- **Dissent Resolution** (`agents/_dissent-resolution.md`) — Protocol for conflicting agent recommendations
- **Pattern Detection** — Parental inheritance: detect and surface unconscious coding patterns in memory-curator
- **Context-Aware Math Validation** — Check formula assumptions against current context
- **Oscillation Detection** — Stop retrying when fix-break cycles detected in fixer-orchestrator

### Knowledge Hub — Remote Distribution (v1.9.0.5)
- **`scripts/knowledge-sync.sh`** - Git-based sync for knowledge, scratchpads, and metrics
- **Commands**: `setup`, `push`, `pull`, `scratchpad push/pull`, `metrics push`, `status`
- **Offline-first** — commits locally, syncs when online
- **Cross-machine scratchpads** — continue sessions on any machine
- **Hub directories**: `knowledge/` (lessons), `scratchpads/` (session state), `metrics/` (usage)
- **Integrated**: `update.sh --remote`, `harvest.sh` auto-push, `memory.sh hub`

### Persistent Scratchpad — Cross-Platform Continuity (v1.9.0.4)
- **Auto-persisted** `.claude/scratchpad.md` — written after every major action, read on session start
- **Seamless platform switching** — hit context limit in Claude Code, continue in Copilot CLI or Cursor
- **No manual handoff** — scratchpad is always current, next session picks up automatically

### Platform Sync Engine (v1.9.0.3)
- **`scripts/sync-platforms.sh`** - Generate all 3 platform command files from agent source files
- **Commands**: `sync --all`, `check`, `list`, `diff` with `--dry-run` support
- **`command:` frontmatter field** - All 26 public agents mapped to command names
- **Workflow**: Create agent file → run `sync-platforms.sh sync --all` → 72 platform files generated

### Phase 4: Advanced Intelligence (v1.9.0.0)
- **Semantic Knowledge Search** (`scripts/semantic-search.sh`) - TF-IDF keyword-weighted natural language search over all JSONL knowledge bases
- **Monorepo Support** (`scripts/monorepo.sh`) - Cross-package dependency detection for Node.js, Python, Rust, Go, .NET (up to 20 packages)
- **Agent Learning Profiles** (`agents/agent-profile.md`) - Agents learn code style preferences across projects and share patterns
- **Compliance Presets** (`agents/compliance-profiles/`) - HIPAA (22 rules), SOC2 (28 rules), GDPR (27 rules) gate-keeper rule sets
- **Usage**: `/go --compliance=hipaa|soc2|gdpr`

### Phase 3: Developer Experience (v1.8.0.2)
- **New Commands**: `/explain` (explain last action), `/undo` (revert last action), `/cost` (token usage), `/health` (framework diagnostics)
- **Cost Tracking** (`scripts/cost-tracker.sh`) - Record and report token usage by agent, story, phase
- **Live Dashboard** (`scripts/dashboard.sh`) - Terminal UI with progress bars, agent status, and cost summary

### Phase 2: Swarm Agent Coordination (v1.8.0.1)
- **Swarm Mode** - Self-organizing agent coordination (alternative to wave-based dispatch)
- **Shared Task Queue** (`parallel/swarm-queue.sh`) - Full SwarmTask state machine (QUEUED → CLAIMED → IN_PROGRESS → COMPLETE/FAILED/BLOCKED)
- **Inter-agent Scratchpad** (`parallel/swarm-scratchpad.sh`) - Agents communicate interface changes and warnings
- **File Conflict Detection** (`parallel/conflict-detector.sh`) - Prevents concurrent file edits
- **Usage**: `/swarm status`, `/swarm queue`, `/swarm conflicts`

### Phase 1: Knowledge Exchange (v1.8.0.0)
- **Knowledge Harvesting** (`scripts/harvest.sh`) - Extract and promote knowledge across projects
- **Project Registry** (`scripts/registry.sh`) - Track all registered projects
- **Knowledge Curator** agent - Evaluates and promotes knowledge entries
- **Promotion Pipeline**: PROJECT_LOCAL → HARVESTED → CANDIDATE → PROMOTED → BOOTSTRAP

---

## 🆕 What's New - Version 1.7.0 (Auto-Remediation & Autonomous Execution)

### Game-Changing Feature: Self-Healing Development Pipeline
**Problem Solved:** Traditional AI development stops at every quality gate violation, requiring constant user intervention. With 30+ stories, this creates massive friction.

**Solution:** Auto-remediation system that fixes 90%+ of violations autonomously.

### New Agent: Fixer Orchestrator
- **Auto-remediation intelligence** - Routes violations to appropriate specialists
- **Smart retry loops** - 3 attempts with exponential backoff
- **Escalation only when necessary** - User interrupted only for critical decisions
- **Parallel remediation** - Independent violations fixed simultaneously
- **Full audit trail** - `logs/remediations.md` and `logs/escalations.md`

### Three Execution Modes
| Mode | User Interruptions | Use Case |
|------|-------------------|----------|
| **Supervised** | Every violation | Learning the system, maximum control |
| **Semi-Autonomous** ⭐ | Phase checkpoints + escalations only | **Recommended** - balanced speed & oversight |
| **Autonomous** | Project completion only | High trust, minimal friction |

### Auto-Fix Capabilities
✅ **Routine Violations (No User Needed):**
- Missing tests → Tester generates them
- Security headers → Security Specialist adds them
- Dead code → Refactor Agent removes it
- N+1 queries → Data Architect optimizes them
- Performance issues → Performance Optimizer fixes them
- Accessibility violations → Accessibility Specialist corrects them
- Missing docs → Documentation Codifier generates them

❌ **Critical Decisions (User Input Required):**
- Architectural choices (Redis vs. in-memory caching)
- Business logic ambiguities (payment gateway selection)
- Security policy decisions (session vs. JWT strategy)
- Breaking API changes affecting external consumers

### Usage
```bash
/go --mode=semi-auto       # Auto-fix routine violations (recommended)
/go --mode=autonomous      # Full autonomy, minimal interruptions
/go --mode=supervised      # Traditional blocking mode (default)
/version                   # Show version and check for updates
```

### Impact
- **90%+ reduction** in user interruptions
- **Faster execution** - No waiting for manual fixes
- **Consistent quality** - Standards enforced automatically
- **User time focused** on strategic decisions, not routine quality issues

### Documentation
- **Escalation Criteria Matrix** - `docs/ESCALATION-CRITERIA.md`
- **Remediation Logs** - `logs/remediations.md`
- **Escalation Logs** - `logs/escalations.md`

---

### Version Management System (NEW)

**Semantic Versioning:** `MAJOR.FEATURE.DATABASE.ITERATION`

Current version: **1.9.0.8**

- **1** - Major version (breaking changes require fresh install)
- **9** - Feature version (new capabilities, safe update)
- **0** - Database version (schema changes require migration)
- **0** - Iteration (patches and bug fixes, safe update)

**Check for updates:**
```bash
/version                    # In Claude Code
./update.sh --version       # From command line
scripts/version-check.sh    # Detailed version comparison
```

**Update types:**
- Patch (X.X.X.1) → Run `./update.sh` ✅ Safe
- Feature (X.8.0.0) → Run `./update.sh` ✅ Safe
- Database (X.X.1.0) → Backup, run `./update.sh --migrate` ⚠️ Migration
- Major (2.0.0.0) → Backup, run `./install.sh --force` ⚠️ Breaking changes

---

## 🆕 What's New - Version 1.3.3 (Quick Wins & Enhanced Onboarding)

### Quick Wins Implemented
- ✅ **One-Click Installation** - Auto-detect platform and OS, install with single command
- ✅ **Quick Start Wizard** - Interactive setup wizard for new projects
- ✅ **Enhanced Documentation** - Real-world examples for web apps and APIs
- ✅ **Context Management** - Already implemented across all platforms

## 🆕 What's New - Version 1.5.0 (Phase 4: Observability & Tracing)

### Phase 4: Observability & Tracing Complete
- ✅ **Observability Infrastructure** - Trace logger, metrics collector, audit logger
- ✅ **Trace Viewer** - Web-based visualization of agent activities
- ✅ **Metrics Dashboard** - Real-time metrics and performance tracking
- ✅ **Audit Trail** - Complete audit logging for compliance

## 🆕 What's New - Version 1.4.1 (Phase 3: Full Implementation)

### Phase 3: Full Node.js Implementation Complete
- ✅ **MCP Servers** - Complete Node.js implementations for all 4 servers (filesystem, database, testing, security)
- ✅ **Dashboard** - Full Express.js server and HTML/CSS/JS client
- ✅ **Production Ready** - All code is functional and ready to use

## 🆕 What's New - Version 1.4.0 (Phase 3: Advanced Features)

### Phase 3: Advanced Features Complete
- ✅ **Persistent Memory System** - `/remember`, `/recall`, `/correct` commands with CLI tools
- ✅ **MCP Integration** - Four MCP servers (filesystem, database, testing, security)
- ✅ **Visual Dashboard** - Web UI for PRD management, story tracking, metrics
- ✅ **Parallel Execution** - DAG-based parallel task execution

## 🆕 What's New - Version 1.3.5 (Phase 2 Polish)

### Phase 2 Polish Complete
- ✅ **Reflection Protocol** - Added to all 8 specialized agents (refactor, performance, dependency, review, migration, api-design, devops, accessibility)
- ✅ **Enhanced Integration Tests** - 3 new workflow tests (wizard, update, multi-platform)
- ✅ **Windows PowerShell Error Handling** - Comprehensive error handling, rollback, diagnostics in install.ps1 and update.ps1
- ✅ **Enhanced Diagnostics** - More system information, better troubleshooting data

### Previous: Version 1.3.4 (Phase 2 Core Enhancements)
- ✅ **Agent Reflection Protocol** - Structured self-critique for all agents
- ✅ **Test Suite Expansion** - 19+ tests across 8 categories
- ✅ **Error Handling & Recovery** - Actionable errors, automatic rollback

### Previous: Version 1.3.3 (Quick Wins)

### New Specialized Agents (8 New Agents)
- ✅ **Refactor Agent** - Code quality improvement with TDD safety net
- ✅ **Performance Optimizer** - Performance bottleneck identification and optimization
- ✅ **Dependency Manager** - Secure dependency management and vulnerability scanning
- ✅ **Code Review Agent** - Merciless code review with high signal-to-noise ratio
- ✅ **Migration Specialist** - Safe database schema changes with rollback
- ✅ **API Design Specialist** - RESTful/GraphQL API design and documentation
- ✅ **DevOps Specialist** - CI/CD pipelines and infrastructure as code
- ✅ **Accessibility Specialist** - WCAG 2.1 Level AA compliance

### Enhanced Existing Agents
- 🔧 **Coder**: References to refactor and performance agents
- 🔧 **Tester**: References to performance testing
- 🔧 **Architect**: Added Performance, Accessibility, and DevOps personas
- 🔧 **Go**: Enhanced workflow with optional specialized agents

### Platform Expansion
- 📈 **Claude Code**: 22 → 30 skills (+8)
- 📈 **Copilot CLI**: 28 → 36 agents (+8)
- 📈 **Cursor**: 22 → 30 rules (+8)
- 📈 **Total**: 72 → 96 agents/skills/rules (+24)

### Triple-Platform Support
- ✅ **Claude Code**: Original platform with `/command` syntax
- ✅ **GitHub Copilot CLI**: Full integration with `task()` tool
- ✅ **Cursor**: Rules-based AI assistance
- ✅ **Platform Selection**: Choose during installation with `--platform` flag
- ✅ **Windows Support**: PowerShell scripts (install.ps1, update.ps1) for Windows users

### GitHub Integration (Copilot CLI)
- 🔗 **GitHub Orchestrator**: Workflow coordination using GitHub MCP APIs
- 🔍 **PR Review Agent**: Ruthless code reviews with GitHub context
- ⚙️ **GitHub Actions Agent**: CI/CD debugging and failure analysis
- 💬 **Commit Message Generator**: Conventional commit messages from diffs

### Security Hardening
- 🔒 **AI Security Anti-Patterns**: 15 vulnerability patterns (BREADTH + DEPTH guides)
- 🛡️ **Security Scanner Agent**: Detects AI-specific vulnerabilities
- 🚨 **Top 7 Critical Issues**: Hardcoded secrets, SQL injection, XSS, and more
- 📊 **86% XSS failure rate** in AI code → prevented by framework

### Statistics
- **46 Claude Code Skills** (`.claude/commands/`) - v1.9.0.1: +1 educate command
- **49 Copilot CLI Agents** (`.copilot/custom-agents/`)
- **41 Cursor Rules** (`.cursor/rules/`)
- **46 Shared Agent Modules** (cross-platform) - includes knowledge-curator, _swarm-coordinator, agent-profile, project-educator
- **3 Compliance Presets** (HIPAA, SOC2, GDPR)
- **2 Security Guides** (477 KB of AI vulnerability knowledge)
- **7 Documentation Guides** (comprehensive workflows, escalation criteria, and examples)
- **Triple Platform** (Claude Code, GitHub Copilot CLI, Cursor)
- **Windows Support** (PowerShell scripts)

### New in v1.6.0 - The Dream Team
- **Security Specialist** (`/security`) - STRIDE, OWASP, vulnerability hunting
- **Data Architect** (`/data-architect`) - Schema design, query optimization
- **Release Manager** (`/release`) - Versioning, changelogs, rollback plans
- **i18n Specialist** (`/i18n`) - Internationalization, localization, RTL
- **Tech Lead** (`/tech-lead`) - Technical decisions, arbitration, mentorship
- **SRE Specialist** (`/sre`) - Incident response, SLOs, monitoring, chaos
- **UX/UI Specialist** (`/ux-ui`) - UI audit, design, migration, rewrite
- **Senior Engineer** (`/senior-engineer`) - Assumption surfacing, push-back, simplicity

---

## IMPORTANT: Installation

```
╔═══════════════════════════════════════════════════════════════════╗
║  claude_as is a TEMPLATE - DO NOT copy it into your projects!     ║
║                                                                   ║
║  Keep it in ONE central location and INSTALL from there.          ║
╚═══════════════════════════════════════════════════════════════════╝
```

### First Time Setup

1. **Keep claude_as in a central location** (e.g., `~/DevLab/IDEA/claude_as/`)
2. **Never move or copy the claude_as folder into projects**

### Correct Structure

```
~/DevLab/
├── IDEA/
│   └── claude_as/                    ← TEMPLATE (stays here forever)
│       ├── .claude/commands/
│       ├── genesis/
│       ├── install.sh
│       └── ...
│
├── ProjectA/                         ← Your project
│   ├── .claude/commands/             ← INSTALLED from template
│   ├── genesis/
│   └── [your code]
│
└── ProjectB/                         ← Another project
    ├── .claude/commands/             ← INSTALLED from template
    ├── genesis/
    └── [your code]
```

### WRONG (Don't Do This)

```
~/DevLab/ProjectA/
└── claude_as/                        ← WRONG! Don't copy folder into project
    └── .claude/commands/             ← Claude can't find this
```

---

## Quick Start

### For Claude Code

```bash
# 1. Create your project folder
mkdir ~/DevLab/MyNewProject
cd ~/DevLab/MyNewProject

# 2. Run the installer FROM the central claude_as location
~/DevLab/IDEA/claude_as/install.sh --platform=claude

# 3. Start Claude Code
claude

# 4. Create PRDs and go
> /prd "your feature idea"
> /go
```

### For Cursor (NEW)

```bash
# Windows PowerShell
cd C:\DevLab\MyNewProject
C:\DevLab\IDEA\claude_as\install.ps1 -Platform cursor

# Linux/Mac (bash)
cd ~/DevLab/MyNewProject
~/DevLab/IDEA/claude_as/install.sh --platform=cursor

# Rules are automatically loaded by Cursor from .cursor/rules/
# Use in Cursor chat: "use go rule" or "follow coder rule"
```

### For GitHub Copilot CLI

```bash
# 1. Create your project folder
mkdir ~/DevLab/MyNewProject
cd ~/DevLab/MyNewProject

# 2. Install framework
~/dev_tools_20260120_latest/claude_as/install.sh --platform=copilot

# 3. View available agents
ls .copilot/custom-agents/

# 4. Use agents via task tool
# See .copilot/helper.sh for quick reference
# See .copilot/WORKFLOW-GUIDE.md for complete examples
```

### Interactive Installation

```bash
# Linux/Mac (bash)
cd /path/to/your/project
~/path/to/claude_as/install.sh
# Choose: 1) Claude Code  2) GitHub Copilot CLI  3) Cursor

# Windows (PowerShell)
cd C:\path\to\your\project
C:\path\to\claude_as\install.ps1
# Choose: 1) Claude Code  2) GitHub Copilot CLI  3) Cursor
```

---

## The Genesis Workflow

**Your entire project starts from the `genesis/` folder.**

```
genesis/                         ← Drop your PRDs here
├── TEMPLATE.md                  ← PRD template
├── user-authentication.md       ← Your PRD
├── payment-system.md            ← Another PRD
└── notification-service.md      ← Another PRD

Then just run: /go
```

### One Command to Rule Them All

```bash
claude
> /go
```

That's it. The `/go` command will:
1. Find all PRDs in `genesis/`
2. Validate each PRD for completeness
3. Generate implementation stories
4. Execute the full pipeline for each story
5. Validate all three layers (DB, Backend, Frontend)
6. Run security audits
7. Generate documentation
8. Produce production-ready code

---

## Core Workflow

```
1. CREATE PRDs
   └─ /prd "your feature idea"     → Saved to genesis/
   └─ Or manually create in genesis/

2. VALIDATE (optional)
   └─ /go --validate               → Check PRDs are complete

3. IMPLEMENT
   └─ /go                          → Full autonomous implementation

4. DONE
   └─ Production-ready, tested, documented code
```

---

## What's Included

### Platform-Specific Components

#### Claude Code Skills (`.claude/commands/`)

46 skills for Claude Code with `/command` syntax:

| Skill | Command | Purpose |
|-------|---------|---------|
| **Project Kickstart** | `/go` | **THE main command** - PRD → Implementation |
| **PRD Architect** | `/prd` | Create structured PRDs (saved to genesis/) |
| **Coder** | `/coder` | Ruthless implementation with TDD |
| **Tester** | `/tester` | Brutal testing and edge cases |
| **Architect** | `/architect` | Architecture review |
| **Senior Engineer** | `/senior-engineer` | 🆕 Assumption surfacing, push-back, simplicity |
| **Security** | `/security` | 🆕 STRIDE, OWASP, vulnerability hunting |
| **Data Architect** | `/data-architect` | 🆕 Schema design, query optimization |
| **Release Manager** | `/release` | 🆕 Versioning, changelogs, rollback plans |
| **i18n Specialist** | `/i18n` | 🆕 Internationalization, localization, RTL |
| **Tech Lead** | `/tech-lead` | 🆕 Technical decisions, arbitration |
| **SRE** | `/sre` | 🆕 Incident response, SLOs, monitoring |
| **UX/UI** | `/ux-ui` | 🆕 UI audit, design, migration, rewrite |
| **Refactor** | `/refactor` | Code quality improvement |
| **Performance** | `/performance` | Performance optimization |
| **Dependency** | `/dependency` | Dependency management |
| **Review** | `/review` | Code review |
| **Migration** | `/migration` | Database migrations |
| **API Design** | `/api-design` | API interface design |
| **DevOps** | `/devops` | CI/CD and infrastructure |
| **Accessibility** | `/accessibility` | Accessibility (a11y) compliance |
| **Evaluator** | `/evaluator` | BPSBS compliance |
| **Debugger** | `/debugger` | Root cause analysis |
| **Standards** | `/standards` | Standards enforcement |
| **Gate Keeper** | `/gate-keeper` | Capability verification |
| **Layer Check** | `/layer-check` | Three-layer validation |
| **Swarm** | `/swarm` | Swarm agent coordination and monitoring |
| **Explain** | `/explain` | Explain last agent action in plain English |
| **Undo** | `/undo` | Revert last reversible agent action |
| **Cost** | `/cost` | Token usage report by agent/story/phase |
| **Health** | `/health` | Framework self-diagnostic |
| And 7 more... | | See `.claude/commands/` or [docs/AGENTS.md](docs/AGENTS.md) |

#### GitHub Copilot CLI Agents (`.copilot/custom-agents/`)

46 agents for GitHub Copilot CLI with `task()` tool:

**Core Development Agents**:
| Agent | File | Purpose |
|-------|------|---------|
| **Coder** | `coder.md` | TDD implementation + security checks |
| **Tester** | `tester.md` | Comprehensive testing |
| **Architect** | `architect.md` | Multi-persona architecture |
| **Debugger** | `debugger.md` | Systematic debugging |
| **Refactor** | `refactor.md` | 🆕 Code quality improvement |
| **Performance** | `performance.md` | 🆕 Performance optimization |
| **Dependency** | `dependency.md` | 🆕 Dependency management |
| **Review** | `review.md` | 🆕 Code review |
| **Migration** | `migration.md` | 🆕 Database migrations |
| **API Design** | `api-design.md` | 🆕 API interface design |
| **DevOps** | `devops.md` | 🆕 CI/CD and infrastructure |
| **Accessibility** | `accessibility.md` | 🆕 Accessibility (a11y) compliance |

**GitHub-Integrated Agents** (NEW):
| Agent | File | Purpose |
|-------|------|---------|
| **GitHub Orchestrator** | `github-orchestrator.md` | 🆕 Workflow coordination with GitHub APIs |
| **PR Review** | `pr-review.md` | 🆕 Ruthless PR reviews with GitHub context |
| **GitHub Actions** | `github-actions.md` | 🆕 CI/CD debugging and monitoring |
| **Commit Message** | `commit-message.md` | 🆕 Conventional commit generation |

**Security Agent** (NEW):
| Agent | File | Purpose |
|-------|------|---------|
| **Security Scanner** | `security-scanner.md` | 🆕 AI vulnerability detection (top 7 + 15 patterns) |

**Quality & Project Management**:
| Agent | File | Purpose |
|-------|------|---------|
| **Evaluator** | `evaluator.md` | BPSBS compliance |
| **Standards** | `standards.md` | Code standards |
| **PRD** | `prd.md` | PRD creation |
| **Stories** | `stories.md` | User stories |
| And 14 more... | | See `.copilot/custom-agents/README.md` |


| **Workflow** | `/workflow` | Workflow guidance |
| **Orchestrate** | `/orchestrate` | Project orchestration |
| **BPSBS** | `/bpsbs` | Standards enforcement |
| **Math Check** | `/math-check` | Mathematical formula validation |

### Shared Agent Modules (`/agents/`)

46 shared modules referenced by all agents (all platforms):

| Module | Purpose |
|--------|---------|
| `_tdd-protocol.md` | RED-GREEN-REFACTOR cycle |
| `_context-discipline.md` | Token management |
| `_systematic-debugging.md` | Four-phase debugging |
| `_agent-protocol.md` | Inter-agent communication |
| `_parallel-dispatch.md` | Parallel execution |
| `_git-worktrees.md` | Git worktree isolation |
| `_rollback-protocol.md` | Rollback and recovery |
| `_metrics-system.md` | Metrics collection |
| `_test-execution.md` | Cross-framework testing |
| `_swarm-coordinator.md` | Swarm coordination protocol |
| `knowledge-curator.md` | Knowledge evaluation and promotion |
| `agent-profile.md` | Agent learning profiles and cross-agent learning |
| And 19 more... | See `agents/` directory |

### Security Anti-Patterns (NEW - v1.1.0)

**docs/ANTI_PATTERNS_BREADTH.md** (225 KB):
- Wide coverage of 15 security anti-patterns
- Pseudocode examples for all languages
- Quick reference for common vulnerabilities
- Includes: SQL injection, XSS, hardcoded secrets, command injection, and 11 more

**docs/ANTI_PATTERNS_DEPTH.md** (252 KB):
- Deep dive on **top 7 critical vulnerabilities**
- Multiple examples with attack scenarios
- Edge cases and mitigation strategies
- **86% XSS failure rate** in AI code → prevented by this guide

**Top 7 Critical Issues Covered**:
1. Hardcoded Secrets (API keys, passwords)
2. SQL Injection (string concatenation in queries)
3. Cross-Site Scripting (unescaped user input)
4. Insecure Randomness (Math.random() for tokens)
5. Authentication/Authorization Flaws (missing checks)
6. Package Hallucination (non-existent imports, 5-21% rate)
7. Command Injection (unsanitized shell commands)

---

## Directory Structure After Install

### Claude Code Installation

```
YourProject/
├── .claude/
│   └── commands/           # 46 skills for Claude Code
│       ├── go.md
│       ├── prd.md
│       ├── coder.md
│       └── ...
├── agents/                 # Shared agent personas
├── genesis/                # Your PRD repository
│   ├── TEMPLATE.md
│   └── [your-feature].md
├── memory_bank/knowledge/  # Lessons learned (harvestable)
├── CLAUDE.md               # Framework-specific standards (~270 lines)
├── docs/
│   ├── enterprise-standards.md      # Production patterns (on-demand, ~1350 lines)
│   ├── ANTI_PATTERNS_BREADTH.md     # 15 security patterns
│   └── ANTI_PATTERNS_DEPTH.md       # Top 7 critical vulnerabilities
└── [your project code]
```

### GitHub Copilot CLI Installation

```
YourProject/
├── .copilot/
│   ├── custom-agents/      # 46 agents for Copilot
│   │   ├── coder.md
│   │   ├── github-orchestrator.md    # GitHub integration
│   │   ├── pr-review.md              # PR reviews
│   │   ├── github-actions.md         # CI/CD debugging
│   │   ├── security-scanner.md       # Security scanning
│   │   └── ...
│   ├── helper.sh           # Quick reference guide
│   ├── WORKFLOW-GUIDE.md   # Complete workflow examples
│   └── SECURITY-INTEGRATION.md  # Security usage guide
├── agents/                 # Shared agent personas
├── genesis/                # Your PRD repository
│   ├── TEMPLATE.md
│   └── [your-feature].md
├── memory_bank/knowledge/  # Lessons learned (harvestable)
├── docs/
│   ├── enterprise-standards.md      # Production patterns (on-demand)
│   ├── ANTI_PATTERNS_BREADTH.md     # 15 security patterns
│   └── ANTI_PATTERNS_DEPTH.md       # Top 7 critical vulnerabilities
└── [your project code]
```

### Cursor Installation

```
YourProject/
├── .cursor/
│   └── rules/              # 46 rules for Cursor
│       ├── go.md
│       ├── prd.md
│       ├── coder.md
│       └── ...
├── agents/                 # Shared agent personas
├── genesis/                # Your PRD repository
│   ├── TEMPLATE.md
│   └── [your-feature].md
├── memory_bank/knowledge/  # Lessons learned (harvestable)
├── CLAUDE.md               # Framework-specific standards (~270 lines)
├── docs/
│   ├── enterprise-standards.md      # Production patterns (on-demand)
│   ├── ANTI_PATTERNS_BREADTH.md     # 15 security patterns
│   └── ANTI_PATTERNS_DEPTH.md       # Top 7 critical vulnerabilities
└── [your project code]
```

---

## Workflows & Usage

### Claude Code Workflow

```bash
# 1. Create PRD
/prd "User authentication with JWT"

# 2. Implement
/go

# 3. Done - production-ready code
```

### GitHub Copilot CLI Workflows

**Quick Reference**:
```bash
# View all available agents and commands
.copilot/helper.sh

# View complete workflow examples
cat .copilot/WORKFLOW-GUIDE.md
```

**Workflow 1: GitHub Issue → PR**:
```bash
# Analyze issue and create implementation plan
task agent_type="explore" description="Analyze issue" \
  prompt="Use github-orchestrator to analyze issue #123 and create implementation plan"

# Implement with security checks
task agent_type="general-purpose" description="Implement feature" \
  prompt="Use coder agent to implement the plan with security validation"

# Review before committing
task agent_type="code-review" description="Review changes" \
  prompt="Use pr-review agent to review staged changes"
```

**Workflow 2: Security Scan & Fix**:
```bash
# Scan for vulnerabilities
task agent_type="explore" description="Security scan" \
  prompt="Use security-scanner to detect AI vulnerabilities in src/"

# Fix with secure patterns
task agent_type="general-purpose" description="Fix vulnerabilities" \
  prompt="Use coder to fix issues following ANTI_PATTERNS guides"

# Verify fixes
task agent_type="explore" description="Verify fixes" \
  prompt="Use security-scanner to confirm all vulnerabilities resolved"
```

**Workflow 3: PR Review**:
```bash
# Review PR with GitHub context
task agent_type="code-review" description="Review PR" \
  prompt="Use pr-review to analyze PR #456 including tests and security"

# Address feedback
task agent_type="general-purpose" description="Address feedback" \
  prompt="Use coder to address review comments"

# Generate conventional commit message
task agent_type="explore" description="Generate commit msg" \
  prompt="Use commit-message to create conventional commit from staged changes"
```

See `.copilot/WORKFLOW-GUIDE.md` for 5 complete workflow examples with agent chaining.

### Cursor Workflow (NEW)

**Usage in Cursor**:
1. Open Cursor in your project
2. Rules are automatically loaded from `.cursor/rules/`
3. Reference rules in chat:
   - "use go rule" - Start project implementation
   - "follow coder rule" - Implement with TDD
   - "use layer-check rule" - Validate three layers
   - "follow prd rule" - Create PRD

**Example**:
```
User: "Use go rule to implement all PRDs in genesis/"
Cursor: [Follows go.md rule - validates PRDs, generates stories, implements]
```

Rules provide the same structured workflows as Claude Code skills, adapted for Cursor's rule-based system.

---

## Security Integration (NEW - v1.1.0)

### Automatic Security Checks

All code implementations now include **mandatory pre-implementation security validation**:

1. **Coder Agent** - Checks ANTI_PATTERNS before implementation
2. **PR Review Agent** - Scans for AI vulnerabilities during review
3. **Security Scanner Agent** - Dedicated security audits

### Security Stats from Research

- **86% XSS failure rate** in AI-generated code (vs 31.6% human)
- **2.74x more likely** to have XSS vulnerabilities
- **5-21% package hallucination rate** across models
- **75.8% of developers** incorrectly trust AI-generated auth code

**This framework prevents these issues automatically.**

---

## Updating Existing Projects

The framework includes an **auto-update script** that keeps all your projects synchronized with the latest agents, skills, rules, and security patterns.

### Update All Projects

```bash
# Linux/Mac (bash)
cd ~/dev_tools_20260120_latest/claude_as
./update.sh --all

# Windows (PowerShell)
cd C:\dev_tools_20260120_latest\claude_as
.\update.ps1 -All
```

### Update Single Project

```bash
# Linux/Mac (bash)
./update.sh /path/to/your/project

# Windows (PowerShell)
.\update.ps1 -Project C:\path\to\your\project
```

### Preview Changes First

```bash
# Linux/Mac (bash)
./update.sh --diff /path/to/your/project

# Windows (PowerShell)
.\update.ps1 -Diff C:\path\to\your\project
```

### What Gets Updated

**For All Projects**:
- ✅ Security anti-patterns (`docs/ANTI_PATTERNS_BREADTH.md`, `docs/ANTI_PATTERNS_DEPTH.md`)
- ✅ Enterprise standards (`docs/enterprise-standards.md`)
- ✅ Agent personas and shared modules (`agents/`)
- ✅ Platform-specific skills/agents/rules (`.claude/`, `.copilot/`, or `.cursor/`)
- ✅ Auto-migration: moves root ANTI_PATTERNS to `docs/`, removes obsolete `bpsbs.md`

**For Copilot Projects Only** (platform-aware):
- ✅ GitHub-integrated agents (orchestrator, pr-review, github-actions)
- ✅ Security scanner agent
- ✅ Helper script and workflow guides
- ✅ Enhanced coder and pr-review agents

**For Cursor Projects Only** (platform-aware):
- ✅ All rules in `.cursor/rules/`
- ✅ Same functionality as Claude Code skills

**Safety**:
- 🔒 Creates timestamped backups before updates
- 🔒 Preserves your custom configurations
- 🔒 Only updates framework files, not your code



### Start Fresh - Create a PRD

```
/prd "User authentication with JWT and refresh tokens"
```
→ PRD saved to `genesis/2026-01-16-user-auth.md`

### Have PRDs Ready - Just Go

```
/go
```
→ Finds all PRDs in genesis/, validates, implements everything

### Validate Before Implementing

```
/go --validate
```
→ Only checks PRDs, shows what's missing

### Implement Specific PRD

```
/go genesis/user-auth.md
```
→ Implements just that PRD

### Check Status

```
/go --status
```
→ Shows current implementation progress

---

## Zero Tolerance Policy

This framework **automatically rejects** code containing:

| Banned Pattern | Reason |
|----------------|--------|
| `TODO`, `FIXME` | Incomplete work |
| `PLACEHOLDER`, `STUB` | Fake implementation |
| `MOCK` (in prod code) | Not real |
| `COMING SOON` | Not implemented |
| `NotImplementedError` | Empty implementation |
| Empty function bodies | No-op code |
| `Lorem ipsum` | Placeholder content |
| Hardcoded credentials | Security violation |

---

## Three-Layer Enforcement

Every feature must be REAL across all tiers:

| Layer | Requirements |
|-------|--------------|
| **Database** | Migration works, schema matches PRD, rollback tested |
| **Backend** | Endpoints work, tests pass, auth/authz enforced |
| **Frontend** | REAL API connected (no mocks), all UI states |

---

## Context Engineering

Based on [Recursive Language Models (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601) and [Anthropic's Context Engineering Guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

### Token Budget Management

The framework uses hierarchical context loading to prevent context overflow:

| Level | Content | Size |
|-------|---------|------|
| **Level 1** | CLAUDE-SUMMARY.md + current story | ~5K tokens |
| **Level 2** | Active source files | ~20K tokens |
| **Level 3** | Full documentation (reference only) | ~80K tokens |

### Context Commands

```
/context              → Show current context status and budget
/context compact      → Force context compaction
/context budget       → Detailed token breakdown
/context scratchpad   → View/update session tracking
```

### Budget Thresholds

| Zone | Range | Action |
|------|-------|--------|
| GREEN | 0-50K | Normal operation |
| YELLOW | 50-100K | Consider compaction |
| RED | >100K | Force compaction |

### Recursive Task Decomposition

Complex tasks are automatically decomposed into isolated subtasks:
- Each subtask gets minimal, focused context
- Results are summarized (<500 tokens) before aggregation
- Maximum recursion depth: 3 levels

### Key Files

| File | Purpose |
|------|---------|
| `CLAUDE-SUMMARY.md` | Condensed standards (~2K tokens) for active context |
| `CLAUDE.md` | Full standards (reference only, not bulk-loaded) |
| `agents/_context-discipline.md` | Shared context protocol for all agents |
| `agents/_subagent-response-format.md` | Standard response format for sub-agents |
| `agents/_recursive-decomposition.md` | Task decomposition protocol |

---

## Philosophy

- **Genesis-First**: All projects start from PRDs in `genesis/`
- **One Command**: `/go` is all you need after PRDs are ready
- **Zero Tolerance**: No mocks, no placeholders, no TODOs
- **Three-Layer**: DB, Backend, Frontend all validated
- **Cold-Blooded**: No flattery, no assumptions, just facts
- **Context-Aware**: Load only what you need, summarize what you learned

---

## Updating Projects

When the framework is updated, push changes to all your projects.

### Update Single Project

```bash
# From anywhere
~/DevLab/IDEA/claude_as/update.sh /path/to/your/project

# Preview changes first
~/DevLab/IDEA/claude_as/update.sh --diff /path/to/your/project
```

### Update All Registered Projects

```bash
# Projects are auto-registered on install
~/DevLab/IDEA/claude_as/update.sh --all
```

### Manage Project Registry

```bash
# List all registered projects
~/DevLab/IDEA/claude_as/update.sh --list

# Register a project manually
~/DevLab/IDEA/claude_as/update.sh --register /path/to/project

# Unregister a project
~/DevLab/IDEA/claude_as/update.sh --unregister /path/to/project
```

### Update Options

| Command | Description |
|---------|-------------|
| `update.sh PATH` | Update single project |
| `update.sh --all` | Update all registered projects |
| `update.sh --diff PATH` | Preview what would change |
| `update.sh --force PATH` | Force update even if same version |
| `update.sh --list` | Show registered projects with status |

### What Gets Updated

| Component | Update Behavior |
|-----------|-----------------|
| Skills (`.claude/commands/`) | Added/updated automatically |
| `CLAUDE.md` | Prompts for overwrite/keep/merge |
| `genesis/TEMPLATE.md` | Updated automatically |
| `docs/enterprise-standards.md` | Added/updated automatically |
| `docs/ANTI_PATTERNS_*.md` | Migrated from root to `docs/` if needed |

### Backups

All updates create backups in:
```
.claude/backups/YYYYMMDD_HHMMSS/
├── CLAUDE.md           # Previous version
├── skill-name.md       # Previous skill versions
└── TEMPLATE.md         # Previous template
```

---

## Troubleshooting

### `/go` command not found

**Cause:** You copied the `claude_as` folder into your project instead of installing from it.

**Fix:**
```bash
cd ~/DevLab/YourProject
rm -rf claude_as              # Remove the copied folder
~/DevLab/IDEA/claude_as/install.sh   # Install properly
```

### Skills not recognized

**Cause:** `.claude/commands/` is not at your project root.

**Check:**
```bash
ls -la .claude/commands/
```

Should show `go.md`, `prd.md`, etc. If not, run the installer.

---

## Configuration

### Three-Tier Documentation (v1.9.0.10)

Documentation is organized to minimize token usage per session:

| Tier | File | Purpose | Loaded |
|------|------|---------|--------|
| **Global** | `~/.claude/CLAUDE.md` | Universal agent rules (security, testing, workflow) | Every session |
| **Framework** | `CLAUDE.md` | Framework-specific (philosophy, genesis, three-layer) | Every session |
| **Enterprise** | `docs/enterprise-standards.md` | Production patterns (PM2, caching, APM, migrations) | On demand |

### Per-Project Customization

After installation:

1. Update `CLAUDE.md` with project-specific conventions
2. Add project-specific banned patterns
3. Reference `docs/enterprise-standards.md` when building production systems
4. Add custom skills if needed

---

## License

MIT - Use freely, modify as needed.

---

## Version

**v1.9.0.10** - February 8, 2026

### What's New in v1.9.0.0 - Framework Evolution (4 Phases)

- **Phase 1** (v1.8.0.0): Knowledge Exchange - Harvest, registry, knowledge-curator agent, promotion pipeline
- **Phase 2** (v1.8.0.1): Swarm Coordination - Self-organizing task queue, scratchpad, conflict detection
- **Phase 3** (v1.8.0.2): Developer Experience - `/explain`, `/undo`, `/cost`, `/health`, live dashboard
- **Phase 4** (v1.9.0.0): Advanced Intelligence - Semantic search, monorepo support, compliance presets, agent learning

### What's New in v1.7.0.0 - Auto-Remediation & Autonomous Execution

- **Fixer Orchestrator** - Auto-remediation router and retry coordinator
- **Security Scanner** - AI-generated code vulnerability detection using docs/ANTI_PATTERNS databases
- **3 Execution Modes** - Supervised, Semi-Autonomous, Autonomous
- **4-Component Versioning** - MAJOR.FEATURE.DATABASE.ITERATION
- **Version Detection** - Cross-platform installed version detection and update logic

### What's New in v1.6.0 - The Dream Team

8 new specialist agents completing the full software development lifecycle:

| Agent | Command | Purpose |
|-------|---------|---------|
| **Security Specialist** | `/security` | STRIDE threat modeling, OWASP audits, penetration testing mindset |
| **Data Architect** | `/data-architect` | Schema design, query optimization, normalization, safe migrations |
| **Release Manager** | `/release` | Semantic versioning, changelogs, release notes, rollback plans |
| **i18n Specialist** | `/i18n` | Internationalization, localization, RTL support, multi-language |
| **Tech Lead** | `/tech-lead` | Technical decision arbitration, mentorship, strategic planning |
| **SRE Specialist** | `/sre` | Incident response, SLOs/SLIs, monitoring, chaos engineering |
| **UX/UI Specialist** | `/ux-ui` | UI audit, design, migration, rewrite, design system enforcement |
| **Senior Engineer** | `/senior-engineer` | Assumption surfacing, push-back, simplicity enforcement |

See [docs/AGENTS.md](docs/AGENTS.md) for complete documentation of all 46 agents.

### What's New in v1.3.2

#### New Specialized Agents (8 New Agents)
- **Refactor Agent** - Code quality improvement with TDD safety net
- **Performance Optimizer** - Performance bottleneck identification and optimization
- **Dependency Manager** - Secure dependency management and vulnerability scanning
- **Code Review Agent** - Merciless code review with high signal-to-noise ratio
- **Migration Specialist** - Safe database schema changes with rollback
- **API Design Specialist** - RESTful/GraphQL API design and documentation
- **DevOps Specialist** - CI/CD pipelines and infrastructure as code
- **Accessibility Specialist** - WCAG 2.1 Level AA compliance

#### Enhanced Existing Agents
- **Coder**: References to refactor and performance agents
- **Tester**: References to performance testing
- **Architect**: Added Performance, Accessibility, and DevOps personas
- **Go**: Enhanced workflow with optional specialized agents

#### Platform Expansion
- **Claude Code**: 22 → 30 skills (+8)
- **Copilot CLI**: 28 → 36 agents (+8)
- **Cursor**: 22 → 30 rules (+8)
- **Total**: 72 → 96 agents/skills/rules (+24)

#### TDD Enforcement (Adopted from SkillsMP)
- **RED-GREEN-REFACTOR** - Mandatory test-first development cycle
- **Enforcement levels** - STRICT (block), WARN (log), OFF (track)
- **Integration** - All `/coder` invocations follow TDD

#### Parallel Agent Dispatching (Adopted from SkillsMP)
- **Wave execution** - Independent stories run simultaneously
- **2-5x speedup** - For independent story execution
- **Conflict detection** - Prevent file overlap issues

#### Git Worktree Isolation
- **Safe development** - Each PRD in isolated worktree
- **Easy rollback** - Delete worktree folder to undo
- **Parallel PRDs** - Multiple PRDs can develop simultaneously

#### Systematic Debugging (Adopted from SkillsMP)
- **Four phases** - Observe → Hypothesize → Test → Verify
- **Five Whys** - Trace to root cause, not symptoms
- **Defense in depth** - Add guards after every fix

#### New /go Flags (v1.3.1)
```
/go --parallel          Parallel story execution
/go --parallel=EAGER    Eager execution mode
/go --worktree          Execute in isolated worktree
/go --tdd               Enforce TDD mode (STRICT)
/go --tdd=WARN          TDD warning mode
```

### What's in v1.3.0

#### State Machine & Recovery
- **Crash recovery** - Execution state persisted to `.claude/state.json`
- **Resume capability** - Continue from where you left off with `/go --resume`
- **Rollback support** - Undo all changes with `/go --rollback`

#### Dependency Graphs
- **Story dependencies** - Stories can declare `depends_on` and `blocks`
- **PRD dependencies** - PRDs can require other PRDs to complete first
- **Parallel execution** - Independent stories run simultaneously

#### Metrics & Analytics
- **`/metrics` skill** - Execution tracking, agent performance, trends
- **Automatic collection** - Success rates, token usage, duration
- **Export** - JSON, CSV, Markdown reports

See [CHANGELOG.md](CHANGELOG.md) for full version history.

---

## Changelog

### v1.1.0 (2026-01-22) - Security Enhanced + GitHub Integration

**🆕 Dual-Platform Support**:
- Added GitHub Copilot CLI support alongside Claude Code
- Platform selection via `--platform=claude` or `--platform=copilot` flag
- Interactive platform selection in `install.sh`
- Created `convert-to-copilot.sh` to transform agent formats

**🆕 GitHub Integration (Copilot CLI)**:
- **github-orchestrator.md** - Workflow coordination using GitHub MCP APIs
- **pr-review.md** - Ruthless PR reviews with GitHub context
- **github-actions.md** - CI/CD debugging and failure analysis
- **commit-message.md** - Conventional commit message generator
- Enhanced **coder.md** with GitHub pattern search and repository context

**🆕 Security Hardening**:
- **docs/ANTI_PATTERNS_BREADTH.md** - 15 security anti-patterns (225 KB)
- **docs/ANTI_PATTERNS_DEPTH.md** - Top 7 critical vulnerabilities (252 KB)
- **security-scanner.md** - Dedicated AI vulnerability scanner
- Enhanced **coder.md** with mandatory pre-implementation security checks
- Enhanced **pr-review.md** with AI-specific vulnerability scanning

**🆕 Documentation**:
- **helper.sh** - Quick reference for Copilot agents and commands
- **WORKFLOW-GUIDE.md** - 5 complete workflow examples with agent chaining
- **SECURITY-INTEGRATION.md** - Security integration and usage guide
- **ENHANCEMENT-SUMMARY.md** - Complete GitHub integration details
- Updated **README.md** with dual-platform instructions

**🆕 Auto-Update Enhancement**:
- `update.sh` now automatically updates security documents
- Platform-aware updates (only updates Copilot files for Copilot projects)
- Updates helper.sh, WORKFLOW-GUIDE.md, SECURITY-INTEGRATION.md
- Timestamped backups before all updates

**Statistics**:
- 28 total agents for Copilot (22 converted + 4 GitHub + 1 security + 1 enhanced)
- 22 skills for Claude Code (unchanged, backward compatible)
- 477 KB of security knowledge (ANTI_PATTERNS documents)
- 5 comprehensive documentation guides

### v1.3.1 (Previous) - TDD + Parallel Execution

- Added TDD protocol enforcement
- Parallel agent dispatching
- Git worktree isolation
- Systematic debugging protocol

### v1.3.0 (Previous) - State Management

- Agent communication protocol
- Execution state machine
- Rollback and recovery
- Story dependency graphs
- Metrics collection system

---

## Credits & Research

This framework incorporates research on AI-generated code security:

- **"Examining Zero-Shot Vulnerability Repair"** - Pearce et al. (2022)
- **"Do Users Write More Insecure Code with AI?"** - Perry et al. (2023)
- **"Lost at C"** - Sandoval et al. (2023)
- **Package Hallucination Studies** - Multiple sources (2023-2024)

Security patterns based on OWASP Top 10, CWE Top 25, and AI-specific vulnerability research.

---

## Documentation

### Core Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | This file - overview and quick start |
| [CLAUDE.md](CLAUDE.md) | Framework-specific standards (~270 lines) |
| [docs/enterprise-standards.md](docs/enterprise-standards.md) | Production patterns (on-demand, ~1350 lines) |
| [HOW-TO.md](docs/HOW-TO.md) | Comprehensive usage guide (Claude Code) |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

### Platform-Specific Documentation

**For Claude Code**:
- [CLAUDE-SUMMARY.md](docs/CLAUDE-SUMMARY.md) - Condensed standards for active context

**For GitHub Copilot CLI** (in `.copilot/` after installation):
- `helper.sh` - Quick reference for all agents and commands
- `WORKFLOW-GUIDE.md` - 5 complete workflow examples
- `SECURITY-INTEGRATION.md` - Security integration guide
- `ENHANCEMENT-SUMMARY.md` - GitHub integration details
- `custom-agents/README.md` - Agent catalog with usage examples

**For Cursor** (in `.cursor/rules/` after installation):
- Rules are automatically loaded by Cursor
- Same functionality as Claude Code skills
- Reference rules by name in Cursor chat

### Security Documentation

- [docs/ANTI_PATTERNS_BREADTH.md](docs/ANTI_PATTERNS_BREADTH.md) - 15 security anti-patterns
- [docs/ANTI_PATTERNS_DEPTH.md](docs/ANTI_PATTERNS_DEPTH.md) - Top 7 critical vulnerabilities

---

## License & Credits

**Created by SBS with Claude Code** (Original framework)
**Enhanced for GitHub Copilot CLI** (v1.1.0 - 2026-01-22)
**Enhanced for Cursor** (v1.3.1 - 2026-01-25)
**Windows PowerShell Support** (v1.3.1 - 2026-01-25)
**Framework Evolution** (v1.9.0.0 - 2026-02-07) - Knowledge exchange, swarm coordination, DX tooling, advanced intelligence
**Documentation Deduplication** (v1.9.0.10 - 2026-02-08) - Three-tier docs, 13K tokens/session saved

**Philosophy**: Production-ready, ruthlessly tested, zero-tolerance for placeholders.

**Research Credits**:
- AI Security Research: Pearce, Perry, Sandoval et al.
- Context Engineering: Anthropic, arXiv:2512.24601
- Security Patterns: OWASP, CWE, AI vulnerability databases


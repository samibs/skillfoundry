# Documentation Index - Claude AS Framework v1.9.0.8

Complete guide to all documentation in the framework.

**Version:** MAJOR.FEATURE.DATABASE.ITERATION (1=breaking, 9=features, 0=db, 0=patches)

**46 Agents** | **Triple Platform** (Claude Code, GitHub Copilot CLI, Cursor) | **Auto-Remediation** | **Knowledge Exchange** | **Swarm Coordination** | **DX Tooling** | **Advanced Intelligence**

---

## 📖 Getting Started

Start here for installation and basic usage:

| Document | Size | Purpose |
|----------|------|---------|
| **[README.md](README.md)** | 30 KB | **START HERE** - Overview, installation, quick start |
| **[docs/AGENTS.md](docs/AGENTS.md)** | 16 KB | **AGENT TEAM** - Complete guide to all 46 agents |
| **[docs/QUICK-REFERENCE.md](docs/QUICK-REFERENCE.md)** | 8 KB | Quick reference card |
| **[docs/ESCALATION-CRITERIA.md](docs/ESCALATION-CRITERIA.md)** | 18 KB | **NEW v1.7.0** - Auto-fix vs. escalation decision matrix |
| **[docs/AUTONOMOUS-EXECUTION.md](docs/AUTONOMOUS-EXECUTION.md)** | 10 KB | **NEW v1.7.0.2** - Autonomous execution setup, permission profiles, safety hooks |
| **[V1.1.0-RELEASE-NOTES.md](docs/V1.1.0-RELEASE-NOTES.md)** | 10 KB | What's new in this version |
| **[CHANGELOG.md](CHANGELOG.md)** | - | Version history |

---

## 🔒 Security Documentation

Critical security knowledge for AI-assisted development:

| Document | Size | Purpose |
|----------|------|---------|
| **[docs/ANTI_PATTERNS_BREADTH.md](docs/ANTI_PATTERNS_BREADTH.md)** | 225 KB | 15 security anti-patterns (wide coverage) |
| **[docs/ANTI_PATTERNS_DEPTH.md](docs/ANTI_PATTERNS_DEPTH.md)** | 252 KB | Top 7 critical vulnerabilities (deep dive) |
| **[.copilot/SECURITY-INTEGRATION.md](.copilot/SECURITY-INTEGRATION.md)** | 6.4 KB | How to use security features |

**Read these!** They prevent the 86% XSS failure rate and 2.74x vulnerability multiplier in AI code.

---

## 🔗 Platform-Specific Documentation

### Claude Code
- **[docs/HOW-TO.md](docs/HOW-TO.md)** - Comprehensive usage guide
- **[docs/QUICK-REFERENCE.md](docs/QUICK-REFERENCE.md)** - Command cheat sheet
- **[CLAUDE-SUMMARY.md](docs/CLAUDE-SUMMARY.md)** - Condensed standards for active context

### GitHub Copilot CLI
- **[.copilot/helper.sh](.copilot/helper.sh)** - Quick reference script (run it!)
- **[.copilot/WORKFLOW-GUIDE.md](.copilot/WORKFLOW-GUIDE.md)** - 5 complete workflow examples
- **[.copilot/ENHANCEMENT-SUMMARY.md](.copilot/ENHANCEMENT-SUMMARY.md)** - GitHub integration details
- **[.copilot/custom-agents/README.md](.copilot/custom-agents/README.md)** - Agent catalog with examples

### Cursor (NEW)
- **[docs/CURSOR-PLATFORM-SUPPORT.md](docs/CURSOR-PLATFORM-SUPPORT.md)** - Cursor platform guide
- Rules automatically loaded from `.cursor/rules/`
- Reference rules by name in Cursor chat

### Windows Support (NEW)
- **[install.ps1](install.ps1)** - PowerShell installer
- **[update.ps1](update.ps1)** - PowerShell updater
- Full feature parity with bash scripts

## 🎯 Claude Code Documentation

For projects using Claude Code:

| Document | Size | Purpose |
|----------|------|---------|
| **[CLAUDE.md](CLAUDE.md)** | - | Full standards reference |
| **[docs/CLAUDE-SUMMARY.md](docs/CLAUDE-SUMMARY.md)** | - | Condensed for active context |
| **[docs/HOW-TO.md](docs/HOW-TO.md)** | - | Comprehensive usage guide |
| **[docs/QUICK-REFERENCE.md](docs/QUICK-REFERENCE.md)** | - | Command cheat sheet |

---

## 🛠️ Advanced Documentation

Deep-dive technical documentation:

### Reference Documentation
- **[docs/API-REFERENCE.md](docs/API-REFERENCE.md)** - Agent protocols and API reference
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/ESCALATION-CRITERIA.md](docs/ESCALATION-CRITERIA.md)** - **NEW v1.7.0** - Auto-remediation decision matrix
- **[docs/MARKET-COMPARISON.md](docs/MARKET-COMPARISON.md)** - Competitive analysis vs. market leaders
- **[docs/IMPROVEMENT-PLAN.md](docs/IMPROVEMENT-PLAN.md)** - Strategic improvement roadmap

### Audit & Logging (NEW v1.7.0)
- **[logs/remediations.md](logs/remediations.md)** - Auto-fix audit trail
- **[logs/escalations.md](logs/escalations.md)** - User decision log

### Examples & Tutorials
- **[docs/EXAMPLES/example-web-app.md](docs/EXAMPLES/example-web-app.md)** - Complete web app walkthrough
- **[docs/EXAMPLES/example-api.md](docs/EXAMPLES/example-api.md)** - REST API implementation guide

### Historical Summaries (Archived)
Phase summaries and implementation reports have been archived to `docs/archive/` for reference.

---

## Advanced Features (v1.4.0+)

### Persistent Memory System (v1.4.0, enhanced v1.8.0.0)
- **[docs/PERSISTENT-MEMORY-IMPLEMENTATION.md](docs/PERSISTENT-MEMORY-IMPLEMENTATION.md)** - Technical implementation guide
- **[memory_bank/README.md](memory_bank/README.md)** - Architecture overview and schema docs
- **[memory_bank/knowledge/README.md](memory_bank/knowledge/README.md)** - JSONL schema documentation
- **CLI Tools**: `scripts/memory.sh` (Linux/Mac), `scripts/memory.ps1` (Windows)
- **Commands**: `/remember`, `/recall`, `/correct`, `harvest`, `sync`
- **Storage**: `memory_bank/` directory with JSONL-based storage and bootstrap knowledge

### Knowledge Exchange (v1.8.0.0 - Phase 1)
- **[genesis/2026-02-07-framework-evolution.md](genesis/2026-02-07-framework-evolution.md)** - Framework Evolution PRD
- **[agents/knowledge-curator.md](agents/knowledge-curator.md)** - Knowledge evaluation and promotion agent
- **CLI Tools**: `scripts/harvest.sh` (knowledge extraction), `scripts/registry.sh` (project registry)
- **Knowledge Flow**: PROJECT -> HARVESTED -> CANDIDATE -> PROMOTED -> BOOTSTRAP
- **Universal Knowledge**: `memory_bank/knowledge/*-universal.jsonl` (decisions, errors, patterns)
- **Integration**: `update.sh` auto-harvests, `install.sh` auto-registers, `memory.sh` delegates

### MCP Integration (v1.4.0)
- **[docs/MCP-INTEGRATION.md](docs/MCP-INTEGRATION.md)** - MCP server integration guide
- **Servers**: `mcp-servers/filesystem/`, `mcp-servers/database/`, `mcp-servers/testing/`, `mcp-servers/security/`
- **Purpose**: Standardized tool interface for filesystem, database, testing, and security operations

### Visual Dashboard (v1.4.0)
- **[docs/VISUAL-DASHBOARD.md](docs/VISUAL-DASHBOARD.md)** - Dashboard architecture and implementation
- **Start Scripts**: `scripts/start-dashboard.sh`, `scripts/start-dashboard.ps1`
- **Features**: PRD management, story tracking, agent activity, metrics
- **Access**: `http://localhost:3000`

### Project Templates (v1.7.0.1)
- **[templates/README.md](templates/README.md)** - Template directory guide
- **Templates**: `prd-web-app.md`, `prd-api.md`, `prd-cli.md`, `prd-library.md`
- **Purpose**: Pre-filled PRD templates by project type, used by wizard.sh and `/prd`

### Advanced Intelligence (v1.9.0.0 - Phase 4)
- **[agents/agent-profile.md](agents/agent-profile.md)** - Agent learning profile protocol (FR-031, FR-032)
- **Compliance Presets**: `agents/compliance-profiles/HIPAA.md`, `SOC2.md`, `GDPR.md` (FR-033)
- **CLI Tools**: `scripts/semantic-search.sh` (knowledge search, FR-030), `scripts/monorepo.sh` (monorepo support, FR-036)
- **Semantic Search**: TF-IDF keyword-weighted search over JSONL knowledge bases
- **Monorepo**: Cross-package detection (Node.js, Python, Rust, Go, .NET), dependency resolution, build order
- **Compliance**: Additive gate-keeper rule sets for HIPAA (22 rules), SOC2 (28 rules), GDPR (27 rules)
- **Agent Learning**: Style pattern detection, cross-agent knowledge transfer, promotion pipeline

### Platform Sync Engine (v1.9.0.3)
- **CLI Tool**: `scripts/sync-platforms.sh` - Generate platform files from agent source
- **Commands**: `sync [--all|agent-name]`, `check`, `list`, `diff [agent-name]`
- **Agent Mapping**: `command:` field in agent YAML frontmatter (24 mapped, 2 skipped)
- **Platforms**: Claude Code (`.claude/commands/`), Copilot (`.copilot/custom-agents/`), Cursor (`.cursor/rules/`)
- **Supersedes**: `scripts/convert-to-copilot.sh` (deprecated)

### Developer Experience (v1.8.0.2 - Phase 3)
- **Slash Commands**: `/explain` (last action), `/undo` (revert action), `/cost` (token usage), `/health` (diagnostics)
- **CLI Tools**: `scripts/cost-tracker.sh` (token tracking), `scripts/dashboard.sh` (live execution UI)
- **Dashboard**: Terminal UI with progress bars, agent status, scratchpad alerts, cost summary
- **Cost Tracking**: Record/report token usage by agent, story, and phase

### Swarm Agent Coordination (v1.8.0.1 - Phase 2)
- **[agents/_swarm-coordinator.md](agents/_swarm-coordinator.md)** - Swarm coordination protocol agent
- **CLI Tools**: `parallel/swarm-queue.sh` (task queue), `parallel/swarm-scratchpad.sh` (inter-agent comms), `parallel/conflict-detector.sh` (file conflicts)
- **Command**: `/swarm` - Swarm management interface
- **State Machine**: QUEUED -> CLAIMED -> IN_PROGRESS -> COMPLETE/FAILED/BLOCKED
- **Features**: Dynamic handoffs (FR-011), file conflict detection (FR-014), agent availability pool (FR-017), wave fallback (FR-016)

### Parallel Execution (v1.4.0, enhanced v1.8.0.1)
- **[docs/PARALLEL-EXECUTION.md](docs/PARALLEL-EXECUTION.md)** - DAG-based parallel execution guide
- **[parallel/README.md](parallel/README.md)** - Shell tooling usage guide
- **Wave Tools**: `wave-planner.sh`, `dispatch-state.sh`, `visualize.sh`
- **Swarm Tools**: `swarm-queue.sh`, `swarm-scratchpad.sh`, `conflict-detector.sh`
- **Purpose**: Execute independent tasks concurrently with dependency safety (wave or swarm mode)

### Observability & Tracing (v1.5.0)
- **[docs/OBSERVABILITY-TRACING.md](docs/OBSERVABILITY-TRACING.md)** - Observability and tracing implementation guide
- **[docs/PHASE4-SUMMARY.md](docs/PHASE4-SUMMARY.md)** - Phase 4 implementation summary
- **Components**: Trace logger, metrics collector, audit logger, trace viewer
- **Directory**: `observability/` with all observability components
- **Trace Viewer**: `scripts/start-trace-viewer.sh`, `scripts/start-trace-viewer.ps1`
- **Access**: `http://localhost:3001`

---

### Deliberation Protocol (v1.9.0.8)
- **[agents/_deliberation-protocol.md](agents/_deliberation-protocol.md)** - Multi-perspective design review before implementation
  - Triggers: architectural decisions, security changes, multiple approaches, cross-cutting concerns
  - 3 phases: Proposal → Challenge → Synthesis with decision record
  - 3 depth levels: Quick, Standard, Deep
  - Integrated into project-orchestrator phase structure and architect workflow

### NASAB Framework Integration (v1.9.0.6)
- **[agents/_bidirectional-iteration.md](agents/_bidirectional-iteration.md)** - Track fix-break oscillation cycles, detect convergence
- **[agents/_dissent-resolution.md](agents/_dissent-resolution.md)** - Resolve conflicting agent recommendations (reality anchor wins, thin consensus escalates)
- **Evidence-Based Gates** in gate-keeper — 5 capability levels with evidence accumulation
- **Constraint Classification** in architect — Physical, Conventional, Regulatory, BestPractice
- **Pattern Detection** in memory-curator — Detect unconscious coding patterns (parental inheritance)
- **Context-Aware Validation** in math-checker — Check formula assumptions against runtime context
- **Oscillation Detection** in fixer — Stop retrying when fix-break cycles detected

### Knowledge Hub — Remote Sync (v1.9.0.5)
- **[scripts/knowledge-sync.sh](scripts/knowledge-sync.sh)** - Git-based remote transport layer
  - Commands: `setup`, `push`, `pull`, `scratchpad push/pull`, `metrics push`, `status`
  - Hub directories: `knowledge/` (lessons), `scratchpads/` (session state), `metrics/` (usage)
  - Offline-first: commits locally, pushes when online
  - Integration: `update.sh --remote`, `harvest.sh` auto-push, `memory.sh hub`
  - Auto-sync: pull on session start, push scratchpad+metrics on session end
- **[knowledge/schema.md](knowledge/schema.md)** - Lesson format specification

### Companion Panel (v1.9.0.5)
- **[scripts/companion.sh](scripts/companion.sh)** - Context-aware tmux command reference panel
  - Reads scratchpad to show phase-relevant commands (architecture, implementation, testing, etc.)
  - Displays current task, phase, agent, hub status, and modified files
  - `--tmux` opens as a 35-column side pane; `--once` renders and exits
  - Auto-refreshes every 5 seconds; pure bash, zero dependencies beyond tmux

### Context Engineering & Cross-Platform Continuity
- **[docs/CONTEXT-ENGINEERING-SPEC.md](docs/CONTEXT-ENGINEERING-SPEC.md)** - Token budget management
- **[agents/_context-discipline.md](agents/_context-discipline.md)** - Context protocol + persistent scratchpad (v1.9.0.4)
  - Scratchpad auto-persisted to `.claude/scratchpad.md` after every major action
  - Read on session start — enables seamless Claude → Copilot → Cursor handoff
- **[agents/_subagent-response-format.md](agents/_subagent-response-format.md)** - Response format

### Architecture & Protocols
- **[agents/_agent-protocol.md](agents/_agent-protocol.md)** - Inter-agent communication (v1.3.0)
- **[agents/_state-machine.md](agents/_state-machine.md)** - Execution state machine
- **[agents/_rollback-protocol.md](agents/_rollback-protocol.md)** - Rollback and recovery
- **[agents/_story-dependency-graph.md](agents/_story-dependency-graph.md)** - Story dependencies
- **[agents/_prd-dependencies.md](agents/_prd-dependencies.md)** - PRD coordination
- **[agents/_reflection-protocol.md](agents/_reflection-protocol.md)** - Agent reflection and self-critique (v1.3.4)
- **[agents/_error-handling-protocol.md](agents/_error-handling-protocol.md)** - Error handling and recovery (v1.3.4)
- **[docs/PERSISTENT-MEMORY-IMPLEMENTATION.md](docs/PERSISTENT-MEMORY-IMPLEMENTATION.md)** - Persistent memory system (v1.4.0)
- **[docs/MCP-INTEGRATION.md](docs/MCP-INTEGRATION.md)** - MCP server integration (v1.4.0)
- **[docs/PARALLEL-EXECUTION.md](docs/PARALLEL-EXECUTION.md)** - DAG-based parallel execution (v1.4.0)

### Development Protocols
- **[agents/_tdd-protocol.md](agents/_tdd-protocol.md)** - TDD enforcement (v1.3.1)
- **[agents/_systematic-debugging.md](agents/_systematic-debugging.md)** - Four-phase debugging
- **[agents/_test-execution.md](agents/_test-execution.md)** - Cross-framework testing
- **[agents/_gate-verification.md](agents/_gate-verification.md)** - Capability checks
- **[agents/_parallel-dispatch.md](agents/_parallel-dispatch.md)** - Parallel execution
- **[agents/_git-worktrees.md](agents/_git-worktrees.md)** - Git worktree isolation

### Metrics & Analytics
- **[agents/_metrics-system.md](agents/_metrics-system.md)** - Metrics collection

### Task Decomposition
- **[agents/_recursive-decomposition.md](agents/_recursive-decomposition.md)** - Task decomposition

---

### New Agents (v1.9.0.2)

| Agent | File | Perspective |
|-------|------|-------------|
| **Ops Tooling Generator** | [agents/ops-tooling-generator.md](agents/ops-tooling-generator.md) | Admin panels, debug overlays, feedback systems for completed projects |

### New Agents (v1.9.0.1)

| Agent | File | Perspective |
|-------|------|-------------|
| **Project Educator** | [agents/project-educator.md](agents/project-educator.md) | End-user learning materials: tutorials, guides, glossary, user journeys |

### New Agents (v1.9.0.0)

| Agent | File | Perspective |
|-------|------|-------------|
| **Agent Learning Profile** | [agents/agent-profile.md](agents/agent-profile.md) | Code style learning and cross-agent knowledge transfer |

### Compliance Profiles (v1.9.0.0)

| Profile | File | Rules |
|---------|------|-------|
| **HIPAA** | [agents/compliance-profiles/HIPAA.md](agents/compliance-profiles/HIPAA.md) | 22 rules: encryption, audit, access, data handling |
| **SOC 2** | [agents/compliance-profiles/SOC2.md](agents/compliance-profiles/SOC2.md) | 28 rules: security, availability, integrity, confidentiality, privacy |
| **GDPR** | [agents/compliance-profiles/GDPR.md](agents/compliance-profiles/GDPR.md) | 27 rules: consent, DSR, data protection, security, breach notification |

## Agent Personas (46 Agents)

**See [docs/AGENTS.md](docs/AGENTS.md) for complete agent documentation.**

### Core Agents

| Agent | File | Perspective |
|-------|------|-------------|
| **Cold-Blooded Architect** | [agents/cold-blooded-architect.md](agents/cold-blooded-architect.md) | Architecture and design |
| **Ruthless Coder** | [agents/ruthless-coder.md](agents/ruthless-coder.md) | TDD implementation |
| **Ruthless Tester** | [agents/ruthless-tester.md](agents/ruthless-tester.md) | Testing and edge cases |
| **Merciless Evaluator** | [agents/merciless-evaluator.md](agents/merciless-evaluator.md) | BPSBS compliance |
| **Gate Keeper** | [agents/gate-keeper.md](agents/gate-keeper.md) | Capability verification + auto-fix |
| **Standards Oracle** | [agents/standards-oracle.md](agents/standards-oracle.md) | Code standards |
| **Memory Curator** | [agents/memory-curator.md](agents/memory-curator.md) | Context preservation |
| **Documentation Codifier** | [agents/documentation-codifier.md](agents/documentation-codifier.md) | Documentation |
| **Support & Debug Hunter** | [agents/support-debug-hunter.md](agents/support-debug-hunter.md) | Debugging |
| **Project Orchestrator** | [agents/project-orchestrator.md](agents/project-orchestrator.md) | Project coordination |
| **Agent Orchestrator** | [agents/agent-orchestrator.md](agents/agent-orchestrator.md) | Multi-agent coordination |
| **Mathematical Ground Checker** | [agents/mathematical-ground-checker.md](agents/mathematical-ground-checker.md) | Math validation |
| **AI Workflows Guide** | [agents/ai-workflows-and-learning-guide.md](agents/ai-workflows-and-learning-guide.md) | Learning and workflows |

### New Agents (v1.6.0)

| Agent | File | Perspective |
|-------|------|-------------|
| **Senior Software Engineer** | [agents/senior-software-engineer.md](agents/senior-software-engineer.md) | Assumption surfacing, push-back, simplicity |
| **UX/UI Specialist** | [agents/ux-ui-specialist.md](agents/ux-ui-specialist.md) | UI audit, design, migration, rewrite |
| **Security Specialist** | [agents/security-specialist.md](agents/security-specialist.md) | STRIDE, OWASP, vulnerability hunting |
| **Data Architect** | [agents/data-architect.md](agents/data-architect.md) | Schema design, query optimization |
| **Release Manager** | [agents/release-manager.md](agents/release-manager.md) | Versioning, changelogs, releases |
| **i18n Specialist** | [agents/i18n-specialist.md](agents/i18n-specialist.md) | Internationalization, localization |
| **Tech Lead** | [agents/tech-lead.md](agents/tech-lead.md) | Technical decisions, arbitration |
| **SRE Specialist** | [agents/sre-specialist.md](agents/sre-specialist.md) | Incident response, SLOs, monitoring |

### New Agents (v1.7.0)

| Agent | File | Perspective |
|-------|------|-------------|
| **Fixer Orchestrator** | [agents/fixer-orchestrator.md](agents/fixer-orchestrator.md) | Auto-remediation routing |
| **Version Manager** | `.claude/commands/version.md` | Version detection and updates |
| **Security Scanner** | `.claude/commands/security-scanner.md` | AI vulnerability detection |

### Copilot-Only Agents (5 GitHub-Specific)

| Agent | File | Perspective |
|-------|------|-------------|
| **Commit Message** | `.copilot/custom-agents/commit-message.md` | Conventional commit generation |
| **GitHub Actions** | `.copilot/custom-agents/github-actions.md` | CI/CD workflow creation |
| **GitHub Orchestrator** | `.copilot/custom-agents/github-orchestrator.md` | GitHub project coordination |
| **PR Review** | `.copilot/custom-agents/pr-review.md` | Pull request review |
| **Security Scanner (Extended)** | `.copilot/custom-agents/security-scanner.md` | PR-specific security scanning |

### Testing
- **[tests/README.md](tests/README.md)** - Framework test suite documentation
- **[tests/run-tests.sh](tests/run-tests.sh)** - Test runner script

---

Starting points for your work:

| Template | File | Purpose |
|----------|------|---------|
| **PRD Template** | [genesis/TEMPLATE.md](genesis/TEMPLATE.md) | Product Requirements Document |
| **BPSBS Standards** | [CLAUDE.md](CLAUDE.md) | Code standards enforcement |

---

## 📋 Documentation by Use Case

### "I'm new to the framework"
1. Read **[README.md](README.md)** (overview and installation)
2. Read **[docs/V1.1.0-RELEASE-NOTES.md](docs/V1.1.0-RELEASE-NOTES.md)** (what's new)
3. Choose platform documentation:
   - **Claude Code**: [docs/HOW-TO.md](docs/HOW-TO.md)
   - **Copilot CLI**: [.copilot/WORKFLOW-GUIDE.md](.copilot/WORKFLOW-GUIDE.md)

### "I want to use GitHub Copilot CLI"
1. Install: `install.sh --platform=copilot`
2. Run: `.copilot/helper.sh` (quick reference)
3. Read: `.copilot/WORKFLOW-GUIDE.md` (5 workflows)
4. Browse: `.copilot/custom-agents/README.md` (agent catalog)

### "I want security-hardened code"
1. Read: **[docs/ANTI_PATTERNS_DEPTH.md](docs/ANTI_PATTERNS_DEPTH.md)** (top 7 critical)
2. Reference: **[docs/ANTI_PATTERNS_BREADTH.md](docs/ANTI_PATTERNS_BREADTH.md)** (all 15 patterns)
3. Use: `/security-scanner` (all platforms) or `/security` features
4. Guide: [.copilot/SECURITY-INTEGRATION.md](.copilot/SECURITY-INTEGRATION.md)

### "I want to understand the architecture"
1. **[agents/_agent-protocol.md](agents/_agent-protocol.md)** - How agents communicate
2. **[agents/_state-machine.md](agents/_state-machine.md)** - Execution flow
3. **[docs/CONTEXT-ENGINEERING-SPEC.md](docs/CONTEXT-ENGINEERING-SPEC.md)** - Token management
4. **[agents/_tdd-protocol.md](agents/_tdd-protocol.md)** - TDD cycle

### "I need to troubleshoot an issue"
1. **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions
2. **[agents/_systematic-debugging.md](agents/_systematic-debugging.md)** - Debugging protocol
3. **[agents/_rollback-protocol.md](agents/_rollback-protocol.md)** - Recovery procedures
4. **[docs/HOW-TO.md](docs/HOW-TO.md)** - Troubleshooting section

### "I want to understand agent protocols"
1. **[docs/API-REFERENCE.md](docs/API-REFERENCE.md)** - Complete API reference
2. **[agents/_agent-protocol.md](agents/_agent-protocol.md)** - Inter-agent communication
3. **[agents/_state-machine.md](agents/_state-machine.md)** - Execution flow
4. **[agents/_metrics-system.md](agents/_metrics-system.md)** - Metrics collection

### "I want to debug an issue"
1. **[agents/_systematic-debugging.md](agents/_systematic-debugging.md)** - Debugging protocol
2. **[agents/_rollback-protocol.md](agents/_rollback-protocol.md)** - Recovery procedures
3. **[docs/HOW-TO.md](docs/HOW-TO.md)** - Troubleshooting section

### "I want to update my projects"
1. Run: `update.sh --all` (updates all projects)
2. Read: **[README.md](README.md)** - "Updating Existing Projects" section
3. Reference: **[docs/V1.1.0-RELEASE-NOTES.md](docs/V1.1.0-RELEASE-NOTES.md)** - What's changed

### "How does this compare to other AI coding tools?"
1. **[docs/MARKET-COMPARISON.md](docs/MARKET-COMPARISON.md)** - Comprehensive competitive analysis
2. Comparison with GitHub Copilot, Cursor, Claude Code, Aider, and others
3. Unique value propositions and competitive advantages

---

## 🎯 Documentation Summary

### Total Documentation

- **10** core documentation files (README, guides, release notes)
- **477 KB** security knowledge (ANTI_PATTERNS)
- **17** shared protocol modules
- **23** agent persona definitions
- **Platform-specific** guides for Claude Code and Copilot CLI

### Documentation Coverage

✅ **Installation** - README.md  
✅ **Quick Start** - README.md, helper.sh  
✅ **Workflows** - WORKFLOW-GUIDE.md (5 complete examples)  
✅ **Security** - docs/ANTI_PATTERNS_BREADTH.md + DEPTH.md
✅ **Agents** - custom-agents/README.md, agents/*.md  
✅ **Protocols** - agents/_*.md (15 files)  
✅ **Advanced** - Context engineering, state machines, metrics  
✅ **Updates** - README.md, update.sh documentation  
✅ **Release Notes** - V1.1.0-RELEASE-NOTES.md  

### Quality Standards

- ✅ **100% coverage** of v1.1.0 features
- ✅ **Examples included** for all workflows
- ✅ **Research citations** for security patterns
- ✅ **Quick reference** guides for both platforms
- ✅ **Troubleshooting** sections included

---

## 📞 Quick Links

### Most Important Documents

1. **[README.md](README.md)** - Start here!
2. **[docs/V1.1.0-RELEASE-NOTES.md](docs/V1.1.0-RELEASE-NOTES.md)** - What's new
3. **[docs/ANTI_PATTERNS_DEPTH.md](docs/ANTI_PATTERNS_DEPTH.md)** - Top 7 security issues
4. **[.copilot/WORKFLOW-GUIDE.md](.copilot/WORKFLOW-GUIDE.md)** - Workflows (Copilot)
5. **[docs/HOW-TO.md](docs/HOW-TO.md)** - Usage guide (Claude)

### Quick Reference

- **Copilot**: `.copilot/helper.sh` (run this!)
- **Claude**: [docs/QUICK-REFERENCE.md](docs/QUICK-REFERENCE.md)
- **Security**: [.copilot/SECURITY-INTEGRATION.md](.copilot/SECURITY-INTEGRATION.md)

---

**Framework Version**: 1.9.0.8
**Documentation Updated**: February 7, 2026
**Total Agents**: 46
**Compliance Presets**: 3 (HIPAA, SOC2, GDPR)
**Total Documentation Size**: ~700 KB
**Documentation Files**: 60+ files
**Coverage**: 100% of framework features
**Platforms**: Claude Code, GitHub Copilot CLI, Cursor
**OS Support**: Linux, Mac, Windows (PowerShell)

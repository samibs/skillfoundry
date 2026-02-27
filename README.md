# SkillFoundry

![CI](https://github.com/samibs/skillfoundry/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-2.0.13-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platforms](https://img.shields.io/badge/platforms-5-purple)
![Providers](https://img.shields.io/badge/providers-6-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

> A production AI engineering framework that turns requirements into tested, reviewable code through a multi-agent pipeline. Works inside your existing IDE (Claude Code, Cursor, Copilot, Codex, Gemini) or through a standalone interactive CLI. Ships with quality gates, persistent memory, autonomous mode, and cost controls.

---

## Two Ways to Use SkillFoundry

### 1. Inside Your IDE (No CLI Required)

SkillFoundry installs 60 skills directly into your AI coding tool. No separate CLI needed — just use the commands your platform already supports:

| Platform | How You Invoke Skills | Example |
|----------|----------------------|---------|
| **Claude Code** | `/command` | `/forge`, `/go`, `/review`, `/coder` |
| **GitHub Copilot** | `@agent-name` in chat | `@forge`, `@coder`, `@tester` |
| **Cursor** | Auto-loaded rules | Rules activate based on context |
| **OpenAI Codex** | `$command` | `$forge`, `$go`, `$review` |
| **Google Gemini** | Skill invocation | `forge`, `go`, `review` |

Every skill — from PRD generation to code review to security scanning — works natively in your IDE. The agents, protocols, and quality gates are injected into your project during install and your AI tool reads them automatically.

```bash
# Example: using SkillFoundry in Claude Code (no sf CLI)
/prd "add user authentication with OAuth2"
/go                    # validates PRDs, generates stories, implements
/forge                 # real AI pipeline: PRDs → stories → implement → gates → report
/forge --dry-run       # read-only scan: check PRDs, stories, and gates without executing
/review                # code review
/memory recall "auth"  # recall lessons from previous sessions
```

### 2. The Standalone CLI (`sf`)

For a dedicated terminal experience with streaming UI, agent routing, tool execution, and visual quality gates:

```
 ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 │ ◆ SkillFoundry CLI    anthropic:claude-sonnet ● team:dev ● $0.00 ● 14.2k tok │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

The CLI adds multi-provider switching, budget controls, permission management, and a visual tool execution interface on top of the same 60 skills.

---

## The CLI

```
 ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗ ██████╗ ██╗   ██╗
 ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝
 ███████╗█████╔╝ ██║██║     ██║     █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║  ██║██████╔╝ ╚████╔╝
 ╚════██║██╔═██╗ ██║██║     ██║     ██╔══╝  ██║   ██║██║   ██║██║╚██╗██║██║  ██║██╔══██╗  ╚██╔╝
 ███████║██║  ██╗██║███████╗███████╗██║     ╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝██║  ██║   ██║
 ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝   ╚═╝

  53 Agents  ●  60 Skills  ●  The Forge  ●  5 Platforms  ●  6 Providers          v2.0.13
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The `sf` command launches a terminal-native AI assistant with streaming responses, agent routing, quality gates, and multi-provider support.

```
 ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 │ ◆ SkillFoundry CLI    anthropic:claude-sonnet ● team:dev ● $0.00 ● 14.2k tok │
 └──────────────────────────────────────────────────────────────────────────────────┘

 │ ▸ sf:coder> I'll help you add dark mode. Let me look at the existing
 │             dashboard code...
 │
 │   ▸ bash    npm test                ✓ 0.8s
 │   ◉ read    src/styles/theme.ts     ✓ 0.1s
 │   ◈ write   src/styles/dark.ts      ✓ 0.1s
 │
 │   ● routed:high ● 142 in / 387 out ● $0.0045

 ╭──────────────────────────────────────────────────────────────────────────────────╮
 │ ⟫ looks good, now review for accessibility issues                               │
 ╰──────────────────────────────────────────────────────────────────────────────────╯

 │ ▸ sf:review> I'll review the dark mode implementation for accessibility...

 ──────────────────────────────────────────────────────────────────────────────────
 /help · /status · /plan · /forge · /team dev · /exit
```

---

## Quick Start

### Linux / macOS

```bash
# 1. Clone to a central location
git clone https://github.com/samibs/skillfoundry.git ~/dev-tools/skillfoundry

# 2. Install into your project (builds CLI + copies agents/skills)
cd ~/my-project
~/dev-tools/skillfoundry/install.sh

# 3. Launch
sf
```

### Windows (PowerShell)

```powershell
# 1. Clone to a central location
git clone https://github.com/samibs/skillfoundry.git C:\DevTools\skillfoundry

# 2. Install into your project
cd C:\MyProject
C:\DevTools\skillfoundry\install.ps1

# 3. Launch
sf
```

> **Requires Node.js v20+.** The installer builds the CLI and places a wrapper at
> `~/.local/bin/sf` (Linux/macOS) or `%USERPROFILE%\.local\bin\sf.cmd` (Windows).
> If the directory isn't on your PATH, the installer prints instructions to add it.

---

## Features

### Multi-Agent Teams

Summon a team once, and messages auto-route to the best agent for the job. No manual switching.

```
/team dev          → coder, tester, fixer, review, debugger
/team security     → security, review, tester
/team fullstack    → architect, coder, tester, review, debugger, docs
/team ops          → devops, sre, performance, security
/team ship         → coder, tester, review, release, docs
/team custom coder review tester    → build your own roster
```

Routing is keyword-based with weighted patterns — no extra LLM calls, deterministic and fast.

### Quality Gates (The Anvil)

Every handoff passes through a 6-tier quality pipeline:

```
 ◆ The Anvil

   ┣━ T1  ◉  Banned Patterns & Syntax      0.2s
   ┣━ T2  ◉  Type Check                     1.1s
   ┣━ T3  ◉  Tests                          3.4s
   ┣━ T4  ◉  Security Scan                  0.8s
   ┣━ T5  ◉  Build                          2.1s
   ┗━ T6  ◉  Scope Validation               0.3s

   ┌──────────────────────────────────────────┐
   │ ✓ VERDICT: PASS  5P 0F 0W 1S (7.9s)    │
   └──────────────────────────────────────────┘
```

### PRD-First Development

Every non-trivial feature starts with a Product Requirements Document. No PRD = no implementation.

```
/prd "user authentication with OAuth2"     → Creates genesis/2026-02-23-auth.md
/go                                        → Validates PRDs → generates stories → implements
/forge                                     → Real AI pipeline: PRDs → stories → implement → gates → report
/forge --dry-run                           → Read-only scan (no AI execution)
```

### Multi-Provider Support

Switch between 6 AI providers without changing your workflow:

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic Claude | `ANTHROPIC_API_KEY` | claude-sonnet-4 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| xAI Grok | `XAI_API_KEY` | grok-3 |
| Google Gemini | `GOOGLE_API_KEY` | gemini-2.5-flash |
| Ollama (local) | `OLLAMA_BASE_URL` | llama3.1 |
| LM Studio (local) | `LMSTUDIO_BASE_URL` | qwen2.5-coder-7b |

```bash
sf setup --provider anthropic --key sk-ant-...   # persistent storage
/provider set openai                              # switch at runtime
/provider set lmstudio                            # use LM Studio locally
```

### Budget Controls

Per-run and monthly cost caps with real-time tracking:

```toml
# .skillfoundry/config.toml
[budget]
monthly_limit_usd = 50.00
per_run_limit_usd = 2.00
```

Token usage and cost are shown live in the header during streaming.

### Local-First Development

Use local models (Ollama, LM Studio) for free, offline AI — with automatic fallback to cloud when needed.

```toml
# .skillfoundry/config.toml
[routing]
route_local_first = true        # Enable local-first routing
local_provider = "ollama"       # or "lmstudio"
local_model = "llama3.1"        # your preferred local model
context_window = 0              # 0 = auto-detect from model
```

**What happens when enabled:**
- Simple tasks (docs, formatting, boilerplate) route to your local model (free)
- Complex tasks (architecture, security, refactoring) route to cloud (paid)
- Context compaction automatically fits prompts within local model limits (4K-32K)
- If the local model is offline, cloud fallback activates with a warning

```
/cost                    → Shows local vs cloud token breakdown + estimated savings
/config route_local_first true   → Enable routing
/provider set lmstudio           → Switch to LM Studio
```

### Tool System

The AI executes tools with permission controls and dangerous command blocking:

| Tool | Icon | Purpose |
|------|------|---------|
| `bash` | `▸` | Run shell commands |
| `read` | `◉` | Read files with line numbers |
| `write` | `◈` | Create or overwrite files |
| `glob` | `✶` | Find files by pattern |
| `grep` | `≣` | Search file contents |

Permission modes: `auto` (read auto-approved, write asks), `ask` (prompt every time), `trusted` (allow all), `deny` (block all).

### Persistent Memory (Lessons Learned)

SkillFoundry remembers across sessions. Every decision, error, and pattern is stored in `memory_bank/` using append-only JSONL with weighted relevance ranking. Agents query this memory automatically — so they don't repeat mistakes or forget conventions.

```
memory_bank/
├── knowledge/
│   ├── bootstrap.jsonl          Pre-seeded framework knowledge
│   ├── facts.jsonl              Verified technical facts
│   ├── decisions.jsonl          Design decisions with rationale
│   ├── errors.jsonl             Error patterns and their solutions
│   └── preferences.jsonl        User preferences and conventions
├── relationships/
│   ├── knowledge-graph.json     Node/edge relationship graph
│   └── lineage.json             Correction chains and lineage
└── retrieval/
    ├── query-cache.json         Recent query cache
    └── weights.json             Weight adjustment history
```

**In the CLI:**
```
/memory stats                              Show memory bank statistics
/memory recall "authentication"            Find relevant lessons
```

**In any platform (Claude Code, Cursor, etc.):**
```
/gohm                                     Harvest lessons from current session
/memory recall "JWT"                       Recall what you learned about JWT
```

**Via shell scripts:**
```bash
scripts/memory.sh remember "Use RS256 for JWT, never HS256" decision
scripts/memory.sh recall "database migration"
scripts/memory.sh status
```

**Weight system:** Entries start at 0.5 weight. Validated-by-test entries gain +0.2. Retrieved-and-used entries gain +0.1. Corrected entries drop to 0.3 while the correction starts at 0.7. Higher weight = higher retrieval priority.

### Knowledge Sync (Cross-Project Learning)

Knowledge doesn't stay locked in one project. The sync daemon pushes lessons to a central GitHub repository and pulls global lessons back — so patterns learned in project A are available in project B.

```bash
# One-time setup: connect a global knowledge repo
scripts/knowledge-sync.sh init https://github.com/you/dev-memory.git

# Start the background sync daemon (syncs every 5 minutes)
scripts/knowledge-sync.sh start

# Manual sync
scripts/knowledge-sync.sh sync

# Promote recurring error patterns to global lessons
scripts/knowledge-sync.sh promote

# Register a new project for cross-project sync
scripts/knowledge-sync.sh register /path/to/project
```

**Harvest engine:** After a session, `scripts/harvest.sh` extracts decisions, errors, and patterns from one or all registered projects into the central `memory_bank/knowledge/` universal files. Entries that repeat 3+ times across projects get auto-promoted to global lessons.

### Autonomous Mode

Toggle autonomous mode and stop typing commands — just describe what you want in plain English. SkillFoundry classifies your intent and routes to the correct pipeline automatically.

```
/autonomous on                             Enable autonomous mode
```

Once active, every message is classified and routed:

| You Type | Classified As | Pipeline |
|----------|--------------|----------|
| "add dark mode to the dashboard" | FEATURE | Architect → Coder → Tester → Gate-Keeper |
| "the login is broken" | BUG | Debugger → Fixer → Tester |
| "clean up the auth module" | REFACTOR | Architect → Coder → Tester |
| "how does the payment flow work?" | QUESTION | Explain (read-only, no file changes) |
| "deploy to staging" | OPS | Ship / DevOps pipeline |
| "remember: we use RS256 for JWT" | MEMORY | Write to memory_bank/ |

Complex features automatically get a PRD generated in `genesis/`, stories broken out, and the full agent pipeline executed — with quality gates between every handoff.

```
/autonomous off                            Back to manual command mode
/autonomous status                         Check if autonomous mode is active
```

### Agent Evolution

Agents improve over time through a debate-implement-iterate loop:

```bash
scripts/evolve.sh debate                   Agents debate improvements
scripts/evolve.sh implement --auto-fix     Apply winning proposals
scripts/evolve.sh iterate                  Refine through multiple rounds
scripts/evolve.sh run                      Full evolution cycle
```

---

## CLI Commands

| Command | Purpose |
|---------|---------|
| `/help` | List all available commands |
| `/setup` | Configure API keys interactively |
| `/status` | Session info, provider, budget, state |
| `/team <name>` | Summon a team (dev, security, ops, fullstack, review, ship) |
| `/agent <name>` | Activate a single agent (coder, review, tester, etc.) |
| `/plan <task>` | Generate a read-only implementation plan |
| `/apply [plan-id]` | Execute a plan with quality gate enforcement |
| `/gates [target]` | Run The Anvil quality gates (T1-T6) |
| `/forge` | Real AI pipeline: PRDs → stories → implement → gates → report |
| `/forge --dry-run` | Read-only scan: check PRDs, stories, and gates |
| `/prd "idea"` | Create a Product Requirements Document |
| `/go` | Orchestrate implementation from PRDs |
| `/provider [set <name>]` | Switch AI providers |
| `/cost` | Token usage and cost report |
| `/memory [stats\|recall]` | Query or record knowledge entries |
| `/config [key] [value]` | View or edit configuration |
| `/exit` | Quit the CLI |

---

## Supported Platforms

The framework generates platform-specific configurations during install. Each platform gets the same 60 skills adapted to its native format:

| Platform | What Gets Installed | How to Invoke | Notes |
|----------|-------------------|---------------|-------|
| **Claude Code** | `.claude/commands/` (60 skills) | `/command` | Slash commands in Claude Code CLI |
| **GitHub Copilot** | `.copilot/custom-agents/` (60 agents) | `@agent` in chat | Custom agents in Copilot Chat |
| **Cursor** | `.cursor/rules/` (60 rules) | Auto-loaded | Rules activate based on context |
| **OpenAI Codex** | `.agents/skills/` (60 skills) | `$command` | Dollar-prefix commands in Codex CLI |
| **Google Gemini** | `.gemini/skills/` (60 skills) | Skill invocation | Available in Gemini sessions |

Install multiple platforms at once:

```bash
./install.sh --platform="claude,cursor,copilot"    # Linux/macOS
./install.ps1 -Platform "claude,cursor,copilot"     # Windows
```

**All 60 skills work identically across platforms.** The installer translates agent contracts from `agents/` into each platform's native format. When you update the framework, `update.sh` / `update.ps1` regenerates all platform files.

---

## Architecture

```
skillfoundry/
├── sf_cli/                  Interactive CLI (Node.js + React/Ink)
│   ├── src/core/            Provider adapters, tools, permissions, gates, budget, compaction, health checks
│   ├── src/components/      Terminal UI: Header, Input, Message, GateTimeline, ...
│   ├── src/commands/        Slash command handlers (/team, /agent, /plan, ...)
│   └── src/hooks/           Session state and streaming hooks
├── agents/                  53 agent contracts and orchestration protocols
├── genesis/                 PRD templates and your feature documents
├── memory_bank/             Persistent knowledge across sessions
│   ├── knowledge/           facts, decisions, errors, preferences (JSONL)
│   └── relationships/       Knowledge graph and lineage tracking
├── scripts/                 Shell tooling (works without the CLI)
│   ├── memory.sh            Remember, recall, correct knowledge
│   ├── harvest.sh           Extract lessons from projects
│   ├── knowledge-sync.sh    Sync daemon for cross-project learning
│   ├── anvil.sh             Quality gate runner
│   ├── evolve.sh            Agent evolution (debate → implement → iterate)
│   ├── session-init.sh      Session startup (pull knowledge, start daemon)
│   └── session-close.sh     Session teardown (harvest, sync, stop daemon)
├── compliance/              GDPR, HIPAA, SOC2 profiles and automated checks
├── observability/           Audit logging, metrics collection, trace viewer
│
│  Platform skill files (generated by installer):
├── .claude/commands/        Claude Code (60 skills)
├── .copilot/custom-agents/  GitHub Copilot (60 agents)
├── .cursor/rules/           Cursor (60 rules)
├── .agents/skills/          OpenAI Codex (60 skills)
└── .gemini/skills/          Google Gemini (60 skills)
```

---

## How It Works

```
                    ┌─────────────┐
                    │   /prd      │  Write requirements
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   /go       │  Validate → generate stories → implement
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ Architect  │ │ Coder │ │  Tester   │  Agent pipeline
        └─────┬─────┘ └───┬───┘ └─────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │  The Anvil  │  T1-T6 quality gates
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  /security  │  OWASP scan + credential check
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   /gohm     │  Harvest lessons → memory_bank/
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ knowledge   │  Sync to global repo (optional)
                    │    sync     │  Lessons available in all projects
                    └─────────────┘
```

Or skip the steps and run `/forge` for the full pipeline in one command. The Forge drives real AI execution: it discovers PRDs, generates stories, implements each story using the agentic tool-use loop, runs T1-T6 quality gates (with auto-fixer retries), and persists run metadata. Use `/forge --dry-run` for a read-only scan.

**In autonomous mode**, you skip all the commands. Just type "add user authentication" and the pipeline runs end-to-end — PRD generated, stories broken out, agents dispatched, quality gates enforced, lessons harvested.

---

## Updating

After pulling the latest framework:

```bash
# Linux/macOS
cd ~/dev-tools/skillfoundry && git pull
./update.sh ~/my-project              # Updates skills + rebuilds CLI

# Windows
cd C:\DevTools\skillfoundry; git pull
.\update.ps1 -Project C:\MyProject    # Updates skills + rebuilds CLI
```

Update all registered projects at once:

```bash
./update.sh --all                      # Linux/macOS
.\update.ps1 -All                      # Windows
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/USER-GUIDE-v1.9.0.16.md) | Full CLI usage guide |
| [Quick Reference](docs/QUICK-REFERENCE.md) | Command cheat sheet |
| [Agent Evolution](docs/AGENT-EVOLUTION.md) | How agents evolve and improve |
| [API Reference](docs/API-REFERENCE.md) | CLI internals and extension points |
| [Persistent Memory](memory_bank/README.md) | Memory bank schema and usage |
| [Autonomous Mode](docs/AUTONOMOUS-EXECUTION.md) | Autonomous developer loop details |
| [Knowledge Sync](docs/PERSISTENT-MEMORY-IMPLEMENTATION.md) | Cross-project knowledge sync |
| [Anti-Patterns](docs/ANTI_PATTERNS_DEPTH.md) | Security anti-patterns to avoid |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [Changelog](CHANGELOG.md) | Version history |

---

## Contributing

1. Create a branch from `main`
2. Implement with tests (308+ tests must pass)
3. Run `/forge` or `/gates` to validate
4. Open a pull request with rationale

---

## License

MIT License. See [LICENSE](LICENSE).

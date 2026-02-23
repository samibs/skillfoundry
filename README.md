# SkillFoundry

![CI](https://github.com/samibs/skillfoundry/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-2.0.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platforms](https://img.shields.io/badge/platforms-5-purple)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

> A production AI engineering framework that turns requirements into tested, reviewable code through a multi-agent pipeline. Ships with an interactive CLI, quality gates, and cost controls.

---

## The CLI

```
 ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗ ██████╗ ██╗   ██╗███╗   ██╗██████╗ ██████╗ ██╗   ██╗
 ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝██╔═══██╗██║   ██║████╗  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝
 ███████╗█████╔╝ ██║██║     ██║     █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║  ██║██████╔╝ ╚████╔╝
 ╚════██║██╔═██╗ ██║██║     ██║     ██╔══╝  ██║   ██║██║   ██║██║╚██╗██║██║  ██║██╔══██╗  ╚██╔╝
 ███████║██║  ██╗██║███████╗███████╗██║     ╚██████╔╝╚██████╔╝██║ ╚████║██████╔╝██║  ██║   ██║
 ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝   ╚═╝

  53 Agents  ●  60 Skills  ●  The Forge  ●  5 Platforms                         v2.0.4
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
/forge                                     → Full pipeline: validate → implement → test → audit → harvest
```

### Multi-Provider Support

Switch between 5 AI providers without changing your workflow:

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic Claude | `ANTHROPIC_API_KEY` | claude-sonnet-4 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| xAI Grok | `XAI_API_KEY` | grok-3 |
| Google Gemini | `GOOGLE_API_KEY` | gemini-2.5-flash |
| Ollama (local) | `OLLAMA_BASE_URL` | llama3.1 |

```bash
sf setup --provider anthropic --key sk-ant-...   # persistent storage
/provider set openai                              # switch at runtime
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
| `/forge` | Full pipeline: validate, implement, test, audit, harvest |
| `/prd "idea"` | Create a Product Requirements Document |
| `/go` | Orchestrate implementation from PRDs |
| `/provider [set <name>]` | Switch AI providers |
| `/cost` | Token usage and cost report |
| `/memory [stats\|recall]` | Query or record knowledge entries |
| `/config [key] [value]` | View or edit configuration |
| `/exit` | Quit the CLI |

---

## Supported Platforms

The framework generates platform-specific configurations during install:

| Platform | What Gets Installed | How to Use |
|----------|-------------------|------------|
| **Claude Code** | `.claude/commands/` (60 skills) | `/command` in Claude Code |
| **GitHub Copilot** | `.copilot/custom-agents/` (60 agents) | Invoke in Copilot Chat |
| **Cursor** | `.cursor/rules/` (60 rules) | Auto-loaded in Cursor IDE |
| **OpenAI Codex** | `.agents/skills/` (60 skills) | `$command` in Codex CLI |
| **Google Gemini** | `.gemini/skills/` (60 skills) | Available in Gemini sessions |

Install multiple platforms at once:

```bash
./install.sh --platform="claude,cursor,copilot"    # Linux/macOS
./install.ps1 -Platform "claude,cursor,copilot"     # Windows
```

---

## Architecture

```
skillfoundry/
├── sf_cli/                  Interactive CLI (Node.js + React/Ink)
│   ├── src/core/            Provider adapters, tools, permissions, gates, budget
│   ├── src/components/      Terminal UI: Header, Input, Message, GateTimeline, ...
│   ├── src/commands/        Slash command handlers (/team, /agent, /plan, ...)
│   └── src/hooks/           Session state and streaming hooks
├── agents/                  53 agent contracts and orchestration protocols
├── .claude/commands/        Claude Code skill definitions (60 skills)
├── .copilot/custom-agents/  GitHub Copilot agent definitions
├── .cursor/rules/           Cursor rule definitions
├── .agents/skills/          Codex skill definitions
├── .gemini/skills/          Gemini skill definitions
├── genesis/                 PRD templates and your feature documents
├── scripts/                 Installers, sync, anvil, cost routing, diagnostics
├── compliance/              GDPR, HIPAA, SOC2 profiles and automated checks
├── memory_bank/             Persistent knowledge: decisions, patterns, errors
└── observability/           Audit logging, metrics collection, trace viewer
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
                    │   Done      │  Knowledge harvested to memory_bank/
                    └─────────────┘
```

Or skip the steps and run `/forge` for the full pipeline in one command.

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
| [Anti-Patterns](docs/ANTI_PATTERNS_DEPTH.md) | Security anti-patterns to avoid |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [Changelog](CHANGELOG.md) | Version history |

---

## Contributing

1. Create a branch from `main`
2. Implement with tests (238+ tests must pass)
3. Run `/forge` or `/gates` to validate
4. Open a pull request with rationale

---

## License

MIT License. See [LICENSE](LICENSE).

# SkillFoundry

![CI](https://github.com/samibs/skillfoundry/actions/workflows/ci.yml/badge.svg)

SkillFoundry is a production AI engineering framework that turns requirements into tested, reviewable code with a multi-agent pipeline. It ships with an interactive CLI that streams AI responses, enforces quality gates, and tracks cost — inspired by Claude Code and Gemini CLI.

**v2.0.0** | 5 Platforms | 53 Agents | 60 Skills | Interactive CLI

## Interactive CLI

The SkillFoundry CLI (`sf`) is a terminal-native AI assistant with streaming responses, tool execution, quality gates, and multi-provider support.

```
$ cd my-project && sf

  ╭──────────────────────────────────────────────────────────╮
  │  SkillFoundry CLI    anthropic:claude-sonnet  |  $0.00  │
  ╰──────────────────────────────────────────────────────────╯

  you> add dark mode to the dashboard

  sf> I'll help you add dark mode. Let me look at the existing
      dashboard code...

      [reading src/styles/theme.ts ...]
      [writing src/styles/dark-theme.ts ...]

  ✓ Done (142 in / 387 out | $0.0045)

  you> _

  /help · /status · /plan · /forge · /exit quit
```

### Install & Run

```bash
# Clone and install (creates ~/.local/bin/sf wrapper automatically)
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry
./install.sh --platform=claude

# Now use sf from any project directory
cd ~/my-project
sf            # Launch interactive REPL
sf init       # Initialize workspace with .skillfoundry/ config
sf --version  # Show framework version
```

> **Requires Node.js v20+.** The installer builds the CLI and places a lightweight
> wrapper at `~/.local/bin/sf`. If `~/.local/bin` is not on your PATH, the
> installer prints shell-specific instructions to add it.

### CLI Commands

| Command | Purpose |
|---------|---------|
| `/help` | List all available commands |
| `/setup` | Configure API keys (or run `sf setup` from terminal) |
| `/status` | Show session info, provider, state |
| `/plan <task>` | Generate a read-only implementation plan |
| `/apply [plan-id]` | Execute a plan with quality gate enforcement |
| `/gates [target]` | Run The Anvil quality gates (T1-T6) independently |
| `/forge` | Full pipeline: validate PRDs, check stories, run gates, security audit |
| `/provider [list\|set <name>]` | Switch between AI providers |
| `/config [key] [value]` | View or edit configuration |
| `/cost` | Token usage and cost report |
| `/memory [stats\|recall\|capture]` | Query or record knowledge entries |
| `/lessons <content>` | Quick-capture a lesson learned |
| `/exit` | Quit the CLI |

### Multi-Provider Support

The CLI supports 5 AI providers out of the box:

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic Claude | `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` | claude-sonnet-4 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| xAI Grok | `XAI_API_KEY` | grok-3 |
| Google Gemini | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | gemini-2.5-flash |
| Ollama (local) | `OLLAMA_BASE_URL` | llama3.1 |

```bash
# Configure via sf setup (recommended — stores key persistently)
sf setup --provider anthropic --key sk-ant-...

# Or set env var
export ANTHROPIC_API_KEY="sk-ant-..."

# Switch at runtime
/provider set openai
```

### Tool System

The AI can execute tools autonomously with permission controls:

- **bash** — Run shell commands (with dangerous command blocking)
- **read** — Read files with line numbers
- **write** — Create or overwrite files
- **glob** — Find files by pattern
- **grep** — Search file contents

Permission modes: `auto` (allow all), `ask` (prompt each time), `deny` (block all), `trusted` (allow read-only).

### Budget Controls

Per-run and monthly cost caps enforced from `config.toml`:

```toml
[budget]
monthly_limit_usd = 50.00
per_run_limit_usd = 2.00
```

---

## Why SkillFoundry

- PRD-first workflow for non-trivial work
- Multi-agent execution with explicit handoffs
- Built-in quality gates (The Anvil, 6 tiers)
- Security and standards enforcement (Top 12 critical checks)
- Data isolation enforcement (row-level ownership, query scoping)
- Cross-platform skill generation and sync
- Continuous agent evolution loop (debate -> implement -> iterate)

## Supported Platforms

- Claude Code
- GitHub Copilot CLI
- Cursor
- OpenAI Codex
- Google Gemini

## Quick Start

### 1) Clone & Install

```bash
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry

# Linux/macOS — installs platform skills + builds the sf CLI
./install.sh --platform=claude

# Windows PowerShell
./install.ps1 -Platform claude
```

Replace `claude` with: `claude`, `copilot`, `cursor`, `codex`, `gemini`

### 2) Use the CLI from any project

```bash
cd ~/my-project
sf init          # Creates .skillfoundry/ workspace config
sf               # Launch interactive REPL
```

### 3) Or use platform-native commands

```text
# Inside your IDE or Claude Code session:
/prd "your feature"
/go
```

Full pipeline shortcut:

```text
/forge
```

## Core Agent Commands

- `/prd` create PRD in `genesis/`
- `/go` orchestrate implementation pipeline
- `/forge` run full validate -> implement -> inspect flow
- `/anvil` run 6-tier quality gate
- `/stories` generate implementation stories from PRD
- `/tester` run testing workflow
- `/security` run security audit workflow

## Architecture at a Glance

```
skillfoundry/
├── sf_cli/                  Interactive CLI (Node.js + Ink)
│   ├── src/core/            Provider adapters, tools, permissions, gates, budget, memory
│   ├── src/components/      React terminal UI components
│   ├── src/commands/        Slash command handlers
│   └── src/hooks/           Session and streaming hooks
├── agents/                  Agent contracts and orchestration rules
├── .agents/skills/          Codex-compatible skill definitions
├── scripts/                 Installers, sync, diagnostics, automation
├── genesis/                 PRDs (Product Requirements Documents)
├── docs/stories/            Generated implementation stories
├── memory_bank/             Learning and persistent knowledge artifacts
├── compliance/              GDPR, HIPAA, SOC2 profiles and checks
└── observability/           Audit logging, metrics, trace viewer
```

## Documentation

- CLI visual guide: `docs/USER-GUIDE-CLI.md`
- Agent evolution: `docs/AGENT-EVOLUTION.md`
- Quick reference: `docs/QUICK-REFERENCE.md`
- Docs index: `DOCUMENTATION-INDEX.md`
- API reference: `docs/API-REFERENCE.md`

## Versioning and Releases

Current framework line: `v2.0.0`

Detailed release notes are maintained in:
- `CHANGELOG.md`

## Contributing

1. Create a branch
2. Implement with tests
3. Run quality checks
4. Open a pull request with rationale and evidence

## License

MIT License. See `LICENSE`.

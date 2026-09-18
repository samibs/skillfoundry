# SkillFoundry

**Turn requirements into tested, production-ready code — with quality gates your AI can't skip.**

![CI](https://github.com/samibs/skillfoundry/actions/workflows/ci.yml/badge.svg)
[![npm downloads](https://img.shields.io/npm/dw/skillfoundry)](https://www.npmjs.com/package/skillfoundry)
![Version](https://img.shields.io/badge/version-5.32.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platforms](https://img.shields.io/badge/platforms-6-purple)
![Providers](https://img.shields.io/badge/providers-6-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

SkillFoundry is an AI engineering framework that works two ways: as a **standalone CLI** (`sf`)
with its own AI connection, or as a **skill layer inside the IDE you already use** (Claude Code,
Cursor, Copilot, Codex, Gemini, Grok Build). Either way you get the same thing — quality gates
your AI can't skip, a PRD-first pipeline that enforces structure before any code is written, and
memory that carries lessons from one session into the next.

<p align="center">
  <img src="docs/demo.gif" alt="SkillFoundry /forge demo — PRD validation, story implementation, quality gates, security audit" width="840">
</p>

---

## Why SkillFoundry?

- **Standalone or inside your IDE — your choice.** Run `sf` as an independent CLI with your own
  API key, no IDE required. Or install the skills into Claude Code, Cursor, Copilot, Codex,
  Gemini, or Grok Build and work in the tool you already use. Same agents, same gates, same
  pipeline.
- **Quality gates your AI can't bypass.** The Anvil runs correctness contracts, banned-pattern
  scans, type checks, tests, security scans, build, and scope validation between every agent
  handoff. Code that fails doesn't ship.
- **Adversarial threat modeling built in.** The Specter engine red-teams every pipeline run,
  generating attack vectors with CVSS metadata and simulating exploits before your code leaves
  the pipeline.
- **PRD-first, not vibe-coding.** Every feature starts with a Product Requirements Document,
  validated before a single line of code is written.
- **Memory across sessions.** Decisions, errors, and patterns are stored and recalled with
  semantic search, so your AI doesn't repeat the same mistakes.
- **6 AI providers with budget controls.** Anthropic, OpenAI, xAI, Google, Ollama, LM Studio —
  with per-run and monthly cost caps. Switch providers without changing how you work.

---

## What's New in v5.32.0 — Delivery Efficiency

**Your AI stops doing more work than the change needs.**

The problem isn't that AI agents get things wrong. It's that they're *expensive*: re-reading the
same code, re-running the same test suite, re-reviewing the same unchanged diff, and carrying on
long after the change was already proven. Run several agents at once and most of the compute goes
into rediscovery.

- **A typo fix doesn't trigger your full test suite.** Every task gets a budget — LOW, MEDIUM, or
  HIGH — decided from what it touches, and that picks how much analysis, testing, and review it
  warrants.
- **Anything already proven isn't proven twice.** If a check passed and none of the files it
  depended on changed, it's skipped. Change one of those files and it runs again.
- **Three agents don't run the same suite three times.** The first runs it, the others use the
  result. The one repository-wide pass happens at the end, over the combined change.
- **Agents stop when the work is done.** No re-reading the same diff, no unrequested "while I'm
  here" refactoring.
- **Security work is never optimised.** Anything touching authentication, secrets, cryptography,
  migrations, payments, or deployment is HIGH automatically — even a one-line change.

```
/delivery plan STORY-042

  Budget:      MEDIUM
  Test scope:  affected
  Impact:      3 changed files reach 22 dependents within 3 hops

  Why this scope
    · MEDIUM budget starts at "targeted"
    · 22 dependent files exceed the 15-file fan-out bound — widened to "affected"
```

It tells you *why*, every time — and reports what it couldn't measure as unknown rather than
guessing. On by default; a single setting turns it off if you'd rather keep validating
everything.

[Delivery efficiency guide](docs/DELIVERY-EFFICIENCY.md) ·
[Release summary](docs/RELEASE-NOTES.md) ·
[Full changelog](CHANGELOG.md)

> Looking for what changed in an older version? Every release is summarised in
> [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md), with the complete technical record in
> [CHANGELOG.md](CHANGELOG.md).

---

## Quick Install

```bash
# Standalone CLI — no IDE needed
npm install -g skillfoundry
sf setup                           # interactive: choose provider, paste API key
sf forge                           # run the full pipeline from your terminal

# Or add skills to your existing IDE
npx skillfoundry init              # installs skills into Claude Code / Cursor / Copilot

# Homebrew (macOS)
brew install samibs/tap/skillfoundry
```

Linux and macOS one-liner — download the global installer, then run it:

```bash
curl -fsSL https://raw.githubusercontent.com/samibs/skillfoundry/main/scripts/install-global.sh -o install-global.sh
bash install-global.sh
```

## Quick Start (5 Minutes)

**1. Install and set up**

```bash
npm install -g skillfoundry
sf setup                           # pick a provider, paste your API key
```

**2. Describe what you want to build**

```bash
/prd "add user authentication"     # writes a requirements document to genesis/
```

**3. Forge production code**

```bash
/forge                             # validate, implement, test, and audit automatically
```

> **Using an IDE?** Run `npx skillfoundry init` in your project to add these skills directly to
> Claude Code, Cursor, Copilot, Codex, Gemini, or Grok Build.

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
# Option A: npx
cd C:\MyProject
npx skillfoundry init

# Option B: npm global
npm install -g skillfoundry
cd C:\MyProject; skillfoundry init

# Option C: git clone
git clone https://github.com/samibs/skillfoundry.git C:\DevTools\skillfoundry
cd C:\MyProject
C:\DevTools\skillfoundry\install.ps1
```

</details>

> **Requires Node.js v20+** for the standalone CLI. IDE skills work without Node.js.
>
> **Cross-platform:** Linux, macOS, and Windows (native, Git Bash, and WSL). Quality gates and
> anvil scripts auto-detect the environment.
>
> **New here?** See the [Todo API example](examples/todo-api/) — a complete project built from a
> single PRD in two commands. For model recommendations, see
> [Model Compatibility](docs/model-compatibility.md).

---

## How It Works

```
 /prd "feature"          Write requirements (saved to genesis/)
       │
 /forge                  The full pipeline:
       │
       ├── Validate PRD         Are requirements complete?
       ├── Generate stories     Break into implementable units
       ├── Implement            Architect → Coder → Tester pipeline
       ├── Quality gates        The Anvil + micro-gates between handoffs
       ├── Circuit breaker      Halt on repeated systemic errors
       ├── Security audit       OWASP scan + dependency CVEs + credential check
       ├── Harvest knowledge    Save lessons to memory_bank/
       └── Quality metrics      Track gate pass rates and trends
```

Or use autonomous mode and just say what you want in plain English:

```
/autonomous on
> "add dark mode to the dashboard"    → classified as FEATURE → full pipeline runs
> "the login is broken"               → classified as BUG → debugger + fixer dispatched
```

A step-by-step walkthrough of the pipeline internals lives in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Two Ways to Use SkillFoundry

Two independent systems that share the same agents, gates, and philosophy:

| | **Standalone CLI** (`sf`) | **IDE Skills** |
|---|---|---|
| **What it is** | Terminal app with its own AI connection | Skill files your AI coding tool reads |
| **Runs inside** | Your terminal (any OS, no IDE needed) | Claude Code, Copilot, Cursor, Codex, Gemini, Grok Build |
| **Setup** | `sf setup` — interactive wizard, paste API key | `skillfoundry init` — copies skills into your project |
| **Full pipeline** | `sf forge`, `sf plan`, `sf gates` (35 commands) | `/forge`, `/go`, `/goma` (98 skills) |
| **Autonomous mode** | Not available | `/goma` — full autonomous with safety gates |
| **Provider switching** | Built-in: 6 providers, switch at runtime | Uses your IDE's provider |
| **Budget controls** | Per-run and monthly cost caps | Not available |
| **Persistent memory** | `/memory`, `/lessons` | `/memory`, `/gohm` |
| **Requires** | Node.js v20+ | An AI coding tool |

**No IDE? Start with `sf`.** `npm install -g skillfoundry && sf setup` and you're running the
full pipeline in under a minute. Already using Cursor or Claude Code? Install the skills on top
and get autonomous mode and full orchestration as well.

### 1. Inside your IDE (recommended)

| Platform | Invocation | Example |
|----------|-----------|---------|
| **Claude Code** | `/command` | `/forge`, `/go`, `/goma`, `/review` |
| **GitHub Copilot** | `@agent` in chat | `@forge`, `@coder`, `@tester` |
| **Cursor** | Auto-loaded rules | Rules activate on context |
| **OpenAI Codex** | `$command` | `$forge`, `$go`, `$review` |
| **Google Gemini** | Skill invocation | `forge`, `go`, `review` |
| **Grok Build** | Skill invocation | `forge`, `go`, `review` |

```bash
# Full pipeline — same commands on every platform
/prd "add user authentication"     # create requirements
/forge                             # validate → implement → gate → audit → harvest
/goma                              # autonomous mode: just describe what you want

# Individual agents
/coder                             # code implementation
/review                            # code review
/security audit                    # security scan
/memory recall "auth"              # recall lessons from previous sessions
```

### 2. The standalone CLI (`sf`)

A terminal app with its own AI connection — useful for provider switching, budget controls, and
working outside an IDE.

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
```

---

## Features

### Quality gates

Every handoff passes through the Anvil, plus AI-powered micro-gates per story:

```
 ◆ The Anvil

   ┣━ T0  ◉  Correctness Contract           0.1s
   ┣━ T1  ◉  Banned Patterns & Syntax       0.2s
   ┣━ T2  ◉  Type Check                     1.1s
   ┣━ T3  ◉  Tests                          3.4s
   ┣━ T4  ◉  Security Scan                  0.8s
   ┣━ T5  ◉  Build                          2.1s
   ┗━ T6  ◉  Scope Validation               0.3s

   ┌──────────────────────────────────────────┐
   │ ✓ VERDICT: PASS  6P 0F 0W 1S (8.0s)    │
   └──────────────────────────────────────────┘

 ◆ Micro-Gates (per story)

   ┣━ MG0   ◉  AC Validation (static)       PASS
   ┣━ MG1   ◉  Security Review (AI)         PASS
   ┣━ MG1.5 ◉  Test Documentation (AI)      PASS
   ┣━ MG2   ◉  Standards Review (AI)        PASS
   ┗━ MG3   ◉  Cross-Story Review (AI)      PASS  (advisory)
```

If a security or standards gate fails, the fixer is triggered automatically. Run the gates
against any diff — including code your IDE's AI wrote on its own — with `/verify`.

### PRD-first development

```
/prd "user authentication with OAuth2"     → creates genesis/2026-02-23-auth.md
/go                                        → validate PRDs → generate stories → implement
/forge                                     → full AI pipeline with gates and audit
/forge --dry-run                           → read-only scan, no AI execution
```

### Multi-agent teams

Summon a team once and messages route to the right agent automatically — keyword-based,
deterministic, no extra LLM calls:

```
/team dev          → coder, tester, fixer, review, debugger
/team security     → security, review, tester
/team fullstack    → architect, coder, tester, review, debugger, docs
/team ops          → devops, sre, performance, security
/team ship         → coder, tester, review, release, docs
/team custom coder review tester    → build your own roster
```

### Governed missions (`/mission`)

When work has to be **provably** done — not just finished — run it as a governed mission.
SkillFoundry writes a durable record into `.ai/` that outlives the session:

```
/mission init STORY-042 --title "JWT refresh rotation"
/mission gate STORY-042                      → WRITES AUTHORIZED / BLOCKED
/mission evidence STORY-042 --kind tests --run "npm test"
/mission verify STORY-042                    → Definition of Done
```

What it catches that a green test run does not:

- **"Tests passed" while the runner hung** — clean termination is an acceptance criterion.
- **A dev server orphaned after the run** — every process has a recorded owner, so cleanup never
  turns into a blind kill of every Node process.
- **A change silently dropped during a merge** — provenance verifies the contribution is in the
  final tree.
- **"Pushed" mistaken for "published"** — the remote is re-read after the push.
- **"It was probably already broken"** — that claim needs a baseline run, or it isn't accepted.

Running several agents at once? `/mission wave plan` builds one dependency graph across your PRDs
and defers work that would collide, and each writer gets its own git worktree. Full details in
[MULTI_AGENT_PROTOCOL.md](MULTI_AGENT_PROTOCOL.md).

### Delivery efficiency (`/delivery`)

Effort scales with risk: budgets decide how much validation a change warrants, proven-and-unchanged
work is never re-proven, and parallel agents share one validation instead of each running the full
suite. Security-sensitive work is always HIGH.
See [docs/DELIVERY-EFFICIENCY.md](docs/DELIVERY-EFFICIENCY.md).

### Multi-provider support

| Provider | Env Variable | Default Model |
|----------|-------------|---------------|
| Anthropic Claude | `ANTHROPIC_API_KEY` | claude-sonnet-4 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| xAI Grok | `XAI_API_KEY` | grok-4.3 |
| Google Gemini | `GOOGLE_API_KEY` | gemini-2.5-flash |
| Ollama (local) | `OLLAMA_BASE_URL` | llama3.1 |
| LM Studio (local) | `LMSTUDIO_BASE_URL` | qwen2.5-coder-7b |

```bash
sf setup --provider anthropic --key sk-ant-...   # stored for future sessions
/provider set openai                              # switch at runtime
/provider set lmstudio                            # use LM Studio locally
```

### Budget controls

Per-run and monthly cost caps, with live token and cost display in the header:

```toml
# .skillfoundry/config.toml
[budget]
monthly_limit_usd = 50.00
per_run_limit_usd = 2.00
```

### Local-first development

Use local models (Ollama, LM Studio) for free, offline AI — with automatic cloud fallback.

```toml
# .skillfoundry/config.toml
[routing]
route_local_first = true        # enable local-first routing
local_provider = "ollama"       # or "lmstudio"
local_model = "llama3.1"        # your preferred local model
context_window = 0              # 0 = auto-detect from model
```

Simple tasks (docs, formatting, boilerplate) go to your local model for free; complex tasks
(architecture, security, refactoring) go to the cloud. Prompts are compacted automatically to fit
local context limits, and if the local model is offline, cloud fallback activates with a warning.
`/cost` shows the local vs cloud split and your estimated savings.

### Smart output compression

Tool output is compressed before it reaches the AI — typically 60–90% fewer tokens on common
commands (`git status`, `npm test`, `tsc`, `npm install`), with full output preserved on errors.
No configuration needed.

### Pipeline resume

`/forge` tracks story completion and resumes where it left off. If a run is interrupted, re-run
it and only the remaining stories are implemented:

```
Implementing 2 stories (3 already done, skipped)
```

### Codebase pre-flight (Code Map)

Before the AI changes existing code, SkillFoundry maps your repo so it works from facts, not
guesses — API surface, import graph, and database/layer map.

```bash
/preflight              # build or refresh the Code Map and print a summary
/preflight query <name> # look up a symbol or file and its connections
/preflight diff-impact  # blast radius of your current changes
```

It runs automatically inside `/forge` and `/go`, and is advisory — it never blocks a run. You can
also explore it visually in the dashboard's **Code Map** tab.

### Interactive debugger

Agents can debug your code with real breakpoints, variable inspection, and expression evaluation:

```
/debug src/server.ts              # start a debug session, paused at entry
/debug src/server.ts:42           # start and break at line 42
/debug test src/auth.test.ts      # debug a test file via the test runner
```

### Persistent memory

Every decision, error, and pattern is stored in `memory_bank/` and recalled automatically, so
agents don't repeat mistakes or forget your conventions. Every `/forge` run harvests knowledge
without you asking.

```
/memory stats                              show memory bank statistics
/memory recall "authentication"            find relevant lessons
/gohm                                      harvest lessons from this session
```

```bash
scripts/memory.sh remember "Use RS256 for JWT, never HS256" decision
scripts/memory.sh recall "database migration"
scripts/memory.sh status
```

### Knowledge sync across projects

Lessons don't stay locked in one project. A sync daemon pushes them to a central Git repository
and pulls global lessons back, so a pattern learned in project A is available in project B.

```bash
scripts/knowledge-sync.sh init https://github.com/you/dev-memory.git   # one-time setup
scripts/knowledge-sync.sh start                                        # background daemon
scripts/knowledge-sync.sh sync                                         # manual sync
scripts/knowledge-sync.sh promote                                      # promote recurring patterns
scripts/knowledge-sync.sh register /path/to/project                    # add a project
```

### Autonomous mode

Stop typing commands — describe what you want and SkillFoundry classifies the intent and routes
it to the right pipeline.

```
/autonomous on
```

| You type | Classified as | Pipeline |
|----------|--------------|----------|
| "add dark mode to the dashboard" | FEATURE | Architect → Coder → Tester → Gate-Keeper |
| "the login is broken" | BUG | Debugger → Fixer → Tester |
| "clean up the auth module" | REFACTOR | Architect → Coder → Tester |
| "how does the payment flow work?" | QUESTION | Explain (read-only, no file changes) |
| "deploy to staging" | OPS | Ship / DevOps pipeline |
| "remember: we use RS256 for JWT" | MEMORY | Write to memory_bank/ |

Complex features automatically get a PRD, stories, and the full pipeline — with quality gates
between every handoff. `/autonomous off` returns to manual mode; `/autonomous status` shows the
current state.

### VS Code extension

A native extension that runs setup, quality gates, telemetry, and forge runs in your editor.

```
┌──────────┬──────────────────────────────┬───────────────┐
│ Explorer │ Editor                       │ SF Sidebar    │
│          │                              │               │
│          │  src/auth.ts                 │ ◆ Dashboard   │
│          │  ─────────────────           │  Pass Rate 94%│
│          │  1 │ import { hash }         │  Last Forge ✓ │
│          │  2 │ // rate limit pending ⚠ │  CVEs: 2 high │
│          │    │ ▸ Run T1 (Patterns)     │               │
│          │    │ ▸ Run T4 (Security)     │ ◆ Gate Status │
│          │                              │  T0-T6 results│
│          │                              │               │
│          │                              │ ◆ Forge       │
│          │                              │  Phase: SPECTER│
│          │                              │  Story: 5/8   │
├──────────┴──────────────────────────────┴───────────────┤
│ SF: 94% gates │ sf:coder │ $0.12               Output   │
└─────────────────────────────────────────────────────────┘
```

- **Setup wizard** — prompts for provider and API key on first open; the key is stored in VS Code
  SecretStorage, never written to disk.
- **Forge progress** — a cancellable notification for the whole run, with live phase tracking in
  the sidebar.
- **Inline diagnostics** — gate findings appear as squiggly underlines, like ESLint.
- **CodeLens** — run a single gate straight from the file it applies to.
- **Sidebar dashboard** — gate pass rate, security findings, telemetry trends, dependency CVEs.

```bash
# From the VS Code Marketplace — search "SkillFoundry" in Extensions, or:
code --install-extension skillfoundry.skillfoundry

# Or build from source
cd skillfoundry-vscode && npm install && npm run build
code --install-extension skillfoundry-1.3.0.vsix
```

### Domain experts

Building for a specialized non-IT field (law, accounting, real estate, medical)? Generic output
there is often *correct but not professionally right*. SkillFoundry synthesizes a **review-only
domain reviewer** for the field, on demand.

```bash
/domain expert "French legal contract drafting"   # synthesize a reviewer + knowledge pack
/domain experts                                    # list reviewers in this project
```

It checks terminology, register, and way of working, and cites its source or flags it as
unverified — it never gives advice or makes determinations. A reviewer that proves useful across
3+ projects is promoted to the framework.
Full guide: [docs/DOMAIN-EXPERTS.md](docs/DOMAIN-EXPERTS.md).

### Dead-code and duplication pruning

```bash
/prune                    # scan: unused imports/exports + copy-paste blocks
/prune deadcode --fix     # remove fully-unused imports (the safe subset only)
/prune duplicates         # locate copy-paste blocks to extract into shared code
```

Safe by default: only fully-unused import lines are auto-removed. Unused exports and duplicate
blocks are reported for review, never blind-deleted.

### Agent evolution

```bash
scripts/evolve.sh debate                   agents debate improvements
scripts/evolve.sh implement --auto-fix     apply winning proposals
scripts/evolve.sh iterate                  refine through multiple rounds
scripts/evolve.sh run                      full evolution cycle
```

---

## Command Reference

### `sf` CLI commands

These run inside the `sf` terminal app:

| Command | Purpose |
|---------|---------|
| `/help` | List available commands |
| `/setup` | Configure API keys for providers |
| `/status` | Session and workspace status |
| `/team <name>` | Summon a team (dev, security, ops, fullstack, ship) |
| `/agent <name>` | Activate a single agent (coder, review, tester, …) |
| `/plan <task>` | Create a read-only implementation plan |
| `/apply [plan-id]` | Execute a plan with quality gate checks |
| `/gates [target]` | Run the Anvil quality gates on the project |
| `/gate <t0-t6\|all>` | Run a single quality gate or all of them |
| `/forge` | Full pipeline: validate PRDs → implement → gate → report |
| `/forge --dry-run` | Read-only scan without AI execution |
| `/mission` | Governed mission: ledger, attestation, evidence, provenance, waves |
| `/delivery` | Delivery budgets, scoped validation, evidence reuse, stop conditions |
| `/provider [set <name>]` | List, switch, or show the current provider |
| `/model [model-name]` | List or switch the AI model |
| `/route` | Smart task routing based on historical agent performance |
| `/cost` | Token usage, cost breakdown, and delivery efficiency |
| `/tokens` | Analyze and compress context to reduce token costs |
| `/memory [stats\|recall]` | Recall, capture, or view memory bank stats |
| `/lessons` | Capture a lesson into the knowledge bank |
| `/config [key] [value]` | Show or update configuration |
| `/metrics [--window N]` | Quality metrics dashboard with trends |
| `/report [--format md\|json]` | Generate an exportable quality report |
| `/benchmark` | Compare quality against industry baselines |
| `/audit` | View the gate decision audit log |
| `/dashboard` | Multi-project dashboard: sync, overview, drill-down, patterns |
| `/certify` | RegForge certification pipeline (15 categories) |
| `/domain` | Industry Knowledge Engine: query, validate, generate from packs |
| `/generate` | Generate JWT tokens, API keys, passwords, certificates, `.env` files locally |
| `/boost` | Fast code transforms without an LLM (var→const, add types, …) |
| `/optimize` | Mutation-based skill prompt optimization |
| `/prd review <path>` | Score a PRD on four dimensions with actionable feedback |
| `/runtime` | Runtime status: agent pool, message bus, vector store |
| `/hook install\|uninstall\|status` | Manage git hook integration for quality gates |
| `/publish` | Publish skills to platform-specific directories |
| `/upgrade` | Check for and apply framework updates |

### IDE skills

These run inside your AI coding tool, not in the `sf` CLI. Highlights:

| Skill | Purpose |
|-------|---------|
| `/forge` | Full 6-phase pipeline (Ignite → Forge → Temper → Inspect → Remember → Debrief) |
| `/go` | PRD-first orchestrator: validate → stories → implement |
| `/goma` | Autonomous mode: classify intent, route to pipeline, execute |
| `/prd "idea"` | Create a Product Requirements Document |
| `/coder` | Code implementation agent |
| `/tester` | Test generation and validation |
| `/review` | Code review |
| `/verify` | Run the gates against any diff (PASS / WARN / BLOCK) |
| `/security` | Security audit (OWASP, credentials, banned patterns) |
| `/web-security-check` | Pre-production gate: TLS, headers, cookies, DNS, leakage, redirects |
| `/architect` | System design and architecture |
| `/debug` | Interactive debugger (breakpoints, scope, evaluate) |
| `/layer-check` | Three-layer validation (DB → Backend → Frontend) |
| `/mission` | Governed mission: durable `.ai/` ledger, evidence, multi-agent waves |
| `/delivery` | Delivery budgets, scoped tests, evidence reuse |
| `/prune` | Dead-code and duplication remover |
| `/memory` | Knowledge management |
| `/gohm` | Harvest lessons from the current session |
| `/autonomous` | Toggle the autonomous developer loop |

Run `/help` in your IDE for the full list.

> **Note:** `/forge` exists in both systems but they are different implementations. The IDE skill
> orchestrates sub-agents; the CLI command runs a self-contained pipeline.

---

## Supported Platforms

The installer generates platform-specific configurations, so each platform gets the same skills
in its native format:

| Platform | What gets installed | How to invoke |
|----------|-------------------|---------------|
| **Claude Code** | `.claude/commands/` | `/command` |
| **GitHub Copilot** | `.copilot/custom-agents/` | `@agent` in chat |
| **Cursor** | `.cursor/rules/` | Auto-loaded on context |
| **OpenAI Codex** | `.agents/skills/` | `$command` |
| **Google Gemini** | `.gemini/skills/` | Skill invocation |
| **Grok Build** | `.grok/skills/` | Skill invocation |

Install several platforms at once:

```bash
./install.sh --platform="claude,cursor,copilot"    # Linux/macOS
./install.ps1 -Platform "claude,cursor,copilot"     # Windows
```

Skills behave identically across platforms. When you update the framework, `update.sh` /
`update.ps1` regenerates every platform's files.

---

## Updating

```bash
# Linux/macOS
cd ~/dev-tools/skillfoundry && git pull
./update.sh ~/my-project              # updates skills + rebuilds the CLI

# Windows
cd C:\DevTools\skillfoundry; git pull
.\update.ps1 -Project C:\MyProject    # updates skills + rebuilds the CLI
```

Update every registered project at once:

```bash
./update.sh --all                      # Linux/macOS
.\update.ps1 -All                      # Windows
```

---

## Documentation

**Getting started**

| Document | Description |
|----------|-------------|
| [Quick Reference](docs/QUICK-REFERENCE.md) | Command cheat sheet |
| [User Guide](docs/USER-GUIDE-CLI.md) | Full CLI usage guide |
| [Todo API Example](examples/todo-api/) | A complete project built from a single PRD |
| [Model Compatibility](docs/model-compatibility.md) | Which AI models work, and tier recommendations |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |

**Using the framework**

| Document | Description |
|----------|-------------|
| [Autonomous Mode](docs/AUTONOMOUS-EXECUTION.md) | The autonomous developer loop |
| [Delivery Efficiency](docs/DELIVERY-EFFICIENCY.md) | Budgets, scoped validation, stop conditions |
| [Multi-Agent Protocol](MULTI_AGENT_PROTOCOL.md) | Governed missions, waves, worktree isolation |
| [Domain Experts](docs/DOMAIN-EXPERTS.md) | Review-only experts for specialized non-IT fields |
| [Knowledge Sync](docs/PERSISTENT-MEMORY-IMPLEMENTATION.md) | Cross-project knowledge sync |
| [Configuration Reference](docs/CONFIGURATION-REFERENCE.md) | Every setting and environment variable |

**Going deeper**

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Internals: repo layout, pipeline, tools, logging, memory |
| [API Reference](docs/API-REFERENCE.md) | CLI internals and extension points |
| [Anti-Patterns](docs/ANTI_PATTERNS_DEPTH.md) | Security anti-patterns the gates enforce |
| [Release Notes](docs/RELEASE-NOTES.md) | Summary of what changed in each release |
| [Changelog](CHANGELOG.md) | Full technical version history |

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, and code
standards. Short version: fork, branch, write tests, open a PR against `main`.

---

## License

MIT License. See [LICENSE](LICENSE).

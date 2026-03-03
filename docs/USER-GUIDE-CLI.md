# SkillFoundry CLI — Visual User Guide

> **v2.0.23** — Interactive terminal AI assistant with streaming, tools, quality gates, multi-provider support, and local-first development.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The Interface](#2-the-interface)
3. [Chat & Streaming](#3-chat--streaming)
4. [Slash Commands Reference](#4-slash-commands-reference)
5. [Tool Execution](#5-tool-execution)
6. [Permissions & Safety](#6-permissions--safety)
7. [Planning & Applying](#7-planning--applying)
8. [Quality Gates (The Anvil)](#8-quality-gates-the-anvil)
9. [The Forge Pipeline](#9-the-forge-pipeline)
10. [Multi-Provider Setup](#10-multi-provider-setup)
11. [Budget & Cost Controls](#11-budget--cost-controls)
12. [Local-First Development](#12-local-first-development)
13. [Memory System](#13-memory-system)
14. [Configuration Reference](#14-configuration-reference)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)

---

## 1. Getting Started

### Prerequisites

- Node.js >= 20.0.0
- At least one AI provider API key (Anthropic recommended)

### Installation

```bash
# Clone and install (creates ~/.local/bin/sf wrapper automatically)
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry
./install.sh --platform=claude
```

The installer builds the CLI and places a wrapper at `~/.local/bin/sf`. If `~/.local/bin` is not on your PATH, it prints shell-specific instructions.

### First Run

```bash
cd ~/my-project
sf
```

On first launch with no API key configured, the CLI shows an **interactive setup wizard**:

```
  SkillFoundry CLI — First-Run Setup
  ===================================

  No API key detected. Choose a provider to get started:

    1) Anthropic Claude
       Get key: https://console.anthropic.com/settings/keys
    2) OpenAI
       Get key: https://platform.openai.com/api-keys
    3) xAI Grok
       Get key: https://console.x.ai/
    4) Google Gemini
       Get key: https://aistudio.google.com/apikey
    5) Ollama (local, no key needed)
    6) LM Studio (local, no key needed)
    7) Skip (configure later with sf setup)

  Type q or /exit to quit.

  Select provider [1]:
```

Your API key is saved to `~/.config/skillfoundry/credentials.toml` (permissions `0600`). On subsequent launches, the CLI goes straight to the REPL.

You can also configure credentials non-interactively:

```bash
sf setup --provider anthropic --key sk-ant-...
sf setup --list                 # Show all configured providers
sf setup --provider openai --remove   # Remove a stored key
```

### Initialize a Project

```bash
# Create .skillfoundry/config.toml and policy.toml in a project
sf init
```

This creates:

```
my-project/
├── .skillfoundry/
│   ├── config.toml      # Provider, model, budget settings
│   └── policy.toml      # Permission and security policies
```

---

## 2. The Interface

When you launch `sf`, you see the interactive terminal UI:

```
  ╭──────────────────────────────────────────────────────────────╮
  │  SkillFoundry CLI    anthropic:claude-sonnet-4  |  $0.00    │
  ╰──────────────────────────────────────────────────────────────╯
                         ▲
                    Header Bar
              Shows provider, model, cost


  (message area - initially empty)



  ╭──────────────────────────────────────────────────────────────╮
  │  you> _                                                      │
  ╰──────────────────────────────────────────────────────────────╯
       ▲
  Input Area — type messages or /commands here

  /help commands | /status info | /exit quit        mode:ask | ready
                                                        ▲
                                                   Status Bar
                                            Shows mode + state machine
```

### Layout Breakdown

```
┌─────────────────────────────────────────────┐
│  HEADER BAR                                 │  Provider:Model  |  $cost
├─────────────────────────────────────────────┤
│                                             │
│  MESSAGE LIST                               │  Scrollable history
│    - User messages (bold)                   │  of all messages
│    - AI responses (markdown-rendered)       │
│    - System messages (dim)                  │
│    - Tool calls (with status indicators)    │
│                                             │
├─────────────────────────────────────────────┤
│  INPUT AREA                                 │  Type here
├─────────────────────────────────────────────┤
│  STATUS BAR                                 │  Shortcuts | Mode | State
└─────────────────────────────────────────────┘
```

---

## 3. Chat & Streaming

Type a message and press Enter. The AI streams its response in real-time:

```
  you> explain the authentication flow in this project

  sf> ⠋ Thinking...

  sf> The authentication flow works as follows:

      1. **Login Request** — The client sends credentials to
         `POST /auth/login`
      2. **Token Generation** — The server validates credentials
         and returns a JWT...

      [streaming continues...]

  ✓ 156 in / 423 out | $0.0062
```

### What the Token Counter Means

```
  ✓ 156 in / 423 out | $0.0062
    ▲         ▲           ▲
    │         │           └── Cost for this request in USD
    │         └────────────── Output tokens (AI response)
    └──────────────────────── Input tokens (your message + context)
```

### Multi-Turn Conversations

The CLI maintains conversation history within a session. Each message builds on the previous context:

```
  you> what files handle routing?

  sf> The routing is handled by these files:
      - src/routes/index.ts (main router)
      - src/routes/auth.ts (authentication routes)
      - src/routes/api.ts (API routes)

  you> show me the auth routes

  sf> Here are the authentication routes from src/routes/auth.ts:
      [shows the relevant code, using context from previous message]
```

---

## 4. Slash Commands Reference

Type `/` followed by a command name. All commands are available from the input prompt.

### Information Commands

```
  you> /help

  ╭──────────────────────────────────────────╮
  │  SkillFoundry CLI — Available Commands   │
  ├──────────────────────────────────────────┤
  │  /help       Show this help message      │
  │  /status     Session info and state      │
  │  /setup      Configure API keys          │
  │  /provider   List or switch providers    │
  │  /config     View or edit configuration  │
  │  /cost       Token usage and cost report │
  │  /memory     Knowledge base operations   │
  │  /lessons    Quick-capture a lesson      │
  │  /plan       Generate implementation plan│
  │  /apply      Execute a plan with gates   │
  │  /gates      Run quality gates (T1-T6)   │
  │  /forge      Full pipeline execution     │
  │  /exit       Quit the CLI                │
  ╰──────────────────────────────────────────╯
```

```
  you> /status

  ╭──────────────────────────────────────────╮
  │  Session Status                          │
  ├──────────────────────────────────────────┤
  │  State:     IDLE                         │
  │  Provider:  anthropic                    │
  │  Model:     claude-sonnet-4-20250514     │
  │  Session $: $0.0062                      │
  │  Monthly $: $3.47 / $50.00               │
  │  Messages:  2                            │
  │  Uptime:    4m 23s                       │
  ╰──────────────────────────────────────────╯
```

### Cost Report

```
  you> /cost

  ╭──────────────────────────────────────────╮
  │  Cost Report                             │
  ├──────────────────────────────────────────┤
  │  This session:  $0.0062                  │
  │  Today:         $1.24                    │
  │  This month:    $3.47 / $50.00 (6.9%)    │
  │                                          │
  │  By Provider:                            │
  │    anthropic    12 calls    $2.89        │
  │    openai        4 calls    $0.58        │
  │                                          │
  │  Last 5 entries:                         │
  │    10:23  anthropic  claude-sonnet  $0.006│
  │    10:19  anthropic  claude-sonnet  $0.004│
  │    10:15  openai     gpt-4o        $0.012│
  │    09:45  anthropic  claude-sonnet  $0.003│
  │    09:30  anthropic  claude-sonnet  $0.008│
  ╰──────────────────────────────────────────╯
```

---

## 5. Tool Execution

When the AI needs to interact with your codebase, it uses tools. Each tool call is displayed with status indicators:

### Tool Call Display

```
  sf> Let me check the project structure...

  ┌ glob  pattern: "src/**/*.ts"
  │ ✓ Found 23 files (0.1s)
  └

  ┌ read  file: src/routes/auth.ts
  │ ✓ 45 lines read (0.0s)
  └

  ┌ bash  command: npm test
  │ ⠋ Running...
  │ ✓ All 12 tests passed (3.2s)
  └

  sf> I've reviewed the code and tests. Here's what I found...
```

### Tool Status Indicators

```
  ⠋  Running (animated spinner)
  ✓  Completed successfully
  ✗  Failed (error message shown)
  ?  Waiting for permission
```

### Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `bash` | Run shell commands | `npm test`, `git status` |
| `read` | Read files with line numbers | `src/index.ts`, lines 1-50 |
| `write` | Create or update files | Write new code to a file |
| `glob` | Find files by pattern | `src/**/*.test.ts` |
| `grep` | Search file contents | Search for `async function` |

---

## 6. Permissions & Safety

The CLI enforces permission controls to prevent unsafe AI actions.

### Permission Modes

Set in `.skillfoundry/policy.toml`:

```toml
[permissions]
mode = "ask"    # auto | ask | deny | trusted
```

| Mode | Behavior |
|------|----------|
| `auto` | Allow all tool calls automatically |
| `ask` | Prompt before each tool call (default) |
| `deny` | Block all tool calls |
| `trusted` | Allow read-only tools, ask for writes |

### Permission Prompt

When mode is `ask`, you see a prompt before tool execution:

```
  ┌────────────────────────────────────────────────┐
  │  Permission Required                           │
  │                                                │
  │  bash: npm install lodash                      │
  │                                                │
  │  [a] Allow   [d] Deny   [A] Always allow       │
  │  [T] Always allow bash                         │
  └────────────────────────────────────────────────┘
```

| Key | Action |
|-----|--------|
| `a` | Allow this one call |
| `d` | Deny this call |
| `A` | Always allow this exact call |
| `T` | Always allow this tool type for the session |

### Dangerous Command Blocking

These patterns are **always blocked** regardless of permission mode:

```
  rm -rf /           # Recursive root delete
  mkfs               # Filesystem format
  dd if=             # Disk overwrite
  curl ... | bash    # Remote code execution
  :(){ :|:& };:     # Fork bomb
```

### Sensitive Operations (Always Ask)

These always prompt even in `auto` mode:

```
  git push            git reset --hard
  npm publish         docker rm
  kubectl delete
```

---

## 7. Planning & Applying

The plan/apply workflow separates planning from execution, giving you review checkpoints.

### Step 1: Create a Plan

```
  you> /plan add user authentication with JWT

  sf> ⠋ Generating plan...

  ╭──────────────────────────────────────────╮
  │  Plan: plan-1708700000-a1b2c3d4          │
  ├──────────────────────────────────────────┤
  │                                          │
  │  1. Create user model (src/models/)      │
  │  2. Add auth routes (POST /auth/login)   │
  │  3. JWT token service (RS256)            │
  │  4. Auth middleware                      │
  │  5. Integration tests                    │
  │                                          │
  │  PRD Context: genesis/authentication.md  │
  │  Saved: .skillfoundry/plans/plan-...md   │
  ╰──────────────────────────────────────────╯

  State: IDLE → VALIDATED
```

### Step 2: Apply the Plan

```
  you> /apply

  ╭──────────────────────────────────────────╮
  │  Pre-Apply Quality Gates                 │
  ├──────────────────────────────────────────┤
  │  T1 Syntax     ✓ PASS                   │
  │  T2 Types      ✓ PASS                   │
  │  T3 Tests      ✓ PASS                   │
  │  T4 Security   ✓ PASS                   │
  │  T5 Build      ✓ PASS                   │
  │  T6 Scope      ✓ PASS                   │
  ├──────────────────────────────────────────┤
  │  Verdict: PASS — Proceeding             │
  ╰──────────────────────────────────────────╯

  sf> Executing plan... [tool calls stream here]

  State: VALIDATED → EXECUTING_STORY → COMPLETED
```

### Approval Checkpoints

During apply, if changes need review:

```
  ╭──────────────────────────────────────────╮
  │  Approval Required                       │
  │                                          │
  │  Files modified:                         │
  │    + src/models/user.ts  (new)           │
  │    ~ src/routes/index.ts (modified)      │
  │                                          │
  │  [a] Approve  [r] Reject  [e] Edit      │
  ╰──────────────────────────────────────────╯
```

---

## 8. Quality Gates (The Anvil)

Run quality gates independently with `/gates`:

```
  you> /gates

  The Anvil — Quality Gate Report
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  T1  Banned Patterns & Syntax    ✓ PASS
      No TODO/FIXME/HACK markers found
      No syntax errors detected

  T2  Type Check                  ✓ PASS
      TypeScript: 0 errors

  T3  Tests                       ⚠ WARN
      23/24 tests passing (1 skipped)

  T4  Security Scan               ✓ PASS
      No hardcoded secrets
      No eval() or exec() patterns

  T5  Build                       ✓ PASS
      Build completed (2.1s)

  T6  Scope Validation            — SKIP
      No story file specified

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Verdict: WARN (1 gate with warnings)
```

### Gate Tiers Explained

| Tier | What It Checks | Fails On |
|------|---------------|----------|
| T1 | Banned patterns (`TODO`, `FIXME`, `HACK`), syntax errors | Any banned pattern found |
| T2 | TypeScript `tsc --noEmit`, pyright, or similar type checker | Type errors |
| T3 | Test suite (`npm test`, `vitest`, `pytest`) | Test failures |
| T4 | Security scan (hardcoded secrets, `eval()`, SQL injection patterns) | Security violations |
| T5 | Full build (`npm run build`, `cargo build`) | Build errors |
| T6 | Scope validation (changes match story requirements) | Scope drift |

### Micro-Gates (MG1-MG3)

In addition to the T1-T6 gates, the Forge pipeline runs lightweight AI-powered micro-gates at handoff points. These give cross-agent quality enforcement — security blocks insecure code, standards blocks non-compliant code — at ~15% cost increase.

| Gate | When | Agent | Checks | Blocks? |
|------|------|-------|--------|---------|
| **MG1** | After each story | `security` | OWASP Top 10, injection, hardcoded secrets, auth issues | Yes |
| **MG2** | After each story | `standards` | Missing docs, magic numbers, naming, conventions | Yes |
| **MG3** | Before TEMPER | `review` | Cross-story inconsistencies, arch issues, duplicate code | Advisory only |

MG1 and MG2 run after each story implementation, before the T1 gate. If either returns FAIL, the fixer agent is triggered with the combined findings. MG3 runs once after all stories complete — it checks cross-story consistency but does not block the pipeline.

Each micro-gate uses read-only tools (read, glob, grep) with a maximum of 3 turns.

```
  Story implemented
    ↓
  MG1 [v] security: PASS
  MG2 [!] standards: WARN — [LOW] Missing jsdoc
    ↓
  T1 [v] Banned Patterns
    ↓
  (next story or TEMPER phase)
    ↓
  MG3 [v] review: PASS — All consistent
    ↓
  TEMPER T1-T6
```

---

## 9. The Forge Pipeline

`/forge` runs the complete pipeline in one command:

```
  you> /forge

  The Forge — Full Pipeline
  ━━━━━━━━━━━━━━━━━━━━━━━━━━

  Phase 1 (Ignite) — Validating PRDs
    ✓ genesis/authentication.md
    ✓ genesis/payment-integration.md
    2 PRDs validated

  Phase 2 (Forge) — Implementing Stories
    ✓ STORY-001-auth-models ($0.0120)
      MG1 [v] security: PASS
      MG2 [v] standards: PASS
    ✓ STORY-002-login-api ($0.0150)
      MG1 [v] security: PASS
      MG2 [!] standards: WARN — Missing jsdoc on 2 exports

  Pre-TEMPER Review
    MG3 [v] review: PASS — All consistent

  Phase 3 (Temper) — Quality Gates
    T1 ✓  T2 ✓  T3 ✓  T4 ✓  T5 ✓  T6 ✓

  Phase 4 (Inspect) — Security Audit
    ✓ No security violations

  Phase 5 (Debrief) — Summary
    Stories: 2/2 complete
    Gates: All passing
    Micro-gates: 5P 0F 1W ($0.0280)
    Security: Clean

  ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Verdict: PASS — Ready for deployment
```

---

## 10. Multi-Provider Setup

### List Available Providers

```
  you> /provider list

  ╭──────────────────────────────────────────────────╮
  │  Available Providers                             │
  ├──────────────────────────────────────────────────┤
  │  ✓ anthropic   Anthropic Claude    claude-son..  │
  │    openai      OpenAI             gpt-4o         │
  │    xai         xAI Grok           grok-3         │
  │  ✓ gemini      Google Gemini      gemini-2.5-..  │
  │  ✓ ollama      Ollama (local)     llama3.1       │
  │  ✓ lmstudio    LM Studio (local)  qwen2.5-co..  │
  ├──────────────────────────────────────────────────┤
  │  ✓ = API key detected / always available         │
  │  Active: anthropic                               │
  ╰──────────────────────────────────────────────────╯
```

### Switch Provider

```
  you> /provider set openai

  ✓ Provider switched to openai (gpt-4o)
```

### Credential Management

The recommended way to configure API keys is `sf setup`:

```bash
sf setup --provider anthropic --key sk-ant-...
sf setup --provider openai --key sk-...
sf setup --list                     # Show all configured providers
```

Keys are stored at `~/.config/skillfoundry/credentials.toml` (permissions `0600`). You can also configure keys from within the REPL using `/setup`.

### Environment Variables

Environment variables override stored credentials. These are checked automatically:

```bash
# Anthropic (recommended)
export ANTHROPIC_API_KEY="sk-ant-api03-..."
# or use a bearer token
export ANTHROPIC_AUTH_TOKEN="..."

# OpenAI
export OPENAI_API_KEY="sk-..."

# xAI (Grok)
export XAI_API_KEY="xai-..."

# Google Gemini
export GOOGLE_API_KEY="AIza..."
# or
export GEMINI_API_KEY="AIza..."

# Ollama (local, no key needed)
export OLLAMA_BASE_URL="http://localhost:11434/v1"

# LM Studio (local, no key needed)
export LMSTUDIO_BASE_URL="http://localhost:1234/v1"
```

### Provider Capabilities

| Provider | Streaming | Tool Use | Extended Thinking | Local |
|----------|-----------|----------|-------------------|-------|
| Anthropic | Yes | Yes | Yes | No |
| OpenAI | Yes | Yes | No | No |
| xAI | Yes | Yes | No | No |
| Gemini | Yes | Yes | No | No |
| Ollama | Yes | Yes | No | Yes |
| LM Studio | Yes | Yes | No | Yes |

---

## 11. Budget & Cost Controls

### Configuration

In `.skillfoundry/config.toml`:

```toml
[budget]
monthly_limit_usd = 50.00
per_run_limit_usd = 2.00
```

### How It Works

```
  ┌─────────────────────────────────────────────┐
  │  Budget Check (every API call)              │
  │                                             │
  │  Monthly:  $3.47 / $50.00  ██░░░░░░  6.9%  │
  │  This run: $0.08 / $2.00   ██░░░░░░  4.0%  │
  │                                             │
  │  Status: ALLOWED                            │
  └─────────────────────────────────────────────┘
```

### When Budget Is Exceeded

```
  ⚠ Monthly budget exceeded ($50.23 / $50.00)
    Remaining API calls blocked until next month.
    Adjust with: /config budget.monthly_limit_usd 75
```

### Usage Tracking

Usage is persisted to `.skillfoundry/usage.json` with:
- Per-request entries (provider, model, tokens, cost, timestamp)
- Monthly totals (auto-aggregated)
- Provider breakdown

---

## 12. Local-First Development

Use local AI models (Ollama, LM Studio) to reduce costs, work offline, and keep sensitive code on-device.

### Enable Local-First Routing

```
  you> /config route_local_first true

  Set route_local_first = true. Config saved.
```

Or edit `.skillfoundry/config.toml`:

```toml
[routing]
route_local_first = true
local_provider = "ollama"       # or "lmstudio"
local_model = "llama3.1"
context_window = 0              # 0 = auto-detect from model
```

### How Routing Works

```
  ┌───────────────────────────────────────────┐
  │  Task Classifier (keyword-based, no LLM)  │
  ├──────────────────┬────────────────────────┤
  │  SIMPLE           │  COMPLEX              │
  │  docs, format,    │  architect, security,  │
  │  explain, readme   │  refactor, test, debug │
  ├──────────────────┼────────────────────────┤
  │  → Local Model    │  → Cloud Provider     │
  │  (free)           │  (paid)               │
  └──────────────────┴────────────────────────┘
```

- **Simple tasks**: docstring, format, explain, readme, changelog, summarize, template, boilerplate
- **Complex tasks**: architect, security, refactor, implement, test, debug, migrate, design
- **Default**: If no keywords match, routes to cloud (safer)

### Context Compaction

Local models have smaller context windows (4K-32K tokens vs 128K-200K for cloud). The CLI automatically compacts context:

1. **System prompt compression** — Strips code blocks, examples, and tables when over budget
2. **Message sliding window** — Keeps first user message (intent) + last N turns that fit
3. **Summary injection** — Prepends "[N earlier messages omitted...]" when pruning

```
  Context compaction:
    Cloud model (200K):   Full context sent as-is
    Local model (8K):     System prompt compressed, last 4-6 turns kept
```

### Provider Health Checks

When using local providers, the CLI pings localhost before each session:

```
  ✓ ollama is running (localhost:11434)

  ⚠ LM Studio is offline. Falling back to Anthropic Claude.
```

- **500ms timeout** — won't slow you down
- **60-second cache** — doesn't re-ping every message
- **Graceful fallback** — automatically switches to cloud with a warning

### Cost Savings

```
  you> /cost

  Local vs Cloud:
    Local:  50,000 tokens ($0.0000)
    Cloud:  20,000 tokens ($0.1500)
    Saved:  ~$0.3750 by routing locally
```

### Supported Local Providers

| Provider | Install | Default Port | Default Model |
|----------|---------|-------------|---------------|
| Ollama | [ollama.com](https://ollama.com) | `localhost:11434` | llama3.1 |
| LM Studio | [lmstudio.ai](https://lmstudio.ai) | `localhost:1234` | qwen2.5-coder-7b |

Both use the OpenAI-compatible API format (`/v1/chat/completions`).

---

## 13. Memory System

The CLI integrates with SkillFoundry's knowledge base (`memory_bank/knowledge/`) for persistent learning across sessions.

### Check Memory Stats

```
  you> /memory stats

  ╭──────────────────────────────────────────╮
  │  Memory Bank Stats                       │
  ├──────────────────────────────────────────┤
  │  Total entries: 47                       │
  │                                          │
  │  By type:                                │
  │    lesson     18                         │
  │    decision   12                         │
  │    error       9                         │
  │    pattern     8                         │
  │                                          │
  │  Most recent:                            │
  │    [lesson]   Always validate user...    │
  │    [decision] Use JWT RS256 for auth...  │
  │    [error]    TypeScript strict mode...  │
  ╰──────────────────────────────────────────╯
```

### Recall Knowledge

```
  you> /memory recall authentication

  ╭──────────────────────────────────────────╮
  │  Memory Recall: "authentication"         │
  ├──────────────────────────────────────────┤
  │  3 matches found                         │
  │                                          │
  │  [decision] Use JWT RS256 for auth       │
  │    tags: auth, jwt, security             │
  │    date: 2026-02-19                      │
  │                                          │
  │  [lesson] Always validate user input     │
  │    tags: validation, security, database  │
  │    date: 2026-02-20                      │
  │                                          │
  │  [error] Token refresh race condition    │
  │    tags: auth, tokens, concurrency       │
  │    date: 2026-02-18                      │
  ╰──────────────────────────────────────────╯
```

### Capture Knowledge

```
  you> /memory capture lesson "Always run gates before merging PRs" ci,quality,workflow

  ✓ Captured: mem-a1b2c3d4 (lesson)

  you> /lessons "Use parameterized queries for all database access"

  ✓ Captured: mem-e5f6g7h8 (lesson) tags: general
```

### Memory Entry Types

| Type | Purpose | Example |
|------|---------|---------|
| `lesson` | Best practices learned | "Always validate user input before DB writes" |
| `decision` | Architectural choices made | "Use JWT RS256 for authentication tokens" |
| `error` | Bugs and root causes | "TypeScript strict mode caught null reference" |
| `pattern` | Recurring code patterns | "React hooks must be called at top level" |

---

## 14. Configuration Reference

### config.toml

```toml
[provider]
name = "anthropic"                    # Active provider
model = "claude-sonnet-4-20250514"    # Active model

[budget]
monthly_limit_usd = 50.00            # Monthly cost cap
per_run_limit_usd = 2.00             # Per-conversation cap

[session]
max_tokens = 8192                     # Max tokens per response

[routing]
route_local_first = false             # Enable local-first cost routing
local_provider = "ollama"             # Local provider (ollama or lmstudio)
local_model = "llama3.1"             # Local model name
context_window = 0                    # 0 = auto-detect from model
```

### policy.toml

```toml
[permissions]
mode = "ask"                          # auto | ask | deny | trusted
allow_shell = true                    # Allow bash tool
allow_write = true                    # Allow file writes

[paths]
allow_paths = ["."]                   # Allowed working directories
```

### Edit Configuration from CLI

```
  you> /config provider.name openai
  ✓ Set provider.name = "openai"

  you> /config budget.monthly_limit_usd 100
  ✓ Set budget.monthly_limit_usd = 100
```

---

## 15. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `/exit` or `/quit` | Quit the CLI |
| `Tab` | Command completion (in `/` mode) |
| `Up/Down` | Navigate message history |
| `a/d/A/T` | Permission prompt responses |
| `a/r/e` | Approval checkpoint responses |

---

## Architecture Overview

```
sf_cli/src/
├── index.tsx              Entry point (Commander + Ink render)
├── app.tsx                Root React component
├── types.ts               All shared TypeScript types
│
├── core/
│   ├── config.ts          TOML config loader (.skillfoundry/config.toml)
│   ├── credentials.ts     Global credential store (~/.config/skillfoundry/)
│   ├── framework.ts       Framework root discovery (SF_FRAMEWORK_ROOT)
│   ├── banner.ts          ASCII art startup banner
│   ├── session.ts         State machine (.claude/state.json)
│   ├── provider.ts        Multi-provider factory + Anthropic adapter
│   ├── providers/
│   │   ├── openai.ts      OpenAI / xAI / Ollama / LM Studio adapter
│   │   └── gemini.ts      Google Gemini adapter
│   ├── compaction.ts      Context compaction for local models
│   ├── health-check.ts    Provider health checks + fallback
│   ├── task-classifier.ts Task complexity classifier + routing
│   ├── tools.ts           Tool definitions (bash, read, write, glob, grep)
│   ├── executor.ts        Tool executor (child_process, fs)
│   ├── permissions.ts     Permission engine (auto/ask/deny/trusted)
│   ├── gates.ts           Quality gate runner (The Anvil T1-T6)
│   ├── micro-gates.ts     Post-handoff AI micro-gates (MG1-MG3)
│   ├── budget.ts          Usage tracking + budget enforcement
│   ├── memory.ts          Knowledge recall + capture (JSONL)
│   ├── redact.ts          Secret redaction pipeline
│   └── finisher.ts        Post-pipeline housekeeping (version, docs, arch)
│
├── commands/
│   ├── index.ts           Command registry + slash parser
│   ├── help.ts            /help
│   ├── status.ts          /status
│   ├── plan.ts            /plan
│   ├── apply.ts           /apply, /gates
│   ├── forge.ts           /forge
│   ├── provider.ts        /provider
│   ├── config.ts          /config
│   ├── cost.ts            /cost
│   ├── memory.ts          /memory, /lessons
│   └── setup.ts           /setup + sf setup subcommand
│
├── hooks/
│   ├── useSession.ts      Session state management
│   └── useStream.ts       Streaming + agentic tool loop
│
├── components/
│   ├── Header.tsx         Provider, model, cost display
│   ├── MessageList.tsx    Scrollable message history
│   ├── Message.tsx        Single message (user/assistant/system)
│   ├── StreamingMessage.tsx  Live streaming with spinner
│   ├── Input.tsx          User input with slash detection
│   ├── StatusBar.tsx      Mode, state, shortcuts
│   ├── ToolCall.tsx       Tool execution display
│   ├── PermissionPrompt.tsx  Allow/Deny permission dialog
│   ├── DiffPreview.tsx    Colorized inline diff viewer
│   ├── GateTimeline.tsx   Quality gate status timeline
│   └── ApprovalPrompt.tsx Approve/Reject checkpoint
│
└── utils/
    ├── markdown.ts        Terminal markdown rendering
    ├── theme.ts           Chalk color tokens
    └── logger.ts          Timeline log writer
```

### Test Suite

380 tests across 27 test files covering:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| config.test.ts | Config loading, defaults, TOML parsing |
| redact.test.ts | Secret redaction patterns |
| commands.test.ts | Slash command parsing, registry |
| tools.test.ts | Tool definitions, classifications |
| executor.test.ts | Bash, read, write, glob, grep execution |
| permissions.test.ts | Permission modes, dangerous patterns |
| gates.test.ts | T1-T6 gates, callbacks, verdicts |
| micro-gates.test.ts | MG1-MG3 parsing, runners, fixer formatting |
| diff.test.ts | Diff parsing, additions, removals |
| forge.test.ts | Forge pipeline phases |
| provider.test.ts | Provider registry, factory, detection (6 providers) |
| budget.test.ts | Usage tracking, budget caps |
| memory.test.ts | Recall, capture, stats |
| framework.test.ts | Framework root discovery, version detection |
| credentials.test.ts | Credential storage, injection, setup command |
| compaction.test.ts | Token estimation, sliding window, summary injection, compression |
| health-check.test.ts | Ping, caching, fallback, local detection |
| task-classifier.test.ts | Classification, routing, provider selection |
| finisher.test.ts | Version sync, test counts, arch listing, changelog, git clean |

---

*SkillFoundry CLI v2.0.23 — March 2026*

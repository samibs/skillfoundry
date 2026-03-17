---
sidebar_position: 2
title: Getting Started
---

# Getting Started

This guide takes you from zero to your first pipeline run in under 10 minutes. By the end, you will have installed SkillFoundry, created a PRD, executed the Forge pipeline, and reviewed gate results.

## Prerequisites

Before you begin, ensure you have:

| Tool | Minimum Version | Check Command |
|------|----------------|---------------|
| Node.js | 20.0.0+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 2.30+ | `git --version` |

You also need one of:
- A Claude API key (`ANTHROPIC_API_KEY` environment variable)
- Claude Code CLI installed and authenticated

## Step 1: Install

**Time estimate: ~1 minute**

Choose one of three installation methods:

### Option A: npm (recommended)

```bash
npm install -g @skillfoundry/cli
```

### Option B: Homebrew (macOS/Linux)

```bash
brew tap skillfoundry/tap
brew install skillfoundry
```

### Option C: curl (Linux/macOS one-liner)

```bash
curl -fsSL https://skillfoundry.dev/install.sh | bash
```

Verify the installation:

```bash
sf --version
```

Expected output:

```
SkillFoundry CLI v2.0.52
```

The `sf` binary is the primary entry point for all CLI operations.

## Step 2: Initialize Your Project

**Time estimate: ~1 minute**

Navigate to your project directory (or create a new one) and run `init`:

```bash
mkdir my-project && cd my-project
git init
sf init
```

Expected output:

```
 SkillFoundry — Initializing project...

  Created  .skillfoundry/config.toml
  Created  genesis/
  Created  genesis/TEMPLATE.md
  Created  docs/stories/
  Created  memory_bank/knowledge/
  Created  CLAUDE.md

 Project initialized. Next step: create a PRD in genesis/
```

What happened: `sf init` scaffolded the SkillFoundry project structure. The key directories are:

- **`genesis/`** — Where PRDs (Product Requirements Documents) live. This is the starting point for all features.
- **`docs/stories/`** — Where generated stories are written during pipeline execution.
- **`memory_bank/knowledge/`** — JSONL knowledge bank for cross-session learning.
- **`.skillfoundry/config.toml`** — Project-level configuration (gates, thresholds, provider settings).
- **`CLAUDE.md`** — The governance contract that AI agents follow during execution.

## Step 3: Create Your First PRD

**Time estimate: ~2 minutes**

Every feature in SkillFoundry starts with a PRD. You have two options:

### Option A: Generate a PRD with the CLI

```bash
sf prd "user authentication with JWT"
```

Expected output:

```
 PRD created: genesis/2026-03-16-user-authentication-with-jwt.md

  Edit the PRD to refine requirements before running the pipeline.
```

### Option B: Write a PRD manually

Create a file in `genesis/` using the template:

```bash
cp genesis/TEMPLATE.md genesis/2026-03-16-my-feature.md
```

Edit it with your requirements. At minimum, a PRD needs:

- A concrete problem statement
- User stories with acceptance criteria
- Security requirements (even if "N/A" for non-sensitive features)
- Explicit out-of-scope items

A stripped-down example:

```markdown
# Simple REST API

## Problem Statement
The project needs a health-check endpoint that returns service status.

## User Stories

### US-1: Health Check Endpoint
**As a** DevOps engineer
**I want** a GET /health endpoint
**So that** monitoring tools can verify the service is running

**Acceptance Criteria:**
- GET /health returns HTTP 200 with JSON body `{"status": "ok"}`
- Response time is under 100ms
- No authentication required

## Security Requirements
- No sensitive data exposed in health response
- Rate limiting: 60 requests/minute

## Out of Scope
- Detailed dependency health checks
- Database connectivity verification
```

## Step 4: Run the Forge

**Time estimate: ~5 minutes (depends on feature complexity)**

With a PRD in `genesis/`, run the pipeline:

```bash
sf forge
```

This is equivalent to the `/forge` slash command in IDE integrations. The pipeline executes 8 phases:

```
 SkillFoundry Forge — Pipeline Starting

 IGNITE    Discovering PRDs in genesis/...
            Found 1 PRD: user-authentication-with-jwt.md
            Validating PRD quality gates... PASSED

 PLAN      Decomposing PRD into stories...
            Generated 3 stories → docs/stories/user-authentication/

 FORGE     Executing stories...
            [1/3] STORY-001-health-models ............ DONE (42s)
            [2/3] STORY-002-health-endpoint .......... DONE (38s)
            [3/3] STORY-003-health-tests ............. DONE (25s)

 POLISH    Running micro-gates on completed stories...
            MG0 (AC Validation)  PASS
            MG1 (Security)       PASS
            MG2 (Standards)      PASS
            MG1.5 (Test Docs)    PASS

 TEMPER    Running quality gates T0-T7...
            T0 Correctness Contract  PASS
            T1 Banned Patterns       PASS
            T2 Type Check            PASS
            T3 Tests                 PASS
            T4 Security (Semgrep)    PASS
            T5 Build Verification    PASS
            T6 Scope Validation      PASS
            T7 Deploy Pre-Flight     PASS

 INSPECT   Security deep-scan... PASS

 DEBRIEF   Generating run report...
            Report: .skillfoundry/runs/<run-id>/report.md

 FINISH    Harvesting knowledge...
            3 lessons captured to memory_bank/

 Pipeline completed in 2m 14s | Cost: $0.42 | Gates: 8/8 PASS
```

What happened at each phase:

| Phase | Purpose |
|-------|---------|
| **IGNITE** | Discovers and validates PRDs in `genesis/` |
| **PLAN** | Decomposes PRDs into self-contained stories |
| **FORGE** | Executes each story using AI agents with real tool access |
| **POLISH** | Runs micro-gates (lightweight AI reviews) on each story's output |
| **TEMPER** | Runs the 8-tier quality gate suite (T0-T7) |
| **INSPECT** | Optional security deep-scan (Semgrep OWASP rules) |
| **DEBRIEF** | Generates structured run reports (JSON + Markdown) |
| **FINISH** | Harvests lessons learned into the knowledge bank |

## Step 5: Check Gate Results

**Time estimate: ~30 seconds**

After the pipeline completes, review the results:

```bash
sf status
```

Expected output:

```
 SkillFoundry — Last Run Summary

  Run ID:     a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Duration:   2m 14s
  Cost:       $0.42
  Stories:    3/3 completed
  Gates:      7/7 PASS

  Gate Breakdown:
  ┌──────┬────────────────────────┬────────┐
  │ Tier │ Gate                   │ Result │
  ├──────┼────────────────────────┼────────┤
  │ T0   │ Correctness Contract   │ PASS   │
  │ T1   │ Banned Patterns        │ PASS   │
  │ T2   │ Type Check             │ PASS   │
  │ T3   │ Tests                  │ PASS   │
  │ T4   │ Security (Semgrep)     │ PASS   │
  │ T5   │ Build Verification     │ PASS   │
  │ T6   │ Scope Validation       │ PASS   │
  └──────┴────────────────────────┴────────┘
```

If any gate fails, the output includes specific findings with file paths and remediation guidance. The pipeline also writes a detailed report to `.skillfoundry/runs/<run-id>/report.md`.

### Handling Gate Failures

When a gate fails, the pipeline attempts automated remediation:

1. **Fixer agent** receives the gate findings and attempts a fix (up to 2 attempts)
2. **Gates re-run** after each fix attempt
3. If automated fixes fail, the pipeline halts with a **circuit breaker** and reports what needs manual attention

Common failure patterns and fixes:

| Gate | Common Failure | Fix |
|------|---------------|-----|
| T1 | Banned pattern detected (TODO, placeholder) | Remove or replace with real implementation |
| T2 | TypeScript type error | Fix type annotations |
| T3 | Missing test files | Add tests for new code |
| T4 | Security finding (hardcoded secret) | Move to environment variable |
| T5 | Build failure | Fix compilation errors |

## What's Next

You have a working SkillFoundry project with your first pipeline run complete. From here:

- **[Architecture](/architecture)** — Understand how the pipeline, agents, gates, and memory system work under the hood
- **[Configuration](/configuration)** — Customize gate thresholds, provider settings, and agent behavior
- **[Recipes](/recipes/nextjs)** — Framework-specific setup guides for Next.js, FastAPI, .NET, and more

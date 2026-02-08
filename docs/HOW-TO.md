# Claude AS - Comprehensive How-To Guide

> **Version 1.9.0.0** | Last Updated: 2026-02-07

This guide covers everything you need to know to use the Claude AS framework effectively.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Quick Start](#2-quick-start)
3. [Working with Existing Projects](#3-working-with-existing-projects) *(v1.3.1)*
4. [Creating PRDs](#4-creating-prds)
5. [The /go Command](#5-the-go-command)
6. [Story Dependencies](#6-story-dependencies)
7. [PRD Dependencies](#7-prd-dependencies)
8. [Recovery & Rollback](#8-recovery--rollback)
9. [Metrics & Analytics](#9-metrics--analytics)
10. [Context Management](#10-context-management)
11. [Testing & Verification](#11-testing--verification)
12. [TDD Enforcement](#12-tdd-enforcement) *(v1.3.1)*
13. [Parallel Execution](#13-parallel-execution) *(v1.3.1)*
14. [Git Worktree Isolation](#14-git-worktree-isolation) *(v1.3.1)*
15. [Systematic Debugging](#15-systematic-debugging) *(v1.3.1)*
16. [Updating Projects](#16-updating-projects)
17. [Troubleshooting](#17-troubleshooting)
18. [Best Practices](#18-best-practices)
19. [Command Reference](#19-command-reference)

---

## 1. Installation

### First-Time Setup

Keep `claude_as` in a central location. Never copy it into projects.

```bash
# Recommended structure
~/DevLab/
├── IDEA/
│   └── claude_as/         ← Framework lives here (permanently)
├── ProjectA/              ← Your projects
├── ProjectB/
└── ...
```

### Installing to a New Project

```bash
# Create your project
mkdir ~/DevLab/MyProject
cd ~/DevLab/MyProject

# Run the installer
~/DevLab/IDEA/claude_as/install.sh

# Or specify a path
~/DevLab/IDEA/claude_as/install.sh /path/to/project
```

### What Gets Installed

```
your-project/
├── .claude/
│   └── commands/           # 23 skill files
├── agents/                 # 13 agent personas + 11 shared modules
├── genesis/                # PRD folder
│   ├── TEMPLATE.md
│   └── .schema.json        # PRD validation schema
├── docs/
│   └── stories/            # Generated stories go here
├── CLAUDE.md               # Full standards reference
├── CLAUDE-SUMMARY.md       # Condensed for active context
└── CLAUDE.md               # Standards reference
```

---

## 2. Quick Start

### The Simplest Workflow

```bash
# 1. Start Claude Code in your project
cd ~/DevLab/MyProject
claude

# 2. Create a PRD
> /prd "User authentication with JWT"

# 3. Implement everything
> /go
```

That's it. The framework handles:
- PRD validation
- Story generation
- Implementation
- Testing
- Three-layer validation
- Security audits
- Documentation

### Checking Progress

```bash
> /go --status
```

### Viewing Metrics

```bash
> /metrics
```

---

## 3. Working with Existing Projects

Already have code? Here's how to integrate Claude AS into an existing project.

### Step 1: Install the Framework

```bash
cd /your/existing/project
bash /path/to/claude_as/install.sh
```

This adds the `.claude/commands/`, `agents/`, and `genesis/` folders without affecting your existing code.

### Step 2: Assess Your Codebase

Before creating PRDs, understand what you have:

```bash
# Get a codebase overview
> "Explore this codebase and give me an overview of the architecture"

# Or use the architect for formal assessment
> /architect "Assess this existing codebase and identify:
  - Current architecture patterns
  - Tech stack and dependencies
  - Code quality issues
  - Missing features or gaps
  - Security concerns"
```

### Step 3: Check Code Quality

Run quality checks to identify improvements:

```bash
# Check against BPSBS standards
> /standards

# Evaluate specific directories
> /evaluator "src/"

# Verify patterns and best practices
> /verify patterns

# Full codebase evaluation
> /evaluator "." --deep
```

### Step 4: From Assessment to PRDs

Based on your assessment, create targeted PRDs:

| Finding | PRD Type | Example |
|---------|----------|---------|
| Missing tests | Test coverage PRD | `genesis/add-test-coverage.md` |
| Security gaps | Security hardening PRD | `genesis/security-hardening.md` |
| Missing feature | Feature PRD | `genesis/feature-[name].md` |
| Code smells | Refactor PRD | `genesis/refactor-[area].md` |
| Performance issues | Optimization PRD | `genesis/performance-optimization.md` |
| Missing docs | Documentation PRD | `genesis/documentation.md` |

### Step 5: Implement with /go

```bash
# Implement all PRDs
> /go

# Or implement specific PRD
> /go genesis/security-hardening.md

# With TDD enforcement
> /go --tdd

# In isolated worktree (recommended for existing projects)
> /go --worktree
```

### Existing Project Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  EXISTING PROJECT WORKFLOW                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌───────────┐    ┌──────────────────────┐ │
│  │ INSTALL  │───▶│  ASSESS   │───▶│  QUALITY CHECK       │ │
│  │ Framework│    │ Codebase  │    │ /standards /evaluator│ │
│  └──────────┘    └───────────┘    └──────────────────────┘ │
│                        │                    │               │
│                        ▼                    ▼               │
│               ┌──────────────┐    ┌──────────────────────┐ │
│               │ Identify     │    │ Prioritize Issues    │ │
│               │ Gaps/Issues  │    │ Security > Bugs >    │ │
│               └──────────────┘    │ Features > Refactor  │ │
│                        │          └──────────────────────┘ │
│                        ▼                    │               │
│               ┌──────────────┐              │               │
│               │ CREATE PRDs  │◀─────────────┘               │
│               │ in genesis/  │                              │
│               └──────────────┘                              │
│                        │                                    │
│                        ▼                                    │
│               ┌──────────────┐                              │
│               │    /go       │                              │
│               │ Implement    │                              │
│               └──────────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Common Assessment Commands

| Command | Purpose |
|---------|---------|
| `/architect "Assess codebase"` | Full architectural review |
| `/standards` | Check BPSBS compliance |
| `/evaluator "path/"` | Deep code evaluation |
| `/debugger` | Find and fix existing issues |
| `/metrics` | View project metrics |
| `/verify patterns` | Scan for banned patterns |

### Priority Order for Fixes

When working with existing projects, address issues in this order:

1. **Security vulnerabilities** - Fix immediately
2. **Critical bugs** - Breaking functionality
3. **Test coverage** - Add tests for existing code
4. **Code quality** - Refactor problem areas
5. **New features** - Add after foundation is solid
6. **Documentation** - Document what exists

### Tips for Existing Projects

- **Use worktrees** (`--worktree`) - Keeps main branch safe
- **Start small** - Create focused PRDs, not mega-refactors
- **Preserve behavior** - Write tests before refactoring
- **Incremental improvement** - Don't try to fix everything at once

---

## 4. Creating PRDs

### Using the PRD Architect

The `/prd` skill creates structured PRDs through an interrogation process.

```bash
> /prd "Payment processing with Stripe"
```

The PRD Architect will ask about:
- Problem statement
- User stories
- Security requirements
- Data models
- Out of scope items

Result: `genesis/2026-01-20-payment-processing.md`

### Manual PRD Creation

Copy the template and fill it in:

```bash
cp genesis/TEMPLATE.md genesis/my-feature.md
```

### PRD Structure

```markdown
---
prd_id: my-feature
title: My Feature Name
status: DRAFT
created: 2026-01-20

dependencies:
  requires: []        # PRDs that must complete first
  recommends: []      # PRDs that should complete first
  blocks: []          # PRDs waiting for this one

tags: [feature, core]
priority: high
layers: [database, backend, frontend]
---

# My Feature Name

## 1. Overview
### 1.1 Problem Statement
[What problem does this solve?]

### 1.2 Success Metrics
| Metric | Target |
|--------|--------|
| Response time | < 200ms |

## 2. User Stories
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | user | login | access my account | MUST |

## 3. Security Requirements
- Authentication: JWT
- Authorization: RBAC

## 4. Out of Scope
- Social login
- Password recovery email
```

### PRD Validation

Check if your PRD is complete:

```bash
> /go --validate
```

This checks:
- Problem statement exists and is specific
- At least one MUST-priority user story
- Security requirements defined
- Out of scope section exists
- No TBD/TODO markers

---

## 5. The /go Command

### Basic Usage

```bash
# Implement all PRDs
> /go

# Implement specific PRD
> /go genesis/user-auth.md

# Validate only (don't implement)
> /go --validate

# Check status
> /go --status
```

### Advanced Flags

```bash
# Resume interrupted execution
> /go --resume

# Rollback all changes
> /go --rollback

# Rollback to before specific story
> /go --rollback STORY-003

# Skip a problematic story
> /go --skip STORY-005

# Start from specific story
> /go --from STORY-003

# Force context compaction
> /go --compact

# Show dependency graph
> /go --deps

# Show metrics
> /go --metrics

# Show raw state file
> /go --state

# Clear state and start fresh
> /go --clean
```

### Execution Phases

When you run `/go`, it executes these phases:

```
PHASE 0: Context Preparation
├── Check context budget
├── Load CLAUDE-SUMMARY.md
├── Initialize scratchpad
└── Check for interrupted execution

PHASE 1: PRD Discovery
├── Scan genesis/ folder
├── Find all .md files
└── Check PRD dependencies

PHASE 2: PRD Validation
├── Check required sections
├── Validate completeness
└── Stop if invalid (unless --validate)

PHASE 3: Story Generation
├── Break PRD into stories
├── Build dependency graph
├── Generate INDEX.md
└── Create story files

PHASE 4: Story Execution
├── Execute in dependency order
├── For each story:
│   ├── Architect → design
│   ├── Coder → implement
│   ├── Tester → test
│   └── Gate-Keeper → validate
├── Context compaction every 5 stories
└── Update state file after each

PHASE 5: Layer Validation
├── Check database layer
├── Check backend layer
├── Check frontend layer
└── All must pass

PHASE 6: Security Audit
├── Scan for banned patterns
├── Check token handling
├── Verify .gitignore
└── Validate LoggerService

PHASE 7: Documentation
├── Generate API docs
├── Update README
└── Create audit log

PHASE 8: Completion
├── Generate summary report
├── Update metrics
└── Clean up state
```

---

## 6. Story Dependencies

### How Stories Declare Dependencies

Each story has metadata:

```markdown
---
story_id: STORY-003
title: User API Endpoints
depends_on: [STORY-001, STORY-002]
blocks: [STORY-005, STORY-006]
complexity: medium
layers: [backend]
---
```

### Dependency Types

| Type | Meaning |
|------|---------|
| `depends_on` | Must complete before this story starts |
| `blocks` | Stories that wait for this one |
| `parallel_group` | Stories that can run together |

### The INDEX.md File

When stories are generated, an INDEX.md is created:

```
docs/stories/user-auth/
├── INDEX.md              # Dependency graph and status
├── STORY-001-db-schema.md
├── STORY-002-auth-api.md
├── STORY-003-user-api.md
└── ...
```

INDEX.md contains:
- Mermaid dependency graph
- Execution wave plan
- Critical path analysis
- Story status table

### Viewing the Dependency Graph

```bash
> /go --deps
```

Output:
```
DEPENDENCY GRAPH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

       STORY-001 (DB Schema)
              │
    ┌─────────┴─────────┐
    ▼                   ▼
STORY-002           STORY-003
(Auth API)          (User API)
    │                   │
    └─────────┬─────────┘
              ▼
         STORY-004
         (Frontend)

EXECUTION WAVES:
Wave 1: STORY-001
Wave 2: STORY-002, STORY-003 (parallel)
Wave 3: STORY-004

CRITICAL PATH: STORY-001 → STORY-002 → STORY-004
```

---

## 7. PRD Dependencies

### Declaring PRD Dependencies

In your PRD's metadata:

```yaml
dependencies:
  requires: [database-schema]     # Must complete first
  recommends: [user-core]         # Should complete first
  blocks: [admin-panel]           # Waiting for this
  shared_with: [user-settings]    # Shares components
```

### Multi-PRD Execution

When you have multiple PRDs:

```bash
> /go

MULTI-PRD PROJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found 3 PRDs. Analyzing dependencies...

EXECUTION ORDER:
1. database-schema (foundation, no deps)
2. user-auth (depends on database-schema)
3. admin-panel (depends on user-auth)

Proceed? (Y/n)
```

### Blocked PRD Warning

```bash
> /go genesis/admin-panel.md

PRD DEPENDENCY CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ BLOCKED: Cannot start admin-panel

Dependencies not met:
├── user-auth: IN_PROGRESS (60%)
└── Expected completion: pending

Options:
1. Wait for dependencies
2. Override with --ignore-deps (not recommended)
```

### Impact Analysis

See what depends on a PRD:

```bash
> /prd impact user-auth

IMPACT ANALYSIS: user-auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIRECTLY BLOCKED:
├── admin-panel (5 stories)
├── user-settings (3 stories)

TRANSITIVELY AFFECTED:
├── admin-panel → reporting (2 stories)
└── admin-panel → analytics (4 stories)

TOTAL IMPACT: 5 PRDs, 14 stories
```

---

## 8. Recovery & Rollback

### Automatic State Persistence

Execution state is saved to `.claude/state.json` after every action.

### Detecting Interrupted Execution

When you run `/go` after a crash:

```
🔄 INTERRUPTED EXECUTION DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Previous execution was interrupted at:
├── State: EXECUTING_STORY
├── Story: STORY-004 (Frontend Auth)
├── Progress: 3/6 stories complete
└── Last Update: 2026-01-20 14:35:00

OPTIONS:
1. Resume from STORY-004 (recommended)
2. Restart from beginning
3. Rollback all changes
4. View current state

Select option (1-4):
```

### Resuming Execution

```bash
> /go --resume

RESUMING EXECUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Loading state from: .claude/state.json
Verifying file integrity...
Restoring context...

Resuming from STORY-004...
```

### Rolling Back Changes

#### Full Rollback

```bash
> /go --rollback

ROLLBACK PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Changes to revert:
├── Files to DELETE: 5
├── Files to RESTORE: 2
├── Migrations to ROLLBACK: 1
└── Packages to REMOVE: 2

Backups available in: .claude/backups/20260120_143000/

Proceed with rollback? (y/n)
```

#### Partial Rollback

```bash
> /go --rollback STORY-003

PARTIAL ROLLBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rolling back to before STORY-003...

WILL ROLLBACK:
├── STORY-004: Frontend Auth
├── STORY-003: User API

WILL KEEP:
├── STORY-001: DB Schema
├── STORY-002: Auth API

Proceed? (y/n)
```

### Viewing State

```bash
> /go --state

{
  "current_state": "EXECUTING_STORY",
  "prd": {
    "file": "genesis/user-auth.md",
    "name": "User Authentication"
  },
  "stories": {
    "total": 6,
    "completed": 3,
    "current": "STORY-004"
  },
  "changes": {
    "files_created": ["src/auth/login.ts", "..."],
    "files_modified": ["src/index.ts"]
  }
}
```

### Clearing State

Start completely fresh:

```bash
> /go --clean

This will clear all execution state.
Any progress will be lost.

Proceed? (y/n)
```

---

## 9. Metrics & Analytics

### Viewing the Dashboard

```bash
> /metrics

METRICS DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT: my-project
PERIOD: All time

QUICK STATS
┌────────────────────────────────────────────────────┐
│ Executions: 45 │ Success: 94% │ Stories: 280 │
└────────────────────────────────────────────────────┘

AGENT PERFORMANCE
┌──────────────────┬──────────┬──────────┐
│ Agent            │ Calls    │ Success  │
├──────────────────┼──────────┼──────────┤
│ ruthless-coder   │ 150      │ 94%      │
│ ruthless-tester  │ 120      │ 90%      │
│ gate-keeper      │ 200      │ 94%      │
└──────────────────┴──────────┴──────────┘
```

### Detailed Views

```bash
# Agent performance breakdown
> /metrics agents

# Story completion analysis
> /metrics stories

# Error analysis
> /metrics errors

# Trend analysis
> /metrics trends
```

### Exporting Metrics

```bash
# JSON export
> /metrics export json
# → .claude/metrics/export_20260120.json

# CSV export
> /metrics export csv
# → .claude/metrics/export_20260120/

# Markdown report
> /metrics export md
# → .claude/metrics/report_20260120.md
```

### What's Tracked

| Category | Metrics |
|----------|---------|
| Execution | Total, success rate, duration |
| Stories | By complexity, by layer, completion rate |
| Agents | Invocations, success rate, token usage |
| Errors | By type, by agent, recovery rate |
| Context | Budget usage, compactions |

---

## 10. Context Management

### The Problem

Large AI contexts become counterproductive:
- Information in the middle gets ignored
- Too much context wastes tokens
- Critical rules get buried

### The Solution: Hierarchical Loading

```
LEVEL 1 (Always loaded, ~5K tokens)
├── CLAUDE-SUMMARY.md
├── Current PRD summary
└── Current story

LEVEL 2 (Loaded when needed, ~20K tokens)
├── Source files being modified
├── Related test files
└── Dependency files

LEVEL 3 (Reference only, ~80K tokens)
├── Full CLAUDE.md
├── Historical logs
└── Completed story details
```

### Context Commands

```bash
# Check current status
> /context

CONTEXT STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Budget Used: 45K tokens
Status: YELLOW (approaching 50K threshold)

Loaded:
├── CLAUDE-SUMMARY.md: 2K
├── Current story: 3K
├── Source files: 35K
└── Scratchpad: 5K

# Force compaction
> /context compact

# View scratchpad
> /context scratchpad

# Load specific level
> /context load level2
```

### Budget Thresholds

| Zone | Range | Action |
|------|-------|--------|
| GREEN | 0-50K | Normal operation |
| YELLOW | 50-100K | Consider compaction |
| RED | >100K | Automatic compaction |

### Automatic Compaction

Compaction is triggered:
- At 100K tokens
- Every 5 completed stories
- When switching PRDs
- On `/go --compact`

---

## 11. Testing & Verification

### Test Execution

The framework auto-detects test frameworks:

| Framework | Detection | Command |
|-----------|-----------|---------|
| Jest | package.json | `npm test` |
| Vitest | vitest.config.ts | `npm test` |
| pytest | pytest.ini | `pytest` |
| .NET | *.csproj | `dotnet test` |
| Rust | Cargo.toml | `cargo test` |
| Go | go.mod | `go test ./...` |

### Gate Verification

Automated capability checks:

```bash
# Run all tests
> /verify tests

# Check build
> /verify build

# Check coverage (with threshold)
> /verify coverage --threshold 80

# Run linter
> /verify lint

# Security scan
> /verify security

# API health check
> /verify api

# Database migration test
> /verify migration

# Documentation check
> /verify docs

# Banned pattern scan
> /verify patterns

# All checks (production readiness)
> /verify production
```

### Verification Output

```
✅ GATE VERIFIED: tests_pass

Evidence collected:
├── Framework: jest
├── Total tests: 150
├── Passed: 150 (100%)
├── Coverage: 87.5%
└── Duration: 12.5s

Gate opened.
```

---

## 12. TDD Enforcement

**New in v1.3.1** - All implementation now follows Test-Driven Development.

### The TDD Cycle

```
┌─────────┐      ┌─────────┐      ┌──────────┐
│   RED   │ ───► │  GREEN  │ ───► │ REFACTOR │ ───┐
└─────────┘      └─────────┘      └──────────┘    │
     ▲                                             │
     └─────────────────────────────────────────────┘
```

| Phase | Action |
|-------|--------|
| **RED** | Write a failing test FIRST |
| **GREEN** | Write MINIMAL code to pass |
| **REFACTOR** | Improve code, tests stay green |

### How It Works

When `/coder` is invoked (directly or through `/go`):

1. **Test First Required**: Implementation is BLOCKED until a failing test exists
2. **Minimal Implementation**: Only enough code to pass the test
3. **Refactor Optional**: Improve quality while tests stay green

### Enforcement Levels

```bash
# STRICT mode (default) - blocks implementation without tests
> /go --tdd

# WARN mode - logs violations but continues
> /go --tdd=WARN

# OFF mode - tracking only
> /go --tdd=OFF
```

### TDD in Practice

```bash
# Example workflow with TDD
> /go genesis/user-auth.md --tdd

# For each story:
#   1. /coder writes failing test
#   2. /coder runs test (confirms failure)
#   3. /coder writes minimal implementation
#   4. /coder runs test (confirms pass)
#   5. /coder refactors if needed
```

### TDD State Tracking

The framework tracks TDD metrics in `.claude/tdd-state.json`:

```json
{
  "metrics": {
    "total_cycles": 45,
    "tests_written_first": 43,
    "tests_written_after": 2,
    "test_first_rate": 0.96
  }
}
```

### TDD Anti-Patterns (Blocked)

| Pattern | Description |
|---------|-------------|
| Test-After | Writing implementation before test |
| Too Much Green | Adding code not covered by tests |
| Testing Implementation | Testing private methods instead of behavior |

---

## 13. Parallel Execution

**New in v1.3.1** - Independent stories can run simultaneously for 2-5x speedup.

### How It Works

```
                      ┌─────────────┐
                      │ ORCHESTRATOR │
                      └──────┬──────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ STORY-1  │   │ STORY-2  │   │ STORY-3  │
       └──────────┘   └──────────┘   └──────────┘
```

### Enabling Parallel Execution

```bash
# Enable wave-based parallel execution
> /go --parallel

# Use eager mode (start tasks as dependencies complete)
> /go --parallel=EAGER

# Limit concurrent agents
> /go --parallel=2

# Force sequential (disable parallel)
> /go --no-parallel
```

### Execution Modes

| Mode | Description |
|------|-------------|
| **WAVE** | Execute independent story groups together, then proceed |
| **EAGER** | Start each story as soon as its dependencies complete |
| **CONSERVATIVE** | Maximum 2 concurrent stories |

### Wave Execution Example

```
Wave 1: [STORY-001, STORY-002, STORY-003]  ─── run in parallel
         │
         ▼ (wait for all to complete)
Wave 2: [STORY-004, STORY-005]              ─── run in parallel
         │
         ▼ (wait for all to complete)
Wave 3: [STORY-006]                         ─── depends on 004, 005
```

### When to Use Parallel

**Good candidates:**
- Stories that touch different files
- Independent feature implementations
- Database models with no relations

**Avoid parallel when:**
- Stories modify the same files
- Sequential database migrations
- Strong dependency chains

### Speedup Calculation

```
Sequential: 60s + 90s + 45s = 195s total

Parallel (Wave):
  Wave 1: max(60s, 90s, 45s) = 90s
  Total: 90s

Speedup: 195s / 90s = 2.17x faster
```

### Conflict Detection

The framework detects potential conflicts:

```
⚠️ CONFLICT DETECTED
File: src/models/index.ts
Stories: STORY-001, STORY-003
Resolution: Running sequentially
```

---

## 14. Git Worktree Isolation

**New in v1.3.1** - Execute PRDs in isolated git worktrees for safe development.

### What Are Worktrees?

Git worktrees allow multiple working directories from a single repository:

```
project/                    ← Main worktree (main branch)
project-prd-auth/           ← PRD worktree (feature branch)
project-prd-payments/       ← Another PRD worktree
```

All worktrees share the same git history but have separate working directories.

### Benefits

| Benefit | Description |
|---------|-------------|
| **Isolation** | Break things without affecting main |
| **Easy rollback** | Delete the folder to undo everything |
| **Parallel PRDs** | Work on multiple features simultaneously |
| **Clean main** | Main branch only gets tested code |

### Using Worktrees

```bash
# Execute PRD in isolated worktree
> /go genesis/user-auth.md --worktree

# What happens:
# 1. Creates ../project-prd-user-auth/ directory
# 2. Creates branch prd/user-auth
# 3. Installs dependencies
# 4. Executes all stories in worktree
# 5. After validation passes:
#    - Merges to main
#    - Removes worktree
```

### Manual Worktree Commands

```bash
# Create worktree manually
git worktree add ../project-feature -b feature/my-feature

# List all worktrees
git worktree list

# Remove worktree
git worktree remove ../project-feature

# Cleanup stale references
git worktree prune
```

### Worktree Workflow

```
1. CREATE    → /go --worktree creates isolated environment
2. DEVELOP   → All stories execute in worktree
3. VALIDATE  → Three-layer + security checks
4. MERGE     → Merge to main after all pass
5. CLEANUP   → Remove worktree
```

### Rollback with Worktrees

If something goes wrong:

```bash
# Simply delete the worktree - main branch unaffected!
git worktree remove --force ../project-prd-auth

# Or abort through /go
> /go --rollback  # Works with worktrees too
```

### Works with Any Git Remote

Worktrees are a git feature, not GitHub-specific:
- Azure DevOps
- GitLab
- Bitbucket
- Self-hosted
- Local repos (no remote)

---

## 15. Systematic Debugging

**New in v1.3.1** - Four-phase debugging protocol for root cause analysis.

### The Four Phases

```
┌───────────┐    ┌─────────────┐    ┌────────┐    ┌────────┐
│  OBSERVE  │ ─► │ HYPOTHESIZE │ ─► │  TEST  │ ─► │ VERIFY │
└───────────┘    └─────────────┘    └────────┘    └────────┘
```

### Phase 1: OBSERVE

Gather facts without assumptions:

```markdown
Observation Checklist:
- [ ] Exact error message captured
- [ ] Full stack trace collected
- [ ] Steps to reproduce documented
- [ ] Working vs non-working cases compared
- [ ] Recent changes reviewed (git log)
```

### Phase 2: HYPOTHESIZE

Form testable explanations:

```
Hypothesis: getProfile() returns undefined when user has no profile
Based on: Error occurs only for users without profile record
Predicts: User with profile will not trigger error
Test: Call getProfile with user that has profile
Confidence: HIGH
```

### Phase 3: TEST

Validate or invalidate the hypothesis:

- Create minimal test case
- Execute and record results
- If wrong, return to Phase 2
- If right, trace to ROOT CAUSE

### Five Whys Technique

```
1. Why did the error occur?
   → getProfile() returned undefined

2. Why did getProfile() return undefined?
   → User has no profile record

3. Why does user have no profile?
   → Created via SSO without profile initialization

4. Why doesn't SSO create profile?
   → Original implementation only creates auth record

5. ROOT CAUSE: SSO registration flow incomplete
```

### Phase 4: VERIFY

Confirm the fix works:

```markdown
Verification Checklist:
- [ ] Fix addresses ROOT CAUSE (not symptom)
- [ ] Original reproduction case now passes
- [ ] Regression tests added
- [ ] Existing test suite passes
- [ ] Defensive measures added
```

### Using /debugger

```bash
# Start debug session
> /debugger "Cannot read 'id' of undefined in UserService"

# The debugger now follows four phases:
# 1. Gathers observations
# 2. Forms hypotheses
# 3. Tests each hypothesis
# 4. Verifies the fix

# Manual phase control
> /debug observe
> /debug hypothesize
> /debug test
> /debug verify
```

### Debug Session Output

```
DEBUGGING SESSION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1 - Observation:
Error: TypeError in UserService.getProfile
Repro: Login as SSO user, navigate to /dashboard

Phase 2 - Hypothesis:
H1: getProfile returns undefined for users without profile ✓ CONFIRMED

Phase 3 - Root Cause (Five Whys):
1. → getProfile returns undefined
2. → No profile record exists
3. → User created via SSO
4. → SSO only creates auth record
5. → ROOT CAUSE: SSO missing profile creation

Phase 4 - Verification:
Fix applied: Added profile creation to SSO flow
Regression test: test_sso_creates_profile
Guard added: Null check in getProfile callers
```

---

## 16. Updating Projects

### Check for Updates

```bash
~/DevLab/IDEA/claude_as/update.sh --list

Registered Projects:
  1. /home/user/ProjectA [v1.2.0 → v1.3.0]
  2. /home/user/ProjectB [UP TO DATE]
```

### Update Single Project

```bash
# Preview changes first
~/DevLab/IDEA/claude_as/update.sh --diff /path/to/project

# Apply update
~/DevLab/IDEA/claude_as/update.sh /path/to/project
```

### Update All Projects

```bash
~/DevLab/IDEA/claude_as/update.sh --all
```

### What Gets Updated

| Component | Behavior |
|-----------|----------|
| Skills | Auto-added/updated |
| Agents | Auto-added/updated |
| CLAUDE.md | Prompts (overwrite/keep/merge) |
| CLAUDE-SUMMARY.md | Auto-updated |
| genesis/TEMPLATE.md | Auto-updated |
| genesis/.schema.json | Auto-added |

### Managing Registry

```bash
# Register a project
~/DevLab/IDEA/claude_as/update.sh --register /path/to/project

# Unregister
~/DevLab/IDEA/claude_as/update.sh --unregister /path/to/project

# Scan for projects
~/DevLab/IDEA/claude_as/update.sh --scan ~/DevLab
```

### Validate CLAUDE.md Sync

```bash
~/DevLab/IDEA/claude_as/update.sh --sync /path/to/project
```

---

## 17. Troubleshooting

### `/go` command not found

**Cause:** Framework not installed properly.

**Fix:**
```bash
cd ~/DevLab/YourProject
~/DevLab/IDEA/claude_as/install.sh
```

### "PRD not found" error

**Cause:** PRDs not in genesis/ folder.

**Fix:**
```bash
ls genesis/
# Should show your .md files

# If empty, create a PRD:
> /prd "your feature"
```

### Execution stuck or crashed

**Recovery:**
```bash
# Resume from where you left off
> /go --resume

# Or rollback and start fresh
> /go --rollback
> /go
```

### Context too large

**Fix:**
```bash
# Force compaction
> /context compact

# Or start with compaction
> /go --compact
```

### Story blocked by dependencies

**Check:**
```bash
> /go --deps
```

**Fix:** Complete blocking stories first, or remove dependency if optional.

### Tests failing during execution

**Debug:**
```bash
# Run tests manually
> /verify tests

# Check specific test output
npm test -- --verbose
```

### Rollback failed

**Cause:** Backup files deleted or corrupted.

**Fix:**
```bash
# Check backup folder
ls .claude/backups/

# Manual recovery - restore from git
git status
git checkout -- path/to/file
```

---

## 18. Best Practices

### PRD Quality

1. **Be specific** - Vague PRDs lead to vague implementations
2. **Define security early** - Security requirements are mandatory
3. **List out of scope** - Prevents scope creep
4. **Use MUST/SHOULD/COULD** - Prioritize user stories
5. **Include acceptance criteria** - Clear definition of done

### Execution Hygiene

1. **Validate first** - `> /go --validate` before implementing
2. **Small PRDs** - Break large features into multiple PRDs
3. **Check status regularly** - `> /go --status`
4. **Monitor metrics** - `> /metrics` to spot issues early

### Recovery Practices

1. **Don't panic on crashes** - State is preserved
2. **Resume when possible** - `> /go --resume` is safe
3. **Rollback when stuck** - Better to restart clean
4. **Commit after success** - Don't lose working code

### Context Management

1. **Use CLAUDE-SUMMARY.md** - Not full CLAUDE.md in active context
2. **Compact proactively** - Don't wait for RED zone
3. **Review scratchpad** - Track what's been decided

---

## 19. Command Reference

### Primary Commands

| Command | Purpose |
|---------|---------|
| `/go` | Main entry point - PRD to implementation |
| `/prd "idea"` | Create new PRD |
| `/metrics` | View execution metrics |
| `/context` | Manage context budget |

### /go Flags

| Flag | Purpose |
|------|---------|
| `--validate` | Only validate PRDs |
| `--status` | Show current progress |
| `--resume` | Resume interrupted execution |
| `--rollback` | Undo all changes |
| `--rollback STORY-X` | Rollback to before story |
| `--skip STORY-X` | Skip specific story |
| `--from STORY-X` | Start from story |
| `--compact` | Force context compaction |
| `--deps` | Show dependency graph |
| `--metrics` | Show metrics |
| `--state` | Show raw state |
| `--clean` | Clear state file |
| `--parallel` | Enable parallel execution (v1.3.1) |
| `--parallel=EAGER` | Eager parallel mode (v1.3.1) |
| `--parallel=2` | Limit concurrent (v1.3.1) |
| `--no-parallel` | Force sequential (v1.3.1) |
| `--worktree` | Execute in git worktree (v1.3.1) |
| `--no-worktree` | Force inline execution (v1.3.1) |
| `--tdd` | Enforce TDD mode (v1.3.1) |
| `--tdd=WARN` | TDD warning mode (v1.3.1) |

### /metrics Subcommands

| Subcommand | Purpose |
|------------|---------|
| (none) | Dashboard view |
| `agents` | Agent performance |
| `stories` | Story analysis |
| `errors` | Error patterns |
| `trends` | Historical trends |
| `export [format]` | Export data |
| `reset` | Clear metrics |

### /context Subcommands

| Subcommand | Purpose |
|------------|---------|
| (none) | Status and budget |
| `compact` | Force compaction |
| `budget` | Detailed breakdown |
| `scratchpad` | View/update notes |
| `load <level>` | Load specific level |
| `clear` | Clear non-essential |

### /verify Commands

| Command | Purpose |
|---------|---------|
| `/verify tests` | Run tests |
| `/verify build` | Check build |
| `/verify coverage` | Check coverage |
| `/verify lint` | Run linter |
| `/verify security` | Security scan |
| `/verify api` | API health |
| `/verify migration` | Test migrations |
| `/verify docs` | Check documentation |
| `/verify patterns` | Banned pattern scan |
| `/verify production` | All checks |

### Agent Skills

| Skill | Purpose |
|-------|---------|
| `/architect` | Architecture review |
| `/coder` | Implementation |
| `/tester` | Testing |
| `/evaluator` | BPSBS compliance |
| `/debugger` | Root cause analysis |
| `/docs` | Documentation |
| `/standards` | Standards check |
| `/gate-keeper` | Capability gates |
| `/delegate` | Multi-agent orchestration |
| `/memory` | Context preservation |
| `/learn` | AI-assisted learning |

### Shell Commands

```bash
# Install to project
~/path/to/claude_as/install.sh [project-path]

# Update project
~/path/to/claude_as/update.sh [project-path]
~/path/to/claude_as/update.sh --all
~/path/to/claude_as/update.sh --diff [path]
~/path/to/claude_as/update.sh --sync [path]

# Manage registry
~/path/to/claude_as/update.sh --list
~/path/to/claude_as/update.sh --register [path]
~/path/to/claude_as/update.sh --scan [path]
```

---

## Framework Evolution Features (v1.8.0 - v1.9.0)

### Knowledge Exchange (v1.8.0.0)

Harvest and share knowledge across projects:

```bash
# Extract knowledge from current project
scripts/harvest.sh extract

# Sync universal knowledge to project
scripts/harvest.sh sync

# Register project in global registry
scripts/registry.sh register /path/to/project
```

### Swarm Mode (v1.8.0.1)

Self-organizing agent coordination as an alternative to wave dispatch:

```bash
# Check swarm status
/swarm status

# Initialize swarm queue for a project
parallel/swarm-queue.sh init

# View task queue
parallel/swarm-queue.sh list

# Check inter-agent notes
parallel/swarm-scratchpad.sh list

# Check for file conflicts
parallel/conflict-detector.sh status
```

### Developer Experience Commands (v1.8.0.2)

```bash
/explain                  # What did the last agent action do?
/undo                     # Revert last reversible action (with confirmation)
/cost                     # Token usage report (by agent, story, or phase)
/health                   # Framework self-diagnostic

# Live dashboard (terminal UI)
scripts/dashboard.sh              # Auto-refresh every 2 seconds
scripts/dashboard.sh --once       # Single render
```

### Advanced Intelligence (v1.9.0.0)

```bash
# Semantic search over knowledge base
scripts/semantic-search.sh "how did we handle auth?"
scripts/semantic-search.sh "error handling" --type=error --limit=5

# Monorepo support
scripts/monorepo.sh detect              # Find packages
scripts/monorepo.sh deps                # Show dependencies
scripts/monorepo.sh order               # Build order
scripts/monorepo.sh status              # Overview

# Compliance presets
/go --compliance=hipaa       # Enable HIPAA rules
/go --compliance=soc2        # Enable SOC2 rules
/go --compliance=gdpr        # Enable GDPR rules
```

Compliance presets are additive - they add gate-keeper rules without weakening existing checks.

---

## Need Help?

1. Check this guide
2. Run `/help` in Claude Code
3. Check [CHANGELOG.md](../CHANGELOG.md) for recent changes
4. Review [CLAUDE.md](../CLAUDE.md) for full standards

---

*Created by SBS with Claude Code*
*Framework Version: 1.9.0.0*

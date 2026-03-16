# STORY-004: Getting Started Guide + Architecture Deep-Dive

**Phase:** B — Documentation Site
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-003 (Docusaurus site must be set up)
**Affects:** FR-006, FR-007, US-003

---

## Description

Write two core documentation pages: a Getting Started guide that takes a developer from zero to first pipeline run in under 10 minutes, and an Architecture deep-dive that explains how SkillFoundry's components work together.

---

## Scope

### Files to create:
- `site-docusaurus/docs/getting-started.md`
- `site-docusaurus/docs/architecture.md`

### Files to modify:
- `site-docusaurus/sidebars.ts` — add entries for both pages

---

## Technical Approach

### Getting Started Guide Structure

The guide follows four concrete steps. Each step ends with a verifiable checkpoint so the user knows they succeeded.

```
# Getting Started

## Prerequisites
- Node.js 20+
- An AI coding tool (Claude Code, Copilot, Cursor, Codex, or Gemini)
- A project to integrate with (or create a fresh one)

## Step 1: Install SkillFoundry (2 min)
- npm: `npm install -g skillfoundry`
- Alternative: Homebrew, curl one-liner
- Verify: `skillfoundry --version` prints version
- Checkpoint: "You should see v2.x.x"

## Step 2: Initialize Your Project (2 min)
- Run: `skillfoundry install --platform=claude .`
- What it creates: agents/, scripts/, CLAUDE.md, .skillfoundry/
- Verify: `ls agents/` shows skill files
- Checkpoint: "You should see 10+ files created"

## Step 3: Write Your First PRD (3 min)
- Run: `/prd "add a health check endpoint"`
- Or manually create: `genesis/health-check.md`
- Explain the PRD template briefly
- Checkpoint: "genesis/ contains your PRD file"

## Step 4: Run the Forge Pipeline (3 min)
- Run: `/go`
- Explain what happens: PRD validation -> story generation -> implementation -> gate checks
- Show expected output (abbreviated)
- Checkpoint: "All gates pass. Your feature is implemented."

## Next Steps
- Read the Architecture deep-dive
- Browse Recipes for your stack
- Run `sf metrics` to see quality trends
```

### Architecture Deep-Dive Structure

```
# Architecture

## Overview
- Diagram: PRD -> Stories -> Forge -> Gates -> Production Code
- SkillFoundry is a governance layer, not a code generator

## Components

### Agents
- What they are: instruction files that constrain AI behavior
- Where they live: agents/
- How they're loaded: injected into AI tool context

### Genesis & PRDs
- genesis/ folder as the starting point
- PRD template and quality gates
- How PRDs prevent "vibe coding"

### Forge Pipeline
- 6-phase execution: Validate -> Decompose -> Implement -> Test -> Gate -> Deliver
- Circuit breaker: stops after repeated failures
- Anvil gates T1-T6

### Quality Gates
- What gates check: lint, types, tests, security, dependencies
- Gate execution flow
- How to add custom gates

### Telemetry Engine
- Local-first JSONL storage
- Event types: forge_run, gate_execution, security_scan, benchmark_run
- Rotation and archival
- Metrics and reports

### Memory Bank
- knowledge/ directory
- How decisions and errors are persisted
- Session lifecycle

## Data Flow Diagram
- Mermaid diagram showing: User Input -> Intent Classification -> Pipeline Selection -> Execution -> Gate Validation -> Output + Telemetry

## Platform Support
- Table: Claude Code, Copilot, Cursor, Codex, Gemini
- What files each platform uses
- How install.sh maps to each platform
```

### Key decisions:

1. **10-minute hard constraint**: Each step has a time budget. If a step takes longer than its budget, the guide needs rewriting.
2. **Checkpoints**: Every step ends with a concrete verification. No "you should be good" — it is "you should see X."
3. **Architecture uses Mermaid**: Docusaurus renders Mermaid diagrams natively. No external image dependencies.
4. **No assumed knowledge**: The guide does not assume familiarity with PRDs, gates, or forge. Each concept is introduced when first used.

---

## Acceptance Criteria

```gherkin
Scenario: Getting Started guide completes in under 10 minutes
  Given a developer with Node.js 20+ and an empty project directory
  When they follow the Getting Started guide step by step
  Then they complete all 4 steps in under 10 minutes
  And each checkpoint passes

Scenario: Getting Started guide is self-contained
  Given a developer reads only the Getting Started page
  When they follow the instructions
  Then they do not need to visit any other page to complete the steps
  And every command is copy-pasteable

Scenario: Architecture page explains all major components
  Given a developer reads the Architecture deep-dive
  When they finish
  Then they can identify: agents, genesis, forge, gates, telemetry, and memory
  And they understand the data flow from PRD to production code

Scenario: Architecture diagrams render
  Given the Architecture page contains Mermaid diagrams
  When the page is viewed in the Docusaurus site
  Then all diagrams render as SVG (not raw Mermaid text)

Scenario: Sidebar shows both pages
  Given a user navigates to the Docusaurus site
  When they open the docs sidebar
  Then "Getting Started" appears as the first item
  And "Architecture" appears as the second item
```

---

## Security Checklist

- [ ] No real tokens, secrets, or API keys in guide examples
- [ ] Example commands do not require sudo or root
- [ ] No third-party URLs that could be hijacked

---

## Testing

- Have someone unfamiliar with SkillFoundry follow the Getting Started guide end-to-end
- Time the entire flow — must complete under 10 minutes
- Verify all Mermaid diagrams render in Docusaurus build
- Verify all internal links resolve (Docusaurus `onBrokenLinks: throw` catches this)

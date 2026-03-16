---
slug: /
sidebar_position: 1
title: Introduction
---

# SkillFoundry

**AI engineering framework — quality gates your AI can't skip.**

SkillFoundry is a CLI-first framework that brings production-grade quality gates, structured pipelines, and three-layer validation to AI-assisted development. It ensures that every feature your AI agent builds is real, tested, and complete across database, backend, and frontend layers.

## Quick Install

```bash
npm install -g skillfoundry && skillfoundry init
```

This installs the `skillfoundry` CLI globally and initializes a new project with the default configuration.

## What You'll Learn

| Section | Description |
|---------|-------------|
| [Getting Started](/getting-started) | Prerequisites, installation, and your first pipeline run |
| [Architecture](/architecture) | How SkillFoundry orchestrates skills, agents, and pipelines |
| [Configuration](/configuration) | Customizing gates, thresholds, and project settings |
| [Recipes](/recipes/nextjs) | Framework-specific guides for Next.js, monorepos, and Azure DevOps |

## Feature Highlights

- **Genesis-First Workflow** — Every feature starts with a PRD in `genesis/`, eliminating "vibe coding" before it begins.
- **Three-Layer Validation** — Database, backend, and frontend are verified independently before any feature is marked complete.
- **Zero Tolerance Policy** — No TODOs, no mocks, no stubs, no placeholders in production code. The framework enforces this automatically.
- **Skill Scoping** — Each skill (security, testing, deployment) activates only when invoked and deactivates when done. No instruction creep.
- **Offline Search** — Full-text documentation search works without external services.
- **Pipeline Resilience** — Git pre-flight checks, batch execution, and delivery audits ensure nothing ships broken.

## How It Works

```
1. Write PRDs in genesis/
2. Run /go
3. SkillFoundry validates, decomposes into stories, implements, and verifies
4. Production-ready code with tests and documentation
```

SkillFoundry turns AI coding agents from unpredictable assistants into disciplined engineers that follow your rules every time.

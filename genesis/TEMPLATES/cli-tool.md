# PRD: [CLI Tool Name]

---
prd_id: cli-[tool-name]
title: [CLI Tool Name]
version: 1.0
status: DRAFT
created: [YYYY-MM-DD]
author: [Your Name]
tags: [cli, tool, automation]
priority: medium
layers: [backend]
---

## 1. Overview

### Problem Statement
[What manual process needs to be automated?]

### Proposed Solution
[CLI tool that automates...]

### Success Metrics
| Metric | Target |
|--------|--------|
| Execution time | < [X]s for typical usage |
| Error rate | < 1% |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | Developer | run `tool-name [command]` | [benefit] | MUST |
| US-002 | CI pipeline | run `tool-name --ci` | [benefit] | SHOULD |

---

## 3. Commands

| Command | Arguments | Description |
|---------|-----------|-------------|
| `tool-name init` | `[--force]` | Initialize configuration |
| `tool-name run` | `[target] [--verbose]` | Execute main operation |
| `tool-name status` | `[--json]` | Show current status |

---

## 4. Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `config_path` | `./.tool-config.json` | Config file location |
| `verbose` | `false` | Enable detailed output |

---

## 5. Error Handling

| Error | Exit Code | User Message |
|-------|-----------|--------------|
| Config not found | 1 | "Run `tool-name init` first" |
| Invalid input | 2 | "Invalid argument: [details]" |
| Network failure | 3 | "Connection failed: [url]" |

---

## 6. Out of Scope

- [ ] [Explicitly excluded feature]

---

*Template: CLI Tool — The Forge — Claude AS Framework*

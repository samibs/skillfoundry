# PRD: Autonomous Developer Loop + Knowledge Sync

---
prd_id: autonomous-developer-loop
title: Autonomous Developer Loop + Knowledge Sync
version: 1.0
status: APPROVED
created: 2026-02-20
author: SBS + Claude
last_updated: 2026-02-20

# DEPENDENCIES
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [core, autonomous, knowledge, sync, developer-experience]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

Developers using SkillFoundry must manually invoke specific commands (`/forge`, `/go`, `/coder`, etc.) for every task, remember which agent handles which scenario, and lose all session knowledge when context resets. Knowledge accumulated across sessions and projects is not persisted to any external store, meaning every new session or new project starts from zero. This creates friction, slows iteration, and prevents the framework from becoming truly autonomous.

### 1.2 Proposed Solution

Build two independent systems that communicate through the filesystem:

1. **Autonomous Protocol** — An intent-routing layer injected via CLAUDE.md and agent files that uses Claude's own intelligence to classify user input and route to the correct pipeline, executing fully without user intervention until presenting final results for review.

2. **Knowledge Sync Daemon** — A lightweight bash daemon that watches `memory_bank/`, `logs/sessions/`, and agent stats on a configurable interval, sanitizes sensitive data, and auto-commits/pushes to a single global GitHub knowledge repository spanning all projects.

Together, these create a self-improving loop: every session's lessons feed back into future sessions, across all projects, with zero manual effort.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Commands per task | 2-5 manual invocations | 1 (just describe the task) | Count user commands per feature |
| Knowledge persistence | 0% (lost on context reset) | 100% (synced to GitHub) | Check dev-memory repo for entries |
| Cross-project learning | None | Lessons carry to new projects | New project loads global lessons on init |
| Session startup context | Empty | Full developer profile + history | Check memory_bank populated on start |

---

## 2. User Stories

### Primary User: Developer using SkillFoundry

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | type a natural language request and have The Forge auto-execute the right pipeline | I don't need to remember which command to use | MUST |
| US-002 | developer | toggle autonomous mode on and off with `/autonomous` | I can switch between guided and autonomous workflows | MUST |
| US-003 | developer | have my knowledge (facts, decisions, errors, preferences) auto-synced to GitHub | nothing is lost when a session ends or context resets | MUST |
| US-004 | developer | have lessons from one project available in all other projects | I never repeat the same mistake across projects | MUST |
| US-005 | developer | see a structured review of what the autonomous pipeline did before approving | I maintain control over what gets committed | MUST |
| US-006 | developer | have secrets and absolute paths automatically stripped before sync | my knowledge repo is safe to keep public or shared | MUST |
| US-007 | developer | configure the sync interval | I can balance freshness vs git noise | SHOULD |
| US-008 | developer | see sync status and history | I know what's been pushed and when | SHOULD |
| US-009 | developer | have the system auto-promote repeated lessons to global rules | the framework gets smarter over time without manual curation | COULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Autonomous Protocol | Agent file that instructs Claude to classify intent and route to pipelines | Given any natural language input, When autonomous mode is active, Then Claude classifies intent (FEATURE/BUG/REFACTOR/QUESTION/OPS/MEMORY) and executes the mapped pipeline |
| FR-002 | Intent Classifier | Reference document with classification examples and confidence thresholds | Given ambiguous input, When confidence < 70%, Then Claude asks for clarification instead of guessing |
| FR-003 | `/autonomous` Command | Skill to toggle autonomous mode on/off | Given `/autonomous on`, When flag file `.claude/.autonomous` is created, Then protocol activates. Given `/autonomous off`, When flag file removed, Then normal mode resumes |
| FR-004 | Knowledge Sync Daemon | Bash script daemon with init/start/stop/sync/status/register commands | Given `knowledge-sync.sh start`, When interval elapses and files changed, Then sanitized changes committed and pushed to GitHub |
| FR-005 | Sanitization Pipeline | Script that strips secrets, normalizes paths, validates JSON before sync | Given a file containing `/home/user/project/.env`, When sanitized, Then path becomes `$PROJECT_ROOT/.env` and .env content is never synced |
| FR-006 | Session Start Hook | Hook that pulls latest global knowledge and starts sync daemon | Given a new Claude session starts, When hook fires, Then global/lessons.jsonl pulled into memory_bank and sync daemon started |
| FR-007 | Session End Hook | Hook that harvests memory, forces sync, stops daemon | Given a Claude session ends, When hook fires, Then memory harvested, final sync executed, daemon stopped |
| FR-008 | Global Knowledge Repo Structure | Standardized repo layout with global/ and projects/ directories | Given `knowledge-sync.sh init <repo-url>`, When executed, Then repo created/cloned with correct directory structure |
| FR-009 | Lesson Promotion | Auto-promote patterns repeated 3+ times to global/lessons.jsonl | Given an error pattern appears in 3+ different sessions, When sync runs, Then pattern promoted to global/lessons.jsonl with source references |

### 3.2 User Interface Requirements

**CLI Only — No UI**

- `/autonomous` — Toggle command with status display
- `/autonomous on` — Enable autonomous mode
- `/autonomous off` — Disable autonomous mode
- `/autonomous status` — Show current mode, sync status, last sync time
- `knowledge-sync.sh` — All subcommands output to terminal with color-coded status

### 3.3 Autonomous Pipeline Routes

| Intent | Classification Keywords | Pipeline |
|--------|------------------------|----------|
| FEATURE | "add", "create", "build", "implement", "new" | `/prd` -> `/stories` -> `/forge` |
| BUG | "fix", "broken", "error", "crash", "fails", "not working" | `/debugger` -> `/fixer` -> `/tester` |
| REFACTOR | "refactor", "clean up", "improve", "reorganize", "simplify" | `/architect` -> `/coder` -> `/tester` |
| QUESTION | "how", "what", "why", "explain", "show me", "where" | `/explain` (read-only) |
| OPS | "deploy", "release", "ship", "CI", "pipeline", "docker" | `/ship` or `/devops` |
| MEMORY | "remember", "save", "learn", "note", "record" | `/memory harvest` |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Intent classification | < 1 second (Claude's own reasoning) |
| Sync cycle | < 10 seconds for typical changeset |
| Daemon memory footprint | < 5MB resident |
| Startup overhead | < 2 seconds for session hook |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Secrets | NEVER synced — .env, API keys, tokens, passwords stripped before commit |
| Paths | Absolute paths normalized to `$PROJECT_ROOT` relative |
| Session logs | Sanitized: no credentials, no PII, no stack traces with sensitive data |
| GitHub auth | Uses existing `gh` CLI authentication, no stored tokens |
| Repo visibility | User's choice — private repo recommended, public supported |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Sync daemon uptime | Recovers from crash via PID file check on next interval |
| Data loss tolerance | Zero — sync confirms push before clearing dirty flag |
| Conflict resolution | Append-only JSONL files avoid merge conflicts; JSON files use last-write-wins |
| Network failure | Skip cycle, retry next interval, log warning |

---

## 5. Technical Specifications

### 5.1 Architecture

```
System 1: Autonomous Protocol (inside Claude Code)
┌────────────────────────────────────────────────────┐
│  CLAUDE.md references _autonomous-protocol.md      │
│  Claude classifies → routes → executes → reviews   │
│  Writes results to memory_bank/ and logs/          │
└───────────────────────┬────────────────────────────┘
                        │ filesystem
                        ▼
System 2: Knowledge Sync (outside Claude Code)
┌────────────────────────────────────────────────────┐
│  knowledge-sync.sh daemon                          │
│  Watches → sanitizes → commits → pushes            │
│  Pulls global lessons on session start             │
└────────────────────────────────────────────────────┘
                        │
                        ▼
              GitHub: dev-memory repo
┌────────────────────────────────────────────────────┐
│  global/         shared across all projects        │
│  projects/       per-project knowledge             │
│  EVOLUTION.md    auto-generated learning log       │
└────────────────────────────────────────────────────┘
```

### 5.2 Data Model

**Global Knowledge Repo Structure:**

```
dev-memory/
├── global/
│   ├── preferences.json          # Developer coding style, stack, patterns
│   ├── lessons.jsonl             # Promoted rules (confirmed 3+ times)
│   ├── tech-stack.json           # Known languages, frameworks, tools
│   └── anti-patterns.jsonl       # "never do X" rules
├── projects/
│   └── <project-name>/
│       ├── memory_bank/
│       │   └── knowledge/        # facts, decisions, errors, preferences
│       ├── relationships/        # knowledge graph, lineage
│       ├── sessions/             # sanitized session logs
│       └── agent-stats.jsonl     # per-project agent performance
├── EVOLUTION.md                  # Auto-generated learning changelog
└── .sync-meta.json               # registered projects, last sync times
```

**Sync Meta Schema (.sync-meta.json):**

```json
{
  "version": "1.0",
  "repos": {
    "project-name": {
      "local_path": "/path/to/project",
      "last_sync": "2026-02-20T10:30:00Z",
      "sync_count": 42,
      "files_synced": 156
    }
  },
  "global_lessons_count": 12,
  "last_promotion_check": "2026-02-20T10:30:00Z"
}
```

**Lesson Entry Schema (global/lessons.jsonl):**

```json
{
  "id": "lesson-001",
  "rule": "Always validate input before database write",
  "source_pattern": "missing-input-validation",
  "occurrences": 5,
  "first_seen": "2026-01-15",
  "last_seen": "2026-02-20",
  "projects": ["project-a", "project-b"],
  "promoted_at": "2026-02-20T10:30:00Z"
}
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| git | 2.x+ | Version control for knowledge repo | Cannot sync — daemon logs warning |
| gh CLI | 2.x+ | GitHub authentication and repo creation | Manual repo setup required |
| jq | 1.6+ | JSON processing for sanitization and promotion | Fallback to grep/sed (degraded) |
| Claude Code | 1.x+ | Host environment for hooks and protocol | Framework doesn't function |

### 5.4 File Manifest

| File | Type | Purpose |
|------|------|---------|
| `agents/_autonomous-protocol.md` | Agent file | Intent routing rules, execution pipeline, review format |
| `agents/_intent-classifier.md` | Agent file | Classification examples, edge cases, confidence thresholds |
| `.claude/commands/autonomous.md` | Skill | `/autonomous` toggle command |
| `scripts/knowledge-sync.sh` | Bash daemon | init, start, stop, sync, status, register, promote |
| `scripts/sanitize-knowledge.sh` | Bash script | Strip secrets, normalize paths, validate JSON |
| `.claude/hooks/session-start.sh` | Hook | Pull global knowledge, start sync daemon |
| `.claude/hooks/session-end.sh` | Hook | Harvest memory, force sync, stop daemon |

---

## 6. Sanitization Rules

### 6.1 NEVER Sync

| Pattern | Action |
|---------|--------|
| `.env`, `.env.*` | Skip entirely |
| `*.key`, `*.pem`, `*.p12` | Skip entirely |
| `*credential*`, `*secret*` | Skip entirely |
| `node_modules/`, `__pycache__/` | Skip entirely |
| Lines matching `(API_KEY\|SECRET\|TOKEN\|PASSWORD)=` | Redact to `[REDACTED]` |

### 6.2 Path Normalization

| Before | After |
|--------|-------|
| `/home/user/projects/myapp/` | `$PROJECT_ROOT/` |
| `/Users/dev/code/myapp/` | `$PROJECT_ROOT/` |
| `C:\Users\dev\code\myapp\` | `$PROJECT_ROOT\` |
| `/tmp/tmp.xxx/` | `$TMPDIR/` |

### 6.3 Validation

- All `.json` files must pass `jq .` validation
- All `.jsonl` files must have each line pass `jq .` validation
- Invalid entries logged and skipped (never push broken JSON)

---

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Web UI for knowledge browsing | CLI-first per workflow preferences |
| Real-time collaboration between developers | Single-developer tool |
| Cloud-hosted knowledge service | GitHub is the store, no custom backend |
| Automatic code generation from lessons | Lessons inform agents, don't generate code |
| Integration with non-GitHub remotes | GitHub-first, GitLab/Bitbucket deferred |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Intent misclassification | Medium | Medium | Confidence threshold — ask user if < 70% |
| Secrets leaking to knowledge repo | Low | Critical | Sanitization pipeline runs BEFORE git add; deny-list patterns |
| Token overspend in autonomous mode | Medium | Medium | Existing Claude Code token limits apply; add budget warning |
| Merge conflicts in knowledge repo | Low | Low | JSONL append-only format; JSON uses last-write-wins |
| Daemon process left running | Low | Low | PID file cleanup on session end; stale PID detection |
| Network unavailable during sync | Medium | Low | Skip cycle, retry next interval, log warning |

---

## 9. Implementation Stories

### Story Map

```
STORY-001: Autonomous Protocol Agent          (no deps)
STORY-002: Intent Classifier Reference         (no deps)
STORY-003: /autonomous Toggle Command          (depends: 001)
STORY-004: Knowledge Sync Daemon               (no deps)
STORY-005: Sanitization Pipeline               (depends: 004)
STORY-006: Session Start Hook                  (depends: 004)
STORY-007: Session End Hook                    (depends: 004, 005)
STORY-008: Install Integration                 (depends: 004)
STORY-009: Lesson Promotion Engine             (depends: 004, 005)
```

### Story Dependency Graph

```
001 ──► 003
002
004 ──► 005 ──► 007
  │             009
  ├──► 006
  └──► 008
```

### Parallel Execution Groups

```
Group A (independent): STORY-001, STORY-002, STORY-004
Group B (after 001):   STORY-003
Group C (after 004):   STORY-005, STORY-006, STORY-008
Group D (after 005):   STORY-007, STORY-009
```

---

## 10. Acceptance Criteria

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-001 | Intent routing | autonomous mode is ON | user enters a feature request in natural language | pipeline maps intent and executes the expected route without requiring explicit slash command |
| AC-002 | Ambiguous intent safety | autonomous mode is ON and classifier confidence is below threshold | user enters ambiguous request | system requests clarification and does not execute a destructive or write pipeline |
| AC-003 | Toggle behavior | system is running in normal mode | user runs `/autonomous on` then `/autonomous off` | `.claude/.autonomous` is created then removed, and status output reflects each state transition |
| AC-004 | Sync daemon baseline | knowledge repo is initialized and registered | `knowledge-sync.sh start` is running with changed knowledge files | daemon performs sanitize -> commit -> push cycle and reports last sync timestamp |
| AC-005 | Sanitization enforcement | monitored files contain secret-like patterns or absolute machine paths | sync cycle runs | secrets are redacted or skipped, paths are normalized, and invalid JSON artifacts are rejected from commit |
| AC-006 | Session hooks | session hooks are installed | session starts then ends | start hook pulls global lessons and starts daemon; end hook harvests memory, forces final sync, and stops daemon cleanly |
| AC-007 | Cross-project learning | at least one project has promoted lessons in global store | a different project starts a new session | global lessons are available in local memory context before first task execution |
| AC-008 | Promotion logic | identical lesson pattern appears in at least 3 sessions/projects | promotion check runs | pattern is promoted to `global/lessons.jsonl` with source metadata and occurrence count |

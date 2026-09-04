# SkillFoundry Framework — Agent Instructions for OpenAI Codex

**Version 5.32.0** | **Hexa-Platform: Claude Code · Cursor · Copilot · Codex · Gemini · Grok Build** | **98 Skills** | **20 MCP Tool Agents**

---

## What This Is

SkillFoundry (Agents & Skills) is a production-ready AI development framework with 60 specialized agents covering the full software development lifecycle. This file provides always-on context for OpenAI Codex CLI.

## Philosophy

- **Cold-blooded logic over flattery** — Honest, structured, production-ready evaluations only
- **ONLY REAL LOGIC** — No placeholders, TODOs, mocks, or stubs. Every feature works end-to-end
- **Three-Layer Completeness** — Every feature verified across DATABASE → BACKEND → FRONTEND
- **PRD-First Development** — Non-trivial features start with a Product Requirements Document
- **Implement > Test > Iterate** — Every feature tested before considered done

## How to Use Skills

Each SkillFoundry agent is available as a Codex Skill in `.agents/skills/`. Invoke explicitly or let Codex auto-select based on your prompt.

**Explicit invocation:**
```
$go                          # Execute all PRDs from genesis/
$coder                       # TDD implementation
$tester                      # Run tests
$anvil                       # 6-tier quality gate
$forge                       # Full pipeline
$architect                   # System design
```

**Implicit activation:** Codex auto-selects the right skill when your prompt matches a skill's description.

## Multi-Agent Execution

When Codex runs parallel agents, subagents, or parallel implementation work, read and follow
`MULTI_AGENT_PROTOCOL.md` (operational module: `agents/_governed-mission-protocol.md`).

The protocol is authoritative for: dependency-aware waves · agent naming · git worktree isolation ·
worktree legitimacy checks · the `.ai/` JSON execution ledger · process ownership · source patch
guides · evidence and provenance · test-cost coordination · publication verification.

Existing SkillFoundry quality and implementation rules remain active.

**Before any source write, a Codex worker must:**

```bash
git worktree list --porcelain          # the current directory MUST be listed
$mission attest <ID> --worker codex-<role>-<ID> --agent codex
$mission gate <ID>                     # WRITES AUTHORIZED / WRITES BLOCKED
```

A copied repository folder is **not** a worktree. Two writers **never** share a working directory.

**Non-negotiable:** no writes before a PASS attestation · never modify product code to compensate
for a broken environment · never broadly kill `all node`/`all dotnet`/`all python` · never claim
"probably pre-existing" without a baseline run · a commit is not acceptance · an integration is
not a publication.

---

## Delivery Efficiency

Canonical policy: `agents/_delivery-efficiency.md`. Read it rather than inferring the rules.

Codex must minimize redundant reasoning and repeated validation:

- classify a **delivery budget** (LOW / MEDIUM / HIGH) before implementing, and follow its
  execution policy;
- consume shared mission context before re-deriving architecture or changed files;
- reuse validation evidence that is still valid for this exact repository state;
- scope tests to the change — `$tester` chooses smoke / targeted / affected / integration,
  never `full` from the budget alone;
- escalate only on evidence; a fixed targeted failure does not justify the full suite;
- stop once the change is proven.

Authentication, authorization, secrets, cryptography, migrations, deployment, financial and
compliance logic always classify HIGH and their checks are never skipped.

---

## Available Skills by Category

### Core Workflow
| Skill | Purpose |
|-------|---------|
| `$go` | Main orchestrator — validate PRDs, generate stories, implement |
| `$coder` | Ruthless TDD implementation with strict quality |
| `$tester` | Ruthless testing — assumes all code is broken |
| `$fixer` | Auto-remediation for failing tests and bugs |
| `$gate-keeper` | Quality gate validation before story completion |
| `$forge` | Full pipeline: smelt → forge → temper → quench |
| `$anvil` | 6-tier quality gate between agent handoffs |
| `$mission` | Governed mission: `.ai/` ledger, attestation, evidence, provenance, waves, process ownership |
| `$delivery` | Delivery budgets, scoped validation, evidence reuse, stop conditions |

### Architecture & Design
| Skill | Purpose |
|-------|---------|
| `$architect` | System design and architecture decisions |
| `$api-design` | API contract design |
| `$data-architect` | Database schema and data modeling |
| `$tech-lead` | Technical decisions with push-back |
| `$senior-engineer` | Implementation with senior-level push-back |

### Quality & Review
| Skill | Purpose |
|-------|---------|
| `$preflight` | Codebase comprehension pre-flight — build a Code Map (contract surface, imports, DB/layers) before changing existing code |
| `$review` | Code review agent |
| `$evaluator` | BPSBS standards compliance check |
| `$layer-check` | Three-layer enforcement validation |
| `$security` | Security specialist and threat modeling |
| `$security-scanner` | Automated vulnerability scanning |
| `$bpsbs` | Standards enforcement |
| `$performance` | Performance optimization |

### Shortcuts
| Skill | Purpose |
|-------|---------|
| `$gosm` | Semi-autonomous mode |
| `$goma` | Fully autonomous mode |
| `$blitz` | Speed + TDD blitz |
| `$ship` | Release pipeline |
| `$gohm` | Harvest memory |
| `$nuke` | Clean slate reset |

### Utilities
| Skill | Purpose |
|-------|---------|
| `$prd` | Create Product Requirements Document |
| `$stories` | Generate implementation stories from PRD |
| `$context` | Token budget management |
| `$memory` | Knowledge base operations |
| `$status` | Project status dashboard |
| `$health` | Framework diagnostics |
| `$cost` | Token usage report |
| `$analytics` | Agent usage analytics |
| `$profile` | Session presets |
| `$version` | Version information |

### Specialized
| Skill | Purpose |
|-------|---------|
| `$docs` | Documentation generation |
| `$debugger` | Bug hunting and debugging |
| `$refactor` | Code refactoring |
| `$i18n` | Internationalization |
| `$accessibility` | Accessibility compliance |
| `$migration` | Database and code migrations |
| `$dependency` | Dependency management |
| `$sre` | Site reliability engineering |
| `$devops` | CI/CD pipeline management |
| `$release` | Release preparation |
| `$ops` | Operational tooling generation |

## Key Rules

### Zero Tolerance Banned Patterns
`TODO`, `FIXME`, `PLACEHOLDER`, `STUB`, `MOCK`, `HACK`, `XXX`, `WIP`, `TEMP`, `COMING SOON`, `NotImplementedError`, empty function bodies — all trigger immediate rejection.

### The Anvil — 6-Tier Quality Gate
Between every agent handoff:
- **T1**: Shell pre-flight (syntax, imports, banned patterns)
- **T2**: Canary smoke test (module imports, endpoint responds)
- **T3**: Self-adversarial review (coder breaks own code)
- **T4**: Scope validation (expected vs actual changes)
- **T5**: Contract enforcement (API spec vs implementation)
- **T6**: Shadow tester (parallel risk assessment)

### Directory Structure
```
genesis/              # PRD repository (start here)
docs/stories/         # Generated implementation stories
agents/               # Agent source definitions
memory_bank/          # Agent knowledge and lessons
.agents/skills/       # Codex skills (auto-generated)
scripts/              # Automation scripts
.ai/                  # Governed mission control plane (ledger, evidence, patches)
```

## Quick Start

```
1. Create PRD:     $prd "your feature"        → Saved to genesis/
2. Implement:      $go                         → Full pipeline
3. Or shortcut:    $forge                      → Smelt+Forge+Temper+Quench
```

---

*SkillFoundry Framework v5.32.0 — Hexa-Platform Support*

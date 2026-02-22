# SkillFoundry v1.9.0.22 - Quick Reference Card

**Version Format:** MAJOR.FEATURE.DATABASE.ITERATION (1=breaking, 9=features, 0=db, 0=patches)

## The Forge (53 Core Agents / 60 Skills)

```
LEADERSHIP     ARCHITECTURE    IMPLEMENTATION   QUALITY         SECURITY
tech-lead      architect       coder            tester          security
               api-design      senior-engineer  review          security-scanner ★NEW
               data-architect  refactor         evaluator
                                                gate-keeper
                                                fixer ★NEW

RELIABILITY    SPECIALIZED     RELEASE          ORCHESTRATION   STANDARDS
sre            ux-ui           release          auto            bpsbs
performance    accessibility                    go              standards
devops         migration                        orchestrate     layer-check
               dependency                       delegate
               i18n                             workflow

SUPPORT        MANAGEMENT
debugger       prd
docs           stories
learn          context
math-check     memory
               metrics
               version ★NEW
```

---

## Essential Commands

| Command | Purpose |
|---------|---------|
| `/go` | **Main command** - Execute all PRDs from genesis/ |
| `/go --mode=semi-auto` ⭐ | **Recommended** - Auto-fix routine, escalate critical |
| `/go --mode=autonomous` | Full autonomy, minimal interruptions |
| `/go --validate` | Validate PRDs without implementing |
| `/go --resume` | Resume interrupted execution |
| `/go --rollback` | Undo all changes from last run |
| `/prd "idea"` | Create new PRD in genesis/ |
| `/coder` | TDD implementation |
| `/senior-engineer` | Implementation with assumption surfacing |
| `/fixer` ★NEW | Auto-remediation routing and stats |
| `/security audit` | Security audit |
| `/security-scanner` | AI vulnerability scan |
| `/review` | Code review |
| `/tester` | Run tests |
| `/layer-check` | Validate DB/Backend/Frontend |
| `/metrics` | View execution dashboard |
| `/context` | Check token budget |
| `/version` | Show version, check for updates |
| `/swarm` | Swarm coordination management |
| `/explain` | Explain last agent action |
| `/undo` | Revert last action |
| `/cost` | Token usage report |
| `/health` | Framework self-diagnostic |
| `companion.sh --tmux` | Open context-aware command panel |

---

## Shortcut Commands (The Forge)

> Quick-access shortcuts for common workflows. Type less, forge more.

| Shortcut | Name | What it does |
|----------|------|--------------|
| `/forge` | **Summon The Forge** | Full pipeline: validate + implement + test + audit + harvest + debrief |
| `/gosm` | Go Semi-Auto | `/go --mode=semi-auto` (recommended) |
| `/goma` | Go Autonomous | `/go --mode=autonomous` |
| `/blitz` | Blitz Mode | Parallel + TDD + semi-auto for max speed |
| `/gohm` | Harvest Memory | Extract lessons to memory bank (`--push` to auto-commit) |
| `/ship` | Ship It | Layer-check + security audit + release prep |
| `/nuke` | Nuke & Rebuild | Rollback + clean state (requires confirmation) |
| `/status` | Status Dashboard | PRDs, stories, layers, memory, execution state |
| `/profile` | Session Profiles | Load/create workflow presets |
| `/replay` | Replay Execution | Re-run last /go or /forge with same params |
| `/analytics` | Agent Analytics | Invocation stats, success rates, trends |
| `/anvil` | **Anvil Quality Gate** | Run 6-tier validation on changed files or specific tiers |

### Agent Evolution
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 analyze
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 debate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MaxIterations 10
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MinIterations 100 -MaxIterations 100

# On-demand wrapper (debate|implement|iterate|run)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 debate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 implement -AutoFix
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 iterate -AutoFix -MinIterations 1 -MaxIterations 20
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/evolve.ps1 run -Phases debate,implement,iterate -AutoFix
```

---

## New in v1.9.0.20: Agent Evolution Engine

### 53-Agent Debate/Implement/Iterate Loop
```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 analyze
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 debate
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MaxIterations 10
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent-evolution.ps1 cycle -AutoFix -MinIterations 100 -MaxIterations 100
```

## New in v1.9.0.17: OpenClaw-Inspired Features

### Heartbeat Monitoring
```
scripts/heartbeat.sh init                Create HEARTBEAT.md template
scripts/heartbeat.sh start               Start monitoring daemon
scripts/heartbeat.sh stop                Stop daemon
scripts/heartbeat.sh status              Show daemon state + last check
scripts/heartbeat.sh run-once            Execute one check cycle
scripts/heartbeat.sh logs                View daemon logs
```

### Notifications
```
scripts/notify.sh init                   Create notification config
scripts/notify.sh send <lvl> <msg>       Send notification
scripts/notify.sh test                   Test all enabled channels
scripts/notify.sh config                 Show current config
scripts/notify.sh history                View notification history
```

### Developer Preferences
```
scripts/preferences.sh init              Create preferences file
scripts/preferences.sh learn             Auto-detect from codebase
scripts/preferences.sh inject            Markdown summary for agents
scripts/preferences.sh set <key> <val>   Set explicit preference
scripts/preferences.sh get <key>         Get preference value
scripts/preferences.sh list              List all preferences
```

## Competitive Leap (v1.9.0.16)

### CI/CD, Quality Intelligence & Moonshots
```
scripts/cost-router.sh assess <agent> <desc>   Assess task complexity
scripts/cost-router.sh route <agent> <level>    Get model tier

scripts/rejection-tracker.sh record <cat> <desc>   Log gate rejection
scripts/rejection-tracker.sh rules approve <id>    Approve proposed rule
scripts/rejection-tracker.sh rules inject          Update quality primer

scripts/a2a-server.sh card <agent>        A2A agent card JSON
scripts/a2a-server.sh cards               All agent cards array
scripts/a2a-server.sh discover            List discoverable agents

scripts/arena-evaluate.sh setup --story=X --contestants=3
scripts/arena-evaluate.sh evaluate --story=X --solutions=dir1,dir2

bash compliance/hipaa/checks.sh [project]   Run HIPAA checks (15)
bash compliance/soc2/checks.sh [project]    Run SOC2 checks (12)
bash compliance/gdpr/checks.sh [project]    Run GDPR checks (10)

scripts/compliance-evidence.sh collect <profile>   Collect evidence
scripts/compliance-evidence.sh verify <dir>        Verify integrity
scripts/compliance-evidence.sh package <profile>   Archive for auditor
```

---

## New in v1.9.0.15: Session Observability & Reasoning Layer

### Session Tracking & Attribution
```
scripts/session-recorder.sh start --agent=coder --story=STORY-003
scripts/session-recorder.sh decision --what="Used RS256" --why="Asymmetric keys"
scripts/session-recorder.sh end --outcome=success --gate=anvil-pass
scripts/session-recorder.sh list            List recent sessions
scripts/session-recorder.sh show <id>       Full session timeline

scripts/attribution.sh baseline             Snapshot before agent session
scripts/attribution.sh calculate            Diff after session (human vs AI %)
scripts/attribution.sh report               Per-file attribution breakdown
scripts/attribution.sh trailer              Output git commit trailer format

scripts/checkpoint.sh create "description"  Named save point (git tag)
scripts/checkpoint.sh list                  Show all checkpoints
scripts/checkpoint.sh rewind <name>         Rewind to checkpoint
scripts/checkpoint.sh diff <a> <b>          Diff between checkpoints
```

### Session Viewer
```
/replay --show              List recent sessions
/replay --show <id>         Show session timeline with decisions, events, files
```

### Commit Trailers (auto-appended by agents)
```
Claude-AS-Agent: coder
Claude-AS-Story: STORY-003
Claude-AS-Session: 20260215_143000_a1b2c3d4
Claude-AS-Attribution: 68% agent (146/214 lines)
Claude-AS-Gate: anvil-pass
```

---

## New in v1.9.0.14: OpenAI Codex Platform Support

### 4th Platform: OpenAI Codex
- OpenAI Codex added as 4th supported platform with 60 skills in `.agents/skills/`, native SKILL.md format
- Sync engine: `sync-platforms.sh` now generates 4 platform files
- Invocation: `$go`, `$coder`, `$tester` etc. with auto-discovery of available skills

---

## New in v1.9.0.13: The Anvil (6-Tier Quality Gate)

### 6 Validation Tiers
```
T1  Shell Pre-Flight     scripts/anvil.sh    Between EVERY handoff   Syntax, patterns, imports
T2  Canary Smoke Test    LLM (quick)         After Coder             Module imports? Compiles?
T3  Self-Adversarial     LLM (Coder)         After Coder writes      3+ failure modes + mitigations
T4  Scope Validation     Diff-based           In Gate-Keeper          Expected vs actual files
T5  Contract Enforcement LLM (Gate-Keeper)   In Gate-Keeper          API contract vs implementation
T6  Shadow Tester        LLM (parallel)       Concurrent with Coder   Risk list for Tester
```

### Commands
```
/anvil                Run all tiers on changed files
/anvil t1             Shell pre-flight only
/anvil t1 <file>      T1 on specific file
/anvil t2             Canary smoke test
/anvil t3             Self-adversarial review
/anvil t4             Scope validation
/anvil t5             Contract enforcement
/anvil t6             Shadow tester risk list
/anvil --report       Full Anvil report
scripts/anvil.sh check <file>    Direct shell validation
```

### Fast-Fail Pipeline
```
Architect → T1 → Coder (+T6) → T1+T2+T3 → Tester → T1 → Gate-Keeper (T4+T5)
                                    ↓ FAIL → skip Tester → Fixer
```

### /go Integration
```
/go                    Anvil enabled (default)
/go --no-anvil         Disable Anvil for debugging
/go --anvil=t1,t2      Run specific tiers only
```

---

## New in v1.9.0.12: Enhanced DX + Templates + Analytics

### New Commands
4 new commands: `/status` (project dashboard), `/profile` (session presets), `/replay` (re-run executions), `/analytics` (agent usage stats).

### Session Profiles
4 built-in profiles in `.claude/profiles/`: `default` (balanced), `blitz` (speed+TDD), `cautious` (max oversight), `autonomous` (full auto).

### PRD Templates Library
Quick-start templates in `genesis/TEMPLATES/`: API service, CLI tool, full-stack feature, dashboard.

### Forge Phase 6: Debrief
`/forge` now auto-writes a scratchpad summary after completion.

---

## New in v1.9.0.11: Shortcut Commands + The Forge

### The Forge
The 46-agent team is now called **The Forge** — cold-blooded agents forging production code. `/forge` invokes the full pipeline: validate PRDs, implement stories (semi-auto + parallel), layer-check, security audit, and harvest memory.

### Quick-Access Shortcuts
7 new shortcut commands eliminate common flag combinations. `/gosm` replaces `/go --mode=semi-auto`, `/blitz` combines parallel + TDD + semi-auto, and `/ship` chains layer-check + security + release.

---

## New in v1.9.0.10: Deliberation Protocol

### Multi-Perspective Design Review
```
Triggers:              Architectural decisions, security changes, multiple approaches
Flow:                  Architect proposes → Perspectives challenge → Architect synthesizes
Depth levels:          Quick (2 min) | Standard (5 min) | Deep (10 min)
Decision records:      Append-only, preserved in scratchpad
Resolution:            Reality anchors win, security escalates, simplicity breaks ties
```

---

## New in v1.9.0.6: NASAB Framework Integration

### Agent Enrichments
```
Evidence-Based Gates     gate-keeper tracks evidence toward capability levels
Constraint Classification architect classifies Physical/Conventional/Regulatory/BestPractice
Pattern Detection        memory-curator detects unconscious coding patterns
Context-Aware Math       math-checker validates formula assumptions against context
Oscillation Detection    fixer stops retrying when fix→break cycles detected
Dissent Resolution       agents/_dissent-resolution.md — conflicting recommendations
Bidirectional Iteration  agents/_bidirectional-iteration.md — convergence tracking
```

---

## New in v1.9.0: Framework Evolution

### Knowledge & Intelligence
```
/go --compliance=hipaa     HIPAA compliance rules
/go --compliance=soc2      SOC2 compliance rules
/go --compliance=gdpr      GDPR compliance rules
scripts/semantic-search.sh "query"    Search knowledge base
scripts/monorepo.sh detect            Detect monorepo packages
```

### Swarm Mode
```
/swarm status              View swarm queue and agents
/swarm queue               Task queue details
/swarm scratchpad          Inter-agent notes
/swarm conflicts           File conflict warnings
```

### Developer Experience
```
/explain                   What did the last action do?
/undo                      Revert last action (with confirmation)
/cost                      Token usage summary
/health                    Framework diagnostics
```

---

## New in v1.7.0: Auto-Remediation

### Fixer Orchestrator (`/fixer`)
**Auto-remediation intelligence** - Routes violations to specialists, manages retries, escalates only when necessary.

**90%+ violations auto-fixed:**
- Missing tests → Tester
- Security headers → Security Specialist
- Dead code → Refactor Agent
- N+1 queries → Data Architect
- Performance issues → Performance Optimizer
- Accessibility → Accessibility Specialist

**Escalates to you:** Architectural decisions, business ambiguity, security policy choices.

### Execution Modes
```
/go --mode=supervised      # Stop at every violation (default)
/go --mode=semi-auto       # Auto-fix routine, escalate critical ⭐
/go --mode=autonomous      # Full autonomy, phase checkpoints only
```

---

## New Agents (v1.6.0)

| Agent | Command | Purpose |
|-------|---------|---------|
| **Security** | `/security` | STRIDE threat modeling, OWASP, vulnerability hunting |
| **Data Architect** | `/data-architect` | Schema design, query optimization, migrations |
| **Release Manager** | `/release` | Versioning, changelogs, rollback plans |
| **i18n Specialist** | `/i18n` | Internationalization, localization, RTL |
| **Tech Lead** | `/tech-lead` | Technical decisions, arbitration, mentorship |
| **SRE** | `/sre` | Incident response, SLOs, monitoring, chaos |
| **UX/UI Specialist** | `/ux-ui` | UI audit, design, migration, rewrite |
| **Senior Engineer** | `/senior-engineer` | Assumption surfacing, push-back, simplicity |

---

## Agent Modes

### Security (`/security`)
```
/security audit [target]      Full security audit
/security threat-model [feat] STRIDE analysis
/security pentest [endpoint]  Attack vectors
/security review [code]       Security code review
/security incident [desc]     Incident response
/security harden [system]     Hardening recommendations
```

### SRE (`/sre`)
```
/sre incident [desc]          Guide incident response
/sre postmortem [incident]    Blameless postmortem
/sre slo [service]            Define SLOs/SLIs/error budgets
/sre monitor [system]         Design monitoring
/sre runbook [scenario]       Create runbook
/sre chaos [target]           Chaos experiments
```

### UX/UI (`/ux-ui`)
```
/ux-ui audit                  Analyze UI for problems
/ux-ui design [component]     Design new UI
/ux-ui migrate [from] [to]    Framework migration
/ux-ui rewire [component]     Restructure without visual change
/ux-ui rewrite [component]    Complete rewrite
/ux-ui system                 Design system enforcement
```

### Data Architect (`/data-architect`)
```
/data-architect design [feat] Schema design with ERD, indexes
/data-architect review [schema] Review for anti-patterns
/data-architect optimize [query] Query optimization
/data-architect normalize [table] Normalization analysis
/data-architect migrate [change] Safe migration strategy
/data-architect audit         Full database health audit
```

### Release (`/release`)
```
/release prepare [version]    Version bump, changelog, checklist
/release changelog [from] [to] Generate changelog
/release notes [version]      User-facing release notes
/release checklist            Pre-release verification
/release rollback [version]   Rollback plan
/release hotfix [issue]       Emergency hotfix process
```

### i18n (`/i18n`)
```
/i18n setup [stack]           Set up i18n infrastructure
/i18n audit                   Find hardcoded strings
/i18n extract                 Extract translatable strings
/i18n locale [locale]         Add new locale
/i18n review [translations]   Review translation quality
/i18n rtl                     RTL support
```

### Tech Lead (`/tech-lead`)
```
/tech-lead decide [options]   Evaluate and recommend
/tech-lead review [proposal]  Review technical RFC
/tech-lead plan [project]     Technical plan with milestones
/tech-lead mentor [topic]     Technical mentorship
/tech-lead arbitrate [dispute] Arbitrate disagreements
/tech-lead retro [project]    Technical retrospective
```

---

## /go Command Flags

```
# Basic execution
/go                      Full execution of all PRDs
/go [file.md]            Execute specific PRD
/go --validate           Validate only, no implementation
/go --status             Show current progress

# Recovery & state
/go --resume             Continue from saved state
/go --rollback           Undo all changes
/go --clean              Clear state, start fresh

# Parallel & isolation
/go --parallel           Enable wave-based parallel
/go --worktree           Execute in isolated worktree
/go --tdd                Enforce TDD mode (STRICT)
```

---

## Workflow Quick Reference

### New Feature
```
/prd "feature idea"      → Create PRD
/security threat-model   → Security analysis
/go                      → Implement
/layer-check             → Verify layers
/release prepare         → Release
```

### Bug Fix
```
/debugger                → Root cause analysis
/coder                   → Fix with TDD
/tester                  → Verify fix
/release hotfix          → Deploy
```

### Code Quality
```
/review                  → Code review
/evaluator               → BPSBS compliance
/refactor                → Improve code
/tester                  → No regressions
```

### Production Incident
```
/sre incident            → Start response
/debugger                → Find cause
/coder                   → Implement fix
/sre postmortem          → Document learnings
```

---

## Agent Selection by Task

| Task | Primary | Support |
|------|---------|---------|
| New feature | `/go` | `/prd`, `/architect`, `/coder` |
| Bug fix | `/debugger` | `/coder`, `/tester` |
| Code review | `/review` | `/security`, `/evaluator` |
| Performance | `/performance` | `/sre`, `/data-architect` |
| Security | `/security` | `/review`, `/dependency` |
| UI work | `/ux-ui` | `/accessibility`, `/architect` |
| Database | `/data-architect` | `/migration`, `/coder` |
| Release | `/release` | `/tester`, `/devops` |
| Incident | `/sre` | `/debugger`, `/security` |
| Tech decision | `/tech-lead` | `/architect`, `/senior-engineer` |
| i18n | `/i18n` | `/ux-ui`, `/tester` |

---

## Three-Layer Checklist

| Layer | Must Have |
|-------|-----------|
| **Database** | Migration works, rollback tested |
| **Backend** | Endpoints work, auth enforced, tests pass |
| **Frontend** | REAL API (no mocks), all states |

---

## Banned Patterns (Zero Tolerance)

```
TODO, FIXME, HACK, XXX
PLACEHOLDER, STUB, MOCK (in prod)
COMING SOON, NOT IMPLEMENTED
WIP, TEMPORARY, TEMP
Lorem ipsum
NotImplementedError
Empty function bodies
Hardcoded credentials
```

---

## Context Budget

| Zone | Tokens | Action |
|------|--------|--------|
| GREEN | 0-50K | Normal |
| YELLOW | 50-100K | `/context compact` |
| RED | >100K | Force compaction |

---

## Project Structure

```
your-project/
├── .claude/commands/      # 46 agents + 7 shortcuts
├── agents/                # Shared modules
├── genesis/               # PRDs go here
├── docs/stories/          # Generated stories
├── CLAUDE.md              # Full standards
└── CLAUDE-SUMMARY.md      # Condensed
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/go` not found | Run `install.sh` |
| Skills not recognized | Check `.claude/commands/` |
| State stuck | `/go --clean` |
| Context overflow | `/context compact` |
| Need rollback | `/go --rollback` or `/nuke` |

---

## Platform Invocation

| Platform | Syntax |
|----------|--------|
| Claude Code | `/command` |
| Copilot CLI | `task("agent", "prompt")` |
| Cursor | "use [agent] rule" |
| OpenAI Codex | `$skill-name` |
| Google Gemini | Load skill from `.gemini/skills/<skill>.md` |

---

*SkillFoundry Framework v1.9.0.22 - February 2026 - The Forge (53 Core Agents / 60 Skills)*

# SkillFoundry v2.0.77 - Quick Reference Card

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
| `/setup` | Configure API keys (sf setup from terminal) |
| `/exit` | Quit the CLI |
| `/health` | Framework diagnostics + session monitor |
| `companion.sh --tmux` | Open context-aware command panel |

---

## Dashboard Commands (Centralized Multi-Project)

| Command | Purpose |
|---------|---------|
| `sf dashboard` | Multi-project overview table |
| `sf dashboard sync` | Force-sync all projects into central DB |
| `sf dashboard serve` | Start web dashboard (http://127.0.0.1:9400) |
| `sf dashboard trend` | KPI trend report with forecasting |
| `sf dashboard snapshot` | Capture KPI snapshots |
| `sf dashboard forecast` | Forecast metrics per project |
| `sf dashboard remediate scan` | Scan for auto-remediation opportunities |
| `sf dashboard remediate list` | List pending remediations |
| `sf dashboard remediate apply <id>` | Apply a remediation action |
| `sf dashboard remediate playbooks` | List available playbooks |
| `sf dashboard remediate report` | Remediation effectiveness report |

### Standalone Launcher (no `sf` CLI needed)

```bash
./scripts/dashboard-serve.sh              # One-command: sync + snapshot + seed + scan + serve
./scripts/dashboard-serve.sh --port=8080  # Custom port
./scripts/dashboard-serve.sh --sync-only  # Sync only, no server
./scripts/dashboard-serve.sh --open       # Auto-open browser
```

---

## Skill Optimizer (Autoresearch-Inspired)

| Command | Purpose |
|---------|---------|
| `/optimize <skill>` | Run mutation loop (8 strategies, 16 iterations default) |
| `/optimize <skill> --iterations 100` | Custom iteration count |
| `/optimize <skill> --apply` | Write best prompt back to file |
| `/optimize <skill> --strategies s1,s2` | Use specific strategies only |
| `/optimize list` | Show available mutation strategies |
| `/optimize history` | Show past optimization experiments |
| `/optimize result <id>` | Show experiment details |

### Mutation Strategies

| Strategy | Win Rate | What it does |
|----------|----------|-------------|
| `format_swap` | 93% | Convert bullet ↔ prose |
| `reorder_sections` | 91% | Swap section ordering |
| `prune_redundancy` | 100% | Remove duplicate sentences |
| `sharpen_instructions` | 100% | Replace hedging with imperatives |

---

## Code Booster (Fast Transforms Without LLM)

| Command | Purpose |
|---------|---------|
| `/boost <file>` | Detect and apply all applicable transforms |
| `/boost <file> --dry-run` | Preview changes without writing |
| `/boost <file> --transforms var-to-const,add-types` | Specific transforms |
| `/boost list` | Show 6 available transforms |

Transforms: `var-to-const`, `add-types`, `wrap-async`, `add-export`, `require-to-import`, `add-jsdoc`

---

## Smart Router (Learning-Based Agent Selection)

| Command | Purpose |
|---------|---------|
| `/route <description>` | Recommend best agent for a task |
| `/route stats` | Agent performance table (wins, losses, avg score) |
| `/route history` | Recent routing decisions |

Routes based on historical performance. Falls back to keyword classification when no data.

---

## Token Optimizer (Context Compression)

| Command | Purpose |
|---------|---------|
| `/tokens analyze <file>` | Token breakdown by section + cost estimate |
| `/tokens compress <file>` | Compress with all 6 strategies |
| `/tokens compress <file> --strategies s1,s2` | Specific strategies |
| `/tokens list` | Show compression strategies |

Strategies: `strip-markdown`, `collapse-repeats`, `strip-comments`, `truncate-files`, `dedup-instructions`, `compact-tables`

---

## RegForge Certification (regforge.eu)

| Command | Purpose |
|---------|---------|
| `/certify` | Certify current project (11 categories, grade A-F) |
| `/certify --category security` | Run single category |
| `/certify --html report.html` | Generate HTML report |
| `/certify history` | List past certifications |
| `/certify categories` | List all 11 audit categories |

Categories: `security`, `documentation`, `testing`, `dependencies`, `license`, `accessibility`, `privacy`, `architecture`, `seo`, `performance`, `ci-cd`

Grades: **A** (90+), **B** (75-89), **C** (60-74), **D** (40-59), **F** (<40)

Auto-generates: HTML report, Markdown report, Word-compatible report, remediation PRD (in genesis/).

---

## Industry Knowledge Engine (Domain Packs)

| Command | Purpose |
|---------|---------|
| `/domain list` | List installed packs (eu-vat, gdpr, aml-kyc) |
| `/domain explain <topic>` | Query rules with legislation citations |
| `/domain search <keywords>` | Search across all packs |
| `/domain matrix <name>` | Structured data tables |
| `/domain validate <file> --pack <name>` | Check code against domain rules |
| `/domain prd <description>` | Generate domain-aware PRD |
| `/domain cite <rule-id>` | Full citation for a specific rule |

### Installed Packs

| Pack | Rules | Coverage |
|------|-------|----------|
| `eu-vat` | 24 | Rates (12 countries), exemptions, reverse charge, OSS, invoicing |
| `gdpr` | 20 | Lawful bases, consent, rights, breach notification, DPIA, cookies, fines |
| `aml-kyc` | 20 | CDD/EDD, PEP screening, SAR, sanctions, crypto VASP, FATF |

All rules cite specific legislation articles with EUR-Lex URLs.

---

## Secret & Artifact Generator (Local, Zero Dependencies)

| Command | Purpose |
|---------|---------|
| `/generate jwt --sub X --role Y --exp 24h` | JWT token (HS256/RS256/ES256) |
| `/generate jwt --decode <token>` | Decode any JWT |
| `/generate keypair --alg RS256` | RSA or EC key pair → `.keys/` |
| `/generate apikey` | API key with `sk_` prefix |
| `/generate uuid --count 10` | UUID v4 (batch) |
| `/generate password --length 32` | Secure password |
| `/generate secret --length 64` | Random hex/base64 secret |
| `/generate hash <input> --algo scrypt` | SHA256/SHA512/scrypt hash |
| `/generate hmac --data X --secret Y` | HMAC signature |
| `/generate webhook-secret` | Webhook signing secret (`whsec_`) |
| `/generate totp` | TOTP secret for 2FA |
| `/generate env api` | `.env` template with auto-filled secrets |
| `/generate auto` | Auto-fill empty secrets in existing `.env` |

Auto-integrates with `/forge`: empty `JWT_SECRET=`, `API_KEY=`, etc. in `.env` are filled automatically.

---

## Shortcut Commands (The Forge)

> Quick-access shortcuts for common workflows. Type less, forge more.

| Shortcut | Name | What it does |
|----------|------|--------------|
| `/forge` | **Summon The Forge** | Real AI pipeline: PRDs → stories → implement (agentic loop) → T1-T6 gates → report |
| `/forge --dry-run` | Forge Dry Run | Read-only scan: check PRDs, stories, and gates without AI execution |
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
`/forge` auto-writes a scratchpad summary and persists run metadata to `.skillfoundry/runs/`.

---

## New in v2.0.10: The Forge Pipeline Engine

### The Forge — Now a Real AI Pipeline
As of v2.0.10, `/forge` is no longer a read-only scanner. It drives real AI execution through 6 phases:

1. **IGNITE**: Discovers and validates PRDs from `genesis/`
2. **PLAN**: Generates stories from PRDs via AI (or reuses existing stories in `docs/stories/`)
3. **FORGE**: Implements each story sequentially using the standalone agentic loop (`ai-runner.ts`) — up to 25 tool-use turns per story, with auto-fixer retries on T1 gate failures
4. **TEMPER**: Runs T1-T6 quality gates
5. **INSPECT**: Isolates T4 security results
6. **DEBRIEF**: Persists run metadata to `.skillfoundry/runs/{runId}.json`

Use `--dry-run` for the old read-only scan behavior. Use `--prd-file` to filter to a specific PRD.

### Architecture
- `src/core/ai-runner.ts` — Standalone multi-turn tool-use loop (zero React dependencies)
- `src/core/pipeline.ts` — 6-phase pipeline engine
- `src/commands/forge.ts` — CLI command wired to the pipeline

---

## New in v1.9.0.11: Shortcut Commands + The Forge

### The Forge (Original)
The 46-agent team was originally called **The Forge** — cold-blooded agents forging production code. Starting from v2.0.10, `/forge` executes the full AI-powered pipeline end-to-end.

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

## Session Monitor (v2.0.66)

Real-time PostToolUse hook detecting erratic agent behavior:

| Detector | Triggers On | Action |
|----------|------------|--------|
| Source .env | `source .env` / `. .env` | Block + safe alternative |
| 2-Failure Rule | 2+ consecutive similar errors | Diagnostic nudge |
| Restart loops | Service restarted 2+ times | Force log read first |
| Self-inflicted | Error in agent-modified file | Log + flag |
| No-log restart | `pm2 restart` without `pm2 logs` | Nudge to read logs |

Install: `scripts/setup-auto-harvest.sh`

---

*SkillFoundry Framework v2.0.77 - March 2026 - The Forge Pipeline Engine (53 Core Agents / 60 Skills)*

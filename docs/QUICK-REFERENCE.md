# Claude AS v1.9.0.6 - Quick Reference Card

**Version Format:** MAJOR.FEATURE.DATABASE.ITERATION (1=breaking, 9=features, 0=db, 0=patches)

## The Dream Team (46 Agents)

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
├── .claude/commands/      # 46 skills
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
| Need rollback | `/go --rollback` |

---

## Platform Invocation

| Platform | Syntax |
|----------|--------|
| Claude Code | `/command` |
| Copilot CLI | `task("agent", "prompt")` |
| Cursor | "use [agent] rule" |

---

*Claude AS Framework v1.9.0.6 - February 2026 - 46 Agents*

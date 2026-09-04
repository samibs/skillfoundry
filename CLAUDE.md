# CLAUDE.md — SkillFoundry Framework Project Instructions

> For universal AI agent rules (security, testing, LLM guardrails, workflow preferences): see `~/.claude/CLAUDE.md`
> For production operations (PM2, caching, APM, migrations, incident response): see `docs/enterprise-standards.md`
> For AI-specific security anti-patterns: see `docs/ANTI_PATTERNS_DEPTH.md` and `docs/ANTI_PATTERNS_BREADTH.md`
> For environment pre-flight discipline (interpreter pinning, .env safety, diagnostic mode): see `agents/_env-preflight-protocol.md`
> For codebase comprehension pre-flight (Code Map: contract surface, import graph, DB/layer map — runs before implementing): see `agents/_codemap-preflight-protocol.md`
> For coding discipline (think-before-code, simplicity, surgical changes, goal-driven execution): see `agents/_coding-discipline.md`
> For delivery efficiency (delivery budgets, risk-based validation, evidence reuse, test scopes, stop conditions): see `agents/_delivery-efficiency.md`
> For parallel/multi-agent execution, dependency waves, git worktree isolation, process ownership, evidence, provenance, and the machine-readable `.ai/` ledger: see `MULTI_AGENT_PROTOCOL.md` (operational module: `agents/_governed-mission-protocol.md`)

This file contains **framework-specific** rules only. General agent behavior is inherited from the global CLAUDE.md.

---

## Philosophy

- **Cold-blooded logic over flattery**: No vague encouragement or optimistic assumptions — honest, structured, production-ready evaluations only.
- **ONLY REAL LOGIC**: No placeholders, no TODOs, no mocks, no stubs, no "coming soon", no fake data. Every feature must work end-to-end with real implementations.
- **Three-Layer Completeness**: Every feature must be verified across DATABASE → BACKEND → FRONTEND before it's considered done.
- **PRD-First Development**: Every non-trivial feature starts with a Product Requirements Document. No PRD = no implementation.
- **Implement > Test > Iterate**: Every feature must be tested before being considered done.
- **Never break existing features**: New features must not cause regressions.
- **Document everything**: All modules and changes must include developer- and user-level documentation.
- **Clean project structure**: When work is complete, organize files properly — root folder contains only essentials.

---

## Mandatory Production Rules

These rules apply to **every** project built with SkillFoundry. No exceptions, no opt-out.

### UI/Layout Rules

- **Consistent page width**: All pages MUST use the same `max-width` container. No page should be wider or narrower than others regardless of content. Use a shared layout wrapper (e.g., `max-width: 1200px; margin: 0 auto;` or Tailwind `container mx-auto`).
- **Responsive and mobile-friendly**: Every page MUST work on mobile (320px), tablet (768px), and desktop (1200px+). Use `<meta name="viewport" content="width=device-width, initial-scale=1.0">` in every HTML file. Test at all three breakpoints before shipping.
- **No horizontal scrolling**: No page should ever produce horizontal scroll on any viewport size.

### Documentation Rules

- **README.md is user-friendly**: README is for USERS — installation, usage, screenshots, quick start. Write it as if the reader has never seen the project. No internal architecture details, no contributor workflows, no raw API schemas.
- **CHANGELOG.md is technical**: All technical details (breaking changes, migration steps, API changes, dependency updates, internal refactoring) go in CHANGELOG, not README. CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/) format.
- **Separation is mandatory**: If README contains architecture diagrams, database schemas, or implementation details — move them to `docs/`. README stays clean and user-facing.

### Deployment & Rebuild Protocol

When rebuilding or redeploying any Next.js / Node.js application, ALWAYS follow this sequence:

```bash
# 1. Pull latest code
git pull

# 2. Clean build artifacts (Next.js cache causes stale bundles)
rm -rf .next node_modules/.cache

# 3. Install dependencies (in case lockfile changed)
npm ci

# 4. Rebuild
npm run build

# 5. Restart the process manager
pm2 restart <app-name>
# OR: systemctl restart <service>
# OR: docker compose up -d --build

# 6. Verify deployment
curl -s http://localhost:<port>/health | head -1

# 7. Hard refresh in browser (Ctrl+Shift+R) to clear old bundles
```

**NEVER** skip step 2 (clean). Stale `.next` cache is the #1 cause of "it works locally but not in production" bugs.

### Notification Rules

- **Commit notifications**: When committing code, notify the developer/admin. In projects with CI/CD, this is handled by GitHub/GitLab webhooks. For PM2-managed projects, use the post-commit hook or the `/generate webhook-secret` + webhook integration.
- **Deployment notifications**: When an app is redeployed, send a notification (Slack, email, or webhook) confirming the deployment succeeded and the health check passed.

### Database & API Rules

- **One naming convention per project**: Pick ONE and enforce it everywhere.
  - PostgreSQL → `snake_case` (tables, columns, indexes, constraints)
  - SQLite → `snake_case`
  - MSSQL → `PascalCase`
  - MySQL → `snake_case`
  - NEVER mix `camelCase`, `snake_case`, and `PascalCase` in the same schema.
- **Check the DB type before writing schema**: Do NOT write `SERIAL` or `JSONB` (PostgreSQL) when the project uses SQLite. Do NOT write `AUTOINCREMENT` (SQLite) when targeting PostgreSQL. Read `package.json`, `docker-compose.yml`, or `.env` to determine the actual database.
- **Default all arrays to `[]`**: API response fields that are arrays MUST default to `[]`, never `undefined` or `null`. In TypeScript, use `field: Type[] = []` in interfaces and `(data.field ?? [])` before calling `.some()`, `.map()`, `.filter()`, `.reduce()`, `.find()`, `.every()`.
- **No `.method()` on nullable arrays**: NEVER call array methods on a field that could be `undefined`. Always guard: `(items ?? []).filter(...)` or `items?.filter(...) ?? []`.

### Frontend-Backend Contract Rule (CRITICAL)

**BEFORE writing ANY frontend API call, READ the actual backend endpoint code.** This is the #1 vibe-coding failure: the LLM builds frontend and backend that don't agree on data shapes, endpoint paths, or request formats. Each layer works in isolation but breaks when connected.

- VERIFY: endpoint path exists, HTTP method matches, request body schema matches, response shape matches
- Write TypeScript interfaces from the REAL backend response, not an assumed shape
- If backend returns `options: string[]`, don't write frontend expecting `options: [{id, text}]`
- If backend route is `/modules/{id}`, don't write `fetch('/modules/{id}/quiz')`

### Full Deviation Catalog

See `agents/_known-deviations.md` for the complete list of **171 known LLM failure patterns** organized across 16 categories including Frontend-Backend Contract Mismatches, Authorization, Silent Logic Failures, Supply Chain, and Performance. All agents reference this catalog.

---

## Genesis-First Development Workflow

The key differentiator in structured AI-assisted development is the PRD (Product Requirements Document). PRDs eliminate "vibe coding" by forcing clarity before implementation.

**All projects begin in the `genesis/` folder.**

### The Genesis Workflow

```
1. CREATE PRDs in genesis/
   └─ /prd "your feature"    → Saved to genesis/
   └─ Or manually create     → genesis/my-feature.md

2. RUN /go
   └─ Validates all PRDs
   └─ Generates stories
   └─ Implements everything
   └─ Validates all layers
   └─ Produces production code

That's it. Two steps.
```

### PRD Location: genesis/

```
genesis/                                  ← THE starting point
├── TEMPLATE.md                          # PRD template
├── 2026-01-16-user-authentication.md    # Your PRDs
├── 2026-01-17-payment-integration.md
└── notification-service.md
```

### Story Location: docs/stories/

```
docs/stories/
├── user-authentication/
│   ├── INDEX.md                  # Story overview + dependency graph
│   ├── STORY-001-auth-models.md
│   ├── STORY-002-login-api.md
│   └── ...
└── payment-integration/
    └── ...
```

### Key Commands

| Command | Purpose |
|---------|---------|
| `/go` | **THE main command** - Implement all PRDs from genesis/ |
| `/go --validate` | Only validate PRDs, don't implement |
| `/go [prd-file]` | Implement specific PRD |
| `/prd "idea"` | Create new PRD (saved to genesis/) |
| `/layer-check` | Validate three layers |

### PRD Quality Gates

Before a PRD is approved:
- [ ] Problem statement is concrete and measurable
- [ ] All user stories have acceptance criteria
- [ ] Security requirements explicitly defined
- [ ] Out of scope items explicitly listed
- [ ] No TBD/TODO markers remain
- [ ] Risks identified with mitigations

### Story Quality Gates

Before a story is ready for implementation:
- [ ] Self-contained (developer needs no external context)
- [ ] Technical approach specified with code patterns
- [ ] Acceptance criteria in Gherkin format
- [ ] Dependencies on other stories documented
- [ ] Security checklist included

---

## Three-Layer Enforcement & Zero Tolerance Policy

**CRITICAL: Every feature must be REAL across all layers. No exceptions.**

### ONLY REAL LOGIC - ABSOLUTE REQUIREMENT

**NO PLACEHOLDER. NO TODO. NO MOCK. NO STUB. NO "COMING SOON". NO PLACEHOLDER CONTENT. ONLY REAL, WORKING, PRODUCTION-READY LOGIC.**

Every line of code must:
- Execute real business logic
- Connect to real APIs and databases
- Handle real data transformations
- Implement real error handling
- Provide real user feedback

If you cannot implement something fully, **ASK** - do not leave fake code behind.

### Zero Tolerance Banned Patterns

These patterns trigger **IMMEDIATE REJECTION**:

| Pattern | Why Banned |
|---------|------------|
| `TODO`, `FIXME`, `HACK`, `XXX` | Incomplete work markers |
| `PLACEHOLDER`, `STUB`, `MOCK` (in prod) | Fake implementations |
| `COMING SOON`, `NOT IMPLEMENTED` | Unfinished features |
| `WIP`, `TEMPORARY`, `TEMP` | Non-production code |
| `Lorem ipsum` | Placeholder content |
| `NotImplementedError` / `NotImplementedException` | Empty implementations |
| Empty function bodies | No-op code |
| `@ts-ignore` without justification | Type evasion |
| Hardcoded credentials | Security violation |
| `// will implement later` | Deferred work |
| `pass` (Python) without logic | Empty placeholder |
| `throw new Error("Not implemented")` | Fake implementation |
| `console.log("TODO")` | Debug placeholder |
| `return null // placeholder` | Incomplete returns |
| `/* stub */`, `/* fake */` | Marker for fake code |

### Three-Layer Validation

Every full-stack feature must pass ALL affected layers:

```
┌─────────────┬──────────────────────────────────────────────┐
│ DATABASE    │ Migration works, schema matches PRD,         │
│             │ rollback tested, constraints in place        │
├─────────────┼──────────────────────────────────────────────┤
│ BACKEND     │ All endpoints work, tests pass, auth/authz  │
│             │ enforced, input validation complete          │
├─────────────┼──────────────────────────────────────────────┤
│ FRONTEND    │ REAL API connected (NO MOCKS), all UI        │
│             │ states implemented, accessible               │
└─────────────┴──────────────────────────────────────────────┘
```

### Iteration Gates (Every Story)

| Gate | Requirements |
|------|--------------|
| **Documentation** | Public APIs documented, code comments explain WHY |
| **Security** | No secrets, input validation, auth verified, no data in logs |
| **Audit** | Commit references story, review done, coverage maintained |

### Enforcement Commands

| Command | Purpose |
|---------|---------|
| `/layer-check` | Full three-layer validation |
| `/layer-check db` | Database layer only |
| `/layer-check backend` | Backend layer only |
| `/layer-check frontend` | Frontend layer only |
| `/layer-check scan` | Banned pattern scan |

### Three-Layer Completion Verification (MANDATORY)

**Before ANY feature is considered "done", verify ALL three layers:**

```
LAYER 1: DATABASE
 □ Schema/migrations created and applied
 □ Constraints, indexes, foreign keys in place
 □ Seed data (if needed) is REAL, not placeholder
 □ Rollback script tested

LAYER 2: BACKEND
 □ All endpoints implemented with REAL logic
 □ Database queries execute against REAL schema
 □ Authentication/authorization enforced
 □ Input validation complete
 □ Error handling returns proper HTTP codes and messages
 □ Tests pass with REAL database (not mocked)

LAYER 3: FRONTEND
 □ UI connected to REAL backend API (NO MOCK DATA)
 □ All states implemented (loading, error, empty, success)
 □ Forms submit to REAL endpoints
 □ Error messages from backend displayed properly
 □ Accessible (a11y) and responsive
```

**A mock is a lie. A TODO is a promise to fail. Zero tolerance.**

---

## Project Completion & Cleanup Protocol

**When ALL features are implemented and verified, perform mandatory cleanup:**

### Root Folder Hygiene

```
KEEP in root:
├── README.md
├── CLAUDE.md
├── .env.example
├── .gitignore
├── package.json / requirements.txt / *.csproj
├── docker-compose.yml (if applicable)
└── Makefile / justfile (if applicable)

MOVE to appropriate folders:
├── docs/          ← All .md documentation (except README)
├── scripts/       ← Shell scripts, automation, one-offs
├── config/        ← Configuration files
├── logs/          ← Log files (add to .gitignore)
└── .dev/          ← Development-only files

DELETE:
├── *.tmp, *.bak, *.old
├── node_modules/.cache (rebuild on install)
├── __pycache__, *.pyc
├── .DS_Store, Thumbs.db
├── Unused test files
└── Any AI-generated garbage
```

### Cleanup Verification

Before final commit:
- [ ] Root folder contains ONLY essential project files
- [ ] All documentation organized in `docs/`
- [ ] All scripts organized in `scripts/`
- [ ] No temporary or backup files remain
- [ ] `.gitignore` updated to exclude generated artifacts

---

## Autonomous Developer Loop

When autonomous mode is active (`.claude/.autonomous` flag file exists in the project), Claude operates as a fully autonomous developer:

1. **Every user input is classified** — FEATURE, BUG, REFACTOR, QUESTION, OPS, or MEMORY
2. **The correct pipeline executes automatically** — no manual `/command` invocation needed
3. **Results are presented for review** — user approves, rejects, or adjusts at the end
4. **Knowledge is recorded** — decisions, facts, and errors written to `memory_bank/`
5. **Knowledge syncs to GitHub** — the Knowledge Sync Daemon pushes to a global knowledge repo

### Protocol Files

| File | Purpose |
|------|---------|
| `agents/_autonomous-protocol.md` | Routing rules, execution pipeline, review format |
| `agents/_intent-classifier.md` | Classification examples, edge cases, confidence thresholds |
| `.claude/commands/autonomous.md` | `/autonomous` toggle on/off/status |
| `scripts/knowledge-sync.sh` | Daemon: init, start, stop, sync, register, promote |
| `scripts/sanitize-knowledge.sh` | Strip secrets, normalize paths, validate JSON |
| `scripts/session-init.sh` | Pull global knowledge, start sync daemon |
| `scripts/session-close.sh` | Harvest memory, force sync, stop daemon |

### Session Lifecycle (Autonomous Mode)

```
SESSION START:
  → Run scripts/session-init.sh (pull global knowledge, start sync daemon)
  → Load memory_bank/ into context
  → Autonomous protocol activates

DURING SESSION:
  → Every input auto-classified and routed
  → Pipelines execute fully, review at end
  → memory_bank/ updated with decisions/facts/errors
  → Sync daemon pushes to GitHub on interval

SESSION END:
  → Run scripts/session-close.sh (harvest, final sync, stop daemon)
  → Lessons promoted if patterns repeat 3+ times
```

### Quick Start

```bash
# One-time setup: configure the global knowledge repo
./scripts/knowledge-sync.sh init https://github.com/user/dev-memory.git

# Enable autonomous mode in any project
/autonomous on

# Just type what you want — Claude handles the rest
"add dark mode to the dashboard"  → FEATURE pipeline
"the login is broken"             → BUG pipeline
"clean up the auth module"        → REFACTOR pipeline
"how does the payment flow work?" → QUESTION (read-only)
```

---

## Governed Missions & Multi-Agent Execution

When work must be **provably** done — not merely finished — it runs as a governed mission.
Full protocol: `MULTI_AGENT_PROTOCOL.md`. Enforcement: `/mission` (see `.claude/commands/mission.md`).

### When it applies

Two or more write-capable agents running concurrently · `/go` dispatching multiple stories ·
`/forge` delegating a phase to a parallel worker · autonomous parallel execution · the user
asking for parallel agents · multiple PRDs with cross-dependencies · work destined for
publication to a shared branch.

It does **not** apply to a trivial single-agent edit. See **Skill Scope Boundaries** below —
the overhead must not exceed the value.

### Non-negotiable

- **Claude MUST NOT allow two writers to share a worktree.** One worker = one bounded mission =
  one git-native worktree = one branch. A copied repository folder is not a worktree; only
  `git worktree list --porcelain` proves it.
- **No source writes before a PASS attestation** (`/mission attest` → `/mission gate`).
- **Never modify product code to compensate for a broken environment.** Classify the defect
  origin first — an `ENVIRONMENT_DEFECT` is never fixed by editing product source.
- **Never broadly kill** `all node` / `all dotnet` / `all python` / `all docker`. Verify process
  ownership; PIDs are recycled.
- **Never claim "probably pre-existing"** without a baseline run at the accepted baseline SHA.
- **Do not hand-write `.ai/*.json`.** The CLI writes and validates it; direct edits are flagged
  by `/mission reconcile`.

### The durable record

`.ai/` survives the agent. A replacement worker with zero chat history reconstructs project
state from **git + ledger + attestations + patches + evidence** rather than trusting the
previous agent's conversation.

```text
IMPLEMENTED is not VERIFIED.
A commit is not acceptance.
An integration is not a publication.
A publication without remote verification is not proven.
Parallel implementation is not parallel merging.
```

---

## Delivery Efficiency

> Canonical policy: `agents/_delivery-efficiency.md`. Enforcement: `/delivery`.

**Do not perform more engineering activity than is necessary to prove the requested change
correct.** A shorter execution is not automatically better; a longer one is not
automatically safer.

Before implementing, classify the task's **delivery budget** (LOW / MEDIUM / HIGH) and
follow the execution policy it selects. Then:

- **Consume shared context first.** Prefer facts the mission already established — base
  commit, architecture, changed files, acceptance criteria — over rediscovering them.
- **Reuse valid evidence.** Already proven against this exact repository state means do
  not prove it again. Already *failed* against it means fix the cause, not re-run.
- **Scope tests to the change.** `full` is never chosen from the budget alone. A LOW task
  does not trigger the repository-wide suite.
- **Escalate only with evidence.** Targeted tests failing → diagnose → fix → targeted
  tests pass → stop. A successful fix is not grounds for a full-suite run.
- **Stop when proven.** Once implementation, acceptance, required validation, diff review
  and evidence are all satisfied, stop. Do not re-read the same unchanged diff or perform
  unrequested cleanup.

**Never optimized away:** authentication, authorization, secrets, cryptography, destructive
database changes, schema migrations, production deployment, financial integrity,
compliance controls. These classify HIGH; a downgrade override is refused.

---

## Skill Scope Boundaries

Skills are scoped tools, not global policies. When a skill is invoked, ONLY that skill's rules are active. When it finishes, its rules deactivate. Violating this causes instruction creep — heavyweight rules applied to trivial tasks.

### Rule 1: Activation and Deactivation

A skill's instructions are active **only** between its explicit invocation (`/skill-name`) and the delivery of its output. After output, the skill's rules no longer apply to subsequent work.

```
/security audit         ← security rules ACTIVATE
  ... audit runs ...
  ... output delivered  ← security rules DEACTIVATE
Fix the typo in README  ← security rules DO NOT apply here
```

If a pipeline skill (e.g., `/forge`) calls sub-skills internally, those sub-skill rules apply only within that pipeline step, not to the entire session.

### Rule 2: Global vs Skill-Local Rules

**Global rules** (always apply, regardless of active skill):
- No hardcoded secrets or credentials in code
- No `@ts-ignore` without justification
- No silent failures — log all errors
- Input validation at system boundaries
- BPSBS standards from `~/.claude/CLAUDE.md`

**Skill-local rules** (apply ONLY when that skill is explicitly active):

| Skill | Scoped Rules | NEVER Apply To |
|-------|-------------|----------------|
| `/forge` | 6-phase pipeline, Anvil T1-T6 gates, story decomposition | Single-file edits, README changes, quick fixes |
| `/go` | PRD validation, state machine, wave execution | One-off tasks, questions, config changes |
| `/security` | STRIDE modeling, OWASP checklist, CVSS scoring | Documentation, logging, non-security code |
| `/tester` | 14 test categories, 80% coverage, coverage matrix | README examples, config files, documentation |
| `/auto` | Intent classification, pipeline routing | Direct questions, read-only exploration |
| `/layer-check` | Three-layer DB→Backend→Frontend validation | Changes that don't touch all three layers |
| `/mission` | Governed missions: `.ai/` ledger, attestation, evidence gating, wave planning, process ownership | Single-file edits, trivial fixes, questions, config tweaks |
| `/delivery` | Delivery budgets, scoped validation, evidence reuse, stop conditions | Deciding *what* to build; it decides how much validation the change warrants |

### Rule 3: Complexity-Based Scope

Not every task needs every skill. Match the tool to the task size.

| Task Size | Examples | Appropriate Response |
|-----------|----------|---------------------|
| **Trivial** (1 file, <10 lines) | Typo fix, config tweak, log line | Direct edit. No pipeline, no gates, no audit. |
| **Small** (1-3 files, <100 lines) | Bug fix, minor feature, doc update | Targeted skill only. Skip orchestration overhead. |
| **Medium** (3-10 files) | New endpoint, component, module | Core pipeline. Optional security/test phases. |
| **Large** (10+ files, multi-story) | Full feature, new service | Full `/forge` or `/go` pipeline with all phases. |
| **Parallel** (2+ concurrent writers) | Multi-agent wave, cross-PRD work | `/mission` governed protocol on top of the pipeline. Worktree isolation is mandatory. |

**The test**: Would invoking this skill produce *useful, proportionate* output for this task? If the overhead exceeds the value, the skill is out of scope.

### Rule 4: Exempt Contexts

These contexts are **always exempt** from heavyweight skill rules:

| Context | Exempt From | Reason |
|---------|-------------|--------|
| Documentation (README, CHANGELOG, docs/) | `/tester` coverage requirements, `/security` threat models | Docs aren't production code |
| Housekeeping (version bump, sync, commit) | `/forge` pipeline, `/go` story decomposition | Mechanical tasks, not features |
| Direct questions ("how does X work?") | All pipeline skills | Read-only, no code changes |
| Config files (.gitignore, tsconfig, etc.) | `/security` zero-tolerance patterns | Config isn't application code |
| Comments and docstrings | Banned pattern scan (TODO in comments is acceptable) | Comments describe intent, not production logic |

### Rule 5: No Retroactive Scope Expansion

When a skill finishes, do NOT retroactively apply its standards to unrelated prior work in the same session. Example: running `/security audit` should not trigger re-evaluation of a README edit made 10 messages earlier.

### Anti-Pattern Examples

**BAD: Security bleeds into documentation**
```
User: "Fix the typo in README.md"
Agent: *Runs STRIDE threat model on README change*
Agent: *Demands OWASP checklist for markdown edit*
```

**GOOD: Scoped response**
```
User: "Fix the typo in README.md"
Agent: *Fixes typo. Done.*
```

**BAD: Tester bleeds into config change**
```
User: "Add .claude/social-media.json to .gitignore"
Agent: *Demands 14 test categories and coverage matrix for .gitignore edit*
```

**GOOD: Proportionate response**
```
User: "Add .claude/social-media.json to .gitignore"
Agent: *Adds line. Done.*
```

---

## AI/LLM Loop & Duplication Guard

AI/LLMs must check for and eliminate duplicate code blocks before suggesting or committing changes. Duplication can occur due to context resets or partial memory loss.

> **If context is partially restored, LLM must perform a structural diff with existing files and explicitly prevent duplication.**

---

_Last Updated: 2026-07-11_

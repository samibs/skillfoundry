# CLAUDE.md — Claude AS Framework Project Instructions

> For universal AI agent rules (security, testing, LLM guardrails, workflow preferences): see `~/.claude/CLAUDE.md`
> For production operations (PM2, caching, APM, migrations, incident response): see `docs/enterprise-standards.md`
> For AI-specific security anti-patterns: see `docs/ANTI_PATTERNS_DEPTH.md` and `docs/ANTI_PATTERNS_BREADTH.md`

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

## The Illusion of Control: Why Prompt Memory Matters

> "Alex believes he's in control... but he's not. It's the illusion of free will." — RoboCop (2014)

In modern AI-assisted development, developers often believe they are guiding the coding agent. But after a few prompts, resets, or context shifts, the LLM starts making decisions on its own, based on generic defaults — not personal rules, styles, or best practices.

This file, along with the behavioral memory system that reads it, exists to prevent that. AI agents drift unless continuously reinforced. Prompt behavior must be injected and refreshed to maintain alignment with the developer's intent.

---

## AI/LLM Loop & Duplication Guard

AI/LLMs must check for and eliminate duplicate code blocks before suggesting or committing changes. Duplication can occur due to context resets or partial memory loss.

> **If context is partially restored, LLM must perform a structural diff with existing files and explicitly prevent duplication.**

---

_Last Updated: 2026-02-08_

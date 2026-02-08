# CLAUDE.md Summary (Context-Optimized)

> This is the condensed version (~2K tokens) for active context. Full details: CLAUDE.md

---

## Philosophy (Core)

- **ONLY REAL LOGIC**: No placeholders, TODOs, mocks, stubs, "coming soon"
- **Three-Layer Completeness**: Every feature verified across DB → Backend → Frontend
- **PRD-First**: All projects start in `genesis/` folder
- **Cold-Blooded**: No flattery, no assumptions, production-ready only
- **Zero Tolerance**: Banned patterns trigger immediate rejection

---

## Banned Patterns (Auto-Reject)

```
TODO, FIXME, HACK, XXX, PLACEHOLDER, STUB, MOCK, COMING SOON,
NOT IMPLEMENTED, WIP, TEMPORARY, TEMP, Lorem ipsum,
NotImplementedError, NotImplementedException, empty function bodies,
@ts-ignore (without justification), hardcoded credentials,
pass (Python without logic), throw new Error("Not implemented")
```

---

## Genesis Workflow

```
1. CREATE PRD: /prd "feature" → saves to genesis/
2. IMPLEMENT: /go → validates PRDs, generates stories, implements all
3. VALIDATE: /layer-check → confirms DB + Backend + Frontend
```

---

## Three-Layer Checklist

| Layer | Must Have |
|-------|-----------|
| **DATABASE** | Migration works, rollback tested, constraints in place |
| **BACKEND** | Endpoints work, tests pass, auth enforced, input validated |
| **FRONTEND** | REAL API (no mocks), all states, accessible, responsive |

---

## Security Essentials

- No tokens in localStorage (memory only for SPAs)
- Refresh tokens: HttpOnly + Secure + SameSite=Strict cookies
- JWT: RS256/ES256 only, validate all claims
- Credentials: 600 permissions, excluded from git
- LoggerService: Sanitize all sensitive data before logging

---

## Production Scripts Required

```
scripts/
├── start-production.sh
├── stop-production.sh
├── restart-production.sh
└── status-production.sh
```

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `/go` | Main orchestrator - PRD to production |
| `/prd` | Create new PRD |
| `/layer-check` | Validate three layers |
| `/context` | Manage context budget |
| `/swarm` | Swarm coordination management |
| `/explain` | Explain last agent action |
| `/undo` | Revert last reversible action |
| `/cost` | Token usage report |
| `/health` | Framework self-diagnostic |
| `/go --compliance=hipaa` | Enable HIPAA compliance rules |

---

## Agent Behavior Rules

1. Check path validity before commands
2. Use absolute paths
3. Never assume file/folder existence
4. Wrap modifications with `// AI MOD START` / `// AI MOD END`
5. If repeating broken logic: output "Suggest Human Review"
6. Summarize outputs (<500 tokens for sub-agent returns)
7. Update scratchpad after major actions

---

## Context Discipline

- **Before acting**: Do I have minimum context needed?
- **After acting**: Summarize, update scratchpad, flag unneeded context
- **Always**: Prefer concise outputs, reference files by path

---

## Current Session Scratchpad

```
### Focus: [Current story/task]
### Phase: [Current phase]
### Progress: [Checklist]
### Decisions: [Key choices made]
### Blockers: [Open issues]
### Files Modified: [List]
```

---

## Load More Context

For detailed requirements, load specific sections:
- Security details: `/context load security`
- Migration strategy: `/context load migrations`
- Full standards: Read CLAUDE.md directly

---

---

## Framework Evolution (v1.8.0 - v1.9.0)

- **Knowledge Exchange**: Cross-project knowledge harvesting and promotion
- **Swarm Mode**: Self-organizing agent coordination (alternative to wave dispatch)
- **DX Tooling**: `/explain`, `/undo`, `/cost`, `/health` commands
- **Advanced Intelligence**: Semantic search, monorepo support, compliance presets (HIPAA/SOC2/GDPR)
- **46 Agents** across triple platform (Claude Code, Copilot CLI, Cursor)

---

_Full reference: CLAUDE.md (2000+ lines) | This summary: ~400 lines | Framework v1.9.0.5_

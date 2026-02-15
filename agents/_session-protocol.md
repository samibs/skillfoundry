# Session & Decision Logging Protocol v1.0.0

> Shared module for mandatory session lifecycle and decision capture.
> Referenced by: ALL agents via `_agent-protocol.md`

---

## Purpose

Every agent session MUST be recorded. Every significant decision MUST be logged with rationale. This protocol ensures the framework captures not just WHAT was built, but WHY each choice was made.

---

## Session Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                     SESSION LIFECYCLE                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────┐    ┌───────────┐    ┌─────────┐    ┌─────────────┐  │
│  │  START   │───▶│  ACTIVE   │───▶│ CLOSING │───▶│    END      │  │
│  │         │    │           │    │         │    │             │  │
│  │ baseline │    │ log events│    │ summary │    │ attribution │  │
│  │ session  │    │ decisions │    │ outcome │    │ harvest     │  │
│  │ recorder │    │ file ops  │    │ gate    │    │ trailers    │  │
│  └─────────┘    └───────────┘    └─────────┘    └─────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: START

When an agent begins work, perform these steps in order:

### 1.1 Create Attribution Baseline
```bash
./scripts/attribution.sh baseline --session=$SESSION_ID
```
Snapshots the working tree state so attribution can be calculated later.

### 1.2 Start Session Recording
```bash
./scripts/session-recorder.sh start --agent=$AGENT --story=$STORY --session=$SESSION_ID
```
Creates the session entry and begins logging.

### 1.3 Create Checkpoint (optional, recommended for stories)
```bash
./scripts/checkpoint.sh create "before $STORY"
```
Creates a rewindable save point.

---

## Phase 2: ACTIVE - During Agent Work

### 2.1 Log Events
Record significant actions:
```bash
./scripts/session-recorder.sh log --event="Running tests" --detail="12 test files"
./scripts/session-recorder.sh log --event="Anvil Tier 3 passed"
```

### 2.2 Record File Operations
Track which files the agent reads, creates, or modifies:
```bash
./scripts/session-recorder.sh file --action=read --path=src/auth/types.ts
./scripts/session-recorder.sh file --action=create --path=src/auth/jwt.ts
./scripts/session-recorder.sh file --action=modify --path=src/auth/index.ts
```

### 2.3 Record Decisions (MANDATORY)
**Every agent MUST log decisions when they:**

| Trigger | Example |
|---------|---------|
| Choose between alternatives | RS256 vs HS256 for JWT |
| Make security-relevant choices | HttpOnly cookies vs localStorage |
| Select architecture patterns | Repository pattern vs direct queries |
| Deviate from PRD requirements | Simplified scope due to constraints |
| Choose libraries/dependencies | bcrypt vs argon2 for hashing |
| Design data models | Normalized vs denormalized schema |

### Decision Record Format

```bash
./scripts/session-recorder.sh decision \
    --what="Used RS256 for JWT signing" \
    --why="Asymmetric keys allow public key verification without exposing signing secret" \
    --alternatives="HS256 (shared secret exposure risk),ES256 (less library support)" \
    --confidence=0.9 \
    --prd-req=FR-003
```

### Decision Fields

| Field | Required | Description |
|-------|----------|-------------|
| `what` | Yes | What was decided (concise, factual) |
| `why` | Yes | Why this choice was made (rationale) |
| `alternatives` | Recommended | What was rejected and why (comma-separated) |
| `confidence` | Recommended | 0.0-1.0 confidence score |
| `prd_requirement` | Optional | PRD requirement this decision addresses |

### Minimum Decision Requirements

| Agent | Minimum Decisions Per Story |
|-------|----------------------------|
| Architect | 2+ (architecture, data model) |
| Coder | 1+ (implementation pattern or library choice) |
| Tester | 1+ (testing strategy or coverage approach) |
| Security | 1+ (security control or mitigation) |
| Fixer | 1+ (remediation approach) |

---

## Phase 3: CLOSING

### 3.1 End Session
```bash
./scripts/session-recorder.sh end --outcome=success --gate=anvil-pass
```

### 3.2 Calculate Attribution
```bash
./scripts/attribution.sh calculate --session=$SESSION_ID
```

---

## Phase 4: END (Post-Session)

### 4.1 Harvest Decisions to Memory
The `/gohm` (Go Harvest Memory) command or automatic harvest extracts decisions from session records:

```
Session Record → decisions[] → memory_bank/knowledge/decisions.jsonl
```

### 4.2 Append Commit Trailers
When committing, follow `_commit-trailers.md` to embed session metadata in the commit.

---

## Decision Quality Standards

### Good Decision Record
```json
{
  "what": "Used bcrypt for password hashing with cost factor 12",
  "why": "Industry standard, built-in salt generation, configurable work factor. Cost 12 balances security vs login latency (~250ms).",
  "alternatives_rejected": ["argon2 (requires native bindings, deployment complexity)", "scrypt (slower, less tooling support)"],
  "confidence": 0.9,
  "prd_requirement": "FR-003"
}
```

### Bad Decision Record (would be flagged)
```json
{
  "what": "Used bcrypt",
  "why": "It's common"
}
```
Missing: alternatives, confidence, PRD reference. WHY is vague.

---

## Integration Points

| Component | Integration |
|-----------|-------------|
| `scripts/session-recorder.sh` | Records all session events and decisions |
| `scripts/attribution.sh` | Baseline + calculate for attribution tracking |
| `scripts/checkpoint.sh` | Save points before risky operations |
| `agents/_commit-trailers.md` | Embeds session metadata in commits |
| `agents/_metrics-system.md` | Session data feeds metrics collection |
| `scripts/harvest.sh` | Extracts decisions from session records |
| `/replay --show` | Displays session timeline and decisions |
| `/analytics` | Aggregates session data for trends |

---

## Session Storage

```
logs/sessions/
├── 2026-02-15/
│   ├── session-20260215_143000_a1b2c3d4.jsonl
│   └── session-20260215_160000_e5f6g7h8.jsonl
└── 2026-02-16/
    └── session-20260216_090000_i9j0k1l2.jsonl
```

Each session file is append-only JSONL with event types:
- `session_start` - Session metadata and starting state
- `event` - General events (test runs, deployments, etc.)
- `decision` - Architectural/technical decisions with rationale
- `file_op` - File read/create/modify operations
- `session_end` - Outcome, gate result, summary counts

---

## For Agent Authors

When creating or modifying agents, add this to the agent's instructions:

```markdown
## Session Protocol (Required)

**Include**: See `agents/_session-protocol.md` for full protocol.

### Quick Reference
- **Session Start**: Attribution baseline + session recorder start
- **During Work**: Log decisions (MANDATORY), file operations, events
- **Session End**: Record outcome + calculate attribution
- **Minimum**: At least 1 decision record per story
```

---

*Session & Decision Logging Protocol v1.0.0 - Claude AS Framework*

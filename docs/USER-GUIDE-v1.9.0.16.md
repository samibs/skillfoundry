# Claude AS Framework v1.9.0.16 — User Guide

> **Competitive Leap** — 17 stories, 7 new scripts, 37 compliance checks, 62 A2A agent cards, CI/CD infrastructure.

---

## Table of Contents

1. [Cost-Aware Agent Routing](#1-cost-aware-agent-routing)
2. [Self-Improving Quality Rules](#2-self-improving-quality-rules)
3. [A2A Protocol Agent Cards](#3-a2a-protocol-agent-cards)
4. [Arena Mode — Competitive Agent Evaluation](#4-arena-mode--competitive-agent-evaluation)
5. [Compliance-as-Code Pipeline](#5-compliance-as-code-pipeline)
6. [Agent Attribution & Session Recording](#6-agent-attribution--session-recording)
7. [CI/CD — GitHub Actions](#7-cicd--github-actions)
8. [Quick Reference](#8-quick-reference)
9. [Security Fixes](#9-security-fixes)

---

## 1. Cost-Aware Agent Routing

**Script:** `scripts/cost-router.sh`

Routes agents to the right model tier (Haiku / Sonnet / Opus) based on task complexity — saving money on simple tasks, reserving Opus for critical ones.

### Commands

| Command | Purpose |
|---------|---------|
| `init` | Create default routing config |
| `assess <agent> <description>` | Assess task complexity (low/medium/high/critical) |
| `route <agent> <complexity>` | Get model tier for a given complexity level |
| `config` | Show current routing configuration |
| `stats` | Show routing statistics |

### Complexity Tiers

| Complexity | Tier | Model Class | Use Case |
|------------|------|-------------|----------|
| `low` | fast | Haiku | Docs, boilerplate, simple edits |
| `medium` | standard | Sonnet | Standard implementation work |
| `high` | advanced | Opus | Architecture, security, complex logic |
| `critical` | advanced (enforced) | Opus | Quality gates, evaluations |

### Usage Examples

```bash
# Initialize routing config
./scripts/cost-router.sh init

# Assess complexity for a coding task
./scripts/cost-router.sh assess coder "Implement JWT auth with refresh tokens"
# Output: high -> advanced (Opus)

# Assess a simple documentation task
./scripts/cost-router.sh assess docs "Update README badges"
# Output: low -> fast (Haiku)

# Get tier directly for a known complexity
./scripts/cost-router.sh route coder high

# View routing statistics
./scripts/cost-router.sh stats

# View current configuration
./scripts/cost-router.sh config
```

### Configuration

- **Disabled by default** — opt-in by creating `.claude/routing.json`
- Security and gate-keeper agents always use Opus regardless of assessment
- Agent-specific overrides supported in the config file
- Routing decisions logged to `.claude/routing-log.jsonl`

---

## 2. Self-Improving Quality Rules

**Script:** `scripts/rejection-tracker.sh`

Tracks gate-keeper rejections and **auto-proposes quality rules** after 3+ identical patterns. The framework literally learns from its mistakes.

### Commands

| Command | Purpose |
|---------|---------|
| `record <category> <description>` | Record a new rejection |
| `list` | List all rejections (filterable) |
| `stats` | Show rejection statistics |
| `trends` | Show rejection trends over time |
| `rules` | List proposed rules |
| `rules approve <ID>` | Approve a proposed rule |
| `rules reject <ID>` | Reject a proposed rule |
| `rules active` | List active (approved) rules |
| `rules inject` | Push active rules into the quality primer |

### Options

| Option | Description |
|--------|-------------|
| `--agent=AGENT` | Agent that produced the rejected code |
| `--story=STORY` | Story being implemented |
| `--category=CAT` | Filter by rejection category |
| `--since=YYYY-MM-DD` | Filter by date |
| `--period=week\|month` | Period for trend analysis |

### Rejection Categories

| Category | Description |
|----------|-------------|
| `missing_validation` | No input validation |
| `banned_pattern` | TODO/FIXME/HACK found in code |
| `missing_tests` | Business logic without tests |
| `security_violation` | Hardcoded secrets, XSS, etc. |
| `missing_docs` | Public method without documentation |
| `missing_error_handling` | Silent failures |
| `performance_issue` | N+1 queries, missing indexes |
| `accessibility_gap` | Missing labels, aria attributes |
| `architectural_violation` | Wrong layer, circular dependencies |
| `other` | Uncategorized |

### Usage Examples

```bash
# Record a rejection
./scripts/rejection-tracker.sh record banned_pattern \
  "Found TODO in production code" \
  --agent=coder --story=STORY-001

# View statistics
./scripts/rejection-tracker.sh stats

# View monthly trends
./scripts/rejection-tracker.sh trends --period=month

# List rejections for a specific category
./scripts/rejection-tracker.sh list --category=security_violation

# Manage auto-proposed rules
./scripts/rejection-tracker.sh rules
./scripts/rejection-tracker.sh rules approve LR-20260215120000
./scripts/rejection-tracker.sh rules reject LR-20260215130000

# Push active rules into the quality primer
./scripts/rejection-tracker.sh rules inject
```

### How It Works

1. Gate-keeper rejects code and records the rejection with a category
2. After 3+ rejections with the same pattern, the tracker auto-proposes a rule
3. You review and approve or reject the proposed rule
4. Approved rules are injected into `agents/_quality-primer.md`
5. All agents now follow the learned rule in future sessions

### Storage

- Rejections: `.claude/rejections.jsonl`
- Learned rules: `.claude/learned-rules.jsonl`

---

## 3. A2A Protocol Agent Cards

**Script:** `scripts/a2a-server.sh`

Generates **Google/Linux Foundation A2A-compatible** agent card JSON for all 62 framework agents — enabling cross-platform agent discovery and interoperability.

### Commands

| Command | Purpose |
|---------|---------|
| `card <agent>` | Output A2A agent card JSON for a specific agent |
| `cards` | Output all agent cards as a JSON array |
| `discover` | List all discoverable agents (name + description) |
| `validate <file.json>` | Validate an A2A agent card file against the spec |

### Usage Examples

```bash
# List all 62 discoverable agents
./scripts/a2a-server.sh discover

# Get the agent card for a specific agent
./scripts/a2a-server.sh card coder

# Pretty-print a card
./scripts/a2a-server.sh card coder | jq .

# Count total agent cards
./scripts/a2a-server.sh cards | jq length
# Output: 62

# Export all cards to a file
./scripts/a2a-server.sh cards > all-agents.json

# Validate an agent card file
./scripts/a2a-server.sh validate my-card.json
```

### Agent Card Structure

Each card includes:

| Field | Description |
|-------|-------------|
| `name` | Agent identifier |
| `description` | What the agent does |
| `url` | Discovery endpoint |
| `version` | Framework version |
| `capabilities` | Streaming, push notifications, state history |
| `skills` | List of skill objects with id, name, description |
| `defaultInputModes` | `["text"]` |
| `defaultOutputModes` | `["text"]` |

### What A2A Enables

The Agent-to-Agent protocol allows agents from different frameworks and vendors to discover and communicate with each other. By exposing 62 agents as A2A cards, any A2A-compatible system can discover and invoke Claude AS agents.

---

## 4. Arena Mode — Competitive Agent Evaluation

**Script:** `scripts/arena-evaluate.sh`

Multiple agents solve the same story independently in isolated environments, then a gate-keeper scores them. Best solution wins.

### Commands

| Command | Purpose |
|---------|---------|
| `setup` | Create isolated worktrees for contestants |
| `evaluate` | Score all solutions and select a winner |
| `results` | Show results for a story |
| `history` | Show all arena results |
| `cleanup` | Remove arena worktrees and branches |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--story=STORY` | — | Story identifier (e.g., STORY-001) |
| `--solutions=dir1,dir2` | — | Comma-separated solution directories |
| `--contestants=N` | 2 | Number of contestants (2-5) |
| `--criteria=SPEC` | See below | Weighted scoring criteria |
| `--timeout=SECONDS` | 600 | Per-contestant timeout |

### Scoring Criteria (Default Weights)

| Criterion | Weight | What It Measures |
|-----------|--------|------------------|
| Correctness | 40% | Meets acceptance criteria, tests pass |
| Quality | 25% | Code clarity, patterns, maintainability |
| Security | 20% | No vulnerabilities, proper validation |
| Performance | 15% | Efficient algorithms, no bottlenecks |

### Usage Examples

```bash
# Set up isolated worktrees for 3 contestants
./scripts/arena-evaluate.sh setup --story=STORY-001 --contestants=3

# Each contestant works in their isolated worktree (.arena/contestant-{a,b,c})
# ... agents implement solutions independently ...

# Score all solutions
./scripts/arena-evaluate.sh evaluate --story=STORY-001 \
  --solutions=.arena/contestant-a,.arena/contestant-b,.arena/contestant-c

# View results
./scripts/arena-evaluate.sh results --story=STORY-001

# View full history
./scripts/arena-evaluate.sh history

# Clean up worktrees and branches
./scripts/arena-evaluate.sh cleanup --story=STORY-001
```

### How It Works

1. **Spawn** — Create N isolated git worktrees
2. **Isolate** — Each contestant works independently with no shared state
3. **Collect** — Gather all solutions
4. **Evaluate** — Score each solution on weighted criteria
5. **Select** — Winner based on highest weighted total

Results logged to `.claude/arena-results.jsonl`.

---

## 5. Compliance-as-Code Pipeline

### 5.1 Running Compliance Checks

37 checks across 3 regulatory frameworks, each returning structured JSON results.

#### HIPAA (15 checks)

```bash
bash compliance/hipaa/checks.sh ./myproject
```

| ID | Check |
|----|-------|
| HIPAA-001 | Encryption at Rest |
| HIPAA-002 | Encryption in Transit |
| HIPAA-003 | PHI Access Logging |
| HIPAA-004 | Authentication Required |
| HIPAA-005 | Role-Based Access Control |
| HIPAA-006 | Session Timeout |
| HIPAA-007 | Password Complexity |
| HIPAA-008 | No PHI in Logs |
| HIPAA-009 | Data Backup |
| HIPAA-010 | Secure Data Deletion |
| HIPAA-011 | No Hardcoded Credentials |
| HIPAA-012 | Input Validation |
| HIPAA-013 | Safe Error Messages |
| HIPAA-014 | Incident Response |
| HIPAA-015 | Business Associate Agreement |

#### SOC 2 (12 checks)

```bash
bash compliance/soc2/checks.sh ./myproject
```

| ID | Check |
|----|-------|
| SOC2-001 | Logical Access Controls |
| SOC2-002 | Data Encryption |
| SOC2-003 | Change Management |
| SOC2-004 | System Monitoring |
| SOC2-005 | Backup and Recovery |
| SOC2-006 | Input Validation |
| SOC2-007 | Error Handling |
| SOC2-008 | Audit Logging |
| SOC2-009 | Data Classification |
| SOC2-010 | Vendor Management |
| SOC2-011 | Privacy Notice |
| SOC2-012 | Incident Response |

#### GDPR (10 checks)

```bash
bash compliance/gdpr/checks.sh ./myproject
```

| ID | Check |
|----|-------|
| GDPR-001 | Lawful Basis for Processing |
| GDPR-002 | Consent Mechanism |
| GDPR-003 | Data Minimization |
| GDPR-004 | Right to Access |
| GDPR-005 | Right to Erasure |
| GDPR-006 | Data Portability |
| GDPR-007 | Privacy by Design |
| GDPR-008 | Breach Notification |
| GDPR-009 | DPO Contact |
| GDPR-010 | Cross-Border Transfers |

#### Check Output Format

Each check returns JSON with:

```json
{
  "id": "HIPAA-001",
  "name": "Encryption at Rest",
  "category": "encryption",
  "status": "pass",
  "evidence": "Found AES-256 encryption in data layer",
  "remediation": ""
}
```

Status values: `pass`, `fail`, `warning`

When a check fails, the `remediation` field provides guidance on how to fix it.

### 5.2 Collecting & Verifying Evidence

**Script:** `scripts/compliance-evidence.sh`

Automates evidence collection with SHA-256 tamper-evident manifests for auditor handoff.

#### Commands

| Command | Purpose |
|---------|---------|
| `collect <profile>` | Run checks and collect evidence artifacts |
| `package <profile>` | Package evidence into a tar.gz archive |
| `verify <dir>` | Verify evidence integrity against manifest |
| `report <profile>` | Generate human-readable evidence report |

#### Options

| Option | Description |
|--------|-------------|
| `--project=DIR` | Project directory to scan (default: `.`) |
| `--output=FILE` | Output file for the package command |

#### Usage Examples

```bash
# Collect HIPAA evidence for a project
./scripts/compliance-evidence.sh collect hipaa --project=./myapp

# Verify that evidence hasn't been tampered with
./scripts/compliance-evidence.sh verify compliance/evidence/hipaa/2026-02-15/

# Package evidence for auditor delivery
./scripts/compliance-evidence.sh package hipaa --output=hipaa-evidence.tar.gz

# Generate a human-readable report
./scripts/compliance-evidence.sh report hipaa
```

#### How Tamper Detection Works

1. Each evidence artifact is hashed with SHA-256
2. All hashes are recorded in a `manifest.json`
3. The manifest itself includes a `manifest_hash` — a SHA-256 of the manifest contents (excluding the hash field)
4. `verify` recalculates all hashes and compares them
5. If any artifact has been modified, verification fails and reports the tampered file

#### Evidence Storage

```
compliance/evidence/
└── hipaa/
    └── 2026-02-15/
        ├── manifest.json          # SHA-256 hashes + metadata
        ├── HIPAA-001.json         # Individual check evidence
        ├── HIPAA-002.json
        └── ...
```

Evidence files are created with `chmod 600` (owner read/write only).

---

## 6. Agent Attribution & Session Recording

### 6.1 Attribution Tracking

**Script:** `scripts/attribution.sh`

Tracks which lines of code were written by AI agents vs humans, with Cursor-compatible Agent Trace format support.

#### Commands

| Command | Purpose |
|---------|---------|
| `baseline` | Snapshot working tree before an agent session |
| `calculate` | Calculate attribution after an agent session |
| `report` | Show attribution report |
| `trailer` | Output git commit trailer for current attribution |
| `status` | Show attribution tracking status |

#### Options

| Option | Description |
|--------|-------------|
| `--session=ID` | Session identifier (default: auto-generated) |
| `--file=PATH` | Filter report to a specific file |
| `--json` | Output in JSON format |
| `--format=FORMAT` | Output format: `text`, `json`, `agent-trace` |

#### Workflow

```bash
# Step 1: Take a baseline before agent work
./scripts/attribution.sh baseline --session=my-feature

# Step 2: Agent does work (coding, refactoring, etc.)
# ...

# Step 3: Calculate attribution
./scripts/attribution.sh calculate --session=my-feature

# Step 4: View results
./scripts/attribution.sh report
./scripts/attribution.sh report --file=src/auth.py

# Step 5: Export in Cursor-compatible format
./scripts/attribution.sh report --format=agent-trace > trace.json

# Step 6: Add attribution to git commit
git commit -m "feat: add auth $(./scripts/attribution.sh trailer)"
```

### 6.2 Session Recording

**Script:** `scripts/session-recorder.sh`

Records the full lifecycle of an agent session — files touched, decisions made, prompts exchanged, and outcomes.

#### Commands

| Command | Purpose |
|---------|---------|
| `start` | Start a new session |
| `log` | Log an event to the current session |
| `decision` | Record a decision with rationale |
| `file` | Record a file operation |
| `prompt` | Record a prompt/response (requires `--capture-prompts`) |
| `end` | End current session with outcome |
| `show` | Display a session record |
| `list` | List recent sessions |

#### Start Options

| Option | Description |
|--------|-------------|
| `--agent=AGENT` | Agent name (required) |
| `--story=STORY` | Story ID |
| `--session=ID` | Custom session ID |
| `--capture-prompts` | Enable prompt/response capture |

#### Decision Options

| Option | Description |
|--------|-------------|
| `--what=WHAT` | What was decided (required) |
| `--why=WHY` | Why this decision was made (required) |
| `--alternatives=A,B` | Rejected alternatives |
| `--confidence=0.9` | Confidence score 0.0-1.0 |
| `--prd-req=FR-001` | PRD requirement reference |

#### End Options

| Option | Description |
|--------|-------------|
| `--outcome=OUTCOME` | `success`, `partial`, or `failed` (required) |
| `--gate=RESULT` | Gate/Anvil result |

#### Usage Examples

```bash
# Start a session with prompt capture
./scripts/session-recorder.sh start \
  --agent=coder --story=STORY-001 --capture-prompts

# Log events as work progresses
./scripts/session-recorder.sh log \
  --event="Starting authentication implementation"

# Record architectural decisions
./scripts/session-recorder.sh decision \
  --what="Use JWT with refresh tokens" \
  --why="Better security + UX" \
  --alternatives="Session cookies,API keys" \
  --confidence=0.9

# Record file operations
./scripts/session-recorder.sh file \
  --action=create --path=src/auth/jwt.py

# End the session
./scripts/session-recorder.sh end \
  --outcome=success --gate=pass

# Browse sessions
./scripts/session-recorder.sh list --date=2026-02-15
./scripts/session-recorder.sh show --session=20260215_143022
```

#### Storage

Sessions stored as JSONL in `logs/sessions/{date}/session-{id}.jsonl`.

Prompts are sanitized automatically — API keys and tokens are redacted. Each prompt entry is SHA-256 hashed and capped at 50KB.

---

## 7. CI/CD — GitHub Actions

**File:** `.github/workflows/ci.yml`

Automated testing on every push and pull request to `main`. No setup required — runs automatically on GitHub.

### What It Does

| Step | Description |
|------|-------------|
| Install dependencies | `jq`, `bc` |
| Validate shell scripts | Syntax check with `bash -n` on all `.sh` files |
| Run test suite | `tests/run-tests.sh` |
| Verify platform sync | `scripts/sync-platforms.sh check` for drift detection |

### Matrix

| OS | Version |
|----|---------|
| Ubuntu | 22.04 |
| Ubuntu | 24.04 |
| macOS | latest |

All OS targets run even if one fails (`fail-fast: false`).

---

## 8. Quick Reference

| Task | Command |
|------|---------|
| Route an agent to the right model | `./scripts/cost-router.sh assess <agent> "<task>"` |
| Record a quality rejection | `./scripts/rejection-tracker.sh record <category> "<desc>"` |
| See rejection trends | `./scripts/rejection-tracker.sh trends --period=month` |
| Inject learned rules into primer | `./scripts/rejection-tracker.sh rules inject` |
| Get A2A card for an agent | `./scripts/a2a-server.sh card <agent>` |
| List all 62 discoverable agents | `./scripts/a2a-server.sh discover` |
| Run arena competition | `./scripts/arena-evaluate.sh setup --story=<ID> --contestants=3` |
| Run HIPAA compliance scan | `bash compliance/hipaa/checks.sh ./project` |
| Run SOC 2 compliance scan | `bash compliance/soc2/checks.sh ./project` |
| Run GDPR compliance scan | `bash compliance/gdpr/checks.sh ./project` |
| Collect tamper-evident evidence | `./scripts/compliance-evidence.sh collect hipaa` |
| Verify evidence integrity | `./scripts/compliance-evidence.sh verify <evidence-dir>` |
| Package evidence for auditors | `./scripts/compliance-evidence.sh package hipaa --output=out.tar.gz` |
| Take attribution baseline | `./scripts/attribution.sh baseline` |
| Calculate attribution after work | `./scripts/attribution.sh calculate` |
| View attribution report | `./scripts/attribution.sh report` |
| Start a session recording | `./scripts/session-recorder.sh start --agent=coder` |
| Record a decision | `./scripts/session-recorder.sh decision --what="X" --why="Y"` |
| End a session | `./scripts/session-recorder.sh end --outcome=success` |
| List recent sessions | `./scripts/session-recorder.sh list` |

---

## 9. Security Fixes

v1.9.0.16 includes these security hardening changes in `scripts/rejection-tracker.sh`:

| Fix | Before | After |
|-----|--------|-------|
| Command injection | `eval()` with user input | `jq` filtering with `--arg` |
| Insecure temp files | `mktemp` in `/tmp` | Project-dir `mktemp` + `chmod 600` |
| Unsafe text substitution | `sed -i` with user input | `awk` with variable injection |
| Unvalidated input | Categories passed raw to `grep` | Explicit allowlist validation |
| Unsafe JSON filtering | `grep` on JSONL | `jq` with proper selectors |

---

## File Map

| Category | Files |
|----------|-------|
| Cost routing | `scripts/cost-router.sh`, `.claude/routing.json` |
| Rejection tracking | `scripts/rejection-tracker.sh`, `.claude/rejections.jsonl`, `.claude/learned-rules.jsonl` |
| A2A protocol | `scripts/a2a-server.sh` |
| Arena mode | `scripts/arena-evaluate.sh`, `agents/_arena-protocol.md`, `.claude/arena-results.jsonl` |
| HIPAA compliance | `compliance/hipaa/checks.sh`, `compliance/hipaa/profile.json` |
| SOC 2 compliance | `compliance/soc2/checks.sh`, `compliance/soc2/profile.json` |
| GDPR compliance | `compliance/gdpr/checks.sh`, `compliance/gdpr/profile.json` |
| Evidence collection | `scripts/compliance-evidence.sh`, `compliance/evidence/` |
| Attribution | `scripts/attribution.sh`, `.claude/attribution/` |
| Session recording | `scripts/session-recorder.sh`, `logs/sessions/` |
| CI/CD | `.github/workflows/ci.yml` |

---

*Claude AS Framework v1.9.0.16 — Competitive Leap*
*Last Updated: 2026-02-15*

# Commit Trailer Protocol v1.0.0

> Shared module for structured git commit metadata.
> Referenced by: `/coder`, `/go`, `/ship`, `/forge`

---

## Purpose

Embed machine-readable metadata in git commit messages as trailers. This creates an immutable audit trail that travels with commits through rebases, cherry-picks, and merges.

---

## Trailer Format

Every commit made by a Claude AS agent MUST include these trailers:

```
feat: implement user authentication

STORY-003: JWT-based login with refresh token rotation

Claude-AS-Agent: coder
Claude-AS-Story: STORY-003
Claude-AS-Session: 20260215_143000_a1b2c3d4
Claude-AS-Attribution: 68% agent (146/214 lines)
Claude-AS-Gate: anvil-pass
```

---

## Trailer Definitions

| Trailer | Required | Format | Description |
|---------|----------|--------|-------------|
| `Claude-AS-Agent` | Yes | agent name | Which agent made the commit (coder, tester, fixer, etc.) |
| `Claude-AS-Story` | Yes* | STORY-NNN | Story being implemented (*omit if no story context) |
| `Claude-AS-Session` | Yes | session_id | Session recorder ID linking to full session record |
| `Claude-AS-Attribution` | Recommended | N% agent (X/Y lines) | Line attribution from `scripts/attribution.sh` |
| `Claude-AS-Gate` | Recommended | anvil-pass\|anvil-fail\|skipped | Last Anvil gate result before commit |

---

## When to Add Trailers

### Always Add
- Commits from `/go` story execution
- Commits from `/coder` implementation
- Commits from `/fixer` auto-remediation
- Commits from `/ship` release preparation

### Skip Trailers
- Manual user commits (user is not using an agent)
- Documentation-only commits (no agent session)
- Merge commits (trailers are on the individual commits)

---

## How Agents Generate Trailers

### Step 1: Gather Data

```bash
# Get current session ID
SESSION_ID=$(jq -r '.session_id' .claude/current-session.json 2>/dev/null || echo "none")

# Get attribution (if baseline was created)
ATTRIBUTION=$(./scripts/attribution.sh trailer 2>/dev/null || echo "")

# Get last gate result
GATE=$(jq -r '.last_gate_result // "none"' .claude/state.json 2>/dev/null || echo "none")
```

### Step 2: Append to Commit Message

```bash
git commit -m "$(cat <<'EOF'
feat: implement user authentication

STORY-003: JWT-based login with refresh token rotation

Claude-AS-Agent: coder
Claude-AS-Story: STORY-003
Claude-AS-Session: 20260215_143000_a1b2c3d4
Claude-AS-Attribution: 68% agent (146/214 lines)
Claude-AS-Gate: anvil-pass
EOF
)"
```

---

## Reading Trailers

### Filter by Agent
```bash
git log --all --grep="Claude-AS-Agent: coder"
```

### Filter by Story
```bash
git log --all --grep="Claude-AS-Story: STORY-003"
```

### Extract Attribution History
```bash
git log --format='%H %s' --all | while read hash msg; do
    attr=$(git log -1 --format='%(trailers:key=Claude-AS-Attribution,valueonly)' "$hash" 2>/dev/null)
    [ -n "$attr" ] && echo "$hash $attr $msg"
done
```

### Aggregate Agent Activity
```bash
git log --format='%(trailers:key=Claude-AS-Agent,valueonly)' | sort | uniq -c | sort -rn
```

---

## Integration with Framework Tools

| Tool | How It Uses Trailers |
|------|---------------------|
| `/analytics` | Mine commit trailers for agent activity trends |
| `/review` | Prioritize review of high-attribution commits |
| `/metrics` | Track agent commit frequency and success rates |
| `/replay --show` | Link session records to specific commits |
| `/security-scanner` | Focus on AI-attributed code sections |

---

## Commit Message Structure

```
<type>: <description>

<story-reference>: <story-summary>

<body - optional detailed description>

Claude-AS-Agent: <agent>
Claude-AS-Story: <story>
Claude-AS-Session: <session_id>
Claude-AS-Attribution: <pct>% agent (<lines>/<total> lines)
Claude-AS-Gate: <gate_result>
```

### Type Prefixes (standard)
- `feat:` - New feature implementation
- `fix:` - Bug fix
- `refactor:` - Code restructuring
- `test:` - Test additions/modifications
- `docs:` - Documentation changes
- `security:` - Security fix or hardening

---

*Commit Trailer Protocol v1.0.0 - Claude AS Framework*

# Prompt/Response Capture Protocol

> Shared module for all agents. Records raw prompts and responses for audit trails.

---

## When to Activate

Prompt capture is **opt-in**. It activates when:
1. Session started with `--capture-prompts` flag
2. Global config `.claude/config.json` has `"capture_prompts": true`

**Default: OFF** — No prompts are captured without explicit opt-in.

---

## Capture Protocol

### Before Agent Dispatch

If capture is active for the current session:

```bash
scripts/session-recorder.sh prompt \
  --agent="$AGENT_NAME" \
  --direction=prompt \
  --content="$SYSTEM_PROMPT + $USER_PROMPT"
```

### After Agent Response

```bash
scripts/session-recorder.sh prompt \
  --agent="$AGENT_NAME" \
  --direction=response \
  --content="$AGENT_RESPONSE"
```

---

## JSONL Entry Format

```json
{
  "type": "prompt_capture",
  "timestamp": "2026-02-15T14:30:00Z",
  "direction": "prompt",
  "agent": "coder",
  "content_hash": "sha256...",
  "token_count_estimate": 1234,
  "model": "claude-opus-4-6",
  "content": "sanitized prompt text"
}
```

---

## Sanitization Rules

Before logging, ALL content must be sanitized:

| Pattern | Action |
|---------|--------|
| `sk-[a-zA-Z0-9]+` | Replace with `[REDACTED_API_KEY]` |
| `Bearer [a-zA-Z0-9._-]+` | Replace with `Bearer [REDACTED]` |
| `password[=:]\s*\S+` | Replace with `password=[REDACTED]` |
| `token[=:]\s*\S+` | Replace with `token=[REDACTED]` |
| `secret[=:]\s*\S+` | Replace with `secret=[REDACTED]` |
| Connection strings with credentials | Redact password portion |

---

## Storage Limits

| Limit | Value | Action |
|-------|-------|--------|
| Max size per session | 100MB | Stop capturing, log warning |
| Max content per entry | 50KB | Truncate with `[TRUNCATED]` marker |
| Retention | 30 days | Auto-cleanup by session-recorder |

---

## Privacy Controls

- `session-recorder.sh show <id>` redacts captured prompts by default
- Use `--show-prompts` flag to display full content
- Session files have 600 permissions (owner-only read/write)

---

## Integration Points

All orchestrating agents (/go, /forge, /delegate) should check capture state at session start and pass it to sub-agents.

---

*SkillFoundry Framework — Prompt Capture Protocol*

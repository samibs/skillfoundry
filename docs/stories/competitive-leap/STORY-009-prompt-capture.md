# STORY-009: Prompt/Response Capture System

**Phase:** 3 — Standards & Capture
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** L
**Dependencies:** STORY-008
**Affects:** FR-031, FR-032

---

## Description

Extend the session recorder to capture raw prompts sent to agents and responses received. This creates a complete audit trail for debugging, compliance, and analysis. Capture is opt-in by default (privacy-first).

---

## Technical Approach

### Architecture

```
Agent Dispatch
    │
    ├── [if --capture-prompts] → Log prompt to session JSONL
    │
    ▼
Agent Execution
    │
    ├── [if --capture-prompts] → Log response to session JSONL
    │
    ▼
Session End
```

### Shared module: `agents/_prompt-capture.md`

Define the capture protocol for all agents:

```markdown
## Prompt Capture Protocol

When `--capture-prompts` is active for the current session:

1. **Before dispatching to agent**: Log the full system prompt + user prompt
2. **After agent response**: Log the full response
3. **Sanitize**: Remove any credentials, API keys, or tokens before logging
4. **Format**: JSONL entries appended to the session log

### JSONL entry format:
{
  "type": "prompt_capture",
  "timestamp": "ISO8601",
  "direction": "prompt|response",
  "agent": "agent_name",
  "content_hash": "sha256",
  "token_count_estimate": 1234,
  "model": "model_id",
  "content": "the actual text (sanitized)"
}
```

### Session recorder changes

Extend `scripts/session-recorder.sh`:

1. Add `--capture-prompts` flag to `start` subcommand:
   ```bash
   cmd_start() {
       # ... existing logic
       if [ "$CAPTURE_PROMPTS" = "true" ]; then
           echo '{"type":"config","capture_prompts":true}' >> "$SESSION_FILE"
       fi
   }
   ```

2. Add `prompt` and `response` subcommands:
   ```bash
   cmd_prompt() {
       local agent="$1"
       local content="$2"
       local sanitized
       sanitized=$(sanitize_content "$content")
       local hash
       hash=$(echo -n "$sanitized" | sha256sum | cut -d' ' -f1)
       local tokens
       tokens=$(estimate_tokens "$sanitized")

       jq -nc \
           --arg type "prompt_capture" \
           --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
           --arg dir "prompt" \
           --arg agent "$agent" \
           --arg hash "$hash" \
           --argjson tokens "$tokens" \
           --arg content "$sanitized" \
           '{type:$type,timestamp:$ts,direction:$dir,agent:$agent,content_hash:$hash,token_count_estimate:$tokens,content:$content}' \
           >> "$SESSION_FILE"
   }
   ```

3. Add `sanitize_content()` function that strips:
   - API keys (pattern: `sk-`, `Bearer `, `token=`)
   - Passwords (pattern: `password=`, `passwd=`)
   - Connection strings
   - Environment variable values that look like secrets

### Storage management

- Prompt capture files can grow large
- Implement `--max-capture-size` (default 100MB per session)
- When limit reached, log warning and stop capturing (don't crash)
- Add `session-recorder.sh rotate` command for manual cleanup

### Privacy controls

- Capture is OFF by default
- Enabled per-session with `--capture-prompts` flag
- Or globally with `.claude/config.json`: `{"capture_prompts": true}`
- `session-recorder.sh show <id>` redacts prompts by default; use `--show-prompts` to display

---

## Acceptance Criteria

```gherkin
Scenario: Prompts captured when flag is set
  Given a session is started with "--capture-prompts"
  When an agent is invoked
  Then the prompt is logged to the session JSONL

Scenario: Responses captured when flag is set
  Given a session is started with "--capture-prompts"
  When an agent completes
  Then the response is logged to the session JSONL

Scenario: No capture without flag
  Given a session is started without "--capture-prompts"
  When an agent is invoked
  Then no prompt or response is logged

Scenario: Credentials sanitized
  Given a prompt contains "sk-abc123" API key
  When the prompt is captured
  Then the API key is replaced with "[REDACTED]"

Scenario: Size limit enforced
  Given capture has reached 100MB
  When a new prompt is about to be captured
  Then a warning is logged and capture stops gracefully
```

---

## Security Checklist

- [ ] Prompts are sanitized before logging (no secrets)
- [ ] Capture is opt-in (off by default)
- [ ] Session files have 600 permissions (owner-only)
- [ ] `show` command redacts prompts by default
- [ ] Size limits prevent disk exhaustion

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/session-recorder.sh` | Add prompt/response capture commands |
| `agents/_prompt-capture.md` | Create shared capture protocol |
| `tests/run-tests.sh` | Add capture tests |

---

## Testing

- Start session with `--capture-prompts` → prompt entries in JSONL
- Start session without flag → no prompt entries
- Inject fake API key in prompt → verify redacted in log
- Generate large capture → verify size limit stops gracefully

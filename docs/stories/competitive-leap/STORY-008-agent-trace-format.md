# STORY-008: Agent Trace Format Support

**Phase:** 3 — Standards & Capture
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** M
**Dependencies:** STORY-005
**Affects:** FR-030

---

## Description

Extend `scripts/attribution.sh` to support Agent Trace format output. Agent Trace is a Cursor-pioneered RFC for recording agent actions, file modifications, and attribution data in a standardized JSON format. Supporting this format makes our attribution data compatible with emerging industry tools.

---

## Technical Approach

### Agent Trace format (based on Cursor RFC)

```json
{
  "version": "0.1",
  "session_id": "20260215_143000_a1b2c3d4",
  "agent": "coder",
  "traces": [
    {
      "type": "file_edit",
      "timestamp": "2026-02-15T14:30:05Z",
      "file": "src/main.py",
      "lines_added": 42,
      "lines_removed": 7,
      "attribution": "agent"
    },
    {
      "type": "decision",
      "timestamp": "2026-02-15T14:30:10Z",
      "what": "Used RS256 for JWT",
      "why": "Asymmetric keys required for microservice architecture",
      "confidence": 0.9
    },
    {
      "type": "tool_call",
      "timestamp": "2026-02-15T14:30:15Z",
      "tool": "bash",
      "command": "pytest tests/",
      "exit_code": 0
    }
  ],
  "summary": {
    "files_modified": 5,
    "lines_added": 146,
    "lines_removed": 23,
    "agent_attribution_pct": 68.2,
    "decisions_made": 3,
    "tools_called": 7
  }
}
```

### Implementation

Add `--format=agent-trace` flag to `attribution.sh`:

```bash
cmd_report() {
    local format="${1:-text}"

    case "$format" in
        text)
            # Existing text output
            ;;
        agent-trace)
            generate_agent_trace_json
            ;;
        json)
            # Existing JSON output (if any)
            ;;
        *)
            echo -e "${RED}[FAIL]${NC} Unknown format: $format"
            exit 1
            ;;
    esac
}

generate_agent_trace_json() {
    # Read attribution data from .claude/attribution.json
    # Read session data from logs/sessions/
    # Merge into Agent Trace format
    # Output valid JSON
}
```

### Integration with session-recorder.sh

The Agent Trace format needs data from both:
- `attribution.sh` (file modifications, line counts)
- `session-recorder.sh` (decisions, timestamps, tools)

The `generate_agent_trace_json` function reads from both sources and merges.

---

## Acceptance Criteria

```gherkin
Scenario: Agent Trace format output
  Given a session has completed with attribution data
  When "attribution.sh report --format=agent-trace" runs
  Then output is valid JSON matching the Agent Trace schema

Scenario: Agent Trace includes file modifications
  Given files were modified during a session
  When Agent Trace report is generated
  Then each modified file appears in the traces array

Scenario: Agent Trace includes decisions
  Given decisions were logged during a session
  When Agent Trace report is generated
  Then each decision appears in the traces array

Scenario: Backward compatible
  Given the existing text format is used by other scripts
  When "attribution.sh report" runs without --format
  Then the default text output is unchanged
```

---

## Security Checklist

- [ ] Agent Trace output does not include file contents (only metadata)
- [ ] No credentials or secrets in trace data
- [ ] File paths are relative to project root (no absolute paths exposing system info)

---

## Files to Modify

| File | Action |
|------|--------|
| `scripts/attribution.sh` | Add `--format=agent-trace` support |
| `tests/run-tests.sh` | Add test for Agent Trace output validity |

---

## Testing

- Generate Agent Trace JSON → validate with `jq .` (valid JSON)
- Verify traces array contains file_edit, decision, and tool_call types
- Verify summary section has correct totals
- Existing text format still works unchanged

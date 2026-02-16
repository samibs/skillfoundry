# STORY-014: A2A Protocol Agent Cards

**Phase:** 5 — Moonshots
**PRD:** competitive-leap
**Priority:** COULD
**Effort:** M
**Dependencies:** STORY-013
**Affects:** FR-050

---

## Description

Implement A2A (Agent-to-Agent) protocol agent cards for each Claude AS agent. Agent cards are JSON metadata documents that describe an agent's capabilities, allowing external systems to discover and interact with our agents via the A2A standard.

---

## Technical Approach

### A2A Agent Card format (per Google/Linux Foundation spec)

```json
{
  "name": "coder",
  "description": "Senior software engineer that implements features with TDD",
  "url": "http://localhost:8080/a2a/coder",
  "version": "1.9.0.15",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "skills": [
    {
      "id": "code-generation",
      "name": "Code Generation",
      "description": "Generate production-ready code with tests"
    },
    {
      "id": "tdd",
      "name": "Test-Driven Development",
      "description": "Write tests first, then implementation"
    },
    {
      "id": "bug-fix",
      "name": "Bug Fix",
      "description": "Diagnose and fix bugs with regression tests"
    }
  ],
  "inputModes": ["text"],
  "outputModes": ["text"]
}
```

### Script: `scripts/a2a-server.sh`

```bash
#!/usr/bin/env bash
# A2A protocol support for Claude AS agents

# Usage:
#   a2a-server.sh card <agent>           → Output A2A agent card JSON
#   a2a-server.sh cards                  → Output all agent cards
#   a2a-server.sh discover               → List all discoverable agents
#   a2a-server.sh validate <card.json>   → Validate an agent card
```

### Agent card generation

Read agent definitions from `agents/` directory and generate A2A-compatible cards:

1. Parse agent frontmatter (command, description, tags)
2. Map agent capabilities to A2A skills
3. Set framework version from `.version`
4. Output valid JSON

### Agent-to-skills mapping

| Agent | A2A Skills |
|-------|-----------|
| coder | code-generation, tdd, bug-fix |
| architect | system-design, api-design, data-modeling |
| tester | test-generation, test-execution, coverage-analysis |
| security | security-audit, threat-modeling, vulnerability-scan |
| gate-keeper | code-review, quality-gate, compliance-check |
| ... | ... (all 46 agents mapped) |

### Future: A2A task endpoint (FR-051)

The task endpoint (`a2a-server.sh serve`) is deferred to a future story. This story focuses on agent cards (discovery layer only). The serve command would:
1. Start a lightweight HTTP server (bash + socat/netcat)
2. Accept A2A task requests
3. Route to appropriate agent
4. Return results in A2A format

---

## Acceptance Criteria

```gherkin
Scenario: Agent card generation
  Given the coder agent exists
  When "a2a-server.sh card coder" runs
  Then valid A2A JSON is output with name, description, skills

Scenario: All agent cards
  Given 46 agents exist
  When "a2a-server.sh cards" runs
  Then 46 agent cards are output

Scenario: Card validation
  Given a valid agent card JSON
  When "a2a-server.sh validate card.json" runs
  Then validation passes

Scenario: Invalid card caught
  Given an agent card missing required fields
  When "a2a-server.sh validate bad-card.json" runs
  Then validation fails with specific error
```

---

## Security Checklist

- [ ] Agent cards don't expose internal implementation details
- [ ] No credentials in card metadata
- [ ] URL field uses localhost only (not exposed externally)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/a2a-server.sh` | Create A2A card generator |
| `tests/run-tests.sh` | Add A2A card tests |

---

## Testing

- `a2a-server.sh card coder` → valid JSON (verify with `jq .`)
- `a2a-server.sh cards | jq length` → 46 (or agent count)
- `a2a-server.sh discover` → lists all agents
- `a2a-server.sh --help` → usage text, exit 0

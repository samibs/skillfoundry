---
name: agent-profile
command: none
description: Agent learning profile protocol for code style learning and cross-agent knowledge transfer
color: gray
---

# Agent Learning Profile Protocol v1.0.0

> Shared module for agent code style learning and cross-agent knowledge transfer.
> Referenced by: all agent commands, `/go`, `/delegate`

---

## Purpose

Enable agents to learn and adapt to the developer's preferred code style, patterns, and conventions across projects. Patterns observed in multiple projects become universal preferences that inform future code generation.

---

## How It Works

### Style Pattern Detection (FR-031)

Agents observe and record patterns during code generation:

```
Observation Categories:
├── Naming conventions (camelCase, snake_case, PascalCase)
├── Code formatting (indent style, line length, brace placement)
├── Import organization (grouping, sorting, aliases)
├── Error handling patterns (try/catch style, error types)
├── Test structure (describe/it, test naming, setup/teardown)
├── Comment style (JSDoc, inline, block)
├── Architecture patterns (repositories, services, controllers)
└── Framework preferences (specific libraries, utilities)
```

### Pattern Storage

Patterns are stored in the knowledge base as `preference` type entries:

```json
{
  "type": "preference",
  "content": "Developer uses camelCase for variables and PascalCase for classes",
  "weight": 0.8,
  "tags": ["style", "naming", "javascript"],
  "scope": "universal",
  "source_project": "/path/to/project",
  "lineage": {
    "agent": "coder",
    "observed_in": 5,
    "first_seen": "2026-01-15T10:00:00Z"
  }
}
```

### Promotion Through Observation

```
Observation Count:   Weight:     Status:
1 project           0.3         PROJECT_LOCAL
2 projects          0.5         HARVESTED
3 projects          0.7         CANDIDATE
5+ projects         0.9         PROMOTED (universal)
```

---

## Cross-Agent Learning (FR-032)

Agents share learned patterns to prevent recurring issues.

### Pattern Flow

```
Fixer fixes "missing input validation" 5 times
    │
    ▼ (recorded as error pattern)
Gate-keeper adds "check for input validation" to rules
    │
    ▼ (proactive enforcement)
Coder generates endpoints with input validation by default
```

### Knowledge Categories for Learning

| Category | Source Agent | Consumer Agent | Example |
|----------|-------------|----------------|---------|
| Error patterns | Fixer | Coder, Gate-keeper | "Missing null check on API response" |
| Security fixes | Security Scanner | Coder | "Always sanitize user input before DB query" |
| Test patterns | Tester | Coder | "Include edge cases for empty arrays" |
| Performance | Performance | Coder | "Use pagination for list endpoints" |
| Style | Coder | Coder (future) | "Use async/await over .then() chains" |

---

## Integration Points

### During `/go` Execution

1. **Before code generation**: Check knowledge base for style preferences
2. **During code generation**: Apply learned patterns
3. **After code generation**: Record any new patterns observed
4. **During review/fix**: Record error patterns for future prevention

### Knowledge Base Queries

```bash
# Check for style preferences
./scripts/semantic-search.sh "naming convention" --type=preference

# Check for known error patterns
./scripts/semantic-search.sh "common mistakes" --type=error

# Check for architecture preferences
./scripts/semantic-search.sh "architecture pattern" --type=pattern
```

### Harvesting

Style preferences are automatically harvested via `scripts/harvest.sh` and promoted through the standard knowledge promotion pipeline (PROJECT_LOCAL -> HARVESTED -> CANDIDATE -> PROMOTED).

---

## Agent Responsibilities

### Coder Agent
- Record observed code style patterns after each implementation
- Check preference entries before generating code
- Apply style consistency within a project

### Tester Agent
- Record test structure preferences
- Apply consistent test patterns across stories

### Fixer Agent
- Record error patterns with high weight
- Feed patterns to knowledge base for prevention

### Gate-Keeper Agent
- Check for known error patterns during validation
- Enforce learned style preferences as soft rules

---

## Limitations

- Patterns require 3+ observations before becoming universal
- Style detection is heuristic (not ML-based)
- Conflicting preferences between projects are resolved by weight
- Agent profiles don't override explicit user instructions

---

*Agent Learning Profile Protocol v1.0.0 - Claude AS Framework*

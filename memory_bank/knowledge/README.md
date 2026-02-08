# Knowledge Storage - JSONL Schema

Knowledge entries are stored in JSONL (JSON Lines) format - one JSON object per line. This format is append-only, grep-friendly, and easy to process with standard Unix tools.

## JSONL Schema

Each line in `*.jsonl` files is a JSON object with this structure:

```json
{
  "id": "uuid-v4",
  "type": "fact|decision|error|preference",
  "content": "The actual knowledge text",
  "created_at": "2026-02-06T12:00:00Z",
  "created_by": "user|agent",
  "session_id": "session-identifier",
  "context": {
    "prd_id": "optional-prd-reference",
    "story_id": "optional-story-reference",
    "phase": "optional-execution-phase"
  },
  "weight": 0.5,
  "validation_count": 0,
  "retrieval_count": 0,
  "tags": ["tag1", "tag2"],
  "reality_anchor": {
    "has_tests": false,
    "test_file": null,
    "test_passing": false
  },
  "lineage": {
    "parent_id": null,
    "supersedes": [],
    "superseded_by": null
  }
}
```

## Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | Yes | Unique identifier for this entry |
| `type` | string | Yes | One of: fact, decision, error, preference |
| `content` | string | Yes | The knowledge content |
| `created_at` | string (ISO 8601) | Yes | UTC timestamp of creation |
| `created_by` | string | Yes | Who created it: "user" or agent name |
| `session_id` | string | Yes | Session identifier for grouping |
| `context` | object | Yes | Contextual references (PRD, story, phase) |
| `weight` | number (0-1) | Yes | Relevance weight for retrieval ranking |
| `validation_count` | integer | Yes | Times this entry was validated |
| `retrieval_count` | integer | Yes | Times this entry was retrieved |
| `tags` | array[string] | Yes | Categorization tags |
| `reality_anchor` | object | Yes | Test evidence linkage |
| `lineage` | object | Yes | Parent/child correction chain |

## Knowledge Types

### Facts (`facts.jsonl`)
Verified technical information about the project or framework.
- Example: "Claude AS uses MAJOR.FEATURE.DATABASE.ITERATION versioning"
- Weight starts at 0.5, increases with validation

### Decisions (`decisions.jsonl`)
Design choices and their rationale.
- Example: "Chose bash over JavaScript for framework tooling (portability)"
- Important: Include the WHY, not just the WHAT

### Errors (`errors.jsonl`)
Common error patterns and their solutions.
- Example: "If ANTI_PATTERNS not found: files live in docs/ not project root"
- Should include: trigger condition, root cause, fix

### Preferences (`preferences.jsonl`)
User conventions and style preferences.
- Example: "User prefers dark mode, backend-first development"
- Lower weight by default, advisory only

## Working with JSONL

```bash
# Count entries
wc -l knowledge/facts.jsonl

# Search for content
grep -i "versioning" knowledge/facts.jsonl | jq .

# Get all high-weight entries
jq 'select(.weight > 0.7)' knowledge/facts.jsonl

# Get entries by tag
jq 'select(.tags | contains(["security"]))' knowledge/facts.jsonl
```

## Bootstrap File

`bootstrap.jsonl` contains pre-seeded framework knowledge entries. These provide baseline context when initializing a new project's memory bank. Entries cover:

- Framework facts (versioning, structure, platforms)
- Design decisions (tooling choices, format choices)
- Common error patterns and solutions

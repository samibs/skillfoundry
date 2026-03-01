# Memory Bank - SkillFoundry Framework

Persistent knowledge storage for AI agents across sessions. Stores facts, decisions, errors, and preferences in append-only JSONL format with weight-based relevance ranking.

## Directory Structure

```
memory_bank/
├── README.md                              # This file
├── knowledge/
│   ├── README.md                          # JSONL schema documentation
│   ├── bootstrap.jsonl                    # Pre-seeded framework knowledge
│   ├── facts.jsonl                        # Verified facts (created at runtime)
│   ├── decisions.jsonl                    # Design decisions (created at runtime)
│   ├── errors.jsonl                       # Error patterns (created at runtime)
│   └── preferences.jsonl                  # User preferences (created at runtime)
├── relationships/
│   ├── knowledge-graph.json               # Node/edge relationship graph
│   └── lineage.json                       # Knowledge lineage and corrections
└── retrieval/
    ├── query-cache.json                   # Recent query result cache
    └── weights.json                       # Weight adjustment history
```

## CLI Usage

```bash
# Store knowledge
scripts/memory.sh remember "PRDs go in genesis/ directory" fact
scripts/memory.sh remember "Chose bash over JS for portability" decision
scripts/memory.sh remember "ANTI_PATTERNS files live in docs/ not root" error

# Recall knowledge
scripts/memory.sh recall "PRD"
scripts/memory.sh recall "versioning" fact

# Correct knowledge
scripts/memory.sh correct "New corrected info" --id=<uuid>

# Check status
scripts/memory.sh status
```

## Agent Usage

Agents interact via `/remember`, `/recall`, `/correct` commands:

```
/remember "Three-layer validation: Database -> Backend -> Frontend"
/recall "authentication"
/correct "Updated: JWT uses RS256 not HS256" --id=<uuid>
```

## Knowledge Types

| Type | File | Purpose |
|------|------|---------|
| `fact` | `facts.jsonl` | Verified technical facts about the project |
| `decision` | `decisions.jsonl` | Design decisions with rationale |
| `error` | `errors.jsonl` | Error patterns and their solutions |
| `preference` | `preferences.jsonl` | User preferences and conventions |

## Weight System

Each knowledge entry has a weight (0.0 - 1.0) that affects retrieval priority:

| Event | Weight Change |
|-------|---------------|
| New entry | 0.5 (default) |
| Validated by test | +0.2 |
| Retrieved and used | +0.1 |
| Corrected/superseded | Original reduced to 30% |
| New correction entry | 0.7 (initial) |

## JSON Schemas

### Relationship Files

**knowledge-graph.json**: `{"nodes":[], "edges":[], "metadata":{}}`
- Nodes: knowledge entries with IDs and types
- Edges: relationships (supports, contradicts, relates_to)

**lineage.json**: `{"entries":[], "corrections":[], "metadata":{}}`
- Tracks parent-child relationships between knowledge entries
- Records all corrections and supersession chains

### Retrieval Files

**query-cache.json**: `{"cache":[], "max_size":1000, "metadata":{}}`
- Caches recent query results for faster retrieval
- Auto-evicts oldest entries when max_size reached

**weights.json**: `{"adjustments":[], "metadata":{}}`
- Records all weight adjustments with timestamps and reasons

## Bootstrap Knowledge

The `knowledge/bootstrap.jsonl` file contains pre-seeded framework knowledge. When `memory.sh init` runs in a new project, this file is copied to provide baseline context.

---

**Framework Version**: 1.7.0.1

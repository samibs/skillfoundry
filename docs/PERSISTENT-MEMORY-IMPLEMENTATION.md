# Persistent Memory System - Implementation Guide

**Version**: 2.0 (updated v1.9.0.0)
**Status**: IMPLEMENTATION
**Date**: February 7, 2026

---

## Overview

The Persistent Memory System enables agents to remember decisions, patterns, and knowledge across sessions. This is a foundational capability for Phase 3.

---

## Architecture

```
memory_bank/
├── knowledge/
│   ├── facts.jsonl           # Append-only knowledge store
│   ├── decisions.jsonl       # Architectural decisions
│   ├── errors.jsonl          # Error patterns & fixes
│   └── preferences.jsonl     # User/project preferences
├── relationships/
│   ├── knowledge-graph.json  # Entity relationships
│   └── lineage.json          # Knowledge ancestry
└── retrieval/
    ├── query-cache.json      # Recent query results
    └── weights.json          # Current weight adjustments
```

---

## Memory Entry Format

```json
{
  "id": "uuid-v4",
  "type": "fact|decision|error|preference",
  "content": "The payment service uses Stripe API v2024-01",
  "created_at": "2026-01-25T12:00:00Z",
  "created_by": "user|agent:coder|agent:architect",
  "session_id": "session-uuid",
  "context": {
    "prd_id": "genesis/payment-system.md",
    "story_id": "STORY-003",
    "phase": "implementation"
  },
  "weight": 0.5,
  "validation_count": 0,
  "retrieval_count": 0,
  "tags": ["payment", "stripe", "api"],
  "reality_anchor": {
    "has_tests": false,
    "test_file": null,
    "test_passing": false
  },
  "lineage": {
    "parent_id": null,
    "supersedes": [],
    "superseded_by": null
  },
  "metadata": {
    "source_file": "src/services/payment.py",
    "line_number": 45
  }
}
```

---

## Commands

### /remember

Store new knowledge in the memory bank.

**Usage**:
```
/remember "The payment service uses Stripe API v2024-01"
/remember "We decided to use PostgreSQL for this project" --type=decision
/remember "XSS vulnerability fixed by escaping user input" --type=error --tags=security,xss
```

**Process**:
1. Generate unique ID (UUID v4)
2. Create memory entry with initial weight (0.5)
3. Append to appropriate JSONL file
4. Extract tags from content (or use provided tags)
5. Link to current context (PRD, story, phase)
6. Return confirmation with entry ID

**Output**:
```
MEMORY STORED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ID: 550e8400-e29b-41d4-a716-446655440000
Type: fact
Content: The payment service uses Stripe API v2024-01
Weight: 0.5
Tags: payment, stripe, api
Context: genesis/payment-system.md → STORY-003
Stored: 2026-01-25 12:00:00
```

---

### /recall

Query the knowledge base using semantic search.

**Usage**:
```
/recall "payment integration patterns"
/recall "stripe" --type=fact
/recall "database decisions" --type=decision --limit=5
```

**Process**:
1. Parse query and filters
2. Search across relevant JSONL files
3. Filter by type, tags, weight threshold
4. Rank by relevance (weight + recency + validation)
5. Return top N results with context

**Output**:
```
MEMORY SEARCH: "payment integration patterns"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found 3 items (min weight: 0.3)

1. [Weight: 0.8] The payment service uses Stripe API v2024-01
   Context: genesis/payment-system.md → STORY-003
   Stored: 2026-01-20 (5 days ago)
   Validated: 2 times
   [ID: 550e8400-...]

2. [Weight: 0.6] Payment webhooks use HMAC signature verification
   Context: genesis/payment-system.md → STORY-005
   Stored: 2026-01-22 (3 days ago)
   Validated: 1 time
   [ID: 660e8400-...]

3. [Weight: 0.4] Payment retry logic: exponential backoff, max 3 attempts
   Context: genesis/payment-system.md → STORY-007
   Stored: 2026-01-18 (7 days ago)
   [ID: 770e8400-...]
```

---

### /correct

Update or correct existing knowledge.

**Usage**:
```
/correct "Stripe API is now v2025-01, not v2024-01" --id=550e8400-...
/correct "We're using MongoDB, not PostgreSQL" --id=660e8400-...
```

**Process**:
1. Find existing entry by ID or content match
2. Create new entry with corrected content
3. Link new entry to old entry (supersedes relationship)
4. Reduce old entry weight (multiply by 0.3)
5. Increase new entry weight (start at 0.7)
6. Update lineage graph
7. Trigger review of related knowledge

**Output**:
```
KNOWLEDGE CORRECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Old Entry: [ID: 550e8400-...]
  Content: The payment service uses Stripe API v2024-01
  Weight: 0.8 → 0.24 (reduced)

New Entry: [ID: 880e8400-...]
  Content: The payment service uses Stripe API v2025-01
  Weight: 0.7 (initial)
  Supersedes: 550e8400-...

Related entries flagged for review: 2
```

---

## Weight Calculation Algorithm

```python
def calculate_weight(entry):
    base_weight = 0.5
    
    # Recency boost (decays over time)
    days_old = (now - entry.created_at).days
    recency = max(0, 1 - (days_old / 90))  # 90-day decay
    
    # Validation boost (confirmed by tests/usage)
    validation = min(1.0, entry.validation_count / 10)
    
    # Usage boost (frequently retrieved)
    usage = min(1.0, entry.retrieval_count / 20)
    
    # Reality anchor (linked to passing tests)
    reality = 0.2 if entry.reality_anchor.test_passing else 0
    
    weight = (
        0.30 * recency +
        0.30 * validation +
        0.20 * usage +
        0.20 * reality
    )
    
    # Superseded entries get heavy penalty
    if entry.lineage.superseded_by:
        weight *= 0.3
    
    return min(1.0, base_weight + weight)
```

---

## Integration Points

### With Agents

**Coder Agent**:
- `/remember` architectural decisions before coding
- `/recall` previous implementation patterns
- `/correct` when fixing bugs or improving code

**Architect Agent**:
- `/remember` architectural decisions
- `/recall` previous architecture patterns
- `/correct` when architecture evolves

**Tester Agent**:
- `/remember` error patterns and fixes
- `/recall` similar bugs from past
- `/correct` when test patterns change

**All Agents**:
- Use `/recall` before making decisions
- Use `/remember` after completing work
- Use `/correct` when learning new information

---

## Implementation Status

**Phase 1: Basic Storage** ✅
- JSONL file structure
- Append-only storage
- Basic entry format
- Bootstrap knowledge (15 pre-seeded entries)

**Phase 2: Retrieval** ✅ (v1.8.0.0)
- TF-IDF keyword-weighted search (`scripts/semantic-search.sh`)
- Weight-based ranking with type/tag filtering
- JSON output mode for tooling integration

**Phase 3: Knowledge Exchange** ✅ (v1.8.0.0)
- Knowledge harvesting across projects (`scripts/harvest.sh`)
- Project registry (`scripts/registry.sh`)
- Knowledge curator agent for evaluation and promotion
- Promotion pipeline: PROJECT_LOCAL → HARVESTED → CANDIDATE → PROMOTED → BOOTSTRAP
- Universal knowledge files: `*-universal.jsonl` (decisions, errors, patterns)
- Security sanitization (no secrets, credentials, or PII harvested)

**Phase 4: Agent Learning** ✅ (v1.9.0.0)
- Agent learning profiles (`agents/agent-profile.md`)
- Style pattern detection (naming, formatting, imports, error handling)
- Cross-agent learning (fixer → gate-keeper → coder)
- Pattern promotion through observation (3+ projects = candidate, 5+ = universal)

**Phase 5: Compliance Intelligence** ✅ (v1.9.0.0)
- Compliance presets (`agents/compliance-profiles/`)
- HIPAA (22 rules), SOC2 (28 rules), GDPR (27 rules)
- Rules are additive (never weaken existing gate-keeper rules)
- Activated via `/go --compliance=hipaa|soc2|gdpr`

### Future
- Vector embeddings for true semantic similarity
- Knowledge graph visualization
- Contradiction detection

---

**Last Updated**: February 7, 2026
**Version**: 2.0

# SkillFoundry Enhancement Roadmap

## Current State Assessment

**SkillFoundry v1.1.0** is a comprehensive **specification-based framework** with:
- Sophisticated agent personas (11 defined)
- PRD-first workflow (unique differentiator)
- Three-layer enforcement (DB, Backend, Frontend)
- Zero tolerance for placeholders
- BPSBS security standards

**Gap**: The framework is primarily **instructional** (prompts/personas) rather than **operational** (executable agent code with persistent state).

---

## Enhancement Categories

### 1. Context Engineering (HIGH PRIORITY)

**Current State**: Basic context management (reload files on reset)

**Modern Approach**: Sophisticated context window management with:
- Token budget awareness
- Dynamic context compression
- Hierarchical summarization
- Relevance-based retrieval

#### Proposed Enhancements

```
.claude/
├── context/
│   ├── context-manager.md       # Context engineering skill
│   ├── summarization-rules.md   # How to compress context
│   └── relevance-weights.json   # What to prioritize
```

**New Skill: `/context`**
```markdown
## Context Engineering Protocol

### Token Budget Management
- Track approximate token usage per file
- Prioritize: PRD > Current Story > Recent Errors > Standards
- Compress: Old stories → summaries, Completed work → audit log

### Hierarchical Context Loading
Level 1 (Always): CLAUDE.md, current PRD, current story
Level 2 (On-demand): Related stories, test results
Level 3 (Compressed): Completed features, historical decisions

### Context Window Optimization
- Before each major operation, assess remaining context budget
- If budget < 20%, trigger summarization
- If budget < 10%, archive completed work and reload essentials
```

---

### 2. MCP (Model Context Protocol) Integration (HIGH PRIORITY)

**Current State**: No MCP integration

**Modern Approach**: Standardized tool/resource protocol for:
- External data sources
- Development tools
- Database connections
- File system operations

#### Proposed MCP Servers

```
mcp-servers/
├── mcp-filesystem/           # File operations with safety
├── mcp-database/             # Schema inspection, migrations
├── mcp-git/                  # Version control operations
├── mcp-testing/              # Test runner integration
├── mcp-documentation/        # Doc generation
└── mcp-security-scanner/     # SAST/DAST integration
```

**Configuration: `mcp-config.json`**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem", "--root", "."],
      "capabilities": ["read", "write", "glob", "search"]
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@skillfoundry/mcp-database"],
      "capabilities": ["schema", "migrate", "query", "rollback"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-git"],
      "capabilities": ["status", "diff", "commit", "branch"]
    },
    "testing": {
      "command": "npx",
      "args": ["-y", "@skillfoundry/mcp-testing"],
      "capabilities": ["run", "coverage", "watch"]
    }
  }
}
```

**Benefits**:
- Standardized tool interface
- Permission model for dangerous operations
- Resource caching and invalidation
- Extensibility for new tools

---

### 3. Persistent Memory System (HIGH PRIORITY)

**Current State**: Memory Curator designed but not operational

**Modern Approach**: Implement actual persistent memory with:
- Vector embeddings for semantic search
- Knowledge graph for relationships
- Decay functions for relevance
- Contradiction detection

#### Proposed Implementation

```
memory_bank/
├── knowledge/
│   ├── facts.jsonl           # Append-only knowledge store
│   ├── decisions.jsonl       # Architectural decisions
│   ├── errors.jsonl          # Error patterns & fixes
│   └── preferences.jsonl     # User/project preferences
├── embeddings/
│   ├── knowledge.index       # Vector index (FAISS/Annoy)
│   └── model-config.json     # Embedding model settings
├── relationships/
│   ├── knowledge-graph.json  # Entity relationships
│   └── lineage.json          # Knowledge ancestry
└── retrieval/
    ├── query-cache.json      # Recent query results
    └── weights.json          # Current weight adjustments
```

**New Skill: `/remember`**
```markdown
## Persistent Memory Operations

### Store Knowledge
/remember "The payment service uses Stripe API v2024-01"
→ Creates entry in facts.jsonl
→ Generates embedding
→ Links to current context (PRD, story)

### Query Knowledge
/recall "payment integration patterns"
→ Semantic search across knowledge base
→ Returns ranked results with weights
→ Shows lineage (where knowledge came from)

### Update/Correct
/correct "Stripe API is now v2025-01, not v2024-01"
→ Creates new entry
→ Links to old entry as "supersedes"
→ Reduces old entry weight
→ Triggers related knowledge review
```

**Memory Weight Algorithm**:
```python
def calculate_weight(entry):
    base_weight = 0.5

    # Recency boost (decays over time)
    days_old = (now - entry.created_at).days
    recency = max(0, 1 - (days_old / 90))  # 90-day decay

    # Validation boost (confirmed by tests/usage)
    validation = entry.validation_count / 10  # Caps at 1.0

    # Usage boost (frequently retrieved)
    usage = min(1.0, entry.retrieval_count / 20)

    # Reality anchor (linked to passing tests)
    reality = 0.2 if entry.has_passing_tests else 0

    weight = (
        0.30 * recency +
        0.30 * validation +
        0.20 * usage +
        0.20 * reality
    )

    # Superseded entries get heavy penalty
    if entry.is_superseded:
        weight *= 0.3

    return min(1.0, base_weight + weight)
```

---

### 4. Agent Communication Protocol (MEDIUM PRIORITY)

**Current State**: Sequential handoffs via prompts

**Modern Approach**: Formal message-passing between agents with:
- Structured message format
- State preservation
- Conflict detection
- Parallel execution support

#### Proposed Protocol

```
.claude/
├── protocols/
│   ├── agent-messages.schema.json   # Message format
│   ├── handoff-rules.md             # When to hand off
│   └── conflict-resolution.md       # Disagreement handling
```

**Message Schema**:
```json
{
  "$schema": "agent-message-v1",
  "from": "architect",
  "to": "coder",
  "type": "task_assignment",
  "priority": "high",
  "context": {
    "prd_id": "genesis/user-auth.md",
    "story_id": "STORY-003",
    "phase": "implementation"
  },
  "payload": {
    "task": "Implement JWT refresh token rotation",
    "constraints": [
      "Use RS256 algorithm",
      "Store refresh tokens in HttpOnly cookies",
      "Implement token family tracking for reuse detection"
    ],
    "acceptance_criteria": [
      "Token rotation works on each refresh",
      "Reuse detection invalidates token family",
      "Tests cover all edge cases"
    ]
  },
  "dependencies": ["STORY-001", "STORY-002"],
  "deadline_phase": "before_testing"
}
```

**Conflict Resolution**:
```markdown
## When Agents Disagree

### Detection
- Architect says: "Use microservices"
- Evaluator says: "Monolith is simpler for this scope"

### Resolution Protocol
1. Identify conflict type (architecture, implementation, testing)
2. Escalate to appropriate arbiter:
   - Architecture conflicts → User decision
   - Implementation conflicts → Architect reviews
   - Testing conflicts → Standards Oracle reviews
3. Document decision with rationale
4. Update knowledge base to prevent recurrence
```

---

### 5. Reflection & Self-Critique Loop (MEDIUM PRIORITY)

**Current State**: Evaluator does final audit, but no iterative reflection

**Modern Approach**: Built-in reflection at each phase:
- Pre-action: "What could go wrong?"
- Post-action: "Did this achieve the goal?"
- Iterative: "How can I improve?"

#### Proposed Enhancement

**Add to each agent persona**:
```markdown
## Reflection Protocol (All Agents)

### Pre-Action Reflection
Before executing, ask:
1. What are the risks of this approach?
2. What assumptions am I making?
3. Have I seen similar patterns fail before?
4. Is there a simpler solution I'm overlooking?

### Post-Action Reflection
After executing, assess:
1. Did the output match the intent?
2. What edge cases did I miss?
3. What would I do differently next time?
4. Should I update the knowledge base?

### Contradiction Detection
If my output contradicts:
- Previous decisions → Flag for review
- Another agent's output → Trigger conflict resolution
- Known patterns → Justify deviation or revise

### Self-Score (0-10)
After each major output, self-assess:
- Completeness: Did I address all requirements?
- Quality: Is this production-ready?
- Security: Did I follow BPSBS?
- Confidence: How certain am I this is correct?

If self-score < 7: Request peer review before proceeding
```

---

### 6. Tool Registry & Dynamic Capabilities (MEDIUM PRIORITY)

**Current State**: Skills are static, loaded at session start

**Modern Approach**: Dynamic tool/skill discovery with:
- Capability advertisement
- Permission model
- Usage tracking
- Auto-discovery

#### Proposed Implementation

```
.claude/
├── registry/
│   ├── tools.json              # Available tools
│   ├── capabilities.json       # What each tool can do
│   └── permissions.json        # What's allowed
```

**Tool Registry Format**:
```json
{
  "tools": {
    "database-migrator": {
      "description": "Create and run database migrations",
      "capabilities": ["create_migration", "run_migration", "rollback", "status"],
      "permissions": {
        "create_migration": "auto",
        "run_migration": "confirm_staging",
        "rollback": "confirm_always"
      },
      "invocation": "/db-migrate",
      "dependencies": ["mcp-database"]
    },
    "test-runner": {
      "description": "Execute test suites",
      "capabilities": ["run_all", "run_file", "run_pattern", "coverage"],
      "permissions": {
        "run_all": "auto",
        "run_file": "auto",
        "coverage": "auto"
      },
      "invocation": "/test",
      "dependencies": ["mcp-testing"]
    }
  }
}
```

---

### 7. Parallel Agent Execution (MEDIUM PRIORITY)

**Current State**: Sequential execution only

**Modern Approach**: DAG-based parallel execution for independent tasks

#### Proposed Implementation

**New Skill: `/parallel`**
```markdown
## Parallel Execution Orchestrator

### Dependency Analysis
Given stories or tasks, build execution DAG:
- Identify independent tasks (no shared dependencies)
- Group into parallel batches
- Execute batches concurrently

### Example
Stories: [STORY-001, STORY-002, STORY-003, STORY-004]
Dependencies:
  STORY-001: []
  STORY-002: []
  STORY-003: [STORY-001]
  STORY-004: [STORY-002]

Execution Plan:
  Batch 1 (parallel): STORY-001, STORY-002
  Batch 2 (parallel): STORY-003, STORY-004 (after batch 1)

### Merge Strategy
After parallel execution:
1. Collect all outputs
2. Check for conflicts (same file modified)
3. If conflict: Serialize conflicting changes
4. If no conflict: Merge all changes
5. Run integration tests
```

---

### 8. Observability & Tracing (LOW PRIORITY BUT VALUABLE)

**Current State**: Audit log mentioned but not structured

**Modern Approach**: Full agent tracing with:
- Decision logging
- Token usage tracking
- Latency metrics
- Error rates

#### Proposed Implementation

```
logs/
├── traces/
│   ├── 2026-01-18/
│   │   ├── session-abc123.jsonl   # Full session trace
│   │   └── decisions.jsonl        # Key decisions
│   └── metrics.json               # Aggregated metrics
├── audit/
│   ├── story-completion.jsonl     # Story audit trail
│   └── security-events.jsonl      # Security-relevant events
└── dashboards/
    └── metrics-dashboard.html     # Visual dashboard
```

**Trace Entry Format**:
```json
{
  "timestamp": "2026-01-18T12:34:56Z",
  "session_id": "abc123",
  "agent": "coder",
  "action": "implement_endpoint",
  "input": {
    "story_id": "STORY-003",
    "endpoint": "/api/v1/auth/refresh"
  },
  "output": {
    "files_created": ["src/routes/auth.py"],
    "lines_added": 45,
    "tests_generated": 3
  },
  "metrics": {
    "tokens_used": 2340,
    "latency_ms": 1250,
    "confidence_score": 0.85
  },
  "reflection": {
    "self_score": 8,
    "concerns": ["Edge case: expired refresh token not tested"]
  }
}
```

---

## Implementation Priority Matrix

| Enhancement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Context Engineering | HIGH | MEDIUM | 1 |
| Persistent Memory | HIGH | HIGH | 2 |
| MCP Integration | HIGH | HIGH | 3 |
| Reflection Loop | MEDIUM | LOW | 4 |
| Agent Communication | MEDIUM | MEDIUM | 5 |
| Tool Registry | MEDIUM | MEDIUM | 6 |
| Parallel Execution | MEDIUM | HIGH | 7 |
| Observability | LOW | MEDIUM | 8 |

---

## Quick Wins (Implement Now)

### 1. Add Reflection Protocol to Existing Agents
- Add pre/post reflection sections to each agent persona
- Minimal effort, immediate quality improvement

### 2. Create Context Budget Skill
- Simple token estimation
- Priority-based context loading
- Immediate context management improvement

### 3. Implement Basic Memory Persistence
- Start with `facts.jsonl` append-only log
- Add `/remember` and `/recall` skills
- Foundation for full memory system

### 4. Add Self-Scoring to Evaluator
- Numeric quality scores for outputs
- Threshold-based escalation
- Immediate feedback loop

---

## Long-Term Vision

```
SkillFoundry v2.0 Architecture:

┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                    (CLI / IDE / Web Dashboard)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                      ORCHESTRATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Context Mgr  │  │ Memory Mgr   │  │ Agent Coordinator    │  │
│  │ (tokens,     │  │ (persistent, │  │ (DAG execution,      │  │
│  │  hierarchy)  │  │  semantic)   │  │  conflict resolution)│  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                        AGENT LAYER                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Architect │ │ Coder    │ │ Tester   │ │Evaluator │  ...      │
│  │(+reflect)│ │(+reflect)│ │(+reflect)│ │(+reflect)│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                         TOOL LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    MCP SERVERS                            │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │  │
│  │  │FileSys │ │Database│ │  Git   │ │Testing │ │Security│  │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────┐
│                     PERSISTENCE LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Knowledge    │  │ Trace Logs   │  │ Project State        │  │
│  │ (vector DB)  │  │ (JSONL)      │  │ (workflow progress)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Conclusion

**SkillFoundry is ahead of the curve** in:
- PRD-first development (novel)
- Multi-persona agent design (sophisticated)
- Three-layer enforcement (comprehensive)
- Security standards (production-grade)

**SkillFoundry needs to catch up** in:
- Actual execution runtime (currently prompt-based)
- Persistent memory (designed but not implemented)
- MCP/tool integration (modern standard)
- Context engineering (basic)
- Agent coordination (sequential only)

**Recommended Next Steps**:
1. Implement basic persistent memory (`/remember`, `/recall`)
2. Add reflection protocol to all agents
3. Create context budget management skill
4. Plan MCP integration for v2.0

The framework has **excellent bones** - the philosophy and governance are right. It needs **operational muscle** to become a fully autonomous development system.

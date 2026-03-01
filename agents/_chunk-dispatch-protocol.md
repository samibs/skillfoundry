# Chunk Dispatch Protocol v1.0.0

> Shared module for splitting large work items across multiple instances of the same agent type.
> Referenced by: `/docs`, `/coder`, `/tester`, `/refactor`, `/review`, `/migration`, `/delegate`

---

## Purpose

LLMs degrade on long files. Attention weakens over distance, context fills up, and quality drops toward the tail. This protocol solves that by:

1. **Chunking** — splitting large work into bounded sections
2. **Sharding** — dispatching each chunk to a separate agent instance
3. **Merging** — reassembling results into a coherent whole

```
BEFORE (single agent, quality degrades):
  agent → 800-line file → sharp at line 50, sloppy by line 600

AFTER (chunked parallel dispatch):
  coordinator analyzes → splits at natural boundaries
  ├── agent-1 → chunk A (lines 1-250)     sharp throughout
  ├── agent-2 → chunk B (lines 251-500)   sharp throughout
  └── agent-3 → chunk C (lines 501-750)   sharp throughout
  coordinator merges → consistency pass → done
```

---

## When to Chunk

### Decision Function

```
SHOULD_CHUNK(work_item) = TRUE if ANY of:

1. INPUT SIZE
   └── Source file > 300 lines
   └── Multiple source files totaling > 500 lines
   └── File has clearly separable sections (headers, classes, modules)

2. OUTPUT SIZE
   └── Expected output > 300 lines
   └── Output has independent sections (chapters, test suites, endpoints)
   └── Writing documentation for > 5 public APIs

3. REPETITIVE STRUCTURE
   └── Same operation applied to N items (N > 5)
   └── Same pattern across multiple files
   └── Batch transformation (e.g., migrate 10 endpoints)

4. QUALITY RISK
   └── Previous attempt degraded toward the end
   └── Task requires consistent attention throughout
   └── Each section is equally important (no "tail can be sloppy")
```

### When NOT to Chunk

```
DO NOT CHUNK when:
├── Work requires holistic understanding (threat modeling, architecture)
├── Sections have tight cross-references (function A calls B calls C)
├── Order of operations matters (database migrations)
├── Total work < 200 lines
└── Single logical unit (one function, one class with shared state)
```

---

## Chunk Boundaries

### Where to Split

Split ONLY at natural boundaries. Never mid-function, mid-class, or mid-paragraph.

| Work Type | Split At | Example |
|-----------|----------|---------|
| **Documentation** | Section headers (`## `) | Chapter 1, Chapter 2, Chapter 3 |
| **Code (functions)** | Function/method boundaries | `function A()`, `function B()`, `function C()` |
| **Code (classes)** | Class boundaries | `class User`, `class Product`, `class Order` |
| **Code (files)** | File boundaries | `auth.ts`, `payment.ts`, `notification.ts` |
| **Tests** | Test suite / describe block | `describe("Auth")`, `describe("Payment")` |
| **API docs** | Endpoint groups | `/auth/*`, `/users/*`, `/products/*` |
| **Migration** | Table / entity boundaries | Users table, Products table, Orders table |
| **Review** | File boundaries | Review file A, Review file B, Review file C |
| **Refactor** | Module boundaries | Module auth, Module payment |

### Boundary Detection Algorithm

```
DETECT_BOUNDARIES(content, type):

  IF type == "documentation":
    boundaries = find_all("^## ", content)      # H2 headers
    IF boundaries.count < 3:
      boundaries = find_all("^### ", content)   # Fall back to H3

  IF type == "code":
    boundaries = find_all(
      "^(export )?(function|class|interface|type|const .* = )",
      content
    )
    IF boundaries.count < 3:
      boundaries = find_all("^(def |class |async def )", content)

  IF type == "tests":
    boundaries = find_all(
      "^(describe|it|test|def test_|\\[Test\\]|\\[Fact\\])",
      content
    )

  RETURN boundaries
```

---

## Chunk Size Limits

### Per Agent Type

| Agent | Max Lines/Chunk | Max Tokens/Chunk | Recommended Chunks |
|-------|----------------|------------------|--------------------|
| **docs** | 200 lines | 8K tokens | 3-5 per file |
| **coder** | 150 lines | 10K tokens | 2-4 per file |
| **tester** | 200 lines | 10K tokens | 3-5 per module |
| **refactor** | 100 lines | 8K tokens | 2-3 per module |
| **review** | 250 lines | 12K tokens | 2-4 per PR |
| **migration** | 150 lines | 8K tokens | 1 per table/entity |

### Maximum Shards

```
Max parallel shards: 5 (beyond this, coordination overhead exceeds benefit)
Min chunk size: 50 lines (below this, overhead exceeds benefit)

Optimal: 3 shards of ~150-200 lines each
```

---

## Context Brief

Every shard receives a **context brief** — shared context that ensures consistency across chunks. This is the critical piece that prevents divergence.

### Context Brief Template

```markdown
## Context Brief (shared across all shards)

### Project
- Repository: [name]
- Language: [primary language]
- Framework: [if applicable]

### Style Guide
- Naming convention: [camelCase / snake_case / PascalCase]
- Comment style: [JSDoc / docstrings / XML docs]
- Indentation: [2 spaces / 4 spaces / tabs]
- Max line length: [80 / 100 / 120]

### Shared Types / Interfaces
[Paste any types, interfaces, or base classes that multiple chunks reference]

### Imports / Dependencies
[List shared imports so each chunk produces compatible code]

### Naming Decisions
[Any specific names already decided: variable names, function names, class names]

### Tone & Voice (for documentation)
[Technical level, audience, formality]

### Cross-References
[List any cross-chunk references: "Chunk B will define UserService that Chunk A imports"]
```

### Context Brief Size Budget

```
Target: < 2K tokens (leaves maximum room for chunk work)
Maximum: 4K tokens

IF context brief > 4K tokens:
  → The work is too interconnected to chunk
  → Fall back to single-agent execution
```

---

## Dispatch Format

### Chunk Dispatch Request

```json
{
  "chunk_dispatch_id": "CHUNK-20260226-001",
  "work_item": "Write API documentation for payment module",
  "agent_type": "docs",
  "strategy": "SECTION_SPLIT",
  "context_brief": "[shared context — see template above]",
  "chunks": [
    {
      "chunk_id": "CHUNK-001-A",
      "scope": "Authentication endpoints (/auth/*)",
      "input_files": ["src/routes/auth.ts"],
      "input_lines": "1-120",
      "expected_output": "API docs for 4 auth endpoints",
      "dependencies": []
    },
    {
      "chunk_id": "CHUNK-001-B",
      "scope": "User management endpoints (/users/*)",
      "input_files": ["src/routes/users.ts"],
      "input_lines": "1-180",
      "expected_output": "API docs for 6 user endpoints",
      "dependencies": []
    },
    {
      "chunk_id": "CHUNK-001-C",
      "scope": "Payment endpoints (/payments/*)",
      "input_files": ["src/routes/payments.ts"],
      "input_lines": "1-150",
      "expected_output": "API docs for 5 payment endpoints",
      "dependencies": []
    }
  ],
  "merge_strategy": "CONCATENATE_WITH_TOC",
  "consistency_pass": true
}
```

### Shard Prompt Template

Each shard agent receives this prompt structure:

```markdown
You are a [agent_type] working on ONE SECTION of a larger piece of work.
Other instances of [agent_type] are handling other sections in parallel.

## Your Scope
[chunk scope description]

## Context Brief (READ CAREFULLY - ensures consistency with other shards)
[context brief content]

## Input
[chunk-specific input files/content]

## Instructions
[agent-type-specific instructions]

## Output Requirements
- Stay within your scope. Do NOT write content for other chunks.
- Follow the style guide in the context brief exactly.
- Use the naming conventions specified.
- If you need to reference content from another chunk, use a placeholder:
  `[→ See: chunk_id description]`
- Return your output in the sub-agent response format.
  See: agents/_subagent-response-format.md
```

---

## Merge Protocol

### Step 1: Collect All Shard Outputs

```
Wait for all shards to complete (or timeout at 5 minutes per shard).

IF any shard FAILED:
  → Retry once with expanded context
  → If still fails, fall back to single-agent for that chunk
```

### Step 2: Assemble

| Strategy | When to Use | How |
|----------|-------------|-----|
| **CONCATENATE** | Sections are independent (docs chapters) | Join in order, add transitions |
| **CONCATENATE_WITH_TOC** | Documentation with table of contents | Join + generate TOC + link anchors |
| **INTERLEAVE** | Code that needs to be mixed (imports, then functions) | Collect imports from all chunks first, then functions |
| **FILE_PER_CHUNK** | Each chunk produces a separate file | No assembly needed, just collect |
| **MERGE_INTO_EXISTING** | Modifying an existing file in sections | Apply each chunk's diff to the base file |

### Step 3: Consistency Pass (MANDATORY)

After assembly, run a consistency verification:

```
CONSISTENCY CHECK:
━━━━━━━━━━━━━━━━━━

1. NAMING CONSISTENCY
   □ Same entity has same name across all chunks
   □ No conflicting type definitions
   □ Import paths are consistent

2. STYLE CONSISTENCY
   □ Indentation is uniform
   □ Comment style is uniform
   □ Heading levels follow hierarchy

3. CROSS-REFERENCE INTEGRITY
   □ All [→ See: ...] placeholders resolved
   □ No dangling references
   □ Links point to correct sections

4. COMPLETENESS
   □ No gaps between chunks (nothing was omitted)
   □ Boundaries are clean (no half-sentences, no incomplete functions)
   □ All chunks accounted for

5. TONE / VOICE (documentation only)
   □ Consistent formality level
   □ Consistent use of "you" vs "the user" vs "developers"
   □ No chunk sounds drastically different from others
```

### Step 4: Fix Inconsistencies

```
IF inconsistencies found:
  → Minor (naming, style): Auto-fix with find/replace
  → Medium (cross-references): Resolve manually in merge
  → Major (conflicting logic): Re-run the conflicting chunk with more context
```

---

## Agent-Specific Chunking Strategies

### docs (Documentation)

```
Split: By section header (## level)
Shared context: Project overview, audience, tone guide, glossary terms
Merge: CONCATENATE_WITH_TOC
Consistency: Tone, heading hierarchy, term usage

Example:
  Input: "Write full API reference for 20 endpoints"
  Chunk A: Auth endpoints (4 endpoints)
  Chunk B: User endpoints (6 endpoints)
  Chunk C: Product endpoints (5 endpoints)
  Chunk D: Order endpoints (5 endpoints)
```

### coder (Implementation)

```
Split: By class/module boundary or by file
Shared context: Types/interfaces, imports, architecture decisions
Merge: FILE_PER_CHUNK or INTERLEAVE (if same file)
Consistency: Types match, imports resolve, no duplicate definitions

Example:
  Input: "Implement CRUD for Users, Products, Orders"
  Chunk A: UserService + UserController
  Chunk B: ProductService + ProductController
  Chunk C: OrderService + OrderController
  Shared: BaseService interface, shared types, DB connection
```

### tester (Test Suites)

```
Split: By module/feature under test
Shared context: Test helpers, fixtures, mock setup, assertion patterns
Merge: FILE_PER_CHUNK
Consistency: Fixture names, mock patterns, assertion style

Example:
  Input: "Write test suite for payment module (15 endpoints)"
  Chunk A: test_checkout.py (checkout + cart endpoints)
  Chunk B: test_payment.py (payment + refund endpoints)
  Chunk C: test_subscription.py (subscription + billing endpoints)
  Shared: Test fixtures (test user, test product), mock payment gateway
```

### refactor (Code Transformation)

```
Split: By file or by module
Shared context: Refactoring pattern, before/after examples, naming map
Merge: FILE_PER_CHUNK
Consistency: Rename map applied uniformly, no missed references

Example:
  Input: "Rename userId to accountId across 12 files"
  Chunk A: Files 1-4 (auth module)
  Chunk B: Files 5-8 (user module)
  Chunk C: Files 9-12 (admin module)
  Shared: Rename map (userId → accountId, user_id → account_id)
```

### review (Code Review)

```
Split: By file in the PR
Shared context: PR description, architecture overview, review criteria
Merge: CONCATENATE (combine all file reviews into one report)
Consistency: Severity ratings calibrated, no contradictory feedback

Example:
  Input: "Review PR with 8 changed files"
  Chunk A: Review auth changes (2 files)
  Chunk B: Review API changes (3 files)
  Chunk C: Review test changes (3 files)
  Shared: PR context, what the PR is trying to achieve
```

### migration (Database Migration)

```
Split: By table/entity (NEVER split a single migration)
Shared context: ERD, foreign key relationships, naming conventions
Merge: CONCATENATE in dependency order
Consistency: Foreign keys reference correct tables, naming uniform

Example:
  Input: "Create migrations for Users, Products, Orders, OrderItems"
  Chunk A: Users + Roles tables (no dependencies)
  Chunk B: Products + Categories tables (no dependencies)
  Chunk C: Orders + OrderItems tables (depends on A and B)
  Execute: A and B in parallel, then C
```

---

## Dispatch Flow

```
┌─────────────────────────────────────────────────────────┐
│                  CHUNK DISPATCH FLOW                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. ANALYZE work item                                     │
│     └── Should we chunk? (decision function)              │
│         ├── NO  → Execute normally (single agent)         │
│         └── YES → Continue to step 2                      │
│                                                           │
│  2. DETECT boundaries                                     │
│     └── Find natural split points                         │
│     └── Validate chunk sizes (min 50, max per agent)      │
│     └── Determine chunk count (2-5)                       │
│                                                           │
│  3. BUILD context brief                                   │
│     └── Extract shared types, imports, style guide         │
│     └── Verify brief < 4K tokens                          │
│     └── Include cross-reference map                       │
│                                                           │
│  4. DISPATCH shards in parallel                           │
│     └── Each shard gets: context brief + chunk scope       │
│     └── Each shard works independently                    │
│     └── Timeout: 5 min per shard                          │
│                                                           │
│  5. COLLECT results                                       │
│     └── Wait for all shards (or timeout)                  │
│     └── Handle failures (retry or fallback)               │
│                                                           │
│  6. MERGE results                                         │
│     └── Apply merge strategy (concatenate / interleave)   │
│     └── Resolve cross-reference placeholders              │
│                                                           │
│  7. CONSISTENCY PASS                                      │
│     └── Verify naming, style, references, completeness    │
│     └── Fix minor issues automatically                    │
│     └── Flag major issues for re-run                      │
│                                                           │
│  8. DELIVER final output                                  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Output Format

### Chunk Dispatch Report

```
CHUNK DISPATCH REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Work Item: [description]
Agent Type: [agent] x [N] shards
Strategy: [split strategy]

Chunks:
  Chunk A: [scope]              ✓ SUCCESS (142 lines, 38s)
  Chunk B: [scope]              ✓ SUCCESS (168 lines, 45s)
  Chunk C: [scope]              ✓ SUCCESS (155 lines, 41s)

Merge: [strategy]               ✓ ASSEMBLED (465 lines)
Consistency: 5/5 checks         ✓ PASSED

Total time: 48s (parallel) vs ~124s (sequential)
Speedup: 2.6x

Output: [file path or summary]
```

### Chunk Failure Report

```
CHUNK DISPATCH REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Work Item: [description]
Agent Type: [agent] x [N] shards

Chunks:
  Chunk A: [scope]              ✓ SUCCESS
  Chunk B: [scope]              ✗ FAILED (timeout)
  Chunk C: [scope]              ✓ SUCCESS

Recovery:
  Chunk B: Retried with expanded context → ✓ SUCCESS

Consistency:
  Issue: Chunk B used "userId" while A and C used "accountId"
  Fix: Auto-replaced in Chunk B output

Final: ASSEMBLED with repairs
```

---

## Integration with Existing Protocols

| Protocol | Relationship |
|----------|-------------|
| `_parallel-dispatch.md` | Chunk dispatch is a specialized form of parallel dispatch. Uses same wave execution and state tracking. |
| `_recursive-decomposition.md` | Decomposition splits by TASK TYPE (different agents). Chunk dispatch splits by CONTENT (same agent). They can compose: decompose first, then chunk within each subtask. |
| `_subagent-response-format.md` | Each shard returns results in sub-agent format. Mandatory. |
| `_context-discipline.md` | Context brief enforces the same token budget principles. |

### Composition Example

```
Complex task → Recursive Decomposition
  ├── Subtask 1 (architect) → single agent (holistic)
  ├── Subtask 2 (coder)     → CHUNK DISPATCH (3 shards)
  │   ├── Shard A: UserService
  │   ├── Shard B: ProductService
  │   └── Shard C: OrderService
  ├── Subtask 3 (tester)    → CHUNK DISPATCH (3 shards)
  │   ├── Shard A: test_users.py
  │   ├── Shard B: test_products.py
  │   └── Shard C: test_orders.py
  └── Subtask 4 (gate-keeper) → single agent (holistic)
```

---

## Agents That Support Chunking

| Agent | Chunkable | Split Strategy | Notes |
|-------|-----------|---------------|-------|
| **docs** | Yes | By section header | Most natural candidate |
| **coder** | Yes | By class/file boundary | Shared types critical |
| **tester** | Yes | By module under test | Shared fixtures critical |
| **refactor** | Yes | By file/module | Rename map must be shared |
| **review** | Yes | By file in PR | Shared PR context |
| **migration** | Yes | By table/entity | Respect FK dependencies |
| **i18n** | Yes | By locale or by section | Same keys across locales |
| architect | No | — | Needs holistic view |
| security | No | — | Needs full data flow |
| debugger | No | — | Needs full trace |
| gate-keeper | No | — | Needs full context for verdict |
| evaluator | No | — | Needs complete picture |

---

## Best Practices

1. **Start with 3 shards** — The sweet spot. 2 feels like overhead, 5 creates merge complexity.
2. **Context brief is king** — Spend 30 seconds making the brief perfect. It prevents 5 minutes of merge fixes.
3. **Err toward NOT chunking** — If the work is < 200 lines or tightly coupled, single agent is fine.
4. **Test the merge** — After assembling, read the output end-to-end. Chunk boundaries should be invisible.
5. **Same agent, same rules** — Each shard follows identical agent instructions. Only the scope differs.
6. **Cross-references are expensive** — If chunks need to reference each other heavily, the work shouldn't be chunked.

---

## Remember

> "A sharp 150-line output from 3 focused agents beats a 450-line output from 1 exhausted agent."

> "Split at boundaries, share the brief, merge with care."

---

*Chunk Dispatch Protocol v1.0.0 — SkillFoundry Framework*

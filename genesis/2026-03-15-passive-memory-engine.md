# PRD: Passive Memory Engine — Auto-Harvest, Context Primer, Layered Recall

---
prd_id: passive-memory-engine
title: Passive Memory Engine
version: 1.0
status: DRAFT
created: 2026-03-15
author: SBS
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [swarm-intelligence-patterns]
  blocks: []
  shared_with: []

tags: [core, memory, pipeline, context]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry's memory system has strong storage, sync, and retrieval infrastructure — but three operational gaps cause knowledge loss and context waste:

1. **Manual harvest dependency** — Knowledge is only captured when someone runs `/gohm`. If a developer forgets (or the pipeline crashes before Phase 5), all architectural decisions, error patterns, and correction insights from that session are lost. claude-mem solves this by hooking into every tool use automatically.

2. **Blind session starts** — New sessions load CLAUDE.md and scratchpad, but have no awareness of what the memory bank contains. With 59+ entries across 10 JSONL files, there's no compact index showing what knowledge exists, what's high-weight, or what was recently added. The agent can't make informed retrieval decisions because it doesn't know what's available.

3. **Flat recall** — `/recall` (via `semantic-search.sh`) returns full entries in a single pass. There's no progressive disclosure: no way to browse an index first, then selectively expand entries. Every recall dumps full content, wasting tokens on entries the agent didn't need.

### 1.2 Proposed Solution

Three interconnected features that transform SkillFoundry's memory from "harvest-on-demand" to "always-on passive capture with smart retrieval":

1. **Auto-Harvest Hooks** — Detect and capture knowledge passively during sessions using rule-based extraction (no secondary LLM calls). Hook into story completion, gate failures, fixer interventions, and session close to extract decisions, errors, and facts automatically.

2. **Context Primer** — Generate a compact memory index (~400-800 tokens) at session start showing: entry counts by type, top-5 highest-weight entries, most recent entries, and token cost estimates. Injected into session context so the agent knows what to retrieve.

3. **Layered Recall** — Replace flat search with a 3-step progressive disclosure workflow: index (titles + types + scores) → preview (content summaries) → full (complete entries). Each step is a separate tool call, so the agent fetches only what it needs.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Knowledge entries captured per forge session | 3-5 (manual /gohm) | 10-15 (automatic) | Count new entries in *.jsonl after forge |
| Knowledge survival on pipeline crash | 0% (Phase 5 never runs) | 90%+ (auto-flush on exit) | Interrupt forge at story 5, check entries |
| Context primer token cost at session start | 0 (no primer) | 400-800 tokens | Measure primer output size |
| Recall token efficiency | ~2000 tokens per query (full dump) | ~400 tokens for index, expand on demand | Measure tokens per recall interaction |
| Sessions where /gohm is manually needed | 100% | <20% (only for deep harvest) | Track /gohm invocations vs auto-harvest events |

---

## 2. User Stories

### Primary User: Framework Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer using /forge | knowledge to be captured automatically as stories complete | I never lose architectural decisions because I forgot to run /gohm | MUST |
| US-002 | developer using /forge | knowledge to survive pipeline crashes | if the forge dies at story 8, decisions from stories 1-7 are already saved | MUST |
| US-003 | developer starting a new session | a compact summary of what's in my memory bank | I know what knowledge exists without reading 59+ JSONL entries | MUST |
| US-004 | developer recalling knowledge | to browse an index of matching entries before loading full content | I don't waste 2000 tokens on entries I didn't need | SHOULD |
| US-005 | developer using any agent | gate failures and fixer interventions to auto-record as error entries | I build a growing corpus of "what went wrong" without manual effort | SHOULD |
| US-006 | developer using /forge | the auto-harvest to not require secondary LLM calls | memory capture doesn't increase my token spend | MUST |
| US-007 | developer using /recall | to filter by type, weight, or recency in the index view | I quickly find the most relevant knowledge | SHOULD |
| US-008 | developer ending a session | session-close to auto-harvest any remaining buffered knowledge | nothing is lost between last auto-flush and session end | MUST |

---

## 3. Functional Requirements

### 3.1 Phase 1: Auto-Harvest Hooks

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Story Completion Hook | After each story completes in forge, extract decisions and facts from the story execution context (files created, patterns chosen, dependencies added) | Given STORY-003 completes with 4 new files, When the hook fires, Then 1-3 canonical JSONL entries are queued in the memory buffer with type=decision or type=fact |
| FR-002 | Gate Failure Hook | When an Anvil gate (T1-T6) or micro-gate fails, extract the failure as an error entry with root cause and resolution | Given T3 gate fails on missing tests, When the fixer resolves it, Then an error entry is queued: "T3 gate failed: missing tests for auth-service. Resolution: tester agent generated 4 test files" |
| FR-003 | Fixer Intervention Hook | When the fixer agent is triggered, record what broke, what was tried, and what worked | Given fixer retries 2x on a TypeScript error, When retry 2 succeeds, Then an error entry captures: "tsc error in auth.ts line 42: missing return type. Fix: added explicit Promise<void> return type. Attempts: 2" |
| FR-004 | Session Close Hook | On session end (normal or interrupted), flush all buffered entries and extract a session summary fact | Given a session with 5 stories and 3 auto-harvested entries buffered, When session-close runs, Then all 3 entries are flushed + 1 session summary fact is written |
| FR-005 | Rule-Based Extraction | All auto-harvest uses rule-based pattern matching, not secondary LLM calls. Patterns: file creation → fact, dependency choice → decision, error+fix → error, config change → fact | Given a story creates `src/auth/jwt-validator.ts`, When the extraction rule fires, Then it generates: type=fact, content="Created jwt-validator.ts for auth module", tags=["auth", "jwt"] |
| FR-006 | Integration with Memory Buffer | Auto-harvest entries flow through the existing `MemoryBuffer` class (dedup, canonical schema, batch flush every 3 stories) | Given 9 entries auto-harvested across 6 stories, When flush triggers at story 3 and story 6, Then entries are written in 2 batches with no duplicates |

### 3.2 Phase 2: Context Primer

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-007 | Primer Generator | Generate a compact markdown index from all `memory_bank/knowledge/*.jsonl` files showing: total entries, counts by type, top-5 by weight, 5 most recent, estimated tokens per file | Given 59 entries across 10 files, When primer runs, Then output is 400-800 tokens of structured markdown |
| FR-008 | Token Cost Estimates | Each file in the primer shows approximate token count (chars / 4 heuristic) so the agent can decide retrieval cost | Given `decisions.jsonl` is 2400 chars, When included in primer, Then it shows "~600 tokens" |
| FR-009 | Weight-Based Ranking | Top-5 entries sorted by weight (descending), showing id, type, first 80 chars of content, and weight | Given entries with weights 0.9, 0.8, 0.7, 0.6, 0.5, When primer renders top-5, Then they appear in descending weight order |
| FR-010 | Recency Section | 5 most recent entries by `created_at`, showing type, first 80 chars, and relative age | Given entries from today, yesterday, and last week, When primer renders, Then most recent appear first with "today", "1d ago", "7d ago" labels |
| FR-011 | Session Init Integration | Primer output is written to `.skillfoundry/context-primer.md` during `session-init.sh` and available for injection into agent context | Given session-init runs, When primer generates successfully, Then `.skillfoundry/context-primer.md` exists and is <800 tokens |
| FR-012 | Staleness Detection | If the newest entry is >7 days old, primer adds a warning: "Memory bank may be stale — last entry was [N] days ago. Consider running /gohm." | Given newest entry is 10 days old, When primer generates, Then staleness warning is included |

### 3.3 Phase 3: Layered Recall

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-013 | Index Mode | `/recall "query"` returns a compact index: matching entry IDs, types, first 60 chars, scores, weights. No full content. Max 20 results. | Given query "auth decisions", When 8 entries match, Then output shows 8 rows with id, type, snippet, score — total <400 tokens |
| FR-014 | Preview Mode | `/recall --preview ID1,ID2,ID3` returns content summaries (first 200 chars) for selected entries | Given 3 entry IDs, When preview requested, Then 3 entries shown with truncated content — total <600 tokens |
| FR-015 | Full Mode | `/recall --full ID1,ID2` returns complete entries with all fields (content, tags, weight, lineage, reality_anchor) | Given 2 entry IDs, When full retrieval requested, Then complete canonical entries returned |
| FR-016 | Filter Support | Index mode supports filters: `--type=decision`, `--min-weight=0.7`, `--since=7d`, `--tags=auth,security` | Given `--type=error --since=30d`, When 4 errors exist from last 30 days, Then only those 4 appear in index |
| FR-017 | Score Transparency | Each index result shows its match score breakdown (exact match bonus, word matches, type bonus, weight bonus) | Given query "database migration error", When results return, Then each shows score components |
| FR-018 | Backward Compatibility | Plain `/recall "query"` without flags still works — defaults to index mode instead of current full-dump behavior | Given existing scripts or habits using `/recall "query"`, When invoked, Then index mode returns (lighter, faster) |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Auto-harvest hook latency | < 10ms per story (rule-based string matching, no LLM calls) |
| Context primer generation | < 200ms for 100 entries (file reads + sorting) |
| Layered recall index mode | < 100ms for 100 entries (reuses semantic-search.sh scoring) |
| Memory overhead of buffered entries | < 1MB for 50 queued entries |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Auto-harvest content | Must run through `sanitize-knowledge.sh` rules: strip API keys, tokens, passwords, absolute paths |
| Context primer | Must not expose entry content that contains secrets — only show truncated snippets |
| Layered recall | Full mode must sanitize before returning (same rules as /gohm) |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Auto-harvest capture rate | 90%+ of significant events (story complete, gate fail, fixer run) generate entries |
| Primer generation success | 100% — must never fail session start; degrade to "memory bank empty" on error |
| Recall availability | 100% — must work even if some JSONL files are malformed (skip bad lines, warn) |
| Crash-safe flush | Best-effort on SIGTERM/SIGINT; buffered entries flushed before exit |

---

## 5. Technical Specifications

### 5.1 Architecture

```
SESSION START
  └─→ [Context Primer Generator] → .skillfoundry/context-primer.md
       reads: memory_bank/knowledge/*.jsonl
       output: compact index (~500 tokens)

DURING FORGE EXECUTION
  └─→ Story Complete → [Auto-Harvest: Story Hook] → MemoryBuffer.add()
  └─→ Gate Failure   → [Auto-Harvest: Gate Hook]  → MemoryBuffer.add()
  └─→ Fixer Run      → [Auto-Harvest: Fixer Hook] → MemoryBuffer.add()
  └─→ Every 3 stories → MemoryBuffer.flush()       → memory_bank/knowledge/*.jsonl

USER RECALL
  └─→ /recall "query"              → [Layered Recall: Index]   → compact list
  └─→ /recall --preview ID1,ID2    → [Layered Recall: Preview] → summaries
  └─→ /recall --full ID1           → [Layered Recall: Full]    → complete entry

SESSION END
  └─→ [Auto-Harvest: Session Hook] → MemoryBuffer.flush() + session summary
  └─→ [Context Primer: Regenerate] → .skillfoundry/context-primer.md (for next session)
```

### 5.2 Component Design

**Component: `auto-harvest.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- `harvestStoryCompletion(story: StoryResult): BufferedEntry[]` — Extract facts/decisions from completed story metadata (files created, patterns used, dependencies added)
- `harvestGateFailure(gate: GateResult): BufferedEntry[]` — Extract error entries from gate failures with root cause and resolution
- `harvestFixerIntervention(fixer: FixerResult): BufferedEntry[]` — Extract error entries from fixer attempts (what broke, attempts, resolution)
- `harvestSessionSummary(session: SessionStats): BufferedEntry` — Generate a session summary fact (stories completed, tests added, knowledge harvested)

Extraction rules (rule-based, no LLM calls):
```
FILE_CREATED    → fact: "Created {filename} for {module} — {purpose from story context}"
DEPENDENCY_ADDED → decision: "Added {dep} for {purpose} — alternatives considered: {from story}"
GATE_FAILURE    → error: "{gate} failed: {reason}. Resolution: {fix applied}"
FIXER_SUCCESS   → error: "{error type} in {file}: {message}. Fix: {what changed}. Attempts: {N}"
CONFIG_CHANGE   → fact: "Updated {config file}: {key} changed from {old} to {new}"
TEST_CREATED    → fact: "Added {N} tests in {test file} covering {module}"
```

Each rule produces a `BufferedEntry` with:
- `type`: fact | decision | error
- `content`: human-readable description
- `tags`: extracted from file paths and story context
- `storyId`: link to originating story
- `prdId`: link to originating PRD

**Component: `context-primer.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- `generatePrimer(knowledgeDir: string): string` — Read all JSONL files, produce compact markdown
- `estimateTokens(text: string): number` — chars / 4 heuristic
- `formatRelativeAge(date: string): string` — "today", "2d ago", "1w ago"

Output format:
```markdown
## Memory Bank — 59 entries

| Type | Count | Est. Tokens |
|------|-------|-------------|
| fact | 30 | ~1200 |
| decision | 12 | ~800 |
| error | 6 | ~400 |
| preference | 3 | ~150 |
| pattern | 7 | ~500 |
| bootstrap | 15 | ~900 |

### Highest Weight (retrieve with /recall --full <id>)
- [dec-a1b2] decision (0.9): "Standalone agentic loop with zero React deps..."
- [fct-c3d4] fact (0.85): "Pipeline engine is 6-phase: IGNITE→PLAN→FORGE..."
- [err-e5f6] error (0.8): "CRITICAL: eval() command injection in rejection..."
- [dec-g7h8] decision (0.75): "Keyword-based team routing with weighted regex..."
- [fct-i9j0] fact (0.7): "4 caching layers: Anthropic prompt caching, pro..."

### Most Recent
- [fct-k1l2] fact (today): "Created output-repair.ts for LLM response resi..."
- [dec-m3n4] decision (today): "Stack-based nesting repair over counter-based..."
- [fct-o5p6] fact (1d ago): "589/589 tests passing after swarm patterns int..."
- [err-q7r8] error (3d ago): "TypeScript build failed: 9 errors from new log..."
- [fct-s9t0] fact (5d ago): "Platform sync: 85 skills across 5 platforms..."

Use `/recall "query"` to search, `/recall --full <id>` to expand.
```

**Component: `layered-recall.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- `recallIndex(query: string, filters: RecallFilters): IndexResult[]` — Search all JSONL, return compact matches (id, type, snippet, score, weight). Max 20 results.
- `recallPreview(ids: string[]): PreviewResult[]` — Load specific entries, return first 200 chars of content + metadata
- `recallFull(ids: string[]): CanonicalEntry[]` — Load complete entries with all fields
- `applyFilters(entries: CanonicalEntry[], filters: RecallFilters): CanonicalEntry[]` — Filter by type, min-weight, since, tags

Reuses scoring from `semantic-search.sh`:
- Exact phrase match: +100
- Word match (>2 chars): +10 per word
- Type field match: +20
- Weight bonus: +10 * weight
- Tags match: +5 per word

Filters interface:
```typescript
interface RecallFilters {
  type?: 'fact' | 'decision' | 'error' | 'preference' | 'pattern';
  minWeight?: number;
  since?: string;       // "7d", "30d", "2026-03-01"
  tags?: string[];
  limit?: number;       // default 20
}
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Existing `memory-buffer.ts` | current | Auto-harvest entries flow through existing buffer | None — direct integration |
| Existing `memory-harvest.ts` | current | Reuse canonical schema builder, dedup logic | None — import functions |
| Existing `semantic-search.sh` | current | Layered recall reuses TF-IDF scoring algorithm | Can inline scoring if needed |
| Existing `session-init.sh` | current | Primer generation added to session init | None — additive step |
| Existing `session-close.sh` | current | Auto-harvest session summary added to close | None — additive step |
| Existing `sanitize-knowledge.sh` | current | Sanitize auto-harvested content | None — already in pipeline |

### 5.4 Integration Points

| System | Integration Type | Purpose |
|--------|------------------|---------|
| `pipeline.ts` | Event hooks | Story completion, gate failure, fixer intervention events → auto-harvest |
| `memory-buffer.ts` | Direct use | Auto-harvest entries queued via `MemoryBuffer.add()` |
| `session-init.sh` | Script addition | Add `npx tsx scripts/generate-primer.ts` step after knowledge pull |
| `session-close.sh` | Script addition | Add auto-harvest session summary + final flush before sync |
| `/recall` command | Rewrite | Replace flat search with layered index → preview → full workflow |
| `/gohm` command | Complement | /gohm remains for deep manual harvest; auto-harvest handles the common case |
| `semantic-search.sh` | Reuse | Scoring algorithm ported to TypeScript for `layered-recall.ts` |

---

## 6. Interaction with Existing Memory System

### What Changes

| Component | Before | After |
|-----------|--------|-------|
| Knowledge capture | Manual `/gohm` only | Automatic hooks + manual `/gohm` for deep harvest |
| Session start context | CLAUDE.md + scratchpad | CLAUDE.md + scratchpad + context-primer.md |
| `/recall` behavior | Full content dump | Index → preview → full (progressive disclosure) |
| `session-init.sh` | Pull global knowledge | Pull global knowledge + generate primer |
| `session-close.sh` | Sync + promote | Auto-harvest summary + flush + sync + promote |

### What Does NOT Change

| Component | Reason |
|-----------|--------|
| JSONL canonical schema | Auto-harvest produces standard canonical entries |
| `memory_bank/knowledge/` file structure | Same files, same format, more entries |
| `/gohm` command | Still available for deep manual harvest |
| `knowledge-sync.sh` daemon | Still syncs to global repo on interval |
| `sanitize-knowledge.sh` | Still runs on all entries before write |
| Weight system (0.0-1.0) | Auto-harvested entries start at 0.5, reinforced on retrieval |
| Lineage tracking | Auto-harvested entries include parent_id when correcting prior knowledge |
| Knowledge graph | New entries added to relationship graph as before |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **No secondary LLM calls**: Auto-harvest must be rule-based only. Token spend for memory capture = 0. This is a hard constraint — claude-mem's approach of calling a secondary AI agent per observation is explicitly rejected.
- **No new runtime dependencies**: No SQLite, no ChromaDB, no vector databases. JSONL files remain the storage format.
- **Context primer must be <800 tokens**: Larger primers defeat the purpose — they should be a map, not a dump.
- **Backward compatible**: Existing `/recall "query"` invocations must still work (default to index mode).
- **All 5 platforms**: Context primer and auto-harvest must work on Claude Code, Copilot, Cursor, Codex, and Gemini.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Rule-based extraction captures 80%+ of significant decisions | Some nuanced decisions may be missed | /gohm remains available for manual deep harvest |
| 400-800 tokens is sufficient for a useful primer | May be too small for large knowledge banks (500+ entries) | Add `--detailed` flag for larger primer |
| Developers will use layered recall (index → preview → full) | May prefer the old full-dump behavior | Keep `--full-dump` flag for backward compat |
| Auto-harvest doesn't generate excessive noise | Low-signal entries pollute the knowledge bank | Weight auto-harvested entries at 0.4 (below manual 0.5), let decay handle pruning |

### 7.3 Out of Scope

- [ ] Secondary LLM calls for AI-powered compression (claude-mem's approach — too expensive)
- [ ] Vector database / embedding-based semantic search (ChromaDB, Chroma, etc.)
- [ ] Real-time web viewer UI for memory browsing
- [ ] MCP server for external memory access
- [ ] Endless Mode / biomimetic context replacement
- [ ] Cross-session conversation threading
- [ ] Automatic scratchpad writing (separate PRD candidate)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Auto-harvest generates noisy low-value entries | M | M | Start weight at 0.4 for auto-harvested entries (vs 0.5 for manual). Entries that are never retrieved naturally decay. Add `--quiet` mode to suppress trivial extractions. |
| R-002 | Context primer grows too large as knowledge bank scales | L | M | Hard cap at 800 tokens. If >100 entries, show only top-10 by weight and 5 most recent. For 500+ entries, show aggregates only. |
| R-003 | Layered recall is slower than flat search for simple queries | M | L | Index mode reuses existing TF-IDF scoring — should be equivalent speed. If slower, add caching for repeated queries within a session. |
| R-004 | Rule-based extraction misclassifies entry types | M | L | Conservative classification: when uncertain, use type=fact (safest default). /gohm can reclassify during deep harvest. |
| R-005 | Auto-harvest fires on pipeline phases where MemoryBuffer isn't initialized | L | M | Guard all hooks with `if (memoryBuffer)` check. Hooks are no-ops outside pipeline context. |
| R-006 | Session-close flush races with knowledge-sync daemon | L | M | Flush completes before sync is triggered. session-close.sh already sequences: harvest → sync → stop daemon. |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Auto-Harvest Hooks | FR-001 through FR-006 — Rule-based extraction + integration with MemoryBuffer | Existing memory-buffer.ts (already built in v2.0.47) |
| 2 | Context Primer | FR-007 through FR-012 — Primer generator + session-init integration | None |
| 3 | Layered Recall | FR-013 through FR-018 — Index/preview/full modes + filter support | None |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium | Low (rule-based, integrates with existing buffer) |
| 2 | S | Low | Low (read-only, generates markdown) |
| 3 | M | Medium | Low (builds on existing semantic-search scoring) |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented (US-001, US-002, US-003, US-006, US-008)
- [ ] `auto-harvest.ts` extracts entries from story completion, gate failure, and fixer intervention
- [ ] Auto-harvest uses rule-based extraction only — zero secondary LLM calls
- [ ] Auto-harvested entries flow through existing `MemoryBuffer` with dedup
- [ ] `context-primer.ts` generates a <800 token index from all JSONL files
- [ ] Primer integrated into `session-init.sh` workflow
- [ ] `layered-recall.ts` supports index, preview, and full modes
- [ ] `/recall` command updated with `--preview`, `--full`, `--type`, `--min-weight`, `--since`, `--tags` flags
- [ ] Unit test coverage >= 80% for all new modules
- [ ] Integration test: forge run auto-harvests entries without /gohm
- [ ] Integration test: interrupted forge has auto-harvested entries on disk
- [ ] Integration test: primer generates valid markdown from 50+ entries in <200ms
- [ ] Integration test: layered recall index → preview → full workflow returns progressively more detail
- [ ] No regressions in existing test suite (589/589 passing)
- [ ] Platform sync completed (all 5 platforms for /recall command update)

---

## 11. Appendix

### 11.1 Inspiration Source

These patterns are adapted from [claude-mem](https://github.com/thedotmack/claude-mem), a Claude Code persistent memory plugin. Key concepts that informed this PRD:

| claude-mem Feature | What We Took | What We Changed |
|-------------------|--------------|-----------------|
| Automatic passive capture via lifecycle hooks | The concept of auto-harvesting without manual intervention | Rule-based extraction instead of secondary LLM calls (zero token cost) |
| Progressive disclosure with token cost visibility | Compact index showing what exists + retrieval cost | Integrated into session-init.sh, not a background service |
| 3-layer search workflow (search → timeline → details) | Index → preview → full progressive recall | Built on existing semantic-search.sh scoring, not SQLite FTS5 |
| Observation schema with structured metadata | Enriched entries with tags, context, weight visibility | Kept canonical JSONL schema, added extraction rules |

**Explicitly rejected from claude-mem:**
- Secondary LLM calls for observation compression (too expensive)
- SQLite + ChromaDB storage (conflicts with JSONL portability)
- Background HTTP worker service (adds ops complexity)
- React web viewer UI (misaligned with CLI-first philosophy)
- MCP tool integration (low priority for current workflow)
- Endless Mode / biomimetic context replacement (too experimental)

### 11.2 Existing Infrastructure Reused

| Component | How It's Reused |
|-----------|----------------|
| `memory-buffer.ts` | Auto-harvest entries flow through existing buffer (add → flush) |
| `memory-harvest.ts` | Canonical schema builder and dedup logic imported |
| `semantic-search.sh` | TF-IDF scoring algorithm ported to TypeScript for layered-recall.ts |
| `session-init.sh` | Primer generation step added |
| `session-close.sh` | Auto-harvest session summary + final flush added |
| `sanitize-knowledge.sh` | All entries sanitized before write (existing pipeline) |
| `knowledge-sync.sh` | Continues to sync auto-harvested entries to global repo |

### 11.3 References

- claude-mem repository: https://github.com/thedotmack/claude-mem
- Existing memory buffer: `sf_cli/src/core/memory-buffer.ts`
- Existing memory harvest: `sf_cli/src/core/memory-harvest.ts`
- Existing semantic search: `scripts/semantic-search.sh`
- Existing session lifecycle: `scripts/session-init.sh`, `scripts/session-close.sh`
- Canonical JSONL schema: `memory_bank/knowledge/README.md`

### 11.4 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SBS | Initial draft — 3 features from claude-mem analysis |

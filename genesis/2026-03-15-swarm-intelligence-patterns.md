# PRD: Swarm Intelligence Patterns Integration

---
prd_id: swarm-intelligence-patterns
title: Swarm Intelligence Patterns Integration
version: 1.0
status: DRAFT
created: 2026-03-15
author: SBS
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [prompt-analysis-integration]
  blocks: []
  shared_with: []

tags: [core, pipeline, resilience, quality]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry's forge pipeline has three reliability gaps that cause wasted tokens, incomplete outputs, and agents acting before verifying context:

1. **No LLM output repair** — When LLM responses are truncated or malformed (broken JSON, incomplete code blocks), the pipeline fails hard instead of recovering. MiroFish handles this with temperature decay, bracket auto-closure, and rule-based fallbacks.

2. **No research-before-acting enforcement** — Agents can generate code without first reading existing files or verifying assumptions. The REASONING block is documented but not enforced. MiroFish's ReportAgent enforces a minimum of 3 tool calls before generating any output section.

3. **No progressive artifact persistence** — When context exhausts mid-forge, in-progress story artifacts exist only in context memory. MiroFish persists report sections incrementally (`section_01.md`, `section_02.md`), so partial runs still produce usable deliverables.

Two secondary gaps compound these:

4. **No agent introspection** — Cannot query a running agent about its reasoning or decision trail. Debugging pipeline failures requires re-reading the full context.

5. **Batched memory writes missing** — Memory harvesting happens as a discrete Phase 5 at the end. If the pipeline dies mid-execution, knowledge from completed stories is lost.

### 1.2 Proposed Solution

Integrate five patterns inspired by MiroFish's swarm intelligence architecture into SkillFoundry's pipeline and agent system:

1. **LLM Output Repair** — Add JSON repair, code block closure, and fallback chain to the output processing layer.
2. **ReACT Enforcement Protocol** — Require agents to perform minimum verification tool calls before generating code or making changes.
3. **Progressive Artifact Persistence** — Write story deliverables to disk incrementally as each story completes during forge, not just at the end.
4. **Agent Introspection Interface** — Expose agent reasoning state so it can be queried mid-pipeline for debugging.
5. **Batched Memory Queue** — Buffer knowledge entries during execution and flush periodically, surviving pipeline crashes.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Pipeline recovery from truncated LLM output | 0% (hard fail) | 80%+ auto-repair | Count repaired vs failed responses in session log |
| Agents that read before writing | Not enforced | 100% of code-generating agents | Audit tool call order in session log |
| Usable artifacts after context exhaustion | 0 files on disk | All completed stories on disk | Count files in delivery/ after interrupted forge |
| Knowledge entries surviving pipeline crash | 0 (harvested at end) | All from completed stories | Compare knowledge entries vs completed story count |

---

## 2. User Stories

### Primary User: Framework Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer using /forge | the pipeline to auto-repair truncated JSON from LLM responses | a single malformed response doesn't crash my entire forge run | MUST |
| US-002 | developer using /forge | agents to verify existing code before generating new code | I don't get duplicate implementations or code that ignores existing patterns | MUST |
| US-003 | developer using /forge | completed story artifacts saved to disk as each story finishes | if context exhausts at story 6/10, I still have stories 1-5 on disk | MUST |
| US-004 | developer debugging a pipeline | to query what an agent was thinking when it made a decision | I can debug pipeline failures without re-reading the entire context | SHOULD |
| US-005 | developer using /forge | knowledge entries buffered and flushed during execution | if the pipeline crashes at story 8, I still have knowledge from stories 1-7 | SHOULD |
| US-006 | developer using any agent | truncated code blocks to be auto-closed | incomplete fence markers don't break downstream parsing | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | LLM JSON Repair | Auto-repair malformed JSON in LLM responses: close unclosed brackets/braces, fix trailing commas, strip markdown fences around JSON | Given a truncated JSON response `{"key": "val`, When processed by the repair layer, Then it returns `{"key": "val"}` and logs the repair action |
| FR-002 | LLM Code Block Closure | Detect and close unclosed markdown code fences in LLM output | Given output ending with ````typescript\nconst x = 1`, When processed, Then the closing ``` is appended and a warning logged |
| FR-003 | Temperature Decay Retry | On malformed LLM output, retry with lower temperature (0.7 → 0.4 → 0.1) before failing | Given 3 consecutive malformed responses, When all retries exhaust, Then fall back to rule-based default and log escalation |
| FR-004 | ReACT Verification Gate | Code-generating agents (coder, secure-coder, data-architect, refactor) must perform at least 2 file reads or greps before writing any file | Given coder agent receives an implementation task, When it attempts to write a file without prior read/grep, Then the gate blocks the write and forces a read first |
| FR-005 | ReACT Verification Logging | Log verification tool calls vs generation tool calls per agent per story | Given a completed story, When the session log is reviewed, Then each agent shows read_count >= 2 before first write |
| FR-006 | Progressive Story Persistence | After each story completes in forge Phase 2, write the story deliverables (created/modified files list, test files, commit stub) to `delivery/{prd-id}/STORY-{N}.md` | Given story STORY-003 completes successfully, When the pipeline continues to STORY-004, Then `delivery/{prd-id}/STORY-003.md` exists on disk with the file manifest |
| FR-007 | Progressive State Snapshot | After each story batch, persist pipeline state to `.skillfoundry/forge-state.json` with completed stories, pending stories, and issue log | Given a batch of 3 stories completes, When state is persisted, Then forge-state.json reflects all 3 as completed with their deliverables |
| FR-008 | Agent Decision Trail | Each agent records key decisions to an in-memory decision trail (what it considered, what it chose, why) during execution | Given coder agent implements a story, When introspection is requested, Then the trail shows "Considered X, chose Y because Z" entries |
| FR-009 | Introspection Slash Command | `/explain last` queries the most recent agent's decision trail and formats it for the user | Given a forge run just completed, When user runs `/explain last`, Then they see the decision trail of the last active agent |
| FR-010 | Memory Write Buffer | During forge execution, knowledge entries are buffered in memory and flushed to `memory_bank/knowledge/*.jsonl` every 3 completed stories or on pipeline pause/exit | Given 3 stories complete, When the flush triggers, Then new JSONL entries appear in memory_bank with proper canonical schema |
| FR-011 | Crash-Safe Memory Flush | On pipeline error or context exhaustion, the memory buffer flushes before exit | Given pipeline crashes at story 5, When the error handler runs, Then all buffered knowledge from stories 1-4 is written to disk |

### 3.2 User Interface Requirements

No UI — this is pipeline infrastructure. All output is CLI-based.

**CLI output changes:**
- Repair actions shown inline: `[repair] Closed unclosed JSON bracket in coder response`
- ReACT gate shown inline: `[react] coder: 3 reads, 1 grep before first write — OK`
- Progressive persistence shown: `[persist] STORY-003 deliverables saved to delivery/auth-service/STORY-003.md`
- Memory flush shown: `[memory] Flushed 4 knowledge entries (3 decisions, 1 error)`

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| JSON repair latency | < 5ms per response (string operations only, no parsing) |
| ReACT gate overhead | < 1ms (counter check before tool dispatch) |
| Progressive persist latency | < 50ms per story (single file write) |
| Memory flush latency | < 100ms per batch (append to JSONL files) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| LLM Output Repair | Must not introduce code injection — repair is structural only (brackets, fences), never content modification |
| Decision Trail | Must not log secrets or credentials — strip patterns matching API keys, tokens, passwords before recording |
| Memory Buffer | Entries sanitized before flush — same rules as existing `sanitize-knowledge.sh` |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| JSON repair success rate | 90%+ of truncated JSON recoverable |
| Progressive persist durability | 100% of completed story artifacts survive context exhaustion |
| Memory flush durability | 100% of buffered entries survive graceful shutdown; best-effort on hard crash |

---

## 5. Technical Specifications

### 5.1 Architecture

```
LLM Response → [Output Repair] → [Output Compressor] → Agent Processing
                    ↓ (log)
              session.log

Agent Tool Call → [ReACT Gate] → Tool Execution
                    ↓ (block if no prior reads)
              "Must read before write" enforcement

Story Complete → [Progressive Persist] → delivery/{prd}/STORY-{N}.md
                    ↓ (every 3 stories)
              [Memory Flush] → memory_bank/knowledge/*.jsonl

Agent Decision → [Decision Trail Buffer] → in-memory ring buffer
                    ↓ (/explain last)
              formatted output to user
```

### 5.2 Component Design

**Component: `output-repair.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- `repairJSON(raw: string): { repaired: string; fixes: string[] }` — close brackets, fix trailing commas, strip markdown fences
- `repairCodeBlocks(raw: string): { repaired: string; fixes: string[] }` — close unclosed ``` fences
- `repairLLMOutput(raw: string): { repaired: string; fixes: string[] }` — orchestrator calling both

Rules:
- Structural repair only — never modify content between delimiters
- Count open/close brackets/braces, append missing closers
- Detect trailing commas before `}` or `]`, remove them
- Detect ````lang` without matching closing ```, append it
- Log every repair action to session log with category `"repair"`

**Component: `react-gate.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- Track tool call history per agent per story: `Map<agentName, { reads: number, writes: number, firstWriteBlocked: boolean }>`
- Before any file write tool call, check `reads >= MINIMUM_READS` (default: 2)
- If insufficient reads, block the write and inject a "read first" instruction
- Log gate activations to session log with category `"react"`

Configuration:
- `REACT_MINIMUM_READS = 2` (configurable per agent type)
- Agents subject to gate: `coder`, `secure-coder`, `data-architect`, `refactor`
- Agents exempt: `tester` (generates new files), `docs` (generates new files), `ops` (generates scripts)

**Component: `progressive-persist.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- After each story completes, write deliverable manifest to `delivery/{prd-id}/STORY-{N}.md`
- Manifest includes: files created/modified, test files, commit stub, decisions made
- After each batch, update `forge-state.json` with completed/pending/failed stories
- On pipeline exit (normal or error), flush any pending state

**Component: `decision-trail.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- Ring buffer (max 50 entries per agent) storing `{ timestamp, agent, action, considered, chosen, reason }`
- Populated by agents during REASONING blocks
- Queryable via `/explain last` slash command
- Cleared on new forge run

**Component: `memory-buffer.ts`** (new file in `sf_cli/src/core/`)

Responsibilities:
- In-memory queue of canonical JSONL entries
- Flush trigger: every 3 completed stories, on pipeline pause, on pipeline exit
- Deduplication against existing entries before append (same content check)
- Append to appropriate `memory_bank/knowledge/*.jsonl` file based on entry type

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Existing `output-compressor.ts` | current | Output repair runs BEFORE compressor | None — additive |
| Existing `session-recorder.ts` | current | Repair/gate/persist events logged | None — additive |
| Existing `memory-harvest.ts` | current | Memory buffer reuses dedup logic | None — can inline |
| Existing `retry.ts` | current | Temperature decay integrates with retry | None — additive |

### 5.4 Integration Points

| System | Integration Type | Purpose |
|--------|------------------|---------|
| `retry.ts` | Code | Temperature decay on malformed output (add temperature parameter to retry options) |
| `output-compressor.ts` | Pipeline | Repair runs before compression in the output processing chain |
| `session-recorder.ts` | Events | New event categories: `repair`, `react_gate`, `persist`, `memory_flush` |
| `forge` skill | Pipeline | Progressive persist hooks into story completion and batch completion |
| `/explain` skill | Query | Reads decision trail buffer for the last active agent |
| `memory-harvest.ts` | Reuse | Memory buffer reuses canonical schema builder and dedup logic |

---

## 6. Agent Protocol Changes

### 6.1 ReACT Enforcement Protocol (`agents/_react-enforcement.md`)

New shared protocol file to be included by code-generating agents:

```markdown
## ReACT Enforcement (Research-Execute-Act-Check)

Before writing ANY file, you MUST have performed at least 2 of these verification actions:
1. Read the target file (if modifying existing code)
2. Grep for related patterns in the codebase
3. Read the test file (if one exists)
4. Read the relevant PRD or story specification

The pipeline will BLOCK your write if you haven't verified first.

Format your verification summary before each write:
VERIFIED:
- Read: [files read]
- Searched: [patterns searched]
- Conclusion: [what you learned that informs this write]
```

### 6.2 Agents to Update

| Agent | Change |
|-------|--------|
| `ruthless-coder.md` | Add `Include: agents/_react-enforcement.md` |
| `secure-coder.md` | Add `Include: agents/_react-enforcement.md` |
| `data-architect.md` | Add `Include: agents/_react-enforcement.md` |
| `refactor-agent.md` | Add `Include: agents/_react-enforcement.md` |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** JSON repair must be structural only (bracket/brace/comma fixing). Content modification would introduce silent corruption.
- **Technical:** ReACT gate applies to file writes only, not to reads, searches, or shell commands.
- **Technical:** Progressive persist writes plain markdown manifests, not binary artifacts.
- **Resource:** All components are TypeScript in `sf_cli/src/core/`, no new dependencies.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Most truncated JSON is missing closing brackets | Some truncation is mid-value, unrepairable | Log unrepairable cases, fall through to retry |
| 2 reads is sufficient minimum for ReACT gate | Some agents need more context | Make threshold configurable per agent |
| Progressive persist overhead is negligible | Large story manifests slow the pipeline | Cap manifest size at 4KB, summarize if larger |

### 7.3 Out of Scope

- [ ] GraphRAG-based memory (Zep/Neo4j integration) — too large for this PRD, separate initiative
- [ ] Dynamic ontology generation from PRDs — interesting but not a current pain point
- [ ] Dual-platform parallel execution orchestration — already handled by `sync-platforms.sh`
- [ ] Real-time streaming output to external dashboards — no current infrastructure
- [ ] Full ReACT loop with Thought/Action/Observation formatting — too invasive; start with minimum reads enforcement

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | JSON repair introduces subtle data corruption | L | H | Structural repair only; never modify content between delimiters; log every repair for audit |
| R-002 | ReACT gate slows down agents that already verify | M | L | Gate is a counter check (<1ms); agents that already read naturally pass it |
| R-003 | Progressive persist creates file clutter in delivery/ | M | L | Auto-cleanup after successful forge; .gitignore delivery/ |
| R-004 | Memory buffer lost on hard process kill (SIGKILL) | L | M | Best-effort flush on SIGTERM/SIGINT; accept loss on SIGKILL |
| R-005 | Decision trail buffer grows unbounded during long forges | M | M | Ring buffer with 50-entry cap per agent; auto-evict oldest |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Output Resilience | FR-001, FR-002, FR-003 (JSON repair, code block closure, temperature decay retry) | None |
| 2 | Research Enforcement | FR-004, FR-005 (ReACT gate, verification logging) + agent protocol updates | None |
| 3 | Progressive Persistence | FR-006, FR-007 (story persistence, state snapshots) | None |
| 4 | Knowledge Buffering | FR-010, FR-011 (memory buffer, crash-safe flush) | None |
| 5 | Introspection | FR-008, FR-009 (decision trail, /explain last) | Phases 1-2 |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium | Low |
| 2 | S | Low | Low |
| 3 | M | Medium | Low |
| 4 | S | Low | Low |
| 5 | M | Medium | Medium |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented (US-001, US-002, US-003, US-006)
- [ ] `output-repair.ts` handles truncated JSON and unclosed code blocks with tests
- [ ] `react-gate.ts` blocks writes without prior reads for coder/secure-coder/data-architect/refactor
- [ ] `progressive-persist.ts` writes story manifests to delivery/ after each story
- [ ] `memory-buffer.ts` buffers and flushes knowledge entries with dedup
- [ ] Unit test coverage >= 80% for all new modules
- [ ] Integration test: forge run with simulated truncated output recovers
- [ ] Integration test: forge run interrupted at story 5 has stories 1-4 on disk
- [ ] Agent markdown files updated with ReACT enforcement include
- [ ] Platform sync completed (all 5 platforms)
- [ ] No regressions in existing test suite

---

## 11. Appendix

### 11.1 Inspiration Source

These patterns are adapted from [MiroFish](https://github.com/samibs/MiroFish), a multi-agent swarm intelligence prediction engine. Key source files that informed this PRD:

| MiroFish File | Pattern Extracted | SkillFoundry Application |
|---------------|-------------------|--------------------------|
| `report_agent.py` | Minimum 3 tool calls per section, ReACT loop enforcement | ReACT gate (FR-004) |
| `report_agent.py` | Progressive section persistence (`section_01.md`) | Progressive story persistence (FR-006) |
| `llm_client.py` | Temperature decay retry, JSON bracket closure | Output repair (FR-001, FR-003) |
| `zep_graph_memory_updater.py` | Batched queue with periodic flush | Memory write buffer (FR-010) |
| `simulation_ipc.py` | Agent interview/introspection via IPC | Decision trail + /explain (FR-008, FR-009) |

### 11.2 References

- MiroFish repository: https://github.com/samibs/MiroFish
- Existing output compressor: `sf_cli/src/core/output-compressor.ts`
- Existing retry logic: `sf_cli/src/core/retry.ts`
- Existing session recorder: `sf_cli/src/core/session-recorder.ts`
- Existing memory harvest: `sf_cli/src/core/memory-harvest.ts`
- ReACT paper: Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (2022)

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SBS | Initial draft — 5 patterns from MiroFish analysis |

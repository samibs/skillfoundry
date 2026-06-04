# STORY-010: memory_bank Feed (Sanitized code-map Entries)

**Phase:** 3 — Tool + pipeline wiring
**PRD:** codebase-comprehension-preflight
**Priority:** SHOULD
**Effort:** S
**Status:** DONE (in-code sanitizer instead of shelling out — see Notes)
**Dependencies:** STORY-005, STORY-006
**Blocks:** —
**Affects:** FR-011

---

## Description

Close the cross-project loop: write notable structural facts — the contract surface and detected layers/models — to `memory_bank/knowledge/` tagged `code-map`, sanitized of secrets and absolute paths. This is what lets a contract bug fixed in one app surface as prior knowledge in the other tracked apps.

---

## Acceptance Contract

**done_when:**
- [x] After a `build`/`refresh`, `codemap-agent` emits sanitized facts to `memory_bank/knowledge/code-map.jsonl` tagged `code-map` (endpoint surface, model inventory, unresolved-import hotspots, layer distribution)
- [~] Records are sanitized (no absolute paths, secrets redacted) — done via an **in-code sanitizer that mirrors `scripts/sanitize-knowledge.sh`** rather than shelling out (see Notes); verified in `tests/codemap-memory-feed.test.ts`
- [x] Records are deduped: re-running on an unchanged repo appends nothing (idempotent by content-hash id)
- [x] Emission is best-effort: a write/sanitize failure returns 0 and never fails the map build (try/catch)
- [x] Opt-outable: `runCodemap({ memoryFeed: false })`; also auto-skips projects with no `memory_bank/`

**fail_when:**
- An unsanitized absolute path or secret-looking value reaches `memory_bank/`
- Re-running floods `memory_bank/` with duplicate entries
- A memory-write failure aborts the code-map build

---

## Technical Approach

1. `codemap/memory-feed.ts` — map notable facts → knowledge records; route through `sanitize-knowledge.sh` (shell out via `exec-utils`) before write.
2. Dedup via a per-fact content hash recorded in the entry; skip if present.
3. Follow the existing knowledge jsonl schema in `memory_bank/knowledge/` (match field names of current entries — do not invent a new shape).

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/memory-feed.ts` | CREATE — fact emitter |
| `mcp-server/src/agents/codemap-agent.ts` | MODIFY — call feed post-build |
| `mcp-server/tests/codemap-memory-feed.test.ts` | CREATE — sanitize + dedup tests |

---

## Security / Constraints
- Mandatory sanitization before any write to `memory_bank/` (this content syncs to the global knowledge repo).
- Opt-out for environments where knowledge sync is undesired.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `mcp-server/src/agents/codemap/memory-feed.ts` (`emitCodeMapFacts`, `buildFacts`, `sanitizeText`), called from `codemap-agent` after build/refresh. `tests/codemap-memory-feed.test.ts` (4 tests, green).
- **Safety design:** only writes when the project already has a `memory_bank/knowledge/` dir (so it never litters arbitrary repos); writes to that project's own `code-map.jsonl`. Global propagation is left to the existing knowledge-sync daemon.
- **Deviation:** sanitization is an **in-code** pass (strip repoRoot absolute paths + redact `key/secret/token/password=…`) that mirrors `scripts/sanitize-knowledge.sh`, rather than shelling out to that script. Reason: running the shell script in-process would either touch the whole knowledge dir or add bash/temp-dir fragility to a hot path; the emitted records are structural (relative paths + counts) and verified clean by test. The shell script remains the authoritative pre-commit gate.
- **Schema:** records follow the existing knowledge JSONL shape (`id,type,content,created_at,created_by,session_id,context,weight,*_count,tags`); `id = sha256(content)[:32]` gives content-hash dedup.

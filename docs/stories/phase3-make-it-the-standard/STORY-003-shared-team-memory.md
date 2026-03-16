# STORY-003: Shared Team Memory Bank

**Phase:** 1 — Team Foundation
**PRD:** phase3-make-it-the-standard
**Priority:** SHOULD
**Effort:** M
**Status:** READY
**Dependencies:** STORY-001
**Blocks:** None
**Affects:** FR-003

---

## Description

Enable teams to share a memory bank across machines using Git as the transport layer. The team config file (`skillfoundry.team.ts`) specifies a `memory.remote` Git URL and `memory.branch`. The `sf memory sync` command pushes local JSONL memory entries to the remote and pulls remote entries into the local store, performing a merge-by-ID deduplication. This enables knowledge captured by one developer (lessons, decisions, error patterns) to benefit the entire team without requiring a cloud service.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/core/team-memory.ts` exports `syncTeamMemory(config: TeamConfig): SyncResult`
- [ ] `syncTeamMemory` clones/fetches the remote repo specified in `config.memory.remote` into `.skillfoundry/team-memory/`
- [ ] Local JSONL entries from `memory_bank/knowledge/*.jsonl` are merged with remote entries using entry `id` as dedup key
- [ ] Merge strategy: remote entries with the same `id` are skipped (local wins on conflict); new remote entries are appended to local
- [ ] After merge, the combined JSONL files are pushed to the remote branch
- [ ] `sf memory sync` CLI command is registered and calls `syncTeamMemory`
- [ ] If `config.memory` is not set, `sf memory sync` prints "No team memory configured. Add memory.remote to skillfoundry.team.ts" and exits cleanly
- [ ] If the remote repo does not exist or is unreachable, the command prints a clear error with the Git URL and exits with code 1
- [ ] Sync operation uses `git pull --rebase` to minimize merge conflicts on the JSONL files
- [ ] Unit tests in `sf_cli/src/__tests__/team-memory.test.ts` cover: sync with empty remote, sync with overlapping entries (dedup), sync with unreachable remote (error), sync with no memory config (skip)

**fail_when:**
- Sync operation overwrites local entries with remote entries that have the same ID
- Sync operation creates duplicate entries (same ID appears twice in merged output)
- A network failure during sync corrupts the local memory bank
- Sync runs when no `memory.remote` is configured in team config (should skip)

---

## Technical Approach

### Team Memory Sync Flow

```
1. loadTeamConfig() → get memory.remote and memory.branch
2. Check if .skillfoundry/team-memory/ exists
   a. If not: git clone <remote> --branch <branch> --single-branch .skillfoundry/team-memory/
   b. If yes: cd .skillfoundry/team-memory/ && git fetch origin && git pull --rebase origin <branch>
3. Read local entries from memory_bank/knowledge/*.jsonl → Map<id, entry>
4. Read remote entries from .skillfoundry/team-memory/knowledge/*.jsonl → Map<id, entry>
5. Merge: for each remote entry, if ID not in local map, append to local JSONL files
6. Copy merged local JSONL files to .skillfoundry/team-memory/knowledge/
7. cd .skillfoundry/team-memory/ && git add -A && git commit -m "sf memory sync $(date -u +%Y-%m-%dT%H:%M:%SZ)" && git push origin <branch>
8. Return SyncResult with counts: { pulled: N, pushed: N, duplicatesSkipped: N }
```

### Git Operations

All Git operations use `execSync` with timeout (30 seconds for clone, 15 seconds for fetch/pull/push). Errors are caught and wrapped in a user-friendly message that includes the remote URL.

### JSONL Dedup

Each JSONL entry must have an `id` field (UUID). Dedup is performed by building a `Set<string>` of all known IDs from both local and remote. Entries without an `id` field are assigned a deterministic hash-based ID from their content before merge.

### Safety

- The local `memory_bank/` is never deleted or truncated during sync.
- If the push fails (e.g., remote has diverged), the command logs an error and suggests `git -C .skillfoundry/team-memory/ pull --rebase && sf memory sync`.
- `.skillfoundry/team-memory/` is added to `.gitignore` to prevent nesting.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/team-memory.ts` | CREATE — syncTeamMemory function, JSONL merge logic |
| `sf_cli/src/__tests__/team-memory.test.ts` | CREATE — Unit tests for sync and merge |
| `sf_cli/src/commands/memory.ts` | MODIFY — Add `sync` subcommand to existing memory command |
| `.gitignore` | MODIFY — Add `.skillfoundry/team-memory/` |

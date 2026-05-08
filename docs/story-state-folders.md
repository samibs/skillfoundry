# Story State Folders (Phase 2)

> Phase 2 of [`genesis/2026-05-08-folder-state-and-checkbox-reconciler.md`](../genesis/2026-05-08-folder-state-and-checkbox-reconciler.md).
> Builds on Phase 1 ([Story Checkbox Reconciler](story-checkbox-reconciler.md)).

## Why

Before Phase 2, story state was implicit: a story sat in
`docs/stories/<feature>/STORY-XXX.md` whether it was queued, in-flight,
blocked, or done. Reviewers had to open every file to find out. `/go`
sometimes re-ran already-complete work because it had no machine-readable
"done" signal.

Phase 2 makes state explicit by moving the file. Story state is now a
function of `ls`, not of LLM memory.

## Layout

```
docs/stories/<feature>/
├── INDEX.md                ← auto-regenerated; never edit by hand
├── todo/
│   └── STORY-001.md
├── in-progress/
│   └── STORY-002.md
├── blocked/
│   ├── STORY-003.md
│   └── STORY-003.BLOCKED.md  ← auto-generated sibling: gate, reason, timestamp
└── done/
    └── STORY-004.md
```

### State folders

| Folder | Meaning |
|--------|---------|
| `todo/` | Decomposed by `/go` from a PRD; not yet started, or unblocked and waiting for capacity. |
| `in-progress/` | Currently being implemented (Architect / Coder / Tester / Gate-Keeper running). |
| `blocked/` | A gate failed. A sibling `STORY-XXX.BLOCKED.md` records which gate, when, and why. |
| `done/` | All Anvil gates passed AND `reconcile-story-checkboxes.sh --strict` passed. |

## Tools

### `scripts/move-story.sh` — atomic state transitions

```bash
scripts/move-story.sh <story-path> <target-state> [options]
```

| Target | Effect |
|--------|--------|
| `todo` | Move to `todo/`. Cleans up any leftover `STORY-XXX.BLOCKED.md`. |
| `in-progress` | Move to `in-progress/`. |
| `blocked` | Move to `blocked/` and write `STORY-XXX.BLOCKED.md` with `--blocked-gate` and `--reason`. |
| `done` | Run reconciler in `--strict` mode first; **refuse the move (rc=3) if any artifact-tagged `- [ ]` remains**. Then move to `done/`. |

| Option | Effect |
|--------|--------|
| `--reason "<text>"` | Stored in `STORY-XXX.BLOCKED.md` (only relevant when target=blocked). |
| `--blocked-gate "<id>"` | Stored in `STORY-XXX.BLOCKED.md` — usually the failing Anvil tier (e.g. `T3-security`). |
| `--no-index` | Skip `INDEX.md` regeneration. Use for batch operations and call `regenerate_story_index` once at the end. |
| `--no-strict-done` | Skip the strict-reconcile precondition. NOT recommended — only used by the migrator. |

| Exit code | Meaning |
|-----------|---------|
| 0 | Success (or no-op when source state == target). |
| 1 | Usage / validation error. |
| 2 | Source path is not under `docs/stories/<feature>/(<state>/)?STORY-*.md`. |
| 3 | Refused `→ done` because reconciler `--strict` failed. |
| 4 | I/O / git error. |
| 5 | Concurrent move detected (source vanished mid-flight). |

The move uses `git mv` when inside a git tree, so `git log --follow` keeps
the audit trail across renames. Outside git it falls back to plain `mv`.

### `scripts/migrate-stories-to-folders.sh` — one-time migration

Idempotent. Walks `docs/stories/<feature>/`, creates the four state folders,
and moves existing flat `STORY-*.md` files into them based on their checkbox
state:

- All artifact-tagged `[x]`, no tagged `[ ]` → `done/`
- Any tagged `[ ]` → `todo/`
- No artifact tags at all → `todo/` (ambiguous; printed in the manual-review list)

```bash
# Dry run — print classifications without moving anything
scripts/migrate-stories-to-folders.sh --dry-run

# Migrate every feature under docs/stories/
scripts/migrate-stories-to-folders.sh

# Migrate one specific feature
scripts/migrate-stories-to-folders.sh docs/stories/auth
```

Safe to re-run: stories already inside a state folder are not touched, and
INDEX.md is only re-written if the content actually changed (mitigation
for noisy diffs).

### `scripts/lib/story-index.sh` — INDEX.md regeneration

Sourced by `move-story.sh` and `migrate-stories-to-folders.sh`. Public API:

```bash
. scripts/lib/story-index.sh
regenerate_story_index "docs/stories/<feature>"
```

Properties:
- Deterministic output (stories sorted by ID, no timestamps).
- Only re-writes the file if content has changed.
- Parses `# STORY-XXX — Title` headings and YAML `depends_on:` frontmatter.

## Workflow integration

### `/go` (orchestrator)

```
PRD decomposed
    └── stories generated → land in docs/stories/<feature>/todo/

Story selected for execution
    └── move-story.sh <story> in-progress

Architect → Coder → Tester → Gate-Keeper

Gate-Keeper APPROVED + reconciler --strict passes
    └── move-story.sh <story> done

Any gate FAILED / story BLOCKED
    └── move-story.sh <story> blocked --blocked-gate <gate> --reason "<reason>"
```

When iterating a feature's stories, `/go` skips any file already in `done/`.
This is the explicit fix for the "re-run completed work" failure called out
in the PRD's §1.1.

### `/layer-check`

The reconciler runs as the final step (Phase 1). If `/layer-check` is
invoked on a story already inside a state folder, an APPROVED verdict
should be followed by `move-story.sh <story> done`; a REJECTED verdict
by `move-story.sh <story> blocked` with the failing gate.

See [`.claude/commands/layer-check.md`](../.claude/commands/layer-check.md)'s
"STORY STATE FOLDERS (Phase 2)" section.

## Manual override

The framework treats the filesystem as the source of truth. A developer
can `git mv` a story between subfolders directly:

```bash
git mv docs/stories/auth/blocked/STORY-007.md docs/stories/auth/todo/
```

After the manual move, run `regenerate_story_index` (or any `move-story.sh`
invocation against the same feature) to refresh `INDEX.md`. The next `/go`
run picks up the manually-set state without complaint (FR-012).

## Concurrency

Moves are atomic at the filesystem layer (`git mv` is one operation; plain
`mv` is one syscall). If two processes race on the same story:

1. The first `git mv` succeeds.
2. The second sees the source has vanished and exits with code 5
   (`concurrent-move-detected`).

No advisory lock file is used. If parallel `/go` runs become common and
collisions matter, add a `<feature_dir>/.lock` file (R-004 in the PRD).
For a single-developer workflow this is overkill.

## Out of scope (still)

Per the PRD's §7.3, **none of the following ship in Phase 2**:

- File watcher / daemon-driven execution
- Auto-creation of stories from filesystem events
- Web UI / dashboard for story state
- Automatic regression detection (un-checking a `- [x]`) — FR-008 still applies
- Phase-3 JSON artifact handlers (`test:`, `lint:`, `layer-check:`) — those
  ship when Anvil gates emit standardized JSON artifacts

## Portability note

The INDEX regeneration uses GNU `awk` features (capture groups in `match()`).
On macOS the system `awk` is BSD awk; install GNU awk via `brew install gawk`
and ensure it's on `PATH` as `awk`. All other scripts use POSIX-portable
shell constructs.

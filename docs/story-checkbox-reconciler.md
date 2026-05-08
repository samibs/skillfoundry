# Story Checkbox Reconciler

> Phases 1 + 3 of [`genesis/2026-05-08-folder-state-and-checkbox-reconciler.md`](../genesis/2026-05-08-folder-state-and-checkbox-reconciler.md).
> See also [Story State Folders](story-state-folders.md) (Phase 2).

## Why

Story state in SkillFoundry was implicit. The agent decomposed PRDs into stories
under `docs/stories/<feature>/STORY-XXX.md`, then updated `- [ ]` → `- [x]` from
memory and frequently forgot. This produced two recurring failures: stories
appearing unfinished after the gates had passed, and `/go` re-running work that
was already complete.

The reconciler closes the loop. After every gate run, story checkboxes are
reconciled against concrete artifacts on disk. The state of `- [ ]` vs `- [x]`
in a story file is now a function of what's true, not what the LLM remembers.

## How a checkbox becomes self-reconciling

Tag the checkbox with an HTML-comment artifact pointer:

```markdown
- [ ] Build artifact present <!-- artifact: file-exists:.artifacts/STORY-042/build.ok -->
- [ ] Log says PASS          <!-- artifact: grep:.artifacts/STORY-042/log.txt:^PASS$ -->
- [ ] Manual review approved
```

After the gate that produces `.artifacts/STORY-042/build.ok` runs, invoking
the reconciler will flip that line:

```markdown
- [x] Build artifact present <!-- artifact: file-exists:.artifacts/STORY-042/build.ok -->
```

The third line — no `<!-- artifact: ... -->` tag — is **never modified** by the
reconciler. Untagged checkboxes are out of scope: they remain whatever a human
set them to.

## Artifact pointer syntax

```
<!-- artifact: <handler>:<args> -->
```

| Handler | Args | Passes when |
|---------|------|-------------|
| `file-exists` | `<repo-relative-path>` | The path resolves to an existing file or directory inside the repo. |
| `grep` | `<repo-relative-path>:<extended-regex>` | The file exists and `grep -E -q` matches the regex. The first `:` separates path and pattern; later `:` characters are part of the pattern. |
| `test` | `<repo-relative-path>` | JSON file with shape `{"passed": <bool>, "failed": <number>, "total": <number>}`. Pass when `passed == true && failed == 0`. |
| `lint` | `<repo-relative-path>` | JSON file with shape `{"violations": <number>, "files_scanned": <number>}`. Pass when `violations == 0`. |
| `layer-check` | `<repo-relative-path>` | JSON file with shape `{"status": "pass"\|"fail", "database": ..., "backend": ..., "frontend": ...}`. Pass when `status == "pass"`. |

### JSON-handler examples

Anvil gates and CI tools emit standardized JSON artifacts that the
reconciler parses. Frozen schemas live in PRD §5.2.

```markdown
- [ ] Unit tests pass     <!-- artifact: test:.artifacts/STORY-042/test.json -->
- [ ] Lint clean          <!-- artifact: lint:.artifacts/STORY-042/lint.json -->
- [ ] Layer-check pass    <!-- artifact: layer-check:.artifacts/STORY-042/layer-check.json -->
```

Schema enforcement is strict: malformed JSON, missing required fields, or
required fields with the wrong type all cause the handler to return
**invalid** (rc=2). The checkbox stays unchecked and a clear error is
logged. This is the explicit defense against a half-broken gate
producing a vacuous pass — fix the gate's output before the reconciler
will trust it.

### Path safety

The reconciler refuses to flip a box if the artifact pointer is unsafe:

- Absolute paths are rejected.
- Any `..` segment is rejected.
- Symlinks that resolve outside the repo root are rejected.

Unsafe pointers log a warning to stderr and leave the checkbox unchecked.

## Behavior contract

| Property | Behavior | Source |
|----------|----------|--------|
| Untagged checkboxes | Never modified, in either direction. | PRD FR-005 |
| Idempotent | Running twice in a row with no new artifacts produces zero changes. | PRD FR-007 |
| Non-destructive | A `- [x]` line is never reverted to `- [ ]`. If a previously-checked artifact has since vanished, a regression warning is logged to stderr but the line stays checked. Regression detection is the orchestrator's job, not the reconciler's. | PRD FR-008 |
| No content leakage | Logs include artifact paths and pass/fail booleans only — never artifact contents. Secrets in artifact files cannot leak through reconciler output. | PRD §4.2 |

## CLI

```bash
# Single story
scripts/reconcile-story-checkboxes.sh docs/stories/<feature>/STORY-001.md

# Every STORY-*.md under a feature (recursive)
scripts/reconcile-story-checkboxes.sh docs/stories/<feature>/

# Strict mode: exit non-zero if any artifact-tagged box stays unchecked.
# Used by /layer-check on stories that should be fully done.
scripts/reconcile-story-checkboxes.sh --strict docs/stories/<feature>/STORY-001.md

# Self-test (built-in, no external fixtures needed)
scripts/reconcile-story-checkboxes.sh --self-test

# Strict via env (equivalent to --strict)
SF_RECONCILER_STRICT=1 scripts/reconcile-story-checkboxes.sh docs/stories/<feature>/
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Reconciliation complete. In `--strict` mode, all tagged boxes are checked. |
| 1 | `--strict` mode and at least one artifact-tagged `- [ ]` remained. |
| 2 | Argument or usage error. |
| 3 | I/O error (target file unreadable, mktemp failure, etc.). |
| 4 | `--self-test` failed (built-in fixtures did not produce expected outcomes). |
| 5 | Unknown handler name encountered (only fatal in `--strict` mode). |

## Integration with `/layer-check`

The reconciler is the **final step** of `/layer-check`. The verdict box now
includes a `Checkbox Reconcile` row under iteration gates. If the reconciler
exits non-zero in strict mode after the gates have passed, the verdict is
REJECTED — the gate result and the checkbox state disagree, which is a
story-level audit failure even if the code itself is correct.

See [`.claude/commands/layer-check.md`](../.claude/commands/layer-check.md)'s
"STORY CHECKBOX RECONCILIATION" section for the full integration.

## Tests

```bash
# In-script self-test (10+ assertions, runs in a temp git repo)
scripts/reconcile-story-checkboxes.sh --self-test

# Shell-based test suite (43 cases covering handlers, path-safety, CLI semantics)
tests/scripts/test-reconciler.sh
```

Both run in `< 1 s` on a typical machine.

## What this is not

The reconciler is intentionally minimal. It does **not**:

- Run as a daemon or watcher. It is invoked synchronously by `/layer-check`
  and `/go`. Folder watchers are explicitly out of scope per the PRD's §7.3.
- Auto-detect regressions. A previously-checked box whose artifact has
  vanished stays checked, with a warning logged to stderr (FR-008). The
  orchestrator decides what to do about regressions — the reconciler does
  not.
- Modify untagged checkboxes. Stories with `- [ ]` lines that have no
  `<!-- artifact: ... -->` tag are sacred — humans own those.

For folder state transitions (`todo/ ↔ in-progress/ ↔ blocked/ ↔ done/`)
see [Story State Folders](story-state-folders.md).

#!/usr/bin/env bash
# scripts/migrate-stories-to-folders.sh
#
# One-time, idempotent migration that converts flat
#   docs/stories/<feature>/STORY-*.md
# into the Phase-2 folder layout:
#   docs/stories/<feature>/{todo,in-progress,blocked,done}/STORY-*.md
#
# Classification (per PRD FR-010 + §7.2):
#   - Story has any `- [ ] ... <!-- artifact: ... -->`  → todo/
#   - Story has tagged `- [x]` boxes and no tagged `- [ ]`  → done/
#   - Story has no artifact-tagged checkboxes at all  → todo/ (ambiguous,
#     printed in the manual-review list at the end)
#
# Usage:
#   migrate-stories-to-folders.sh                # all features under docs/stories/
#   migrate-stories-to-folders.sh <feature-dir>  # one specific feature
#   migrate-stories-to-folders.sh --dry-run [<feature-dir>...]
#   migrate-stories-to-folders.sh --help
#
# Idempotency:
#   - State folders are mkdir -p (no error if already present).
#   - Stories already inside a state folder are not moved.
#   - INDEX.md is regenerated each run, but only re-written if content changes.
#
# Exit codes:
#   0  success (or no-op if nothing to migrate)
#   1  usage / validation error
#   2  no docs/stories/ directory found

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"
MOVE_STORY="$SCRIPT_DIR/move-story.sh"

# shellcheck source=lib/story-index.sh
. "$LIB_DIR/story-index.sh"

DRY_RUN=0
declare -a TARGET_FEATURES=()

_log() {
    printf 'migrate level=%s %s\n' "$1" "$2" >&2
}

usage() {
    sed -n '/^# Usage:/,/^# Idempotency:/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

# Returns 0 if the story should be classified as "done", 1 for "todo".
# Echoes "ambiguous" on stdout if there were no artifact tags at all.
classify_story() {
    local file="$1"
    local tagged_unchecked tagged_checked
    tagged_unchecked="$(grep -cE '^\s*-\s+\[ \].*<!--\s*artifact:[[:space:]]*[a-z][a-z0-9-]+:' "$file" 2>/dev/null || true)"
    tagged_checked="$(grep -cE '^\s*-\s+\[x\].*<!--\s*artifact:[[:space:]]*[a-z][a-z0-9-]+:' "$file" 2>/dev/null || true)"
    tagged_unchecked="${tagged_unchecked:-0}"
    tagged_checked="${tagged_checked:-0}"

    if [ "$tagged_unchecked" -gt 0 ]; then
        printf 'todo'
        return 1
    fi
    if [ "$tagged_checked" -gt 0 ]; then
        printf 'done'
        return 0
    fi
    printf 'ambiguous'
    return 1
}

migrate_one_feature() {
    local feature_dir="$1"
    [ -d "$feature_dir" ] || { _log warn "skip-not-a-dir:$feature_dir"; return 0; }

    local feature_name
    feature_name="$(basename -- "$feature_dir")"

    # Collect any flat STORY-*.md files at the feature root (depth 1).
    local -a flat_stories=()
    while IFS= read -r f; do
        flat_stories+=("$f")
    done < <(find "$feature_dir" -maxdepth 1 -type f -name 'STORY-*.md' 2>/dev/null | sort)

    local moved=0 skipped=0 ambiguous_count=0
    local -a ambiguous_list=()

    if [ "${#flat_stories[@]}" -eq 0 ]; then
        _log info "feature=$feature_name nothing-to-migrate"
    else
        # Ensure the four state folders exist before any moves.
        local s
        for s in todo in-progress blocked done; do
            if [ "$DRY_RUN" -eq 0 ]; then
                mkdir -p -- "$feature_dir/$s"
            fi
        done

        local f cls rc
        for f in "${flat_stories[@]}"; do
            set +e
            cls="$(classify_story "$f")"
            rc=$?
            set -e

            local target
            case "$cls" in
                done) target="done" ;;
                todo) target="todo" ;;
                ambiguous)
                    target="todo"
                    ambiguous_count=$((ambiguous_count + 1))
                    ambiguous_list+=("$f")
                    ;;
                *) target="todo" ;;
            esac

            if [ "$DRY_RUN" -eq 1 ]; then
                _log dry "would-move file=$f to=$target classification=$cls"
                continue
            fi

            # Use move-story.sh so we get atomic git-aware rename behavior,
            # but with --no-strict-done so an "already done" classification
            # doesn't get blocked by a reconciler that hasn't been run yet.
            if "$MOVE_STORY" --no-strict-done --no-index "$f" "$target" >/dev/null 2>&1; then
                moved=$((moved + 1))
            else
                _log warn "move-failed file=$f target=$target"
                skipped=$((skipped + 1))
            fi
        done
    fi

    if [ "$DRY_RUN" -eq 0 ]; then
        regenerate_story_index "$feature_dir" || _log warn "index-failed feature=$feature_name"
    fi

    _log info "feature=$feature_name moved=$moved skipped=$skipped ambiguous=$ambiguous_count"

    if [ "$ambiguous_count" -gt 0 ]; then
        printf '\nManual review needed for %s/ — these stories had no artifact-tagged\n' "$feature_name" >&2
        printf 'checkboxes and were defaulted to todo/. Please verify their state:\n' >&2
        local a
        for a in "${ambiguous_list[@]}"; do
            printf '  - %s\n' "$a" >&2
        done
    fi
}

main() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --help|-h) usage; return 0 ;;
            --dry-run) DRY_RUN=1; shift ;;
            --) shift; while [ "$#" -gt 0 ]; do TARGET_FEATURES+=("$1"); shift; done ;;
            -*) _log error "unknown-flag:$1"; usage; return 1 ;;
            *) TARGET_FEATURES+=("$1"); shift ;;
        esac
    done

    # Resolve targets. If none provided, walk every immediate subdirectory of
    # docs/stories/.
    if [ "${#TARGET_FEATURES[@]}" -eq 0 ]; then
        local stories_root
        # Find the docs/stories/ relative to PWD (most callers run from repo root).
        if [ -d "docs/stories" ]; then
            stories_root="docs/stories"
        elif [ -d "../docs/stories" ]; then
            stories_root="../docs/stories"
        else
            _log error "no-docs-stories-dir-found"
            return 2
        fi
        while IFS= read -r d; do
            TARGET_FEATURES+=("$d")
        done < <(find "$stories_root" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort)
    fi

    if [ "${#TARGET_FEATURES[@]}" -eq 0 ]; then
        _log info "no-features-found"
        return 0
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
        _log info "DRY RUN — no files will be moved"
    fi

    local f
    for f in "${TARGET_FEATURES[@]}"; do
        migrate_one_feature "$f"
    done

    return 0
}

main "$@"

#!/usr/bin/env bash
# scripts/move-story.sh
#
# Atomic state transition for stories under docs/stories/<feature>/.
# (Phase 2 of genesis/2026-05-08-folder-state-and-checkbox-reconciler.md)
#
# Usage:
#   move-story.sh <story-path> <target-state>                   [options]
#
# Target states:
#   todo | in-progress | blocked | done
#
# Options:
#   --reason "<reason>"      Free-text note for transitions to blocked/.
#                            Stored in the BLOCKED sibling file.
#   --blocked-gate "<gate>"  Failing gate identifier (e.g. T3, layer-check).
#                            Stored in the BLOCKED sibling file.
#   --no-index               Skip INDEX.md regeneration (use for batch ops).
#   --no-strict-done         Skip the reconciler --strict precondition when
#                            transitioning to done. NOT recommended — only use
#                            when the reconciler isn't installed yet.
#   --help                   Show this message.
#
# Exit codes:
#   0  success (or no-op when source state == target state)
#   1  usage or validation error
#   2  source path not under docs/stories/<feature>/(<state>/)?
#   3  refused transition to done — reconciler --strict failed
#   4  I/O or git error
#   5  concurrent move detected (source vanished mid-flight)

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# shellcheck source=lib/story-index.sh
. "$LIB_DIR/story-index.sh"

VALID_STATES=(todo in-progress blocked done)

_log() {
    printf 'move-story level=%s %s\n' "$1" "$2" >&2
}

_is_valid_state() {
    local s="$1" v
    for v in "${VALID_STATES[@]}"; do
        [ "$s" = "$v" ] && return 0
    done
    return 1
}

_in_git_tree() {
    git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

usage() {
    sed -n '/^# Usage:/,/^# Exit codes:/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

main() {
    local story_path="" target_state=""
    local reason="" blocked_gate=""
    local skip_index=0 skip_strict_done=0

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --help|-h) usage; return 0 ;;
            --reason) reason="${2:-}"; shift 2 ;;
            --blocked-gate) blocked_gate="${2:-}"; shift 2 ;;
            --no-index) skip_index=1; shift ;;
            --no-strict-done) skip_strict_done=1; shift ;;
            --) shift; break ;;
            -*) _log error "unknown-flag:$1"; usage; return 1 ;;
            *)
                if [ -z "$story_path" ]; then
                    story_path="$1"
                elif [ -z "$target_state" ]; then
                    target_state="$1"
                else
                    _log error "extra-arg:$1"
                    usage
                    return 1
                fi
                shift
                ;;
        esac
    done

    if [ -z "$story_path" ] || [ -z "$target_state" ]; then
        usage
        return 1
    fi

    if ! _is_valid_state "$target_state"; then
        _log error "invalid-target-state:$target_state expected:${VALID_STATES[*]}"
        return 1
    fi

    if [ ! -f "$story_path" ]; then
        _log error "source-not-a-file:$story_path"
        return 2
    fi

    # Resolve absolute paths so subsequent string operations are unambiguous.
    local abs_path feature_dir source_state story_basename
    abs_path="$(cd "$(dirname -- "$story_path")" && pwd)/$(basename -- "$story_path")"
    story_basename="$(basename -- "$abs_path")"

    # The story must live under a `docs/stories/<feature>/[state/]<file>` shape.
    # We accept either the migrated layout (state subfolder) or the unmigrated
    # layout (story sits at the feature root).
    case "$abs_path" in
        */docs/stories/*) ;;
        *)
            _log error "not-under-docs-stories:$abs_path"
            return 2
            ;;
    esac

    local parent grandparent
    parent="$(dirname -- "$abs_path")"
    grandparent="$(dirname -- "$parent")"

    if _is_valid_state "$(basename -- "$parent")"; then
        # Migrated layout: parent IS the state folder, grandparent is the feature.
        source_state="$(basename -- "$parent")"
        feature_dir="$grandparent"
    else
        # Unmigrated layout: parent is the feature dir, no source state.
        source_state="unmigrated"
        feature_dir="$parent"
    fi

    if [ "$source_state" = "$target_state" ]; then
        _log info "no-op story=$story_basename state=$target_state"
        return 0
    fi

    # ----- Precondition: transitions to done require strict reconciliation -----
    if [ "$target_state" = "done" ] && [ "$skip_strict_done" -eq 0 ]; then
        local reconciler="$SCRIPT_DIR/reconcile-story-checkboxes.sh"
        if [ -x "$reconciler" ]; then
            set +e
            "$reconciler" --strict "$abs_path" >/dev/null 2>&1
            local rc=$?
            set -e
            if [ "$rc" -ne 0 ]; then
                _log error "refuse-done story=$story_basename detail=strict-reconcile-failed rc=$rc"
                return 3
            fi
        else
            _log warn "reconciler-not-found path=$reconciler proceeding-without-strict-check"
        fi
    fi

    # ----- Ensure target folder exists -----
    local target_dir="$feature_dir/$target_state"
    if [ ! -d "$target_dir" ]; then
        if ! mkdir -p -- "$target_dir"; then
            _log error "mkdir-failed:$target_dir"
            return 4
        fi
    fi

    local target_path="$target_dir/$story_basename"
    if [ -e "$target_path" ]; then
        _log error "target-exists:$target_path detail=will-not-clobber"
        return 4
    fi

    # ----- The move itself -----
    if _in_git_tree "$feature_dir"; then
        # `git mv` will fail with non-zero if source vanished — interpret as race.
        if ! git -C "$feature_dir" mv -- "$abs_path" "$target_path" 2>/dev/null; then
            if [ ! -e "$abs_path" ]; then
                _log error "concurrent-move-detected story=$story_basename"
                return 5
            fi
            # Maybe the file isn't tracked yet — fall back to plain mv + add/rm.
            if ! mv -- "$abs_path" "$target_path"; then
                _log error "mv-fallback-failed source=$abs_path target=$target_path"
                return 4
            fi
            git -C "$feature_dir" add -- "$target_path" 2>/dev/null || true
        fi
    else
        if ! mv -- "$abs_path" "$target_path"; then
            _log error "mv-failed source=$abs_path target=$target_path"
            return 4
        fi
    fi

    # ----- BLOCKED sibling lifecycle (FR-002) -----
    local blocked_sibling
    blocked_sibling="${story_basename%.md}.BLOCKED.md"

    if [ "$target_state" = "blocked" ]; then
        local sib_path="$target_dir/$blocked_sibling"
        local ts
        ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        {
            printf '# %s — BLOCKED\n\n' "$(basename -- "$story_basename" .md)"
            # NOTE: pass `--` so bash builtin printf does not try to parse the
            # leading "-" of "- Timestamp" as an option.
            printf -- '- Timestamp (UTC): %s\n' "$ts"
            printf -- '- Failing gate: %s\n' "${blocked_gate:-unspecified}"
            printf -- '- Reason: %s\n' "${reason:-unspecified}"
            printf '\nThis file is auto-generated by `scripts/move-story.sh`.\n'
            printf 'Removed automatically when the story leaves the blocked/ state.\n'
        } > "$sib_path"
        if _in_git_tree "$feature_dir"; then
            git -C "$feature_dir" add -- "$sib_path" 2>/dev/null || true
        fi
    else
        # Leaving blocked: clean up any stale BLOCKED sibling in any state folder.
        local s
        for s in "${VALID_STATES[@]}"; do
            local stale="$feature_dir/$s/$blocked_sibling"
            if [ -f "$stale" ]; then
                if _in_git_tree "$feature_dir"; then
                    git -C "$feature_dir" rm -f -- "$stale" >/dev/null 2>&1 || rm -f -- "$stale"
                else
                    rm -f -- "$stale"
                fi
            fi
        done
    fi

    # ----- INDEX regeneration -----
    if [ "$skip_index" -eq 0 ]; then
        if ! regenerate_story_index "$feature_dir"; then
            _log warn "index-regen-failed feature=$feature_dir"
        fi
    fi

    _log info "moved story=$story_basename from=$source_state to=$target_state"
    return 0
}

main "$@"

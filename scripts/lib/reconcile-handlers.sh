#!/usr/bin/env bash
# scripts/lib/reconcile-handlers.sh
#
# Built-in handlers for the story checkbox reconciler.
#
# Handler protocol:
#   - A handler is a bash function named `handler_<name>` (dashes in the spec
#     name become underscores in the function name: `file-exists` -> `handler_file_exists`).
#   - Argument 1: <args> string — everything after the first ':' in the artifact tag.
#   - Argument 2: repo root absolute path.
#   - Argument 3: story id (for log lines, may be empty).
#   - Exit 0  = satisfied (the checkbox should be checked).
#   - Exit 1  = unsatisfied (leave the checkbox alone).
#   - Exit 2  = invalid args / artifact malformed (treated as unsatisfied + warning).
#   - Handlers MUST NOT write to stdout. Warnings go to stderr.
#   - Handlers MUST NOT print artifact contents — only paths and pass/fail facts.
#
# Path safety:
#   - All paths are resolved relative to the repo root.
#   - Absolute paths are rejected.
#   - Any '..' segment is rejected.
#   - Symlinks that resolve outside the repo root are rejected.
#
# Note: sourced library — does NOT enable `set -u`/`set -e`, which would leak
# into the caller's shell. The reconciler entry point sets its own strict mode.

# shellcheck disable=SC2034
RECONCILE_HANDLERS_LIB_VERSION="1.0.0"

_handler_log() {
    # _handler_log <story_id> <handler> <result> <detail>
    # Emits one structured line to stderr. Never includes artifact contents.
    local story="$1" handler="$2" result="$3" detail="$4"
    printf 'reconcile handler=%s story=%s result=%s detail=%q\n' \
        "$handler" "${story:-unknown}" "$result" "$detail" >&2
}

_handler_safe_path() {
    # _handler_safe_path <repo_root> <relative_path>
    # Echoes the resolved absolute path on stdout if safe.
    # Returns non-zero (and prints nothing) if the path is unsafe.
    local repo_root="$1" rel="$2" abs

    if [ -z "$rel" ]; then
        return 1
    fi
    case "$rel" in
        /*)        return 1 ;;  # absolute paths rejected
        *..*)      return 1 ;;  # any traversal rejected (conservative)
    esac

    abs="$repo_root/$rel"
    # Refuse to follow if the path resolves outside the repo root.
    # We use a portable check: realpath if available, fallback to readlink -f.
    local resolved=""
    if command -v realpath >/dev/null 2>&1; then
        resolved="$(realpath -m -- "$abs" 2>/dev/null || true)"
    else
        resolved="$(readlink -f -- "$abs" 2>/dev/null || echo "$abs")"
    fi
    case "$resolved" in
        "$repo_root"|"$repo_root"/*) ;;
        *) return 1 ;;
    esac
    printf '%s\n' "$abs"
    return 0
}

handler_file_exists() {
    # Args format: "<repo-relative-path>"
    local args="$1" repo_root="$2" story="${3:-}"
    local abs

    if ! abs="$(_handler_safe_path "$repo_root" "$args")"; then
        _handler_log "$story" "file-exists" "invalid" "unsafe-or-empty-path:$args"
        return 2
    fi

    if [ -e "$abs" ]; then
        _handler_log "$story" "file-exists" "pass" "$args"
        return 0
    fi
    _handler_log "$story" "file-exists" "fail" "missing:$args"
    return 1
}

handler_grep() {
    # Args format: "<repo-relative-path>:<pattern>"
    # Pattern is matched with `grep -E` (extended regex). If the pattern
    # contains ':' itself, only the FIRST ':' is treated as the separator —
    # everything after it is the pattern.
    local args="$1" repo_root="$2" story="${3:-}"
    local rel pattern abs

    rel="${args%%:*}"
    pattern="${args#*:}"

    if [ -z "$rel" ] || [ "$rel" = "$args" ] || [ -z "$pattern" ]; then
        _handler_log "$story" "grep" "invalid" "expected-path:pattern"
        return 2
    fi

    if ! abs="$(_handler_safe_path "$repo_root" "$rel")"; then
        _handler_log "$story" "grep" "invalid" "unsafe-or-empty-path:$rel"
        return 2
    fi

    if [ ! -f "$abs" ]; then
        _handler_log "$story" "grep" "fail" "missing-file:$rel"
        return 1
    fi

    if grep -E -q -- "$pattern" "$abs"; then
        _handler_log "$story" "grep" "pass" "$rel"
        return 0
    fi
    _handler_log "$story" "grep" "fail" "no-match:$rel"
    return 1
}

reconcile_dispatch_handler() {
    # reconcile_dispatch_handler <handler-name> <args> <repo_root> [<story_id>]
    # Dispatches to the appropriate handler. Returns the handler's exit code,
    # or 3 if the handler name is unknown.
    local name="$1" args="$2" repo_root="$3" story="${4:-}"
    case "$name" in
        file-exists) handler_file_exists "$args" "$repo_root" "$story" ;;
        grep)        handler_grep        "$args" "$repo_root" "$story" ;;
        # test:, lint:, layer-check: are reserved for Phase 3 — refuse explicitly
        # so a Phase-1 install does not silently treat tagged checkboxes as failed.
        test|lint|layer-check)
            _handler_log "$story" "$name" "deferred" "phase-3-handler-not-installed"
            return 4
            ;;
        *)
            _handler_log "$story" "$name" "unknown" "no-such-handler"
            return 3
            ;;
    esac
}

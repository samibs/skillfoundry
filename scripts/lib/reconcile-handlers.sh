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

# ---------- Phase 3: JSON artifact handlers ----------
#
# Each handler reads a JSON file emitted by an Anvil gate (or any other
# tool) and decides pass/fail by inspecting required fields. Schemas are
# frozen by PRD §5.2 — the handler refuses to flip a checkbox if the
# JSON is malformed or missing required fields, so a half-broken gate
# can never produce a vacuous pass.
#
# Exit codes (consistent with handler_file_exists / handler_grep):
#   0  pass
#   1  fail (file missing, or JSON says the gate did not pass)
#   2  invalid (unsafe path, malformed JSON, missing required field, jq absent)

_handler_require_jq() {
    if ! command -v jq >/dev/null 2>&1; then
        _handler_log "$1" "$2" "invalid" "jq-not-installed"
        return 2
    fi
    return 0
}

_handler_load_json() {
    # _handler_load_json <abs_path> <story> <handler_name>
    # Returns 0 if file is parseable JSON, non-zero otherwise (with logging).
    local abs="$1" story="$2" name="$3"
    if ! jq empty "$abs" 2>/dev/null; then
        _handler_log "$story" "$name" "invalid" "malformed-json"
        return 2
    fi
    return 0
}

handler_test() {
    # PRD §5.2 schema: { "passed": <bool>, "failed": <number>, "total": <number> }
    # Pass condition: passed == true AND failed == 0.
    local args="$1" repo_root="$2" story="${3:-}"
    local abs

    if ! abs="$(_handler_safe_path "$repo_root" "$args")"; then
        _handler_log "$story" "test" "invalid" "unsafe-or-empty-path:$args"
        return 2
    fi
    if [ ! -f "$abs" ]; then
        _handler_log "$story" "test" "fail" "missing-file:$args"
        return 1
    fi
    _handler_require_jq "$story" "test" || return 2
    _handler_load_json "$abs" "$story" "test" || return 2

    # Required fields present and correct types.
    if ! jq -e 'has("passed") and has("failed") and (.passed | type == "boolean") and (.failed | type == "number")' \
            "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "test" "invalid" "missing-or-wrong-type:passed,failed"
        return 2
    fi

    if jq -e '.passed == true and .failed == 0' "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "test" "pass" "$args"
        return 0
    fi
    local failed total
    failed="$(jq -r '.failed' "$abs")"
    total="$(jq -r '.total // "?"' "$abs")"
    _handler_log "$story" "test" "fail" "failed=$failed total=$total"
    return 1
}

handler_lint() {
    # PRD §5.2 schema: { "violations": <number>, "files_scanned": <number> }
    # Pass condition: violations == 0.
    local args="$1" repo_root="$2" story="${3:-}"
    local abs

    if ! abs="$(_handler_safe_path "$repo_root" "$args")"; then
        _handler_log "$story" "lint" "invalid" "unsafe-or-empty-path:$args"
        return 2
    fi
    if [ ! -f "$abs" ]; then
        _handler_log "$story" "lint" "fail" "missing-file:$args"
        return 1
    fi
    _handler_require_jq "$story" "lint" || return 2
    _handler_load_json "$abs" "$story" "lint" || return 2

    if ! jq -e 'has("violations") and (.violations | type == "number")' "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "lint" "invalid" "missing-or-wrong-type:violations"
        return 2
    fi

    if jq -e '.violations == 0' "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "lint" "pass" "$args"
        return 0
    fi
    local v
    v="$(jq -r '.violations' "$abs")"
    _handler_log "$story" "lint" "fail" "violations=$v"
    return 1
}

handler_layer_check() {
    # PRD §5.2 schema: { "status": "pass"|"fail", "database": ..., "backend": ..., "frontend": ... }
    # Pass condition: status == "pass".
    local args="$1" repo_root="$2" story="${3:-}"
    local abs

    if ! abs="$(_handler_safe_path "$repo_root" "$args")"; then
        _handler_log "$story" "layer-check" "invalid" "unsafe-or-empty-path:$args"
        return 2
    fi
    if [ ! -f "$abs" ]; then
        _handler_log "$story" "layer-check" "fail" "missing-file:$args"
        return 1
    fi
    _handler_require_jq "$story" "layer-check" || return 2
    _handler_load_json "$abs" "$story" "layer-check" || return 2

    if ! jq -e 'has("status") and (.status | type == "string")' "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "layer-check" "invalid" "missing-or-wrong-type:status"
        return 2
    fi

    if jq -e '.status == "pass"' "$abs" >/dev/null 2>&1; then
        _handler_log "$story" "layer-check" "pass" "$args"
        return 0
    fi
    local s
    s="$(jq -r '.status' "$abs")"
    _handler_log "$story" "layer-check" "fail" "status=$s"
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
        test)        handler_test        "$args" "$repo_root" "$story" ;;
        lint)        handler_lint        "$args" "$repo_root" "$story" ;;
        layer-check) handler_layer_check "$args" "$repo_root" "$story" ;;
        *)
            _handler_log "$story" "$name" "unknown" "no-such-handler"
            return 3
            ;;
    esac
}

#!/usr/bin/env bash
# scripts/reconcile-story-checkboxes.sh
#
# Story Checkbox Reconciler — Phase 1 of the Folder State PRD
# (genesis/2026-05-08-folder-state-and-checkbox-reconciler.md)
#
# Reads story markdown files, finds checkboxes tagged with an artifact pointer
# (`<!-- artifact: <handler>:<args> -->`), invokes the handler, and flips
# `- [ ]` to `- [x]` on success.
#
# Properties (per PRD §3.1):
#   FR-005  Untagged checkboxes are NEVER modified.
#   FR-007  Idempotent — running twice in a row produces no change on second run.
#   FR-008  Non-destructive — never sets `- [x]` back to `- [ ]`.
#           If a previously-checked box's artifact is now missing, a warning
#           is logged but the box stays checked.
#
# Usage:
#   reconcile-story-checkboxes.sh <story-or-dir>...
#   reconcile-story-checkboxes.sh --self-test
#   reconcile-story-checkboxes.sh --strict <story-or-dir>...
#
# Exit codes:
#   0  reconciliation complete; in --strict mode all tagged boxes are checked
#   1  --strict failure: at least one artifact-tagged `- [ ]` remained
#   2  argument or usage error
#   3  I/O error (cannot read/write story file)
#   4  self-test failed
#   5  unknown handler referenced (only fatal in --strict mode)

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# shellcheck source=lib/reconcile-handlers.sh
. "$LIB_DIR/reconcile-handlers.sh"

# ---------- Repo root resolution ----------

resolve_repo_root() {
    # Resolve repo root: prefer the nearest .git ancestor, else PWD.
    local d="$PWD"
    while [ "$d" != "/" ]; do
        if [ -d "$d/.git" ] || [ -f "$d/.git" ]; then
            printf '%s\n' "$d"
            return 0
        fi
        d="$(dirname -- "$d")"
    done
    printf '%s\n' "$PWD"
}

# ---------- Logging ----------

_recon_log() {
    # _recon_log <level> <key=value>...
    local level="$1"; shift
    printf 'reconcile level=%s' "$level" >&2
    for kv in "$@"; do
        printf ' %s' "$kv" >&2
    done
    printf '\n' >&2
}

# ---------- Core line processing ----------

# Regex (POSIX-ERE compatible) for an artifact-tagged unchecked checkbox:
#   leading whitespace + "- [ ]" + anything + "<!-- artifact: handler:args -->"
# We match handler as [a-z][a-z0-9-]+ to be conservative.
ARTIFACT_RE='<!--[[:space:]]*artifact:[[:space:]]*([a-z][a-z0-9-]+):([^[:space:]>][^>]*[^[:space:]>])[[:space:]]*-->'

process_story_file() {
    # process_story_file <file> <repo_root> <strict_mode> <stats_file>
    # Walks the file line by line, rewriting matching lines, and writes the
    # result to <file> via a temp file. Updates counters in <stats_file>.
    local file="$1" repo_root="$2" strict="$3" stats="$4"
    local story_id changed=0 unresolved=0 unknown=0 warnings=0

    if [ ! -f "$file" ]; then
        _recon_log error "op=read file=$file detail=not-a-file"
        return 3
    fi
    if [ ! -r "$file" ] || [ ! -w "$file" ]; then
        _recon_log error "op=access file=$file detail=permission-denied"
        return 3
    fi

    # Derive a story id from the filename: STORY-XXX.md -> STORY-XXX, else basename.
    story_id="$(basename -- "$file" .md)"

    local tmp
    tmp="$(mktemp -- "${file}.recon.XXXXXX")" || {
        _recon_log error "op=mktemp file=$file"
        return 3
    }
    # Trap removal of the temp file on early exit.
    # shellcheck disable=SC2064
    trap "rm -f -- '$tmp'" RETURN

    while IFS='' read -r line || [ -n "$line" ]; do
        local handler="" args="" rc

        if [[ "$line" =~ $ARTIFACT_RE ]]; then
            handler="${BASH_REMATCH[1]}"
            args="${BASH_REMATCH[2]}"
        fi

        # Case 1: unchecked tagged box → run handler, maybe flip
        if [ -n "$handler" ] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]+\[[[:space:]]\] ]]; then
            set +e
            reconcile_dispatch_handler "$handler" "$args" "$repo_root" "$story_id"
            rc=$?
            set -e
            case "$rc" in
                0)
                    # NOTE: bash ${var/[ ]/...} treats [ ] as a glob char class
                    # (matches a single space), NOT a literal — so we slice the
                    # string manually around the first "[ ]" occurrence.
                    local _before _after
                    _before="${line%%\[ \]*}"
                    _after="${line#*\[ \]}"
                    line="${_before}[x]${_after}"
                    changed=$((changed + 1))
                    ;;
                1)
                    unresolved=$((unresolved + 1))
                    ;;
                2)
                    warnings=$((warnings + 1))
                    unresolved=$((unresolved + 1))
                    ;;
                3)
                    unknown=$((unknown + 1))
                    if [ "$strict" = "1" ]; then
                        printf '%s\n' "$line" >> "$tmp"
                        # Flush remaining lines before failing? Simpler: keep the
                        # file unchanged on unknown-handler in strict mode.
                        rm -f -- "$tmp"
                        return 5
                    fi
                    ;;
                4)
                    # Phase-3 handler reserved but not installed: don't flip,
                    # treat as unresolved without an "unknown" warning.
                    unresolved=$((unresolved + 1))
                    ;;
                *)
                    warnings=$((warnings + 1))
                    unresolved=$((unresolved + 1))
                    ;;
            esac
        # Case 2: already-checked tagged box → never modify, but warn if regressed (FR-008)
        elif [ -n "$handler" ] && [[ "$line" =~ ^[[:space:]]*-[[:space:]]+\[x\] ]]; then
            set +e
            reconcile_dispatch_handler "$handler" "$args" "$repo_root" "$story_id" >/dev/null 2>&1
            rc=$?
            set -e
            if [ "$rc" -ne 0 ] && [ "$rc" -ne 4 ]; then
                _recon_log warn "op=regression story=$story_id handler=$handler args=$args"
                warnings=$((warnings + 1))
            fi
        fi

        printf '%s\n' "$line" >> "$tmp"
    done < "$file"

    # Atomic replace
    if ! mv -- "$tmp" "$file"; then
        _recon_log error "op=mv file=$file"
        return 3
    fi

    # Report counters via stats file (one line per story).
    printf '%s changed=%d unresolved=%d unknown=%d warnings=%d\n' \
        "$story_id" "$changed" "$unresolved" "$unknown" "$warnings" >> "$stats"

    return 0
}

# ---------- Driver ----------

usage() {
    cat <<'EOF' >&2
Usage:
  reconcile-story-checkboxes.sh [--strict] <story-or-dir>...
  reconcile-story-checkboxes.sh --self-test
  reconcile-story-checkboxes.sh --help

Options:
  --strict     Exit non-zero if any artifact-tagged `- [ ]` remains after run.
               Also fails on unknown handler names. Honoured by /layer-check.
  --self-test  Run built-in fixtures and assertions; exits 0 on pass.
  --help       Show this message.

Environment:
  SF_RECONCILER_STRICT=1   Equivalent to passing --strict.
EOF
}

run_self_test() {
    # Builds throwaway fixtures, runs the reconciler, asserts outcomes.
    # Exits 0 on pass, 4 on fail. Self-test never touches real story files.
    local tmpdir repo_root rc=0
    tmpdir="$(mktemp -d -- "${TMPDIR:-/tmp}/sf-recon-selftest.XXXXXX")"
    # shellcheck disable=SC2064
    trap "rm -rf -- '$tmpdir'" EXIT

    # Make the temp dir its own repo so safe-path resolution works there.
    (cd "$tmpdir" && git init -q .)
    mkdir -p "$tmpdir/.artifacts/STORY-100"
    : > "$tmpdir/.artifacts/STORY-100/build.ok"
    printf 'PASS\n' > "$tmpdir/.artifacts/STORY-100/log.txt"

    local fixture="$tmpdir/STORY-100.md"
    cat > "$fixture" <<'STORY_EOF'
# STORY-100 — Self-test fixture

## Acceptance Criteria

- [ ] Build artifact present <!-- artifact: file-exists:.artifacts/STORY-100/build.ok -->
- [ ] Missing artifact <!-- artifact: file-exists:.artifacts/STORY-100/missing.ok -->
- [ ] Log contains PASS <!-- artifact: grep:.artifacts/STORY-100/log.txt:^PASS$ -->
- [ ] Log contains banned token <!-- artifact: grep:.artifacts/STORY-100/log.txt:^DENY$ -->
- [ ] Untagged checkbox stays alone
- [x] Already-checked untagged stays alone
- [x] Already-checked, artifact still pass <!-- artifact: file-exists:.artifacts/STORY-100/build.ok -->
- [x] Already-checked, artifact now missing <!-- artifact: file-exists:.artifacts/STORY-100/vanished.ok -->
- [ ] Unknown handler name <!-- artifact: nope:.artifacts/STORY-100/build.ok -->
- [ ] Unsafe traversal <!-- artifact: file-exists:../etc/passwd -->
STORY_EOF

    # Run reconciler from within the fixture repo so resolve_repo_root finds it.
    (cd "$tmpdir" && "$SCRIPT_DIR/reconcile-story-checkboxes.sh" "$fixture") \
        2> "$tmpdir/run1.log" \
        || { _recon_log error "op=self-test detail=first-run-nonzero"; rc=4; }

    # Assertions on first run
    local out
    out="$(cat "$fixture")"

    _self_assert() {
        # _self_assert <pattern> <description>
        if ! printf '%s' "$out" | grep -q -- "$1"; then
            _recon_log error "op=self-test detail=assertion-failed expected=$1 description=$2"
            rc=4
        fi
    }

    _self_assert '\- \[x\] Build artifact present <!-- artifact: file-exists:.artifacts/STORY-100/build.ok -->' \
        "tagged box with present file flips to [x]"
    _self_assert '\- \[ \] Missing artifact <!-- artifact: file-exists:.artifacts/STORY-100/missing.ok -->' \
        "tagged box with missing file stays [ ]"
    _self_assert '\- \[x\] Log contains PASS <!-- artifact: grep:.artifacts/STORY-100/log.txt:\^PASS\$ -->' \
        "grep handler matches and flips"
    _self_assert '\- \[ \] Log contains banned token <!-- artifact: grep:.artifacts/STORY-100/log.txt:\^DENY\$ -->' \
        "grep handler no-match stays [ ]"
    _self_assert '\- \[ \] Untagged checkbox stays alone' \
        "untagged unchecked stays unchecked"
    _self_assert '\- \[x\] Already-checked untagged stays alone' \
        "untagged checked stays checked"
    _self_assert '\- \[x\] Already-checked, artifact still pass' \
        "checked tagged stays checked when artifact present"
    _self_assert '\- \[x\] Already-checked, artifact now missing' \
        "checked tagged STAYS checked even when artifact missing (FR-008)"
    _self_assert '\- \[ \] Unknown handler name' \
        "unknown handler does not flip"
    _self_assert '\- \[ \] Unsafe traversal' \
        "path traversal rejected, no flip"

    # Idempotency: second run must produce zero changes.
    local before_hash after_hash
    before_hash="$(sha256sum -- "$fixture" | awk '{print $1}')"
    (cd "$tmpdir" && "$SCRIPT_DIR/reconcile-story-checkboxes.sh" "$fixture") \
        2> "$tmpdir/run2.log" || true
    after_hash="$(sha256sum -- "$fixture" | awk '{print $1}')"
    if [ "$before_hash" != "$after_hash" ]; then
        _recon_log error "op=self-test detail=idempotency-violated"
        rc=4
    fi

    # --strict mode should non-zero exit on this fixture (4 unresolved tagged boxes).
    set +e
    (cd "$tmpdir" && "$SCRIPT_DIR/reconcile-story-checkboxes.sh" --strict "$fixture") \
        > /dev/null 2> "$tmpdir/run3.log"
    local strict_rc=$?
    set -e
    if [ "$strict_rc" -eq 0 ]; then
        _recon_log error "op=self-test detail=strict-should-have-failed actual_rc=$strict_rc"
        rc=4
    fi

    if [ "$rc" -eq 0 ]; then
        printf 'reconcile self-test: PASS\n' >&2
    else
        printf 'reconcile self-test: FAIL — see %s/run*.log\n' "$tmpdir" >&2
        # Keep the temp dir on failure for inspection
        trap - EXIT
    fi
    return "$rc"
}

main() {
    local strict=0
    local -a targets=()

    if [ "${SF_RECONCILER_STRICT:-0}" = "1" ]; then
        strict=1
    fi

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --help|-h) usage; return 0 ;;
            --self-test) run_self_test; return $? ;;
            --strict) strict=1; shift ;;
            --) shift; while [ "$#" -gt 0 ]; do targets+=("$1"); shift; done ;;
            -*) _recon_log error "op=parse detail=unknown-flag:$1"; usage; return 2 ;;
            *) targets+=("$1"); shift ;;
        esac
    done

    if [ "${#targets[@]}" -eq 0 ]; then
        usage
        return 2
    fi

    local repo_root
    repo_root="$(resolve_repo_root)"

    # Resolve the repo root through any symlinks so safe-path comparisons work.
    if command -v realpath >/dev/null 2>&1; then
        repo_root="$(realpath -- "$repo_root")"
    fi

    local stats
    stats="$(mktemp)" || { _recon_log error "op=mktemp-stats"; return 3; }
    # shellcheck disable=SC2064
    trap "rm -f -- '$stats'" EXIT

    local -a story_files=()
    local t
    for t in "${targets[@]}"; do
        if [ -d "$t" ]; then
            while IFS= read -r f; do
                story_files+=("$f")
            done < <(find "$t" -type f -name 'STORY-*.md' | sort)
        elif [ -f "$t" ]; then
            story_files+=("$t")
        else
            _recon_log error "op=resolve target=$t detail=not-found"
            return 3
        fi
    done

    if [ "${#story_files[@]}" -eq 0 ]; then
        _recon_log warn "op=resolve detail=no-story-files-matched"
        return 0
    fi

    local total_changed=0 total_unresolved=0 total_unknown=0 total_warnings=0
    local f rc
    for f in "${story_files[@]}"; do
        set +e
        process_story_file "$f" "$repo_root" "$strict" "$stats"
        rc=$?
        set -e
        if [ "$rc" -ne 0 ]; then
            return "$rc"
        fi
    done

    # Aggregate counters from stats file.
    while read -r _id changed_kv unresolved_kv unknown_kv warnings_kv; do
        total_changed=$((total_changed + ${changed_kv#changed=}))
        total_unresolved=$((total_unresolved + ${unresolved_kv#unresolved=}))
        total_unknown=$((total_unknown + ${unknown_kv#unknown=}))
        total_warnings=$((total_warnings + ${warnings_kv#warnings=}))
    done < "$stats"

    _recon_log summary \
        "stories=${#story_files[@]}" \
        "changed=$total_changed" \
        "unresolved=$total_unresolved" \
        "unknown=$total_unknown" \
        "warnings=$total_warnings"

    if [ "$strict" = "1" ] && [ "$total_unresolved" -gt 0 ]; then
        _recon_log strict-fail "unresolved=$total_unresolved"
        return 1
    fi

    return 0
}

main "$@"

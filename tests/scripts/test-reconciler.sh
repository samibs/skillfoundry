#!/usr/bin/env bash
# tests/scripts/test-reconciler.sh
#
# Shell-based test suite for the story checkbox reconciler.
# Complements the in-script `--self-test` (which covers the end-to-end
# integration flow, idempotency, FR-008 non-destruction, and strict mode)
# by adding finer-grained unit tests for individual handlers and edge cases.
#
# Run:
#   tests/scripts/test-reconciler.sh
#
# Exit codes:
#   0  all tests pass
#   1  one or more tests failed

set -u

REPO_ROOT="$(cd "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/reconcile-story-checkboxes.sh"
HANDLERS_LIB="$REPO_ROOT/scripts/lib/reconcile-handlers.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

# ---------- Tiny test framework ----------

t_assert() {
    # t_assert <name> <actual> <expected> [<message>]
    local name="$1" actual="$2" expected="$3" msg="${4:-}"
    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS + 1))
        printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        printf '  FAIL %s\n' "$name"
        printf '       expected: %s\n' "$expected"
        printf '       actual:   %s\n' "$actual"
        [ -n "$msg" ] && printf '       note:     %s\n' "$msg"
    fi
}

t_assert_match() {
    # t_assert_match <name> <haystack> <needle> [<message>]
    local name="$1" haystack="$2" needle="$3" msg="${4:-}"
    if printf '%s' "$haystack" | grep -q -- "$needle"; then
        PASS=$((PASS + 1))
        printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        printf '  FAIL %s\n' "$name"
        printf '       expected match: %s\n' "$needle"
        printf '       in:             %s\n' "$haystack"
        [ -n "$msg" ] && printf '       note:           %s\n' "$msg"
    fi
}

t_section() {
    printf '\n[%s]\n' "$1"
}

# ---------- Setup ----------

TMP="$(mktemp -d -- "${TMPDIR:-/tmp}/sf-recon-test.XXXXXX")"
# shellcheck disable=SC2064
trap "rm -rf -- '$TMP'" EXIT

(cd "$TMP" && git init -q .)
mkdir -p "$TMP/.artifacts/STORY-001"
: > "$TMP/.artifacts/STORY-001/build.ok"
printf 'PASS\nfoo\nbar\n' > "$TMP/.artifacts/STORY-001/log.txt"

# Symlink that escapes the repo (used in safety tests)
ln -s "/etc/passwd" "$TMP/.artifacts/STORY-001/escape" 2>/dev/null || true

# Source the handlers lib for unit tests
# shellcheck source=../../scripts/lib/reconcile-handlers.sh
. "$HANDLERS_LIB"

# ---------- Handler unit tests ----------

t_section "handler_file_exists"

set +e
handler_file_exists ".artifacts/STORY-001/build.ok" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: present file returns 0" "$rc" "0"

set +e
handler_file_exists ".artifacts/STORY-001/missing" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: missing file returns 1" "$rc" "1"

set +e
handler_file_exists "/etc/passwd" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: absolute path rejected (rc=2)" "$rc" "2"

set +e
handler_file_exists "../../../etc/passwd" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: traversal rejected (rc=2)" "$rc" "2"

set +e
handler_file_exists "" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: empty path rejected (rc=2)" "$rc" "2"

# Symlink that escapes the repo root must be rejected.
set +e
handler_file_exists ".artifacts/STORY-001/escape" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "file-exists: symlink escape rejected (rc=2)" "$rc" "2"

t_section "handler_grep"

set +e
handler_grep ".artifacts/STORY-001/log.txt:^PASS$" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: pattern matches returns 0" "$rc" "0"

set +e
handler_grep ".artifacts/STORY-001/log.txt:^DENY$" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: no-match returns 1" "$rc" "1"

set +e
handler_grep ".artifacts/STORY-001/missing.txt:^PASS$" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: missing file returns 1" "$rc" "1"

set +e
handler_grep ".artifacts/STORY-001/log.txt" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: missing pattern part returns 2" "$rc" "2"

set +e
handler_grep "../etc/passwd:root" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: traversal rejected (rc=2)" "$rc" "2"

# Pattern that contains a colon (e.g. matching "key: value") must work — only
# the FIRST ':' is the path/pattern separator.
printf 'key: value\n' > "$TMP/.artifacts/STORY-001/colon.txt"
set +e
handler_grep ".artifacts/STORY-001/colon.txt:key: value" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "grep: pattern containing ':' is split on first ':' only" "$rc" "0"

t_section "reconcile_dispatch_handler"

set +e
reconcile_dispatch_handler "file-exists" ".artifacts/STORY-001/build.ok" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "dispatch: known handler routed correctly" "$rc" "0"

set +e
reconcile_dispatch_handler "totally-unknown" "anything" "$TMP" "STORY-001" 2>/dev/null
rc=$?
set -e
t_assert "dispatch: unknown handler returns 3" "$rc" "3"

# Phase-3 reserved names must NOT silently fall through to file-exists or
# similar — they must return the documented "deferred" code (4) so a Phase-1
# install does not pretend to validate JSON-based gates.
for reserved in test lint layer-check; do
    set +e
    reconcile_dispatch_handler "$reserved" ".artifacts/STORY-001/build.ok" "$TMP" "STORY-001" 2>/dev/null
    rc=$?
    set -e
    t_assert "dispatch: reserved Phase-3 handler '$reserved' returns 4 (deferred)" "$rc" "4"
done

# ---------- End-to-end CLI tests ----------

t_section "CLI: reconcile-story-checkboxes.sh"

# Test: untagged checkboxes are NEVER touched (FR-005).
cat > "$TMP/STORY-untagged.md" <<'EOF'
- [ ] No artifact tag should remain unchecked
- [x] Already-checked untagged stays checked
EOF
ORIG_HASH="$(sha256sum "$TMP/STORY-untagged.md" | awk '{print $1}')"
(cd "$TMP" && "$SCRIPT" "$TMP/STORY-untagged.md") >/dev/null 2>&1
NEW_HASH="$(sha256sum "$TMP/STORY-untagged.md" | awk '{print $1}')"
t_assert "untagged checkboxes are never modified (file unchanged)" "$ORIG_HASH" "$NEW_HASH"

# Test: directory target — recursively reconciles all STORY-*.md
mkdir -p "$TMP/feature-x/sub"
cat > "$TMP/feature-x/STORY-001.md" <<'EOF'
- [ ] A <!-- artifact: file-exists:.artifacts/STORY-001/build.ok -->
EOF
cat > "$TMP/feature-x/sub/STORY-002.md" <<'EOF'
- [ ] B <!-- artifact: file-exists:.artifacts/STORY-001/build.ok -->
EOF
(cd "$TMP" && "$SCRIPT" "$TMP/feature-x") >/dev/null 2>&1
t_assert_match "directory target: STORY-001 flipped" \
    "$(cat "$TMP/feature-x/STORY-001.md")" '\- \[x\] A'
t_assert_match "directory target: nested STORY-002 flipped" \
    "$(cat "$TMP/feature-x/sub/STORY-002.md")" '\- \[x\] B'

# Test: --strict exits non-zero when an artifact-tagged box stays unchecked
cat > "$TMP/STORY-strict.md" <<'EOF'
- [ ] Will not pass <!-- artifact: file-exists:.artifacts/STORY-001/never.ok -->
EOF
set +e
(cd "$TMP" && "$SCRIPT" --strict "$TMP/STORY-strict.md") >/dev/null 2>&1
rc=$?
set -e
t_assert "--strict: exits 1 when tagged box remains unchecked" "$rc" "1"

# Test: SF_RECONCILER_STRICT=1 env equivalent to --strict
set +e
(cd "$TMP" && SF_RECONCILER_STRICT=1 "$SCRIPT" "$TMP/STORY-strict.md") >/dev/null 2>&1
rc=$?
set -e
t_assert "SF_RECONCILER_STRICT=1 env behaves like --strict" "$rc" "1"

# Test: missing target returns I/O error (3)
set +e
(cd "$TMP" && "$SCRIPT" "$TMP/does-not-exist.md") >/dev/null 2>&1
rc=$?
set -e
t_assert "missing file target returns rc=3" "$rc" "3"

# Test: no args prints usage and returns 2
set +e
(cd "$TMP" && "$SCRIPT") >/dev/null 2>&1
rc=$?
set -e
t_assert "no arguments returns rc=2 (usage)" "$rc" "2"

# Test: unknown flag returns rc=2
set +e
(cd "$TMP" && "$SCRIPT" --bogus) >/dev/null 2>&1
rc=$?
set -e
t_assert "unknown flag returns rc=2" "$rc" "2"

# Test: built-in --self-test exits 0
set +e
(cd "$TMP" && "$SCRIPT" --self-test) >/dev/null 2>&1
rc=$?
set -e
t_assert "--self-test exits 0 on a healthy install" "$rc" "0"

# ---------- Summary ----------

printf '\n=========================================\n'
printf 'reconciler tests: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
    printf 'failed:\n'
    for n in "${FAILED_NAMES[@]}"; do
        printf '  - %s\n' "$n"
    done
    exit 1
fi
exit 0

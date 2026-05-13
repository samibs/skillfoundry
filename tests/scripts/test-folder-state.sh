#!/usr/bin/env bash
# tests/scripts/test-folder-state.sh
#
# Phase-2 tests for the folder state machine:
#   - scripts/lib/story-index.sh   (INDEX regeneration)
#   - scripts/move-story.sh        (atomic state transitions)
#   - scripts/migrate-stories-to-folders.sh  (one-time migration)
#
# Each test runs in its own throwaway git repo under TMPDIR.

set -u

REPO_ROOT="$(cd "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
INDEX_LIB="$REPO_ROOT/scripts/lib/story-index.sh"
MOVE="$REPO_ROOT/scripts/move-story.sh"
MIGRATE="$REPO_ROOT/scripts/migrate-stories-to-folders.sh"

PASS=0; FAIL=0; FAILED_NAMES=()

t_assert() {
    local name="$1" actual="$2" expected="$3" msg="${4:-}"
    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS + 1)); printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
        printf '  FAIL %s\n' "$name"
        printf '       expected: %s\n' "$expected"
        printf '       actual:   %s\n' "$actual"
        [ -n "$msg" ] && printf '       note:     %s\n' "$msg"
    fi
}

t_assert_match() {
    local name="$1" haystack="$2" needle="$3"
    if printf '%s' "$haystack" | grep -q -- "$needle"; then
        PASS=$((PASS + 1)); printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
        printf '  FAIL %s\n' "$name"
        printf '       expected match: %s\n' "$needle"
    fi
}

t_assert_no_match() {
    local name="$1" haystack="$2" needle="$3"
    if printf '%s' "$haystack" | grep -q -- "$needle"; then
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
        printf '  FAIL %s\n' "$name"
        printf '       expected NO match for: %s\n' "$needle"
    else
        PASS=$((PASS + 1)); printf '  ok   %s\n' "$name"
    fi
}

t_assert_file_exists() {
    local name="$1" path="$2"
    if [ -f "$path" ]; then
        PASS=$((PASS + 1)); printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
        printf '  FAIL %s (missing: %s)\n' "$name" "$path"
    fi
}

t_assert_file_absent() {
    local name="$1" path="$2"
    if [ ! -e "$path" ]; then
        PASS=$((PASS + 1)); printf '  ok   %s\n' "$name"
    else
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("$name")
        printf '  FAIL %s (still exists: %s)\n' "$name" "$path"
    fi
}

t_section() { printf '\n[%s]\n' "$1"; }

new_repo() {
    local d
    d="$(mktemp -d -- "${TMPDIR:-/tmp}/sf-fs-test.XXXXXX")"
    (cd "$d" && git init -q .)
    printf '%s\n' "$d"
}

# ---------- story-index lib unit tests ----------

t_section "story-index: title and depends_on extraction"

REPO="$(new_repo)"
mkdir -p "$REPO/docs/stories/foo/done" "$REPO/docs/stories/foo/todo"

cat > "$REPO/docs/stories/foo/done/STORY-001.md" <<'EOF'
---
story_id: STORY-001
depends_on: []
---
# STORY-001 — Title with em dash
EOF

cat > "$REPO/docs/stories/foo/done/STORY-002.md" <<'EOF'
# STORY-002: Title with colon
EOF

cat > "$REPO/docs/stories/foo/todo/STORY-003.md" <<'EOF'
---
story_id: STORY-003
depends_on: [STORY-001, STORY-002]
---
# STORY-003 - Title with hyphen
EOF

cat > "$REPO/docs/stories/foo/todo/STORY-004.md" <<'EOF'
---
story_id: STORY-004
depends_on:
  - STORY-001
  - STORY-003
---
# STORY-004 — Block-list deps
EOF

# Bare regenerate via library function
( . "$INDEX_LIB" && regenerate_story_index "$REPO/docs/stories/foo" )
INDEX_CONTENT="$(cat "$REPO/docs/stories/foo/INDEX.md")"

t_assert_match "title-extract: em dash heading"   "$INDEX_CONTENT" 'Title with em dash'
t_assert_match "title-extract: colon heading"     "$INDEX_CONTENT" 'Title with colon'
t_assert_match "title-extract: hyphen heading"    "$INDEX_CONTENT" 'Title with hyphen'
t_assert_match "deps: inline list extracted"      "$INDEX_CONTENT" 'STORY-001, STORY-002'
t_assert_match "deps: block list extracted"       "$INDEX_CONTENT" 'STORY-001, STORY-003'
t_assert_match "deps: empty deps shown as dash"   "$INDEX_CONTENT" '| STORY-002 | Title with colon | .* | — |'

# Idempotency
SHA1="$(sha256sum "$REPO/docs/stories/foo/INDEX.md" | awk '{print $1}')"
( . "$INDEX_LIB" && regenerate_story_index "$REPO/docs/stories/foo" )
SHA2="$(sha256sum "$REPO/docs/stories/foo/INDEX.md" | awk '{print $1}')"
t_assert "INDEX idempotent (same hash on second run)" "$SHA1" "$SHA2"

rm -rf "$REPO"

# ---------- move-story tests ----------

t_section "move-story: validation"

REPO="$(new_repo)"
mkdir -p "$REPO/docs/stories/auth/todo"
echo "# STORY-001 — t" > "$REPO/docs/stories/auth/todo/STORY-001.md"
(cd "$REPO" && git add -A && git commit -q -m init)

set +e
(cd "$REPO" && "$MOVE") >/dev/null 2>&1; rc=$?
set -e
t_assert "no args returns rc=1" "$rc" "1"

set +e
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/todo/STORY-001.md" not-a-state) >/dev/null 2>&1; rc=$?
set -e
t_assert "invalid target state returns rc=1" "$rc" "1"

set +e
(cd "$REPO" && "$MOVE" "$REPO/somewhere-else.md" todo) >/dev/null 2>&1; rc=$?
set -e
t_assert "missing source file returns rc=2" "$rc" "2"

# Path not under docs/stories/
mkdir -p "$REPO/elsewhere"
echo "# STORY-X" > "$REPO/elsewhere/STORY-001.md"
set +e
(cd "$REPO" && "$MOVE" "$REPO/elsewhere/STORY-001.md" todo) >/dev/null 2>&1; rc=$?
set -e
t_assert "story not under docs/stories/ rejected with rc=2" "$rc" "2"

# No-op: source == target
set +e
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/todo/STORY-001.md" todo) >/dev/null 2>&1; rc=$?
set -e
t_assert "no-op when source state == target state returns rc=0" "$rc" "0"

rm -rf "$REPO"

t_section "move-story: state transitions"

REPO="$(new_repo)"
mkdir -p "$REPO/docs/stories/auth/todo"
cat > "$REPO/docs/stories/auth/todo/STORY-001.md" <<'EOF'
# STORY-001 — Schema
- [ ] Build artifact <!-- artifact: file-exists:.artifacts/STORY-001/build.ok -->
EOF
(cd "$REPO" && git add -A && git commit -q -m init)

# 1. todo -> in-progress
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/todo/STORY-001.md" in-progress) >/dev/null 2>&1
t_assert_file_exists "todo->in-progress: file at new location" "$REPO/docs/stories/auth/in-progress/STORY-001.md"
t_assert_file_absent "todo->in-progress: file gone from old"   "$REPO/docs/stories/auth/todo/STORY-001.md"

# 2. in-progress -> blocked, BLOCKED sibling created with reason+gate
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/in-progress/STORY-001.md" blocked \
    --reason "test reason" --blocked-gate "T2") >/dev/null 2>&1
t_assert_file_exists "to-blocked: BLOCKED sibling created" "$REPO/docs/stories/auth/blocked/STORY-001.BLOCKED.md"
BLOCKED="$(cat "$REPO/docs/stories/auth/blocked/STORY-001.BLOCKED.md")"
t_assert_match "BLOCKED sibling: reason recorded" "$BLOCKED" 'Reason: test reason'
t_assert_match "BLOCKED sibling: gate recorded"   "$BLOCKED" 'Failing gate: T2'
t_assert_match "BLOCKED sibling: ISO timestamp"   "$BLOCKED" 'Timestamp (UTC): 20[0-9][0-9]-'

# 3. blocked -> todo: BLOCKED sibling cleaned up
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/blocked/STORY-001.md" todo) >/dev/null 2>&1
t_assert_file_absent "leaving-blocked: BLOCKED sibling removed" "$REPO/docs/stories/auth/blocked/STORY-001.BLOCKED.md"

# 4. todo -> done: REFUSED because reconciler --strict fails (artifact missing)
set +e
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/todo/STORY-001.md" done) >/dev/null 2>&1; rc=$?
set -e
t_assert "to-done refused without artifact (rc=3)" "$rc" "3"
t_assert_file_exists "to-done refused: story stays in todo/" "$REPO/docs/stories/auth/todo/STORY-001.md"

# 5. Provide artifact, then transition succeeds AND reconciles checkboxes
mkdir -p "$REPO/.artifacts/STORY-001" && touch "$REPO/.artifacts/STORY-001/build.ok"
(cd "$REPO" && "$MOVE" "$REPO/docs/stories/auth/todo/STORY-001.md" done) >/dev/null 2>&1
t_assert_file_exists "to-done with artifact: file moved" "$REPO/docs/stories/auth/done/STORY-001.md"
DONE_CONTENT="$(cat "$REPO/docs/stories/auth/done/STORY-001.md")"
t_assert_match "to-done: reconciler flipped checkbox to [x]" "$DONE_CONTENT" '\- \[x\] Build artifact'

# 6. INDEX.md was regenerated
t_assert_file_exists "INDEX.md regenerated after move" "$REPO/docs/stories/auth/INDEX.md"
INDEX_CONTENT="$(cat "$REPO/docs/stories/auth/INDEX.md")"
t_assert_match "INDEX shows STORY-001 under Done" "$INDEX_CONTENT" '## Done'

# 7. --no-index suppresses INDEX regen
mkdir -p "$REPO/docs/stories/auth/todo"
echo "# STORY-002" > "$REPO/docs/stories/auth/todo/STORY-002.md"
(cd "$REPO" && git add -A && git commit -q -m s2)
SHA1="$(sha256sum "$REPO/docs/stories/auth/INDEX.md" | awk '{print $1}')"
(cd "$REPO" && "$MOVE" --no-index "$REPO/docs/stories/auth/todo/STORY-002.md" in-progress) >/dev/null 2>&1
SHA2="$(sha256sum "$REPO/docs/stories/auth/INDEX.md" | awk '{print $1}')"
t_assert "--no-index leaves INDEX.md untouched" "$SHA1" "$SHA2"

rm -rf "$REPO"

# ---------- migrate tests ----------

t_section "migrate-stories-to-folders: classification"

REPO="$(new_repo)"
mkdir -p "$REPO/docs/stories/svc"

# All-checked tagged → done
cat > "$REPO/docs/stories/svc/STORY-001.md" <<'EOF'
# STORY-001 — Done
- [x] A <!-- artifact: file-exists:.artifacts/a -->
- [x] B <!-- artifact: file-exists:.artifacts/b -->
EOF

# Mixed → todo
cat > "$REPO/docs/stories/svc/STORY-002.md" <<'EOF'
# STORY-002 — In flight
- [x] A <!-- artifact: file-exists:.artifacts/a -->
- [ ] B <!-- artifact: file-exists:.artifacts/b -->
EOF

# No tags → ambiguous → todo
cat > "$REPO/docs/stories/svc/STORY-003.md" <<'EOF'
# STORY-003 — Plain
- [ ] manual
EOF

(cd "$REPO" && git add -A && git commit -q -m init)

# Dry run should NOT move anything
SHA_BEFORE="$(find "$REPO/docs/stories" -type f | sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')"
(cd "$REPO" && "$MIGRATE" --dry-run) >/dev/null 2>&1
SHA_AFTER="$(find "$REPO/docs/stories" -type f | sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')"
t_assert "--dry-run does not modify the filesystem" "$SHA_BEFORE" "$SHA_AFTER"

# Real run
(cd "$REPO" && "$MIGRATE") >/dev/null 2>&1

t_assert_file_exists "migrate: STORY-001 (all checked) → done/" "$REPO/docs/stories/svc/done/STORY-001.md"
t_assert_file_exists "migrate: STORY-002 (mixed) → todo/"        "$REPO/docs/stories/svc/todo/STORY-002.md"
t_assert_file_exists "migrate: STORY-003 (no tags) → todo/ (ambiguous)" "$REPO/docs/stories/svc/todo/STORY-003.md"
t_assert_file_absent "migrate: no flat file remains" "$REPO/docs/stories/svc/STORY-001.md"
t_assert_file_exists "migrate: INDEX.md generated" "$REPO/docs/stories/svc/INDEX.md"

# All four state folders should exist
for s in todo in-progress blocked done; do
    if [ -d "$REPO/docs/stories/svc/$s" ]; then
        PASS=$((PASS + 1)); printf '  ok   migrate: state folder %s/ created\n' "$s"
    else
        FAIL=$((FAIL + 1)); FAILED_NAMES+=("state-folder-$s")
        printf '  FAIL migrate: state folder %s/ missing\n' "$s"
    fi
done

# Idempotency
SHA1="$(find "$REPO/docs/stories" -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')"
(cd "$REPO" && "$MIGRATE") >/dev/null 2>&1
SHA2="$(find "$REPO/docs/stories" -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')"
t_assert "migrate idempotent (no change on second run)" "$SHA1" "$SHA2"

# git renames preserved
GIT_STATUS="$(cd "$REPO" && git status --short)"
t_assert_match "migrate: git status shows R (rename) entries" "$GIT_STATUS" '^R'
t_assert_no_match "migrate: no D (delete) entries (renames preserved)" "$GIT_STATUS" '^D '

rm -rf "$REPO"

# ---------- Phase-1 still passes (regression check) ----------

t_section "regression: Phase-1 self-test still passes"
set +e
"$REPO_ROOT/scripts/reconcile-story-checkboxes.sh" --self-test >/dev/null 2>&1
rc=$?
set -e
t_assert "Phase-1 reconciler --self-test still PASS after Phase-2 changes" "$rc" "0"

# ---------- Summary ----------

printf '\n=========================================\n'
printf 'folder-state tests: %d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
    printf 'failed:\n'
    for n in "${FAILED_NAMES[@]}"; do printf '  - %s\n' "$n"; done
    exit 1
fi
exit 0

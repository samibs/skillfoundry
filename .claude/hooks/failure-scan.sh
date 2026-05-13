#!/bin/bash
# GuardLoop Failure Scanner — PostToolUse hook for Edit|Write
#
# Scans newly written/edited files for CRITICAL failure patterns adapted from
# GuardLoop's FailureDetector (github.com/samibs/guardloop.dev).
#
# Non-blocking: warns via stdout but always exits 0.
# Also records the file path for the full harvest at session end.
#
# Patterns: hardcoded secrets, localStorage tokens, file corruption
# Part of: GuardLoop × SkillFoundry integration

set -o pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

# Resolve to absolute path
if [[ "$FILE_PATH" != /* ]]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
    [ -n "$CWD" ] && FILE_PATH="$CWD/$FILE_PATH"
fi

[ -f "$FILE_PATH" ] || exit 0

# Only scan code files
case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.cs|*.java|*.go|*.rb|*.php) ;;
    *) exit 0 ;;
esac

# Skip large files (>500KB)
FILE_SIZE=$(wc -c < "$FILE_PATH" 2>/dev/null || echo "0")
[ "$FILE_SIZE" -gt 512000 ] && exit 0

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"
mkdir -p "$STATE_DIR" 2>/dev/null

# Record file for end-of-session harvest (GuardLoop's own file list, independent of batch-check)
if ! grep -qFx "$FILE_PATH" "$STATE_DIR/guardloop-files.log" 2>/dev/null; then
    echo "$FILE_PATH" >> "$STATE_DIR/guardloop-files.log"
fi

WARNINGS=()

# Pattern 1: Hardcoded secrets
# Exclude env variable access patterns and example/placeholder strings
MATCH=$(grep -inE "(password|secret|api_key|apikey|access_token|private_key)\s*[=:]\s*[\"'][^\"']{6,}[\"']" \
    "$FILE_PATH" 2>/dev/null \
    | grep -viE "(example|placeholder|your_|<your|env\.|process\.env|os\.environ|config\.|getenv)" \
    | head -1)
[ -n "$MATCH" ] && WARNINGS+=("[CRITICAL] Hardcoded secret — use environment variables (BPSBS §2)")

# Pattern 2: localStorage token storage (XSS risk)
MATCH=$(grep -inE "localStorage\.(setItem|getItem).*[Tt]oken" "$FILE_PATH" 2>/dev/null | head -1)
[ -n "$MATCH" ] && WARNINGS+=("[CRITICAL] Token in localStorage — use HttpOnly cookies (BPSBS §2, GL:localstorage-token)")

# Pattern 3: File corruption (repeating characters — AI generation artifact)
MATCH=$(grep -E "[)]{10,}|[0]{20,}|[=]{30,}" "$FILE_PATH" 2>/dev/null | head -1)
[ -n "$MATCH" ] && WARNINGS+=("[CRITICAL] File corruption detected — repeating chars, restore from git (GL:file-corruption)")

# Output warnings if any
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo ""
    echo "GuardLoop [$(basename "$FILE_PATH")]:"
    for w in "${WARNINGS[@]}"; do
        echo "  $w"
    done
    echo ""
fi

exit 0

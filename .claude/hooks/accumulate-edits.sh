#!/bin/bash
# Post-Edit Accumulator — PostToolUse hook for Edit|Write
#
# Records every edited JS/TS/TSX/JSX file path for batch
# format + typecheck at session end (Stop hook).
#
# State: .claude/hooks/state/edited-files.log

set -o pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Only track lintable file types
case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
    *.py) ;;
    *.css|*.scss|*.less) ;;
    *.json) ;;
    *) exit 0 ;;
esac

# Resolve to absolute path
if [[ "$FILE_PATH" != /* ]]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
    if [ -n "$CWD" ]; then
        FILE_PATH="$CWD/$FILE_PATH"
    fi
fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"
EDITS_LOG="$STATE_DIR/edited-files.log"

mkdir -p "$STATE_DIR" 2>/dev/null

# Append if not already tracked (dedup)
if ! grep -qFx "$FILE_PATH" "$EDITS_LOG" 2>/dev/null; then
    echo "$FILE_PATH" >> "$EDITS_LOG"
fi

exit 0

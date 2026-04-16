#!/bin/bash
# GateGuard Read Tracker — PostToolUse hook for Read
#
# Records every file that has been Read so GateGuard knows
# which files are safe to edit.
#
# State: .claude/hooks/state/gateguard-reads.log

set -o pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Resolve to absolute path
if [[ "$FILE_PATH" != /* ]]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
    if [ -n "$CWD" ]; then
        FILE_PATH="$CWD/$FILE_PATH"
    fi
fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"
READS_LOG="$STATE_DIR/gateguard-reads.log"

mkdir -p "$STATE_DIR" 2>/dev/null

# Append if not already tracked (dedup)
if ! grep -qFx "$FILE_PATH" "$READS_LOG" 2>/dev/null; then
    echo "$FILE_PATH" >> "$READS_LOG"
fi

exit 0

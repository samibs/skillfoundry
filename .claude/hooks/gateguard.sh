#!/bin/bash
# GateGuard — Force-Read-Before-Edit Hook
# PreToolUse hook for Edit|Write
#
# Blocks the first Edit/Write to a file unless that file has been
# Read in the current session. Prevents "vibe coding" where the agent
# modifies files it hasn't inspected.
#
# State: .claude/hooks/state/gateguard-reads.log (one file path per line)
#
# Exit codes:
#   0 = Allow (file was read, or is a new file being created)
#   0 + deny JSON = Block (file not read yet)

set -o pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# No file path = not our concern
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Resolve to absolute path for consistent matching
if [[ "$FILE_PATH" != /* ]]; then
    CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
    if [ -n "$CWD" ]; then
        FILE_PATH="$CWD/$FILE_PATH"
    fi
fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"
READS_LOG="$STATE_DIR/gateguard-reads.log"

# Ensure state dir exists
mkdir -p "$STATE_DIR" 2>/dev/null

# For Write: if the file doesn't exist yet, it's a new file creation — allow
if [ "$TOOL_NAME" = "Write" ] && [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

# Check if this file was previously read in this session
if [ -f "$READS_LOG" ] && grep -qFx "$FILE_PATH" "$READS_LOG" 2>/dev/null; then
    # File was read — allow the edit
    exit 0
fi

# File was NOT read — block the edit
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "GateGuard: You must Read '$(basename "$FILE_PATH")' before editing it. Read the file first to understand its imports, data shapes, and existing patterns — then retry your edit."
  }
}
EOF
exit 0

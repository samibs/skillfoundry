#!/bin/bash
# Session Cleanup — SessionStart hook
#
# Clears stale state files from a previous session so GateGuard
# and the accumulator start fresh.

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"

rm -f "$STATE_DIR/gateguard-reads.log" 2>/dev/null
rm -f "$STATE_DIR/edited-files.log" 2>/dev/null

exit 0

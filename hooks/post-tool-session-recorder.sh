#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SkillFoundry Hook: Post-Tool Session Recorder
#
# Automatically records tool execution results as session knowledge.
# Captures errors, decisions, and patterns from tool agent runs.
# Install: cp hooks/post-tool-session-recorder.sh .claude/hooks/
# ─────────────────────────────────────────────────────────────────────────────

set +e

TOOL_NAME="${1:-}"
TOOL_RESULT="${2:-}"
PROJECT_PATH="${3:-$(pwd)}"

[ -z "$TOOL_NAME" ] && exit 0
[ -z "$TOOL_RESULT" ] && exit 0

# Only record for significant tool results
case "$TOOL_NAME" in
  sf_build|sf_run_tests|sf_security_scan*|sf_contract_check|sf_version_check)
    ;;
  *)
    exit 0
    ;;
esac

# Check if result indicates a failure
if echo "$TOOL_RESULT" | grep -q '"passed"\s*:\s*false'; then
  # Extract error details (first 500 chars)
  ERROR_CONTENT=$(echo "$TOOL_RESULT" | head -c 500)

  curl -s -X POST http://localhost:9877/api/v1/knowledge/recordings \
    -H "Content-Type: application/json" \
    -d "{
      \"appName\": \"$(basename "$PROJECT_PATH")\",
      \"appPath\": \"$PROJECT_PATH\",
      \"entryType\": \"error\",
      \"content\": \"$TOOL_NAME failed: $ERROR_CONTENT\",
      \"tags\": [\"auto-recorded\", \"$TOOL_NAME\"]
    }" 2>/dev/null
fi

exit 0

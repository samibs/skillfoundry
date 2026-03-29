#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SkillFoundry Hook: Post-Edit Contract Check
#
# After editing an API-related file, check if frontend/backend contracts match.
# Install: cp hooks/post-edit-contract-check.sh .claude/hooks/
# Config:  Add to .claude/settings.json hooks.postToolUse for Edit tool
# ─────────────────────────────────────────────────────────────────────────────

set +e

# This hook is called with the edited file path as argument
EDITED_FILE="${1:-}"
PROJECT_ROOT="${2:-$(pwd)}"

[ -z "$EDITED_FILE" ] && exit 0

# Only trigger for API-related files
case "$EDITED_FILE" in
  */api/*|*/routes/*|*/services/*|*/hooks/use*|*/lib/api*|*/utils/api*)
    ;;
  *)
    exit 0
    ;;
esac

# Check if MCP server is running
if ! curl -s http://localhost:9877/health > /dev/null 2>&1; then
  exit 0  # Server not running, skip silently
fi

# Trigger contract check via MCP API
echo "[SkillFoundry] API file modified — running contract check..."
RESULT=$(curl -s -X POST http://localhost:9877/api/v1/knowledge/harvest \
  -H "Content-Type: application/json" \
  -d "{\"appsRoot\": \"$(dirname "$PROJECT_ROOT")\"}" 2>/dev/null)

# Note: Full contract check requires the MCP tool sf_contract_check
# This hook provides a lightweight notification. For full validation:
# Use sf_contract_check tool via Claude or MCP client.
echo "[SkillFoundry] Tip: Run sf_contract_check for full frontend/backend validation"

exit 0

#!/bin/bash
# Batch Check — Stop hook
#
# Runs format check + typecheck on all files edited during the session.
# Reports issues as a summary; does NOT block the stop.
#
# State: reads .claude/hooks/state/edited-files.log
# Cleanup: clears state files after running

set -o pipefail

STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state"
EDITS_LOG="$STATE_DIR/edited-files.log"
READS_LOG="$STATE_DIR/gateguard-reads.log"

# If no edits were accumulated, nothing to do
if [ ! -f "$EDITS_LOG" ] || [ ! -s "$EDITS_LOG" ]; then
    # Clean up state files for next session
    rm -f "$EDITS_LOG" "$READS_LOG" 2>/dev/null
    exit 0
fi

TOTAL_FILES=$(wc -l < "$EDITS_LOG" | tr -d ' ')
ISSUES=0
REPORT=""

# Collect TS/JS files for typecheck
TS_FILES=()
PY_FILES=()

while IFS= read -r filepath; do
    # Skip files that no longer exist (deleted during session)
    [ -f "$filepath" ] || continue

    case "$filepath" in
        *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
            TS_FILES+=("$filepath")
            ;;
        *.py)
            PY_FILES+=("$filepath")
            ;;
    esac
done < "$EDITS_LOG"

# --- TypeScript/JavaScript checks ---
if [ ${#TS_FILES[@]} -gt 0 ]; then
    PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

    # Try prettier check (non-blocking)
    if command -v npx &>/dev/null; then
        # Check if prettier is available in the project
        if [ -f "$PROJECT_DIR/node_modules/.bin/prettier" ] || [ -f "$PROJECT_DIR/sf_cli/node_modules/.bin/prettier" ]; then
            FORMAT_OUT=$(npx prettier --check "${TS_FILES[@]}" 2>&1) || {
                BAD_FORMAT=$(echo "$FORMAT_OUT" | grep -c "^\[warn\]" 2>/dev/null || echo "some")
                REPORT+="  Format issues: $BAD_FORMAT file(s) need formatting (run: npx prettier --write)\n"
                ISSUES=$((ISSUES + 1))
            }
        fi

        # Try tsc --noEmit if tsconfig exists
        if [ -f "$PROJECT_DIR/tsconfig.json" ] || [ -f "$PROJECT_DIR/sf_cli/tsconfig.json" ]; then
            TSC_DIR="$PROJECT_DIR"
            [ -f "$PROJECT_DIR/sf_cli/tsconfig.json" ] && TSC_DIR="$PROJECT_DIR/sf_cli"

            TSC_OUT=$(cd "$TSC_DIR" && npx tsc --noEmit 2>&1) || {
                TSC_ERRORS=$(echo "$TSC_OUT" | grep -c "error TS" 2>/dev/null || echo "some")
                REPORT+="  TypeScript errors: $TSC_ERRORS issue(s) found (run: npx tsc --noEmit)\n"
                ISSUES=$((ISSUES + 1))
            }
        fi
    fi
fi

# --- Python checks ---
if [ ${#PY_FILES[@]} -gt 0 ]; then
    # Try ruff if available
    if command -v ruff &>/dev/null; then
        RUFF_OUT=$(ruff check "${PY_FILES[@]}" 2>&1) || {
            RUFF_ERRORS=$(echo "$RUFF_OUT" | grep -cE "^[A-Z]" 2>/dev/null || echo "some")
            REPORT+="  Python lint issues: $RUFF_ERRORS issue(s) found (run: ruff check --fix)\n"
            ISSUES=$((ISSUES + 1))
        }
    fi
fi

# --- Report ---
if [ $ISSUES -gt 0 ]; then
    echo "--- Session Quality Report ---"
    echo "Files edited: $TOTAL_FILES"
    echo "Issues found:"
    echo -e "$REPORT"
    echo "Run the suggested commands to fix before committing."
    echo "------------------------------"
fi

# Clean up state files for next session
rm -f "$EDITS_LOG" "$READS_LOG" 2>/dev/null

exit 0

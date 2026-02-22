#!/bin/bash

# Session Close — Harvest memory, force sync, stop daemon
# Called at the end of a Claude session (by the autonomous protocol or manually)
#
# USAGE:
#   ./scripts/session-close.sh [--project=PATH]
#   ./scripts/session-close.sh --help

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="."

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

for arg in "$@"; do
    case "$arg" in
        --project=*) PROJECT_DIR="${arg#*=}" ;;
        --help|-h)
            echo "Session Close — Harvest memory, force sync, stop daemon"
            echo ""
            echo "Usage: ./scripts/session-close.sh [--project=PATH]"
            echo ""
            echo "Options:"
            echo "  --project=PATH   Project directory (default: current directory)"
            echo "  --help           Show this help"
            echo ""
            echo "What it does:"
            echo "  1. Records session end timestamp"
            echo "  2. Forces a final knowledge sync"
            echo "  3. Stops the sync daemon"
            echo "  4. Reports session summary"
            exit 0
            ;;
    esac
done

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo -e "${CYAN}${BOLD}Session Close${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 1: Record session end in memory_bank
# ═══════════════════════════════════════════════════════════════

FACTS_FILE="$PROJECT_DIR/memory_bank/knowledge/facts.jsonl"

if [ -d "$PROJECT_DIR/memory_bank/knowledge" ]; then
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "{\"timestamp\":\"$timestamp\",\"type\":\"session_end\",\"content\":\"Session closed\"}" >> "$FACTS_FILE"
    echo -e "${GREEN}  Session end recorded in facts.jsonl${NC}"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 2: Count session artifacts
# ═══════════════════════════════════════════════════════════════

decisions_count=0
errors_count=0
facts_count=0

if [ -f "$PROJECT_DIR/memory_bank/knowledge/decisions.jsonl" ]; then
    decisions_count=$(wc -l < "$PROJECT_DIR/memory_bank/knowledge/decisions.jsonl" | tr -d ' ')
fi
if [ -f "$PROJECT_DIR/memory_bank/knowledge/errors.jsonl" ]; then
    errors_count=$(wc -l < "$PROJECT_DIR/memory_bank/knowledge/errors.jsonl" | tr -d ' ')
fi
if [ -f "$FACTS_FILE" ]; then
    facts_count=$(wc -l < "$FACTS_FILE" | tr -d ' ')
fi

echo -e "${BLUE}  Session artifacts:${NC}"
echo -e "    Decisions:  $decisions_count"
echo -e "    Facts:      $facts_count"
echo -e "    Errors:     $errors_count"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 3: Force a final knowledge sync
# ═══════════════════════════════════════════════════════════════

SYNC_SCRIPT="$FRAMEWORK_DIR/scripts/knowledge-sync.sh"
CONF_FILE="$PROJECT_DIR/.claude/knowledge-sync.conf"

if [ -f "$SYNC_SCRIPT" ] && [ -x "$SYNC_SCRIPT" ] && [ -f "$CONF_FILE" ]; then
    echo -e "${BLUE}  Running final knowledge sync...${NC}"
    if bash "$SYNC_SCRIPT" sync 2>/dev/null; then
        echo -e "${GREEN}  Final sync completed.${NC}"
    else
        echo -e "${YELLOW}  Final sync failed (will retry next session).${NC}"
    fi
    echo ""

    # ═══════════════════════════════════════════════════════════════
    # STEP 4: Check if lesson promotion is needed
    # ═══════════════════════════════════════════════════════════════

    echo -e "${BLUE}  Checking for lesson promotions...${NC}"
    if bash "$SYNC_SCRIPT" promote 2>/dev/null; then
        echo -e "${GREEN}  Promotion check completed.${NC}"
    else
        echo -e "${YELLOW}  Promotion check skipped.${NC}"
    fi
    echo ""

    # ═══════════════════════════════════════════════════════════════
    # STEP 5: Stop the sync daemon
    # ═══════════════════════════════════════════════════════════════

    echo -e "${BLUE}  Stopping sync daemon...${NC}"
    if bash "$SYNC_SCRIPT" stop 2>/dev/null; then
        echo -e "${GREEN}  Sync daemon stopped.${NC}"
    else
        echo -e "${YELLOW}  Sync daemon was not running.${NC}"
    fi
else
    echo -e "${YELLOW}  Knowledge sync not configured. Skipping.${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

echo -e "${GREEN}${BOLD}Session Close Complete${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Decisions recorded: $decisions_count"
echo -e "  Facts recorded:     $facts_count"
echo -e "  Errors recorded:    $errors_count"
echo ""

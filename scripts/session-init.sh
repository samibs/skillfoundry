#!/bin/bash

# Session Init — Pull global knowledge and start sync daemon
# Called at the start of a Claude session (by the autonomous protocol or manually)
#
# USAGE:
#   ./scripts/session-init.sh [--project=PATH]
#   ./scripts/session-init.sh --help

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
            echo "Session Init — Pull global knowledge and start sync daemon"
            echo ""
            echo "Usage: ./scripts/session-init.sh [--project=PATH]"
            echo ""
            echo "Options:"
            echo "  --project=PATH   Project directory (default: current directory)"
            echo "  --help           Show this help"
            echo ""
            echo "What it does:"
            echo "  1. Checks if knowledge-sync is configured"
            echo "  2. Pulls latest global knowledge from the sync repo"
            echo "  3. Copies global/lessons.jsonl into project memory_bank"
            echo "  4. Starts the sync daemon (if not already running)"
            exit 0
            ;;
    esac
done

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo -e "${CYAN}${BOLD}Session Init${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 1: Check if knowledge-sync is configured
# ═══════════════════════════════════════════════════════════════

CONF_FILE="$PROJECT_DIR/.claude/knowledge-sync.conf"

if [ ! -f "$CONF_FILE" ]; then
    echo -e "${YELLOW}  Knowledge sync not configured for this project.${NC}"
    echo -e "${YELLOW}  Run: scripts/knowledge-sync.sh init <repo-url>${NC}"
    echo -e "${YELLOW}  Skipping global knowledge pull.${NC}"
    echo ""
    exit 0
fi

# shellcheck source=/dev/null
. "$CONF_FILE"

if [ -z "$KNOWLEDGE_REPO_LOCAL" ] || [ ! -d "$KNOWLEDGE_REPO_LOCAL" ]; then
    echo -e "${YELLOW}  Knowledge repo not found at: ${KNOWLEDGE_REPO_LOCAL:-'(not set)'}${NC}"
    echo -e "${YELLOW}  Run: scripts/knowledge-sync.sh init <repo-url>${NC}"
    exit 0
fi

echo -e "${GREEN}  Config:  $CONF_FILE${NC}"
echo -e "${GREEN}  Repo:    ${KNOWLEDGE_REPO_URL:-unknown}${NC}"
echo -e "${GREEN}  Project: ${PROJECT_NAME:-unknown}${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 2: Pull latest from knowledge repo
# ═══════════════════════════════════════════════════════════════

echo -e "${BLUE}  Pulling latest knowledge...${NC}"

if cd "$KNOWLEDGE_REPO_LOCAL" && git pull --quiet 2>/dev/null; then
    echo -e "${GREEN}  Pulled latest from remote.${NC}"
else
    echo -e "${YELLOW}  Could not pull (offline or no remote). Using local copy.${NC}"
fi

cd "$PROJECT_DIR"

# ═══════════════════════════════════════════════════════════════
# STEP 3: Copy global knowledge into project memory_bank
# ═══════════════════════════════════════════════════════════════

GLOBAL_DIR="$KNOWLEDGE_REPO_LOCAL/global"

if [ -d "$GLOBAL_DIR" ]; then
    echo -e "${BLUE}  Syncing global knowledge to project...${NC}"

    mkdir -p "$PROJECT_DIR/memory_bank/knowledge"

    # Copy global lessons if they exist
    if [ -f "$GLOBAL_DIR/lessons.jsonl" ] && [ -s "$GLOBAL_DIR/lessons.jsonl" ]; then
        cp "$GLOBAL_DIR/lessons.jsonl" "$PROJECT_DIR/memory_bank/knowledge/global-lessons.jsonl"
        lesson_count=$(wc -l < "$GLOBAL_DIR/lessons.jsonl" | tr -d ' ')
        echo -e "${GREEN}    Lessons:        ${lesson_count} global rules loaded${NC}"
    fi

    # Copy global preferences if they exist
    if [ -f "$GLOBAL_DIR/preferences.json" ] && [ -s "$GLOBAL_DIR/preferences.json" ]; then
        cp "$GLOBAL_DIR/preferences.json" "$PROJECT_DIR/memory_bank/knowledge/global-preferences.json"
        echo -e "${GREEN}    Preferences:    developer style loaded${NC}"
    fi

    # Copy global anti-patterns if they exist
    if [ -f "$GLOBAL_DIR/anti-patterns.jsonl" ] && [ -s "$GLOBAL_DIR/anti-patterns.jsonl" ]; then
        cp "$GLOBAL_DIR/anti-patterns.jsonl" "$PROJECT_DIR/memory_bank/knowledge/global-anti-patterns.jsonl"
        ap_count=$(wc -l < "$GLOBAL_DIR/anti-patterns.jsonl" | tr -d ' ')
        echo -e "${GREEN}    Anti-patterns:  ${ap_count} rules loaded${NC}"
    fi

    # Copy global tech stack if it exists
    if [ -f "$GLOBAL_DIR/tech-stack.json" ] && [ -s "$GLOBAL_DIR/tech-stack.json" ]; then
        cp "$GLOBAL_DIR/tech-stack.json" "$PROJECT_DIR/memory_bank/knowledge/global-tech-stack.json"
        echo -e "${GREEN}    Tech stack:     profile loaded${NC}"
    fi
else
    echo -e "${YELLOW}  No global knowledge found yet (global/ directory empty).${NC}"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# STEP 4: Start knowledge sync daemon
# ═══════════════════════════════════════════════════════════════

SYNC_SCRIPT="$FRAMEWORK_DIR/scripts/knowledge-sync.sh"

if [ -f "$SYNC_SCRIPT" ] && [ -x "$SYNC_SCRIPT" ]; then
    echo -e "${BLUE}  Starting knowledge sync daemon...${NC}"
    bash "$SYNC_SCRIPT" start --if-not-running 2>/dev/null || true
    echo ""
else
    echo -e "${YELLOW}  knowledge-sync.sh not found or not executable.${NC}"
fi

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

echo -e "${GREEN}${BOLD}Session Init Complete${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

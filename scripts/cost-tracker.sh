#!/bin/bash

# Cost Tracker - Token usage tracking and reporting
# Implements FR-022 (Cost Tracking)
# Records token usage per agent, story, and phase. Generates reports.
#
# USAGE:
#   ./scripts/cost-tracker.sh record --agent=AGENT --story=STORY --tokens=N [--phase=PHASE]
#   ./scripts/cost-tracker.sh report [--by=agent|story|phase|all] [--json]
#   ./scripts/cost-tracker.sh summary [--json]
#   ./scripts/cost-tracker.sh reset [--force]
#   ./scripts/cost-tracker.sh status
#   ./scripts/cost-tracker.sh --help

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

# Defaults
COST_DIR="${COST_DIR:-.claude/costs}"
COST_FILE=""
FORCE="${FORCE:-false}"
JSON_OUTPUT=false

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Cost Tracker - Token usage tracking and reporting"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/cost-tracker.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  record                  Record token usage for an agent/story"
    echo "  report                  Generate usage report"
    echo "  summary                 Show quick summary totals"
    echo "  reset                   Clear all cost data (requires confirmation)"
    echo "  status                  Show cost tracking status"
    echo ""
    echo "OPTIONS:"
    echo "  --agent=AGENT           Agent type (coder, tester, etc.)"
    echo "  --story=STORY_ID        Story identifier"
    echo "  --tokens=N              Number of tokens used"
    echo "  --phase=PHASE           Phase identifier (implementation, testing, etc.)"
    echo "  --by=GROUPING           Report grouping: agent, story, phase, all (default: all)"
    echo "  --json                  Output in JSON format"
    echo "  --force                 Skip confirmation prompts"
    echo "  --help                  Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/cost-tracker.sh record --agent=coder --story=STORY-001 --tokens=5000"
    echo "  ./scripts/cost-tracker.sh report --by=agent"
    echo "  ./scripts/cost-tracker.sh summary"
}

# Parse arguments
COMMAND=""
AGENT=""
STORY=""
TOKENS=""
PHASE="default"
GROUP_BY="all"

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --agent=*) AGENT="${arg#--agent=}" ;;
        --story=*) STORY="${arg#--story=}" ;;
        --tokens=*) TOKENS="${arg#--tokens=}" ;;
        --phase=*) PHASE="${arg#--phase=}" ;;
        --by=*) GROUP_BY="${arg#--by=}" ;;
        --json) JSON_OUTPUT=true ;;
        --force) FORCE=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$COMMAND" ] && COMMAND="$arg" ;;
    esac
done

COST_FILE="$COST_DIR/usage.jsonl"

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

json_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":\"[^\"]*\"" 2>/dev/null | head -1 | cut -d'"' -f4 || true
}

json_num_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":[0-9]*" 2>/dev/null | head -1 | cut -d':' -f2 || true
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_record() {
    if [ -z "$AGENT" ]; then
        echo -e "${RED}[FAIL]${NC} --agent is required"
        exit 1
    fi
    if [ -z "$STORY" ]; then
        echo -e "${RED}[FAIL]${NC} --story is required"
        exit 1
    fi
    if [ -z "$TOKENS" ]; then
        echo -e "${RED}[FAIL]${NC} --tokens is required"
        exit 1
    fi

    # Validate tokens is a number
    if ! echo "$TOKENS" | grep -q '^[0-9]*$'; then
        echo -e "${RED}[FAIL]${NC} --tokens must be a number"
        exit 1
    fi

    mkdir -p "$COST_DIR"
    local ts
    ts=$(now_ts)

    local entry="{\"agent\":\"$AGENT\",\"story\":\"$STORY\",\"tokens\":$TOKENS,\"phase\":\"$PHASE\",\"timestamp\":\"$ts\"}"
    echo "$entry" >> "$COST_FILE"

    echo -e "${GREEN}[PASS]${NC} Recorded $TOKENS tokens for $AGENT on $STORY"
}

cmd_report() {
    if [ ! -f "$COST_FILE" ] || [ ! -s "$COST_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} No cost data recorded yet"
        return 0
    fi

    echo ""
    echo -e "${BOLD}Token Usage Report${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$GROUP_BY" = "agent" ] || [ "$GROUP_BY" = "all" ]; then
        echo ""
        echo -e "  ${BOLD}By Agent:${NC}"
        local agents
        agents=$(grep -o '"agent":"[^"]*"' "$COST_FILE" | sort -u | cut -d'"' -f4)
        for agent in $agents; do
            local total=0
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                local a t
                a=$(json_field "$line" "agent")
                t=$(json_num_field "$line" "tokens")
                if [ "$a" = "$agent" ] && [ -n "$t" ]; then
                    total=$((total + t))
                fi
            done < "$COST_FILE"
            printf "    ${CYAN}%-20s${NC} %'10d tokens\n" "$agent" "$total"
        done
    fi

    if [ "$GROUP_BY" = "story" ] || [ "$GROUP_BY" = "all" ]; then
        echo ""
        echo -e "  ${BOLD}By Story:${NC}"
        local stories
        stories=$(grep -o '"story":"[^"]*"' "$COST_FILE" | sort -u | cut -d'"' -f4)
        for story in $stories; do
            local total=0
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                local s t
                s=$(json_field "$line" "story")
                t=$(json_num_field "$line" "tokens")
                if [ "$s" = "$story" ] && [ -n "$t" ]; then
                    total=$((total + t))
                fi
            done < "$COST_FILE"
            printf "    ${YELLOW}%-20s${NC} %'10d tokens\n" "$story" "$total"
        done
    fi

    if [ "$GROUP_BY" = "phase" ] || [ "$GROUP_BY" = "all" ]; then
        echo ""
        echo -e "  ${BOLD}By Phase:${NC}"
        local phases
        phases=$(grep -o '"phase":"[^"]*"' "$COST_FILE" | sort -u | cut -d'"' -f4)
        for phase in $phases; do
            local total=0
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                local p t
                p=$(json_field "$line" "phase")
                t=$(json_num_field "$line" "tokens")
                if [ "$p" = "$phase" ] && [ -n "$t" ]; then
                    total=$((total + t))
                fi
            done < "$COST_FILE"
            printf "    ${BLUE}%-20s${NC} %'10d tokens\n" "$phase" "$total"
        done
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Grand total
    local grand_total=0
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local t
        t=$(json_num_field "$line" "tokens")
        if [ -n "$t" ]; then
            grand_total=$((grand_total + t))
        fi
    done < "$COST_FILE"
    local entry_count
    entry_count=$(wc -l < "$COST_FILE" | tr -d ' ')
    printf "  ${BOLD}Total: %'d tokens across %d records${NC}\n" "$grand_total" "$entry_count"
    echo ""
}

cmd_summary() {
    if [ ! -f "$COST_FILE" ] || [ ! -s "$COST_FILE" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"total_tokens":0,"total_records":0}'
        else
            echo -e "${CYAN}[INFO]${NC} No cost data recorded yet"
        fi
        return 0
    fi

    local grand_total=0
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local t
        t=$(json_num_field "$line" "tokens")
        if [ -n "$t" ]; then
            grand_total=$((grand_total + t))
        fi
    done < "$COST_FILE"
    local entry_count
    entry_count=$(wc -l < "$COST_FILE" | tr -d ' ')
    local agent_count
    agent_count=$(grep -o '"agent":"[^"]*"' "$COST_FILE" | sort -u | wc -l | tr -d ' ')
    local story_count
    story_count=$(grep -o '"story":"[^"]*"' "$COST_FILE" | sort -u | wc -l | tr -d ' ')

    if [ "$JSON_OUTPUT" = true ]; then
        echo "{\"total_tokens\":$grand_total,\"total_records\":$entry_count,\"unique_agents\":$agent_count,\"unique_stories\":$story_count}"
        return
    fi

    echo ""
    echo -e "${BOLD}Cost Summary${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "  Total tokens:    ${BOLD}%'d${NC}\n" "$grand_total"
    echo -e "  Total records:   ${BOLD}$entry_count${NC}"
    echo -e "  Unique agents:   ${CYAN}$agent_count${NC}"
    echo -e "  Unique stories:  ${YELLOW}$story_count${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

cmd_reset() {
    if [ ! -f "$COST_FILE" ] || [ ! -s "$COST_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} No cost data to clear"
        return 0
    fi

    local count
    count=$(wc -l < "$COST_FILE" | tr -d ' ')

    if [ "$FORCE" != "true" ]; then
        echo -e "${YELLOW}Clear cost data? $count records will be removed.${NC}"
        echo -n "Continue? (y/N) "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo -e "${CYAN}[INFO]${NC} Reset cancelled"
            exit 2
        fi
    fi

    > "$COST_FILE"
    echo -e "${GREEN}[PASS]${NC} Cost data cleared ($count records removed)"
}

cmd_status() {
    echo ""
    echo -e "${BOLD}Cost Tracker Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Data directory:  $COST_DIR"
    echo -e "  Data file:       $COST_FILE"

    if [ -f "$COST_FILE" ] && [ -s "$COST_FILE" ]; then
        local count
        count=$(wc -l < "$COST_FILE" | tr -d ' ')
        echo -e "  Records:         ${GREEN}$count${NC}"
        echo -e "  Status:          ${GREEN}Active${NC}"
    else
        echo -e "  Records:         0"
        echo -e "  Status:          ${YELLOW}No data${NC}"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if [ -z "$COMMAND" ]; then
    show_help
    exit 0
fi

case "$COMMAND" in
    record) cmd_record ;;
    report) cmd_report ;;
    summary) cmd_summary ;;
    reset) cmd_reset ;;
    status) cmd_status ;;
    *)
        echo -e "${RED}[FAIL]${NC} Unknown command: $COMMAND"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

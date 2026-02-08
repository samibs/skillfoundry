#!/bin/bash

# Dispatch State Manager - CRUD for .claude/dispatch-state.json
# Tracks parallel execution progress across waves and dispatches.
#
# USAGE:
#   ./parallel/dispatch-state.sh init
#   ./parallel/dispatch-state.sh update --dispatch=ID --status=STATUS
#   ./parallel/dispatch-state.sh query [--wave=N] [--status=STATUS]
#   ./parallel/dispatch-state.sh report
#   ./parallel/dispatch-state.sh --help

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

# State file location
STATE_DIR="${STATE_DIR:-.claude}"
STATE_FILE="$STATE_DIR/dispatch-state.json"

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Dispatch State Manager - Track parallel execution progress"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/dispatch-state.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  init                    Create empty dispatch state file"
    echo "  update                  Update a dispatch or wave status"
    echo "  query                   Query dispatches by wave or status"
    echo "  report                  Show execution progress summary"
    echo "  reset                   Reset state file to empty"
    echo ""
    echo "UPDATE OPTIONS:"
    echo "  --dispatch=ID           Dispatch ID to update"
    echo "  --wave=N                Wave number to update"
    echo "  --status=STATUS         New status: PENDING, IN_PROGRESS, COMPLETE, FAILED"
    echo "  --story=STORY-ID        Associate story ID with dispatch"
    echo "  --agent=AGENT           Agent assigned to dispatch"
    echo ""
    echo "QUERY OPTIONS:"
    echo "  --wave=N                Filter by wave number"
    echo "  --status=STATUS         Filter by status"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/dispatch-state.sh init"
    echo "  ./parallel/dispatch-state.sh update --dispatch=DISPATCH-001 --status=COMPLETE"
    echo "  ./parallel/dispatch-state.sh update --wave=1 --status=IN_PROGRESS"
    echo "  ./parallel/dispatch-state.sh query --status=FAILED"
    echo "  ./parallel/dispatch-state.sh report"
}

COMMAND=""
DISPATCH_ID=""
WAVE_NUM=""
STATUS=""
STORY_ID=""
AGENT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --dispatch=*)
            DISPATCH_ID="${1#*=}"
            shift
            ;;
        --wave=*)
            WAVE_NUM="${1#*=}"
            shift
            ;;
        --status=*)
            STATUS="${1#*=}"
            shift
            ;;
        --story=*)
            STORY_ID="${1#*=}"
            shift
            ;;
        --agent=*)
            AGENT="${1#*=}"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            exit 2
            ;;
        *)
            if [ -z "$COMMAND" ]; then
                COMMAND="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$COMMAND" ]; then
    show_help
    exit 2
fi

# Validate status values
validate_status() {
    local status="$1"
    case "$status" in
        PENDING|IN_PROGRESS|COMPLETE|FAILED) return 0 ;;
        *)
            echo -e "${RED}Error: Invalid status '$status'. Must be: PENDING, IN_PROGRESS, COMPLETE, FAILED${NC}" >&2
            exit 2
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_init() {
    mkdir -p "$STATE_DIR"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if command -v jq &>/dev/null; then
        jq -n \
            --arg ts "$timestamp" \
            '{
                current_execution: {
                    execution_id: null,
                    mode: "WAVE",
                    current_wave: 0,
                    total_waves: 0,
                    started_at: $ts,
                    status: "IDLE"
                },
                waves: [],
                dispatches: [],
                metadata: {
                    created: $ts,
                    updated: $ts,
                    version: "1.0"
                }
            }' > "$STATE_FILE"
    else
        cat > "$STATE_FILE" <<EOF
{
  "current_execution": {
    "execution_id": null,
    "mode": "WAVE",
    "current_wave": 0,
    "total_waves": 0,
    "started_at": "$timestamp",
    "status": "IDLE"
  },
  "waves": [],
  "dispatches": [],
  "metadata": {
    "created": "$timestamp",
    "updated": "$timestamp",
    "version": "1.0"
  }
}
EOF
    fi

    echo -e "${GREEN}Dispatch state initialized${NC}: $STATE_FILE"
}

cmd_update() {
    if [ ! -f "$STATE_FILE" ]; then
        echo -e "${RED}Error: State file not found. Run 'init' first.${NC}" >&2
        exit 3
    fi

    if ! command -v jq &>/dev/null; then
        echo -e "${RED}Error: jq is required for update operations${NC}" >&2
        exit 4
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ -n "$DISPATCH_ID" ] && [ -n "$STATUS" ]; then
        validate_status "$STATUS"

        # Check if dispatch exists
        local exists
        exists=$(jq --arg id "$DISPATCH_ID" '.dispatches | map(select(.dispatch_id == $id)) | length' "$STATE_FILE")

        if [ "$exists" -eq 0 ]; then
            # Create new dispatch entry
            jq --arg id "$DISPATCH_ID" \
               --arg status "$STATUS" \
               --arg ts "$timestamp" \
               --arg story "$STORY_ID" \
               --arg agent "$AGENT" \
               --arg wave "${WAVE_NUM:-0}" \
               '.dispatches += [{
                    dispatch_id: $id,
                    status: $status,
                    story_id: (if $story == "" then null else $story end),
                    agent: (if $agent == "" then null else $agent end),
                    wave: ($wave | tonumber),
                    created_at: $ts,
                    updated_at: $ts
                }] | .metadata.updated = $ts' "$STATE_FILE" > "${STATE_FILE}.tmp"
        else
            # Update existing dispatch
            jq --arg id "$DISPATCH_ID" \
               --arg status "$STATUS" \
               --arg ts "$timestamp" \
               '(.dispatches[] | select(.dispatch_id == $id)) |= (
                    .status = $status | .updated_at = $ts
                ) | .metadata.updated = $ts' "$STATE_FILE" > "${STATE_FILE}.tmp"
        fi
        mv "${STATE_FILE}.tmp" "$STATE_FILE"
        echo -e "${GREEN}Updated${NC} dispatch $DISPATCH_ID -> $STATUS"

    elif [ -n "$WAVE_NUM" ] && [ -n "$STATUS" ]; then
        validate_status "$STATUS"

        # Check if wave exists
        local wave_exists
        wave_exists=$(jq --arg w "$WAVE_NUM" '.waves | map(select(.wave == ($w | tonumber))) | length' "$STATE_FILE")

        if [ "$wave_exists" -eq 0 ]; then
            # Create new wave entry
            jq --arg w "$WAVE_NUM" \
               --arg status "$STATUS" \
               --arg ts "$timestamp" \
               '.waves += [{
                    wave: ($w | tonumber),
                    status: $status,
                    started_at: $ts,
                    updated_at: $ts
                }] | .metadata.updated = $ts' "$STATE_FILE" > "${STATE_FILE}.tmp"
        else
            # Update existing wave
            jq --arg w "$WAVE_NUM" \
               --arg status "$STATUS" \
               --arg ts "$timestamp" \
               '(.waves[] | select(.wave == ($w | tonumber))) |= (
                    .status = $status | .updated_at = $ts
                ) | .metadata.updated = $ts' "$STATE_FILE" > "${STATE_FILE}.tmp"
        fi
        mv "${STATE_FILE}.tmp" "$STATE_FILE"
        echo -e "${GREEN}Updated${NC} wave $WAVE_NUM -> $STATUS"

    else
        echo -e "${RED}Error: --dispatch=ID or --wave=N required with --status${NC}" >&2
        exit 2
    fi
}

cmd_query() {
    if [ ! -f "$STATE_FILE" ]; then
        echo -e "${RED}Error: State file not found. Run 'init' first.${NC}" >&2
        exit 3
    fi

    if ! command -v jq &>/dev/null; then
        echo -e "${RED}Error: jq is required for query operations${NC}" >&2
        exit 4
    fi

    if [ -n "$WAVE_NUM" ]; then
        echo -e "${CYAN}Dispatches in wave $WAVE_NUM:${NC}"
        jq --arg w "$WAVE_NUM" \
           '.dispatches | map(select(.wave == ($w | tonumber)))' "$STATE_FILE"
    elif [ -n "$STATUS" ]; then
        validate_status "$STATUS"
        echo -e "${CYAN}Dispatches with status $STATUS:${NC}"
        jq --arg s "$STATUS" \
           '.dispatches | map(select(.status == $s))' "$STATE_FILE"
    else
        echo -e "${CYAN}All dispatches:${NC}"
        jq '.dispatches' "$STATE_FILE"
    fi
}

cmd_report() {
    if [ ! -f "$STATE_FILE" ]; then
        echo -e "${RED}Error: State file not found. Run 'init' first.${NC}" >&2
        exit 3
    fi

    if ! command -v jq &>/dev/null; then
        echo -e "${RED}Error: jq is required for report${NC}" >&2
        exit 4
    fi

    echo -e "${CYAN}${BOLD}Dispatch Execution Report${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Execution status
    local exec_status
    exec_status=$(jq -r '.current_execution.status' "$STATE_FILE")
    local exec_mode
    exec_mode=$(jq -r '.current_execution.mode' "$STATE_FILE")
    echo -e "Status: ${BOLD}$exec_status${NC} | Mode: $exec_mode"
    echo ""

    # Wave summary
    local total_waves
    total_waves=$(jq '.waves | length' "$STATE_FILE")
    echo -e "${BLUE}Waves: $total_waves${NC}"
    jq -r '.waves[] | "  Wave \(.wave): \(.status)"' "$STATE_FILE" 2>/dev/null || true
    echo ""

    # Dispatch summary
    local total
    total=$(jq '.dispatches | length' "$STATE_FILE")
    local pending
    pending=$(jq '[.dispatches[] | select(.status == "PENDING")] | length' "$STATE_FILE")
    local in_progress
    in_progress=$(jq '[.dispatches[] | select(.status == "IN_PROGRESS")] | length' "$STATE_FILE")
    local complete
    complete=$(jq '[.dispatches[] | select(.status == "COMPLETE")] | length' "$STATE_FILE")
    local failed
    failed=$(jq '[.dispatches[] | select(.status == "FAILED")] | length' "$STATE_FILE")

    echo -e "${BLUE}Dispatches: $total total${NC}"
    echo -e "  Pending:     $pending"
    echo -e "  In Progress: ${YELLOW}$in_progress${NC}"
    echo -e "  Complete:    ${GREEN}$complete${NC}"
    echo -e "  Failed:      ${RED}$failed${NC}"

    if [ "$total" -gt 0 ]; then
        local pct=$((complete * 100 / total))
        echo ""
        echo -e "Progress: ${GREEN}${pct}%${NC} ($complete/$total)"
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_reset() {
    if [ -f "$STATE_FILE" ]; then
        cmd_init
        echo -e "${YELLOW}State file reset${NC}"
    else
        echo -e "${YELLOW}No state file to reset${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

case "$COMMAND" in
    init)
        cmd_init
        ;;
    update)
        cmd_update
        ;;
    query)
        cmd_query
        ;;
    report)
        cmd_report
        ;;
    reset)
        cmd_reset
        ;;
    *)
        echo -e "${RED}Error: Unknown command '$COMMAND'${NC}" >&2
        show_help
        exit 2
        ;;
esac

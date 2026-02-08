#!/bin/bash

# Swarm Scratchpad - Inter-agent communication channel
# Implements FR-012 (Shared Scratchpad)
# Project-scoped: entries never cross project boundaries (per security req)
#
# USAGE:
#   ./parallel/swarm-scratchpad.sh write --from=AGENT --to=TARGET --msg=MESSAGE [--task=TASK_ID] [--priority=normal|high]
#   ./parallel/swarm-scratchpad.sh read [--for=AGENT] [--task=TASK_ID] [--unread]
#   ./parallel/swarm-scratchpad.sh list [--json]
#   ./parallel/swarm-scratchpad.sh ack --id=NOTE_ID
#   ./parallel/swarm-scratchpad.sh clear [--force]
#   ./parallel/swarm-scratchpad.sh status
#   ./parallel/swarm-scratchpad.sh --help

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
SWARM_DIR="${SWARM_DIR:-.claude/swarm}"
SCRATCHPAD_FILE=""
LOCK_FILE=""
FORCE="${FORCE:-false}"
JSON_OUTPUT=false
NOTE_COUNTER=0

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Swarm Scratchpad - Inter-agent communication channel"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/swarm-scratchpad.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  write                   Write a note to the scratchpad"
    echo "  read                    Read notes (optionally filtered)"
    echo "  list                    List all notes"
    echo "  ack                     Acknowledge (mark as read) a note"
    echo "  clear                   Clear all notes (requires confirmation)"
    echo "  status                  Show scratchpad statistics"
    echo ""
    echo "OPTIONS:"
    echo "  --from=AGENT            Author agent type (coder, tester, etc.)"
    echo "  --to=TARGET             Target agent type or 'all'"
    echo "  --msg=MESSAGE           Note message content"
    echo "  --task=TASK_ID          Associated task ID"
    echo "  --priority=LEVEL        Priority: normal (default), high"
    echo "  --for=AGENT             Filter notes targeted at this agent"
    echo "  --unread                Show only unacknowledged notes"
    echo "  --id=NOTE_ID            Note ID (for ack)"
    echo "  --dir=PATH              Swarm directory (default: .claude/swarm)"
    echo "  --json                  Output in JSON format"
    echo "  --force                 Skip confirmation prompts"
    echo "  --help                  Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/swarm-scratchpad.sh write --from=coder --to=tester --msg='Changed auth API signature'"
    echo "  ./parallel/swarm-scratchpad.sh write --from=coder --to=all --msg='New interface for UserService' --task=STORY-001 --priority=high"
    echo "  ./parallel/swarm-scratchpad.sh read --for=tester --unread"
    echo "  ./parallel/swarm-scratchpad.sh ack --id=NOTE-003"
    echo "  ./parallel/swarm-scratchpad.sh status"
}

# Parse arguments
COMMAND=""
FROM_AGENT=""
TO_TARGET=""
MESSAGE=""
TASK_ID=""
PRIORITY="normal"
FOR_AGENT=""
UNREAD_ONLY=false
NOTE_ID=""

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --from=*) FROM_AGENT="${arg#--from=}" ;;
        --to=*) TO_TARGET="${arg#--to=}" ;;
        --msg=*) MESSAGE="${arg#--msg=}" ;;
        --task=*) TASK_ID="${arg#--task=}" ;;
        --priority=*) PRIORITY="${arg#--priority=}" ;;
        --for=*) FOR_AGENT="${arg#--for=}" ;;
        --unread) UNREAD_ONLY=true ;;
        --id=*) NOTE_ID="${arg#--id=}" ;;
        --dir=*) SWARM_DIR="${arg#--dir=}" ;;
        --json) JSON_OUTPUT=true ;;
        --force) FORCE=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$COMMAND" ] && COMMAND="$arg" ;;
    esac
done

# Set file paths
SCRATCHPAD_FILE="$SWARM_DIR/scratchpad.jsonl"
LOCK_FILE="$SWARM_DIR/.scratchpad.lock"

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Acquire file lock
acquire_lock() {
    mkdir -p "$SWARM_DIR"
    local lock_fd=201
    eval "exec $lock_fd>$LOCK_FILE"
    if command -v flock &>/dev/null; then
        flock -w 5 $lock_fd 2>/dev/null || {
            echo -e "${RED}[FAIL]${NC} Could not acquire scratchpad lock"
            exit 1
        }
    fi
}

release_lock() {
    local lock_fd=201
    eval "exec $lock_fd>&-" 2>/dev/null || true
}

# Get next note ID
next_note_id() {
    if [ ! -f "$SCRATCHPAD_FILE" ] || [ ! -s "$SCRATCHPAD_FILE" ]; then
        echo "NOTE-001"
        return
    fi
    local last_num
    last_num=$(grep -o '"id":"NOTE-[0-9]*"' "$SCRATCHPAD_FILE" | grep -o '[0-9]*' | sort -n | tail -1)
    if [ -z "$last_num" ]; then
        echo "NOTE-001"
    else
        printf "NOTE-%03d" $((last_num + 1))
    fi
}

# Extract JSON field
json_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_write() {
    if [ -z "$FROM_AGENT" ]; then
        echo -e "${RED}[FAIL]${NC} --from is required"
        exit 1
    fi
    if [ -z "$TO_TARGET" ]; then
        echo -e "${RED}[FAIL]${NC} --to is required"
        exit 1
    fi
    if [ -z "$MESSAGE" ]; then
        echo -e "${RED}[FAIL]${NC} --msg is required"
        exit 1
    fi

    # Validate priority
    if [ "$PRIORITY" != "normal" ] && [ "$PRIORITY" != "high" ]; then
        echo -e "${RED}[FAIL]${NC} Invalid priority: $PRIORITY (must be normal or high)"
        exit 1
    fi

    acquire_lock

    mkdir -p "$SWARM_DIR"
    touch "$SCRATCHPAD_FILE"

    local note_id
    note_id=$(next_note_id)
    local ts
    ts=$(now_ts)

    # Escape message for JSON
    local safe_msg
    safe_msg=$(echo "$MESSAGE" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g' | head -1)

    local note_json="{\"id\":\"$note_id\",\"from\":\"$FROM_AGENT\",\"to\":\"$TO_TARGET\",\"message\":\"$safe_msg\",\"task_id\":\"${TASK_ID}\",\"priority\":\"$PRIORITY\",\"acknowledged\":false,\"acked_by\":\"\",\"created_at\":\"$ts\"}"

    echo "$note_json" >> "$SCRATCHPAD_FILE"

    release_lock

    if [ "$PRIORITY" = "high" ]; then
        echo -e "${YELLOW}[HIGH]${NC} Note $note_id: $FROM_AGENT -> $TO_TARGET: $MESSAGE"
    else
        echo -e "${GREEN}[PASS]${NC} Note $note_id written: $FROM_AGENT -> $TO_TARGET"
    fi
}

cmd_read() {
    if [ ! -f "$SCRATCHPAD_FILE" ] || [ ! -s "$SCRATCHPAD_FILE" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"notes":[]}'
        else
            echo -e "${CYAN}[INFO]${NC} Scratchpad is empty"
        fi
        return
    fi

    local notes
    notes=$(cat "$SCRATCHPAD_FILE")

    # Filter by target agent
    if [ -n "$FOR_AGENT" ]; then
        notes=$(echo "$notes" | grep -E "\"to\":\"($FOR_AGENT|all)\"" 2>/dev/null || true)
    fi

    # Filter unread only
    if [ "$UNREAD_ONLY" = true ]; then
        notes=$(echo "$notes" | grep '"acknowledged":false' 2>/dev/null || true)
    fi

    # Filter by task
    if [ -n "$TASK_ID" ]; then
        notes=$(echo "$notes" | grep "\"task_id\":\"$TASK_ID\"" 2>/dev/null || true)
    fi

    if [ -z "$notes" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"notes":[]}'
        else
            echo -e "${CYAN}[INFO]${NC} No notes found"
        fi
        return
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"notes":['
        local first=true
        while IFS= read -r note; do
            [ -z "$note" ] && continue
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            echo "$note"
        done <<< "$notes"
        echo ']}'
        return
    fi

    # Formatted output
    echo ""
    echo -e "${BOLD}Scratchpad Notes${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    while IFS= read -r note; do
        [ -z "$note" ] && continue
        local id from to msg task prio acked ts
        id=$(json_field "$note" "id")
        from=$(json_field "$note" "from")
        to=$(json_field "$note" "to")
        msg=$(json_field "$note" "message")
        task=$(json_field "$note" "task_id")
        prio=$(json_field "$note" "priority")
        ts=$(json_field "$note" "created_at")

        # Check acknowledged status
        local ack_status="${GREEN}unread${NC}"
        if echo "$note" | grep -q '"acknowledged":true'; then
            ack_status="${CYAN}read${NC}"
        fi

        local prio_marker=""
        if [ "$prio" = "high" ]; then
            prio_marker="${RED}[HIGH] ${NC}"
        fi

        echo -e "  ${BOLD}$id${NC} ${prio_marker}($ack_status)"
        echo -e "    From: ${CYAN}$from${NC} -> To: ${YELLOW}$to${NC}${task:+ (Task: $task)}"
        echo -e "    ${msg}"
        echo -e "    ${BLUE}$ts${NC}"
        echo ""
    done <<< "$notes"
}

cmd_list() {
    # Alias for read with no filters
    cmd_read
}

cmd_ack() {
    if [ -z "$NOTE_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi
    if [ ! -f "$SCRATCHPAD_FILE" ]; then
        echo -e "${RED}[FAIL]${NC} Scratchpad not found"
        exit 1
    fi

    acquire_lock

    local note
    note=$(grep "\"id\":\"$NOTE_ID\"" "$SCRATCHPAD_FILE" 2>/dev/null | head -1)
    if [ -z "$note" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Note $NOTE_ID not found"
        exit 1
    fi

    # Already acknowledged?
    if echo "$note" | grep -q '"acknowledged":true'; then
        release_lock
        echo -e "${CYAN}[INFO]${NC} Note $NOTE_ID already acknowledged"
        return
    fi

    local acker="${FOR_AGENT:-unknown}"
    local new_note
    new_note=$(echo "$note" | sed 's/"acknowledged":false/"acknowledged":true/' | sed "s/\"acked_by\":\"\"/\"acked_by\":\"$acker\"/")

    # Replace in file
    local tmp_file="$SCRATCHPAD_FILE.tmp"
    grep -v "\"id\":\"$NOTE_ID\"" "$SCRATCHPAD_FILE" > "$tmp_file" 2>/dev/null || true
    echo "$new_note" >> "$tmp_file"
    mv "$tmp_file" "$SCRATCHPAD_FILE"

    release_lock

    echo -e "${GREEN}[PASS]${NC} Note $NOTE_ID acknowledged"
}

cmd_clear() {
    if [ ! -f "$SCRATCHPAD_FILE" ] || [ ! -s "$SCRATCHPAD_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} Scratchpad already empty"
        return 0
    fi

    local total
    total=$(wc -l < "$SCRATCHPAD_FILE" 2>/dev/null || echo "0")
    total=$(echo "$total" | tr -d ' ')

    if [ "$FORCE" != "true" ]; then
        echo -e "${YELLOW}Clear scratchpad? $total notes will be removed.${NC}"
        echo -n "Continue? (y/N) "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo -e "${CYAN}[INFO]${NC} Clear cancelled"
            exit 2
        fi
    fi

    > "$SCRATCHPAD_FILE"
    echo -e "${GREEN}[PASS]${NC} Scratchpad cleared ($total notes removed)"
}

cmd_status() {
    if [ ! -f "$SCRATCHPAD_FILE" ] || [ ! -s "$SCRATCHPAD_FILE" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"total":0,"unread":0,"high_priority":0}'
        else
            echo -e "${CYAN}[INFO]${NC} Scratchpad is empty"
        fi
        return
    fi

    local total unread high_prio
    total=$(wc -l < "$SCRATCHPAD_FILE" 2>/dev/null || echo "0")
    total=$(echo "$total" | tr -d ' ')
    unread=$(grep -c '"acknowledged":false' "$SCRATCHPAD_FILE" 2>/dev/null || echo "0")
    high_prio=$(grep -c '"priority":"high"' "$SCRATCHPAD_FILE" 2>/dev/null || echo "0")
    local high_unread
    high_unread=$(grep '"priority":"high"' "$SCRATCHPAD_FILE" 2>/dev/null | grep -c '"acknowledged":false' 2>/dev/null || echo "0")

    if [ "$JSON_OUTPUT" = true ]; then
        echo "{\"total\":$total,\"unread\":$unread,\"high_priority\":$high_prio,\"high_priority_unread\":$high_unread}"
        return
    fi

    echo ""
    echo -e "${BOLD}Scratchpad Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Total notes:     ${BOLD}$total${NC}"
    echo -e "  Unread:          ${YELLOW}$unread${NC}"
    echo -e "  High priority:   ${RED}$high_prio${NC}"
    if [ "$high_unread" -gt 0 ]; then
        echo -e "  ${RED}High + unread:   $high_unread (requires attention!)${NC}"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Show note counts by sender
    echo ""
    echo -e "  ${BOLD}Notes by sender:${NC}"
    local senders
    senders=$(grep -o '"from":"[^"]*"' "$SCRATCHPAD_FILE" | sort | uniq -c | sort -rn)
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local count sender
        count=$(echo "$line" | awk '{print $1}')
        sender=$(echo "$line" | grep -o '"[^"]*"$' | tr -d '"')
        echo -e "    ${CYAN}$sender${NC}: $count"
    done <<< "$senders"
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
    write) cmd_write ;;
    read) cmd_read ;;
    list) cmd_list ;;
    ack) cmd_ack ;;
    clear) cmd_clear ;;
    status) cmd_status ;;
    *)
        echo -e "${RED}[FAIL]${NC} Unknown command: $COMMAND"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

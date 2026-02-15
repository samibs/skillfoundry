#!/bin/bash

# Session Recorder - Agent session lifecycle management
# Records what agents do during execution: files touched, decisions, outcomes.
# Stores structured session records for replay, harvest, and analytics.
#
# USAGE:
#   ./scripts/session-recorder.sh start --agent=AGENT [--story=STORY] [--session=ID]
#   ./scripts/session-recorder.sh log --event=EVENT [--detail=DETAIL]
#   ./scripts/session-recorder.sh decision --what=WHAT --why=WHY [--alternatives=A,B] [--confidence=0.9]
#   ./scripts/session-recorder.sh file --action=read|create|modify --path=PATH
#   ./scripts/session-recorder.sh end --outcome=success|partial|failed [--gate=GATE_RESULT]
#   ./scripts/session-recorder.sh show [--session=ID] [--date=YYYY-MM-DD] [--json]
#   ./scripts/session-recorder.sh list [--date=YYYY-MM-DD] [--limit=N]
#   ./scripts/session-recorder.sh --help

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
SESSION_DIR="${SESSION_DIR:-logs/sessions}"
CURRENT_SESSION_FILE=".claude/current-session.json"
JSON_OUTPUT=false

# Parsed arguments
COMMAND=""
AGENT=""
STORY=""
SESSION_ID=""
EVENT=""
DETAIL=""
DECISION_WHAT=""
DECISION_WHY=""
DECISION_ALTS=""
DECISION_CONFIDENCE="0.8"
DECISION_PRD_REQ=""
FILE_ACTION=""
FILE_PATH=""
OUTCOME=""
GATE_RESULT=""
TARGET_DATE=""
LIMIT="10"

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Session Recorder - Agent session lifecycle management"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/session-recorder.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  start                 Start a new session"
    echo "  log                   Log an event to current session"
    echo "  decision              Record a decision with rationale"
    echo "  file                  Record a file operation"
    echo "  end                   End current session with outcome"
    echo "  show                  Display a session record"
    echo "  list                  List recent sessions"
    echo ""
    echo "START OPTIONS:"
    echo "  --agent=AGENT         Agent name (required)"
    echo "  --story=STORY         Story ID (optional)"
    echo "  --session=ID          Custom session ID (optional, auto-generated)"
    echo ""
    echo "LOG OPTIONS:"
    echo "  --event=EVENT         Event description (required)"
    echo "  --detail=DETAIL       Additional detail (optional)"
    echo ""
    echo "DECISION OPTIONS:"
    echo "  --what=WHAT           What was decided (required)"
    echo "  --why=WHY             Why this decision (required)"
    echo "  --alternatives=A,B    Rejected alternatives (optional)"
    echo "  --confidence=0.9      Confidence score 0.0-1.0 (default: 0.8)"
    echo "  --prd-req=FR-001      PRD requirement reference (optional)"
    echo ""
    echo "FILE OPTIONS:"
    echo "  --action=ACTION       read|create|modify (required)"
    echo "  --path=PATH           File path (required)"
    echo ""
    echo "END OPTIONS:"
    echo "  --outcome=OUTCOME     success|partial|failed (required)"
    echo "  --gate=RESULT         Gate/Anvil result (optional)"
    echo ""
    echo "SHOW/LIST OPTIONS:"
    echo "  --session=ID          Show specific session"
    echo "  --date=YYYY-MM-DD     Filter by date"
    echo "  --limit=N             Max sessions to list (default: 10)"
    echo "  --json                Output in JSON format"
}

parse_args() {
    COMMAND="${1:-}"
    shift 2>/dev/null || true

    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent=*)       AGENT="${1#*=}"; shift ;;
            --story=*)       STORY="${1#*=}"; shift ;;
            --session=*)     SESSION_ID="${1#*=}"; shift ;;
            --event=*)       EVENT="${1#*=}"; shift ;;
            --detail=*)      DETAIL="${1#*=}"; shift ;;
            --what=*)        DECISION_WHAT="${1#*=}"; shift ;;
            --why=*)         DECISION_WHY="${1#*=}"; shift ;;
            --alternatives=*) DECISION_ALTS="${1#*=}"; shift ;;
            --confidence=*)  DECISION_CONFIDENCE="${1#*=}"; shift ;;
            --prd-req=*)     DECISION_PRD_REQ="${1#*=}"; shift ;;
            --action=*)      FILE_ACTION="${1#*=}"; shift ;;
            --path=*)        FILE_PATH="${1#*=}"; shift ;;
            --outcome=*)     OUTCOME="${1#*=}"; shift ;;
            --gate=*)        GATE_RESULT="${1#*=}"; shift ;;
            --date=*)        TARGET_DATE="${1#*=}"; shift ;;
            --limit=*)       LIMIT="${1#*=}"; shift ;;
            --json)          JSON_OUTPUT=true; shift ;;
            --help)          show_help; exit 0 ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

get_current_session() {
    if [ -f "$CURRENT_SESSION_FILE" ]; then
        jq -r '.session_id // empty' "$CURRENT_SESSION_FILE" 2>/dev/null || true
    fi
}

get_session_file() {
    local sid="$1"
    local date_part
    date_part=$(echo "$sid" | grep -oE '^[0-9]{8}' || date +%Y%m%d)
    local formatted_date="${date_part:0:4}-${date_part:4:2}-${date_part:6:2}"
    echo "$SESSION_DIR/$formatted_date/session-${sid}.jsonl"
}

ensure_session_dir() {
    local session_file="$1"
    local dir
    dir=$(dirname "$session_file")
    mkdir -p "$dir"
}

append_event() {
    local session_file="$1"
    local event_json="$2"
    ensure_session_dir "$session_file"
    echo "$event_json" >> "$session_file"
}

json_escape() {
    echo "$1" | jq -R -s '.[:-1]' 2>/dev/null || echo "\"$1\""
}

# ═══════════════════════════════════════════════════════════════
# START - Begin a new session
# ═══════════════════════════════════════════════════════════════

cmd_start() {
    if [ -z "$AGENT" ]; then
        echo -e "${RED}Error: --agent is required${NC}"
        exit 1
    fi

    # Check for existing active session
    local existing
    existing=$(get_current_session)
    if [ -n "$existing" ]; then
        echo -e "${YELLOW}Warning: Active session $existing exists. Ending it first.${NC}"
        OUTCOME="interrupted"
        cmd_end_internal
    fi

    if [ -z "$SESSION_ID" ]; then
        SESSION_ID="$(date +%Y%m%d_%H%M%S)_$(head -c 4 /dev/urandom 2>/dev/null | xxd -p 2>/dev/null || echo "$$")"
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local session_file
    session_file=$(get_session_file "$SESSION_ID")

    mkdir -p "$(dirname "$CURRENT_SESSION_FILE")"

    # Write current session pointer
    cat > "$CURRENT_SESSION_FILE" <<EOF
{
  "session_id": "$SESSION_ID",
  "agent": "$AGENT",
  "story": "$STORY",
  "started_at": "$timestamp",
  "session_file": "$session_file"
}
EOF

    # Write session start event
    local start_event
    start_event=$(cat <<EOF
{"type":"session_start","session_id":"$SESSION_ID","agent":"$AGENT","story":"$STORY","timestamp":"$timestamp","head_commit":"$(git rev-parse --short HEAD 2>/dev/null || echo 'none')"}
EOF
    )
    append_event "$session_file" "$start_event"

    echo -e "${GREEN}[START]${NC} Session recording"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Session: $SESSION_ID"
    echo "Agent:   $AGENT"
    [ -n "$STORY" ] && echo "Story:   $STORY"
    echo "File:    $session_file"
}

# ═══════════════════════════════════════════════════════════════
# LOG - Record an event
# ═══════════════════════════════════════════════════════════════

cmd_log() {
    local sid
    sid=$(get_current_session)
    if [ -z "$sid" ]; then
        echo -e "${RED}Error: No active session. Run 'start' first.${NC}"
        exit 1
    fi

    if [ -z "$EVENT" ]; then
        echo -e "${RED}Error: --event is required${NC}"
        exit 1
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local session_file
    session_file=$(jq -r '.session_file' "$CURRENT_SESSION_FILE")

    local detail_json="null"
    if [ -n "$DETAIL" ]; then
        detail_json=$(json_escape "$DETAIL")
    fi

    local event_json="{\"type\":\"event\",\"timestamp\":\"$timestamp\",\"event\":$(json_escape "$EVENT"),\"detail\":$detail_json}"
    append_event "$session_file" "$event_json"
}

# ═══════════════════════════════════════════════════════════════
# DECISION - Record a decision with rationale
# ═══════════════════════════════════════════════════════════════

cmd_decision() {
    local sid
    sid=$(get_current_session)
    if [ -z "$sid" ]; then
        echo -e "${RED}Error: No active session. Run 'start' first.${NC}"
        exit 1
    fi

    if [ -z "$DECISION_WHAT" ] || [ -z "$DECISION_WHY" ]; then
        echo -e "${RED}Error: --what and --why are required${NC}"
        exit 1
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local session_file
    session_file=$(jq -r '.session_file' "$CURRENT_SESSION_FILE")

    local alts_json="[]"
    if [ -n "$DECISION_ALTS" ]; then
        alts_json=$(echo "$DECISION_ALTS" | tr ',' '\n' | jq -R . | jq -s .)
    fi

    local prd_json="null"
    if [ -n "$DECISION_PRD_REQ" ]; then
        prd_json="\"$DECISION_PRD_REQ\""
    fi

    local decision_json
    decision_json=$(cat <<EOF
{"type":"decision","timestamp":"$timestamp","what":$(json_escape "$DECISION_WHAT"),"why":$(json_escape "$DECISION_WHY"),"alternatives_rejected":$alts_json,"confidence":$DECISION_CONFIDENCE,"prd_requirement":$prd_json}
EOF
    )
    append_event "$session_file" "$decision_json"

    echo -e "${BLUE}[DECISION]${NC} $(echo "$DECISION_WHAT" | head -c 80)"
}

# ═══════════════════════════════════════════════════════════════
# FILE - Record a file operation
# ═══════════════════════════════════════════════════════════════

cmd_file() {
    local sid
    sid=$(get_current_session)
    if [ -z "$sid" ]; then
        echo -e "${RED}Error: No active session. Run 'start' first.${NC}"
        exit 1
    fi

    if [ -z "$FILE_ACTION" ] || [ -z "$FILE_PATH" ]; then
        echo -e "${RED}Error: --action and --path are required${NC}"
        exit 1
    fi

    # Validate action
    case "$FILE_ACTION" in
        read|create|modify) ;;
        *)
            echo -e "${RED}Error: --action must be read|create|modify${NC}"
            exit 1
            ;;
    esac

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local session_file
    session_file=$(jq -r '.session_file' "$CURRENT_SESSION_FILE")

    local file_json="{\"type\":\"file_op\",\"timestamp\":\"$timestamp\",\"action\":\"$FILE_ACTION\",\"path\":$(json_escape "$FILE_PATH")}"
    append_event "$session_file" "$file_json"
}

# ═══════════════════════════════════════════════════════════════
# END - Finalize session
# ═══════════════════════════════════════════════════════════════

cmd_end_internal() {
    local sid
    sid=$(get_current_session)
    if [ -z "$sid" ]; then
        return
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local session_file
    session_file=$(jq -r '.session_file' "$CURRENT_SESSION_FILE")
    local agent
    agent=$(jq -r '.agent' "$CURRENT_SESSION_FILE")
    local started
    started=$(jq -r '.started_at' "$CURRENT_SESSION_FILE")

    # Count events from session file
    local event_count=0
    local decision_count=0
    local files_read=0
    local files_created=0
    local files_modified=0

    if [ -f "$session_file" ]; then
        event_count=$(grep -c '"type":"event"' "$session_file" 2>/dev/null || echo "0")
        decision_count=$(grep -c '"type":"decision"' "$session_file" 2>/dev/null || echo "0")
        files_read=$(grep -c '"action":"read"' "$session_file" 2>/dev/null || echo "0")
        files_created=$(grep -c '"action":"create"' "$session_file" 2>/dev/null || echo "0")
        files_modified=$(grep -c '"action":"modify"' "$session_file" 2>/dev/null || echo "0")
    fi

    local gate_json="null"
    if [ -n "$GATE_RESULT" ]; then
        gate_json="\"$GATE_RESULT\""
    fi

    local end_event
    end_event=$(cat <<EOF
{"type":"session_end","session_id":"$sid","timestamp":"$timestamp","outcome":"$OUTCOME","gate_result":$gate_json,"summary":{"events":$event_count,"decisions":$decision_count,"files_read":$files_read,"files_created":$files_created,"files_modified":$files_modified}}
EOF
    )
    append_event "$session_file" "$end_event"

    # Remove current session pointer
    rm -f "$CURRENT_SESSION_FILE"
}

cmd_end() {
    local sid
    sid=$(get_current_session)
    if [ -z "$sid" ]; then
        echo -e "${RED}Error: No active session.${NC}"
        exit 1
    fi

    if [ -z "$OUTCOME" ]; then
        echo -e "${RED}Error: --outcome is required (success|partial|failed)${NC}"
        exit 1
    fi

    case "$OUTCOME" in
        success|partial|failed|interrupted) ;;
        *)
            echo -e "${RED}Error: --outcome must be success|partial|failed${NC}"
            exit 1
            ;;
    esac

    local agent
    agent=$(jq -r '.agent' "$CURRENT_SESSION_FILE")
    local session_file
    session_file=$(jq -r '.session_file' "$CURRENT_SESSION_FILE")

    cmd_end_internal

    local icon="[PASS]"
    local color="$GREEN"
    [ "$OUTCOME" = "partial" ] && icon="[WARN]" && color="$YELLOW"
    [ "$OUTCOME" = "failed" ] && icon="[FAIL]" && color="$RED"

    echo -e "${color}${icon}${NC} Session ended: $OUTCOME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Session: $sid"
    echo "Agent:   $agent"
    echo "Record:  $session_file"
}

# ═══════════════════════════════════════════════════════════════
# SHOW - Display a session record
# ═══════════════════════════════════════════════════════════════

cmd_show() {
    local session_file=""

    if [ -n "$SESSION_ID" ]; then
        session_file=$(get_session_file "$SESSION_ID")
    else
        # Show most recent session
        local latest
        latest=$(find "$SESSION_DIR" -name "session-*.jsonl" -type f 2>/dev/null | sort -r | head -1)
        if [ -z "$latest" ]; then
            echo -e "${YELLOW}No sessions found.${NC}"
            exit 0
        fi
        session_file="$latest"
    fi

    if [ ! -f "$session_file" ]; then
        echo -e "${RED}Session file not found: $session_file${NC}"
        exit 1
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        cat "$session_file"
        return
    fi

    echo -e "${CYAN}${BOLD}SESSION REPLAY${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local session_start
    session_start=$(grep '"type":"session_start"' "$session_file" | head -1)
    if [ -n "$session_start" ]; then
        local sid
        sid=$(echo "$session_start" | jq -r '.session_id')
        local agent
        agent=$(echo "$session_start" | jq -r '.agent')
        local story
        story=$(echo "$session_start" | jq -r '.story // "none"')
        local started
        started=$(echo "$session_start" | jq -r '.timestamp')
        local commit
        commit=$(echo "$session_start" | jq -r '.head_commit')

        echo "Session: $sid"
        echo "Agent:   $agent"
        echo "Story:   $story"
        echo "Started: $started"
        echo "Commit:  $commit"
    fi

    echo ""
    echo -e "${BOLD}Timeline:${NC}"

    while IFS= read -r line; do
        if [ -z "$line" ]; then continue; fi
        local etype
        etype=$(echo "$line" | jq -r '.type' 2>/dev/null || continue)
        local ts
        ts=$(echo "$line" | jq -r '.timestamp // ""' 2>/dev/null)
        local time_short="${ts:11:8}"

        case "$etype" in
            session_start)
                echo -e "  ${GREEN}$time_short${NC} SESSION START"
                ;;
            event)
                local ev
                ev=$(echo "$line" | jq -r '.event')
                echo -e "  ${BLUE}$time_short${NC} $ev"
                ;;
            decision)
                local what
                what=$(echo "$line" | jq -r '.what')
                local why
                why=$(echo "$line" | jq -r '.why')
                local conf
                conf=$(echo "$line" | jq -r '.confidence')
                echo -e "  ${YELLOW}$time_short${NC} DECISION: $what"
                echo -e "           Why: $why (confidence: $conf)"
                local alts
                alts=$(echo "$line" | jq -r '.alternatives_rejected | if length > 0 then "Rejected: " + join(", ") else empty end' 2>/dev/null || true)
                [ -n "$alts" ] && echo -e "           $alts"
                ;;
            file_op)
                local action
                action=$(echo "$line" | jq -r '.action')
                local path
                path=$(echo "$line" | jq -r '.path')
                local icon="?"
                [ "$action" = "read" ] && icon="R"
                [ "$action" = "create" ] && icon="+"
                [ "$action" = "modify" ] && icon="~"
                echo -e "  ${CYAN}$time_short${NC} [$icon] $path"
                ;;
            session_end)
                local outcome
                outcome=$(echo "$line" | jq -r '.outcome')
                local gate
                gate=$(echo "$line" | jq -r '.gate_result // "none"')
                local summary
                summary=$(echo "$line" | jq -r '.summary | "Events: \(.events) | Decisions: \(.decisions) | Files: R=\(.files_read) C=\(.files_created) M=\(.files_modified)"')
                local color="$GREEN"
                [ "$outcome" = "partial" ] && color="$YELLOW"
                [ "$outcome" = "failed" ] && color="$RED"
                echo -e "  ${color}$time_short${NC} SESSION END: $outcome (gate: $gate)"
                echo -e "           $summary"
                ;;
        esac
    done < "$session_file"
}

# ═══════════════════════════════════════════════════════════════
# LIST - List recent sessions
# ═══════════════════════════════════════════════════════════════

cmd_list() {
    local search_dir="$SESSION_DIR"
    if [ -n "$TARGET_DATE" ]; then
        search_dir="$SESSION_DIR/$TARGET_DATE"
    fi

    local files
    files=$(find "$search_dir" -name "session-*.jsonl" -type f 2>/dev/null | sort -r | head -"$LIMIT")

    if [ -z "$files" ]; then
        echo -e "${YELLOW}No sessions found.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}RECENT SESSIONS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    while IFS= read -r sf; do
        if [ -z "$sf" ]; then continue; fi
        local start_line
        start_line=$(grep '"type":"session_start"' "$sf" 2>/dev/null | head -1)
        local end_line
        end_line=$(grep '"type":"session_end"' "$sf" 2>/dev/null | head -1)

        if [ -n "$start_line" ]; then
            local sid
            sid=$(echo "$start_line" | jq -r '.session_id')
            local agent
            agent=$(echo "$start_line" | jq -r '.agent')
            local started
            started=$(echo "$start_line" | jq -r '.timestamp')

            local outcome="active"
            local decisions=0
            if [ -n "$end_line" ]; then
                outcome=$(echo "$end_line" | jq -r '.outcome')
                decisions=$(echo "$end_line" | jq -r '.summary.decisions // 0')
            fi

            local icon="..."
            [ "$outcome" = "success" ] && icon="[PASS]"
            [ "$outcome" = "partial" ] && icon="[WARN]"
            [ "$outcome" = "failed" ] && icon="[FAIL]"
            [ "$outcome" = "active" ] && icon="[....]"

            printf "  %-8s %-20s %-12s %s (%d decisions)\n" "$icon" "$sid" "$agent" "${started:0:16}" "$decisions"
        fi
    done <<< "$files"
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

parse_args "$@"

case "$COMMAND" in
    start)      cmd_start ;;
    log)        cmd_log ;;
    decision)   cmd_decision ;;
    file)       cmd_file ;;
    end)        cmd_end ;;
    show)       cmd_show ;;
    list)       cmd_list ;;
    --help|help) show_help ;;
    *)
        echo "Usage: $0 {start|log|decision|file|end|show|list} [options]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

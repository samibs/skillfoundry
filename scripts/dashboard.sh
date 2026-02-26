#!/bin/bash

# Live Execution Dashboard - Terminal UI for agent progress
# Implements FR-028 (Live Execution Dashboard)
# Reads state passively (never blocks agent execution)
#
# USAGE:
#   ./scripts/dashboard.sh [--refresh=N] [--once]
#   ./scripts/dashboard.sh --help

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Defaults
REFRESH_INTERVAL=2
ONCE=false
SWARM_DIR="${SWARM_DIR:-.claude/swarm}"
COST_DIR="${COST_DIR:-.claude/costs}"
DISPATCH_STATE=".claude/dispatch-state.json"

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Live Execution Dashboard - Terminal UI for agent progress"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/dashboard.sh [options]"
    echo ""
    echo "OPTIONS:"
    echo "  --refresh=N             Refresh interval in seconds (default: 2)"
    echo "  --once                  Show dashboard once and exit (no auto-refresh)"
    echo "  --help                  Show this help message"
    echo ""
    echo "READS FROM:"
    echo "  .claude/swarm/          Swarm queue, scratchpad, conflicts"
    echo "  .claude/costs/          Token usage data"
    echo "  .claude/dispatch-state.json  Wave-based dispatch state"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/dashboard.sh              # Auto-refresh every 2s"
    echo "  ./scripts/dashboard.sh --refresh=5  # Refresh every 5s"
    echo "  ./scripts/dashboard.sh --once       # Show once and exit"
}

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --refresh=*) REFRESH_INTERVAL="${arg#--refresh=}" ;;
        --once) ONCE=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
    esac
done

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

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

count_by_status() {
    local file="$1"
    local status="$2"
    if [ ! -f "$file" ] || [ ! -s "$file" ]; then
        echo "0"
        return
    fi
    local count
    count=$(grep -c "\"status\":\"$status\"" "$file" 2>/dev/null) || true
    echo "${count:-0}"
}

# Progress bar generator
progress_bar() {
    local completed="$1"
    local total="$2"
    local width="${3:-30}"

    if [ "$total" -eq 0 ]; then
        printf "[%-${width}s]" ""
        return
    fi

    local filled=$((completed * width / total))
    local empty=$((width - filled))

    printf "${GREEN}["
    for ((i=0; i<filled; i++)); do printf "█"; done
    for ((i=0; i<empty; i++)); do printf "░"; done
    printf "]${NC}"
}

# ═══════════════════════════════════════════════════════════════
# DASHBOARD RENDER
# ═══════════════════════════════════════════════════════════════

render_dashboard() {
    # Clear screen
    if [ "$ONCE" != true ]; then
        clear
    fi

    local ts
    ts=$(date +"%Y-%m-%d %H:%M:%S")
    local term_width
    term_width=$(tput cols 2>/dev/null || echo 80)

    echo ""
    echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║           SkillFoundry - Execution Dashboard               ║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo -e "  ${DIM}$ts${NC}"
    echo ""

    # ─── SWARM/WAVE MODE STATUS ───
    local mode="IDLE"
    local queue_file="$SWARM_DIR/task-queue.jsonl"

    if [ -f "$queue_file" ] && [ -s "$queue_file" ]; then
        mode="SWARM"
        local total queued claimed in_progress complete failed blocked
        total=$(wc -l < "$queue_file" 2>/dev/null | tr -d ' ')
        queued=$(count_by_status "$queue_file" "queued")
        claimed=$(count_by_status "$queue_file" "claimed")
        in_progress=$(count_by_status "$queue_file" "in_progress")
        complete=$(count_by_status "$queue_file" "complete")
        failed=$(count_by_status "$queue_file" "failed")
        blocked=$(count_by_status "$queue_file" "blocked")
        local active=$((claimed + in_progress))

        echo -e "  ${BOLD}Mode:${NC} ${GREEN}SWARM${NC}    ${BOLD}Tasks:${NC} $total    ${BOLD}Active Agents:${NC} $active/5"
        echo ""

        # Progress bar
        printf "  Progress: "
        progress_bar "$complete" "$total"
        local pct=0
        [ "$total" -gt 0 ] && pct=$((complete * 100 / total))
        echo -e " ${BOLD}${pct}%${NC} ($complete/$total)"
        echo ""

        # Task breakdown
        echo -e "  ${BOLD}Task Status:${NC}"
        echo -e "    ${BLUE}Queued:${NC}       $queued"
        echo -e "    ${CYAN}Claimed:${NC}      $claimed"
        echo -e "    ${YELLOW}In Progress:${NC}  $in_progress"
        echo -e "    ${GREEN}Complete:${NC}     $complete"
        if [ "$failed" -gt 0 ]; then
            echo -e "    ${RED}Failed:${NC}       $failed"
        fi
        if [ "$blocked" -gt 0 ]; then
            echo -e "    ${RED}Blocked:${NC}      $blocked"
        fi
        echo ""

        # Active agents
        if [ "$active" -gt 0 ]; then
            echo -e "  ${BOLD}Active Agents:${NC}"
            local active_tasks
            active_tasks=$(grep '"status":"in_progress"' "$queue_file" 2>/dev/null || true)
            if [ -n "$active_tasks" ]; then
                while IFS= read -r task; do
                    [ -z "$task" ] && continue
                    local id agent story
                    id=$(json_field "$task" "id")
                    agent=$(json_field "$task" "claimed_by")
                    story=$(json_field "$task" "story_id")
                    echo -e "    ${YELLOW}▶${NC} ${CYAN}$agent${NC} working on $id (story: $story)"
                done <<< "$active_tasks"
            fi
            local claimed_tasks
            claimed_tasks=$(grep '"status":"claimed"' "$queue_file" 2>/dev/null || true)
            if [ -n "$claimed_tasks" ]; then
                while IFS= read -r task; do
                    [ -z "$task" ] && continue
                    local id agent
                    id=$(json_field "$task" "id")
                    agent=$(json_field "$task" "claimed_by")
                    echo -e "    ${BLUE}◆${NC} ${CYAN}$agent${NC} claimed $id (starting...)"
                done <<< "$claimed_tasks"
            fi
            echo ""
        fi
    elif [ -f "$DISPATCH_STATE" ] && [ -s "$DISPATCH_STATE" ]; then
        mode="WAVE"
        echo -e "  ${BOLD}Mode:${NC} ${BLUE}WAVE${NC}     ${DIM}(wave-based dispatch)${NC}"
        echo ""
    else
        echo -e "  ${BOLD}Mode:${NC} ${DIM}IDLE${NC}     ${DIM}(no active execution)${NC}"
        echo ""
    fi

    # ─── SCRATCHPAD STATUS ───
    local scratchpad_file="$SWARM_DIR/scratchpad.jsonl"
    if [ -f "$scratchpad_file" ] && [ -s "$scratchpad_file" ]; then
        local sp_total sp_unread sp_high
        sp_total=$(wc -l < "$scratchpad_file" 2>/dev/null | tr -d ' ')
        sp_unread=$(grep -c '"acknowledged":false' "$scratchpad_file" 2>/dev/null) || true
        sp_unread=${sp_unread:-0}
        sp_high=$(grep '"priority":"high"' "$scratchpad_file" 2>/dev/null | grep -c '"acknowledged":false' 2>/dev/null) || true
        sp_high=${sp_high:-0}

        echo -e "  ${BOLD}Scratchpad:${NC} $sp_total notes"
        if [ "$sp_high" -gt 0 ]; then
            echo -e "    ${RED}$sp_high HIGH priority unread!${NC}"
        elif [ "$sp_unread" -gt 0 ]; then
            echo -e "    ${YELLOW}$sp_unread unread${NC}"
        fi
        echo ""
    fi

    # ─── CONFLICT STATUS ───
    local conflicts_file="$SWARM_DIR/conflicts.jsonl"
    if [ -f "$conflicts_file" ] && [ -s "$conflicts_file" ]; then
        local unresolved
        unresolved=$(grep -c '"status":"detected"' "$conflicts_file" 2>/dev/null) || true
        unresolved=${unresolved:-0}
        if [ "$unresolved" -gt 0 ]; then
            echo -e "  ${BOLD}${RED}Conflicts: $unresolved unresolved${NC}"
            grep '"status":"detected"' "$conflicts_file" 2>/dev/null | head -3 | while IFS= read -r conflict; do
                local file holder requester
                file=$(json_field "$conflict" "file")
                holder=$(json_field "$conflict" "holder_task")
                requester=$(json_field "$conflict" "requesting_task")
                echo -e "    ${RED}⚠${NC} $file: $holder vs $requester"
            done
            echo ""
        fi
    fi

    # ─── COST SUMMARY ───
    local cost_file="$COST_DIR/usage.jsonl"
    if [ -f "$cost_file" ] && [ -s "$cost_file" ]; then
        local total_tokens=0
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            local t
            t=$(json_num_field "$line" "tokens")
            if [ -n "$t" ]; then
                total_tokens=$((total_tokens + t))
            fi
        done < "$cost_file"
        local record_count
        record_count=$(wc -l < "$cost_file" | tr -d ' ')
        printf "  ${BOLD}Token Usage:${NC} %'d tokens (%d records)\n" "$total_tokens" "$record_count"
        echo ""
    fi

    # ─── ESCALATION SUMMARY ───
    local escalation_log="logs/escalations.md"
    local escalation_json=".claude/escalations.jsonl"
    local escalation_count=0
    if [ -f "$escalation_json" ] && [ -s "$escalation_json" ]; then
        escalation_count=$(wc -l < "$escalation_json" 2>/dev/null | tr -d ' ')
    elif [ -f "$escalation_log" ] && [ -s "$escalation_log" ]; then
        escalation_count=$(grep -c '^## ' "$escalation_log" 2>/dev/null || true)
        escalation_count=${escalation_count:-0}
    fi
    if [ "${escalation_count:-0}" -gt 0 ]; then
        echo -e "  ${BOLD}Escalations:${NC} ${YELLOW}$escalation_count recorded${NC}"
        echo ""
    fi

    # ─── FOOTER ───
    echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [ "$ONCE" != true ]; then
        echo -e "  ${DIM}Refreshing every ${REFRESH_INTERVAL}s | Press Ctrl+C to exit${NC}"
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if [ "$ONCE" = true ]; then
    render_dashboard
else
    # Trap Ctrl+C for clean exit
    trap 'echo -e "\n${CYAN}[INFO]${NC} Dashboard stopped"; exit 0' INT TERM

    while true; do
        render_dashboard
        sleep "$REFRESH_INTERVAL"
    done
fi

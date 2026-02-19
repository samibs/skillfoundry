#!/bin/bash

# Proactive Monitoring Daemon
# Background daemon that periodically checks project health and alerts
# when things go wrong. Checks: test health, git health, session health,
# gate rejection rate, disk/log health.
#
# USAGE:
#   ./scripts/heartbeat.sh start [--interval=1800]
#   ./scripts/heartbeat.sh stop
#   ./scripts/heartbeat.sh status
#   ./scripts/heartbeat.sh run-once
#   ./scripts/heartbeat.sh logs [--tail=50]
#   ./scripts/heartbeat.sh init
#   ./scripts/heartbeat.sh --help

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

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

# Defaults
PID_FILE="$PROJECT_DIR/.claude/heartbeat.pid"
STATE_FILE="$PROJECT_DIR/.claude/heartbeat-state.json"
LOG_FILE="$PROJECT_DIR/logs/heartbeat.log"
HEARTBEAT_MD="$PROJECT_DIR/HEARTBEAT.md"
INTERVAL="${HEARTBEAT_INTERVAL:-1800}"  # 30 minutes default
MAX_LOG_LINES=1000

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Proactive Monitoring Daemon"
    echo ""
    echo "Background daemon that periodically checks project health."
    echo "Alerts via notify.sh when issues are detected."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/heartbeat.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  start          Start the heartbeat daemon"
    echo "  stop           Stop the heartbeat daemon"
    echo "  status         Show daemon state and last check results"
    echo "  run-once       Execute one check cycle (no daemon)"
    echo "  logs           Show daemon log"
    echo "  init           Create HEARTBEAT.md template"
    echo ""
    echo "OPTIONS:"
    echo "  --interval=N   Check interval in seconds (default: 1800 = 30 min)"
    echo "  --tail=N       Number of log lines to show (default: 50)"
    echo "  --help         Show this help"
    echo ""
    echo "ENVIRONMENT:"
    echo "  HEARTBEAT_INTERVAL   Override check interval (seconds)"
    echo ""
    echo "CHECKS:"
    echo "  Test Health         Run test suite, alert on failure"
    echo "  Git Health          Uncommitted changes >48h, exposed secrets, branch divergence"
    echo "  Session Health      Stalled sessions (>4 hours without update)"
    echo "  Gate Rejections     Alert if rejection rate >30% in last 10 runs"
    echo "  Disk/Log Health     logs/ size >100MB, temp file accumulation"
    echo ""
    echo "CONFIGURATION:"
    echo "  Edit HEARTBEAT.md at project root to enable/disable checks."
    echo "  Each check section has 'Enabled: yes/no' and 'Severity: level'."
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/heartbeat.sh init"
    echo "  ./scripts/heartbeat.sh start --interval=900"
    echo "  ./scripts/heartbeat.sh run-once"
    echo "  ./scripts/heartbeat.sh status"
    echo "  ./scripts/heartbeat.sh stop"
}

# ═══════════════════════════════════════════════════════════════
# HEARTBEAT.md TEMPLATE
# ═══════════════════════════════════════════════════════════════

generate_template() {
    cat <<'EOF'
# Heartbeat — Project Health Monitoring

> Edit this file to enable/disable checks and set severity levels.
> The heartbeat daemon reads this file on each cycle.

---

## Checks

### Test Health
**Enabled:** yes
**Severity:** warning
Runs the test suite and alerts on failure.

### Git Health
**Enabled:** yes
**Severity:** warning
Checks for:
- Uncommitted changes older than 48 hours
- Exposed secrets patterns (API keys, tokens, passwords)
- Branch divergence from main (>10 commits behind)

### Session Health
**Enabled:** yes
**Severity:** info
Checks for stalled agent sessions (no update in 4+ hours).

### Gate Rejection Rate
**Enabled:** yes
**Severity:** warning
Parses `.claude/rejections.jsonl` and alerts if rejection rate exceeds 30% in the last 10 entries.

### Disk/Log Health
**Enabled:** yes
**Severity:** info
Checks for:
- `logs/` directory size exceeding 100MB
- Temp file accumulation in `.claude/` (>20 files)

---

**Interval:** 30 minutes (override with `HEARTBEAT_INTERVAL` env var)
EOF
}

# ═══════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════

log_msg() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Rotate: keep last N lines
    if [ -f "$LOG_FILE" ]; then
        local line_count
        line_count=$(wc -l < "$LOG_FILE")
        if [ "$line_count" -gt "$MAX_LOG_LINES" ]; then
            local temp_dir
            temp_dir="$(dirname "$LOG_FILE")"
            local tmp
            tmp=$(mktemp "$temp_dir/.heartbeat-log.XXXXXX")
            chmod 600 "$tmp"
            tail -"$MAX_LOG_LINES" "$LOG_FILE" > "$tmp"
            mv "$tmp" "$LOG_FILE"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# HEARTBEAT.md PARSING
# ═══════════════════════════════════════════════════════════════

is_check_enabled() {
    local check_name="$1"

    if [ ! -f "$HEARTBEAT_MD" ]; then
        # Default: all enabled
        return 0
    fi

    # Look for the check section and its Enabled field
    local in_section=false
    while IFS= read -r line; do
        if echo "$line" | grep -q "^### $check_name"; then
            in_section=true
            continue
        fi
        if [ "$in_section" = true ]; then
            if echo "$line" | grep -q "^### "; then
                break  # Next section
            fi
            if echo "$line" | grep -qi "^\*\*Enabled:\*\* *no"; then
                return 1  # Disabled
            fi
            if echo "$line" | grep -qi "^\*\*Enabled:\*\* *yes"; then
                return 0  # Enabled
            fi
        fi
    done < "$HEARTBEAT_MD"

    return 0  # Default enabled
}

get_check_severity() {
    local check_name="$1"
    local default="${2:-warning}"

    if [ ! -f "$HEARTBEAT_MD" ]; then
        echo "$default"
        return
    fi

    local in_section=false
    while IFS= read -r line; do
        if echo "$line" | grep -q "^### $check_name"; then
            in_section=true
            continue
        fi
        if [ "$in_section" = true ]; then
            if echo "$line" | grep -q "^### "; then
                break
            fi
            if echo "$line" | grep -qi "^\*\*Severity:\*\*"; then
                local sev
                sev=$(echo "$line" | sed 's/.*\*\*Severity:\*\* *//i' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
                if [ -n "$sev" ]; then
                    echo "$sev"
                    return
                fi
            fi
        fi
    done < "$HEARTBEAT_MD"

    echo "$default"
}

# ═══════════════════════════════════════════════════════════════
# HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════

check_tests() {
    local result="pass"
    local message=""

    if [ -f "$PROJECT_DIR/tests/run-tests.sh" ]; then
        if bash "$PROJECT_DIR/tests/run-tests.sh" --quiet >/dev/null 2>&1; then
            message="All tests passing"
        else
            result="fail"
            message="Test suite failing"
        fi
    elif [ -f "$PROJECT_DIR/package.json" ] && grep -q '"test"' "$PROJECT_DIR/package.json" 2>/dev/null; then
        if (cd "$PROJECT_DIR" && npm test --silent) >/dev/null 2>&1; then
            message="All tests passing (npm)"
        else
            result="fail"
            message="Tests failing (npm test)"
        fi
    elif [ -f "$PROJECT_DIR/pytest.ini" ] || [ -f "$PROJECT_DIR/setup.cfg" ] || [ -d "$PROJECT_DIR/tests" ]; then
        if (cd "$PROJECT_DIR" && python -m pytest --quiet --no-header) >/dev/null 2>&1; then
            message="All tests passing (pytest)"
        else
            result="fail"
            message="Tests failing (pytest)"
        fi
    else
        result="skip"
        message="No test suite found"
    fi

    echo "$result|$message"
}

check_git() {
    local result="pass"
    local issues=()

    # Must be in a git repo
    if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "skip|Not a git repository"
        return
    fi

    # Check uncommitted changes age
    local status_output
    status_output=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null || true)
    if [ -n "$status_output" ]; then
        # Check oldest modified tracked file
        local oldest_file
        oldest_file=$(echo "$status_output" | head -1 | awk '{print $NF}')
        if [ -n "$oldest_file" ] && [ -f "$PROJECT_DIR/$oldest_file" ]; then
            local file_mtime
            file_mtime=$(stat -c %Y "$PROJECT_DIR/$oldest_file" 2>/dev/null || stat -f %m "$PROJECT_DIR/$oldest_file" 2>/dev/null || echo 0)
            local now
            now=$(date +%s)
            local age_hours=$(( (now - file_mtime) / 3600 ))
            if [ "$age_hours" -gt 48 ]; then
                issues+=("Uncommitted changes older than ${age_hours}h")
                result="warn"
            fi
        fi
    fi

    # Check for exposed secrets patterns in tracked files
    local secrets_found
    secrets_found=$(git -C "$PROJECT_DIR" grep -lE \
        '(api[_-]?key|secret[_-]?key|password|token)[[:space:]]*[:=][[:space:]]*["\x27][A-Za-z0-9]' \
        2>/dev/null | grep -v -E '(\.gitignore|\.env\.example|example|test|mock|README)' | head -3 || true)
    if [ -n "$secrets_found" ]; then
        local count
        count=$(echo "$secrets_found" | wc -l | tr -d ' ')
        issues+=("Potential exposed secrets in $count file(s)")
        result="fail"
    fi

    # Check branch divergence from main
    local current_branch
    current_branch=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    if [ -n "$current_branch" ] && [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        local behind
        behind=$(git -C "$PROJECT_DIR" rev-list --count "HEAD..origin/main" 2>/dev/null || \
                 git -C "$PROJECT_DIR" rev-list --count "HEAD..origin/master" 2>/dev/null || echo 0)
        if [ "$behind" -gt 10 ]; then
            issues+=("Branch $behind commits behind main")
            result="warn"
        fi
    fi

    if [ ${#issues[@]} -eq 0 ]; then
        echo "pass|Git health good"
    else
        local message
        message=$(IFS="; "; echo "${issues[*]}")
        echo "$result|$message"
    fi
}

check_sessions() {
    local result="pass"
    local stalled_count=0

    if [ ! -d "$PROJECT_DIR/logs/sessions" ]; then
        echo "skip|No session logs found"
        return
    fi

    local now
    now=$(date +%s)
    local threshold=$((now - 14400))  # 4 hours

    for session_dir in "$PROJECT_DIR"/logs/sessions/*/; do
        [ ! -d "$session_dir" ] && continue
        for session_file in "$session_dir"session-*.jsonl; do
            [ ! -f "$session_file" ] && continue

            # Check if session has an "end" event
            if grep -q '"type":"end"' "$session_file" 2>/dev/null; then
                continue  # Session completed normally
            fi

            # Check last event timestamp
            local last_ts
            last_ts=$(tail -1 "$session_file" | jq -r '.timestamp // empty' 2>/dev/null)
            if [ -n "$last_ts" ]; then
                local last_epoch
                last_epoch=$(date -d "$last_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_ts" +%s 2>/dev/null || echo 0)
                if [ "$last_epoch" -gt 0 ] && [ "$last_epoch" -lt "$threshold" ]; then
                    stalled_count=$((stalled_count + 1))
                fi
            fi
        done
    done

    if [ "$stalled_count" -eq 0 ]; then
        echo "pass|No stalled sessions"
    else
        echo "warn|$stalled_count stalled session(s) (>4h without update)"
    fi
}

check_rejections() {
    local rejections_file="$PROJECT_DIR/.claude/rejections.jsonl"

    if [ ! -f "$rejections_file" ] || [ ! -s "$rejections_file" ]; then
        echo "skip|No rejection data"
        return
    fi

    local total
    total=$(wc -l < "$rejections_file")
    local last_n=10
    [ "$total" -lt "$last_n" ] && last_n=$total

    if [ "$last_n" -eq 0 ]; then
        echo "skip|No rejection entries"
        return
    fi

    # Count rejections in last N entries (all entries are rejections, so rate is entries/time)
    # Instead: check if there are too many recent rejections clustered together
    local recent_count
    recent_count=$(tail -"$last_n" "$rejections_file" | wc -l)

    # Check if rejection rate is concerning (more than 3 in last 10 entries)
    if [ "$recent_count" -gt 3 ]; then
        local rate=$((recent_count * 100 / last_n))
        if [ "$rate" -gt 30 ]; then
            echo "warn|High rejection rate: $recent_count in last $last_n entries"
            return
        fi
    fi

    echo "pass|Rejection rate acceptable ($recent_count in last $last_n)"
}

check_disk() {
    local result="pass"
    local issues=()

    # Check logs/ directory size
    if [ -d "$PROJECT_DIR/logs" ]; then
        local logs_size
        logs_size=$(du -sm "$PROJECT_DIR/logs" 2>/dev/null | cut -f1 || echo 0)
        if [ "$logs_size" -gt 100 ]; then
            issues+=("logs/ directory: ${logs_size}MB (>100MB)")
            result="warn"
        fi
    fi

    # Check .claude/ temp file count
    if [ -d "$PROJECT_DIR/.claude" ]; then
        local temp_count
        temp_count=$(find "$PROJECT_DIR/.claude" -maxdepth 1 \( -name "*.tmp" -o -name "*.temp" -o -name ".*.XXXXXX" -o -name ".rules-update.*" \) 2>/dev/null | wc -l || echo 0)
        if [ "$temp_count" -gt 20 ]; then
            issues+=("$temp_count temp files in .claude/")
            result="warn"
        fi
    fi

    if [ ${#issues[@]} -eq 0 ]; then
        echo "pass|Disk health good"
    else
        local message
        message=$(IFS="; "; echo "${issues[*]}")
        echo "$result|$message"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN CYCLE
# ═══════════════════════════════════════════════════════════════

run_cycle() {
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    log_msg "INFO" "Starting heartbeat cycle"

    local checks=("Test Health" "Git Health" "Session Health" "Gate Rejection Rate" "Disk/Log Health")
    local check_funcs=("check_tests" "check_git" "check_sessions" "check_rejections" "check_disk")
    local results_json=()
    local alerts=()

    for i in "${!checks[@]}"; do
        local name="${checks[$i]}"
        local func="${check_funcs[$i]}"

        # Check if enabled in HEARTBEAT.md
        if ! is_check_enabled "$name"; then
            log_msg "SKIP" "$name (disabled in HEARTBEAT.md)"
            results_json+=("{\"check\":\"$name\",\"status\":\"skip\",\"message\":\"Disabled\"}")
            continue
        fi

        # Run check
        local output
        output=$($func 2>/dev/null || echo "error|Check failed to execute")

        local status message
        status=$(echo "$output" | cut -d'|' -f1)
        message=$(echo "$output" | cut -d'|' -f2-)

        results_json+=("{\"check\":\"$name\",\"status\":\"$status\",\"message\":$(echo "$message" | jq -Rs .)}")
        log_msg "$(echo "$status" | tr '[:lower:]' '[:upper:]')" "$name: $message"

        # Trigger notification for failures/warnings
        local severity
        severity=$(get_check_severity "$name" "warning")
        if [ "$status" = "fail" ]; then
            alerts+=("$severity|HEARTBEAT ALERT ($name): $message")
        elif [ "$status" = "warn" ]; then
            alerts+=("$severity|HEARTBEAT WARNING ($name): $message")
        fi
    done

    # Update state file
    mkdir -p "$(dirname "$STATE_FILE")"
    local results_array
    results_array=$(printf '%s\n' "${results_json[@]}" | jq -s '.' 2>/dev/null || echo '[]')

    jq -nc \
        --arg ts "$timestamp" \
        --argjson results "$results_array" \
        --argjson alerts "${#alerts[@]}" \
        '{last_run:$ts,results:$results,alerts_triggered:$alerts}' \
        > "$STATE_FILE"

    # Send notifications for alerts
    if [ ${#alerts[@]} -gt 0 ]; then
        # Source notify.sh for the notify() function
        if [ -f "$SCRIPT_DIR/notify.sh" ]; then
            source "$SCRIPT_DIR/notify.sh"
            for alert in "${alerts[@]}"; do
                local level
                level=$(echo "$alert" | cut -d'|' -f1)
                local msg
                msg=$(echo "$alert" | cut -d'|' -f2-)
                notify "$level" "$msg"
            done
        else
            log_msg "WARN" "notify.sh not found, cannot send alerts"
        fi
    fi

    local pass_count=0
    local fail_count=0
    local warn_count=0
    for r in "${results_json[@]}"; do
        local s
        s=$(echo "$r" | jq -r '.status' 2>/dev/null || echo "")
        case "$s" in
            pass) pass_count=$((pass_count + 1)) ;;
            fail) fail_count=$((fail_count + 1)) ;;
            warn) warn_count=$((warn_count + 1)) ;;
        esac
    done

    log_msg "INFO" "Cycle complete: $pass_count pass, $warn_count warn, $fail_count fail, ${#alerts[@]} alerts"
}

# ═══════════════════════════════════════════════════════════════
# DAEMON MANAGEMENT
# ═══════════════════════════════════════════════════════════════

is_running() {
    if [ ! -f "$PID_FILE" ]; then
        return 1
    fi

    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -z "$pid" ]; then
        return 1
    fi

    if ps -p "$pid" >/dev/null 2>&1; then
        return 0
    fi

    # Stale PID file
    rm -f "$PID_FILE"
    return 1
}

cmd_start() {
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        echo -e "${YELLOW}Heartbeat daemon already running (PID $pid)${NC}"
        return 0
    fi

    mkdir -p "$(dirname "$PID_FILE")"

    # Start daemon in background
    (
        echo $$ > "$PID_FILE"
        trap 'rm -f "$PID_FILE"; exit 0' INT TERM

        log_msg "INFO" "Daemon started (PID $$, interval ${INTERVAL}s)"

        while true; do
            run_cycle 2>/dev/null || log_msg "ERROR" "Cycle failed"
            sleep "$INTERVAL"
        done
    ) &

    local daemon_pid=$!
    # Give the subshell a moment to write its PID
    sleep 1

    echo -e "${GREEN}Heartbeat daemon started${NC} (PID $daemon_pid)"
    echo "  Interval: ${INTERVAL}s ($(( INTERVAL / 60 )) minutes)"
    echo "  Logs:     $LOG_FILE"
    echo "  State:    $STATE_FILE"
    echo ""
    echo "  Stop:     ./scripts/heartbeat.sh stop"
    echo "  Status:   ./scripts/heartbeat.sh status"
}

cmd_stop() {
    if ! is_running; then
        echo -e "${YELLOW}Heartbeat daemon not running.${NC}"
        return 0
    fi

    local pid
    pid=$(cat "$PID_FILE")
    kill "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    log_msg "INFO" "Daemon stopped"
    echo -e "${GREEN}Heartbeat daemon stopped${NC} (was PID $pid)"
}

cmd_status() {
    echo -e "${BOLD}Heartbeat Status${NC}"
    echo ""

    # Daemon status
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        echo -e "  Daemon:    ${GREEN}Running${NC} (PID $pid)"
        echo -e "  Interval:  ${INTERVAL}s ($(( INTERVAL / 60 )) min)"
    else
        echo -e "  Daemon:    ${YELLOW}Stopped${NC}"
    fi

    # Last check results
    if [ -f "$STATE_FILE" ]; then
        local last_run
        last_run=$(jq -r '.last_run' "$STATE_FILE" 2>/dev/null)
        local alerts_count
        alerts_count=$(jq -r '.alerts_triggered' "$STATE_FILE" 2>/dev/null)

        echo -e "  Last run:  ${CYAN}$last_run${NC}"
        echo -e "  Alerts:    $alerts_count"
        echo ""
        echo -e "  ${BOLD}Check Results:${NC}"

        jq -r '.results[] | "    \(.status | ascii_upcase)\t\(.check): \(.message)"' "$STATE_FILE" 2>/dev/null | \
        while IFS= read -r line; do
            if echo "$line" | grep -q "^    PASS"; then
                echo -e "  ${GREEN}$line${NC}"
            elif echo "$line" | grep -q "^    FAIL"; then
                echo -e "  ${RED}$line${NC}"
            elif echo "$line" | grep -q "^    WARN"; then
                echo -e "  ${YELLOW}$line${NC}"
            else
                echo -e "  ${CYAN}$line${NC}"
            fi
        done
    else
        echo -e "  Last run:  ${YELLOW}Never${NC}"
    fi
}

cmd_run_once() {
    echo -e "${BOLD}Running heartbeat check...${NC}"
    echo ""
    run_cycle
    echo ""
    echo -e "${GREEN}Check complete.${NC} Results saved to $STATE_FILE"

    # Show results inline
    if [ -f "$STATE_FILE" ]; then
        echo ""
        jq -r '.results[] | "  [\(.status | ascii_upcase)] \(.check): \(.message)"' "$STATE_FILE" 2>/dev/null
    fi
}

cmd_logs() {
    local tail_lines="${1:-50}"

    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}No heartbeat logs yet.${NC}"
        echo "Start the daemon or run: ./scripts/heartbeat.sh run-once"
        return 0
    fi

    echo -e "${BOLD}Heartbeat Log${NC} (last $tail_lines lines)"
    echo ""
    tail -"$tail_lines" "$LOG_FILE"
}

cmd_init() {
    if [ -f "$HEARTBEAT_MD" ]; then
        echo -e "${YELLOW}HEARTBEAT.md already exists.${NC}"
        echo "Delete it first to reinitialize."
        return 0
    fi

    generate_template > "$HEARTBEAT_MD"
    echo -e "${GREEN}Created HEARTBEAT.md${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Edit HEARTBEAT.md to enable/disable checks"
    echo "  2. Initialize notifications: ./scripts/notify.sh init"
    echo "  3. Start daemon: ./scripts/heartbeat.sh start"
    echo "  4. Or run once: ./scripts/heartbeat.sh run-once"
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING & DISPATCH
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

# Parse options
TAIL_LINES=50
while [[ $# -gt 0 ]]; do
    case $1 in
        --interval=*) INTERVAL="${1#*=}"; shift ;;
        --tail=*)     TAIL_LINES="${1#*=}"; shift ;;
        --help)       show_help; exit 0 ;;
        *)            shift ;;
    esac
done

case "$COMMAND" in
    start)    cmd_start ;;
    stop)     cmd_stop ;;
    status)   cmd_status ;;
    run-once) cmd_run_once ;;
    logs)     cmd_logs "$TAIL_LINES" ;;
    init)     cmd_init ;;
    --help|help) show_help ;;
    "")       show_help ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo "Run ./scripts/heartbeat.sh --help for usage."
        exit 1
        ;;
esac

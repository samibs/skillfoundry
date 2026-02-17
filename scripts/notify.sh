#!/bin/bash

# Multi-Channel Notification Dispatcher
# Sends notifications via Slack, Discord, desktop, and terminal.
# Supports throttling, quiet hours, and notification history.
# Can be sourced by other scripts for the notify() function.
#
# USAGE:
#   ./scripts/notify.sh send <level> <message>
#   ./scripts/notify.sh test
#   ./scripts/notify.sh config
#   ./scripts/notify.sh history [--limit=N]
#   ./scripts/notify.sh init
#   ./scripts/notify.sh --help

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
CONFIG_FILE="$PROJECT_DIR/.claude/notifications.json"
HISTORY_FILE="$PROJECT_DIR/.claude/notifications.jsonl"
MAX_MESSAGE_LEN=500

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Multi-Channel Notification Dispatcher"
    echo ""
    echo "Sends notifications via Slack, Discord, desktop, and terminal."
    echo "Supports throttling, quiet hours, and notification history."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/notify.sh <command> [args]"
    echo ""
    echo "COMMANDS:"
    echo "  send <level> <message>   Send a notification"
    echo "  test                     Send test notification to all enabled channels"
    echo "  config                   Show current notification config"
    echo "  history [--limit=N]      Show notification history (default: last 20)"
    echo "  init                     Create default notification config"
    echo ""
    echo "NOTIFICATION LEVELS:"
    echo "  info       Informational (blue)"
    echo "  success    Operation succeeded (green)"
    echo "  warning    Needs attention (yellow)"
    echo "  error      Something failed (red)"
    echo "  critical   Immediate action required (bold red)"
    echo ""
    echo "CHANNELS:"
    echo "  slack      Slack webhook (requires webhook_url in config)"
    echo "  discord    Discord webhook (requires webhook_url in config)"
    echo "  desktop    Desktop notification (notify-send / osascript)"
    echo "  terminal   Colored output to stderr + terminal bell"
    echo ""
    echo "CONFIGURATION:"
    echo "  Config file: .claude/notifications.json"
    echo "  History log: .claude/notifications.jsonl"
    echo ""
    echo "  Environment variable overrides:"
    echo "    CLAUDE_AS_SLACK_WEBHOOK     Slack webhook URL"
    echo "    CLAUDE_AS_DISCORD_WEBHOOK   Discord webhook URL"
    echo "    CLAUDE_AS_NOTIFY_DISABLE    Set to 1 to disable all notifications"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/notify.sh init"
    echo "  ./scripts/notify.sh send success 'Forge complete: 12 stories implemented'"
    echo "  ./scripts/notify.sh send error 'Tests failing: auth module'"
    echo "  ./scripts/notify.sh test"
    echo "  ./scripts/notify.sh history --limit=5"
    echo ""
    echo "SOURCING (for use in other scripts):"
    echo "  source ./scripts/notify.sh"
    echo "  notify warning 'Something needs attention'"
}

# ═══════════════════════════════════════════════════════════════
# CONFIG MANAGEMENT
# ═══════════════════════════════════════════════════════════════

default_config() {
    cat <<'EOF'
{
  "enabled": true,
  "channels": {
    "slack": {
      "enabled": false,
      "webhook_url": ""
    },
    "discord": {
      "enabled": false,
      "webhook_url": ""
    },
    "desktop": {
      "enabled": true
    },
    "terminal": {
      "enabled": true
    }
  },
  "quiet_hours": {
    "enabled": false,
    "start": "22:00",
    "end": "08:00"
  },
  "throttle_minutes": 5
}
EOF
}

ensure_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        mkdir -p "$(dirname "$CONFIG_FILE")"
        default_config > "$CONFIG_FILE"
    fi
}

get_config_value() {
    local path="$1"
    local default="$2"
    if [ -f "$CONFIG_FILE" ]; then
        local val
        val=$(jq -r "$path" "$CONFIG_FILE" 2>/dev/null)
        if [ "$val" != "null" ] && [ -n "$val" ]; then
            echo "$val"
            return
        fi
    fi
    echo "$default"
}

# ═══════════════════════════════════════════════════════════════
# CHANNEL: SLACK
# ═══════════════════════════════════════════════════════════════

send_slack() {
    local webhook="$1"
    local message="$2"
    local level="$3"

    local color="#808080"
    case "$level" in
        success)  color="#36a64f" ;;
        warning)  color="#ff9900" ;;
        error)    color="#ff0000" ;;
        critical) color="#8b0000" ;;
    esac

    local payload
    payload=$(jq -nc \
        --arg text "$message" \
        --arg color "$color" \
        --arg footer "Claude AS Framework" \
        --argjson ts "$(date +%s)" \
        '{attachments:[{color:$color,text:$text,footer:$footer,ts:$ts}]}')

    if curl -s -o /dev/null -w "%{http_code}" -X POST "$webhook" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null | grep -q "^2"; then
        return 0
    else
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# CHANNEL: DISCORD
# ═══════════════════════════════════════════════════════════════

send_discord() {
    local webhook="$1"
    local message="$2"
    local level="$3"

    local color=8421504
    case "$level" in
        success)  color=3581519 ;;
        warning)  color=16761095 ;;
        error)    color=16711680 ;;
        critical) color=9109504 ;;
    esac

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local payload
    payload=$(jq -nc \
        --arg desc "$message" \
        --argjson color "$color" \
        --arg level "$level" \
        --arg ts "$timestamp" \
        '{embeds:[{title:"Claude AS Notification",description:$desc,color:$color,footer:{text:("Level: "+$level)},timestamp:$ts}]}')

    if curl -s -o /dev/null -w "%{http_code}" -X POST "$webhook" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null | grep -q "^2"; then
        return 0
    else
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# CHANNEL: DESKTOP
# ═══════════════════════════════════════════════════════════════

send_desktop() {
    local message="$1"
    local level="$2"

    if command -v notify-send &>/dev/null; then
        local urgency="normal"
        case "$level" in
            critical|error) urgency="critical" ;;
            info|success)   urgency="low" ;;
        esac
        notify-send -u "$urgency" "Claude AS" "$message" 2>/dev/null
        return $?
    elif [[ "$OSTYPE" == "darwin"* ]] && command -v osascript &>/dev/null; then
        osascript -e "display notification \"$message\" with title \"Claude AS\" subtitle \"$level\"" 2>/dev/null
        return $?
    else
        echo -e "\a" 2>/dev/null
        return 0
    fi
}

# ═══════════════════════════════════════════════════════════════
# CHANNEL: TERMINAL
# ═══════════════════════════════════════════════════════════════

send_terminal() {
    local message="$1"
    local level="$2"

    local color="$BLUE"
    case "$level" in
        success)  color="$GREEN" ;;
        warning)  color="$YELLOW" ;;
        error)    color="$RED" ;;
        critical) color="${RED}${BOLD}" ;;
    esac

    echo -e "${color}[NOTIFY:${level^^}]${NC} $message" >&2
    echo -e "\a" 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════
# THROTTLING & QUIET HOURS
# ═══════════════════════════════════════════════════════════════

is_throttled() {
    local message="$1"
    local throttle_minutes="$2"

    [ "$throttle_minutes" -le 0 ] 2>/dev/null && return 1
    [ ! -f "$HISTORY_FILE" ] && return 1

    local msg_hash
    msg_hash=$(echo -n "$message" | sha256sum | cut -d' ' -f1)
    local now
    now=$(date +%s)
    local threshold=$((now - throttle_minutes * 60))

    # Check last occurrence of this message hash in history
    local last_ts
    last_ts=$(grep "$msg_hash" "$HISTORY_FILE" 2>/dev/null | tail -1 | jq -r '.timestamp // empty' 2>/dev/null)

    if [ -n "$last_ts" ]; then
        local last_epoch
        last_epoch=$(date -d "$last_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_ts" +%s 2>/dev/null || echo 0)
        if [ "$last_epoch" -gt "$threshold" ]; then
            return 0  # IS throttled
        fi
    fi

    return 1  # NOT throttled
}

is_quiet_hours() {
    local quiet_enabled
    quiet_enabled=$(get_config_value '.quiet_hours.enabled' 'false')
    [ "$quiet_enabled" != "true" ] && return 1

    local start_hour end_hour current_hour
    start_hour=$(get_config_value '.quiet_hours.start' '22:00' | cut -d: -f1 | sed 's/^0//')
    end_hour=$(get_config_value '.quiet_hours.end' '08:00' | cut -d: -f1 | sed 's/^0//')
    current_hour=$(date +%H | sed 's/^0//')

    # Handle overnight range (e.g., 22:00 to 08:00)
    if [ "$start_hour" -gt "$end_hour" ]; then
        if [ "$current_hour" -ge "$start_hour" ] || [ "$current_hour" -lt "$end_hour" ]; then
            return 0  # IN quiet hours
        fi
    else
        if [ "$current_hour" -ge "$start_hour" ] && [ "$current_hour" -lt "$end_hour" ]; then
            return 0  # IN quiet hours
        fi
    fi

    return 1  # NOT in quiet hours
}

# ═══════════════════════════════════════════════════════════════
# NOTIFICATION HISTORY
# ═══════════════════════════════════════════════════════════════

log_notification() {
    local level="$1"
    local message="$2"
    shift 2
    local channels=("$@")

    mkdir -p "$(dirname "$HISTORY_FILE")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local msg_hash
    msg_hash=$(echo -n "$message" | sha256sum | cut -d' ' -f1)

    local channels_json="[]"
    if [ ${#channels[@]} -gt 0 ]; then
        channels_json=$(printf '%s\n' "${channels[@]}" | jq -R . | jq -s '.')
    fi

    jq -nc \
        --arg ts "$timestamp" \
        --arg level "$level" \
        --arg msg "$message" \
        --arg hash "$msg_hash" \
        --argjson channels "$channels_json" \
        '{timestamp:$ts,level:$level,message:$msg,message_hash:$hash,channels:$channels,delivered:true}' \
        >> "$HISTORY_FILE"
}

# ═══════════════════════════════════════════════════════════════
# CORE NOTIFY FUNCTION (sourceable)
# ═══════════════════════════════════════════════════════════════

notify() {
    local level="${1:-info}"
    local message="${2:-}"

    [ -z "$message" ] && return 1

    # Truncate long messages
    if [ ${#message} -gt $MAX_MESSAGE_LEN ]; then
        message="${message:0:$MAX_MESSAGE_LEN}..."
    fi

    # Env var override: disable all notifications
    [ "${CLAUDE_AS_NOTIFY_DISABLE:-0}" = "1" ] && return 0

    ensure_config

    # Check if notifications enabled globally
    local enabled
    enabled=$(get_config_value '.enabled' 'true')
    [ "$enabled" != "true" ] && return 0

    # Check quiet hours (allow critical through)
    if [ "$level" != "critical" ] && is_quiet_hours; then
        return 0
    fi

    # Check throttling
    local throttle
    throttle=$(get_config_value '.throttle_minutes' '5')
    if is_throttled "$message" "$throttle"; then
        return 0
    fi

    # Dispatch to enabled channels
    local sent_channels=()

    # Slack
    local slack_enabled
    slack_enabled=$(get_config_value '.channels.slack.enabled' 'false')
    if [ "$slack_enabled" = "true" ]; then
        local webhook="${CLAUDE_AS_SLACK_WEBHOOK:-}"
        [ -z "$webhook" ] && webhook=$(get_config_value '.channels.slack.webhook_url' '')
        if [ -n "$webhook" ] && [ "$webhook" != "null" ]; then
            if send_slack "$webhook" "$message" "$level"; then
                sent_channels+=("slack")
            fi
        fi
    fi

    # Discord
    local discord_enabled
    discord_enabled=$(get_config_value '.channels.discord.enabled' 'false')
    if [ "$discord_enabled" = "true" ]; then
        local webhook="${CLAUDE_AS_DISCORD_WEBHOOK:-}"
        [ -z "$webhook" ] && webhook=$(get_config_value '.channels.discord.webhook_url' '')
        if [ -n "$webhook" ] && [ "$webhook" != "null" ]; then
            if send_discord "$webhook" "$message" "$level"; then
                sent_channels+=("discord")
            fi
        fi
    fi

    # Desktop
    local desktop_enabled
    desktop_enabled=$(get_config_value '.channels.desktop.enabled' 'true')
    if [ "$desktop_enabled" = "true" ]; then
        if send_desktop "$message" "$level"; then
            sent_channels+=("desktop")
        fi
    fi

    # Terminal
    local terminal_enabled
    terminal_enabled=$(get_config_value '.channels.terminal.enabled' 'true')
    if [ "$terminal_enabled" = "true" ]; then
        send_terminal "$message" "$level"
        sent_channels+=("terminal")
    fi

    # Log to history
    if [ ${#sent_channels[@]} -gt 0 ]; then
        log_notification "$level" "$message" "${sent_channels[@]}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_init() {
    if [ -f "$CONFIG_FILE" ]; then
        echo -e "${YELLOW}Config already exists:${NC} $CONFIG_FILE"
        echo "Delete it first to reinitialize."
        return 0
    fi

    mkdir -p "$(dirname "$CONFIG_FILE")"
    default_config > "$CONFIG_FILE"
    echo -e "${GREEN}Created notification config:${NC} $CONFIG_FILE"
    echo ""
    echo "Next steps:"
    echo "  1. Edit .claude/notifications.json to configure channels"
    echo "  2. For Slack: set channels.slack.enabled=true and add webhook_url"
    echo "  3. For Discord: set channels.discord.enabled=true and add webhook_url"
    echo "  4. Run: ./scripts/notify.sh test"
}

cmd_send() {
    local level="${1:-info}"
    local message="${2:-}"

    if [ -z "$message" ]; then
        echo -e "${RED}Error: message is required${NC}"
        echo "Usage: ./scripts/notify.sh send <level> <message>"
        exit 1
    fi

    # Validate level
    case "$level" in
        info|success|warning|error|critical) ;;
        *)
            echo -e "${RED}Error: invalid level '$level'${NC}"
            echo "Valid levels: info, success, warning, error, critical"
            exit 1
            ;;
    esac

    notify "$level" "$message"
}

cmd_test() {
    ensure_config
    echo -e "${BOLD}Testing notification channels...${NC}"
    echo ""

    local test_msg="Test notification from Claude AS Framework ($(date +%H:%M:%S))"

    # Slack
    local slack_enabled
    slack_enabled=$(get_config_value '.channels.slack.enabled' 'false')
    if [ "$slack_enabled" = "true" ]; then
        local webhook="${CLAUDE_AS_SLACK_WEBHOOK:-}"
        [ -z "$webhook" ] && webhook=$(get_config_value '.channels.slack.webhook_url' '')
        if [ -n "$webhook" ] && [ "$webhook" != "null" ]; then
            if send_slack "$webhook" "$test_msg" "info"; then
                echo -e "  ${GREEN}Slack:${NC}   Sent"
            else
                echo -e "  ${RED}Slack:${NC}   Failed"
            fi
        else
            echo -e "  ${YELLOW}Slack:${NC}   No webhook URL configured"
        fi
    else
        echo -e "  ${CYAN}Slack:${NC}   Disabled"
    fi

    # Discord
    local discord_enabled
    discord_enabled=$(get_config_value '.channels.discord.enabled' 'false')
    if [ "$discord_enabled" = "true" ]; then
        local webhook="${CLAUDE_AS_DISCORD_WEBHOOK:-}"
        [ -z "$webhook" ] && webhook=$(get_config_value '.channels.discord.webhook_url' '')
        if [ -n "$webhook" ] && [ "$webhook" != "null" ]; then
            if send_discord "$webhook" "$test_msg" "info"; then
                echo -e "  ${GREEN}Discord:${NC} Sent"
            else
                echo -e "  ${RED}Discord:${NC} Failed"
            fi
        else
            echo -e "  ${YELLOW}Discord:${NC} No webhook URL configured"
        fi
    else
        echo -e "  ${CYAN}Discord:${NC} Disabled"
    fi

    # Desktop
    local desktop_enabled
    desktop_enabled=$(get_config_value '.channels.desktop.enabled' 'true')
    if [ "$desktop_enabled" = "true" ]; then
        if send_desktop "$test_msg" "info"; then
            echo -e "  ${GREEN}Desktop:${NC} Sent"
        else
            echo -e "  ${YELLOW}Desktop:${NC} Not available (no notify-send/osascript)"
        fi
    else
        echo -e "  ${CYAN}Desktop:${NC} Disabled"
    fi

    # Terminal
    local terminal_enabled
    terminal_enabled=$(get_config_value '.channels.terminal.enabled' 'true')
    if [ "$terminal_enabled" = "true" ]; then
        send_terminal "$test_msg" "info"
        echo -e "  ${GREEN}Terminal:${NC} Sent (see stderr above)"
    else
        echo -e "  ${CYAN}Terminal:${NC} Disabled"
    fi

    echo ""
    echo -e "${GREEN}Test complete.${NC}"
}

cmd_config() {
    ensure_config
    echo -e "${BOLD}Notification Configuration${NC}"
    echo -e "${CYAN}File:${NC} $CONFIG_FILE"
    echo ""
    jq '.' "$CONFIG_FILE"
}

cmd_history() {
    local limit="${1:-20}"

    if [ ! -f "$HISTORY_FILE" ]; then
        echo -e "${YELLOW}No notification history yet.${NC}"
        return 0
    fi

    echo -e "${BOLD}Notification History${NC} (last $limit)"
    echo ""

    local count=0
    while IFS= read -r line; do
        local ts level msg channels
        ts=$(echo "$line" | jq -r '.timestamp' 2>/dev/null)
        level=$(echo "$line" | jq -r '.level' 2>/dev/null)
        msg=$(echo "$line" | jq -r '.message' 2>/dev/null)
        channels=$(echo "$line" | jq -r '.channels | join(", ")' 2>/dev/null)

        local color="$BLUE"
        case "$level" in
            success)  color="$GREEN" ;;
            warning)  color="$YELLOW" ;;
            error)    color="$RED" ;;
            critical) color="${RED}${BOLD}" ;;
        esac

        echo -e "  ${CYAN}$ts${NC} ${color}[$level]${NC} $msg ${CYAN}($channels)${NC}"
        count=$((count + 1))
    done < <(tail -"$limit" "$HISTORY_FILE")

    echo ""
    echo -e "Total entries: $(wc -l < "$HISTORY_FILE")"
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING & DISPATCH
# ═══════════════════════════════════════════════════════════════

# Only run dispatch if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    COMMAND="${1:-}"
    shift 2>/dev/null || true

    # Parse options
    LIMIT=20
    while [[ $# -gt 0 ]]; do
        case $1 in
            --limit=*) LIMIT="${1#*=}"; shift ;;
            --help)    show_help; exit 0 ;;
            *)         break ;;
        esac
    done

    case "$COMMAND" in
        send)     cmd_send "$@" ;;
        test)     cmd_test ;;
        config)   cmd_config ;;
        history)  cmd_history "$LIMIT" ;;
        init)     cmd_init ;;
        --help|help) show_help ;;
        "")       show_help ;;
        *)
            echo -e "${RED}Unknown command: $COMMAND${NC}"
            echo "Run ./scripts/notify.sh --help for usage."
            exit 1
            ;;
    esac
fi

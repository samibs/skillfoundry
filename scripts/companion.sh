#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Claude AS Companion Panel
# Context-aware command reference that runs in a tmux side pane
#
# Usage:
#   ./scripts/companion.sh              Run in current terminal (loop)
#   ./scripts/companion.sh --tmux       Open as tmux right pane
#   ./scripts/companion.sh --once       Render once and exit
#   ./scripts/companion.sh --help       Show help
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${CLAUDE_AS_PROJECT_DIR:-$(pwd)}"
REFRESH_INTERVAL="${COMPANION_REFRESH:-5}"

# ─── Colors ───────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
BG_BLUE='\033[44m'
BG_BLACK='\033[40m'

# ─── Helpers ──────────────────────────────────────────────────

get_terminal_width() {
    local w
    w=$(tput cols 2>/dev/null || echo 35)
    echo "$w"
}

get_terminal_height() {
    local h
    h=$(tput lines 2>/dev/null || echo 24)
    echo "$h"
}

# Print a line padded/truncated to panel width
pline() {
    local text="$1"
    local color="${2:-$RESET}"
    local w
    w=$(get_terminal_width)
    # Strip ANSI for length calculation
    local plain
    plain=$(echo -e "$text" | sed 's/\x1b\[[0-9;]*m//g')
    local len=${#plain}
    local pad=$((w - len))
    if [ "$pad" -lt 0 ]; then
        # Truncate
        echo -e "${color}${text:0:$((w))}${RESET}"
    else
        printf "${color}%s%*s${RESET}\n" "$text" "$pad" ""
    fi
}

# Horizontal rule
hr() {
    local w
    w=$(get_terminal_width)
    local char="${1:-─}"
    local color="${2:-$DIM}"
    printf "${color}"
    printf '%*s' "$w" '' | tr ' ' "$char"
    printf "${RESET}\n"
}

# Header bar
header() {
    local text="$1"
    local w
    w=$(get_terminal_width)
    local plain
    plain=$(echo -e "$text" | sed 's/\x1b\[[0-9;]*m//g')
    local len=${#plain}
    local pad=$((w - len))
    if [ "$pad" -lt 0 ]; then pad=0; fi
    printf "${BG_BLUE}${WHITE}%s%*s${RESET}\n" "$text" "$pad" ""
}

# Section title
section() {
    local text="$1"
    echo -e "${BOLD}${YELLOW}${text}${RESET}"
    hr "─" "$DIM"
}

# Command entry: name + description
cmd() {
    local name="$1"
    local desc="$2"
    local w
    w=$(get_terminal_width)
    local name_w=18
    if [ "$w" -lt 30 ]; then name_w=12; fi
    printf " ${CYAN}%-${name_w}s${RESET}${DIM}%s${RESET}\n" "$name" "$desc"
}

# ─── State Readers ────────────────────────────────────────────

read_scratchpad() {
    local sp="$PROJECT_DIR/.claude/scratchpad.md"
    if [ ! -f "$sp" ]; then
        TASK="(no active task)"
        PHASE="unknown"
        AGENT="none"
        MODIFIED_FILES=""
        LAST_UPDATED=""
        PLATFORM=""
        return
    fi

    TASK=$(grep -m1 '^\- Task:' "$sp" 2>/dev/null | sed 's/^- Task: *//' || echo "(unknown)")
    PHASE=$(grep -m1 '^\- Phase:' "$sp" 2>/dev/null | sed 's/^- Phase: *//' | tr '[:upper:]' '[:lower:]' || echo "unknown")
    AGENT=$(grep -m1 '^\- Agent:' "$sp" 2>/dev/null | sed 's/^- Agent: *//' || echo "none")
    local raw_platform
    raw_platform=$(grep -m1 '^> Platform:' "$sp" 2>/dev/null | sed 's/^> Platform: *//' || echo "")
    # Normalize platform display names
    case "$raw_platform" in
        claude-code|claude) PLATFORM="Claude Code" ;;
        copilot-cli|copilot) PLATFORM="Copilot CLI" ;;
        cursor) PLATFORM="Cursor" ;;
        codex|openai-codex) PLATFORM="OpenAI Codex" ;;
        *) PLATFORM="$raw_platform" ;;
    esac
    LAST_UPDATED=$(grep -m1 '^> Last updated:' "$sp" 2>/dev/null | sed 's/^> Last updated: *//' || echo "")
    MODIFIED_FILES=$(grep '^\- .*\..*:' "$sp" 2>/dev/null | head -5 | sed 's/^- //' || echo "")
}

read_hub_status() {
    local hub="$FRAMEWORK_DIR/.claude/hub.json"
    if [ ! -f "$hub" ]; then
        HUB_STATUS="not configured"
        HUB_LAST_SYNC=""
        return
    fi

    HUB_STATUS="configured"
    local last_pull
    last_pull=$(grep '"last_pull"' "$hub" 2>/dev/null | sed 's/.*: *"\(.*\)".*/\1/' || echo "")
    local last_push
    last_push=$(grep '"last_push"' "$hub" 2>/dev/null | sed 's/.*: *"\(.*\)".*/\1/' || echo "")

    if [ -n "$last_pull" ] && [ "$last_pull" != "never" ]; then
        HUB_LAST_SYNC="pull: ${last_pull}"
    elif [ -n "$last_push" ] && [ "$last_push" != "never" ]; then
        HUB_LAST_SYNC="push: ${last_push}"
    else
        HUB_LAST_SYNC="never synced"
    fi
}

read_version() {
    local vf="$FRAMEWORK_DIR/.version"
    if [ -f "$vf" ]; then
        VERSION=$(cat "$vf" | tr -d '[:space:]')
    else
        VERSION="?.?.?.?"
    fi
}

# ─── Phase-Aware Commands ─────────────────────────────────────

render_phase_commands() {
    local phase="$1"

    case "$phase" in
        *architect*|*design*|*planning*)
            section "PHASE: Architecture"
            cmd "/architect" "System design"
            cmd "/api-design" "API contracts"
            cmd "/data-architect" "Schema design"
            cmd "/tech-lead" "Tech decisions"
            cmd "/security" "Threat model"
            cmd "/prd" "Create PRD"
            cmd "/anvil t1" "Pre-flight check"
            ;;
        *implement*|*coding*|*development*)
            section "PHASE: Implementation"
            cmd "/coder" "TDD implement"
            cmd "/senior-engineer" "With push-back"
            cmd "/tester" "Run tests"
            cmd "/debugger" "Debug issues"
            cmd "/refactor" "Clean up code"
            cmd "/fixer" "Auto-remediation"
            cmd "/anvil" "Quality gate"
            cmd "/layer-check" "Validate layers"
            ;;
        *test*|*quality*)
            section "PHASE: Testing"
            cmd "/tester" "Run tests"
            cmd "/review" "Code review"
            cmd "/evaluator" "BPSBS check"
            cmd "/anvil" "Quality gate"
            cmd "/layer-check" "Validate layers"
            cmd "/security" "Security audit"
            cmd "/security-scanner" "Vuln scan"
            cmd "/gate-keeper" "Gate check"
            ;;
        *valid*|*gate*)
            section "PHASE: Validation"
            cmd "/layer-check" "Three layers"
            cmd "/gate-keeper" "Gate check"
            cmd "/anvil" "6-tier gate"
            cmd "/evaluator" "Standards"
            cmd "/security-scanner" "Vuln scan"
            cmd "/review" "Code review"
            ;;
        *doc*)
            section "PHASE: Documentation"
            cmd "/docs" "Generate docs"
            cmd "/release" "Release prep"
            cmd "/version" "Version info"
            cmd "/educate" "Learning material"
            ;;
        *deploy*|*release*|*ops*)
            section "PHASE: Release/Ops"
            cmd "/release" "Release prep"
            cmd "/ship" "Ship pipeline"
            cmd "/sre" "SRE ops"
            cmd "/devops" "CI/CD"
            cmd "/ops" "Generate tooling"
            cmd "/performance" "Perf check"
            ;;
        *)
            section "COMMANDS (by task)"
            cmd "/go" "Execute PRDs"
            cmd "/forge" "Full pipeline"
            cmd "/prd" "Create PRD"
            cmd "/coder" "TDD implement"
            cmd "/tester" "Run tests"
            cmd "/review" "Code review"
            cmd "/anvil" "Quality gate"
            cmd "/layer-check" "Validate layers"
            ;;
    esac
}

# ─── Render ───────────────────────────────────────────────────

render() {
    local w
    w=$(get_terminal_width)
    local h
    h=$(get_terminal_height)

    # Clear screen
    tput clear 2>/dev/null || printf '\033[2J\033[H'

    # Read state
    read_version
    read_scratchpad
    read_hub_status

    # Header
    header " Claude AS v${VERSION}"
    echo ""

    # Status block
    section "STATUS"
    local task_display="${TASK:-(no active task)}"
    if [ ${#task_display} -gt $((w - 10)) ]; then
        task_display="${task_display:0:$((w - 13))}..."
    fi
    echo -e " ${WHITE}Task${RESET}  ${task_display}"
    echo -e " ${WHITE}Phase${RESET} ${GREEN}${PHASE}${RESET}"
    if [ "$AGENT" != "none" ] && [ -n "$AGENT" ]; then
        echo -e " ${WHITE}Agent${RESET} ${CYAN}${AGENT}${RESET}"
    fi
    if [ -n "$PLATFORM" ]; then
        echo -e " ${WHITE}On${RESET}    ${PLATFORM}"
    fi

    # Hub status
    if [ "$HUB_STATUS" = "configured" ]; then
        echo -e " ${WHITE}Hub${RESET}   ${GREEN}●${RESET} ${DIM}${HUB_LAST_SYNC}${RESET}"
    else
        echo -e " ${WHITE}Hub${RESET}   ${DIM}○ not configured${RESET}"
    fi
    echo ""

    # Phase-specific commands
    render_phase_commands "$PHASE"
    echo ""

    # Always-available commands
    section "ALWAYS AVAILABLE"
    cmd "/go" "Main orchestrator"
    cmd "/forge" "Full pipeline"
    cmd "/anvil" "Quality gate"
    cmd "/context" "Token budget"
    cmd "/memory" "Knowledge base"
    cmd "/explain" "Last action"
    cmd "/undo" "Revert action"
    cmd "/cost" "Token usage"
    cmd "/health" "Diagnostics"
    cmd "/swarm" "Swarm coord"
    echo ""

    # Shortcut commands (compact display if space allows)
    if [ "$h" -gt 35 ]; then
        section "SHORTCUTS"
        cmd "/gosm" "Semi-auto mode"
        cmd "/goma" "Autonomous mode"
        cmd "/blitz" "Speed + TDD"
        cmd "/ship" "Release pipeline"
        cmd "/status" "Project dashboard"
        cmd "/profile" "Session presets"
        cmd "/replay" "Re-run last exec"
        cmd "/analytics" "Agent stats"
        cmd "/gohm" "Harvest memory"
        cmd "/nuke" "Clean slate"
        echo ""
    fi

    # Modified files (if any, and if space permits)
    if [ -n "$MODIFIED_FILES" ] && [ "$h" -gt 30 ]; then
        section "FILES MODIFIED"
        echo "$MODIFIED_FILES" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                local display="$line"
                if [ ${#display} -gt $((w - 2)) ]; then
                    display="${display:0:$((w - 5))}..."
                fi
                echo -e " ${DIM}${display}${RESET}"
            fi
        done
        echo ""
    fi

    # Footer
    hr "─" "$DIM"
    if [ -n "$LAST_UPDATED" ]; then
        local ts_short="${LAST_UPDATED:0:19}"
        echo -e "${DIM} Updated: ${ts_short}${RESET}"
    fi
    echo -e "${DIM} Refresh: ${REFRESH_INTERVAL}s | q to quit${RESET}"
}

# ─── Modes ────────────────────────────────────────────────────

run_loop() {
    # Trap Ctrl+C for clean exit
    trap 'tput cnorm 2>/dev/null; exit 0' INT TERM

    # Hide cursor
    tput civis 2>/dev/null || true

    while true; do
        render
        # Read with timeout — allows 'q' to quit
        if read -rsn1 -t "$REFRESH_INTERVAL" key 2>/dev/null; then
            case "$key" in
                q|Q) break ;;
            esac
        fi
    done

    # Restore cursor
    tput cnorm 2>/dev/null || true
}

run_tmux() {
    # Check if tmux is available
    if ! command -v tmux &>/dev/null; then
        echo "Error: tmux is not installed"
        exit 1
    fi

    local pane_width="${COMPANION_WIDTH:-35}"
    local script_path
    script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

    if [ -n "${TMUX:-}" ]; then
        # Already inside tmux — split current window
        tmux split-window -h -l "$pane_width" \
            "CLAUDE_AS_PROJECT_DIR='$PROJECT_DIR' bash '$script_path'"
    else
        # Not in tmux — create new session with split
        tmux new-session -d -s claude-as-companion -x "$(tput cols)" -y "$(tput lines)" \
            "cd '$PROJECT_DIR' && $SHELL"
        tmux split-window -h -l "$pane_width" -t claude-as-companion \
            "CLAUDE_AS_PROJECT_DIR='$PROJECT_DIR' bash '$script_path'"
        tmux select-pane -t claude-as-companion:0.0
        tmux attach-session -t claude-as-companion
    fi
}

run_claude() {
    # Check if tmux is available
    if ! command -v tmux &>/dev/null; then
        echo "Error: tmux is not installed"
        exit 1
    fi

    # Check if claude is available
    if ! command -v claude &>/dev/null; then
        echo "Error: claude CLI is not installed"
        echo "Install: https://docs.anthropic.com/en/docs/claude-code"
        exit 1
    fi

    local pane_width="${COMPANION_WIDTH:-35}"
    local script_path
    script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
    local session_name="claude-as"

    # Kill existing session if present
    tmux kill-session -t "$session_name" 2>/dev/null || true

    # Create session: main pane runs claude, right pane runs companion
    tmux new-session -d -s "$session_name" -x "$(tput cols)" -y "$(tput lines)" \
        "cd '$PROJECT_DIR' && claude"
    tmux split-window -h -l "$pane_width" -t "$session_name" \
        "CLAUDE_AS_PROJECT_DIR='$PROJECT_DIR' bash '$script_path'"
    tmux select-pane -t "$session_name:0.0"
    tmux attach-session -t "$session_name"
}

show_help() {
    cat <<'HELP'
Claude AS Companion Panel
Context-aware command reference for your terminal.

USAGE:
  ./scripts/companion.sh --claude     Launch claude + companion side-by-side (recommended)
  ./scripts/companion.sh --tmux       Open companion as tmux right pane only
  ./scripts/companion.sh              Run in current terminal (auto-refresh loop)
  ./scripts/companion.sh --once       Render once and exit
  ./scripts/companion.sh --help       Show this help

ENVIRONMENT:
  CLAUDE_AS_PROJECT_DIR   Project directory to read scratchpad from (default: pwd)
  COMPANION_REFRESH       Refresh interval in seconds (default: 5)
  COMPANION_WIDTH         Tmux pane width in columns (default: 35)

HOW IT WORKS:
  Reads .claude/scratchpad.md from your project directory to determine the
  current phase, task, and agent. Shows commands relevant to that phase.
  Auto-refreshes every 5 seconds. Press 'q' to quit.

CLAUDE MODE (--claude):
  Creates a tmux session with two panes:
    Left (main):  claude CLI — you type /go --mode=autonomous here
    Right (35col): companion panel — auto-refreshes as you work

  This is the recommended way to use Claude AS. One command replaces:
    1. Open terminal
    2. Type "claude"
    3. Somehow open companion in another pane

TMUX MODE (--tmux):
  If already inside tmux: splits the current window and runs companion in the new pane.
  If not in tmux: creates a new tmux session with your shell + companion pane.

EXAMPLES:
  # The one-liner: claude + companion side-by-side
  ./scripts/companion.sh --claude

  # Just the companion as a side pane (if already in tmux)
  ./scripts/companion.sh --tmux

  # Quick look at current state
  ./scripts/companion.sh --once

  # Custom width
  COMPANION_WIDTH=40 ./scripts/companion.sh --claude
HELP
}

# ─── Main ─────────────────────────────────────────────────────

case "${1:-}" in
    --claude|-c)
        run_claude
        ;;
    --tmux|-t)
        run_tmux
        ;;
    --once|-1)
        render
        ;;
    --help|-h)
        show_help
        ;;
    "")
        run_loop
        ;;
    *)
        echo "Unknown option: $1"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

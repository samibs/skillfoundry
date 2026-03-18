#!/bin/bash

# Setup Auto-Harvest — Install cron job and Claude Code hooks for automatic
# knowledge harvesting across all registered SkillFoundry projects.
#
# USAGE:
#   ./scripts/setup-auto-harvest.sh              # Install everything
#   ./scripts/setup-auto-harvest.sh --cron-only   # Install cron job only
#   ./scripts/setup-auto-harvest.sh --hooks-only   # Install Claude Code hooks only
#   ./scripts/setup-auto-harvest.sh --uninstall    # Remove cron job and hooks
#   ./scripts/setup-auto-harvest.sh --status       # Check what's installed

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"
CRON_SCRIPT="$FRAMEWORK_DIR/scripts/auto-harvest-cron.sh"
CRON_MARKER="# skillfoundry-auto-harvest"
LOG_FILE="$FRAMEWORK_DIR/logs/auto-harvest.log"

# Default: 30-minute cron interval
CRON_INTERVAL="${CRON_INTERVAL:-30}"

# Options
CRON_ONLY=false
HOOKS_ONLY=false
UNINSTALL=false
SHOW_STATUS=false

for arg in "$@"; do
    case "$arg" in
        --cron-only)   CRON_ONLY=true ;;
        --hooks-only)  HOOKS_ONLY=true ;;
        --uninstall)   UNINSTALL=true ;;
        --status)      SHOW_STATUS=true ;;
        --interval=*)  CRON_INTERVAL="${arg#*=}" ;;
        --help|-h)
            echo "Setup Auto-Harvest — Install cron + Claude Code hooks"
            echo ""
            echo "Usage: ./scripts/setup-auto-harvest.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --cron-only      Install cron job only (no hooks)"
            echo "  --hooks-only     Install Claude Code hooks only (no cron)"
            echo "  --uninstall      Remove cron job and hooks"
            echo "  --status         Check what's installed"
            echo "  --interval=N     Cron interval in minutes (default: 30)"
            echo "  --help           Show this help"
            echo ""
            echo "Environment:"
            echo "  CRON_INTERVAL    Cron interval in minutes (default: 30)"
            exit 0
            ;;
    esac
done

# ═══════════════════════════════════════════════════════════════
# STATUS
# ═══════════════════════════════════════════════════════════════

if [ "$SHOW_STATUS" = true ]; then
    echo -e "${CYAN}${BOLD}Auto-Harvest Status${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Cron
    if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        cron_line=$(crontab -l 2>/dev/null | grep "$CRON_MARKER" | head -1)
        echo -e "${GREEN}  Cron:   INSTALLED${NC}"
        echo -e "          $cron_line"
    else
        echo -e "${YELLOW}  Cron:   NOT INSTALLED${NC}"
    fi

    # Hooks
    if [ -f "$SETTINGS_FILE" ]; then
        has_start=$(jq -r '.hooks.SessionStart // empty' "$SETTINGS_FILE" 2>/dev/null)
        has_end=$(jq -r '.hooks.SessionEnd // empty' "$SETTINGS_FILE" 2>/dev/null)
        has_monitor=$(jq -r '.hooks.PostToolUse // empty' "$SETTINGS_FILE" 2>/dev/null)
        if [ -n "$has_start" ] && [ -n "$has_end" ]; then
            echo -e "${GREEN}  Hooks:  INSTALLED (SessionStart + SessionEnd)${NC}"
        elif [ -n "$has_end" ]; then
            echo -e "${YELLOW}  Hooks:  PARTIAL (SessionEnd only)${NC}"
        elif [ -n "$has_start" ]; then
            echo -e "${YELLOW}  Hooks:  PARTIAL (SessionStart only)${NC}"
        else
            echo -e "${YELLOW}  Hooks:  NOT INSTALLED${NC}"
        fi
        if [ -n "$has_monitor" ]; then
            echo -e "${GREEN}  Monitor: INSTALLED (PostToolUse → session-monitor.sh)${NC}"
        else
            echo -e "${YELLOW}  Monitor: NOT INSTALLED${NC}"
        fi
    else
        echo -e "${YELLOW}  Hooks:  NOT INSTALLED (no settings.json)${NC}"
    fi

    # Hook scripts
    echo ""
    for hook in session-start.sh session-end.sh; do
        if [ -f "$HOOKS_DIR/$hook" ] && [ -x "$HOOKS_DIR/$hook" ]; then
            echo -e "${GREEN}  $HOOKS_DIR/$hook — executable${NC}"
        elif [ -f "$HOOKS_DIR/$hook" ]; then
            echo -e "${YELLOW}  $HOOKS_DIR/$hook — exists but not executable${NC}"
        else
            echo -e "${RED}  $HOOKS_DIR/$hook — missing${NC}"
        fi
    done

    # Registry
    echo ""
    if [ -f "$FRAMEWORK_DIR/.project-registry" ]; then
        reg_count=$(grep -c '^/' "$FRAMEWORK_DIR/.project-registry" 2>/dev/null || echo 0)
        echo -e "${GREEN}  Registry: $reg_count projects${NC}"
    else
        echo -e "${RED}  Registry: NOT FOUND${NC}"
    fi

    # Last harvest
    state_file="$FRAMEWORK_DIR/.claude/auto-harvest-state.json"
    if [ -f "$state_file" ]; then
        echo ""
        echo -e "${BLUE}  Last harvest:${NC}"
        jq -r '
            "    Run:       \(.last_run // "never")\n" +
            "    Duration:  \(.last_duration_sec // "?")s\n" +
            "    Harvested: \(.entries_last_run // 0) entries\n" +
            "    Promoted:  \(.promoted_last_run // 0) entries\n" +
            "    Lifetime:  \(.total_runs // 0) runs, \(.total_entries_harvested // 0) entries"
        ' "$state_file" 2>/dev/null
    fi

    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# UNINSTALL
# ═══════════════════════════════════════════════════════════════

if [ "$UNINSTALL" = true ]; then
    echo -e "${CYAN}${BOLD}Uninstalling Auto-Harvest${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Remove cron
    if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | crontab -
        echo -e "${GREEN}  Cron job removed${NC}"
    else
        echo -e "${YELLOW}  No cron job found${NC}"
    fi

    # Remove hooks from settings.json (keep other settings intact)
    if [ -f "$SETTINGS_FILE" ]; then
        if jq -e '.hooks.SessionStart' "$SETTINGS_FILE" &>/dev/null; then
            tmp=$(mktemp)
            jq 'del(.hooks.SessionStart)' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
            echo -e "${GREEN}  SessionStart hook removed from settings.json${NC}"
        fi
        if jq -e '.hooks.SessionEnd' "$SETTINGS_FILE" &>/dev/null; then
            tmp=$(mktemp)
            jq 'del(.hooks.SessionEnd)' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
            echo -e "${GREEN}  SessionEnd hook removed from settings.json${NC}"
        fi
        if jq -e '.hooks.PostToolUse' "$SETTINGS_FILE" &>/dev/null; then
            tmp=$(mktemp)
            jq 'del(.hooks.PostToolUse)' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
            echo -e "${GREEN}  PostToolUse hook (session monitor) removed from settings.json${NC}"
        fi
        # Clean up empty hooks object
        if jq -e '.hooks == {}' "$SETTINGS_FILE" &>/dev/null; then
            tmp=$(mktemp)
            jq 'del(.hooks)' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
        fi
    fi

    echo ""
    echo -e "${GREEN}${BOLD}Uninstall complete.${NC} Hook scripts left in place at $HOOKS_DIR/"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# INSTALL
# ═══════════════════════════════════════════════════════════════

echo -e "${CYAN}${BOLD}Setting Up Auto-Harvest${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Pre-flight ──────────────────────────────────────────────────────────────

if ! command -v jq &>/dev/null; then
    echo -e "${RED}  ERROR: jq is required but not installed.${NC}"
    echo -e "  Install: sudo apt install jq"
    exit 1
fi

if [ ! -f "$CRON_SCRIPT" ]; then
    echo -e "${RED}  ERROR: auto-harvest-cron.sh not found at $CRON_SCRIPT${NC}"
    exit 1
fi

# ── Make scripts executable ─────────────────────────────────────────────────

chmod +x "$CRON_SCRIPT"
chmod +x "$HOOKS_DIR/session-start.sh" 2>/dev/null || true
chmod +x "$HOOKS_DIR/session-end.sh" 2>/dev/null || true
echo -e "${GREEN}  Scripts made executable${NC}"

# ── Install cron job ────────────────────────────────────────────────────────

if [ "$HOOKS_ONLY" = false ]; then
    # Remove existing if present
    existing_cron=$(crontab -l 2>/dev/null || true)

    if echo "$existing_cron" | grep -q "$CRON_MARKER"; then
        # Update existing entry
        new_cron=$(echo "$existing_cron" | grep -v "$CRON_MARKER")
        echo "$new_cron" | crontab -
    fi

    # Add new entry
    (crontab -l 2>/dev/null || true; echo "*/$CRON_INTERVAL * * * * $CRON_SCRIPT >> $LOG_FILE 2>&1 $CRON_MARKER") | crontab -
    echo -e "${GREEN}  Cron job installed: every ${CRON_INTERVAL} minutes${NC}"
fi

# ── Install Claude Code hooks ───────────────────────────────────────────────

if [ "$CRON_ONLY" = false ]; then
    mkdir -p "$HOOKS_DIR"
    mkdir -p "$(dirname "$SETTINGS_FILE")"

    # Copy hook scripts if they're not already in the hooks dir
    if [ -f "$FRAMEWORK_DIR/scripts/session-start-hook.sh" ]; then
        cp "$FRAMEWORK_DIR/scripts/session-start-hook.sh" "$HOOKS_DIR/session-start.sh"
    fi
    if [ -f "$FRAMEWORK_DIR/scripts/session-end-hook.sh" ]; then
        cp "$FRAMEWORK_DIR/scripts/session-end-hook.sh" "$HOOKS_DIR/session-end.sh"
    fi

    chmod +x "$HOOKS_DIR/session-start.sh" 2>/dev/null || true
    chmod +x "$HOOKS_DIR/session-end.sh" 2>/dev/null || true

    # Create settings.json if it doesn't exist
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo '{}' > "$SETTINGS_FILE"
    fi

    # Add hooks to settings.json using jq (preserves existing settings)
    tmp=$(mktemp)

    jq '
        .hooks.SessionStart = [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "bash '"$HOOKS_DIR"'/session-start.sh",
                        "timeout": 30,
                        "statusMessage": "Pulling global knowledge..."
                    }
                ]
            }
        ] |
        .hooks.SessionEnd = [
            {
                "matcher": "",
                "hooks": [
                    {
                        "type": "command",
                        "command": "bash '"$HOOKS_DIR"'/session-end.sh",
                        "timeout": 60,
                        "statusMessage": "Harvesting session knowledge..."
                    }
                ]
            }
        ] |
        .hooks.PostToolUse = [
            {
                "matcher": "Bash",
                "hooks": [
                    {
                        "type": "command",
                        "command": "bash '"$FRAMEWORK_DIR"'/scripts/session-monitor.sh",
                        "timeout": 10
                    }
                ]
            }
        ]
    ' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"

    echo -e "${GREEN}  Claude Code hooks installed in settings.json${NC}"
    echo -e "    SessionStart  → $HOOKS_DIR/session-start.sh"
    echo -e "    SessionEnd    → $HOOKS_DIR/session-end.sh"
    echo -e "    PostToolUse   → $FRAMEWORK_DIR/scripts/session-monitor.sh (Bash)"
fi

# ── Ensure log directory exists ─────────────────────────────────────────────

mkdir -p "$FRAMEWORK_DIR/logs"
touch "$LOG_FILE"

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}Auto-Harvest Setup Complete${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$HOOKS_ONLY" = false ]; then
    echo -e "  ${BOLD}Cron:${NC}    Every ${CRON_INTERVAL}min → harvest all registered projects"
fi
if [ "$CRON_ONLY" = false ]; then
    echo -e "  ${BOLD}Hooks:${NC}   SessionStart  → pull global knowledge"
    echo -e "           SessionEnd    → harvest + sync + promote"
    echo -e "           PostToolUse   → session monitor (Bash commands)"
fi

reg_count=$(grep -c '^/' "$FRAMEWORK_DIR/.project-registry" 2>/dev/null || echo 0)
echo -e "  ${BOLD}Projects:${NC} $reg_count registered"
echo ""
echo -e "  Check status:   ./scripts/setup-auto-harvest.sh --status"
echo -e "  Manual harvest:  ./scripts/auto-harvest-cron.sh"
echo -e "  View log:        tail -f $LOG_FILE"
echo -e "  Uninstall:       ./scripts/setup-auto-harvest.sh --uninstall"
echo ""

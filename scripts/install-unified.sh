#!/bin/bash

# Claude AS - One-Click Unified Installer
# Auto-detects platform and OS, installs framework with minimal user input
#
# USAGE:
#   curl -fsSL https://raw.githubusercontent.com/your-repo/claude_as/main/install-unified.sh | bash
#   OR download and run:
#   bash install-unified.sh

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

# Banner (version filled in after framework is located)
print_banner() {
    local ver="${1:-}"
    local dt="${2:-}"
    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}Claude AS Framework${NC} ${YELLOW}— One-Click Installer${NC}           ${CYAN}│${NC}"
    if [ -n "$ver" ]; then
        echo -e "${CYAN}│${NC}  v${ver} · ${dt} · 5 platforms             ${CYAN}│${NC}"
    fi
    echo -e "${CYAN}└─────────────────────────────────────────────────────┘${NC}"
    echo ""
}

print_banner

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

# Detect platform(s) (Claude Code, Copilot CLI, Cursor, Codex, Gemini)
# Returns space-separated list of all detected platforms on stdout.
# Display messages are sent to stderr so they don't pollute the return value.
detect_platform() {
    local platforms=""

    # Check for Claude Code
    if command -v claude &> /dev/null; then
        platforms="claude"
        echo -e "${GREEN}✓${NC} Detected: Claude Code" >&2
    fi

    # Check for GitHub Copilot CLI
    if command -v github-copilot-cli &> /dev/null || command -v copilot &> /dev/null; then
        platforms="${platforms:+$platforms }copilot"
        echo -e "${GREEN}✓${NC} Detected: GitHub Copilot CLI" >&2
    fi

    # Check for Cursor (check if .cursor directory exists or cursor command)
    if command -v cursor &> /dev/null || [ -d "$HOME/.cursor" ] || [ -d "$HOME/.config/cursor" ]; then
        platforms="${platforms:+$platforms }cursor"
        echo -e "${GREEN}✓${NC} Detected: Cursor" >&2
    fi

    # Check for OpenAI Codex CLI
    if command -v codex &> /dev/null; then
        platforms="${platforms:+$platforms }codex"
        echo -e "${GREEN}✓${NC} Detected: OpenAI Codex" >&2
    fi
    # Check for Google Gemini CLI
    if command -v gemini &> /dev/null; then
        platforms="${platforms:+$platforms }gemini"
        echo -e "${GREEN}✓${NC} Detected: Google Gemini" >&2
    fi

    echo "$platforms"
}

# Get framework location
get_framework_location() {
    # Try common locations
    local locations=(
        "$HOME/DevLab/IDEA/claude_as"
        "$HOME/dev_tools/claude_as"
        "$HOME/claude_as"
        "./claude_as"
    )
    
    for loc in "${locations[@]}"; do
        if [ -d "$loc" ] && [ -f "$loc/install.sh" ]; then
            echo "$loc"
            return
        fi
    done
    
    # If not found, ask user
    echo ""
    echo -e "${YELLOW}Framework not found in common locations.${NC}"
    echo ""
    echo "  1) Clone from GitHub (requires git)"
    echo "  2) Enter path manually"
    echo ""
    read -p "Choice (1-2): " choice
    case "$choice" in
        1)
            local clone_dir="$HOME/claude_as"
            if command -v git &>/dev/null; then
                echo -e "${BLUE}Cloning from GitHub...${NC}"
                git clone https://github.com/samibs/claude_as.git "$clone_dir" 2>/dev/null
                if [ -d "$clone_dir" ] && [ -f "$clone_dir/install.sh" ]; then
                    echo "$clone_dir"
                    return
                else
                    echo -e "${RED}Clone failed or invalid repo${NC}"
                    exit 1
                fi
            else
                echo -e "${RED}git not installed. Install git first or enter path manually.${NC}"
                exit 1
            fi
            ;;
        2|*)
            read -p "Path: " framework_path
            if [ -d "$framework_path" ] && [ -f "$framework_path/install.sh" ]; then
                echo "$framework_path"
            else
                echo -e "${RED}Error: Invalid framework directory${NC}"
                exit 1
            fi
            ;;
    esac
}

# Get target project directory
get_target_directory() {
    local target="."
    
    # Check if we're in a git repo or have project files
    if [ -d ".git" ] || [ -f "package.json" ] || [ -f "requirements.txt" ] || [ -f "Cargo.toml" ] || [ -f "go.mod" ]; then
        target="$(pwd)"
        echo -e "${GREEN}✓${NC} Detected project directory: $(basename "$target")"
    else
        echo -e "${YELLOW}⚠${NC} Not in a project directory. Install to current directory?"
        read -p "Continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            read -p "Enter project directory path: " target
        fi
    fi
    
    echo "$target"
}

# Helper: present multi-select menu and return chosen platforms
# Outputs space-separated platform names on stdout
select_platforms_menu() {
    echo "" >&2
    echo "Select platforms (comma-separated, e.g. 1,3,4):" >&2
    echo "  1) Claude Code" >&2
    echo "  2) GitHub Copilot CLI" >&2
    echo "  3) Cursor" >&2
    echo "  4) OpenAI Codex" >&2
    echo "  5) Google Gemini" >&2
    echo "" >&2
    read -p "Platforms: " selection </dev/tty
    local chosen=""
    # Split comma-separated input and map numbers to platform names
    IFS=',' read -ra nums <<< "$selection"
    for num in "${nums[@]}"; do
        # Trim whitespace
        num="$(echo "$num" | tr -d '[:space:]')"
        case "$num" in
            1) chosen="${chosen:+$chosen }claude" ;;
            2) chosen="${chosen:+$chosen }copilot" ;;
            3) chosen="${chosen:+$chosen }cursor" ;;
            4) chosen="${chosen:+$chosen }codex" ;;
            5) chosen="${chosen:+$chosen }gemini" ;;
            *)
                echo -e "${YELLOW}⚠${NC} Ignoring invalid selection: $num" >&2
                ;;
        esac
    done
    if [ -z "$chosen" ]; then
        echo -e "${RED}No valid platforms selected. Exiting.${NC}" >&2
        exit 1
    fi
    echo "$chosen"
}

# Main installation flow
main() {
    echo -e "${BLUE}Step 1: Detecting environment...${NC}"
    OS=$(detect_os)
    echo -e "${GREEN}✓${NC} OS: $OS"

    DETECTED=$(detect_platform)

    if [ -z "$DETECTED" ]; then
        # Nothing detected — show full multi-select menu
        echo -e "${YELLOW}⚠${NC} No AI platform detected automatically."
        PLATFORMS=$(select_platforms_menu)
    else
        # Show what was detected and let user choose
        # Build comma-separated display string
        local detected_display
        detected_display="$(echo "$DETECTED" | tr ' ' ',')"
        echo ""
        echo -e "${GREEN}Detected platforms:${NC} ${BOLD}${detected_display}${NC}"
        echo ""
        echo "Install for which platforms?"
        echo "  1) All detected (${detected_display}) ${CYAN}[Recommended]${NC}"
        echo "  2) Choose specific platforms"
        echo ""
        read -p "Choice (1-2): " -n 1 -r
        echo ""
        case "$REPLY" in
            2)
                PLATFORMS=$(select_platforms_menu)
                ;;
            *)
                PLATFORMS="$DETECTED"
                ;;
        esac
    fi

    # Build comma-separated display string for selected platforms
    local platforms_display
    platforms_display="$(echo "$PLATFORMS" | tr ' ' ',')"
    echo -e "${GREEN}✓${NC} Selected platforms: ${BOLD}${platforms_display}${NC}"

    echo ""
    echo -e "${BLUE}Step 2: Locating framework...${NC}"
    FRAMEWORK_DIR=$(get_framework_location)
    echo -e "${GREEN}✓${NC} Framework: $FRAMEWORK_DIR"

    echo ""
    echo -e "${BLUE}Step 3: Selecting target project...${NC}"
    TARGET_DIR=$(get_target_directory)
    echo -e "${GREEN}✓${NC} Target: $TARGET_DIR"

    echo ""
    echo -e "${CYAN}${BOLD}Installation Summary:${NC}${BOLD}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Platforms: ${platforms_display}"
    echo "  Framework: $FRAMEWORK_DIR"
    echo "  Target: $TARGET_DIR"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
    echo ""

    read -p "Proceed with installation? (Y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Installation cancelled.${NC}"
        exit 0
    fi

    # Re-print banner with version now that we know the framework location
    if [ -f "$FRAMEWORK_DIR/.version" ]; then
        local fw_ver
        fw_ver=$(cat "$FRAMEWORK_DIR/.version" | tr -d '[:space:]')
        local fw_date
        fw_date=$(date -r "$FRAMEWORK_DIR/.version" +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")
    fi

    echo ""
    echo -e "${BLUE}Step 4: Installing framework...${NC}"

    # Build comma-separated platform string for single install call
    local platform_csv
    platform_csv="$(echo "$PLATFORMS" | tr ' ' ',')"
    "$FRAMEWORK_DIR/install.sh" --platform="$platform_csv" --yes "$TARGET_DIR"

    echo ""
    echo -e "${GREEN}${BOLD}✓ Installation Complete!${NC}${BOLD}"
    echo ""
    echo "Next steps:"
    for plat in $PLATFORMS; do
        case $plat in
            claude)
                echo -e "  ${CYAN}[Claude Code]${NC}"
                echo "    1. Run: claude"
                echo "    2. Create PRD: /prd \"your feature\""
                echo "    3. Implement: /go"
                ;;
            copilot)
                echo -e "  ${CYAN}[GitHub Copilot CLI]${NC}"
                echo "    1. View agents: ls .copilot/custom-agents/"
                echo "    2. Run helper: .copilot/helper.sh"
                echo "    3. Read guide: cat .copilot/WORKFLOW-GUIDE.md"
                ;;
            cursor)
                echo -e "  ${CYAN}[Cursor]${NC}"
                echo "    1. Open Cursor IDE"
                echo "    2. Rules are automatically loaded from .cursor/rules/"
                echo "    3. Use in chat: \"use go rule\" or \"follow coder rule\""
                ;;
            codex)
                echo -e "  ${CYAN}[OpenAI Codex]${NC}"
                echo "    1. Run: codex"
                echo "    2. Skills auto-loaded from .agents/skills/"
                echo "    3. Invoke skills: \$go, \$coder, \$tester, etc."
                echo "    4. Or let Codex auto-select based on your prompt"
                echo "    5. See AGENTS.md for framework overview"
                ;;
            gemini)
                echo -e "  ${CYAN}[Google Gemini]${NC}"
                echo "    1. Run: gemini"
                echo "    2. Skills are available from .gemini/skills/"
                echo "    3. Invoke framework commands per your Gemini workflow"
                ;;
        esac
        echo ""
    done
}

# Run main function
main "$@"

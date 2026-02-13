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

# Banner
echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     Claude AS Framework - One-Click Installer             ║"
echo "║     Multi-Platform AI Agent & Skills Framework           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

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

# Detect platform (Claude Code, Copilot CLI, Cursor)
detect_platform() {
    local platform=""
    
    # Check for Claude Code
    if command -v claude &> /dev/null; then
        platform="claude"
        echo -e "${GREEN}✓${NC} Detected: Claude Code"
    fi
    
    # Check for GitHub Copilot CLI
    if command -v github-copilot-cli &> /dev/null || command -v copilot &> /dev/null; then
        if [ -z "$platform" ]; then
            platform="copilot"
            echo -e "${GREEN}✓${NC} Detected: GitHub Copilot CLI"
        else
            echo -e "${YELLOW}⚠${NC} Also detected: GitHub Copilot CLI"
        fi
    fi
    
    # Check for Cursor (check if .cursor directory exists or cursor command)
    if command -v cursor &> /dev/null || [ -d "$HOME/.cursor" ] || [ -d "$HOME/.config/cursor" ]; then
        if [ -z "$platform" ]; then
            platform="cursor"
            echo -e "${GREEN}✓${NC} Detected: Cursor"
        else
            echo -e "${YELLOW}⚠${NC} Also detected: Cursor"
        fi
    fi

    # Check for OpenAI Codex CLI
    if command -v codex &> /dev/null; then
        if [ -z "$platform" ]; then
            platform="codex"
            echo -e "${GREEN}✓${NC} Detected: OpenAI Codex"
        else
            echo -e "${YELLOW}⚠${NC} Also detected: OpenAI Codex"
        fi
    fi

    echo "$platform"
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

# Main installation flow
main() {
    echo -e "${BLUE}Step 1: Detecting environment...${NC}"
    OS=$(detect_os)
    echo -e "${GREEN}✓${NC} OS: $OS"
    
    PLATFORM=$(detect_platform)
    
    if [ -z "$PLATFORM" ]; then
        echo -e "${YELLOW}⚠${NC} No AI platform detected automatically."
        echo ""
        echo "Please select your platform:"
        echo "  1) Claude Code"
        echo "  2) GitHub Copilot CLI"
        echo "  3) Cursor"
        echo "  4) OpenAI Codex"
        read -p "Choice (1-4): " -n 1 -r
        echo ""
        case $REPLY in
            1) PLATFORM="claude" ;;
            2) PLATFORM="copilot" ;;
            3) PLATFORM="cursor" ;;
            4) PLATFORM="codex" ;;
            *)
                echo -e "${RED}Invalid choice. Exiting.${NC}"
                exit 1
                ;;
        esac
    else
        echo -e "${GREEN}✓${NC} Platform: $PLATFORM"
        echo ""
        echo "Use detected platform '$PLATFORM'? (Y/n)"
        read -p "Press Enter to continue or 'n' to choose manually: " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Select platform:"
            echo "  1) Claude Code"
            echo "  2) GitHub Copilot CLI"
            echo "  3) Cursor"
            echo "  4) OpenAI Codex"
            read -p "Choice (1-4): " -n 1 -r
            echo ""
            case $REPLY in
                1) PLATFORM="claude" ;;
                2) PLATFORM="copilot" ;;
                3) PLATFORM="cursor" ;;
                4) PLATFORM="codex" ;;
                *)
                    echo -e "${RED}Invalid choice. Exiting.${NC}"
                    exit 1
                    ;;
            esac
        fi
    fi
    
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
    echo "  Platform: $PLATFORM"
    echo "  Framework: $FRAMEWORK_DIR"
    echo "  Target: $TARGET_DIR"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    read -p "Proceed with installation? (Y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Installation cancelled.${NC}"
        exit 0
    fi
    
    echo ""
    echo -e "${BLUE}Step 4: Installing framework...${NC}"
    
    # Change to target directory and run installer
    cd "$TARGET_DIR"
    "$FRAMEWORK_DIR/install.sh" --platform="$PLATFORM"
    
    echo ""
    echo -e "${GREEN}${BOLD}✓ Installation Complete!${NC}${BOLD}"
    echo ""
    echo "Next steps:"
    case $PLATFORM in
        claude)
            echo "  1. Run: claude"
            echo "  2. Create PRD: /prd \"your feature\""
            echo "  3. Implement: /go"
            ;;
        copilot)
            echo "  1. View agents: ls .copilot/custom-agents/"
            echo "  2. Run helper: .copilot/helper.sh"
            echo "  3. Read guide: cat .copilot/WORKFLOW-GUIDE.md"
            ;;
        cursor)
            echo "  1. Open Cursor IDE"
            echo "  2. Rules are automatically loaded from .cursor/rules/"
            echo "  3. Use in chat: \"use go rule\" or \"follow coder rule\""
            ;;
        codex)
            echo "  1. Run: codex"
            echo "  2. Skills auto-loaded from .agents/skills/"
            echo "  3. Invoke skills: \$go, \$coder, \$tester, etc."
            echo "  4. Or let Codex auto-select based on your prompt"
            echo "  5. See AGENTS.md for framework overview"
            ;;
    esac
    echo ""
}

# Run main function
main "$@"

#!/bin/bash

# Claude AS - Agents & Skills Installer
# Installs the Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex, and/or Google Gemini framework to a target project
#
# USAGE:
#   ./install.sh                                    # Interactive install to current dir
#   ./install.sh --platform=claude /path/to/proj    # Install Claude to specific dir
#   ./install.sh --platform=claude,cursor -y .      # Non-interactive, two platforms
#   ./install.sh --dry-run --platform=claude        # Preview what would be installed
#   ./install.sh --help                             # Show usage
#
# DO NOT copy the claude_as folder into your project!
# Keep it in one central location and run the installer from there.

set -e
set -o pipefail  # Catch errors in pipes

# Error handler
trap 'handle_error $? $LINENO' ERR

# Error handling function
handle_error() {
    local exit_code=$1
    local line=$2

    echo -e "\n${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    ERROR OCCURRED                          ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo -e "${RED}Error: Installation failed at line $line${NC}"
    echo -e "${YELLOW}Exit code: $exit_code${NC}"

    # Rollback if partial installation
    if [ -n "$TARGET_DIR" ] && [ -d "$TARGET_DIR" ]; then
        if [ -d "$TARGET_DIR/.claude" ] || [ -d "$TARGET_DIR/.copilot" ] || [ -d "$TARGET_DIR/.cursor" ] || [ -d "$TARGET_DIR/.agents" ] || [ -d "$TARGET_DIR/.gemini" ]; then
            echo -e "${YELLOW}Rolling back partial installation...${NC}"
            rollback_installation
        fi
    fi

    # Diagnostic information
    if [ "$DEBUG" = "true" ]; then
        collect_diagnostics
        echo -e "${CYAN}Diagnostics saved to: ${TARGET_DIR:-.}/.claude-as-diagnostics.log${NC}"
    fi

    exit $exit_code
}

# Rollback function — cleans up ALL platform dirs that were created
rollback_installation() {
    if [ -z "$TARGET_DIR" ] || [[ "$TARGET_DIR" == "/" ]] || [[ "$TARGET_DIR" == "$HOME" ]]; then
        return
    fi

    echo -e "${YELLOW}Cleaning up partial installation...${NC}"

    # Remove platform-specific directories for every platform in the PLATFORMS array
    for plat in "${PLATFORMS[@]}"; do
        case "$plat" in
            claude)
                [ -d "$TARGET_DIR/.claude" ] && rm -rf "$TARGET_DIR/.claude" && echo "  Removed .claude/"
                ;;
            copilot)
                [ -d "$TARGET_DIR/.copilot" ] && rm -rf "$TARGET_DIR/.copilot" && echo "  Removed .copilot/"
                ;;
            cursor)
                [ -d "$TARGET_DIR/.cursor" ] && rm -rf "$TARGET_DIR/.cursor" && echo "  Removed .cursor/"
                ;;
            codex)
                [ -d "$TARGET_DIR/.agents" ] && rm -rf "$TARGET_DIR/.agents" && echo "  Removed .agents/"
                ;;
            gemini)
                [ -d "$TARGET_DIR/.gemini" ] && rm -rf "$TARGET_DIR/.gemini" && echo "  Removed .gemini/"
                ;;
        esac
    done

    # Remove shared directories/files
    [ -d "$TARGET_DIR/genesis" ] && rm -rf "$TARGET_DIR/genesis" && echo "  Removed genesis/"

    # Remove created files
    [ -f "$TARGET_DIR/CLAUDE.md" ] && rm -f "$TARGET_DIR/CLAUDE.md" && echo "  Removed CLAUDE.md"

    echo -e "${GREEN}Rollback complete${NC}"
}

# Diagnostic collection
collect_diagnostics() {
    local diag_file="${TARGET_DIR:-.}/.claude-as-diagnostics.log"

    cat > "$diag_file" <<EOF
# Claude AS Framework - Diagnostic Information
Generated: $(date)

## System Information
OS: $(uname -s)
Version: $(uname -r)
Shell: $SHELL
User: $(whoami)
Home: $HOME
Computer: $(hostname)

## Framework Information
Framework Version: $(cat "$SCRIPT_DIR/.version" 2>/dev/null || echo "unknown")
Framework Path: $SCRIPT_DIR
Project Path: $TARGET_DIR

## Disk Space
$(df -h "$TARGET_DIR" 2>/dev/null || echo "N/A")

## Permissions
Project Directory: $(ls -ld "$TARGET_DIR" 2>/dev/null || echo "N/A")
Framework Directory: $(ls -ld "$SCRIPT_DIR" 2>/dev/null || echo "N/A")

## Environment
PATH: $PATH
PWD: $(pwd)
Platforms: ${PLATFORMS[*]}
Debug Mode: ${DEBUG:-false}

## Recent Operations
$(tail -20 "$LOG_FILE" 2>/dev/null || echo "No log file")
EOF
}

# Enhanced error logging
log_error() {
    local what=$1
    local why=$2
    local where=$3
    local solution=$4

    echo -e "\n${RED}[ERROR] $what${NC}"
    [ -n "$why" ] && echo -e "${YELLOW}  Reason: $why${NC}"
    [ -n "$where" ] && echo -e "${YELLOW}  Location: $where${NC}"
    [ -n "$solution" ] && echo -e "${CYAN}  Solution: $solution${NC}"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read framework version early (needed for display)
VERSION_FILE="$SCRIPT_DIR/.version"
if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}Error: .version file not found at $VERSION_FILE${NC}"
    exit 1
fi
FRAMEWORK_VERSION="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
FRAMEWORK_DATE=$(date -r "$VERSION_FILE" +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# Step progress counter
STEP_CURRENT=0
STEP_TOTAL=0

step_init() {
    STEP_TOTAL=$1
    STEP_CURRENT=0
}

step() {
    STEP_CURRENT=$((STEP_CURRENT + 1))
    echo -e "  ${CYAN}[${STEP_CURRENT}/${STEP_TOTAL}]${NC} $1"
}

# Timer
timer_start() {
    _TIMER_START=$(date +%s)
}

timer_elapsed() {
    local end
    end=$(date +%s)
    echo $(( end - _TIMER_START ))
}

# Parse What's New from CHANGELOG.md (first version block)
show_whats_new() {
    local changelog_file="$1"
    local version="$2"

    [ ! -f "$changelog_file" ] && return 0

    echo ""
    echo -e "  ${CYAN}What's New in v${version}${NC}"
    echo -e "  ${CYAN}$(printf '%.0s─' $(seq 1 40))${NC}"

    local in_block=false
    local line_count=0
    while IFS= read -r line; do
        if [[ "$line" =~ ^##\ \[ ]] && [ "$in_block" = false ]; then
            in_block=true
            continue
        fi
        if [ "$in_block" = true ]; then
            if [[ "$line" =~ ^##\ \[ ]] || [[ "$line" =~ ^---$ ]]; then
                break
            fi
            if [[ "$line" =~ ^###\  ]]; then
                local heading="${line#*### }"
                heading="${heading%% —*}"
                echo -e "    ${YELLOW}${heading}${NC}"
            elif [[ "$line" =~ ^-\  ]] && [ $line_count -lt 10 ]; then
                local bullet="${line#- }"
                if [[ "$bullet" =~ \*\*(.+)\*\* ]]; then
                    echo -e "      ${BASH_REMATCH[1]}"
                else
                    echo -e "      ${bullet}"
                fi
                line_count=$((line_count + 1))
            fi
        fi
    done < "$changelog_file"

    if [ $line_count -ge 10 ]; then
        echo -e "      ${BLUE}... see CHANGELOG.md for full details${NC}"
    fi
    echo ""
}

# Show help
show_install_help() {
    echo "Claude AS Framework — Installer v${FRAMEWORK_VERSION}"
    echo ""
    echo "Usage: $(basename "$0") [OPTIONS] [TARGET_DIR]"
    echo ""
    echo "Options:"
    echo "  --platform=PLATFORMS   Comma-separated: claude,copilot,cursor,codex,gemini"
    echo "  --yes, -y              Non-interactive mode (accept all defaults)"
    echo "  --dry-run              Show what would be installed without doing it"
    echo "  --debug, -d            Enable diagnostic logging"
    echo "  --help, -h             Show this help message"
    echo "  --version, -v          Show framework version"
    echo ""
    echo "Examples:"
    echo "  $(basename "$0")                                  # Interactive install to current dir"
    echo "  $(basename "$0") --platform=claude /path/to/proj  # Install Claude to specific dir"
    echo "  $(basename "$0") --platform=claude,cursor -y .    # Non-interactive, two platforms"
    echo "  $(basename "$0") --dry-run --platform=claude      # Preview what would be installed"
    echo ""
    exit 0
}

# ═══════════════════════════════════════════════════════════════
# PARSE ARGUMENTS
# ═══════════════════════════════════════════════════════════════
platform_input=""
TARGET_DIR="."
DEBUG=false
YES_MODE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            platform_input="$2"
            shift 2
            ;;
        --platform=*)
            platform_input="${1#*=}"
            shift
            ;;
        --debug|-d)
            DEBUG=true
            shift
            ;;
        --yes|-y)
            YES_MODE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            show_install_help
            ;;
        --version|-v)
            echo "$FRAMEWORK_VERSION"
            exit 0
            ;;
        *)
            TARGET_DIR="$1"
            shift
            ;;
    esac
done

# Convert to absolute path
if [ -d "$TARGET_DIR" ]; then
    TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
else
    log_error "Target directory does not exist" "Directory not found" "$TARGET_DIR" "Create the directory first: mkdir -p $TARGET_DIR"
    exit 4  # File not found
fi

timer_start

echo ""
echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│${NC}  ${BOLD}Claude AS Framework${NC} ${YELLOW}— Installer${NC}                    ${CYAN}│${NC}"
echo -e "${CYAN}│${NC}  v${FRAMEWORK_VERSION} · ${FRAMEWORK_DATE} · 5 platforms             ${CYAN}│${NC}"
echo -e "${CYAN}└─────────────────────────────────────────────────────┘${NC}"
echo ""

# Platform selection if not specified
if [ -z "$platform_input" ]; then
    if [ "$YES_MODE" = true ]; then
        platform_input="claude"
        echo -e "  ${GREEN}--yes: defaulting to Claude platform${NC}"
    else
    echo -e "${YELLOW}Select platforms (comma-separated, e.g. 1,5):${NC}"
    echo "  1) Claude Code"
    echo "  2) GitHub Copilot CLI"
    echo "  3) Cursor"
    echo "  4) OpenAI Codex"
    echo "  5) Google Gemini"
    echo "  a) All platforms"
    echo ""
    read -p "Choice: " -r
    echo ""

    # Handle "all" shortcut
    if [[ "$REPLY" =~ ^[aA]$ ]]; then
        platform_input="claude,copilot,cursor,codex,gemini"
    else
        # Parse comma-separated numeric choices
        local_platforms=()
        IFS=',' read -ra CHOICES <<< "$REPLY"
        for choice in "${CHOICES[@]}"; do
            # Trim whitespace
            choice="$(echo "$choice" | tr -d '[:space:]')"
            case "$choice" in
                1) local_platforms+=("claude") ;;
                2) local_platforms+=("copilot") ;;
                3) local_platforms+=("cursor") ;;
                4) local_platforms+=("codex") ;;
                5) local_platforms+=("gemini") ;;
                *)
                    echo -e "${RED}Invalid choice: '$choice'. Must be 1-5 or 'a' for all.${NC}"
                    exit 1
                    ;;
            esac
        done

        if [ ${#local_platforms[@]} -eq 0 ]; then
            echo -e "${RED}No platforms selected. Exiting.${NC}"
            exit 1
        fi

        # Convert array back to comma-separated string for uniform processing
        platform_input=$(IFS=','; echo "${local_platforms[*]}")
    fi
    fi # end else (interactive mode)
fi

# Normalize platform input to lowercase
platform_input=$(echo "$platform_input" | tr '[:upper:]' '[:lower:]')

# Parse comma-separated platforms into array
IFS=',' read -ra PLATFORMS <<< "$platform_input"

# Validate each platform
for p in "${PLATFORMS[@]}"; do
    # Trim whitespace
    p="$(echo "$p" | tr -d '[:space:]')"
    if [[ ! "$p" =~ ^(claude|copilot|cursor|codex|gemini)$ ]]; then
        log_error "Invalid platform '$p'" "Platform must be 'claude', 'copilot', 'cursor', 'codex', or 'gemini'" "install.sh line $LINENO" "Use --platform=claude,copilot (comma-separated, no spaces)"
        exit 2  # Invalid arguments
    fi
done

# Deduplicate platforms (preserve order, bash 3.2 compatible)
UNIQUE_PLATFORMS=()
for p in "${PLATFORMS[@]}"; do
    p="$(echo "$p" | tr -d '[:space:]')"
    _dup=false
    for u in "${UNIQUE_PLATFORMS[@]}"; do
        if [ "$u" = "$p" ]; then _dup=true; break; fi
    done
    if [ "$_dup" = false ]; then
        UNIQUE_PLATFORMS+=("$p")
    fi
done
PLATFORMS=("${UNIQUE_PLATFORMS[@]}")

# Display selected platforms
echo -e "${GREEN}Platforms: ${PLATFORMS[*]}${NC}"
echo ""

# Check if user accidentally copied claude_as into their project
if [ -d "$TARGET_DIR/claude_as" ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗"
    echo "║  ERROR: Found 'claude_as' folder in target directory!     ║"
    echo "╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}You should NOT copy the claude_as folder into your project.${NC}"
    echo ""
    echo "The correct workflow is:"
    echo "  1. Keep claude_as in a central location (like ~/DevLab/IDEA/)"
    echo "  2. Run this installer FROM that location INTO your project"
    echo ""
    echo "To fix this:"
    echo -e "  ${CYAN}cd $TARGET_DIR${NC}"
    echo -e "  ${CYAN}rm -rf claude_as${NC}"
    echo -e "  ${CYAN}$SCRIPT_DIR/install.sh${NC}"
    echo ""
    if [ "$YES_MODE" = true ]; then
        REPLY="y"
        echo -e "  ${GREEN}--yes: auto-removing claude_as folder${NC}"
    else
        read -p "Remove claude_as folder and continue? (y/N): " -n 1 -r
        echo ""
    fi
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Safety: validate the path before rm -rf
        remove_path="$TARGET_DIR/claude_as"
        if [ -d "$remove_path" ] && [[ "$remove_path" != "/" ]] && [[ "$remove_path" != "$HOME" ]] && [[ "$remove_path" == */claude_as ]]; then
            rm -rf "$remove_path"
        else
            log_error "Refusing to remove suspicious path" "Path validation failed" "$remove_path" "Manually remove the claude_as folder"
            exit 1
        fi
        echo -e "${GREEN}Removed claude_as folder. Continuing installation...${NC}"
        echo ""
    else
        echo -e "${RED}Installation cancelled.${NC}"
        exit 1
    fi
fi

# Check if installing into the claude_as source folder itself
if [ "$TARGET_DIR" = "$SCRIPT_DIR" ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗"
    echo "║  ERROR: Cannot install into the source folder itself!     ║"
    echo "╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "You're trying to install into the claude_as template folder."
    echo ""
    echo "The correct workflow is:"
    echo "  1. Create or navigate to your PROJECT folder"
    echo "  2. Run this installer from there"
    echo ""
    echo "Example:"
    echo -e "  ${CYAN}mkdir ~/DevLab/MyNewProject${NC}"
    echo -e "  ${CYAN}cd ~/DevLab/MyNewProject${NC}"
    echo -e "  ${CYAN}$SCRIPT_DIR/install.sh${NC}"
    echo ""
    exit 1
fi

echo -e "${YELLOW}Installing to: ${TARGET_DIR}${NC}"
echo -e "${BLUE}Source: ${SCRIPT_DIR}${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# PER-PLATFORM: Check if platform directories already exist
# ═══════════════════════════════════════════════════════════════
for plat in "${PLATFORMS[@]}"; do
    if [ "$plat" = "claude" ] && [ -d "$TARGET_DIR/.claude" ]; then
        echo -e "${YELLOW}Warning: .claude directory already exists.${NC}"
        if [ "$YES_MODE" = true ]; then
            echo -e "  ${GREEN}--yes: overwriting claude skills${NC}"
        else
            read -p "Overwrite existing skills? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}Installation cancelled for claude.${NC}"
                PLATFORMS=("${PLATFORMS[@]/claude}")
            fi
        fi
    elif [ "$plat" = "copilot" ] && [ -d "$TARGET_DIR/.copilot" ]; then
        echo -e "${YELLOW}Warning: .copilot directory already exists.${NC}"
        if [ "$YES_MODE" = true ]; then
            echo -e "  ${GREEN}--yes: overwriting copilot agents${NC}"
        else
            read -p "Overwrite existing agents? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}Installation cancelled for copilot.${NC}"
                PLATFORMS=("${PLATFORMS[@]/copilot}")
            fi
        fi
    elif [ "$plat" = "cursor" ] && [ -d "$TARGET_DIR/.cursor" ]; then
        echo -e "${YELLOW}Warning: .cursor directory already exists.${NC}"
        if [ "$YES_MODE" = true ]; then
            echo -e "  ${GREEN}--yes: overwriting cursor rules${NC}"
        else
            read -p "Overwrite existing rules? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}Installation cancelled for cursor.${NC}"
                PLATFORMS=("${PLATFORMS[@]/cursor}")
            fi
        fi
    elif [ "$plat" = "codex" ] && [ -d "$TARGET_DIR/.agents/skills" ]; then
        echo -e "${YELLOW}Warning: .agents/skills directory already exists.${NC}"
        if [ "$YES_MODE" = true ]; then
            echo -e "  ${GREEN}--yes: overwriting codex skills${NC}"
        else
            read -p "Overwrite existing skills? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}Installation cancelled for codex.${NC}"
                PLATFORMS=("${PLATFORMS[@]/codex}")
            fi
        fi
    elif [ "$plat" = "gemini" ] && [ -d "$TARGET_DIR/.gemini/skills" ]; then
        echo -e "${YELLOW}Warning: .gemini/skills directory already exists.${NC}"
        if [ "$YES_MODE" = true ]; then
            echo -e "  ${GREEN}--yes: overwriting gemini skills${NC}"
        else
            read -p "Overwrite existing skills? (y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${RED}Installation cancelled for gemini.${NC}"
                PLATFORMS=("${PLATFORMS[@]/gemini}")
            fi
        fi
    fi
done

# Clean empty entries from PLATFORMS array after possible removals
declare -a CLEAN_PLATFORMS=()
for p in "${PLATFORMS[@]}"; do
    [ -n "$p" ] && CLEAN_PLATFORMS+=("$p")
done
PLATFORMS=("${CLEAN_PLATFORMS[@]}")

# Exit if no platforms remain
if [ ${#PLATFORMS[@]} -eq 0 ]; then
    echo -e "${RED}No platforms to install. Exiting.${NC}"
    exit 1
fi

# Check for existing installation and version (check first platform)
FIRST_PLAT="${PLATFORMS[0]}"
FIRST_PLAT_DIR=""
case "$FIRST_PLAT" in
    claude)  FIRST_PLAT_DIR=".claude" ;;
    copilot) FIRST_PLAT_DIR=".copilot" ;;
    codex)   FIRST_PLAT_DIR=".agents" ;;
    gemini)  FIRST_PLAT_DIR=".gemini" ;;
    cursor)  FIRST_PLAT_DIR=".cursor" ;;
esac

if [ -n "$FIRST_PLAT_DIR" ] && [ -f "$TARGET_DIR/$FIRST_PLAT_DIR/.framework-version" ]; then
    INSTALLED_VERSION=$(cat "$TARGET_DIR/$FIRST_PLAT_DIR/.framework-version" | tr -d '[:space:]')
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Existing Installation Detected${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "  ${CYAN}Currently Installed:${NC} ${YELLOW}$INSTALLED_VERSION${NC}"
    echo -e "  ${CYAN}Installing:${NC} ${GREEN}$FRAMEWORK_VERSION${NC}"
    echo ""

    # Parse versions for comparison (simplified)
    IFS='.' read -r -a INST_PARTS <<< "$INSTALLED_VERSION"
    IFS='.' read -r -a AVAIL_PARTS <<< "$FRAMEWORK_VERSION"

    INST_MAJOR="${INST_PARTS[0]:-0}"
    AVAIL_MAJOR="${AVAIL_PARTS[0]:-0}"

    if [ "$INST_MAJOR" != "$AVAIL_MAJOR" ]; then
        echo -e "  ${RED}Warning: Major version change detected!${NC}"
        echo -e "  ${YELLOW}This is a breaking change. Fresh install recommended.${NC}"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    elif [ "$INSTALLED_VERSION" != "$FRAMEWORK_VERSION" ]; then
        echo -e "  ${GREEN}This is an update (feature/patch/database)${NC}"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    else
        echo -e "  ${GREEN}Versions match (reinstalling)${NC}"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    fi
fi

# ═══════════════════════════════════════════════════════════════
# DRY-RUN: Preview what would be installed, then exit
# ═══════════════════════════════════════════════════════════════
if [ "$DRY_RUN" = true ]; then
    echo -e "${CYAN}┌─────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}Dry Run${NC} — No files will be modified               ${CYAN}│${NC}"
    echo -e "${CYAN}└─────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${BOLD}Target:${NC}     $TARGET_DIR"
    echo -e "  ${BOLD}Platforms:${NC}  ${PLATFORMS[*]}"
    echo -e "  ${BOLD}Source:${NC}     $SCRIPT_DIR"
    echo ""
    echo -e "  ${BOLD}Would install:${NC}"
    echo "    agents/               $(ls -1 "$SCRIPT_DIR/agents/"*.md 2>/dev/null | wc -l) shared modules"
    echo "    genesis/TEMPLATE.md   PRD template"
    echo "    docs/                 Security anti-pattern docs"
    echo "    memory_bank/          Knowledge bootstrap"
    echo "    CLAUDE.md             Project instructions"
    for plat in "${PLATFORMS[@]}"; do
        case "$plat" in
            claude)
                local_count=$(ls -1 "$SCRIPT_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
                local_hooks=$(ls -1 "$SCRIPT_DIR/.claude/hooks/"*.sh 2>/dev/null | wc -l)
                echo "    .claude/commands/     $local_count skills"
                echo "    .claude/hooks/        $local_hooks hooks"
                echo "    .claude/settings.json permission profile"
                ;;
            copilot)
                local_count=$(ls -1 "$SCRIPT_DIR/.copilot/custom-agents/"*.md 2>/dev/null | wc -l)
                echo "    .copilot/custom-agents/ $local_count agents"
                ;;
            cursor)
                local_count=$(ls -1 "$SCRIPT_DIR/.cursor/rules/"*.md 2>/dev/null | wc -l)
                echo "    .cursor/rules/        $local_count rules"
                ;;
            codex)
                local_count=$(find "$SCRIPT_DIR/.agents/skills" -name "SKILL.md" 2>/dev/null | wc -l)
                echo "    .agents/skills/       $local_count skills"
                ;;
            gemini)
                local_count=$(ls -1 "$SCRIPT_DIR/.gemini/skills/"*.md 2>/dev/null | wc -l)
                echo "    .gemini/skills/       $local_count skills"
                ;;
        esac
    done
    echo ""
    echo -e "  ${YELLOW}No changes were made.${NC}"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# Initialize progress counter
# ═══════════════════════════════════════════════════════════════
# Steps: shared dirs + shared agents + templates/docs + per-platform + registry + done
step_init $((3 + ${#PLATFORMS[@]} + 2))

# ═══════════════════════════════════════════════════════════════
# PHASE 1: Shared files (copied once, not per platform)
# ═══════════════════════════════════════════════════════════════
step "Creating shared directory structure..."
mkdir -p "$TARGET_DIR/agents"
mkdir -p "$TARGET_DIR/genesis"
mkdir -p "$TARGET_DIR/docs/stories"
mkdir -p "$TARGET_DIR/memory_bank/knowledge"

# Copy shared agent modules (all platforms need these)
step "Installing shared agent modules..."
cp -r "$SCRIPT_DIR/agents/"* "$TARGET_DIR/agents/"
SHARED_COUNT=$(ls -1 "$TARGET_DIR/agents/"*.md 2>/dev/null | wc -l)
echo -e "${GREEN}  ✓ Shared agent modules installed ($SHARED_COUNT modules)${NC}"

step "Installing templates and documentation..."

# Copy CLAUDE.md if it doesn't exist or user wants to overwrite
if [ -f "$TARGET_DIR/CLAUDE.md" ]; then
    echo -e "${YELLOW}  CLAUDE.md already exists.${NC}"
    if [ "$YES_MODE" = true ]; then
        cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
        echo -e "${GREEN}  ✓ CLAUDE.md updated (--yes)${NC}"
    else
        read -p "  Overwrite? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
            echo -e "${GREEN}  ✓ CLAUDE.md updated${NC}"
        else
            echo -e "${YELLOW}  → Keeping existing CLAUDE.md${NC}"
        fi
    fi
else
    cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
    echo -e "${GREEN}  ✓ CLAUDE.md installed${NC}"
fi

# Copy PRD template to genesis folder
cp "$SCRIPT_DIR/genesis/TEMPLATE.md" "$TARGET_DIR/genesis/"
echo -e "${GREEN}  ✓ PRD template installed to genesis/${NC}"

# Copy security anti-pattern documents to docs/
if [ ! -f "$TARGET_DIR/docs/ANTI_PATTERNS_BREADTH.md" ]; then
    cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_BREADTH.md" "$TARGET_DIR/docs/"
    echo -e "${GREEN}  ✓ docs/ANTI_PATTERNS_BREADTH.md installed${NC}"
fi

if [ ! -f "$TARGET_DIR/docs/ANTI_PATTERNS_DEPTH.md" ]; then
    cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_DEPTH.md" "$TARGET_DIR/docs/"
    echo -e "${GREEN}  ✓ docs/ANTI_PATTERNS_DEPTH.md installed${NC}"
fi

# Copy knowledge bootstrap for memory/harvest system
if [ ! -f "$TARGET_DIR/memory_bank/knowledge/bootstrap.jsonl" ]; then
    cp "$SCRIPT_DIR/memory_bank/knowledge/bootstrap.jsonl" "$TARGET_DIR/memory_bank/knowledge/"
    echo -e "${GREEN}  ✓ memory_bank/knowledge/ initialized with bootstrap${NC}"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Per-platform installation (loop over each platform)
# ═══════════════════════════════════════════════════════════════

# Per-platform count variables (bash 3.2 compatible — no associative arrays)
# Set via: eval "PLAT_SKILL_COUNT_${plat}=N"
# Get via: eval "_val=\${PLAT_SKILL_COUNT_${plat}:-0}"

install_platform() {
    local plat="$1"

    # Create directory structure
    case "$plat" in
        claude)
            mkdir -p "$TARGET_DIR/.claude/commands"
            mkdir -p "$TARGET_DIR/.claude/hooks"
            ;;
        copilot)
            mkdir -p "$TARGET_DIR/.copilot/custom-agents"
            ;;
        codex)
            mkdir -p "$TARGET_DIR/.agents/skills"
            ;;
        gemini)
            mkdir -p "$TARGET_DIR/.gemini/skills"
            ;;
        cursor)
            mkdir -p "$TARGET_DIR/.cursor/rules"
            ;;
    esac

    # Copy platform-specific files
    echo -e "${BLUE}  Installing agents and skills...${NC}"
    case "$plat" in
        claude)
            cp -r "$SCRIPT_DIR/.claude/commands/"* "$TARGET_DIR/.claude/commands/"
            _count=$(ls -1 "$TARGET_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
            eval "PLAT_SKILL_COUNT_${plat}=${_count}"
            echo -e "${GREEN}    ✓ Claude skills installed (${_count} skills)${NC}"

            # Deploy autonomous execution configuration (permission profile + hooks)
            if [ -f "$SCRIPT_DIR/.claude/settings.json" ]; then
                cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json"
                echo -e "${GREEN}    ✓ Permission profile installed (autonomous execution)${NC}"
            fi
            if [ -d "$SCRIPT_DIR/.claude/hooks" ]; then
                cp -r "$SCRIPT_DIR/.claude/hooks/"* "$TARGET_DIR/.claude/hooks/" 2>/dev/null || true
                chmod +x "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null || true
                _count=$(ls -1 "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null | wc -l)
                eval "PLAT_HOOK_COUNT_${plat}=${_count}"
                echo -e "${GREEN}    ✓ Safety hooks installed (${_count} hooks)${NC}"
            fi
            ;;
        copilot)
            cp -r "$SCRIPT_DIR/.copilot/custom-agents/"* "$TARGET_DIR/.copilot/custom-agents/"
            # Copy Copilot helper and workflow guide
            [ -f "$SCRIPT_DIR/.copilot/helper.sh" ] && cp "$SCRIPT_DIR/.copilot/helper.sh" "$TARGET_DIR/.copilot/"
            [ -f "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" ] && cp "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" "$TARGET_DIR/.copilot/"
            # Make helper executable
            [ -f "$TARGET_DIR/.copilot/helper.sh" ] && chmod +x "$TARGET_DIR/.copilot/helper.sh"

            _count=$(ls -1 "$TARGET_DIR/.copilot/custom-agents/"*.md 2>/dev/null | wc -l)
            eval "PLAT_AGENT_COUNT_${plat}=${_count}"
            echo -e "${GREEN}    ✓ Copilot custom agents installed (${_count} agents)${NC}"
            echo -e "${GREEN}    ✓ Copilot helper and workflow guide installed${NC}"
            ;;
        codex)
            cp -r "$SCRIPT_DIR/.agents/skills/"* "$TARGET_DIR/.agents/skills/"
            # Copy AGENTS.md to target
            [ -f "$SCRIPT_DIR/AGENTS.md" ] && cp "$SCRIPT_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
            _count=$(find "$TARGET_DIR/.agents/skills" -name "SKILL.md" 2>/dev/null | wc -l)
            eval "PLAT_SKILL_COUNT_${plat}=${_count}"
            echo -e "${GREEN}    ✓ Codex skills installed (${_count} skills)${NC}"
            ;;
        gemini)
            cp -r "$SCRIPT_DIR/.gemini/skills/"* "$TARGET_DIR/.gemini/skills/"
            _count=$(ls -1 "$TARGET_DIR/.gemini/skills/"*.md 2>/dev/null | wc -l)
            eval "PLAT_SKILL_COUNT_${plat}=${_count}"
            echo -e "${GREEN}    ✓ Gemini skills installed (${_count} skills)${NC}"
            ;;
        cursor)
            cp -r "$SCRIPT_DIR/.cursor/rules/"* "$TARGET_DIR/.cursor/rules/"
            _count=$(ls -1 "$TARGET_DIR/.cursor/rules/"*.md 2>/dev/null | wc -l)
            eval "PLAT_RULE_COUNT_${plat}=${_count}"
            echo -e "${GREEN}    ✓ Cursor rules installed (${_count} rules)${NC}"
            ;;
    esac

    # Write framework version marker for this platform
    local version_dir=""
    case "$plat" in
        claude)  version_dir="$TARGET_DIR/.claude" ;;
        copilot) version_dir="$TARGET_DIR/.copilot" ;;
        codex)   version_dir="$TARGET_DIR/.agents" ;;
        gemini)  version_dir="$TARGET_DIR/.gemini" ;;
        cursor)  version_dir="$TARGET_DIR/.cursor" ;;
    esac
    mkdir -p "$version_dir"
    echo "$FRAMEWORK_VERSION" > "$version_dir/.framework-version"
    echo "$FRAMEWORK_DATE" > "$version_dir/.framework-updated"
    echo "$plat" > "$version_dir/.framework-platform"
    echo -e "${GREEN}    ✓ Framework version: v$FRAMEWORK_VERSION (Platform: $plat)${NC}"
}

# Run installation for each platform
for plat in "${PLATFORMS[@]}"; do
    step "Installing platform: ${plat}..."
    install_platform "$plat"
done

# ═══════════════════════════════════════════════════════════════
# Auto-register project for updates
# ═══════════════════════════════════════════════════════════════
step "Registering project..."
REGISTRY_FILE="$SCRIPT_DIR/.project-registry"
if [ -f "$REGISTRY_FILE" ]; then
    if ! grep -q "^$TARGET_DIR$" "$REGISTRY_FILE" 2>/dev/null; then
        echo "$TARGET_DIR" >> "$REGISTRY_FILE"
    fi
else
    echo "$TARGET_DIR" >> "$REGISTRY_FILE"
fi
echo -e "${GREEN}  ✓ Registered for framework updates${NC}"

# Register in enhanced project registry with metadata (for each platform)
for plat in "${PLATFORMS[@]}"; do
    if [ -f "$SCRIPT_DIR/scripts/registry.sh" ] && [ -x "$SCRIPT_DIR/scripts/registry.sh" ]; then
        bash "$SCRIPT_DIR/scripts/registry.sh" register "$TARGET_DIR" --platform="$plat" 2>/dev/null || true
    fi
done

# ═══════════════════════════════════════════════════════════════
# FINAL STEP: Summary
# ═══════════════════════════════════════════════════════════════
step "Done!"

ELAPSED=$(timer_elapsed)

echo ""
echo -e "${GREEN}┌─────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│${NC}  ${BOLD}Installation Complete${NC}                              ${GREEN}│${NC}"
echo -e "${GREEN}└─────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${BOLD}Project:${NC}    $TARGET_DIR"
echo -e "  ${BOLD}Version:${NC}    v${FRAMEWORK_VERSION}"
echo -e "  ${BOLD}Platforms:${NC}  ${PLATFORMS[*]}"
echo -e "  ${BOLD}Duration:${NC}   ${ELAPSED}s"
echo ""
echo -e "  ${BOLD}Installed:${NC}"

# Per-platform summary lines (compact, bash 3.2 compatible)
for plat in "${PLATFORMS[@]}"; do
    case "$plat" in
        claude)
            eval "_skills=\${PLAT_SKILL_COUNT_${plat}:-0}"
            eval "_hooks=\${PLAT_HOOK_COUNT_${plat}:-0}"
            echo "    .claude/commands/       ${_skills} skills, ${_hooks} hooks"
            ;;
        copilot)
            eval "_agents=\${PLAT_AGENT_COUNT_${plat}:-0}"
            echo "    .copilot/custom-agents/ ${_agents} agents"
            ;;
        codex)
            eval "_skills=\${PLAT_SKILL_COUNT_${plat}:-0}"
            echo "    .agents/skills/         ${_skills} skills"
            ;;
        gemini)
            eval "_skills=\${PLAT_SKILL_COUNT_${plat}:-0}"
            echo "    .gemini/skills/         ${_skills} skills"
            ;;
        cursor)
            eval "_rules=\${PLAT_RULE_COUNT_${plat}:-0}"
            echo "    .cursor/rules/          ${_rules} rules"
            ;;
    esac
done
echo "    agents/                 $SHARED_COUNT shared modules"
echo "    genesis/                PRD template"
echo ""

# ═══════════════════════════════════════════════════════════════
# Compact Quick Start (per platform)
# ═══════════════════════════════════════════════════════════════
echo -e "  ${BOLD}Quick Start:${NC}"
echo ""
for plat in "${PLATFORMS[@]}"; do
    case "$plat" in
        claude)
            echo -e "    ${CYAN}Claude Code:${NC}"
            echo "      cd $TARGET_DIR && claude"
            echo "      > /prd \"your feature\"    Create a PRD"
            echo "      > /go                     Implement everything"
            echo ""
            ;;
        cursor)
            echo -e "    ${CYAN}Cursor:${NC}"
            echo "      Open project in Cursor — rules auto-load from .cursor/rules/"
            echo "      Create PRDs in genesis/ using genesis/TEMPLATE.md"
            echo ""
            ;;
        codex)
            echo -e "    ${CYAN}OpenAI Codex:${NC}"
            echo "      cd $TARGET_DIR && codex"
            echo "      > \$prd \"your feature\"    Create a PRD"
            echo "      > \$go                     Implement everything"
            echo ""
            ;;
        gemini)
            echo -e "    ${CYAN}Google Gemini:${NC}"
            echo "      Open your Gemini CLI/workspace in $TARGET_DIR"
            echo "      Skills are available from .gemini/skills/"
            echo ""
            ;;
        copilot)
            echo -e "    ${CYAN}GitHub Copilot CLI:${NC}"
            echo "      Create PRDs in genesis/ using genesis/TEMPLATE.md"
            echo "      Invoke agents from .copilot/custom-agents/"
            echo ""
            ;;
    esac
done

echo -e "  ${BLUE}Docs:${NC} CLAUDE.md, docs/ANTI_PATTERNS_DEPTH.md"
echo ""

# ═══════════════════════════════════════════════════════════════
# What's New
# ═══════════════════════════════════════════════════════════════
show_whats_new "$SCRIPT_DIR/CHANGELOG.md" "$FRAMEWORK_VERSION"

# ═══════════════════════════════════════════════════════════════
# Update instructions
# ═══════════════════════════════════════════════════════════════
echo -e "  ${YELLOW}Updates:${NC}  $SCRIPT_DIR/update.sh $TARGET_DIR"
echo ""
echo -e "  ${BLUE}Happy building.${NC}"
echo ""

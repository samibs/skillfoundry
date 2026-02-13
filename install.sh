#!/bin/bash

# Claude AS - Agents & Skills Installer
# Installs the Claude Code, GitHub Copilot CLI, Cursor, and/or OpenAI Codex framework to a target project
#
# USAGE:
#   From your project directory:
#   ~/DevLab/IDEA/claude_as/install.sh
#   ~/DevLab/IDEA/claude_as/install.sh --platform claude
#   ~/DevLab/IDEA/claude_as/install.sh --platform copilot
#   ~/DevLab/IDEA/claude_as/install.sh --platform cursor
#   ~/DevLab/IDEA/claude_as/install.sh --platform codex
#   ~/DevLab/IDEA/claude_as/install.sh --platform=copilot,codex
#   ~/DevLab/IDEA/claude_as/install.sh --platform=claude,copilot,cursor,codex
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
        if [ -d "$TARGET_DIR/.claude" ] || [ -d "$TARGET_DIR/.copilot" ] || [ -d "$TARGET_DIR/.cursor" ] || [ -d "$TARGET_DIR/.agents" ]; then
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

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read framework version early (needed for display)
VERSION_FILE="$SCRIPT_DIR/.version"
if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}Error: .version file not found at $VERSION_FILE${NC}"
    exit 1
fi
FRAMEWORK_VERSION="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
FRAMEWORK_DATE="2026-02-05"

# Parse arguments
platform_input=""
TARGET_DIR="."
DEBUG=false

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

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║      Agents & Skills Installer (Multi-Platform)          ║"
echo "║                                                           ║"
echo "║   Genesis-First Development Framework                     ║"
echo "║   Supports: Claude Code, Copilot CLI, Cursor & Codex       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Platform selection if not specified
if [ -z "$platform_input" ]; then
    echo -e "${YELLOW}Select platforms (comma-separated, e.g. 1,4):${NC}"
    echo "  1) Claude Code"
    echo "  2) GitHub Copilot CLI"
    echo "  3) Cursor"
    echo "  4) OpenAI Codex"
    echo "  a) All platforms"
    echo ""
    read -p "Choice: " -r
    echo ""

    # Handle "all" shortcut
    if [[ "$REPLY" =~ ^[aA]$ ]]; then
        platform_input="claude,copilot,cursor,codex"
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
                *)
                    echo -e "${RED}Invalid choice: '$choice'. Must be 1-4 or 'a' for all.${NC}"
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
fi

# Normalize platform input to lowercase
platform_input=$(echo "$platform_input" | tr '[:upper:]' '[:lower:]')

# Parse comma-separated platforms into array
IFS=',' read -ra PLATFORMS <<< "$platform_input"

# Validate each platform
for p in "${PLATFORMS[@]}"; do
    # Trim whitespace
    p="$(echo "$p" | tr -d '[:space:]')"
    if [[ ! "$p" =~ ^(claude|copilot|cursor|codex)$ ]]; then
        log_error "Invalid platform '$p'" "Platform must be 'claude', 'copilot', 'cursor', or 'codex'" "install.sh line $LINENO" "Use --platform=claude,copilot (comma-separated, no spaces)"
        exit 2  # Invalid arguments
    fi
done

# Deduplicate platforms (preserve order)
declare -a UNIQUE_PLATFORMS=()
declare -A SEEN_PLATFORMS=()
for p in "${PLATFORMS[@]}"; do
    p="$(echo "$p" | tr -d '[:space:]')"
    if [ -z "${SEEN_PLATFORMS[$p]+x}" ]; then
        UNIQUE_PLATFORMS+=("$p")
        SEEN_PLATFORMS[$p]=1
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
    read -p "Remove claude_as folder and continue? (y/N): " -n 1 -r
    echo ""
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
        read -p "Overwrite existing skills? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Installation cancelled for claude.${NC}"
            # Remove claude from PLATFORMS array
            PLATFORMS=("${PLATFORMS[@]/claude}")
        fi
    elif [ "$plat" = "copilot" ] && [ -d "$TARGET_DIR/.copilot" ]; then
        echo -e "${YELLOW}Warning: .copilot directory already exists.${NC}"
        read -p "Overwrite existing agents? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Installation cancelled for copilot.${NC}"
            PLATFORMS=("${PLATFORMS[@]/copilot}")
        fi
    elif [ "$plat" = "cursor" ] && [ -d "$TARGET_DIR/.cursor" ]; then
        echo -e "${YELLOW}Warning: .cursor directory already exists.${NC}"
        read -p "Overwrite existing rules? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Installation cancelled for cursor.${NC}"
            PLATFORMS=("${PLATFORMS[@]/cursor}")
        fi
    elif [ "$plat" = "codex" ] && [ -d "$TARGET_DIR/.agents/skills" ]; then
        echo -e "${YELLOW}Warning: .agents/skills directory already exists.${NC}"
        read -p "Overwrite existing skills? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Installation cancelled for codex.${NC}"
            PLATFORMS=("${PLATFORMS[@]/codex}")
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

# ═══════════════════════════════════════════════════════════════
# DISPLAY VERSION INFORMATION
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}                  ${GREEN}Claude AS Framework${NC}                       ${CYAN}║${NC}"
echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}  Version: ${YELLOW}$FRAMEWORK_VERSION${NC}                                     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Date: ${YELLOW}$FRAMEWORK_DATE${NC}                                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Format: ${YELLOW}MAJOR.FEATURE.DATABASE.ITERATION${NC}                 ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  $(echo $FRAMEWORK_VERSION | cut -d. -f1) - Major      (Breaking changes)                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  $(echo $FRAMEWORK_VERSION | cut -d. -f2) - Feature    (New features)                             ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  $(echo $FRAMEWORK_VERSION | cut -d. -f3) - Database   (Schema changes)                           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  $(echo $FRAMEWORK_VERSION | cut -d. -f4) - Iteration  (Patches/bug fixes)                        ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for existing installation and version (check first platform)
FIRST_PLAT="${PLATFORMS[0]}"
FIRST_PLAT_DIR=""
case "$FIRST_PLAT" in
    claude)  FIRST_PLAT_DIR=".claude" ;;
    copilot) FIRST_PLAT_DIR=".copilot" ;;
    codex)   FIRST_PLAT_DIR=".agents" ;;
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
# PHASE 1: Shared files (copied once, not per platform)
# ═══════════════════════════════════════════════════════════════
echo -e "${BLUE}Creating shared directory structure...${NC}"
mkdir -p "$TARGET_DIR/agents"
mkdir -p "$TARGET_DIR/genesis"
mkdir -p "$TARGET_DIR/docs/stories"
mkdir -p "$TARGET_DIR/memory_bank/knowledge"

# Copy shared agent modules (all platforms need these)
echo -e "${BLUE}Installing shared agent modules...${NC}"
cp -r "$SCRIPT_DIR/agents/"* "$TARGET_DIR/agents/"
SHARED_COUNT=$(ls -1 "$TARGET_DIR/agents/"*.md 2>/dev/null | wc -l)
echo -e "${GREEN}  ✓ Shared agent modules installed ($SHARED_COUNT modules)${NC}"

# Copy CLAUDE.md if it doesn't exist or user wants to overwrite
if [ -f "$TARGET_DIR/CLAUDE.md" ]; then
    echo -e "${YELLOW}  CLAUDE.md already exists.${NC}"
    read -p "  Overwrite? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
        echo -e "${GREEN}  ✓ CLAUDE.md updated${NC}"
    else
        echo -e "${YELLOW}  → Keeping existing CLAUDE.md${NC}"
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

# Declare associative arrays to store per-platform counts for summary
declare -A PLAT_SKILL_COUNT
declare -A PLAT_AGENT_COUNT
declare -A PLAT_RULE_COUNT
declare -A PLAT_HOOK_COUNT

install_platform() {
    local plat="$1"

    echo ""
    echo -e "${BLUE}── Installing platform: ${YELLOW}$plat${BLUE} ──${NC}"

    # Create directory structure
    echo -e "${BLUE}  Creating directory structure...${NC}"
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
        cursor)
            mkdir -p "$TARGET_DIR/.cursor/rules"
            ;;
    esac

    # Copy platform-specific files
    echo -e "${BLUE}  Installing agents and skills...${NC}"
    case "$plat" in
        claude)
            cp -r "$SCRIPT_DIR/.claude/commands/"* "$TARGET_DIR/.claude/commands/"
            PLAT_SKILL_COUNT[$plat]=$(ls -1 "$TARGET_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
            echo -e "${GREEN}    ✓ Claude skills installed (${PLAT_SKILL_COUNT[$plat]} skills)${NC}"

            # Deploy autonomous execution configuration (permission profile + hooks)
            if [ -f "$SCRIPT_DIR/.claude/settings.json" ]; then
                cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json"
                echo -e "${GREEN}    ✓ Permission profile installed (autonomous execution)${NC}"
            fi
            if [ -d "$SCRIPT_DIR/.claude/hooks" ]; then
                cp -r "$SCRIPT_DIR/.claude/hooks/"* "$TARGET_DIR/.claude/hooks/" 2>/dev/null || true
                chmod +x "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null || true
                PLAT_HOOK_COUNT[$plat]=$(ls -1 "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null | wc -l)
                echo -e "${GREEN}    ✓ Safety hooks installed (${PLAT_HOOK_COUNT[$plat]} hooks)${NC}"
            fi
            ;;
        copilot)
            cp -r "$SCRIPT_DIR/.copilot/custom-agents/"* "$TARGET_DIR/.copilot/custom-agents/"
            # Copy Copilot helper and workflow guide
            [ -f "$SCRIPT_DIR/.copilot/helper.sh" ] && cp "$SCRIPT_DIR/.copilot/helper.sh" "$TARGET_DIR/.copilot/"
            [ -f "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" ] && cp "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" "$TARGET_DIR/.copilot/"
            # Make helper executable
            [ -f "$TARGET_DIR/.copilot/helper.sh" ] && chmod +x "$TARGET_DIR/.copilot/helper.sh"

            PLAT_AGENT_COUNT[$plat]=$(ls -1 "$TARGET_DIR/.copilot/custom-agents/"*.md 2>/dev/null | wc -l)
            echo -e "${GREEN}    ✓ Copilot custom agents installed (${PLAT_AGENT_COUNT[$plat]} agents)${NC}"
            echo -e "${GREEN}    ✓ Copilot helper and workflow guide installed${NC}"
            ;;
        codex)
            cp -r "$SCRIPT_DIR/.agents/skills/"* "$TARGET_DIR/.agents/skills/"
            # Copy AGENTS.md to target
            [ -f "$SCRIPT_DIR/AGENTS.md" ] && cp "$SCRIPT_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
            PLAT_SKILL_COUNT[$plat]=$(find "$TARGET_DIR/.agents/skills" -name "SKILL.md" 2>/dev/null | wc -l)
            echo -e "${GREEN}    ✓ Codex skills installed (${PLAT_SKILL_COUNT[$plat]} skills)${NC}"
            ;;
        cursor)
            cp -r "$SCRIPT_DIR/.cursor/rules/"* "$TARGET_DIR/.cursor/rules/"
            PLAT_RULE_COUNT[$plat]=$(ls -1 "$TARGET_DIR/.cursor/rules/"*.md 2>/dev/null | wc -l)
            echo -e "${GREEN}    ✓ Cursor rules installed (${PLAT_RULE_COUNT[$plat]} rules)${NC}"
            ;;
    esac

    # Write framework version marker for this platform
    local version_dir=""
    case "$plat" in
        claude)  version_dir="$TARGET_DIR/.claude" ;;
        copilot) version_dir="$TARGET_DIR/.copilot" ;;
        codex)   version_dir="$TARGET_DIR/.agents" ;;
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
    install_platform "$plat"
done

# ═══════════════════════════════════════════════════════════════
# Auto-register project for updates
# ═══════════════════════════════════════════════════════════════
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
# Summary
# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║                  Installation Complete!                    ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project: ${TARGET_DIR}${NC}"
echo -e "${BLUE}Platforms: ${PLATFORMS[*]}${NC}"
echo ""
echo "Installed:"

# Per-platform summary lines
for plat in "${PLATFORMS[@]}"; do
    case "$plat" in
        claude)
            echo "  ├── .claude/commands/     (${PLAT_SKILL_COUNT[$plat]:-0} skills)"
            echo "  ├── .claude/hooks/        (safety validation hooks)"
            echo "  ├── .claude/settings.json (autonomous permission profile)"
            ;;
        copilot)
            echo "  ├── .copilot/custom-agents/ (${PLAT_AGENT_COUNT[$plat]:-0} agents)"
            ;;
        codex)
            echo "  ├── .agents/skills/       (${PLAT_SKILL_COUNT[$plat]:-0} skills)"
            echo "  ├── AGENTS.md"
            ;;
        cursor)
            echo "  ├── .cursor/rules/        (${PLAT_RULE_COUNT[$plat]:-0} rules)"
            ;;
    esac
done

# Shared files summary
echo "  ├── agents/               ($SHARED_COUNT shared modules)"
echo "  ├── genesis/              (PRD folder)"
echo "  │   └── TEMPLATE.md"
echo "  ├── docs/stories/         (story output)"
echo "  ├── memory_bank/knowledge/ (lessons learned)"
echo "  ├── CLAUDE.md"
echo "  ├── docs/ANTI_PATTERNS_BREADTH.md  (Security - wide coverage)"
echo "  └── docs/ANTI_PATTERNS_DEPTH.md    (Security - top 7 critical)"
echo ""

# ═══════════════════════════════════════════════════════════════
# Genesis workflow instructions (per platform)
# ═══════════════════════════════════════════════════════════════
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                   THE GENESIS WORKFLOW                    ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

for plat in "${PLATFORMS[@]}"; do
    case "$plat" in
        claude)
            echo -e "${CYAN}── Claude Code ──${NC}"
            echo ""
            echo -e "${YELLOW}Step 1: Create PRDs${NC}"
            echo "  /prd \"your feature idea\"     → Saved to genesis/"
            echo "  Or manually create in genesis/"
            echo ""
            echo -e "${YELLOW}Step 2: Implement${NC}"
            echo "  /go                           → Full implementation"
            echo ""
            echo -e "${GREEN}That's it. PRDs in genesis/ → /go → Production code.${NC}"
            echo ""
            echo -e "${YELLOW}Key Commands:${NC}"
            echo "  /go              - Implement all PRDs from genesis/"
            echo "  /go --validate   - Check PRDs are complete"
            echo "  /prd             - Create new PRD"
            echo "  /layer-check     - Validate three layers"
            echo "  /coder           - Ruthless implementation"
            echo "  /tester          - Brutal testing"
            echo "  /architect       - Architecture review"
            echo ""
            echo -e "${GREEN}Start now:${NC}"
            echo "  cd $TARGET_DIR"
            echo "  claude"
            echo "  > /prd \"Your feature idea\""
            echo "  > /go"
            echo ""
            ;;
        cursor)
            echo -e "${CYAN}── Cursor ──${NC}"
            echo ""
            echo -e "${YELLOW}Step 1: Create PRDs${NC}"
            echo "  Manually create in genesis/ folder"
            echo "  Use genesis/TEMPLATE.md as guide"
            echo ""
            echo -e "${YELLOW}Step 2: Implement${NC}"
            echo "  Use rules via Cursor AI chat"
            echo "  Rules are automatically loaded from .cursor/rules/"
            echo ""
            echo -e "${GREEN}PRDs in genesis/ → use rules in Cursor → Production code.${NC}"
            echo ""
            echo -e "${YELLOW}Available Rules:${NC}"
            echo "  go.md            - Project kickstart orchestrator"
            echo "  prd.md           - PRD creation"
            echo "  coder.md         - Ruthless implementation with TDD"
            echo "  tester.md        - Brutal testing"
            echo "  architect.md     - Architecture review"
            echo "  layer-check.md   - Three-layer validation"
            echo "  + more in .cursor/rules/"
            echo ""
            echo -e "${YELLOW}Usage in Cursor:${NC}"
            echo "  1. Open Cursor in this project"
            echo "  2. Rules are automatically available in chat"
            echo "  3. Reference rules by name: 'use go rule' or 'follow coder rule'"
            echo "  4. Rules provide structured workflows and commands"
            echo ""
            echo -e "${GREEN}Rules are automatically loaded by Cursor from .cursor/rules/${NC}"
            echo ""
            ;;
        codex)
            echo -e "${CYAN}── OpenAI Codex ──${NC}"
            echo ""
            echo -e "${YELLOW}Step 1: Create PRDs${NC}"
            echo "  \$go \"your feature idea\"        → Saved to genesis/"
            echo "  Or manually create in genesis/"
            echo ""
            echo -e "${YELLOW}Step 2: Implement${NC}"
            echo "  \$go                              → Full implementation"
            echo ""
            echo -e "${GREEN}That's it. PRDs in genesis/ → \$go → Production code.${NC}"
            echo ""
            echo -e "${YELLOW}Key Commands:${NC}"
            echo "  \$go              - Implement all PRDs from genesis/"
            echo "  \$go --validate   - Check PRDs are complete"
            echo "  \$prd             - Create new PRD"
            echo "  \$layer-check     - Validate three layers"
            echo "  \$coder           - Ruthless implementation"
            echo "  \$tester          - Brutal testing"
            echo "  \$architect       - Architecture review"
            echo ""
            echo -e "${GREEN}Start now:${NC}"
            echo "  cd $TARGET_DIR"
            echo "  codex"
            echo "  > \$prd \"Your feature idea\""
            echo "  > \$go"
            echo ""
            ;;
        copilot)
            echo -e "${CYAN}── GitHub Copilot CLI ──${NC}"
            echo ""
            echo -e "${YELLOW}Step 1: Create PRDs${NC}"
            echo "  Manually create in genesis/ folder"
            echo "  Use genesis/TEMPLATE.md as guide"
            echo ""
            echo -e "${YELLOW}Step 2: Implement${NC}"
            echo "  Use agents via task tool in Copilot CLI"
            echo ""
            echo -e "${GREEN}PRDs in genesis/ → invoke agents → Production code.${NC}"
            echo ""
            echo -e "${YELLOW}Available Agents:${NC}"
            echo "  coder            - Ruthless implementation with TDD"
            echo "  tester           - Brutal testing"
            echo "  architect        - Architecture review"
            echo "  evaluator        - BPSBS compliance"
            echo "  debugger         - Systematic debugging"
            echo "  docs             - Documentation"
            echo "  + more in .copilot/custom-agents/"
            echo ""
            echo -e "${YELLOW}Example Usage:${NC}"
            echo '  task('
            echo '    agent_type="task",'
            echo '    description="Implement auth service",'
            echo '    prompt="Read .copilot/custom-agents/coder.md and genesis/auth.md, then implement"'
            echo '  )'
            echo ""
            echo -e "${GREEN}See .copilot/custom-agents/README.md for details${NC}"
            echo ""
            ;;
    esac
done

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                   FRAMEWORK UPDATES                       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "To receive framework updates in this project:"
echo -e "  ${CYAN}$SCRIPT_DIR/update.sh $TARGET_DIR${NC}"
echo ""
echo "To update all registered projects:"
echo -e "  ${CYAN}$SCRIPT_DIR/update.sh --all${NC}"
echo ""
echo -e "${BLUE}Happy building!${NC}"

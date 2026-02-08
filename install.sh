#!/bin/bash

# Claude AS - Agents & Skills Installer
# Installs the Claude Code, GitHub Copilot CLI, or Cursor framework to a target project
#
# USAGE:
#   From your project directory:
#   ~/DevLab/IDEA/claude_as/install.sh
#   ~/DevLab/IDEA/claude_as/install.sh --platform copilot
#   ~/DevLab/IDEA/claude_as/install.sh --platform claude
#   ~/DevLab/IDEA/claude_as/install.sh --platform cursor
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
        if [ -d "$TARGET_DIR/.claude" ] || [ -d "$TARGET_DIR/.copilot" ] || [ -d "$TARGET_DIR/.cursor" ]; then
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

# Rollback function
rollback_installation() {
    if [ -z "$TARGET_DIR" ] || [[ "$TARGET_DIR" == "/" ]] || [[ "$TARGET_DIR" == "$HOME" ]]; then
        return
    fi

    echo -e "${YELLOW}Cleaning up partial installation...${NC}"

    # Remove created directories (only framework-specific subdirs)
    [ -d "$TARGET_DIR/.claude" ] && rm -rf "$TARGET_DIR/.claude" && echo "  Removed .claude/"
    [ -d "$TARGET_DIR/.copilot" ] && rm -rf "$TARGET_DIR/.copilot" && echo "  Removed .copilot/"
    [ -d "$TARGET_DIR/.cursor" ] && rm -rf "$TARGET_DIR/.cursor" && echo "  Removed .cursor/"
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
Platform: $PLATFORM
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
PLATFORM=""
TARGET_DIR="."
DEBUG=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --platform=*)
            PLATFORM="${1#*=}"
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
echo "║   Supports: Claude Code, GitHub Copilot CLI & Cursor      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Platform selection if not specified
if [ -z "$PLATFORM" ]; then
    echo -e "${YELLOW}Select your AI platform:${NC}"
    echo "  1) Claude Code"
    echo "  2) GitHub Copilot CLI"
    echo "  3) Cursor"
    echo ""
    read -p "Enter choice (1, 2, or 3): " -n 1 -r
    echo ""
    case $REPLY in
        1)
            PLATFORM="claude"
            ;;
        2)
            PLATFORM="copilot"
            ;;
        3)
            PLATFORM="cursor"
            ;;
        *)
            echo -e "${RED}Invalid choice. Exiting.${NC}"
            exit 1
            ;;
    esac
fi

# Normalize platform name
PLATFORM=$(echo "$PLATFORM" | tr '[:upper:]' '[:lower:]')
if [[ ! "$PLATFORM" =~ ^(claude|copilot|cursor)$ ]]; then
    log_error "Invalid platform specified" "Platform must be 'claude', 'copilot', or 'cursor'" "install.sh line $LINENO" "Use --platform=claude, --platform=copilot, or --platform=cursor"
    exit 2  # Invalid arguments
fi

echo -e "${GREEN}Platform: $PLATFORM${NC}"
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
        local remove_path="$TARGET_DIR/claude_as"
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

# Check if platform directory already exists
if [ "$PLATFORM" = "claude" ] && [ -d "$TARGET_DIR/.claude" ]; then
    echo -e "${YELLOW}Warning: .claude directory already exists.${NC}"
    read -p "Overwrite existing skills? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation cancelled.${NC}"
        exit 1
    fi
elif [ "$PLATFORM" = "copilot" ] && [ -d "$TARGET_DIR/.copilot" ]; then
    echo -e "${YELLOW}Warning: .copilot directory already exists.${NC}"
    read -p "Overwrite existing agents? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation cancelled.${NC}"
        exit 1
    fi
elif [ "$PLATFORM" = "cursor" ] && [ -d "$TARGET_DIR/.cursor" ]; then
    echo -e "${YELLOW}Warning: .cursor directory already exists.${NC}"
    read -p "Overwrite existing rules? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Installation cancelled.${NC}"
        exit 1
    fi
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

# Check for existing installation and version
if [ -f "$TARGET_DIR/.$PLATFORM/.framework-version" ]; then
    INSTALLED_VERSION=$(cat "$TARGET_DIR/.$PLATFORM/.framework-version" | tr -d '[:space:]')
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
        echo -e "  ${RED}⚠  Major version change detected!${NC}"
        echo -e "  ${YELLOW}This is a breaking change. Fresh install recommended.${NC}"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    elif [ "$INSTALLED_VERSION" != "$FRAMEWORK_VERSION" ]; then
        echo -e "  ${GREEN}✓${NC} This is an update (feature/patch/database)"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    else
        echo -e "  ${GREEN}✓${NC} Versions match (reinstalling)"
        echo -e "  ${BLUE}═══════════════════════════════════════════════════════════════${NC}"
        echo ""
    fi
fi

# Create directory structure based on platform
echo -e "${BLUE}Creating directory structure...${NC}"
if [ "$PLATFORM" = "claude" ]; then
    mkdir -p "$TARGET_DIR/.claude/commands"
    mkdir -p "$TARGET_DIR/.claude/hooks"
    mkdir -p "$TARGET_DIR/agents"
elif [ "$PLATFORM" = "copilot" ]; then
    mkdir -p "$TARGET_DIR/.copilot/custom-agents"
    mkdir -p "$TARGET_DIR/agents"
else
    mkdir -p "$TARGET_DIR/.cursor/rules"
    mkdir -p "$TARGET_DIR/agents"
fi
mkdir -p "$TARGET_DIR/genesis"
mkdir -p "$TARGET_DIR/docs/stories"

# Copy skills/agents based on platform
echo -e "${BLUE}Installing agents and skills...${NC}"
if [ "$PLATFORM" = "claude" ]; then
    cp -r "$SCRIPT_DIR/.claude/commands/"* "$TARGET_DIR/.claude/commands/"
    SKILL_COUNT=$(ls -1 "$TARGET_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
    echo -e "${GREEN}  ✓ Claude skills installed ($SKILL_COUNT skills)${NC}"

    # Deploy autonomous execution configuration (permission profile + hooks)
    if [ -f "$SCRIPT_DIR/.claude/settings.json" ]; then
        cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json"
        echo -e "${GREEN}  ✓ Permission profile installed (autonomous execution)${NC}"
    fi
    if [ -d "$SCRIPT_DIR/.claude/hooks" ]; then
        cp -r "$SCRIPT_DIR/.claude/hooks/"* "$TARGET_DIR/.claude/hooks/" 2>/dev/null || true
        chmod +x "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null || true
        HOOK_COUNT=$(ls -1 "$TARGET_DIR/.claude/hooks/"*.sh 2>/dev/null | wc -l)
        echo -e "${GREEN}  ✓ Safety hooks installed ($HOOK_COUNT hooks)${NC}"
    fi
elif [ "$PLATFORM" = "copilot" ]; then
    cp -r "$SCRIPT_DIR/.copilot/custom-agents/"* "$TARGET_DIR/.copilot/custom-agents/"
    # Copy Copilot helper and workflow guide
    [ -f "$SCRIPT_DIR/.copilot/helper.sh" ] && cp "$SCRIPT_DIR/.copilot/helper.sh" "$TARGET_DIR/.copilot/"
    [ -f "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" ] && cp "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" "$TARGET_DIR/.copilot/"
    # Make helper executable
    [ -f "$TARGET_DIR/.copilot/helper.sh" ] && chmod +x "$TARGET_DIR/.copilot/helper.sh"
    
    AGENT_COUNT=$(ls -1 "$TARGET_DIR/.copilot/custom-agents/"*.md 2>/dev/null | wc -l)
    echo -e "${GREEN}  ✓ Copilot custom agents installed ($AGENT_COUNT agents)${NC}"
    echo -e "${GREEN}  ✓ Copilot helper and workflow guide installed${NC}"
else
    cp -r "$SCRIPT_DIR/.cursor/rules/"* "$TARGET_DIR/.cursor/rules/"
    RULE_COUNT=$(ls -1 "$TARGET_DIR/.cursor/rules/"*.md 2>/dev/null | wc -l)
    echo -e "${GREEN}  ✓ Cursor rules installed ($RULE_COUNT rules)${NC}"
fi

# Copy shared agent modules (both platforms need these)
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

# Write framework version marker to target
if [ "$PLATFORM" = "claude" ]; then
    mkdir -p "$TARGET_DIR/.claude"
    echo "$FRAMEWORK_VERSION" > "$TARGET_DIR/.claude/.framework-version"
    echo "$FRAMEWORK_DATE" > "$TARGET_DIR/.claude/.framework-updated"
    echo "$PLATFORM" > "$TARGET_DIR/.claude/.framework-platform"
elif [ "$PLATFORM" = "copilot" ]; then
    mkdir -p "$TARGET_DIR/.copilot"
    echo "$FRAMEWORK_VERSION" > "$TARGET_DIR/.copilot/.framework-version"
    echo "$FRAMEWORK_DATE" > "$TARGET_DIR/.copilot/.framework-updated"
    echo "$PLATFORM" > "$TARGET_DIR/.copilot/.framework-platform"
else
    mkdir -p "$TARGET_DIR/.cursor"
    echo "$FRAMEWORK_VERSION" > "$TARGET_DIR/.cursor/.framework-version"
    echo "$FRAMEWORK_DATE" > "$TARGET_DIR/.cursor/.framework-updated"
    echo "$PLATFORM" > "$TARGET_DIR/.cursor/.framework-platform"
fi
echo -e "${GREEN}  ✓ Framework version: v$FRAMEWORK_VERSION (Platform: $PLATFORM)${NC}"

# Auto-register project for updates
REGISTRY_FILE="$SCRIPT_DIR/.project-registry"
if [ -f "$REGISTRY_FILE" ]; then
    if ! grep -q "^$TARGET_DIR$" "$REGISTRY_FILE" 2>/dev/null; then
        echo "$TARGET_DIR" >> "$REGISTRY_FILE"
    fi
else
    echo "$TARGET_DIR" >> "$REGISTRY_FILE"
fi
echo -e "${GREEN}  ✓ Registered for framework updates${NC}"

# Register in enhanced project registry with metadata
if [ -f "$SCRIPT_DIR/scripts/registry.sh" ] && [ -x "$SCRIPT_DIR/scripts/registry.sh" ]; then
    bash "$SCRIPT_DIR/scripts/registry.sh" register "$TARGET_DIR" --platform="$PLATFORM" 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║                  Installation Complete!                    ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project: ${TARGET_DIR}${NC}"
echo -e "${BLUE}Platform: ${PLATFORM}${NC}"
echo ""
echo "Installed:"
if [ "$PLATFORM" = "claude" ]; then
    echo "  ├── .claude/commands/     ($SKILL_COUNT skills)"
    echo "  ├── .claude/hooks/        (safety validation hooks)"
    echo "  ├── .claude/settings.json (autonomous permission profile)"
    echo "  ├── agents/               ($SHARED_COUNT shared modules)"
elif [ "$PLATFORM" = "copilot" ]; then
    echo "  ├── .copilot/custom-agents/ ($AGENT_COUNT agents)"
    echo "  ├── agents/                 ($SHARED_COUNT shared modules)"
else
    echo "  ├── .cursor/rules/        ($RULE_COUNT rules)"
    echo "  ├── agents/               ($SHARED_COUNT shared modules)"
fi
echo "  ├── genesis/              (PRD folder)"
echo "  │   └── TEMPLATE.md"
echo "  ├── docs/stories/         (story output)"
echo "  ├── CLAUDE.md"
echo "  ├── docs/ANTI_PATTERNS_BREADTH.md  (Security - wide coverage)"
echo "  └── docs/ANTI_PATTERNS_DEPTH.md    (Security - top 7 critical)"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                   THE GENESIS WORKFLOW                    ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
if [ "$PLATFORM" = "claude" ]; then
    echo -e "${YELLOW}Step 1: Create PRDs${NC}"
    echo "  /prd \"your feature idea\"     → Saved to genesis/"
    echo "  Or manually create in genesis/"
    echo ""
    echo -e "${YELLOW}Step 2: Implement${NC}"
    echo "  /go                           → Full implementation"
    echo ""
    echo -e "${GREEN}That's it. PRDs in genesis/ → /go → Production code.${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
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
elif [ "$PLATFORM" = "cursor" ]; then
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
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Available Rules:${NC}"
    echo "  go.md            - Project kickstart orchestrator"
    echo "  prd.md           - PRD creation"
    echo "  coder.md         - Ruthless implementation with TDD"
    echo "  tester.md        - Brutal testing"
    echo "  architect.md     - Architecture review"
    echo "  layer-check.md   - Three-layer validation"
    echo "  + 16 more in .cursor/rules/"
    echo ""
    echo -e "${YELLOW}Usage in Cursor:${NC}"
    echo "  1. Open Cursor in this project"
    echo "  2. Rules are automatically available in chat"
    echo "  3. Reference rules by name: 'use go rule' or 'follow coder rule'"
    echo "  4. Rules provide structured workflows and commands"
    echo ""
    echo -e "${GREEN}Rules are automatically loaded by Cursor from .cursor/rules/${NC}"
else
    echo -e "${YELLOW}Step 1: Create PRDs${NC}"
    echo "  Manually create in genesis/ folder"
    echo "  Use genesis/TEMPLATE.md as guide"
    echo ""
    echo -e "${YELLOW}Step 2: Implement${NC}"
    echo "  Use agents via task tool in Copilot CLI"
    echo ""
    echo -e "${GREEN}PRDs in genesis/ → invoke agents → Production code.${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Available Agents:${NC}"
    echo "  coder            - Ruthless implementation with TDD"
    echo "  tester           - Brutal testing"
    echo "  architect        - Architecture review"
    echo "  evaluator        - BPSBS compliance"
    echo "  debugger         - Systematic debugging"
    echo "  docs             - Documentation"
    echo "  + 16 more in .copilot/custom-agents/"
    echo ""
    echo -e "${YELLOW}Example Usage:${NC}"
    echo '  task('
    echo '    agent_type="task",'
    echo '    description="Implement auth service",'
    echo '    prompt="Read .copilot/custom-agents/coder.md and genesis/auth.md, then implement"'
    echo '  )'
    echo ""
    echo -e "${GREEN}See .copilot/custom-agents/README.md for details${NC}"
fi
echo ""
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

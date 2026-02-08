#!/bin/bash

# Claude AS - Framework Update Script
# Updates existing projects with the latest framework version
#
# USAGE:
#   ./update.sh .                           # Update current directory
#   ./update.sh /path/to/project            # Update single project
#   ./update.sh --all                       # Update all registered projects
#   ./update.sh --register .                # Register current directory
#   ./update.sh --register /path/to/project # Register a project for updates
#   ./update.sh --scan /path                # Find and register claude_as projects
#   ./update.sh --list                      # List registered projects
#   ./update.sh --diff /path/to/project    # Show what would change

set -e
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Get the directory where this script lives (framework source)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY_FILE="$SCRIPT_DIR/.project-registry"
VERSION_FILE="$SCRIPT_DIR/.version"
CHANGELOG_FILE="$SCRIPT_DIR/CHANGELOG.md"

# Read framework version from .version file (single source of truth)
if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}Error: .version file not found at $VERSION_FILE${NC}"
    exit 1
fi
FRAMEWORK_VERSION="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
FRAMEWORK_DATE="2026-02-05"  # Update this when releasing new version

# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

print_header() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           Claude AS - Framework Updater                   ║"
    echo "║                                                           ║"
    echo "║   Version: $FRAMEWORK_VERSION ($FRAMEWORK_DATE)                       ║"
    echo "║   Format: MAJOR.FEATURE.DATABASE.ITERATION                ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

is_valid_project() {
    local project_dir="$1"
    # A valid Claude AS project has at least one platform folder
    if [ -d "$project_dir/.claude" ] || [ -d "$project_dir/.copilot" ] || [ -d "$project_dir/.cursor" ]; then
        return 0
    fi
    return 1
}

get_project_version() {
    local project_dir="$1"
    # Check all possible platform locations
    local version_file=""
    if [ -f "$project_dir/.claude/.framework-version" ]; then
        version_file="$project_dir/.claude/.framework-version"
    elif [ -f "$project_dir/.copilot/.framework-version" ]; then
        version_file="$project_dir/.copilot/.framework-version"
    elif [ -f "$project_dir/.cursor/.framework-version" ]; then
        version_file="$project_dir/.cursor/.framework-version"
    fi
    
    if [ -n "$version_file" ] && [ -f "$version_file" ]; then
        cat "$version_file"
    else
        echo "0.0.0.0"
    fi
}

set_project_version() {
    local project_dir="$1"
    # Detect platform and set version accordingly
    if [ -d "$project_dir/.claude" ]; then
        mkdir -p "$project_dir/.claude"
        echo "$FRAMEWORK_VERSION" > "$project_dir/.claude/.framework-version"
        echo "$FRAMEWORK_DATE" > "$project_dir/.claude/.framework-updated"
    elif [ -d "$project_dir/.copilot" ]; then
        mkdir -p "$project_dir/.copilot"
        echo "$FRAMEWORK_VERSION" > "$project_dir/.copilot/.framework-version"
        echo "$FRAMEWORK_DATE" > "$project_dir/.copilot/.framework-updated"
    elif [ -d "$project_dir/.cursor" ]; then
        mkdir -p "$project_dir/.cursor"
        echo "$FRAMEWORK_VERSION" > "$project_dir/.cursor/.framework-version"
        echo "$FRAMEWORK_DATE" > "$project_dir/.cursor/.framework-updated"
    else
        # Default to .claude if no platform detected
        mkdir -p "$project_dir/.claude"
        echo "$FRAMEWORK_VERSION" > "$project_dir/.claude/.framework-version"
        echo "$FRAMEWORK_DATE" > "$project_dir/.claude/.framework-updated"
    fi
}

# Detect project platform
detect_platform() {
    local project_dir="$1"
    if [ -d "$project_dir/.claude" ]; then
        echo "claude"
    elif [ -d "$project_dir/.copilot" ]; then
        echo "copilot"
    elif [ -d "$project_dir/.cursor" ]; then
        echo "cursor"
    else
        echo "unknown"
    fi
}

backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        local backup="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$file" "$backup"
        echo "$backup"
    fi
}

# ═══════════════════════════════════════════════════════════════
# CLAUDE.md / CLAUDE-SUMMARY.md SYNC VALIDATION
# ═══════════════════════════════════════════════════════════════

validate_summary_sync() {
    local project_dir="$1"
    local claude_md="$project_dir/CLAUDE.md"
    local summary_md="$project_dir/CLAUDE-SUMMARY.md"

    echo -e "${YELLOW}Validating CLAUDE.md/Summary sync...${NC}"

    if [ ! -f "$claude_md" ]; then
        echo -e "  ${RED}CLAUDE.md not found${NC}"
        return 1
    fi

    if [ ! -f "$summary_md" ]; then
        echo -e "  ${YELLOW}CLAUDE-SUMMARY.md not found - will be created${NC}"
        return 0
    fi

    # Check key sections exist in summary that are in full doc
    local missing_sections=()

    # Check for critical sections in summary
    if grep -q "## Zero Tolerance" "$claude_md" && ! grep -q "Zero Tolerance\|Banned Patterns" "$summary_md"; then
        missing_sections+=("Zero Tolerance / Banned Patterns")
    fi

    if grep -q "## Three-Layer" "$claude_md" && ! grep -q "Three-Layer\|Layer" "$summary_md"; then
        missing_sections+=("Three-Layer Validation")
    fi

    if grep -q "## Security" "$claude_md" && ! grep -q "Security" "$summary_md"; then
        missing_sections+=("Security Requirements")
    fi

    if [ ${#missing_sections[@]} -gt 0 ]; then
        echo -e "  ${YELLOW}Warning: Summary may be out of sync with CLAUDE.md${NC}"
        echo -e "  ${YELLOW}Missing sections in summary:${NC}"
        for section in "${missing_sections[@]}"; do
            echo -e "    - $section"
        done
        echo ""
        echo -e "  ${CYAN}Recommendation: Update CLAUDE-SUMMARY.md with key sections from CLAUDE.md${NC}"
        return 2
    fi

    # Check file age difference
    local claude_mtime=$(stat -c %Y "$claude_md" 2>/dev/null || stat -f %m "$claude_md" 2>/dev/null)
    local summary_mtime=$(stat -c %Y "$summary_md" 2>/dev/null || stat -f %m "$summary_md" 2>/dev/null)

    if [ -n "$claude_mtime" ] && [ -n "$summary_mtime" ]; then
        local diff=$((claude_mtime - summary_mtime))
        if [ $diff -gt 604800 ]; then  # 7 days in seconds
            echo -e "  ${YELLOW}Warning: CLAUDE.md is more than 7 days newer than CLAUDE-SUMMARY.md${NC}"
            echo -e "  ${CYAN}Consider regenerating the summary${NC}"
        fi
    fi

    echo -e "  ${GREEN}Sync validation passed${NC}"
    return 0
}

generate_summary_from_claude() {
    local project_dir="$1"
    local claude_md="$project_dir/CLAUDE.md"
    local summary_md="$project_dir/CLAUDE-SUMMARY.md"

    if [ ! -f "$claude_md" ]; then
        echo -e "${RED}CLAUDE.md not found${NC}"
        return 1
    fi

    echo -e "${YELLOW}Generating CLAUDE-SUMMARY.md from CLAUDE.md...${NC}"

    # This is a simplified extraction - in practice, use the framework's summary template
    # Copy the summary from the framework source
    if [ -f "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" ]; then
        cp "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" "$summary_md"
        echo -e "  ${GREEN}Summary updated from framework template${NC}"
    else
        echo -e "  ${YELLOW}No summary template found in framework${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# REGISTRY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

register_project() {
    local project_dir="$1"

    # Handle "." for current directory
    if [ "$project_dir" = "." ]; then
        project_dir="$(pwd)"
    else
        # Convert to absolute path
        project_dir="$(cd "$project_dir" && pwd)"
    fi

    # Check if valid project
    if ! is_valid_project "$project_dir"; then
        echo -e "${RED}Error: '$project_dir' is not a Claude AS project.${NC}"
        echo "Run install.sh first to set up the framework."
        exit 1
    fi

    # Check if already registered
    if [ -f "$REGISTRY_FILE" ] && grep -q "^$project_dir$" "$REGISTRY_FILE"; then
        echo -e "${YELLOW}Project already registered: $project_dir${NC}"
        return 0
    fi

    # Add to registry
    echo "$project_dir" >> "$REGISTRY_FILE"
    echo -e "${GREEN}Registered: $project_dir${NC}"
}

unregister_project() {
    local project_dir="$1"
    project_dir="$(cd "$project_dir" 2>/dev/null && pwd)" || project_dir="$1"

    if [ -f "$REGISTRY_FILE" ]; then
        grep -v "^$project_dir$" "$REGISTRY_FILE" > "$REGISTRY_FILE.tmp" || true
        mv "$REGISTRY_FILE.tmp" "$REGISTRY_FILE"
        echo -e "${GREEN}Unregistered: $project_dir${NC}"
    fi
}

list_projects() {
    echo -e "${BLUE}Registered Projects:${NC}"
    echo ""

    if [ ! -f "$REGISTRY_FILE" ] || [ ! -s "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}  No projects registered.${NC}"
        echo ""
        echo "Register a project with:"
        echo -e "  ${CYAN}$0 --register /path/to/project${NC}"
        echo -e "  ${CYAN}$0 --register .${NC}  (current directory)"
        echo ""
        echo "Or scan for existing projects:"
        echo -e "  ${CYAN}$0 --scan /path/to/search${NC}"
        return
    fi

    local count=0
    while IFS= read -r project_dir; do
        if [ -n "$project_dir" ]; then
            count=$((count + 1))
            local version=$(get_project_version "$project_dir")
            local status=""

            if [ ! -d "$project_dir" ]; then
                status="${RED}[NOT FOUND]${NC}"
            elif [ "$version" = "$FRAMEWORK_VERSION" ]; then
                status="${GREEN}[UP TO DATE]${NC}"
            else
                status="${YELLOW}[v$version → v$FRAMEWORK_VERSION]${NC}"
            fi

            echo -e "  $count. $project_dir $status"
        fi
    done < "$REGISTRY_FILE"

    echo ""
    echo -e "Framework version: ${CYAN}$FRAMEWORK_VERSION${NC}"
}

# ═══════════════════════════════════════════════════════════════
# SCAN FUNCTION - Find existing claude_as projects
# ═══════════════════════════════════════════════════════════════

scan_projects() {
    local search_path="${1:-.}"
    local max_depth="${2:-3}"

    # Convert to absolute path
    search_path="$(cd "$search_path" && pwd)"

    echo -e "${BLUE}Scanning for Claude AS projects in: $search_path${NC}"
    echo -e "${BLUE}Max depth: $max_depth${NC}"
    echo ""

    local found=0
    local registered=0

    # Find directories with .claude, .copilot, .cursor folders or CLAUDE.md
    while IFS= read -r -d '' project_dir; do
        # Get parent directory (the actual project)
        if [[ "$project_dir" == *"/.claude" ]] || [[ "$project_dir" == *"/.copilot" ]] || [[ "$project_dir" == *"/.cursor" ]]; then
            project_dir="$(dirname "$project_dir")"
        elif [[ "$project_dir" == *"/CLAUDE.md" ]]; then
            project_dir="$(dirname "$project_dir")"
        fi

        # Skip the framework source itself
        if [ "$project_dir" = "$SCRIPT_DIR" ]; then
            continue
        fi

        # Check if valid project
        if is_valid_project "$project_dir"; then
            found=$((found + 1))
            local version=$(get_project_version "$project_dir")

            # Check if already registered
            local already_registered=false
            if [ -f "$REGISTRY_FILE" ] && grep -q "^$project_dir$" "$REGISTRY_FILE"; then
                already_registered=true
            fi

            if [ "$already_registered" = true ]; then
                echo -e "  ${GREEN}✓${NC} $project_dir ${BLUE}[already registered]${NC}"
            else
                echo -e "  ${YELLOW}+${NC} $project_dir ${YELLOW}[v$version - not registered]${NC}"

                # Ask to register
                read -p "    Register this project? [Y/n]: " -n 1 -r
                echo ""
                if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                    echo "$project_dir" >> "$REGISTRY_FILE"
                    echo -e "    ${GREEN}Registered!${NC}"
                    registered=$((registered + 1))
                fi
            fi
        fi
    done < <(find "$search_path" -maxdepth "$max_depth" \( -type d \( -name ".claude" -o -name ".copilot" -o -name ".cursor" \) -o -type f -name "CLAUDE.md" \) -print0 2>/dev/null)

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "  Found: $found project(s)"
    echo -e "  Newly registered: ${GREEN}$registered${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"

    if [ $found -eq 0 ]; then
        echo ""
        echo -e "${YELLOW}No Claude AS projects found.${NC}"
        echo "Make sure the projects have .claude/, .copilot/, or .cursor/ folder or CLAUDE.md file."
    fi
}

# Resolve path (handle . for current directory)
resolve_path() {
    local path="$1"
    if [ "$path" = "." ]; then
        pwd
    elif [ -d "$path" ]; then
        cd "$path" && pwd
    else
        echo "$path"
    fi
}

# ═══════════════════════════════════════════════════════════════
# DIFF FUNCTION
# ═══════════════════════════════════════════════════════════════

show_diff() {
    local project_dir="$1"
    project_dir="$(cd "$project_dir" && pwd)"

    echo -e "${BLUE}Comparing: $project_dir${NC}"
    echo -e "${BLUE}With framework: $SCRIPT_DIR${NC}"
    echo ""

    local has_changes=false

    # Check CLAUDE.md
    if [ -f "$project_dir/CLAUDE.md" ]; then
        if ! diff -q "$SCRIPT_DIR/CLAUDE.md" "$project_dir/CLAUDE.md" > /dev/null 2>&1; then
            echo -e "${YELLOW}CLAUDE.md differs:${NC}"
            diff --color=auto -u "$project_dir/CLAUDE.md" "$SCRIPT_DIR/CLAUDE.md" | head -50 || true
            echo "..."
            has_changes=true
        fi
    else
        echo -e "${YELLOW}CLAUDE.md: ${RED}MISSING${NC}"
        has_changes=true
    fi

    # Check skills/rules/agents (platform-specific)
    echo ""
    local platform=$(detect_platform "$project_dir")
    
    if [ "$platform" = "claude" ]; then
        echo -e "${BLUE}Claude skills comparison:${NC}"
        for skill in "$SCRIPT_DIR/.claude/commands/"*.md; do
            local skill_name=$(basename "$skill")
            local project_skill="$project_dir/.claude/commands/$skill_name"
            
            if [ ! -f "$project_skill" ]; then
                echo -e "  ${GREEN}+ $skill_name${NC} (new)"
                has_changes=true
            elif ! diff -q "$skill" "$project_skill" > /dev/null 2>&1; then
                echo -e "  ${YELLOW}~ $skill_name${NC} (modified)"
                has_changes=true
            fi
        done
        
        if [ -d "$project_dir/.claude/commands" ]; then
            for project_skill in "$project_dir/.claude/commands/"*.md; do
                if [ -f "$project_skill" ]; then
                    local skill_name=$(basename "$project_skill")
                    if [ ! -f "$SCRIPT_DIR/.claude/commands/$skill_name" ]; then
                        echo -e "  ${RED}- $skill_name${NC} (will be kept, not in framework)"
                    fi
                fi
            done
        fi
    elif [ "$platform" = "copilot" ]; then
        echo -e "${BLUE}Copilot agents comparison:${NC}"
        for agent in "$SCRIPT_DIR/.copilot/custom-agents/"*.md; do
            local agent_name=$(basename "$agent")
            local project_agent="$project_dir/.copilot/custom-agents/$agent_name"
            
            if [ ! -f "$project_agent" ]; then
                echo -e "  ${GREEN}+ $agent_name${NC} (new)"
                has_changes=true
            elif ! diff -q "$agent" "$project_agent" > /dev/null 2>&1; then
                echo -e "  ${YELLOW}~ $agent_name${NC} (modified)"
                has_changes=true
            fi
        done
    elif [ "$platform" = "cursor" ]; then
        echo -e "${BLUE}Cursor rules comparison:${NC}"
        for rule in "$SCRIPT_DIR/.cursor/rules/"*.md; do
            local rule_name=$(basename "$rule")
            local project_rule="$project_dir/.cursor/rules/$rule_name"
            
            if [ ! -f "$project_rule" ]; then
                echo -e "  ${GREEN}+ $rule_name${NC} (new)"
                has_changes=true
            elif ! diff -q "$rule" "$project_rule" > /dev/null 2>&1; then
                echo -e "  ${YELLOW}~ $rule_name${NC} (modified)"
                has_changes=true
            fi
        done
    fi

    # Check agents
    echo ""
    echo -e "${BLUE}Agents comparison:${NC}"
    if [ -d "$SCRIPT_DIR/agents" ]; then
        for agent in "$SCRIPT_DIR/agents/"*.md; do
            local agent_name=$(basename "$agent")
            local project_agent="$project_dir/agents/$agent_name"

            if [ ! -f "$project_agent" ]; then
                echo -e "  ${GREEN}+ $agent_name${NC} (new)"
                has_changes=true
            elif ! diff -q "$agent" "$project_agent" > /dev/null 2>&1; then
                echo -e "  ${YELLOW}~ $agent_name${NC} (modified)"
                has_changes=true
            fi
        done
    fi

    # Check CLAUDE-SUMMARY.md
    echo ""
    if [ -f "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" ]; then
        if [ ! -f "$project_dir/CLAUDE-SUMMARY.md" ]; then
            echo -e "${YELLOW}CLAUDE-SUMMARY.md: ${GREEN}NEW (will be added)${NC}"
            has_changes=true
        elif ! diff -q "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" "$project_dir/CLAUDE-SUMMARY.md" > /dev/null 2>&1; then
            echo -e "${YELLOW}CLAUDE-SUMMARY.md: modified${NC}"
            has_changes=true
        fi
    fi

    if [ "$has_changes" = false ]; then
        echo -e "${GREEN}No changes detected. Project is up to date.${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# UPDATE FUNCTION
# ═══════════════════════════════════════════════════════════════

update_project() {
    local project_dir="$1"
    local force="${2:-false}"

    # Handle "." for current directory
    if [ "$project_dir" = "." ]; then
        project_dir="$(pwd)"
    elif [ ! -d "$project_dir" ]; then
        echo -e "${RED}Error: Directory not found: $project_dir${NC}"
        return 1
    else
        project_dir="$(cd "$project_dir" && pwd)"
    fi

    # Check if it's a valid project
    if ! is_valid_project "$project_dir"; then
        echo -e "${RED}Error: '$project_dir' is not a Claude AS project.${NC}"
        echo "Run install.sh first to set up the framework."
        return 1
    fi

    # Get current version
    local current_version=$(get_project_version "$project_dir")

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Updating: ${NC}$project_dir"
    echo -e "${BLUE}Current:  ${NC}v$current_version"
    echo -e "${BLUE}Latest:   ${NC}v$FRAMEWORK_VERSION"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

    # Check if already up to date
    if [ "$current_version" = "$FRAMEWORK_VERSION" ] && [ "$force" != "true" ]; then
        echo -e "${GREEN}Already up to date.${NC}"
        return 0
    fi

    # Create backup directory
    local backup_dir="$project_dir/.claude/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"

    # ─────────────────────────────────────────────────────────────
    # Update Skills
    # ─────────────────────────────────────────────────────────────
    # ─────────────────────────────────────────────────────────────
    # Update Skills/Rules/Agents (platform-specific)
    # ─────────────────────────────────────────────────────────────
    echo ""
    local platform=$(detect_platform "$project_dir")
    
    if [ "$platform" = "claude" ]; then
        echo -e "${YELLOW}Updating Claude skills...${NC}"
        mkdir -p "$project_dir/.claude/commands"
        
        local skills_added=0
        local skills_updated=0
        
        for skill in "$SCRIPT_DIR/.claude/commands/"*.md; do
            if [ -f "$skill" ]; then
                local skill_name=$(basename "$skill")
                local target="$project_dir/.claude/commands/$skill_name"
                
                if [ ! -f "$target" ]; then
                    cp "$skill" "$target"
                    echo -e "  ${GREEN}+ Added: $skill_name${NC}"
                    skills_added=$((skills_added + 1))
                elif ! diff -q "$skill" "$target" > /dev/null 2>&1; then
                    cp "$target" "$backup_dir/$skill_name"
                    cp "$skill" "$target"
                    echo -e "  ${CYAN}↑ Updated: $skill_name${NC}"
                    skills_updated=$((skills_updated + 1))
                fi
            fi
        done
        
        if [ $skills_added -eq 0 ] && [ $skills_updated -eq 0 ]; then
            echo -e "  ${GREEN}All skills up to date${NC}"
        else
            echo -e "  ${GREEN}$skills_added added, $skills_updated updated${NC}"
        fi
    elif [ "$platform" = "copilot" ]; then
        echo -e "${YELLOW}Updating Copilot agents...${NC}"
        mkdir -p "$project_dir/.copilot/custom-agents"
        
        local agents_added=0
        local agents_updated=0
        
        for agent in "$SCRIPT_DIR/.copilot/custom-agents/"*.md; do
            if [ -f "$agent" ]; then
                local agent_name=$(basename "$agent")
                local target="$project_dir/.copilot/custom-agents/$agent_name"
                
                if [ ! -f "$target" ]; then
                    cp "$agent" "$target"
                    echo -e "  ${GREEN}+ Added: $agent_name${NC}"
                    agents_added=$((agents_added + 1))
                elif ! diff -q "$agent" "$target" > /dev/null 2>&1; then
                    cp "$target" "$backup_dir/$agent_name"
                    cp "$agent" "$target"
                    echo -e "  ${CYAN}↑ Updated: $agent_name${NC}"
                    agents_updated=$((agents_updated + 1))
                fi
            fi
        done
        
        # Update helper and workflow guide
        [ -f "$SCRIPT_DIR/.copilot/helper.sh" ] && cp "$SCRIPT_DIR/.copilot/helper.sh" "$project_dir/.copilot/" && chmod +x "$project_dir/.copilot/helper.sh"
        [ -f "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" ] && cp "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" "$project_dir/.copilot/"
        
        if [ $agents_added -eq 0 ] && [ $agents_updated -eq 0 ]; then
            echo -e "  ${GREEN}All agents up to date${NC}"
        else
            echo -e "  ${GREEN}$agents_added added, $agents_updated updated${NC}"
        fi
    elif [ "$platform" = "cursor" ]; then
        echo -e "${YELLOW}Updating Cursor rules...${NC}"
        mkdir -p "$project_dir/.cursor/rules"
        
        local rules_added=0
        local rules_updated=0
        
        for rule in "$SCRIPT_DIR/.cursor/rules/"*.md; do
            if [ -f "$rule" ]; then
                local rule_name=$(basename "$rule")
                local target="$project_dir/.cursor/rules/$rule_name"
                
                if [ ! -f "$target" ]; then
                    cp "$rule" "$target"
                    echo -e "  ${GREEN}+ Added: $rule_name${NC}"
                    rules_added=$((rules_added + 1))
                elif ! diff -q "$rule" "$target" > /dev/null 2>&1; then
                    cp "$target" "$backup_dir/$rule_name"
                    cp "$rule" "$target"
                    echo -e "  ${CYAN}↑ Updated: $rule_name${NC}"
                    rules_updated=$((rules_updated + 1))
                fi
            fi
        done
        
        if [ $rules_added -eq 0 ] && [ $rules_updated -eq 0 ]; then
            echo -e "  ${GREEN}All rules up to date${NC}"
        else
            echo -e "  ${GREEN}$rules_added added, $rules_updated updated${NC}"
        fi
    fi

    # ─────────────────────────────────────────────────────────────
    # Update Agents
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Updating agents...${NC}"
    mkdir -p "$project_dir/agents"

    local agents_added=0
    local agents_updated=0

    if [ -d "$SCRIPT_DIR/agents" ]; then
        for agent in "$SCRIPT_DIR/agents/"*.md; do
            if [ -f "$agent" ]; then
                local agent_name=$(basename "$agent")
                local target="$project_dir/agents/$agent_name"

                if [ ! -f "$target" ]; then
                    cp "$agent" "$target"
                    echo -e "  ${GREEN}+ Added: $agent_name${NC}"
                    agents_added=$((agents_added + 1))
                elif ! diff -q "$agent" "$target" > /dev/null 2>&1; then
                    # Backup old version
                    cp "$target" "$backup_dir/$agent_name"
                    cp "$agent" "$target"
                    echo -e "  ${CYAN}↑ Updated: $agent_name${NC}"
                    agents_updated=$((agents_updated + 1))
                fi
            fi
        done
    fi

    if [ $agents_added -eq 0 ] && [ $agents_updated -eq 0 ]; then
        echo -e "  ${GREEN}All agents up to date${NC}"
    else
        echo -e "  ${GREEN}$agents_added added, $agents_updated updated${NC}"
    fi

    # ─────────────────────────────────────────────────────────────
    # Update CLAUDE-SUMMARY.md (new in v1.2.0)
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Updating CLAUDE-SUMMARY.md...${NC}"

    if [ -f "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" ]; then
        if [ ! -f "$project_dir/CLAUDE-SUMMARY.md" ]; then
            cp "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" "$project_dir/CLAUDE-SUMMARY.md"
            echo -e "  ${GREEN}+ Added: CLAUDE-SUMMARY.md (new in v1.2.0)${NC}"
        elif ! diff -q "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" "$project_dir/CLAUDE-SUMMARY.md" > /dev/null 2>&1; then
            cp "$project_dir/CLAUDE-SUMMARY.md" "$backup_dir/CLAUDE-SUMMARY.md"
            cp "$SCRIPT_DIR/docs/CLAUDE-SUMMARY.md" "$project_dir/CLAUDE-SUMMARY.md"
            echo -e "  ${CYAN}↑ Updated: CLAUDE-SUMMARY.md${NC}"
        else
            echo -e "  ${GREEN}CLAUDE-SUMMARY.md up to date${NC}"
        fi
    fi

    # ─────────────────────────────────────────────────────────────
    # Update CLAUDE.md
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Updating CLAUDE.md...${NC}"

    if [ -f "$project_dir/CLAUDE.md" ]; then
        if ! diff -q "$SCRIPT_DIR/CLAUDE.md" "$project_dir/CLAUDE.md" > /dev/null 2>&1; then
            # Backup existing
            cp "$project_dir/CLAUDE.md" "$backup_dir/CLAUDE.md"

            echo -e "  ${YELLOW}CLAUDE.md has local modifications.${NC}"
            echo ""
            echo "  Options:"
            echo "    1) Overwrite with latest (backup saved)"
            echo "    2) Keep current version"
            echo "    3) Save latest as CLAUDE.md.new for manual merge"
            echo ""
            read -p "  Choose [1/2/3]: " -n 1 -r
            echo ""

            case $REPLY in
                1)
                    cp "$SCRIPT_DIR/CLAUDE.md" "$project_dir/CLAUDE.md"
                    echo -e "  ${GREEN}✓ CLAUDE.md overwritten (backup: $backup_dir/CLAUDE.md)${NC}"
                    ;;
                2)
                    echo -e "  ${YELLOW}→ Keeping current CLAUDE.md${NC}"
                    ;;
                3)
                    cp "$SCRIPT_DIR/CLAUDE.md" "$project_dir/CLAUDE.md.new"
                    echo -e "  ${CYAN}→ Saved as CLAUDE.md.new - merge manually${NC}"
                    ;;
                *)
                    echo -e "  ${YELLOW}→ Keeping current CLAUDE.md${NC}"
                    ;;
            esac
        else
            echo -e "  ${GREEN}CLAUDE.md already up to date${NC}"
        fi
    else
        cp "$SCRIPT_DIR/CLAUDE.md" "$project_dir/CLAUDE.md"
        echo -e "  ${GREEN}✓ CLAUDE.md installed${NC}"
    fi

    # ─────────────────────────────────────────────────────────────
    # Update PRD Template
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Updating templates...${NC}"

    mkdir -p "$project_dir/genesis"
    if [ -f "$SCRIPT_DIR/genesis/TEMPLATE.md" ]; then
        if [ -f "$project_dir/genesis/TEMPLATE.md" ]; then
            if ! diff -q "$SCRIPT_DIR/genesis/TEMPLATE.md" "$project_dir/genesis/TEMPLATE.md" > /dev/null 2>&1; then
                cp "$project_dir/genesis/TEMPLATE.md" "$backup_dir/TEMPLATE.md"
                cp "$SCRIPT_DIR/genesis/TEMPLATE.md" "$project_dir/genesis/TEMPLATE.md"
                echo -e "  ${CYAN}↑ Updated: genesis/TEMPLATE.md${NC}"
            else
                echo -e "  ${GREEN}genesis/TEMPLATE.md up to date${NC}"
            fi
        else
            cp "$SCRIPT_DIR/genesis/TEMPLATE.md" "$project_dir/genesis/TEMPLATE.md"
            echo -e "  ${GREEN}+ Added: genesis/TEMPLATE.md${NC}"
        fi
    fi

    # Update PRD schema (new in v1.3.0)
    if [ -f "$SCRIPT_DIR/genesis/.schema.json" ]; then
        if [ ! -f "$project_dir/genesis/.schema.json" ]; then
            cp "$SCRIPT_DIR/genesis/.schema.json" "$project_dir/genesis/.schema.json"
            echo -e "  ${GREEN}+ Added: genesis/.schema.json (PRD validation schema)${NC}"
        elif ! diff -q "$SCRIPT_DIR/genesis/.schema.json" "$project_dir/genesis/.schema.json" > /dev/null 2>&1; then
            cp "$SCRIPT_DIR/genesis/.schema.json" "$project_dir/genesis/.schema.json"
            echo -e "  ${CYAN}↑ Updated: genesis/.schema.json${NC}"
        fi
    fi

    # ─────────────────────────────────────────────────────────────
    # Validate CLAUDE.md / Summary sync
    # ─────────────────────────────────────────────────────────────
    echo ""
    validate_summary_sync "$project_dir" || true

    # ─────────────────────────────────────────────────────────────
    # Update bpsbs.md
    # ─────────────────────────────────────────────────────────────
    if [ -f "$SCRIPT_DIR/bpsbs.md" ]; then
        if [ ! -f "$project_dir/bpsbs.md" ]; then
            cp "$SCRIPT_DIR/bpsbs.md" "$project_dir/bpsbs.md"
            echo -e "  ${GREEN}+ Added: bpsbs.md${NC}"
        elif ! diff -q "$SCRIPT_DIR/bpsbs.md" "$project_dir/bpsbs.md" > /dev/null 2>&1; then
            cp "$project_dir/bpsbs.md" "$backup_dir/bpsbs.md"
            cp "$SCRIPT_DIR/bpsbs.md" "$project_dir/bpsbs.md"
            echo -e "  ${CYAN}↑ Updated: bpsbs.md${NC}"
        fi
    fi

    # ─────────────────────────────────────────────────────────────
    # Update Security Anti-Pattern Documents (new in v1.1.0)
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Updating security anti-patterns...${NC}"
    
    # Update ANTI_PATTERNS_BREADTH.md (now in docs/)
    if [ -f "$SCRIPT_DIR/docs/ANTI_PATTERNS_BREADTH.md" ]; then
        mkdir -p "$project_dir/docs"
        # Migrate from root to docs/ if old location exists
        if [ -f "$project_dir/ANTI_PATTERNS_BREADTH.md" ] && [ ! -f "$project_dir/docs/ANTI_PATTERNS_BREADTH.md" ]; then
            mv "$project_dir/ANTI_PATTERNS_BREADTH.md" "$project_dir/docs/ANTI_PATTERNS_BREADTH.md"
            echo -e "  ${CYAN}↑ Migrated: ANTI_PATTERNS_BREADTH.md → docs/${NC}"
        fi
        if [ ! -f "$project_dir/docs/ANTI_PATTERNS_BREADTH.md" ]; then
            cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_BREADTH.md" "$project_dir/docs/ANTI_PATTERNS_BREADTH.md"
            echo -e "  ${GREEN}+ Added: docs/ANTI_PATTERNS_BREADTH.md${NC}"
        elif ! diff -q "$SCRIPT_DIR/docs/ANTI_PATTERNS_BREADTH.md" "$project_dir/docs/ANTI_PATTERNS_BREADTH.md" > /dev/null 2>&1; then
            cp "$project_dir/docs/ANTI_PATTERNS_BREADTH.md" "$backup_dir/ANTI_PATTERNS_BREADTH.md"
            cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_BREADTH.md" "$project_dir/docs/ANTI_PATTERNS_BREADTH.md"
            echo -e "  ${CYAN}↑ Updated: docs/ANTI_PATTERNS_BREADTH.md${NC}"
        fi
    fi

    # Update ANTI_PATTERNS_DEPTH.md (now in docs/)
    if [ -f "$SCRIPT_DIR/docs/ANTI_PATTERNS_DEPTH.md" ]; then
        mkdir -p "$project_dir/docs"
        # Migrate from root to docs/ if old location exists
        if [ -f "$project_dir/ANTI_PATTERNS_DEPTH.md" ] && [ ! -f "$project_dir/docs/ANTI_PATTERNS_DEPTH.md" ]; then
            mv "$project_dir/ANTI_PATTERNS_DEPTH.md" "$project_dir/docs/ANTI_PATTERNS_DEPTH.md"
            echo -e "  ${CYAN}↑ Migrated: ANTI_PATTERNS_DEPTH.md → docs/${NC}"
        fi
        if [ ! -f "$project_dir/docs/ANTI_PATTERNS_DEPTH.md" ]; then
            cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_DEPTH.md" "$project_dir/docs/ANTI_PATTERNS_DEPTH.md"
            echo -e "  ${GREEN}+ Added: docs/ANTI_PATTERNS_DEPTH.md${NC}"
        elif ! diff -q "$SCRIPT_DIR/docs/ANTI_PATTERNS_DEPTH.md" "$project_dir/docs/ANTI_PATTERNS_DEPTH.md" > /dev/null 2>&1; then
            cp "$project_dir/docs/ANTI_PATTERNS_DEPTH.md" "$backup_dir/ANTI_PATTERNS_DEPTH.md"
            cp "$SCRIPT_DIR/docs/ANTI_PATTERNS_DEPTH.md" "$project_dir/docs/ANTI_PATTERNS_DEPTH.md"
            echo -e "  ${CYAN}↑ Updated: docs/ANTI_PATTERNS_DEPTH.md${NC}"
        fi
    fi

    # Migrate bpsbs.md out of root (no longer installed separately)
    if [ -f "$project_dir/bpsbs.md" ]; then
        rm "$project_dir/bpsbs.md"
        echo -e "  ${CYAN}↑ Removed: bpsbs.md (covered by CLAUDE.md + global rules)${NC}"
    fi

    # Update Copilot files if platform is copilot
    if [ -f "$project_dir/.copilot/.framework-platform" ]; then
        local platform=$(cat "$project_dir/.copilot/.framework-platform")
        if [ "$platform" = "copilot" ]; then
            # Update security-scanner agent
            if [ -f "$SCRIPT_DIR/.copilot/custom-agents/security-scanner.md" ]; then
                mkdir -p "$project_dir/.copilot/custom-agents"
                if [ ! -f "$project_dir/.copilot/custom-agents/security-scanner.md" ]; then
                    cp "$SCRIPT_DIR/.copilot/custom-agents/security-scanner.md" "$project_dir/.copilot/custom-agents/security-scanner.md"
                    echo -e "  ${GREEN}+ Added: security-scanner agent${NC}"
                elif ! diff -q "$SCRIPT_DIR/.copilot/custom-agents/security-scanner.md" "$project_dir/.copilot/custom-agents/security-scanner.md" > /dev/null 2>&1; then
                    cp "$SCRIPT_DIR/.copilot/custom-agents/security-scanner.md" "$project_dir/.copilot/custom-agents/security-scanner.md"
                    echo -e "  ${CYAN}↑ Updated: security-scanner agent${NC}"
                fi
            fi
            
            # Update helper and guides
            [ -f "$SCRIPT_DIR/.copilot/helper.sh" ] && cp "$SCRIPT_DIR/.copilot/helper.sh" "$project_dir/.copilot/helper.sh" && chmod +x "$project_dir/.copilot/helper.sh"
            [ -f "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" ] && cp "$SCRIPT_DIR/.copilot/WORKFLOW-GUIDE.md" "$project_dir/.copilot/WORKFLOW-GUIDE.md"
            [ -f "$SCRIPT_DIR/.copilot/SECURITY-INTEGRATION.md" ] && cp "$SCRIPT_DIR/.copilot/SECURITY-INTEGRATION.md" "$project_dir/.copilot/SECURITY-INTEGRATION.md"
        fi
    fi

    # ─────────────────────────────────────────────────────────────
    # Harvest knowledge from project (FR-006)
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${YELLOW}Harvesting knowledge from project...${NC}"
    local harvest_script="$SCRIPT_DIR/scripts/harvest.sh"
    if [ -f "$harvest_script" ] && [ -x "$harvest_script" ]; then
        FORCE=true bash "$harvest_script" "$project_dir" 2>/dev/null || echo -e "  ${YELLOW}Harvest skipped (no knowledge to harvest)${NC}"
    else
        echo -e "  ${YELLOW}Harvest script not found, skipping${NC}"
    fi

    # ─────────────────────────────────────────────────────────────
    # Set version marker
    # ─────────────────────────────────────────────────────────────
    set_project_version "$project_dir"

    # Auto-register if not already
    if [ -f "$REGISTRY_FILE" ]; then
        if ! grep -q "^$project_dir$" "$REGISTRY_FILE"; then
            echo "$project_dir" >> "$REGISTRY_FILE"
        fi
    else
        echo "$project_dir" >> "$REGISTRY_FILE"
    fi

    # ─────────────────────────────────────────────────────────────
    # Summary
    # ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Update complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Version: ${CYAN}v$current_version → v$FRAMEWORK_VERSION${NC}"
    echo -e "  Backup:  ${BLUE}$backup_dir${NC}"
    echo ""
}

update_all_projects() {
    if [ ! -f "$REGISTRY_FILE" ] || [ ! -s "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}No projects registered.${NC}"
        echo ""
        echo "Register projects with:"
        echo -e "  ${CYAN}$0 --register /path/to/project${NC}"
        exit 1
    fi

    local total=0
    local updated=0
    local failed=0

    while IFS= read -r project_dir; do
        if [ -n "$project_dir" ]; then
            total=$((total + 1))
            echo ""
            if [ -d "$project_dir" ]; then
                if update_project "$project_dir"; then
                    updated=$((updated + 1))
                else
                    failed=$((failed + 1))
                fi
            else
                echo -e "${RED}Project not found: $project_dir${NC}"
                failed=$((failed + 1))
            fi
        fi
    done < "$REGISTRY_FILE"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    UPDATE SUMMARY                         ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Total projects:  $total"
    echo -e "  Updated:         ${GREEN}$updated${NC}"
    echo -e "  Failed:          ${RED}$failed${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

print_header

case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS] [PROJECT_PATH]"
        echo ""
        echo "Options:"
        echo "  --all                    Update all registered projects"
        echo "  --register PATH          Register a project (use . for current dir)"
        echo "  --unregister PATH        Remove a project from registry"
        echo "  --scan PATH              Scan directory for Claude AS projects"
        echo "  --list                   List registered projects"
        echo "  --diff PATH              Show what would change"
        echo "  --force PATH             Force update even if same version"
        echo "  --sync PATH              Validate/regenerate CLAUDE-SUMMARY.md"
        echo "  --version                Show framework version"
        echo "  --help                   Show this help"
        echo ""
        echo "Examples:"
        echo "  $0 .                        Update current directory"
        echo "  $0 /path/to/project         Update single project"
        echo "  $0 --register .             Register current directory"
        echo "  $0 --scan ~/projects        Find and register projects"
        echo "  $0 --all                    Update all registered projects"
        echo "  $0 --diff /path/to/project  Preview changes"
        echo ""
        ;;
    --version|-v)
        echo ""
        echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║${NC}                  ${GREEN}Claude AS Framework${NC}                       ${CYAN}║${NC}"
        echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${CYAN}║${NC}  Version: ${YELLOW}$FRAMEWORK_VERSION${NC}                                     ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  Date: ${YELLOW}$FRAMEWORK_DATE${NC}                                        ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  Format: ${YELLOW}MAJOR.FEATURE.DATABASE.ITERATION${NC}                 ${CYAN}║${NC}"
        IFS='.' read -r -a PARTS <<< "$FRAMEWORK_VERSION"
        echo -e "${CYAN}║${NC}  ${PARTS[0]:-0} - Major      (Breaking changes)                          ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  ${PARTS[1]:-0} - Feature    (New features)                             ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  ${PARTS[2]:-0} - Database   (Schema changes)                           ${CYAN}║${NC}"
        echo -e "${CYAN}║${NC}  ${PARTS[3]:-0} - Iteration  (Patches/bug fixes)                        ${CYAN}║${NC}"
        echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
        echo ""

        # Show version check if script exists
        if [ -f "$SCRIPT_DIR/scripts/version-check.sh" ]; then
            echo -e "${BLUE}Checking for updates...${NC}"
            bash "$SCRIPT_DIR/scripts/version-check.sh" claude ~ false || true
        fi
        ;;
    --register)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please provide project path${NC}"
            exit 1
        fi
        register_project "$2"
        ;;
    --unregister)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please provide project path${NC}"
            exit 1
        fi
        unregister_project "$2"
        ;;
    --scan)
        scan_path="${2:-.}"
        max_depth="${3:-3}"
        scan_projects "$scan_path" "$max_depth"
        ;;
    --list|-l)
        list_projects
        ;;
    --diff)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please provide project path${NC}"
            exit 1
        fi
        show_diff "$2"
        ;;
    --force)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please provide project path${NC}"
            exit 1
        fi
        update_project "$2" true
        ;;
    --sync)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please provide project path${NC}"
            exit 1
        fi
        project_path="$(resolve_path "$2")"
        echo -e "${BLUE}Validating CLAUDE.md / CLAUDE-SUMMARY.md sync...${NC}"
        echo ""
        sync_result=$(validate_summary_sync "$project_path")
        sync_status=$?
        if [ $sync_status -eq 2 ]; then
            echo ""
            read -p "Regenerate CLAUDE-SUMMARY.md from framework? [Y/n]: " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                generate_summary_from_claude "$project_path"
            fi
        elif [ $sync_status -eq 0 ]; then
            echo -e "${GREEN}CLAUDE.md and CLAUDE-SUMMARY.md are in sync.${NC}"
        fi
        ;;
    --remote)
        echo -e "${BLUE}Pulling latest from Knowledge Hub...${NC}"
        local sync_script="$SCRIPT_DIR/scripts/knowledge-sync.sh"
        if [ -f "$sync_script" ] && [ -x "$sync_script" ]; then
            bash "$sync_script" pull || echo -e "${YELLOW}Hub pull skipped (not configured or offline)${NC}"
        else
            echo -e "${YELLOW}knowledge-sync.sh not found${NC}"
        fi
        shift
        ;;
    --all)
        update_all_projects
        ;;
    "")
        echo "Usage: $0 [OPTIONS] [PROJECT_PATH]"
        echo ""
        echo "Quick commands:"
        echo -e "  ${CYAN}$0 .${NC}                    Update current directory"
        echo -e "  ${CYAN}$0 --register .${NC}         Register current directory"
        echo -e "  ${CYAN}$0 --scan ~/projects${NC}    Find existing projects"
        echo -e "  ${CYAN}$0 --remote${NC}             Pull from Knowledge Hub before updating"
        echo -e "  ${CYAN}$0 --all${NC}                Update all registered projects"
        echo -e "  ${CYAN}$0 --list${NC}               List registered projects"
        echo -e "  ${CYAN}$0 --help${NC}               Show all options"
        echo ""
        ;;
    *)
        # Assume it's a project path
        if [ -d "$1" ]; then
            update_project "$1"
        else
            echo -e "${RED}Error: '$1' is not a valid directory${NC}"
            exit 1
        fi
        ;;
esac

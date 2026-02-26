#!/bin/bash

# Platform Sync Engine - Generate platform command files from agent source files
# Generates .claude/commands/, .copilot/custom-agents/, .cursor/rules/, .agents/skills/, .gemini/skills/ from agents/*.md
#
# This script supersedes convert-to-copilot.sh by generating ALL platform files
# directly from agent source definitions.
#
# USAGE:
#   ./scripts/sync-platforms.sh sync [--all | agent-name]   Generate platform files
#   ./scripts/sync-platforms.sh check                        Verify all agents have platform files
#   ./scripts/sync-platforms.sh list                         Show agent→command mapping + status
#   ./scripts/sync-platforms.sh diff [agent-name]            Show differences vs generated
#   ./scripts/sync-platforms.sh --help                       Show usage
#
# FLAGS:
#   --dry-run    Preview changes without writing files
#
# EXAMPLES:
#   ./scripts/sync-platforms.sh sync --all              # Regenerate all platform files
#   ./scripts/sync-platforms.sh sync ops-tooling-generator  # Sync single agent
#   ./scripts/sync-platforms.sh check                   # Verify sync status
#   ./scripts/sync-platforms.sh list                    # Show mapping table
#   ./scripts/sync-platforms.sh diff ruthless-coder      # Show diff for one agent

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_DIR="$FRAMEWORK_DIR/agents"
CLAUDE_DIR="$FRAMEWORK_DIR/.claude/commands"
COPILOT_DIR="$FRAMEWORK_DIR/.copilot/custom-agents"
CURSOR_DIR="$FRAMEWORK_DIR/.cursor/rules"
CODEX_DIR="$FRAMEWORK_DIR/.agents/skills"
GEMINI_DIR="$FRAMEWORK_DIR/.gemini/skills"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Flags
DRY_RUN=false

# Counters
SYNCED=0
SKIPPED=0
ERRORS=0

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo -e "${BLUE}Platform Sync Engine${NC} - Generate platform files from agent source"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/sync-platforms.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  sync [--all | agent-name]   Generate platform files from agent source"
    echo "  check                       Verify all agents have platform files"
    echo "  list                        Show agent→command mapping with status"
    echo "  diff [agent-name]           Show differences between existing and generated"
    echo ""
    echo "OPTIONS:"
    echo "  --dry-run                   Preview changes without writing files"
    echo "  --help, -h                  Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/sync-platforms.sh sync --all"
    echo "  ./scripts/sync-platforms.sh sync ops-tooling-generator"
    echo "  ./scripts/sync-platforms.sh check"
    echo "  ./scripts/sync-platforms.sh list"
    echo "  ./scripts/sync-platforms.sh diff ruthless-coder"
    echo ""
    echo "PLATFORMS:"
    echo "  Claude Code    .claude/commands/{command}.md"
    echo "  Copilot CLI    .copilot/custom-agents/{command}.md"
    echo "  Cursor         .cursor/rules/{command}.md"
    echo "  OpenAI Codex   .agents/skills/{command}/SKILL.md"
    echo "  Google Gemini  .gemini/skills/{command}.md"
    echo ""
    echo "WORKFLOW:"
    echo "  1. Create agents/my-agent.md with command: field in YAML frontmatter"
    echo "  2. Run: ./scripts/sync-platforms.sh sync my-agent"
    echo "  3. All 5 platform files are generated automatically"
}

# ═══════════════════════════════════════════════════════════════
# FRONTMATTER UTILITIES
# ═══════════════════════════════════════════════════════════════

# Extract a single field from YAML frontmatter
# Usage: extract_frontmatter_field <file> <field>
extract_frontmatter_field() {
    local file="$1"
    local field="$2"

    # Read between first two --- lines, grep for field
    awk '/^---$/{c++; next} c==1{print}' "$file" | grep "^${field}:" | head -1 | sed "s/^${field}: *//"
}

# Extract body content (everything after closing --- of frontmatter)
# Usage: extract_body <file>
extract_body() {
    local file="$1"

    # Check if file starts with frontmatter
    local first_line
    first_line=$(head -1 "$file")

    if [[ "$first_line" == "---" ]]; then
        # Skip frontmatter: output everything after the second ---
        awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$file"
    else
        # No frontmatter, output entire file
        cat "$file"
    fi
}

# ═══════════════════════════════════════════════════════════════
# CONTENT TRANSFORMATION
# ═══════════════════════════════════════════════════════════════

# Strip framework-internal sections from agent body
# Removes: "Integration with Other Agents", "Context Discipline"
# Usage: strip_sections <body_text>
strip_sections() {
    local body="$1"

    echo "$body" | awk '
    BEGIN { skip = 0 }
    /^## Integration with Other Agents/ { skip = 1; next }
    /^## Context Discipline/ { skip = 1; next }
    /^---$/ {
        if (skip) { skip = 0; next }
    }
    /^## / {
        if (skip) { skip = 0 }
    }
    !skip { print }
    '
}

# Inject persona reference after the first paragraph
# Usage: inject_persona_ref <body_text> <agent_filename>
inject_persona_ref() {
    local body="$1"
    local agent_filename="$2"

    echo "$body" | awk -v ref="$agent_filename" '
    BEGIN { injected = 0; blank_after_content = 0 }
    {
        # Print the current line
        print

        # After the first non-empty line followed by a blank line, inject
        if (!injected && blank_after_content == 0 && $0 != "" && $0 !~ /^#/) {
            blank_after_content = 1
            next
        }
        if (!injected && blank_after_content == 1 && $0 == "") {
            print "**Persona**: See `agents/" ref "` for full persona definition."
            print ""
            injected = 1
        }
    }
    '
}

# Clean description: extract first sentence before <example> tags
# Usage: clean_description <raw_description>
clean_description() {
    local desc="$1"

    # Strip everything from first <example> tag onwards
    echo "$desc" | sed 's/ *Examples:.*//; s/ *<example>.*//; s/\. .*/\./' | head -1
}

# ═══════════════════════════════════════════════════════════════
# PLATFORM GENERATORS
# ═══════════════════════════════════════════════════════════════

# Generate Claude Code command file content
# Usage: generate_claude_content <agent_file>
generate_claude_content() {
    local agent_file="$1"
    local agent_basename
    agent_basename=$(basename "$agent_file")

    # Extract and transform
    local body
    body=$(extract_body "$agent_file")
    local stripped
    stripped=$(strip_sections "$body")
    local result
    result=$(inject_persona_ref "$stripped" "$agent_basename")

    # Remove trailing blank lines and output
    echo "$result" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
}

# Generate Copilot CLI agent file content
# Usage: generate_copilot_content <agent_file>
generate_copilot_content() {
    local agent_file="$1"

    # Get Claude content (same transformation)
    local claude_content
    claude_content=$(generate_claude_content "$agent_file")

    # Output with Copilot wrapper
    cat <<'COPILOT_HEADER'
# Custom Agent Instructions

**Agent Type**: task
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

## Instructions

COPILOT_HEADER

    echo "$claude_content"

    cat <<'COPILOT_FOOTER'

---

## Usage in GitHub Copilot CLI

To use this agent, invoke it via the task tool:

```
task(
  agent_type="task",
  description="Brief task description",
  prompt="<task details and context>"
)
```

Or for exploration tasks:

```
task(
  agent_type="explore",
  description="Exploration description",
  prompt="<what to find or analyze>"
)
```
COPILOT_FOOTER
}

# Generate Cursor rule file content (identical to Claude)
# Usage: generate_cursor_content <agent_file>
generate_cursor_content() {
    generate_claude_content "$1"
}

# Generate OpenAI Codex SKILL.md content
# Usage: generate_codex_content <agent_file>
generate_codex_content() {
    local agent_file="$1"
    local cmd
    cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")
    local raw_desc
    raw_desc=$(extract_frontmatter_field "$agent_file" "description" 2>/dev/null || echo "")
    local description
    description=$(clean_description "$raw_desc")

    # Fallback description if empty
    if [ -z "$description" ]; then
        description="Use this skill for the ${cmd} workflow."
    fi

    # SKILL.md frontmatter
    printf -- '---\nname: %s\ndescription: >-\n  %s\n---\n\n' "$cmd" "$description"

    # Body: same transformation as Claude
    generate_claude_content "$agent_file"
}

# Generate Gemini skill markdown content
# Usage: generate_gemini_content <agent_file>
generate_gemini_content() {
    local agent_file="$1"
    local cmd
    cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")
    local raw_desc
    raw_desc=$(extract_frontmatter_field "$agent_file" "description" 2>/dev/null || echo "")
    local description
    description=$(clean_description "$raw_desc")

    if [ -z "$description" ]; then
        description="Use this skill for the ${cmd} workflow."
    fi

    printf '# /%s\n\n' "$cmd"
    printf '%s\n\n' "$description"
    printf '## Instructions\n\n'
    generate_claude_content "$agent_file"
}

# Generate Gemini skill from standalone command
# Usage: generate_gemini_standalone_content <command_file>
generate_gemini_standalone_content() {
    local cmd_file="$1"
    local cmd_name
    cmd_name=$(basename "$cmd_file" .md)

    printf '# /%s\n\n' "$cmd_name"
    printf 'Gemini skill for `%s`.\n\n' "$cmd_name"
    printf '## Instructions\n\n'
    cat "$cmd_file"
}

# Generate Codex SKILL.md from a standalone command file (no backing agent)
# Usage: generate_codex_standalone_content <command_file>
generate_codex_standalone_content() {
    local cmd_file="$1"
    local cmd_name
    cmd_name=$(basename "$cmd_file" .md)

    # Extract first heading as description basis
    local first_line
    first_line=$(grep -m1 '^#' "$cmd_file" 2>/dev/null | sed 's/^#* *//' || echo "")
    local description="${first_line:-Use this skill for the ${cmd_name} workflow.}"

    # SKILL.md frontmatter
    printf -- '---\nname: %s\ndescription: >-\n  %s\n---\n\n' "$cmd_name" "$description"

    # Body: use the Claude command file content directly
    cat "$cmd_file"
}

# ═══════════════════════════════════════════════════════════════
# AGENT DISCOVERY
# ═══════════════════════════════════════════════════════════════

# Get list of syncable agent files (public agents with command: field != none)
# Outputs: one agent filepath per line
get_syncable_agents() {
    for file in "$AGENTS_DIR"/*.md; do
        local basename
        basename=$(basename "$file")

        # Skip underscore-prefixed shared modules
        if [[ "$basename" == _* ]]; then
            continue
        fi

        # Skip compliance profiles directory
        if [[ "$file" == *"/compliance-profiles/"* ]]; then
            continue
        fi

        # Check for command field
        local cmd
        cmd=$(extract_frontmatter_field "$file" "command" 2>/dev/null || echo "")

        # Skip if no command or command is "none"
        if [ -z "$cmd" ] || [ "$cmd" = "none" ]; then
            continue
        fi

        echo "$file"
    done
}

# Find agent file by name (with or without .md extension)
# Usage: find_agent_file <agent-name>
find_agent_file() {
    local name="$1"

    # Try exact match
    if [ -f "$AGENTS_DIR/${name}.md" ]; then
        echo "$AGENTS_DIR/${name}.md"
        return 0
    fi

    # Try with .md extension removed if provided
    local stripped="${name%.md}"
    if [ -f "$AGENTS_DIR/${stripped}.md" ]; then
        echo "$AGENTS_DIR/${stripped}.md"
        return 0
    fi

    return 1
}

# ═══════════════════════════════════════════════════════════════
# SYNC COMMAND
# ═══════════════════════════════════════════════════════════════

# Sync a single agent to all 5 platforms
# Usage: sync_agent <agent_file>
sync_agent() {
    local agent_file="$1"
    local agent_basename
    agent_basename=$(basename "$agent_file")
    local agent_name="${agent_basename%.md}"

    local cmd
    cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")

    if [ -z "$cmd" ] || [ "$cmd" = "none" ]; then
        echo -e "  ${YELLOW}SKIP${NC} $agent_name (command: ${cmd:-missing})"
        SKIPPED=$((SKIPPED + 1))
        return 0
    fi

    echo -e "  ${CYAN}SYNC${NC} $agent_name → /${cmd}"

    local claude_file="$CLAUDE_DIR/${cmd}.md"
    local copilot_file="$COPILOT_DIR/${cmd}.md"
    local cursor_file="$CURSOR_DIR/${cmd}.md"
    local codex_dir="$CODEX_DIR/${cmd}"
    local codex_file="$codex_dir/SKILL.md"
    local gemini_file="$GEMINI_DIR/${cmd}.md"

    if [ "$DRY_RUN" = true ]; then
        echo -e "       ${YELLOW}[dry-run]${NC} Would write: $claude_file"
        echo -e "       ${YELLOW}[dry-run]${NC} Would write: $copilot_file"
        echo -e "       ${YELLOW}[dry-run]${NC} Would write: $cursor_file"
        echo -e "       ${YELLOW}[dry-run]${NC} Would write: $codex_file"
        echo -e "       ${YELLOW}[dry-run]${NC} Would write: $gemini_file"
    else
        # Generate Claude Code command
        generate_claude_content "$agent_file" > "$claude_file"
        echo -e "       ${GREEN}wrote${NC} $claude_file"

        # Generate Copilot CLI agent
        generate_copilot_content "$agent_file" > "$copilot_file"
        echo -e "       ${GREEN}wrote${NC} $copilot_file"

        # Generate Cursor rule
        generate_cursor_content "$agent_file" > "$cursor_file"
        echo -e "       ${GREEN}wrote${NC} $cursor_file"

        # Generate Codex Skill
        mkdir -p "$codex_dir"
        generate_codex_content "$agent_file" > "$codex_file"
        echo -e "       ${GREEN}wrote${NC} $codex_file"

        # Generate Gemini Skill
        generate_gemini_content "$agent_file" > "$gemini_file"
        echo -e "       ${GREEN}wrote${NC} $gemini_file"
    fi

    SYNCED=$((SYNCED + 1))
}

cmd_sync() {
    local target=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)      target="ALL"; shift ;;
            --dry-run)  DRY_RUN=true; shift ;;
            *)          target="$1"; shift ;;
        esac
    done

    if [ -z "$target" ]; then
        echo -e "${RED}Error: specify --all or an agent name${NC}"
        echo "Usage: sync-platforms.sh sync [--all | agent-name]"
        exit 1
    fi

    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              Platform Sync Engine                        ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}DRY RUN MODE - no files will be written${NC}"
        echo ""
    fi

    # Ensure output directories exist
    mkdir -p "$CLAUDE_DIR" "$COPILOT_DIR" "$CURSOR_DIR" "$CODEX_DIR" "$GEMINI_DIR"

    if [ "$target" = "ALL" ]; then
        echo -e "${BOLD}Syncing all agents to 5 platforms...${NC}"
        echo ""

        for agent_file in $(get_syncable_agents); do
            sync_agent "$agent_file"
        done

        # Sync standalone commands to Codex/Gemini (commands without backing agents)
        echo ""
        echo -e "${BOLD}Syncing standalone commands to Codex/Gemini...${NC}"
        echo ""
        local standalone_count=0
        for file in "$CLAUDE_DIR"/*.md; do
            local cmd_name
            cmd_name=$(basename "$file" .md)

            # Check if this command has a backing agent
            local has_agent=false
            for agent_file in "$AGENTS_DIR"/*.md; do
                [[ "$(basename "$agent_file")" == _* ]] && continue
                local agent_cmd
                agent_cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")
                if [ "$agent_cmd" = "$cmd_name" ]; then
                    has_agent=true
                    break
                fi
            done

            if [ "$has_agent" = false ]; then
                local codex_dir="$CODEX_DIR/${cmd_name}"
                local codex_file="$codex_dir/SKILL.md"
                if [ "$DRY_RUN" = true ]; then
                    echo -e "  ${YELLOW}[dry-run]${NC} Would write: $codex_file"
                    echo -e "  ${YELLOW}[dry-run]${NC} Would write: $GEMINI_DIR/${cmd_name}.md"
                else
                    mkdir -p "$codex_dir"
                    generate_codex_standalone_content "$file" > "$codex_file"
                    echo -e "  ${GREEN}wrote${NC} $codex_file (standalone)"
                    generate_gemini_standalone_content "$file" > "$GEMINI_DIR/${cmd_name}.md"
                    echo -e "  ${GREEN}wrote${NC} $GEMINI_DIR/${cmd_name}.md (standalone)"
                fi
                standalone_count=$((standalone_count + 1))
            fi
        done
        echo -e "  ${CYAN}$standalone_count${NC} standalone skills generated"
    else
        local agent_file
        if ! agent_file=$(find_agent_file "$target"); then
            echo -e "${RED}Error: Agent not found: $target${NC}"
            echo "Available agents:"
            for f in "$AGENTS_DIR"/*.md; do
                local bn
                bn=$(basename "$f" .md)
                [[ "$bn" == _* ]] && continue
                echo "  $bn"
            done
            exit 1
        fi
        sync_agent "$agent_file"
    fi

    # Summary
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Synced:  ${GREEN}$SYNCED${NC} agents (× 5 platforms = $((SYNCED * 5)) files)"
    echo -e "Skipped: ${YELLOW}$SKIPPED${NC}"
    if [ $ERRORS -gt 0 ]; then
        echo -e "Errors:  ${RED}$ERRORS${NC}"
    fi
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}(dry run - no files were written)${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# CHECK COMMAND
# ═══════════════════════════════════════════════════════════════

cmd_check() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              Platform Sync - Check                       ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    local total=0
    local ok=0
    local missing=0
    local out_of_sync=0

    for agent_file in $(get_syncable_agents); do
        local agent_basename
        agent_basename=$(basename "$agent_file")
        local agent_name="${agent_basename%.md}"
        local cmd
        cmd=$(extract_frontmatter_field "$agent_file" "command")

        total=$((total + 1))

        local claude_file="$CLAUDE_DIR/${cmd}.md"
        local copilot_file="$COPILOT_DIR/${cmd}.md"
        local cursor_file="$CURSOR_DIR/${cmd}.md"

        local status_parts=""
        local all_ok=true

        # Check Claude
        if [ -f "$claude_file" ]; then
            local expected
            expected=$(generate_claude_content "$agent_file")
            local actual
            actual=$(cat "$claude_file")
            if [ "$expected" = "$actual" ]; then
                status_parts="${status_parts} ${GREEN}claude:ok${NC}"
            else
                status_parts="${status_parts} ${YELLOW}claude:drift${NC}"
                all_ok=false
            fi
        else
            status_parts="${status_parts} ${RED}claude:MISSING${NC}"
            all_ok=false
        fi

        # Check Copilot
        if [ -f "$copilot_file" ]; then
            local expected
            expected=$(generate_copilot_content "$agent_file")
            local actual
            actual=$(cat "$copilot_file")
            if [ "$expected" = "$actual" ]; then
                status_parts="${status_parts} ${GREEN}copilot:ok${NC}"
            else
                status_parts="${status_parts} ${YELLOW}copilot:drift${NC}"
                all_ok=false
            fi
        else
            status_parts="${status_parts} ${RED}copilot:MISSING${NC}"
            all_ok=false
        fi

        # Check Cursor
        if [ -f "$cursor_file" ]; then
            local expected
            expected=$(generate_cursor_content "$agent_file")
            local actual
            actual=$(cat "$cursor_file")
            if [ "$expected" = "$actual" ]; then
                status_parts="${status_parts} ${GREEN}cursor:ok${NC}"
            else
                status_parts="${status_parts} ${YELLOW}cursor:drift${NC}"
                all_ok=false
            fi
        else
            status_parts="${status_parts} ${RED}cursor:MISSING${NC}"
            all_ok=false
        fi

        # Check Codex
        local codex_file="$CODEX_DIR/${cmd}/SKILL.md"
        if [ -f "$codex_file" ]; then
            local expected
            expected=$(generate_codex_content "$agent_file")
            local actual
            actual=$(cat "$codex_file")
            if [ "$expected" = "$actual" ]; then
                status_parts="${status_parts} ${GREEN}codex:ok${NC}"
            else
                status_parts="${status_parts} ${YELLOW}codex:drift${NC}"
                all_ok=false
            fi
        else
            status_parts="${status_parts} ${RED}codex:MISSING${NC}"
            all_ok=false
        fi

        # Check Gemini
        local gemini_file="$GEMINI_DIR/${cmd}.md"
        if [ -f "$gemini_file" ]; then
            local expected
            expected=$(generate_gemini_content "$agent_file")
            local actual
            actual=$(cat "$gemini_file")
            if [ "$expected" = "$actual" ]; then
                status_parts="${status_parts} ${GREEN}gemini:ok${NC}"
            else
                status_parts="${status_parts} ${YELLOW}gemini:drift${NC}"
                all_ok=false
            fi
        else
            status_parts="${status_parts} ${RED}gemini:MISSING${NC}"
            all_ok=false
        fi

        if [ "$all_ok" = true ]; then
            ok=$((ok + 1))
        elif echo -e "$status_parts" | grep -q "MISSING"; then
            missing=$((missing + 1))
        else
            out_of_sync=$((out_of_sync + 1))
        fi

        printf "  %-40s → /%-20s %b\n" "$agent_name" "$cmd" "$status_parts"
    done

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Total:       ${CYAN}$total${NC} agents"
    echo -e "In sync:     ${GREEN}$ok${NC}"
    echo -e "Drifted:     ${YELLOW}$out_of_sync${NC}"
    echo -e "Missing:     ${RED}$missing${NC}"

    if [ $missing -gt 0 ] || [ $out_of_sync -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Run 'sync-platforms.sh sync --all' to fix${NC}"
        return 1
    else
        echo ""
        echo -e "${GREEN}All platform files are in sync.${NC}"
        return 0
    fi
}

# ═══════════════════════════════════════════════════════════════
# LIST COMMAND
# ═══════════════════════════════════════════════════════════════

cmd_list() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║              Agent → Command Mapping                     ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    local mapped=0
    local skipped_count=0

    echo -e "${BOLD}AGENT-BACKED COMMANDS${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    for file in "$AGENTS_DIR"/*.md; do
        local basename
        basename=$(basename "$file")

        # Skip underscore-prefixed shared modules
        [[ "$basename" == _* ]] && continue

        local agent_name="${basename%.md}"
        local cmd
        cmd=$(extract_frontmatter_field "$file" "command" 2>/dev/null || echo "")

        if [ -z "$cmd" ] || [ "$cmd" = "none" ]; then
            printf "  ${YELLOW}%-42s${NC} → (none)\n" "$agent_name"
            skipped_count=$((skipped_count + 1))
        else
            # Check platform file existence
            local claude_ok copilot_ok cursor_ok codex_ok gemini_ok
            [ -f "$CLAUDE_DIR/${cmd}.md" ] && claude_ok="${GREEN}C${NC}" || claude_ok="${RED}C${NC}"
            [ -f "$COPILOT_DIR/${cmd}.md" ] && copilot_ok="${GREEN}P${NC}" || copilot_ok="${RED}P${NC}"
            [ -f "$CURSOR_DIR/${cmd}.md" ] && cursor_ok="${GREEN}R${NC}" || cursor_ok="${RED}R${NC}"
            [ -f "$CODEX_DIR/${cmd}/SKILL.md" ] && codex_ok="${GREEN}X${NC}" || codex_ok="${RED}X${NC}"
            [ -f "$GEMINI_DIR/${cmd}.md" ] && gemini_ok="${GREEN}G${NC}" || gemini_ok="${RED}G${NC}"

            printf "  %-42s → /%-16s [%b|%b|%b|%b|%b]\n" "$agent_name" "$cmd" "$claude_ok" "$copilot_ok" "$cursor_ok" "$codex_ok" "$gemini_ok"
            mapped=$((mapped + 1))
        fi
    done

    echo ""
    echo -e "${BOLD}STANDALONE COMMANDS${NC} (not agent-backed, not synced)"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local standalone=0
    for file in "$CLAUDE_DIR"/*.md; do
        local cmd_name
        cmd_name=$(basename "$file" .md)

        # Check if this command has a backing agent
        local has_agent=false
        for agent_file in "$AGENTS_DIR"/*.md; do
            [[ "$(basename "$agent_file")" == _* ]] && continue
            local agent_cmd
            agent_cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")
            if [ "$agent_cmd" = "$cmd_name" ]; then
                has_agent=true
                break
            fi
        done

        if [ "$has_agent" = false ]; then
            printf "  /${cmd_name}\n"
            standalone=$((standalone + 1))
        fi
    done

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "Mapped:     ${GREEN}$mapped${NC} agents → commands"
    echo -e "Skipped:    ${YELLOW}$skipped_count${NC} (no command)"
    echo -e "Standalone: ${CYAN}$standalone${NC} commands (not synced)"
    echo ""
    echo -e "Legend: [${GREEN}C${NC}|${GREEN}P${NC}|${GREEN}R${NC}|${GREEN}X${NC}|${GREEN}G${NC}] = Claude | coPilot | cuRsor | codeX | Gemini"
}

# ═══════════════════════════════════════════════════════════════
# DIFF COMMAND
# ═══════════════════════════════════════════════════════════════

cmd_diff() {
    local target="$1"

    if [ -z "$target" ]; then
        echo -e "${RED}Error: specify an agent name${NC}"
        echo "Usage: sync-platforms.sh diff <agent-name>"
        exit 1
    fi

    local agent_file
    if ! agent_file=$(find_agent_file "$target"); then
        echo -e "${RED}Error: Agent not found: $target${NC}"
        exit 1
    fi

    local agent_basename
    agent_basename=$(basename "$agent_file")
    local agent_name="${agent_basename%.md}"
    local cmd
    cmd=$(extract_frontmatter_field "$agent_file" "command" 2>/dev/null || echo "")

    if [ -z "$cmd" ] || [ "$cmd" = "none" ]; then
        echo -e "${YELLOW}Agent $agent_name has no command mapping (command: $cmd)${NC}"
        exit 0
    fi

    echo -e "${BLUE}Diff for agent: ${BOLD}$agent_name${NC} → /${cmd}"
    echo ""

    local tmpdir
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" EXIT

    # Generate expected files to temp dir
    generate_claude_content "$agent_file" > "$tmpdir/claude.md"
    generate_copilot_content "$agent_file" > "$tmpdir/copilot.md"
    generate_cursor_content "$agent_file" > "$tmpdir/cursor.md"
    generate_codex_content "$agent_file" > "$tmpdir/codex.md"
    generate_gemini_content "$agent_file" > "$tmpdir/gemini.md"

    local has_diff=false

    # Diff Claude
    echo -e "${BOLD}Claude Code${NC} (.claude/commands/${cmd}.md):"
    if [ -f "$CLAUDE_DIR/${cmd}.md" ]; then
        if diff -u "$CLAUDE_DIR/${cmd}.md" "$tmpdir/claude.md" --label "existing" --label "generated" 2>/dev/null; then
            echo -e "  ${GREEN}In sync${NC}"
        else
            has_diff=true
        fi
    else
        echo -e "  ${RED}File does not exist${NC}"
        has_diff=true
    fi
    echo ""

    # Diff Copilot
    echo -e "${BOLD}Copilot CLI${NC} (.copilot/custom-agents/${cmd}.md):"
    if [ -f "$COPILOT_DIR/${cmd}.md" ]; then
        if diff -u "$COPILOT_DIR/${cmd}.md" "$tmpdir/copilot.md" --label "existing" --label "generated" 2>/dev/null; then
            echo -e "  ${GREEN}In sync${NC}"
        else
            has_diff=true
        fi
    else
        echo -e "  ${RED}File does not exist${NC}"
        has_diff=true
    fi
    echo ""

    # Diff Cursor
    echo -e "${BOLD}Cursor${NC} (.cursor/rules/${cmd}.md):"
    if [ -f "$CURSOR_DIR/${cmd}.md" ]; then
        if diff -u "$CURSOR_DIR/${cmd}.md" "$tmpdir/cursor.md" --label "existing" --label "generated" 2>/dev/null; then
            echo -e "  ${GREEN}In sync${NC}"
        else
            has_diff=true
        fi
    else
        echo -e "  ${RED}File does not exist${NC}"
        has_diff=true
    fi
    echo ""

    # Diff Codex
    echo -e "${BOLD}OpenAI Codex${NC} (.agents/skills/${cmd}/SKILL.md):"
    if [ -f "$CODEX_DIR/${cmd}/SKILL.md" ]; then
        if diff -u "$CODEX_DIR/${cmd}/SKILL.md" "$tmpdir/codex.md" --label "existing" --label "generated" 2>/dev/null; then
            echo -e "  ${GREEN}In sync${NC}"
        else
            has_diff=true
        fi
    else
        echo -e "  ${RED}File does not exist${NC}"
        has_diff=true
    fi

    echo ""

    # Diff Gemini
    echo -e "${BOLD}Google Gemini${NC} (.gemini/skills/${cmd}.md):"
    if [ -f "$GEMINI_DIR/${cmd}.md" ]; then
        if diff -u "$GEMINI_DIR/${cmd}.md" "$tmpdir/gemini.md" --label "existing" --label "generated" 2>/dev/null; then
            echo -e "  ${GREEN}In sync${NC}"
        else
            has_diff=true
        fi
    else
        echo -e "  ${RED}File does not exist${NC}"
        has_diff=true
    fi

    if [ "$has_diff" = true ]; then
        echo ""
        echo -e "${YELLOW}Run 'sync-platforms.sh sync $agent_name' to update${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

main() {
    # No arguments
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi

    # Parse global flags and command
    local command=""
    local args=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            sync|check|list|diff)
                command="$1"
                shift
                args=("$@")
                break
                ;;
            *)
                echo -e "${RED}Unknown command: $1${NC}"
                echo ""
                show_help
                exit 1
                ;;
        esac
    done

    case "$command" in
        sync)   cmd_sync "${args[@]}" ;;
        check)  cmd_check ;;
        list)   cmd_list ;;
        diff)   cmd_diff "${args[@]}" ;;
        *)
            echo -e "${RED}No command specified${NC}"
            show_help
            exit 1
            ;;
    esac
}

main "$@"

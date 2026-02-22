#!/bin/bash

# DEPRECATED: Use scripts/sync-platforms.sh instead (v1.9.0.3)
# sync-platforms.sh generates all 3 platform files from agent source files.
#
# Agent Converter: Claude Code → GitHub Copilot CLI
# Converts .claude/commands/*.md to Copilot custom agent format

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$SCRIPT_DIR/.claude/commands"
COPILOT_DIR="$SCRIPT_DIR/.copilot/custom-agents"
AGENTS_DIR="$SCRIPT_DIR/agents"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Converting Claude Code agents to GitHub Copilot CLI format...${NC}"
echo ""

# Create output directory
mkdir -p "$COPILOT_DIR"

# Counter
CONVERTED=0

# Function to extract frontmatter field
extract_field() {
    local file=$1
    local field=$2
    grep "^$field:" "$file" | head -1 | sed "s/^$field: *//"
}

# Function to convert a single agent
convert_agent() {
    local claude_file=$1
    local filename=$(basename "$claude_file")
    local agent_name="${filename%.md}"
    
    echo -e "${YELLOW}Converting: $filename${NC}"
    
    # Try to extract frontmatter if exists (starts with --- on line 1)
    local first_line=$(head -1 "$claude_file")
    local has_frontmatter=0
    
    if [[ "$first_line" == "---" ]]; then
        has_frontmatter=1
    fi
    
    # Extract frontmatter fields if present
    local name=$(extract_field "$claude_file" "name")
    local description=$(extract_field "$claude_file" "description")
    local color=$(extract_field "$claude_file" "color")
    
    # If no frontmatter name, use filename
    if [ -z "$name" ]; then
        name="$agent_name"
    fi
    
    # Extract agent body
    local agent_body=""
    
    if [ $has_frontmatter -eq 1 ]; then
        # Skip frontmatter (between first two --- lines)
        local in_frontmatter=1
        local line_num=0
        while IFS= read -r line; do
            line_num=$((line_num + 1))
            # Skip first line (opening ---) 
            if [ $line_num -eq 1 ]; then
                continue
            fi
            # Found closing ---
            if [[ "$line" == "---" ]] && [ $in_frontmatter -eq 1 ]; then
                in_frontmatter=0
                continue
            fi
            # Add content after frontmatter
            if [ $in_frontmatter -eq 0 ]; then
                agent_body="$agent_body$line"$'\n'
            fi
        done < "$claude_file"
    else
        # No frontmatter, use entire file
        agent_body=$(cat "$claude_file")
    fi
    
    # Create Copilot custom agent markdown file
    local copilot_file="$COPILOT_DIR/${agent_name}.md"
    
    cat > "$copilot_file" << 'AGENT_START'
# Custom Agent Instructions

**Agent Type**: task  
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

AGENT_START
    
    # Add description if available
    if [ -n "$description" ]; then
        echo "$description" >> "$copilot_file"
        echo "" >> "$copilot_file"
    fi
    
    echo "## Instructions" >> "$copilot_file"
    echo "" >> "$copilot_file"
    echo "$agent_body" >> "$copilot_file"
    
    # Add usage note
    cat >> "$copilot_file" << 'USAGE_END'

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

USAGE_END
    
    CONVERTED=$((CONVERTED + 1))
    echo -e "${GREEN}  ✓ Created: $copilot_file${NC}"
}

# Convert all Claude command files
if [ -d "$CLAUDE_DIR" ]; then
    for file in "$CLAUDE_DIR"/*.md; do
        if [ -f "$file" ]; then
            convert_agent "$file"
        fi
    done
else
    echo -e "${YELLOW}Warning: .claude/commands/ directory not found${NC}"
fi

# Create README for Copilot agents
cat > "$COPILOT_DIR/README.md" << 'README_END'
# GitHub Copilot CLI Custom Agents

This directory contains custom agent definitions converted from Claude Code format.

## Usage

These agents are used via the GitHub Copilot CLI's `task` tool. Instead of slash commands like `/coder`, you invoke agents programmatically:

### Example: Using the Ruthless Coder Agent

```
task(
  agent_type="task",
  description="Implement user authentication",
  prompt="Implement a user authentication service with JWT tokens. Use ruthless-coder.md standards: full spec validation, TDD, comprehensive error handling, logging."
)
```

### Example: Using the Architect Agent

```
task(
  agent_type="task",
  description="Architecture review",
  prompt="Review the authentication system architecture. Apply cold-blooded-architect.md standards: challenge assumptions, demand RACI, security review."
)
```

## Available Agents

All agents from `.claude/commands/` have been converted and are available in this directory.

## Shared Modules

The `agents/` directory contains shared protocols referenced by all agents:
- `_context-discipline.md` - Token management
- `_tdd-protocol.md` - Test-driven development
- `_agent-protocol.md` - Inter-agent communication
- And more...

These shared modules are referenced in the agent instructions and should be made available in the context when invoking agents.

## Installation

Run the main installer with platform selection:

```bash
~/path/to/skillfoundry/install.sh
# Choose: GitHub Copilot CLI when prompted
```

This will copy the necessary agent files to your project.
README_END

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗"
echo "║              Conversion Complete!                         ║"
echo "╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Converted: $CONVERTED agents"
echo "Output: $COPILOT_DIR"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review converted agents in $COPILOT_DIR"
echo "2. Run install.sh and select 'GitHub Copilot CLI' platform"
echo ""

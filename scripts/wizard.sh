#!/bin/bash

# Claude AS - Quick Start Wizard
# Interactive wizard for first-time setup and project initialization
#
# USAGE:
#   ./scripts/wizard.sh
#   OR from framework root:
#   bash scripts/wizard.sh

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

# Get script directory (framework root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Banner
echo -e "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        Claude AS Framework - Quick Start Wizard          ║"
echo "║        Get started in 5 minutes!                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Platform Selection
select_platform() {
    echo -e "${BLUE}Step 1: Select your AI platform${NC}"
    echo ""
    echo "Which AI coding tool are you using?"
    echo "  1) Claude Code (Terminal-based)"
    echo "  2) GitHub Copilot CLI"
    echo "  3) Cursor (VS Code fork)"
    echo ""
    read -p "Enter choice (1-3): " -n 1 -r
    echo ""
    
    case $REPLY in
        1) echo "claude" ;;
        2) echo "copilot" ;;
        3) echo "cursor" ;;
        *)
            echo -e "${RED}Invalid choice.${NC}"
            exit 1
            ;;
    esac
}

# Step 2: Project Type Selection
select_project_type() {
    echo ""
    echo -e "${BLUE}Step 2: Select project type${NC}"
    echo ""
    echo "What are you building?"
    echo "  1) Web Application (Frontend + Backend)"
    echo "  2) REST API (Backend only)"
    echo "  3) CLI Tool (Command-line application)"
    echo "  4) Library/Package (Reusable code)"
    echo "  5) Other / Custom"
    echo ""
    read -p "Enter choice (1-5): " -n 1 -r
    echo ""
    
    case $REPLY in
        1) echo "web-app" ;;
        2) echo "api" ;;
        3) echo "cli" ;;
        4) echo "library" ;;
        5) echo "custom" ;;
        *)
            echo -e "${RED}Invalid choice.${NC}"
            exit 1
            ;;
    esac
}

# Step 3: Tech Stack Selection
select_tech_stack() {
    local project_type=$1
    
    echo ""
    echo -e "${BLUE}Step 3: Select tech stack${NC}"
    echo ""
    
    case $project_type in
        web-app)
            echo "Frontend framework:"
            echo "  1) React"
            echo "  2) Angular"
            echo "  3) Vue.js"
            echo "  4) Vanilla HTML/JS"
            echo "  5) Other"
            read -p "Choice (1-5): " -n 1 -r
            echo ""
            FRONTEND=$(case $REPLY in 1) echo "react" ;; 2) echo "angular" ;; 3) echo "vue" ;; 4) echo "vanilla" ;; *) echo "other" ;; esac)
            
            echo ""
            echo "Backend framework:"
            echo "  1) Node.js (Express/Fastify)"
            echo "  2) Python (FastAPI)"
            echo "  3) Python (Django)"
            echo "  4) .NET (C#)"
            echo "  5) Other"
            read -p "Choice (1-5): " -n 1 -r
            echo ""
            BACKEND=$(case $REPLY in 1) echo "nodejs" ;; 2) echo "fastapi" ;; 3) echo "django" ;; 4) echo "dotnet" ;; *) echo "other" ;; esac)
            
            echo "$FRONTEND|$BACKEND"
            ;;
        api)
            echo "Backend framework:"
            echo "  1) Node.js (Express/Fastify)"
            echo "  2) Python (FastAPI)"
            echo "  3) Python (Django)"
            echo "  4) .NET (C#)"
            echo "  5) Go"
            echo "  6) Other"
            read -p "Choice (1-6): " -n 1 -r
            echo ""
            case $REPLY in
                1) echo "nodejs" ;;
                2) echo "fastapi" ;;
                3) echo "django" ;;
                4) echo "dotnet" ;;
                5) echo "go" ;;
                *) echo "other" ;;
            esac
            ;;
        cli)
            echo "Language:"
            echo "  1) Python"
            echo "  2) Node.js (JavaScript/TypeScript)"
            echo "  3) Go"
            echo "  4) Rust"
            echo "  5) Other"
            read -p "Choice (1-5): " -n 1 -r
            echo ""
            case $REPLY in
                1) echo "python" ;;
                2) echo "nodejs" ;;
                3) echo "go" ;;
                4) echo "rust" ;;
                *) echo "other" ;;
            esac
            ;;
        library)
            echo "Language:"
            echo "  1) Python"
            echo "  2) Node.js (JavaScript/TypeScript)"
            echo "  3) Go"
            echo "  4) Rust"
            echo "  5) Other"
            read -p "Choice (1-5): " -n 1 -r
            echo ""
            case $REPLY in
                1) echo "python" ;;
                2) echo "nodejs" ;;
                3) echo "go" ;;
                4) echo "rust" ;;
                *) echo "other" ;;
            esac
            ;;
        *)
            echo "Custom project - no preset templates"
            echo "custom"
            ;;
    esac
}

# Step 4: Generate Starter PRD
generate_starter_prd() {
    local project_type=$1
    local tech_stack=$2

    echo ""
    echo -e "${BLUE}Step 4: Generate starter PRD${NC}"
    echo ""
    read -p "Project name: " PROJECT_NAME
    read -p "Brief description: " PROJECT_DESC

    # Create genesis directory if it doesn't exist
    mkdir -p genesis

    # Generate PRD based on template
    PRD_FILE="genesis/${PROJECT_NAME// /-}-initial.md"

    # Map project type to template file
    local template_file=""
    case "$project_type" in
        web-app)  template_file="$SCRIPT_DIR/templates/prd-web-app.md" ;;
        api)      template_file="$SCRIPT_DIR/templates/prd-api.md" ;;
        cli)      template_file="$SCRIPT_DIR/templates/prd-cli.md" ;;
        library)  template_file="$SCRIPT_DIR/templates/prd-library.md" ;;
    esac

    local project_name_kebab="${PROJECT_NAME// /-}"
    project_name_kebab=$(echo "$project_name_kebab" | tr '[:upper:]' '[:lower:]')
    local current_date
    current_date=$(date +%Y-%m-%d)

    if [ -n "$template_file" ] && [ -f "$template_file" ]; then
        # Use template: substitute variables
        sed \
            -e "s|{{PROJECT_NAME}}|${PROJECT_NAME}|g" \
            -e "s|{{PROJECT_NAME_KEBAB}}|${project_name_kebab}|g" \
            -e "s|{{PROJECT_NAME_UPPER}}|$(echo "${project_name_kebab}" | tr '[:lower:]' '[:upper:]' | tr '-' '_')|g" \
            -e "s|{{PROJECT_DESC}}|${PROJECT_DESC}|g" \
            -e "s|{{DATE}}|${current_date}|g" \
            -e "s|{{TECH_STACK}}|${tech_stack}|g" \
            "$template_file" > "$PRD_FILE"
        echo -e "${GREEN}✓${NC} Created PRD from template: $PRD_FILE"
    else
        # Fallback: generate basic inline PRD for custom/unknown types
        cat > "$PRD_FILE" <<EOF
# PRD: $PROJECT_NAME

**Version:** 1.0
**Status:** DRAFT
**Created:** $current_date
**Author:** Quick Start Wizard

---

## 1. Overview

### 1.1 Problem Statement
$PROJECT_DESC

### 1.2 Proposed Solution
Build a $project_type using $tech_stack to solve the problem described above.

### 1.3 Success Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Feature completeness | 0% | 100% | All user stories implemented |
| Test coverage | 0% | 80%+ | Automated test suite |

---

## 2. User Stories

### Primary User: End User
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | user | [define first feature] | [benefit] | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features
| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Initial Feature | [Describe first feature] | Given [context], When [action], Then [result] |

---

## 4. Technical Specifications

### 4.1 Tech Stack
- **Type**: $project_type
- **Stack**: $tech_stack

---

**Next Steps:**
1. Review and refine this PRD
2. Run: /go (or use your platform's equivalent command)
3. Start implementing!

EOF
        echo -e "${GREEN}✓${NC} Created starter PRD: $PRD_FILE"
    fi
    echo "$PRD_FILE"
}

# Main wizard flow
main() {
    PLATFORM=$(select_platform)
    PROJECT_TYPE=$(select_project_type)
    TECH_STACK=$(select_tech_stack "$PROJECT_TYPE")
    
    echo ""
    echo -e "${CYAN}${BOLD}Summary:${NC}${BOLD}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Platform: $PLATFORM"
    echo "  Project Type: $PROJECT_TYPE"
    echo "  Tech Stack: $TECH_STACK"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    read -p "Install framework and generate starter PRD? (Y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Wizard cancelled.${NC}"
        exit 0
    fi
    
    # Install framework
    echo ""
    echo -e "${BLUE}Installing framework...${NC}"
    "$SCRIPT_DIR/install.sh" --platform="$PLATFORM" .
    
    # Generate starter PRD
    PRD_FILE=$(generate_starter_prd "$PROJECT_TYPE" "$TECH_STACK")
    
    echo ""
    echo -e "${GREEN}${BOLD}✓ Setup Complete!${NC}${BOLD}"
    echo ""
    echo "Next steps:"
    echo "  1. Review PRD: cat $PRD_FILE"
    echo "  2. Edit PRD: Add your specific requirements"
    case $PLATFORM in
        claude)
            echo "  3. Start Claude Code: claude"
            echo "  4. Implement: /go"
            ;;
        copilot)
            echo "  3. View available agents: ls .copilot/custom-agents/"
            echo "  4. Read workflow guide: cat .copilot/WORKFLOW-GUIDE.md"
            ;;
        cursor)
            echo "  3. Open Cursor IDE"
            echo "  4. Use in chat: \"use go rule\" to start implementation"
            ;;
    esac
    echo ""
}

# Run wizard
main

#!/bin/bash

# A2A Protocol Agent Cards for Claude AS Framework
# Generates A2A-compatible agent card JSON for discovery and interoperability.
# Follows Google/Linux Foundation Agent-to-Agent (A2A) specification.
#
# USAGE:
#   ./scripts/a2a-server.sh card <agent>           Output A2A agent card JSON
#   ./scripts/a2a-server.sh cards                  Output all agent cards as JSON array
#   ./scripts/a2a-server.sh discover               List all discoverable agents
#   ./scripts/a2a-server.sh validate <card.json>   Validate an agent card
#   ./scripts/a2a-server.sh --help                 Show help

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

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"
AGENTS_DIR="$FRAMEWORK_DIR/agents"
VERSION_FILE="$FRAMEWORK_DIR/.version"

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "A2A Protocol Agent Cards — Claude AS Framework"
    echo ""
    echo "Generates A2A-compatible agent cards for discovery and interoperability."
    echo "Follows the Google/Linux Foundation Agent-to-Agent (A2A) specification."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/a2a-server.sh <command> [args]"
    echo ""
    echo "COMMANDS:"
    echo "  card <agent>          Output A2A agent card JSON for a specific agent"
    echo "  cards                 Output all agent cards as a JSON array"
    echo "  discover              List all discoverable agents (name + description)"
    echo "  validate <file.json>  Validate an A2A agent card file"
    echo ""
    echo "OPTIONS:"
    echo "  --help                Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  a2a-server.sh card coder            # Get coder agent card"
    echo "  a2a-server.sh cards | jq length      # Count all agent cards"
    echo "  a2a-server.sh discover               # List agents with descriptions"
    echo "  a2a-server.sh validate my-card.json  # Validate a card file"
}

# ═══════════════════════════════════════════════════════════════
# AGENT SKILLS MAPPING
# ═══════════════════════════════════════════════════════════════

# Returns JSON array of skills for a given agent command name
get_agent_skills() {
    local agent="$1"
    case "$agent" in
        coder)
            echo '[{"id":"code-generation","name":"Code Generation","description":"Generate production-ready code with tests"},{"id":"tdd","name":"Test-Driven Development","description":"Write tests first, then implementation"},{"id":"bug-fix","name":"Bug Fix","description":"Diagnose and fix bugs with regression tests"}]'
            ;;
        architect)
            echo '[{"id":"system-design","name":"System Design","description":"Design system architecture and component interactions"},{"id":"api-design","name":"API Design","description":"Design RESTful and GraphQL API interfaces"},{"id":"data-modeling","name":"Data Modeling","description":"Design database schemas and data relationships"}]'
            ;;
        tester)
            echo '[{"id":"test-generation","name":"Test Generation","description":"Generate comprehensive test suites"},{"id":"test-execution","name":"Test Execution","description":"Run and analyze test results"},{"id":"coverage-analysis","name":"Coverage Analysis","description":"Measure and improve code coverage"}]'
            ;;
        security|security-scanner)
            echo '[{"id":"security-audit","name":"Security Audit","description":"Comprehensive security assessment"},{"id":"threat-modeling","name":"Threat Modeling","description":"Identify and assess security threats"},{"id":"vulnerability-scan","name":"Vulnerability Scan","description":"Detect known vulnerabilities in code and dependencies"}]'
            ;;
        gate-keeper)
            echo '[{"id":"code-review","name":"Code Review","description":"Review code for quality and correctness"},{"id":"quality-gate","name":"Quality Gate","description":"Enforce quality standards before merge"},{"id":"compliance-check","name":"Compliance Check","description":"Verify code meets compliance requirements"}]'
            ;;
        evaluator)
            echo '[{"id":"project-evaluation","name":"Project Evaluation","description":"Evaluate project quality and completeness"},{"id":"scoring","name":"Scoring","description":"Score deliverables against criteria"}]'
            ;;
        docs)
            echo '[{"id":"documentation","name":"Documentation","description":"Generate technical documentation"},{"id":"api-docs","name":"API Documentation","description":"Generate API reference documentation"}]'
            ;;
        refactor)
            echo '[{"id":"code-refactoring","name":"Code Refactoring","description":"Restructure code without changing behavior"},{"id":"pattern-application","name":"Pattern Application","description":"Apply design patterns to existing code"}]'
            ;;
        fixer)
            echo '[{"id":"auto-fix","name":"Auto Fix","description":"Automatically fix common code issues"},{"id":"lint-fix","name":"Lint Fix","description":"Fix linting and formatting issues"}]'
            ;;
        debugger)
            echo '[{"id":"debugging","name":"Debugging","description":"Systematic bug diagnosis and resolution"},{"id":"root-cause-analysis","name":"Root Cause Analysis","description":"Identify underlying causes of failures"}]'
            ;;
        senior-engineer)
            echo '[{"id":"code-generation","name":"Code Generation","description":"Senior-level implementation with best practices"},{"id":"code-review","name":"Code Review","description":"Expert code review and feedback"}]'
            ;;
        tech-lead)
            echo '[{"id":"technical-leadership","name":"Technical Leadership","description":"Guide technical decisions and architecture"},{"id":"story-breakdown","name":"Story Breakdown","description":"Decompose features into implementable stories"}]'
            ;;
        prd)
            echo '[{"id":"prd-generation","name":"PRD Generation","description":"Generate product requirements documents"},{"id":"requirements-analysis","name":"Requirements Analysis","description":"Analyze and refine project requirements"}]'
            ;;
        stories)
            echo '[{"id":"story-generation","name":"Story Generation","description":"Generate implementation stories from PRDs"},{"id":"acceptance-criteria","name":"Acceptance Criteria","description":"Define testable acceptance criteria"}]'
            ;;
        review)
            echo '[{"id":"code-review","name":"Code Review","description":"Review code changes for quality"},{"id":"pr-review","name":"PR Review","description":"Review pull requests with actionable feedback"}]'
            ;;
        performance)
            echo '[{"id":"performance-profiling","name":"Performance Profiling","description":"Identify performance bottlenecks"},{"id":"optimization","name":"Optimization","description":"Optimize code for speed and efficiency"}]'
            ;;
        ops)
            echo '[{"id":"ops-tooling","name":"Ops Tooling","description":"Generate operational tools and scripts"},{"id":"monitoring","name":"Monitoring","description":"Set up monitoring and alerting"}]'
            ;;
        devops)
            echo '[{"id":"ci-cd","name":"CI/CD","description":"Configure continuous integration and deployment"},{"id":"infrastructure","name":"Infrastructure","description":"Manage infrastructure as code"}]'
            ;;
        sre)
            echo '[{"id":"reliability","name":"Reliability Engineering","description":"Improve system reliability and uptime"},{"id":"incident-response","name":"Incident Response","description":"Handle and learn from incidents"}]'
            ;;
        migration)
            echo '[{"id":"database-migration","name":"Database Migration","description":"Create and manage database migrations"},{"id":"schema-evolution","name":"Schema Evolution","description":"Evolve database schemas safely"}]'
            ;;
        data-architect)
            echo '[{"id":"data-modeling","name":"Data Modeling","description":"Design database schemas"},{"id":"query-optimization","name":"Query Optimization","description":"Optimize database queries and indexes"}]'
            ;;
        api-design)
            echo '[{"id":"api-design","name":"API Design","description":"Design RESTful APIs with best practices"},{"id":"contract-design","name":"Contract Design","description":"Define API contracts and schemas"}]'
            ;;
        i18n)
            echo '[{"id":"internationalization","name":"Internationalization","description":"Prepare code for multiple languages"},{"id":"localization","name":"Localization","description":"Adapt content for specific locales"}]'
            ;;
        accessibility)
            echo '[{"id":"a11y-audit","name":"Accessibility Audit","description":"Audit UI for accessibility compliance"},{"id":"a11y-fix","name":"Accessibility Fix","description":"Fix accessibility issues"}]'
            ;;
        ux-ui)
            echo '[{"id":"ui-design","name":"UI Design","description":"Design user interfaces"},{"id":"ux-review","name":"UX Review","description":"Review and improve user experience"}]'
            ;;
        memory)
            echo '[{"id":"knowledge-management","name":"Knowledge Management","description":"Manage and curate project knowledge"},{"id":"context-retrieval","name":"Context Retrieval","description":"Retrieve relevant context from memory"}]'
            ;;
        learn)
            echo '[{"id":"learning-guide","name":"Learning Guide","description":"Guide AI-assisted development learning"},{"id":"best-practices","name":"Best Practices","description":"Teach development best practices"}]'
            ;;
        math-check)
            echo '[{"id":"mathematical-verification","name":"Mathematical Verification","description":"Verify mathematical correctness of algorithms"}]'
            ;;
        dependency)
            echo '[{"id":"dependency-management","name":"Dependency Management","description":"Manage project dependencies and versions"}]'
            ;;
        release)
            echo '[{"id":"release-management","name":"Release Management","description":"Manage versioning and release process"}]'
            ;;
        *)
            # Default: generic agent skill
            echo '[{"id":"general","name":"General Agent","description":"General-purpose agent capability"}]'
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════
# CARD GENERATION
# ═══════════════════════════════════════════════════════════════

# Extract field from agent frontmatter
extract_frontmatter() {
    local file="$1"
    local field="$2"
    sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | sed "s/^${field}:[[:space:]]*//" | head -1
}

# Get framework version
get_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE"
    else
        echo "unknown"
    fi
}

# Generate A2A card for a single agent definition file
generate_card_from_file() {
    local agent_file="$1"
    local name
    name=$(extract_frontmatter "$agent_file" "name")
    local command
    command=$(extract_frontmatter "$agent_file" "command")
    local description
    description=$(extract_frontmatter "$agent_file" "description")

    # Use command name if available, otherwise use name
    local agent_id="${command:-$name}"
    if [ -z "$agent_id" ]; then
        return 1
    fi

    # Truncate description for the card (first sentence or 200 chars)
    local short_desc
    short_desc=$(echo "$description" | sed 's/Use this agent when you need to //' | cut -c1-200 | sed 's/[[:space:]]*$//')

    local version
    version=$(get_version)

    local skills
    skills=$(get_agent_skills "$agent_id")

    jq -nc \
        --arg name "$agent_id" \
        --arg desc "$short_desc" \
        --arg version "$version" \
        --argjson skills "$skills" \
        '{
            name: $name,
            description: $desc,
            url: ("http://localhost:8080/a2a/" + $name),
            version: $version,
            capabilities: {
                streaming: false,
                pushNotifications: false,
                stateTransitionHistory: true
            },
            skills: $skills,
            inputModes: ["text"],
            outputModes: ["text"]
        }'
}

# Generate card for a command name (searches agents dir)
generate_card() {
    local target="$1"

    # Search for agent by command name
    for agent_file in "$AGENTS_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        # Skip shared modules (start with _)
        local basename
        basename=$(basename "$agent_file")
        [[ "$basename" == _* ]] && continue

        local command
        command=$(extract_frontmatter "$agent_file" "command")
        if [ "$command" = "$target" ]; then
            generate_card_from_file "$agent_file"
            return 0
        fi
    done

    # Also check .claude/commands/ for commands without agent definitions
    local cmd_file="$FRAMEWORK_DIR/.claude/commands/${target}.md"
    if [ -f "$cmd_file" ]; then
        local version
        version=$(get_version)
        local skills
        skills=$(get_agent_skills "$target")
        jq -nc \
            --arg name "$target" \
            --arg version "$version" \
            --argjson skills "$skills" \
            '{
                name: $name,
                description: ("Claude AS agent: " + $name),
                url: ("http://localhost:8080/a2a/" + $name),
                version: $version,
                capabilities: {streaming: false, pushNotifications: false, stateTransitionHistory: true},
                skills: $skills,
                inputModes: ["text"],
                outputModes: ["text"]
            }'
        return 0
    fi

    echo -e "${RED}Error: agent '$target' not found${NC}" >&2
    return 1
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_card() {
    local agent="${1:-}"
    if [ -z "$agent" ]; then
        echo -e "${RED}Error: agent name required${NC}" >&2
        echo "Usage: a2a-server.sh card <agent>" >&2
        exit 1
    fi
    generate_card "$agent"
}

cmd_cards() {
    local cards=()
    local count=0

    # Collect from agent definitions
    for agent_file in "$AGENTS_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        local basename
        basename=$(basename "$agent_file")
        [[ "$basename" == _* ]] && continue

        local command
        command=$(extract_frontmatter "$agent_file" "command")
        [ -z "$command" ] && continue

        local card
        card=$(generate_card_from_file "$agent_file" 2>/dev/null) || continue
        cards+=("$card")
        count=$((count + 1))
    done

    # Also collect commands without agent definitions
    local seen_commands=""
    for agent_file in "$AGENTS_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        local basename
        basename=$(basename "$agent_file")
        [[ "$basename" == _* ]] && continue
        local cmd
        cmd=$(extract_frontmatter "$agent_file" "command")
        [ -n "$cmd" ] && seen_commands="$seen_commands $cmd "
    done

    for cmd_file in "$FRAMEWORK_DIR/.claude/commands"/*.md; do
        [ -f "$cmd_file" ] || continue
        local cmd
        cmd=$(basename "$cmd_file" .md)
        # Skip if already seen from agents/
        if echo "$seen_commands" | grep -qF " $cmd "; then
            continue
        fi
        local version
        version=$(get_version)
        local skills
        skills=$(get_agent_skills "$cmd")
        local card
        card=$(jq -nc \
            --arg name "$cmd" \
            --arg version "$version" \
            --argjson skills "$skills" \
            '{
                name: $name,
                description: ("Claude AS agent: " + $name),
                url: ("http://localhost:8080/a2a/" + $name),
                version: $version,
                capabilities: {streaming: false, pushNotifications: false, stateTransitionHistory: true},
                skills: $skills,
                inputModes: ["text"],
                outputModes: ["text"]
            }')
        cards+=("$card")
        count=$((count + 1))
    done

    # Output as JSON array
    printf '%s\n' "${cards[@]}" | jq -s '.'
}

cmd_discover() {
    echo -e "${CYAN}${BOLD}DISCOVERABLE A2A AGENTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local count=0

    # From agent definitions
    for agent_file in "$AGENTS_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        local basename
        basename=$(basename "$agent_file")
        [[ "$basename" == _* ]] && continue

        local command
        command=$(extract_frontmatter "$agent_file" "command")
        [ -z "$command" ] && continue

        local description
        description=$(extract_frontmatter "$agent_file" "description")
        local short_desc
        short_desc=$(echo "$description" | cut -c1-80 | sed 's/[[:space:]]*$//')

        printf "  ${GREEN}%-20s${NC} %s\n" "$command" "$short_desc"
        count=$((count + 1))
    done

    # From commands without agent definitions
    local seen_commands=""
    for agent_file in "$AGENTS_DIR"/*.md; do
        [ -f "$agent_file" ] || continue
        local basename
        basename=$(basename "$agent_file")
        [[ "$basename" == _* ]] && continue
        local cmd
        cmd=$(extract_frontmatter "$agent_file" "command")
        [ -n "$cmd" ] && seen_commands="$seen_commands $cmd "
    done

    for cmd_file in "$FRAMEWORK_DIR/.claude/commands"/*.md; do
        [ -f "$cmd_file" ] || continue
        local cmd
        cmd=$(basename "$cmd_file" .md)
        if echo "$seen_commands" | grep -qF " $cmd "; then
            continue
        fi
        printf "  ${YELLOW}%-20s${NC} %s\n" "$cmd" "(command-only agent)"
        count=$((count + 1))
    done

    echo ""
    echo -e "Total agents: ${BOLD}$count${NC}"
}

cmd_validate() {
    local card_file="${1:-}"
    if [ -z "$card_file" ]; then
        echo -e "${RED}Error: card file path required${NC}" >&2
        echo "Usage: a2a-server.sh validate <card.json>" >&2
        exit 1
    fi

    if [ ! -f "$card_file" ]; then
        echo -e "${RED}[FAIL]${NC} File not found: $card_file"
        exit 1
    fi

    local errors=0

    # Check valid JSON
    if ! jq empty "$card_file" 2>/dev/null; then
        echo -e "${RED}[FAIL]${NC} Invalid JSON"
        exit 1
    fi

    # Required fields per A2A spec
    local required_fields=("name" "description" "url" "version" "capabilities" "skills")
    for field in "${required_fields[@]}"; do
        local value
        value=$(jq -r --arg f "$field" '.[$f] // empty' "$card_file")
        if [ -z "$value" ] || [ "$value" = "null" ]; then
            echo -e "${RED}[FAIL]${NC} Missing required field: $field"
            errors=$((errors + 1))
        fi
    done

    # Check capabilities object
    local caps_fields=("streaming" "pushNotifications" "stateTransitionHistory")
    for field in "${caps_fields[@]}"; do
        local value
        value=$(jq -r --arg f "$field" '.capabilities[$f] // empty' "$card_file")
        if [ -z "$value" ]; then
            echo -e "${YELLOW}[WARN]${NC} Missing capability field: $field"
        fi
    done

    # Check skills is an array with at least one entry
    local skills_count
    skills_count=$(jq '.skills | length' "$card_file" 2>/dev/null || echo "0")
    if [ "$skills_count" -eq 0 ]; then
        echo -e "${RED}[FAIL]${NC} Skills array is empty or missing"
        errors=$((errors + 1))
    fi

    # Check each skill has required fields
    local skill_errors=0
    for i in $(seq 0 $((skills_count - 1))); do
        for field in "id" "name" "description"; do
            local value
            value=$(jq -r --argjson i "$i" --arg f "$field" '.skills[$i][$f] // empty' "$card_file")
            if [ -z "$value" ]; then
                echo -e "${RED}[FAIL]${NC} Skill[$i] missing field: $field"
                skill_errors=$((skill_errors + 1))
            fi
        done
    done
    errors=$((errors + skill_errors))

    # Check inputModes and outputModes
    for mode_field in "inputModes" "outputModes"; do
        local mode_count
        mode_count=$(jq --arg f "$mode_field" '.[$f] | length' "$card_file" 2>/dev/null || echo "0")
        if [ "$mode_count" -eq 0 ]; then
            echo -e "${YELLOW}[WARN]${NC} $mode_field is empty or missing"
        fi
    done

    if [ "$errors" -eq 0 ]; then
        echo -e "${GREEN}[PASS]${NC} Agent card is valid ($(jq -r '.name' "$card_file"))"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} Validation failed with $errors error(s)"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
    card)
        cmd_card "$@"
        ;;
    cards)
        cmd_cards
        ;;
    discover)
        cmd_discover
        ;;
    validate)
        cmd_validate "$@"
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {card|cards|discover|validate} [args]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

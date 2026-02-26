#!/bin/bash

# Project Registry Manager - CRUD operations for .project-registry
# Tracks all projects installed with the SkillFoundry Framework
#
# USAGE:
#   ./scripts/registry.sh register /path/to/project [--platform=claude]
#   ./scripts/registry.sh unregister /path/to/project
#   ./scripts/registry.sh list
#   ./scripts/registry.sh dashboard
#   ./scripts/registry.sh status /path/to/project
#   ./scripts/registry.sh update-meta /path/to/project --key=value

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Framework directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY_FILE="$FRAMEWORK_DIR/.project-registry"
REGISTRY_META="$FRAMEWORK_DIR/.project-registry-meta.jsonl"

# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

resolve_path() {
    local path="$1"
    if [ "$path" = "." ]; then
        pwd
    elif [ -d "$path" ]; then
        (cd "$path" && pwd)
    else
        echo "$path"
    fi
}

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

get_project_version() {
    local project_dir="$1"
    for platform_dir in ".claude" ".copilot" ".cursor"; do
        if [ -f "$project_dir/$platform_dir/.framework-version" ]; then
            cat "$project_dir/$platform_dir/.framework-version" | tr -d '[:space:]'
            return
        fi
    done
    echo "0.0.0.0"
}

get_meta() {
    local project_path="$1"
    if [ -f "$REGISTRY_META" ]; then
        grep -F "\"path\":\"$project_path\"" "$REGISTRY_META" 2>/dev/null | tail -1
    fi
}

set_meta() {
    local project_path="$1"
    local key="$2"
    local value="$3"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ ! -f "$REGISTRY_META" ]; then
        touch "$REGISTRY_META"
    fi

    local existing
    existing=$(get_meta "$project_path")

    if [ -n "$existing" ]; then
        # Update existing entry
        local updated
        updated=$(echo "$existing" | jq -c --arg k "$key" --arg v "$value" --arg t "$timestamp" '. + {($k): $v, "updated_at": $t}' 2>/dev/null)
        if [ -n "$updated" ]; then
            local temp_file
            temp_file=$(mktemp)
            grep -v -F "\"path\":\"$project_path\"" "$REGISTRY_META" > "$temp_file" 2>/dev/null || true
            echo "$updated" >> "$temp_file"
            mv "$temp_file" "$REGISTRY_META"
        fi
    else
        # Create new entry
        local entry
        entry=$(jq -nc \
            --arg path "$project_path" \
            --arg k "$key" \
            --arg v "$value" \
            --arg t "$timestamp" \
            '{path: $path, platform: "unknown", framework_version: "0.0.0.0", last_updated: $t, last_harvested: null, knowledge_count: 0, health_status: "unknown", total_go_runs: 0, total_tokens_used: 0, ($k): $v, created_at: $t, updated_at: $t}' 2>/dev/null)
        echo "$entry" >> "$REGISTRY_META"
    fi
}

count_knowledge() {
    local project_dir="$1"
    local count=0
    if [ -d "$project_dir/memory_bank/knowledge" ]; then
        for f in "$project_dir/memory_bank/knowledge/"*.jsonl; do
            if [ -f "$f" ] && [ -s "$f" ]; then
                local lines
                lines=$(wc -l < "$f" 2>/dev/null || echo "0")
                count=$((count + lines))
            fi
        done
    fi
    echo "$count"
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_register() {
    local project_path="$1"
    local platform="${2:-}"

    if [ -z "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Project path required"
        exit 1
    fi

    project_path=$(resolve_path "$project_path")

    if [ ! -d "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Directory not found: $project_path"
        exit 1
    fi

    # Auto-detect platform if not provided
    if [ -z "$platform" ]; then
        platform=$(detect_platform "$project_path")
    fi

    # Check if already registered
    if [ -f "$REGISTRY_FILE" ] && grep -qF "$project_path" "$REGISTRY_FILE" 2>/dev/null; then
        echo -e "${YELLOW}[WARN]${NC} Already registered: $project_path"
        return 0
    fi

    # Add to simple registry
    echo "$project_path" >> "$REGISTRY_FILE"

    # Add metadata
    local version
    version=$(get_project_version "$project_path")
    local knowledge
    knowledge=$(count_knowledge "$project_path")
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local meta
    meta=$(jq -nc \
        --arg path "$project_path" \
        --arg platform "$platform" \
        --arg version "$version" \
        --arg t "$timestamp" \
        --argjson kc "$knowledge" \
        '{path: $path, platform: $platform, framework_version: $version, last_updated: $t, last_harvested: null, knowledge_count: $kc, health_status: "healthy", total_go_runs: 0, total_tokens_used: 0, created_at: $t, updated_at: $t}' 2>/dev/null)
    echo "$meta" >> "$REGISTRY_META"

    echo -e "${GREEN}[PASS]${NC} Registered: $project_path"
    echo -e "  Platform: $platform"
    echo -e "  Version: $version"
    echo -e "  Knowledge entries: $knowledge"
}

cmd_unregister() {
    local project_path="$1"

    if [ -z "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Project path required"
        exit 1
    fi

    project_path=$(resolve_path "$project_path")

    if [ ! -f "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}[WARN]${NC} No registry file found"
        return 0
    fi

    # Confirmation
    if [ "${FORCE:-}" != "true" ]; then
        echo -e "${YELLOW}Remove $project_path from registry?${NC}"
        read -p "Continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}[WARN]${NC} Cancelled"
            exit 2
        fi
    fi

    # Remove from simple registry
    local temp_file
    temp_file=$(mktemp)
    grep -v -F "$project_path" "$REGISTRY_FILE" > "$temp_file" 2>/dev/null || true
    mv "$temp_file" "$REGISTRY_FILE"

    # Remove from metadata
    if [ -f "$REGISTRY_META" ]; then
        temp_file=$(mktemp)
        grep -v -F "\"path\":\"$project_path\"" "$REGISTRY_META" > "$temp_file" 2>/dev/null || true
        mv "$temp_file" "$REGISTRY_META"
    fi

    echo -e "${GREEN}[PASS]${NC} Unregistered: $project_path"
}

cmd_list() {
    echo -e "${CYAN}REGISTERED PROJECTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -f "$REGISTRY_FILE" ] || [ ! -s "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}[INFO]${NC} No projects registered"
        echo ""
        echo "Register a project:"
        echo "  ./scripts/registry.sh register /path/to/project"
        return 0
    fi

    local count=0
    while IFS= read -r project_path; do
        if [ -n "$project_path" ]; then
            count=$((count + 1))
            local version
            version=$(get_project_version "$project_path")
            local platform
            platform=$(detect_platform "$project_path")
            local status_icon

            if [ ! -d "$project_path" ]; then
                status_icon="${RED}[NOT FOUND]${NC}"
            else
                local fw_version
                fw_version=$(cat "$FRAMEWORK_DIR/.version" 2>/dev/null | tr -d '[:space:]')
                if [ "$version" = "$fw_version" ]; then
                    status_icon="${GREEN}[UP TO DATE]${NC}"
                else
                    status_icon="${YELLOW}[v$version]${NC}"
                fi
            fi

            echo -e "  $count. $project_path"
            echo -e "     Platform: $platform | Version: $version | $status_icon"
        fi
    done < "$REGISTRY_FILE"

    echo ""
    echo -e "${CYAN}[INFO]${NC} $count project(s) registered"
}

cmd_dashboard() {
    local fw_version
    fw_version=$(cat "$FRAMEWORK_DIR/.version" 2>/dev/null | tr -d '[:space:]')

    echo -e "${CYAN}PROJECT REGISTRY DASHBOARD${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Framework Version: ${GREEN}$fw_version${NC}    Date: $(date +%Y-%m-%d)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -f "$REGISTRY_FILE" ] || [ ! -s "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}[INFO]${NC} No projects registered"
        return 0
    fi

    # Header
    printf "%-4s %-40s %-8s %-10s %-8s %-12s %-10s\n" "#" "PROJECT" "PLATFORM" "VERSION" "HEALTH" "KNOWLEDGE" "HARVESTED"
    echo "────────────────────────────────────────────────────────────────────────────────"

    local count=0
    local healthy=0
    local outdated=0
    local missing=0
    local total_knowledge=0

    while IFS= read -r project_path; do
        if [ -n "$project_path" ]; then
            count=$((count + 1))

            if [ ! -d "$project_path" ]; then
                printf "%-4s %-40s %-8s %-10s %-8s %-12s %-10s\n" \
                    "$count" "$(basename "$project_path")" "-" "-" "MISSING" "-" "-"
                missing=$((missing + 1))
                continue
            fi

            local version
            version=$(get_project_version "$project_path")
            local platform
            platform=$(detect_platform "$project_path")
            local knowledge
            knowledge=$(count_knowledge "$project_path")
            total_knowledge=$((total_knowledge + knowledge))

            local health="OK"
            if [ "$version" != "$fw_version" ]; then
                health="OUTDATED"
                outdated=$((outdated + 1))
            else
                healthy=$((healthy + 1))
            fi

            # Get last harvested from metadata
            local last_harvested="-"
            local meta
            meta=$(get_meta "$project_path")
            if [ -n "$meta" ]; then
                local lh
                lh=$(echo "$meta" | jq -r '.last_harvested // "-"' 2>/dev/null)
                if [ "$lh" != "null" ] && [ "$lh" != "-" ]; then
                    last_harvested="${lh:0:10}"
                fi
            fi

            local display_path
            display_path=$(basename "$project_path")
            if [ ${#display_path} -gt 38 ]; then
                display_path="${display_path:0:35}..."
            fi

            printf "%-4s %-40s %-8s %-10s %-8s %-12s %-10s\n" \
                "$count" "$display_path" "$platform" "$version" "$health" "$knowledge" "$last_harvested"
        fi
    done < "$REGISTRY_FILE"

    echo "────────────────────────────────────────────────────────────────────────────────"
    echo ""
    echo -e "${CYAN}SUMMARY${NC}"
    echo -e "  Total projects:     $count"
    echo -e "  Healthy:            ${GREEN}$healthy${NC}"
    echo -e "  Outdated:           ${YELLOW}$outdated${NC}"
    echo -e "  Missing:            ${RED}$missing${NC}"
    echo -e "  Total knowledge:    $total_knowledge entries"
}

cmd_status() {
    local project_path="$1"

    if [ -z "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Project path required"
        exit 1
    fi

    project_path=$(resolve_path "$project_path")

    if [ ! -d "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Directory not found: $project_path"
        exit 1
    fi

    echo -e "${CYAN}PROJECT STATUS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Path: $project_path"
    echo "Platform: $(detect_platform "$project_path")"
    echo "Version: $(get_project_version "$project_path")"
    echo "Knowledge: $(count_knowledge "$project_path") entries"

    # Check registration
    if [ -f "$REGISTRY_FILE" ] && grep -qF "$project_path" "$REGISTRY_FILE" 2>/dev/null; then
        echo -e "Registered: ${GREEN}Yes${NC}"
    else
        echo -e "Registered: ${RED}No${NC}"
    fi

    # Show metadata
    local meta
    meta=$(get_meta "$project_path")
    if [ -n "$meta" ]; then
        echo ""
        echo "Metadata:"
        echo "  Last harvested: $(echo "$meta" | jq -r '.last_harvested // "never"' 2>/dev/null)"
        echo "  Health: $(echo "$meta" | jq -r '.health_status // "unknown"' 2>/dev/null)"
        echo "  Go runs: $(echo "$meta" | jq -r '.total_go_runs // 0' 2>/dev/null)"
        echo "  Tokens used: $(echo "$meta" | jq -r '.total_tokens_used // 0' 2>/dev/null)"
    fi
}

cmd_update_meta() {
    local project_path="$1"
    shift

    if [ -z "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Project path required"
        exit 1
    fi

    project_path=$(resolve_path "$project_path")

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --*=*)
                local key="${1#--}"
                key="${key%%=*}"
                local value="${1#*=}"
                set_meta "$project_path" "$key" "$value"
                echo -e "${GREEN}[PASS]${NC} Set $key=$value for $(basename "$project_path")"
                shift
                ;;
            *)
                echo -e "${YELLOW}[WARN]${NC} Unknown argument: $1"
                shift
                ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ═══════════════════════════════════════════════════════════════

case "${1:-}" in
    register)
        shift
        # Parse platform flag
        PLATFORM=""
        PROJECT_PATH=""
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --platform=*) PLATFORM="${1#*=}"; shift ;;
                --force) FORCE=true; shift ;;
                *) PROJECT_PATH="$1"; shift ;;
            esac
        done
        cmd_register "$PROJECT_PATH" "$PLATFORM"
        ;;
    unregister|remove)
        shift
        FORCE=""
        PROJECT_PATH=""
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --force) FORCE=true; shift ;;
                *) PROJECT_PATH="$1"; shift ;;
            esac
        done
        cmd_unregister "$PROJECT_PATH"
        ;;
    list)
        cmd_list
        ;;
    dashboard)
        cmd_dashboard
        ;;
    status)
        shift
        cmd_status "$1"
        ;;
    update-meta)
        shift
        cmd_update_meta "$@"
        ;;
    --help|-h)
        echo "Usage: $0 {register|unregister|list|dashboard|status|update-meta} [args]"
        echo ""
        echo "Commands:"
        echo "  register <path> [--platform=claude|copilot|cursor]  Register a project"
        echo "  unregister <path> [--force]                         Unregister a project"
        echo "  list                                                List all registered projects"
        echo "  dashboard                                           Show project overview dashboard"
        echo "  status <path>                                       Show single project status"
        echo "  update-meta <path> --key=value                      Update project metadata"
        echo ""
        echo "Options:"
        echo "  --help     Show this help"
        echo "  --json     Machine-readable output (where applicable)"
        echo "  --quiet    Suppress non-essential output"
        echo "  --verbose  Detailed logging"
        echo ""
        echo "Exit codes: 0=success, 1=error, 2=user cancellation"
        ;;
    *)
        echo "Usage: $0 {register|unregister|list|dashboard|status|update-meta} [args]"
        echo "Run '$0 --help' for details"
        exit 1
        ;;
esac

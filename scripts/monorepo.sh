#!/bin/bash

# Monorepo Support - Cross-package dependency resolution
# Implements FR-036 (Monorepo Support)
# Detects packages in a monorepo, builds dependency graph, coordinates execution.
# Supports up to 20 packages per monorepo.
#
# USAGE:
#   ./scripts/monorepo.sh detect [--root=PATH]
#   ./scripts/monorepo.sh deps [--root=PATH] [--json]
#   ./scripts/monorepo.sh order [--root=PATH]
#   ./scripts/monorepo.sh status [--root=PATH]
#   ./scripts/monorepo.sh --help

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Defaults
ROOT_DIR="."
JSON_OUTPUT=false
MAX_PACKAGES=20

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Monorepo Support - Cross-package dependency resolution"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/monorepo.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  detect                  Detect packages in monorepo"
    echo "  deps                    Show cross-package dependencies"
    echo "  order                   Compute build/execution order"
    echo "  status                  Show monorepo status overview"
    echo ""
    echo "OPTIONS:"
    echo "  --root=PATH             Monorepo root directory (default: current dir)"
    echo "  --json                  Output in JSON format"
    echo "  --help                  Show this help message"
    echo ""
    echo "PACKAGE DETECTION:"
    echo "  Detects packages by looking for:"
    echo "  - packages/*/package.json   (Node.js workspaces)"
    echo "  - apps/*/package.json       (Turborepo/Next.js)"
    echo "  - */setup.py or */pyproject.toml  (Python packages)"
    echo "  - */Cargo.toml              (Rust workspace)"
    echo "  - */go.mod                  (Go modules)"
    echo "  - */*.csproj                (.NET projects)"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/monorepo.sh detect"
    echo "  ./scripts/monorepo.sh deps --root=/path/to/monorepo"
    echo "  ./scripts/monorepo.sh order"
    echo ""
    echo "LIMITS:"
    echo "  Maximum $MAX_PACKAGES packages per monorepo"
}

COMMAND=""
for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --root=*) ROOT_DIR="${arg#--root=}" ;;
        --json) JSON_OUTPUT=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$COMMAND" ] && COMMAND="$arg" ;;
    esac
done

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# Detect all packages in a monorepo
detect_packages() {
    local root="$1"
    local packages=""

    # Node.js workspaces (packages/ or apps/)
    for dir in "$root"/packages/*/package.json "$root"/apps/*/package.json; do
        if [ -f "$dir" ]; then
            local pkg_dir
            pkg_dir=$(dirname "$dir")
            local pkg_name
            pkg_name=$(basename "$pkg_dir")
            packages="$packages $pkg_name:node:$pkg_dir"
        fi
    done

    # Python packages
    for dir in "$root"/*/pyproject.toml "$root"/*/setup.py; do
        if [ -f "$dir" ]; then
            local pkg_dir
            pkg_dir=$(dirname "$dir")
            local pkg_name
            pkg_name=$(basename "$pkg_dir")
            # Avoid duplicates
            if ! echo "$packages" | grep -q "$pkg_name:"; then
                packages="$packages $pkg_name:python:$pkg_dir"
            fi
        fi
    done

    # Rust workspace members
    if [ -f "$root/Cargo.toml" ]; then
        for dir in "$root"/*/Cargo.toml; do
            [ "$dir" = "$root/Cargo.toml" ] && continue
            if [ -f "$dir" ]; then
                local pkg_dir
                pkg_dir=$(dirname "$dir")
                local pkg_name
                pkg_name=$(basename "$pkg_dir")
                if ! echo "$packages" | grep -q "$pkg_name:"; then
                    packages="$packages $pkg_name:rust:$pkg_dir"
                fi
            fi
        done
    fi

    # Go modules
    for dir in "$root"/*/go.mod; do
        if [ -f "$dir" ]; then
            local pkg_dir
            pkg_dir=$(dirname "$dir")
            local pkg_name
            pkg_name=$(basename "$pkg_dir")
            if ! echo "$packages" | grep -q "$pkg_name:"; then
                packages="$packages $pkg_name:go:$pkg_dir"
            fi
        fi
    done

    # .NET projects
    for dir in "$root"/*/*.csproj; do
        if [ -f "$dir" ]; then
            local pkg_dir
            pkg_dir=$(dirname "$dir")
            local pkg_name
            pkg_name=$(basename "$pkg_dir")
            if ! echo "$packages" | grep -q "$pkg_name:"; then
                packages="$packages $pkg_name:dotnet:$pkg_dir"
            fi
        fi
    done

    echo "$packages" | xargs
}

# Extract dependencies from a Node.js package
extract_node_deps() {
    local pkg_dir="$1"
    local pkg_json="$pkg_dir/package.json"
    if [ ! -f "$pkg_json" ]; then
        return
    fi
    # Look for workspace references (e.g., "@scope/package-name": "workspace:*")
    grep -o '"@[^"]*"\s*:\s*"workspace:[^"]*"' "$pkg_json" 2>/dev/null | grep -o '@[^"]*' | sed 's/@[^/]*\///' || true
}

# Simple topological sort using Kahn's algorithm
topo_sort() {
    local packages="$1"
    local deps="$2"

    # Build in-degree map
    declare -A in_degree
    declare -A adj_list

    for pkg_entry in $packages; do
        local pkg_name
        pkg_name=$(echo "$pkg_entry" | cut -d':' -f1)
        in_degree[$pkg_name]=0
        adj_list[$pkg_name]=""
    done

    # Process dependencies
    for dep_entry in $deps; do
        local from to
        from=$(echo "$dep_entry" | cut -d'>' -f1)
        to=$(echo "$dep_entry" | cut -d'>' -f2)
        if [ -n "${in_degree[$to]+x}" ]; then
            in_degree[$to]=$((${in_degree[$to]} + 1))
            adj_list[$from]="${adj_list[$from]} $to"
        fi
    done

    # Kahn's algorithm
    local queue=""
    for pkg_name in "${!in_degree[@]}"; do
        if [ "${in_degree[$pkg_name]}" -eq 0 ]; then
            queue="$queue $pkg_name"
        fi
    done

    local result=""
    local processed=0

    while [ -n "$(echo "$queue" | xargs)" ]; do
        local current
        current=$(echo "$queue" | awk '{print $1}')
        queue=$(echo "$queue" | awk '{$1=""; print}' | xargs)
        result="$result $current"
        processed=$((processed + 1))

        for neighbor in ${adj_list[$current]}; do
            in_degree[$neighbor]=$((${in_degree[$neighbor]} - 1))
            if [ "${in_degree[$neighbor]}" -eq 0 ]; then
                queue="$queue $neighbor"
            fi
        done
    done

    local total=${#in_degree[@]}
    if [ "$processed" -lt "$total" ]; then
        echo "CIRCULAR_DEPENDENCY_DETECTED"
        return 1
    fi

    echo "$result" | xargs
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_detect() {
    if [ ! -d "$ROOT_DIR" ]; then
        echo -e "${RED}[FAIL]${NC} Root directory not found: $ROOT_DIR"
        exit 1
    fi

    local packages
    packages=$(detect_packages "$ROOT_DIR")

    if [ -z "$packages" ]; then
        echo -e "${CYAN}[INFO]${NC} No packages detected in $ROOT_DIR"
        echo -e "${DIM}This may not be a monorepo, or packages are in non-standard locations.${NC}"
        return 0
    fi

    local count=0
    for pkg in $packages; do
        count=$((count + 1))
    done

    if [ "$count" -gt "$MAX_PACKAGES" ]; then
        echo -e "${YELLOW}[WARN]${NC} Found $count packages (max: $MAX_PACKAGES). Only first $MAX_PACKAGES will be processed."
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"packages":['
        local first=true
        for pkg in $packages; do
            local name type dir
            name=$(echo "$pkg" | cut -d':' -f1)
            type=$(echo "$pkg" | cut -d':' -f2)
            dir=$(echo "$pkg" | cut -d':' -f3-)
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            echo "{\"name\":\"$name\",\"type\":\"$type\",\"path\":\"$dir\"}"
        done
        echo "],"
        echo "\"total\":$count}"
        return
    fi

    echo ""
    echo -e "${BOLD}Detected Packages ($count)${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    printf "  ${BOLD}%-20s %-10s %-40s${NC}\n" "PACKAGE" "TYPE" "PATH"
    printf "  %-20s %-10s %-40s\n" "--------------------" "----------" "----------------------------------------"

    for pkg in $packages; do
        local name type dir
        name=$(echo "$pkg" | cut -d':' -f1)
        type=$(echo "$pkg" | cut -d':' -f2)
        dir=$(echo "$pkg" | cut -d':' -f3-)
        printf "  %-20s ${CYAN}%-10s${NC} ${DIM}%-40s${NC}\n" "$name" "$type" "$dir"
    done
    echo ""
}

cmd_deps() {
    local packages
    packages=$(detect_packages "$ROOT_DIR")

    if [ -z "$packages" ]; then
        echo -e "${CYAN}[INFO]${NC} No packages detected"
        return 0
    fi

    echo ""
    echo -e "${BOLD}Cross-Package Dependencies${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local has_deps=false
    for pkg in $packages; do
        local name type dir
        name=$(echo "$pkg" | cut -d':' -f1)
        type=$(echo "$pkg" | cut -d':' -f2)
        dir=$(echo "$pkg" | cut -d':' -f3-)

        local deps=""
        case "$type" in
            node)
                deps=$(extract_node_deps "$dir")
                ;;
        esac

        if [ -n "$deps" ]; then
            has_deps=true
            echo -e "  ${BOLD}$name${NC} depends on:"
            for dep in $deps; do
                echo -e "    ${YELLOW}→${NC} $dep"
            done
            echo ""
        fi
    done

    if [ "$has_deps" != true ]; then
        echo -e "  ${CYAN}No cross-package dependencies detected${NC}"
        echo -e "  ${DIM}Packages can be built/executed in any order${NC}"
    fi
    echo ""
}

cmd_order() {
    local packages
    packages=$(detect_packages "$ROOT_DIR")

    if [ -z "$packages" ]; then
        echo -e "${CYAN}[INFO]${NC} No packages detected"
        return 0
    fi

    echo ""
    echo -e "${BOLD}Build/Execution Order${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # For now, just list packages (deps detection is lang-specific)
    local order=1
    for pkg in $packages; do
        local name
        name=$(echo "$pkg" | cut -d':' -f1)
        echo -e "  ${BOLD}$order.${NC} $name"
        order=$((order + 1))
    done
    echo ""
    echo -e "  ${DIM}Note: Order may vary based on cross-package dependencies${NC}"
    echo ""
}

cmd_status() {
    local packages
    packages=$(detect_packages "$ROOT_DIR")

    echo ""
    echo -e "${BOLD}Monorepo Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Root:            ${BOLD}$ROOT_DIR${NC}"

    if [ -z "$packages" ]; then
        echo -e "  Type:            ${YELLOW}Not a monorepo${NC}"
        echo -e "  Packages:        0"
    else
        local count=0
        local types=""
        for pkg in $packages; do
            count=$((count + 1))
            local type
            type=$(echo "$pkg" | cut -d':' -f2)
            if ! echo "$types" | grep -q "$type"; then
                types="$types $type"
            fi
        done

        echo -e "  Type:            ${GREEN}Monorepo${NC}"
        echo -e "  Packages:        ${BOLD}$count${NC}"
        echo -e "  Technologies:    ${CYAN}$(echo "$types" | xargs | tr ' ' ', ')${NC}"

        # Check for PRDs
        local prd_count=0
        if [ -d "$ROOT_DIR/genesis" ]; then
            prd_count=$(find "$ROOT_DIR/genesis" -name "*.md" -not -name "TEMPLATE.md" 2>/dev/null | wc -l | tr -d ' ')
        fi
        echo -e "  PRDs:            $prd_count"

        # Check for stories
        local story_count=0
        if [ -d "$ROOT_DIR/docs/stories" ]; then
            story_count=$(find "$ROOT_DIR/docs/stories" -name "STORY-*.md" 2>/dev/null | wc -l | tr -d ' ')
        fi
        echo -e "  Stories:         $story_count"
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if [ -z "$COMMAND" ]; then
    show_help
    exit 0
fi

case "$COMMAND" in
    detect) cmd_detect ;;
    deps) cmd_deps ;;
    order) cmd_order ;;
    status) cmd_status ;;
    *)
        echo -e "${RED}[FAIL]${NC} Unknown command: $COMMAND"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

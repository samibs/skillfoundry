#!/bin/bash

# Visualize - Generate ASCII DAG and Mermaid diagrams from story dependencies
#
# USAGE:
#   ./parallel/visualize.sh <stories-dir>
#   ./parallel/visualize.sh docs/stories/my-feature/ --format=mermaid
#   ./parallel/visualize.sh docs/stories/my-feature/ --format=ascii
#   ./parallel/visualize.sh --help

set -e
set -o pipefail

# Requires bash 4+ for associative arrays
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
    echo "Error: visualize.sh requires bash 4.0+ (you have $BASH_VERSION)" >&2
    echo "On macOS: brew install bash" >&2
    exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
FORMAT="ascii"
STORIES_DIR=""

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Visualize - Generate dependency graphs from story files"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/visualize.sh <stories-dir> [options]"
    echo ""
    echo "OPTIONS:"
    echo "  --format=ascii     ASCII tree diagram (default)"
    echo "  --format=mermaid   Mermaid.js graph syntax"
    echo "  --format=both      Output both formats"
    echo "  -h, --help         Show this help"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/visualize.sh docs/stories/user-auth/"
    echo "  ./parallel/visualize.sh docs/stories/payments/ --format=mermaid"
    echo ""
    echo "OUTPUT:"
    echo "  ASCII format renders a tree in the terminal."
    echo "  Mermaid format outputs graph syntax for rendering at mermaid.live."
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --format=*)
            FORMAT="${1#*=}"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}Error: Unknown option: $1${NC}" >&2
            exit 2
            ;;
        *)
            STORIES_DIR="$1"
            shift
            ;;
    esac
done

if [ -z "$STORIES_DIR" ]; then
    echo -e "${RED}Error: Stories directory required${NC}" >&2
    echo "Usage: ./parallel/visualize.sh <stories-dir>" >&2
    exit 2
fi

if [ ! -d "$STORIES_DIR" ]; then
    echo -e "${RED}Error: Directory not found: $STORIES_DIR${NC}" >&2
    exit 3
fi

# ═══════════════════════════════════════════════════════════════
# DEPENDENCY EXTRACTION
# ═══════════════════════════════════════════════════════════════

# Associative arrays for graph
declare -A DEPS        # node -> space-separated dependencies
declare -A TITLES      # node -> story title
NODES=()

extract_graph() {
    local dir="$1"

    # Scan INDEX.md first
    if [ -f "$dir/INDEX.md" ]; then
        grep -E '^\|.*STORY-[0-9]+' "$dir/INDEX.md" 2>/dev/null | while IFS='|' read -r _ story_col _ _ deps_col _; do
            local sid
            sid=$(echo "$story_col" | grep -oE 'STORY-[0-9]+' || true)
            if [ -n "$sid" ]; then
                echo "NODE:$sid"
                echo "$deps_col" | grep -oE 'STORY-[0-9]+' | while read -r dep; do
                    if [ -n "$dep" ] && [ "$dep" != "$sid" ]; then
                        echo "EDGE:$dep->$sid"
                    fi
                done
            fi
        done
    fi

    # Scan individual story files
    for story_file in "$dir"/STORY-*.md; do
        if [ -f "$story_file" ]; then
            local sid
            sid=$(basename "$story_file" .md)
            echo "NODE:$sid"

            # Extract title
            local title
            title=$(head -1 "$story_file" | sed 's/^#\+ *//' | head -c 50)
            if [ -n "$title" ]; then
                echo "TITLE:$sid=$title"
            fi

            # Extract dependencies
            grep -iE 'depends_on|dependencies|blocked_by' "$story_file" 2>/dev/null | \
                grep -oE 'STORY-[0-9]+' | while read -r dep; do
                    if [ -n "$dep" ] && [ "$dep" != "$sid" ]; then
                        echo "EDGE:$dep->$sid"
                    fi
                done
        fi
    done
}

# Parse graph data
GRAPH_DATA=$(extract_graph "$STORIES_DIR" | sort -u)

# Build node list
while IFS= read -r line; do
    case "$line" in
        NODE:*)
            node="${line#NODE:}"
            NODES+=("$node")
            if [ -z "${DEPS[$node]+x}" ]; then
                DEPS[$node]=""
            fi
            ;;
        EDGE:*)
            edge="${line#EDGE:}"
            from="${edge%%->*}"
            to="${edge##*->}"
            if [ -n "${DEPS[$to]+x}" ]; then
                DEPS[$to]="${DEPS[$to]} $from"
            else
                DEPS[$to]="$from"
            fi
            ;;
        TITLE:*)
            entry="${line#TITLE:}"
            tnode="${entry%%=*}"
            ttitle="${entry#*=}"
            TITLES[$tnode]="$ttitle"
            ;;
    esac
done <<< "$GRAPH_DATA"

# Deduplicate nodes
UNIQUE_NODES=($(echo "${NODES[@]}" | tr ' ' '\n' | sort -u))

if [ ${#UNIQUE_NODES[@]} -eq 0 ]; then
    echo -e "${YELLOW}No stories found in $STORIES_DIR${NC}"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# ASCII OUTPUT
# ═══════════════════════════════════════════════════════════════

render_ascii() {
    echo -e "${CYAN}${BOLD}Dependency Graph: $(basename "$STORIES_DIR")${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Find root nodes (no dependencies)
    local roots=()
    for node in "${UNIQUE_NODES[@]}"; do
        local deps="${DEPS[$node]}"
        deps=$(echo "$deps" | xargs)  # trim
        if [ -z "$deps" ]; then
            roots+=("$node")
        fi
    done

    # Recursive tree printer
    print_tree() {
        local node="$1"
        local prefix="$2"
        local is_last="$3"

        local connector="├── "
        local extension="│   "
        if [ "$is_last" = "true" ]; then
            connector="└── "
            extension="    "
        fi

        local title="${TITLES[$node]}"
        if [ -n "$title" ]; then
            echo -e "${prefix}${connector}${GREEN}${node}${NC}: ${title}"
        else
            echo -e "${prefix}${connector}${GREEN}${node}${NC}"
        fi

        # Find children (nodes that depend on this node)
        local children=()
        for other in "${UNIQUE_NODES[@]}"; do
            local other_deps="${DEPS[$other]}"
            if echo " $other_deps " | grep -qF " $node "; then
                children+=("$other")
            fi
        done

        local child_count=${#children[@]}
        local idx=0
        for child in "${children[@]}"; do
            ((idx++))
            local child_is_last="false"
            if [ "$idx" -eq "$child_count" ]; then
                child_is_last="true"
            fi
            print_tree "$child" "${prefix}${extension}" "$child_is_last"
        done
    }

    # Print from each root
    local root_count=${#roots[@]}
    local ridx=0
    for root in "${roots[@]}"; do
        ((ridx++))
        local root_is_last="false"
        if [ "$ridx" -eq "$root_count" ]; then
            root_is_last="true"
        fi
        print_tree "$root" "" "$root_is_last"
    done

    echo ""
    echo -e "${BOLD}Legend:${NC} Root nodes have no dependencies. Children depend on their parent."
    echo -e "${BOLD}Nodes:${NC} ${#UNIQUE_NODES[@]} stories"
}

# ═══════════════════════════════════════════════════════════════
# MERMAID OUTPUT
# ═══════════════════════════════════════════════════════════════

render_mermaid() {
    echo -e "${CYAN}${BOLD}Mermaid Diagram${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo '```mermaid'
    echo "graph TD"

    # Node definitions with titles
    for node in "${UNIQUE_NODES[@]}"; do
        local title="${TITLES[$node]}"
        if [ -n "$title" ]; then
            echo "    ${node}[\"${node}: ${title}\"]"
        else
            echo "    ${node}[\"${node}\"]"
        fi
    done

    echo ""

    # Edges
    for node in "${UNIQUE_NODES[@]}"; do
        local deps="${DEPS[$node]}"
        for dep in $deps; do
            if [ -n "$dep" ]; then
                echo "    ${dep} --> ${node}"
            fi
        done
    done

    # Style root nodes
    echo ""
    for node in "${UNIQUE_NODES[@]}"; do
        local deps="${DEPS[$node]}"
        deps=$(echo "$deps" | xargs)
        if [ -z "$deps" ]; then
            echo "    style ${node} fill:#2d6a2e,color:#fff"
        fi
    done

    echo '```'
    echo ""
    echo "Paste this into https://mermaid.live to render the diagram."
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

case "$FORMAT" in
    ascii)
        render_ascii
        ;;
    mermaid)
        render_mermaid
        ;;
    both)
        render_ascii
        echo ""
        render_mermaid
        ;;
    *)
        echo -e "${RED}Error: Unknown format '$FORMAT'. Use: ascii, mermaid, both${NC}" >&2
        exit 2
        ;;
esac

#!/bin/bash

# Wave Planner - Compute execution waves from story dependencies
# Uses topological sort (Kahn's algorithm) to group independent stories into waves.
#
# USAGE:
#   ./parallel/wave-planner.sh <stories-dir>
#   ./parallel/wave-planner.sh docs/stories/my-feature/
#   ./parallel/wave-planner.sh docs/stories/my-feature/ --format=json
#   ./parallel/wave-planner.sh --help

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

# Defaults
FORMAT="table"
STORIES_DIR=""

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Wave Planner - Compute execution waves from story dependencies"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/wave-planner.sh <stories-dir> [options]"
    echo ""
    echo "OPTIONS:"
    echo "  --format=table    Output as formatted table (default)"
    echo "  --format=json     Output as JSON"
    echo "  --format=plain    Output as plain text"
    echo "  -h, --help        Show this help"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/wave-planner.sh docs/stories/user-auth/"
    echo "  ./parallel/wave-planner.sh docs/stories/payments/ --format=json"
    echo ""
    echo "DEPENDENCY FORMAT:"
    echo "  Stories should contain a 'depends_on:' field in their frontmatter:"
    echo "    depends_on: [STORY-001, STORY-002]"
    echo ""
    echo "  Or in INDEX.md with a dependency section:"
    echo "    | STORY-003 | ... | STORY-001, STORY-002 |"
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
            show_help
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
    echo "Usage: ./parallel/wave-planner.sh <stories-dir>" >&2
    exit 2
fi

if [ ! -d "$STORIES_DIR" ]; then
    echo -e "${RED}Error: Directory not found: $STORIES_DIR${NC}" >&2
    exit 3
fi

# ═══════════════════════════════════════════════════════════════
# DEPENDENCY EXTRACTION
# ═══════════════════════════════════════════════════════════════

# Temporary files for graph data
NODES_FILE=$(mktemp)
EDGES_FILE=$(mktemp)
INDEGREE_FILE=$(mktemp)
trap 'rm -f "$NODES_FILE" "$EDGES_FILE" "$INDEGREE_FILE"' EXIT

# Extract story IDs and dependencies from story files
extract_dependencies() {
    local dir="$1"

    # First try INDEX.md for dependency info
    if [ -f "$dir/INDEX.md" ]; then
        # Look for table rows with story IDs and dependencies
        grep -E '^\|.*STORY-[0-9]+' "$dir/INDEX.md" 2>/dev/null | while IFS='|' read -r _ story_id _ _ deps _; do
            story_id=$(echo "$story_id" | tr -d ' ' | grep -oE 'STORY-[0-9]+' || true)
            if [ -n "$story_id" ]; then
                echo "$story_id" >> "$NODES_FILE"
                # Parse dependencies from the deps column
                if [ -n "$deps" ]; then
                    echo "$deps" | grep -oE 'STORY-[0-9]+' | while read -r dep; do
                        if [ -n "$dep" ] && [ "$dep" != "$story_id" ]; then
                            echo "$dep $story_id" >> "$EDGES_FILE"
                        fi
                    done
                fi
            fi
        done
    fi

    # Also scan individual story files
    for story_file in "$dir"/STORY-*.md; do
        if [ -f "$story_file" ]; then
            local story_id
            story_id=$(basename "$story_file" .md)
            echo "$story_id" >> "$NODES_FILE"

            # Look for depends_on in frontmatter or content
            grep -iE 'depends_on|dependencies|blocked_by' "$story_file" 2>/dev/null | \
                grep -oE 'STORY-[0-9]+' | while read -r dep; do
                    if [ -n "$dep" ] && [ "$dep" != "$story_id" ]; then
                        echo "$dep $story_id" >> "$EDGES_FILE"
                    fi
                done
        fi
    done

    # Deduplicate nodes
    if [ -f "$NODES_FILE" ]; then
        sort -u "$NODES_FILE" > "${NODES_FILE}.tmp"
        mv "${NODES_FILE}.tmp" "$NODES_FILE"
    fi

    # Deduplicate edges
    if [ -f "$EDGES_FILE" ]; then
        sort -u "$EDGES_FILE" > "${EDGES_FILE}.tmp"
        mv "${EDGES_FILE}.tmp" "$EDGES_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════
# TOPOLOGICAL SORT (KAHN'S ALGORITHM)
# ═══════════════════════════════════════════════════════════════

compute_waves() {
    local node_count
    node_count=$(wc -l < "$NODES_FILE" 2>/dev/null || echo 0)

    if [ "$node_count" -eq 0 ]; then
        echo -e "${YELLOW}No stories found in $STORIES_DIR${NC}" >&2
        exit 0
    fi

    # Compute in-degrees
    while read -r node; do
        local indegree
        indegree=$(grep -cE "^.+ ${node}$" "$EDGES_FILE" 2>/dev/null || echo 0)
        echo "$node $indegree" >> "$INDEGREE_FILE"
    done < "$NODES_FILE"

    # Kahn's algorithm: repeatedly extract nodes with in-degree 0
    local wave_num=0
    local processed=0
    local total=$node_count
    local waves_json="["
    local remaining_file
    remaining_file=$(mktemp)
    trap 'rm -f "$NODES_FILE" "$EDGES_FILE" "$INDEGREE_FILE" "$remaining_file"' EXIT
    cp "$INDEGREE_FILE" "$remaining_file"

    while [ "$processed" -lt "$total" ]; do
        ((wave_num++))

        # Find all nodes with in-degree 0
        local wave_nodes=()
        while read -r node indegree; do
            if [ "$indegree" -eq 0 ]; then
                wave_nodes+=("$node")
            fi
        done < "$remaining_file"

        if [ ${#wave_nodes[@]} -eq 0 ]; then
            echo -e "${RED}Error: Circular dependency detected!${NC}" >&2
            echo "Remaining unprocessed stories:" >&2
            while read -r node _; do
                echo "  - $node" >&2
            done < "$remaining_file"
            exit 1
        fi

        # Remove processed nodes and reduce in-degrees
        local new_remaining
        new_remaining=$(mktemp)
        trap 'rm -f "$NODES_FILE" "$EDGES_FILE" "$INDEGREE_FILE" "$remaining_file" "$new_remaining"' EXIT

        while read -r node indegree; do
            local is_in_wave=false
            for wn in "${wave_nodes[@]}"; do
                if [ "$node" = "$wn" ]; then
                    is_in_wave=true
                    break
                fi
            done

            if [ "$is_in_wave" = false ]; then
                # Reduce in-degree by count of edges from wave nodes to this node
                local reduction=0
                for wn in "${wave_nodes[@]}"; do
                    if grep -qE "^${wn} ${node}$" "$EDGES_FILE" 2>/dev/null; then
                        ((reduction++))
                    fi
                done
                local new_indegree=$((indegree - reduction))
                echo "$node $new_indegree" >> "$new_remaining"
            fi
        done < "$remaining_file"

        mv "$new_remaining" "$remaining_file"
        processed=$((processed + ${#wave_nodes[@]}))

        # Output wave based on format
        case "$FORMAT" in
            json)
                local wave_items=""
                for wn in "${wave_nodes[@]}"; do
                    if [ -n "$wave_items" ]; then
                        wave_items="${wave_items},"
                    fi
                    wave_items="${wave_items}\"${wn}\""
                done
                if [ "$wave_num" -gt 1 ]; then
                    waves_json="${waves_json},"
                fi
                waves_json="${waves_json}{\"wave\":${wave_num},\"stories\":[${wave_items}],\"parallel\":true}"
                ;;
            table)
                echo -e "${CYAN}Wave $wave_num${NC} (${#wave_nodes[@]} stories, parallel):"
                for wn in "${wave_nodes[@]}"; do
                    # Try to extract story title
                    local title=""
                    local story_file="${STORIES_DIR}/${wn}.md"
                    if [ -f "$story_file" ]; then
                        title=$(head -1 "$story_file" | sed 's/^#\+ *//' | head -c 60)
                    fi
                    if [ -n "$title" ]; then
                        echo -e "  ${GREEN}$wn${NC}: $title"
                    else
                        echo -e "  ${GREEN}$wn${NC}"
                    fi
                done
                echo ""
                ;;
            plain)
                echo "Wave $wave_num: ${wave_nodes[*]}"
                ;;
        esac
    done

    if [ "$FORMAT" = "json" ]; then
        waves_json="${waves_json}]"
        local result
        result=$(cat <<EOF
{
  "stories_dir": "$STORIES_DIR",
  "total_stories": $total,
  "total_waves": $wave_num,
  "waves": $waves_json
}
EOF
)
        if command -v jq &>/dev/null; then
            echo "$result" | jq .
        else
            echo "$result"
        fi
    fi

    if [ "$FORMAT" = "table" ]; then
        echo -e "${BOLD}Summary:${NC} $total stories in $wave_num waves"
        if [ "$wave_num" -gt 0 ]; then
            echo -e "Sequential time: ${total} units"
            echo -e "Parallel time:   ${wave_num} units"
            local speedup
            if [ "$wave_num" -gt 0 ]; then
                speedup=$(echo "scale=1; $total / $wave_num" | bc 2>/dev/null || echo "N/A")
                echo -e "Speedup:         ${GREEN}${speedup}x${NC}"
            fi
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

extract_dependencies "$STORIES_DIR"
compute_waves

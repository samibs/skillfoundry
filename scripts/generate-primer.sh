#!/bin/bash

# Generate Context Primer — Creates a compact memory bank index for session start.
# Reads all JSONL knowledge files and produces a markdown summary.
#
# USAGE:
#   ./scripts/generate-primer.sh [--project=PATH] [--output=FILE]
#   ./scripts/generate-primer.sh --help

set -e
set -o pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_DIR="."
OUTPUT_FILE=""

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

for arg in "$@"; do
    case "$arg" in
        --project=*) PROJECT_DIR="${arg#*=}" ;;
        --output=*) OUTPUT_FILE="${arg#*=}" ;;
        --help|-h)
            echo "Generate Context Primer — Compact memory bank index"
            echo ""
            echo "Usage: ./scripts/generate-primer.sh [options]"
            echo ""
            echo "Options:"
            echo "  --project=PATH   Project directory (default: current directory)"
            echo "  --output=FILE    Output file (default: .skillfoundry/context-primer.md)"
            echo "  --help           Show this help"
            exit 0
            ;;
    esac
done

if [ -d "$PROJECT_DIR" ]; then
    PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
fi

KNOWLEDGE_DIR="$PROJECT_DIR/memory_bank/knowledge"
if [ -z "$OUTPUT_FILE" ]; then
    OUTPUT_FILE="$PROJECT_DIR/.skillfoundry/context-primer.md"
fi

# ═══════════════════════════════════════════════════════════════
# CHECK KNOWLEDGE DIR
# ═══════════════════════════════════════════════════════════════

if [ ! -d "$KNOWLEDGE_DIR" ]; then
    echo -e "${YELLOW}  No knowledge directory found. Skipping primer generation.${NC}"
    exit 0
fi

# Count total entries across all JSONL files
total_entries=0
for f in "$KNOWLEDGE_DIR"/*.jsonl; do
    [ -f "$f" ] || continue
    count=$(grep -c '.' "$f" 2>/dev/null || echo "0")
    total_entries=$((total_entries + count))
done

if [ "$total_entries" -eq 0 ]; then
    echo -e "${YELLOW}  Knowledge bank is empty. Skipping primer generation.${NC}"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# GENERATE PRIMER (using jq for JSON parsing)
# ═══════════════════════════════════════════════════════════════

mkdir -p "$(dirname "$OUTPUT_FILE")"

# Build primer using shell + jq
{
    echo "## Memory Bank — ${total_entries} entries"
    echo ""
    echo "| Type | Count | Files |"
    echo "|------|-------|-------|"

    # Count by type across all files
    for f in "$KNOWLEDGE_DIR"/*.jsonl; do
        [ -f "$f" ] || continue
        basename_f=$(basename "$f")
        count=$(grep -c '.' "$f" 2>/dev/null || echo "0")
        if [ "$count" -gt 0 ]; then
            # Get dominant type from file
            if command -v jq &>/dev/null; then
                type=$(head -1 "$f" | jq -r '.type // "unknown"' 2>/dev/null || echo "unknown")
            else
                type=$(head -1 "$f" | grep -o '"type":"[^"]*"' | head -1 | sed 's/"type":"//;s/"//' || echo "unknown")
            fi
            echo "| ${type} | ${count} | ${basename_f} |"
        fi
    done

    echo ""

    # Top 5 by weight (if jq available)
    if command -v jq &>/dev/null; then
        echo "### Highest Weight"
        cat "$KNOWLEDGE_DIR"/*.jsonl 2>/dev/null | \
            jq -r 'select(.weight != null) | [.id[0:8], .type, (.weight | tostring), (.content[0:80] // "no content")] | @tsv' 2>/dev/null | \
            sort -t$'\t' -k3 -rn | head -5 | \
            while IFS=$'\t' read -r id type weight content; do
                echo "- [${id}] ${type} (${weight}): \"${content}\""
            done
        echo ""
    fi

    # Most recent 5
    echo "### Most Recent"
    if command -v jq &>/dev/null; then
        cat "$KNOWLEDGE_DIR"/*.jsonl 2>/dev/null | \
            jq -r 'select(.created_at != null) | [.id[0:8], .type, .created_at, (.content[0:80] // "no content")] | @tsv' 2>/dev/null | \
            sort -t$'\t' -k3 -r | head -5 | \
            while IFS=$'\t' read -r id type date content; do
                echo "- [${id}] ${type} (${date}): \"${content}\""
            done
    else
        # Fallback without jq — just show file modification times
        ls -lt "$KNOWLEDGE_DIR"/*.jsonl 2>/dev/null | head -5 | while read -r line; do
            echo "- $line"
        done
    fi
    echo ""

    echo 'Use `/recall "query"` to search, `/recall --full <id>` to expand.'

} > "$OUTPUT_FILE"

primer_size=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
primer_tokens=$((primer_size / 4))

echo -e "${GREEN}  Context primer generated: ${OUTPUT_FILE}${NC}"
echo -e "${GREEN}  Entries: ${total_entries} | Est. tokens: ~${primer_tokens}${NC}"

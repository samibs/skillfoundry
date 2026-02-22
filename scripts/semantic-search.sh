#!/bin/bash

# Semantic Search - TF-IDF based keyword-weighted knowledge search
# Implements FR-030 (Semantic Knowledge Search)
# Searches across all JSONL knowledge files and ranks by relevance.
# Note: This is keyword-weighted search, not true vector-based semantic search.
#
# USAGE:
#   ./scripts/semantic-search.sh "how did we handle auth?"
#   ./scripts/semantic-search.sh "database migration pattern" --limit=5
#   ./scripts/semantic-search.sh "error handling" --type=error
#   ./scripts/semantic-search.sh --help

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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MEMORY_BANK="${MEMORY_BANK:-$FRAMEWORK_DIR/memory_bank}"
PROJECT_MEMORY="${PROJECT_MEMORY:-./memory_bank}"
LIMIT=10
TYPE_FILTER=""
JSON_OUTPUT=false
QUERY=""

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Semantic Search - Keyword-weighted knowledge search"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/semantic-search.sh \"<query>\" [options]"
    echo ""
    echo "OPTIONS:"
    echo "  --limit=N               Max results to show (default: 10)"
    echo "  --type=TYPE             Filter by type: fact, decision, error, pattern, preference"
    echo "  --json                  Output in JSON format"
    echo "  --help                  Show this help message"
    echo ""
    echo "SEARCH SOURCES:"
    echo "  Framework:  memory_bank/knowledge/bootstrap.jsonl"
    echo "              memory_bank/knowledge/*-universal.jsonl"
    echo "  Project:    ./memory_bank/knowledge/*.jsonl (if exists)"
    echo ""
    echo "RANKING:"
    echo "  Results are ranked by keyword match frequency (TF-IDF inspired):"
    echo "  - Exact phrase matches score highest"
    echo "  - Individual word matches contribute to score"
    echo "  - Type field matches boost relevance"
    echo "  - Higher-weight entries score higher"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/semantic-search.sh \"how did we handle auth?\""
    echo "  ./scripts/semantic-search.sh \"database migration\" --limit=5"
    echo "  ./scripts/semantic-search.sh \"error handling\" --type=error"
    echo ""
    echo "NOTE: This is keyword-weighted search, not vector/ML-based semantic search."
}

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --limit=*) LIMIT="${arg#--limit=}" ;;
        --type=*) TYPE_FILTER="${arg#--type=}" ;;
        --json) JSON_OUTPUT=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$QUERY" ] && QUERY="$arg" ;;
    esac
done

if [ -z "$QUERY" ]; then
    show_help
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# SEARCH FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# Tokenize a query into words (lowercase, remove punctuation)
tokenize() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | grep -v '^$' | sort -u
}

# Score a knowledge entry against the query
score_entry() {
    local entry="$1"
    local query_lower
    query_lower=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]')
    local content
    content=$(echo "$entry" | grep -o '"content":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4 || true)
    local content_lower
    content_lower=$(echo "$content" | tr '[:upper:]' '[:lower:]')

    local score=0

    # Exact phrase match (highest score)
    if echo "$content_lower" | grep -qi "$query_lower" 2>/dev/null; then
        score=$((score + 100))
    fi

    # Individual word matches
    local words
    words=$(tokenize "$QUERY")
    for word in $words; do
        # Skip very short words (stop words)
        if [ ${#word} -le 2 ]; then
            continue
        fi
        if echo "$content_lower" | grep -qi "$word" 2>/dev/null; then
            score=$((score + 10))
        fi
    done

    # Type match bonus
    if [ -n "$TYPE_FILTER" ]; then
        local entry_type
        entry_type=$(echo "$entry" | grep -o '"type":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4 || true)
        if [ "$entry_type" = "$TYPE_FILTER" ]; then
            score=$((score + 20))
        fi
    fi

    # Weight bonus (higher weight = more relevant)
    local weight
    weight=$(echo "$entry" | grep -o '"weight":[0-9.]*' 2>/dev/null | head -1 | cut -d':' -f2 || true)
    if [ -n "$weight" ]; then
        # Multiply by 10 and truncate to integer for bonus (force base-10)
        local weight_bonus
        weight_bonus=$(echo "$weight" | sed 's/\.//' | head -c 2)
        weight_bonus=${weight_bonus:-0}
        # Strip leading zeros to prevent octal interpretation
        weight_bonus=$((10#$weight_bonus))
        score=$((score + weight_bonus))
    fi

    # Tags match bonus
    local tags
    tags=$(echo "$entry" | grep -o '"tags":\[[^]]*\]' 2>/dev/null | head -1 || true)
    if [ -n "$tags" ]; then
        for word in $words; do
            if [ ${#word} -le 2 ]; then
                continue
            fi
            if echo "$tags" | grep -qi "$word" 2>/dev/null; then
                score=$((score + 5))
            fi
        done
    fi

    echo "$score"
}

# Collect all knowledge files
collect_files() {
    local files=""

    # Framework knowledge
    if [ -d "$MEMORY_BANK/knowledge" ]; then
        for f in "$MEMORY_BANK/knowledge"/*.jsonl; do
            [ -f "$f" ] && files="$files $f"
        done
    fi

    # Project knowledge (if different from framework)
    if [ -d "$PROJECT_MEMORY/knowledge" ] && [ "$PROJECT_MEMORY" != "$MEMORY_BANK" ]; then
        for f in "$PROJECT_MEMORY/knowledge"/*.jsonl; do
            [ -f "$f" ] && files="$files $f"
        done
    fi

    echo "$files"
}

# ═══════════════════════════════════════════════════════════════
# MAIN SEARCH
# ═══════════════════════════════════════════════════════════════

# Collect all knowledge files
files=$(collect_files)
if [ -z "$files" ]; then
    echo -e "${CYAN}[INFO]${NC} No knowledge files found"
    exit 0
fi

# Score all entries
declare -a results=()
result_count=0

for file in $files; do
    [ ! -f "$file" ] && continue
    [ ! -s "$file" ] && continue

    while IFS= read -r entry; do
        [ -z "$entry" ] && continue

        # Type filter
        if [ -n "$TYPE_FILTER" ]; then
            entry_type=$(echo "$entry" | grep -o '"type":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4 || true)
            if [ "$entry_type" != "$TYPE_FILTER" ]; then
                continue
            fi
        fi

        score=$(score_entry "$entry")

        if [ "$score" -gt 0 ]; then
            results+=("$score|$file|$entry")
            result_count=$((result_count + 1))
        fi
    done < "$file"
done

if [ "$result_count" -eq 0 ]; then
    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"query":"'"$QUERY"'","results":[],"total":0}'
    else
        echo -e "${CYAN}[INFO]${NC} No results found for: $QUERY"
    fi
    exit 0
fi

# Sort results by score (descending)
sorted_results=$(printf '%s\n' "${results[@]}" | sort -t'|' -k1 -rn | head -n "$LIMIT")

if [ "$JSON_OUTPUT" = true ]; then
    echo '{"query":"'"$QUERY"'","results":['
    first=true
    while IFS= read -r result; do
        [ -z "$result" ] && continue
        score="" ; file="" ; entry=""
        score=$(echo "$result" | cut -d'|' -f1)
        file=$(echo "$result" | cut -d'|' -f2)
        entry=$(echo "$result" | cut -d'|' -f3-)
        if [ "$first" = true ]; then
            first=false
        else
            echo ","
        fi
        echo "{\"score\":$score,\"source\":\"$(basename "$file")\",\"entry\":$entry}"
    done <<< "$sorted_results"
    echo "],"
    echo "\"total\":$result_count}"
    exit 0
fi

# Display results
echo ""
echo -e "${BOLD}Search Results for: \"$QUERY\"${NC}"
echo -e "${DIM}Found $result_count matches (showing top $LIMIT)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

rank=1
while IFS= read -r result; do
    [ -z "$result" ] && continue
    score="" ; file="" ; entry=""
    score=$(echo "$result" | cut -d'|' -f1)
    file=$(echo "$result" | cut -d'|' -f2)
    entry=$(echo "$result" | cut -d'|' -f3-)

    content=$(echo "$entry" | grep -o '"content":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4 || true)
    type=$(echo "$entry" | grep -o '"type":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4 || true)
    weight=$(echo "$entry" | grep -o '"weight":[0-9.]*' 2>/dev/null | head -1 | cut -d':' -f2 || true)
    source=$(basename "$file")

    # Color by score
    score_color="$NC"
    if [ "$score" -ge 100 ]; then
        score_color="$GREEN"
    elif [ "$score" -ge 50 ]; then
        score_color="$YELLOW"
    else
        score_color="$BLUE"
    fi

    echo -e "  ${BOLD}#$rank${NC} ${score_color}[score: $score]${NC} ${DIM}($source)${NC}"
    echo -e "    ${CYAN}[$type]${NC} $content"
    if [ -n "$weight" ]; then
        echo -e "    ${DIM}weight: $weight${NC}"
    fi
    echo ""

    rank=$((rank + 1))
done <<< "$sorted_results"

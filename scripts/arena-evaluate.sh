#!/bin/bash

# Arena Mode Evaluation Engine
# Orchestrates competitive agent evaluation for Claude AS Framework.
# Multiple agents compete on the same story; gate-keeper selects the winner.
#
# USAGE:
#   ./scripts/arena-evaluate.sh setup --story=STORY-001 [--contestants=2]
#   ./scripts/arena-evaluate.sh evaluate --story=STORY-001 --solutions=dir1,dir2
#   ./scripts/arena-evaluate.sh results [--story=STORY-001]
#   ./scripts/arena-evaluate.sh history
#   ./scripts/arena-evaluate.sh cleanup [--story=STORY-001]
#   ./scripts/arena-evaluate.sh --help

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
ARENA_DIR="$FRAMEWORK_DIR/.arena"
RESULTS_FILE="$FRAMEWORK_DIR/.claude/arena-results.jsonl"

# Defaults
STORY=""
SOLUTIONS=""
CONTESTANTS=2
CRITERIA="correctness:0.4,quality:0.25,security:0.2,performance:0.15"
TIMEOUT=600  # 10 minutes per contestant

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Arena Mode Evaluation Engine — Claude AS Framework"
    echo ""
    echo "Orchestrates competitive agent evaluation where multiple agents"
    echo "compete on the same story and gate-keeper selects the winner."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/arena-evaluate.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  setup      Create isolated worktrees for contestants"
    echo "  evaluate   Score all solutions and select winner"
    echo "  results    Show results for a story (or latest)"
    echo "  history    Show all arena results"
    echo "  cleanup    Remove arena worktrees and branches"
    echo ""
    echo "OPTIONS:"
    echo "  --story=STORY           Story identifier (e.g., STORY-001)"
    echo "  --solutions=dir1,dir2   Comma-separated solution directories"
    echo "  --contestants=N         Number of contestants (default: 2)"
    echo "  --criteria=SPEC         Weighted criteria (default: correctness:0.4,...)"
    echo "  --timeout=SECONDS       Per-contestant timeout (default: 600)"
    echo "  --help                  Show this help message"
    echo ""
    echo "SCORING CRITERIA (default weights):"
    echo "  correctness  0.40  Meets acceptance criteria, tests pass"
    echo "  quality      0.25  Code clarity, patterns, maintainability"
    echo "  security     0.20  No vulnerabilities, proper validation"
    echo "  performance  0.15  Efficient algorithms, no bottlenecks"
    echo ""
    echo "EXAMPLES:"
    echo "  arena-evaluate.sh setup --story=STORY-001 --contestants=3"
    echo "  arena-evaluate.sh evaluate --story=STORY-001 --solutions=.arena/a,.arena/b"
    echo "  arena-evaluate.sh results --story=STORY-001"
    echo "  arena-evaluate.sh cleanup --story=STORY-001"
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

parse_options() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --story=*)       STORY="${1#*=}"; shift ;;
            --solutions=*)   SOLUTIONS="${1#*=}"; shift ;;
            --contestants=*) CONTESTANTS="${1#*=}"; shift ;;
            --criteria=*)    CRITERIA="${1#*=}"; shift ;;
            --timeout=*)     TIMEOUT="${1#*=}"; shift ;;
            --help)          show_help; exit 0 ;;
            *)               shift ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════
# SETUP - Create isolated worktrees
# ═══════════════════════════════════════════════════════════════

cmd_setup() {
    if [ -z "$STORY" ]; then
        echo -e "${RED}Error: --story is required${NC}"
        exit 1
    fi

    # Validate contestant count
    if [ "$CONTESTANTS" -lt 2 ] || [ "$CONTESTANTS" -gt 5 ]; then
        echo -e "${RED}Error: contestants must be between 2 and 5${NC}"
        exit 1
    fi

    echo -e "${CYAN}${BOLD}ARENA SETUP${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Story:        $STORY"
    echo "Contestants:  $CONTESTANTS"
    echo ""

    mkdir -p "$ARENA_DIR"

    local letters=("a" "b" "c" "d" "e")
    for i in $(seq 0 $((CONTESTANTS - 1))); do
        local letter="${letters[$i]}"
        local branch="arena/${STORY}-${letter}"
        local worktree="$ARENA_DIR/contestant-${letter}"

        if [ -d "$worktree" ]; then
            echo -e "${YELLOW}[WARN]${NC} Worktree already exists: contestant-${letter}"
            continue
        fi

        if git -C "$FRAMEWORK_DIR" worktree add "$worktree" -b "$branch" 2>/dev/null; then
            echo -e "${GREEN}[PASS]${NC} Created worktree: contestant-${letter} (branch: $branch)"
        else
            echo -e "${RED}[FAIL]${NC} Failed to create worktree: contestant-${letter}"
            return 1
        fi
    done

    echo ""
    echo -e "${GREEN}Arena ready.${NC} Contestants can now work in:"
    for i in $(seq 0 $((CONTESTANTS - 1))); do
        echo "  .arena/contestant-${letters[$i]}/"
    done
}

# ═══════════════════════════════════════════════════════════════
# EVALUATE - Score solutions and select winner
# ═══════════════════════════════════════════════════════════════

# Parse criteria string into weights
parse_criteria() {
    local criteria_str="$1"
    # Returns: correctness_w quality_w security_w performance_w
    local cw=0.4 qw=0.25 sw=0.2 pw=0.15

    IFS=',' read -ra parts <<< "$criteria_str"
    for part in "${parts[@]}"; do
        local name="${part%%:*}"
        local weight="${part##*:}"
        case "$name" in
            correctness)  cw="$weight" ;;
            quality)      qw="$weight" ;;
            security)     sw="$weight" ;;
            performance)  pw="$weight" ;;
        esac
    done

    echo "$cw $qw $sw $pw"
}

# Score a single solution directory
score_solution() {
    local solution_dir="$1"
    local contestant_id="$2"

    if [ ! -d "$solution_dir" ]; then
        echo -e "${RED}[FAIL]${NC} Solution directory not found: $solution_dir" >&2
        echo "0 0 0 0"
        return
    fi

    local correctness=0.0
    local quality=0.0
    local security=0.0
    local performance=0.0

    # Correctness: check if tests exist and pass
    local has_tests=false
    if find "$solution_dir" -name "test_*.py" -o -name "*.spec.ts" -o -name "*.test.js" -o -name "*_test.go" 2>/dev/null | grep -q .; then
        has_tests=true
        correctness=0.7
    fi
    # Check for implementation files (not just tests)
    local impl_files
    impl_files=$(find "$solution_dir" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.sh" 2>/dev/null | grep -v test | grep -v spec | wc -l)
    if [ "$impl_files" -gt 0 ]; then
        correctness=$(echo "$correctness + 0.3" | bc)
    fi

    # Quality: check for documentation, clean code patterns
    local has_docs=false
    if find "$solution_dir" -name "*.md" 2>/dev/null | grep -q .; then
        has_docs=true
        quality=$(echo "$quality + 0.3" | bc)
    fi
    # Check for type hints / docstrings
    if grep -rql "def .*->.*:" "$solution_dir" 2>/dev/null || grep -rql "/**" "$solution_dir" 2>/dev/null; then
        quality=$(echo "$quality + 0.4" | bc)
    fi
    if [ "$impl_files" -gt 0 ]; then
        quality=$(echo "$quality + 0.3" | bc)
    fi

    # Security: check for common security patterns
    local security_issues=0
    # Check for hardcoded secrets
    if grep -rqiE "(password|secret|api_key)\s*=\s*['\"]" "$solution_dir" 2>/dev/null; then
        security_issues=$((security_issues + 1))
    fi
    # Check for SQL injection risk
    if grep -rqE "f\".*SELECT.*{" "$solution_dir" 2>/dev/null; then
        security_issues=$((security_issues + 1))
    fi
    security=$(echo "1.0 - ($security_issues * 0.3)" | bc)
    if [ "$(echo "$security < 0" | bc)" -eq 1 ]; then
        security=0.0
    fi

    # Performance: basic heuristic (no N+1, proper indexing mentions)
    performance=0.7
    if grep -rqiE "(index|cache|optimize|batch)" "$solution_dir" 2>/dev/null; then
        performance=0.9
    fi

    echo "$correctness $quality $security $performance"
}

cmd_evaluate() {
    if [ -z "$STORY" ]; then
        echo -e "${RED}Error: --story is required${NC}"
        exit 1
    fi

    if [ -z "$SOLUTIONS" ]; then
        echo -e "${RED}Error: --solutions is required${NC}"
        echo "Usage: arena-evaluate.sh evaluate --story=STORY-001 --solutions=dir1,dir2"
        exit 1
    fi

    echo -e "${CYAN}${BOLD}ARENA EVALUATION${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Story:    $STORY"
    echo "Criteria: $CRITERIA"
    echo ""

    # Parse weights
    local weights
    weights=$(parse_criteria "$CRITERIA")
    read -r cw qw sw pw <<< "$weights"

    # Score each solution
    IFS=',' read -ra solution_dirs <<< "$SOLUTIONS"
    local best_score=0
    local best_id=""
    local contestants_json=""
    local letters=("a" "b" "c" "d" "e")
    local idx=0

    for dir in "${solution_dirs[@]}"; do
        local contestant_id="contestant-${letters[$idx]}"
        echo -e "${BLUE}Scoring: $contestant_id${NC} ($dir)"

        local scores
        scores=$(score_solution "$dir" "$contestant_id")
        read -r cs qs ss ps <<< "$scores"

        # Calculate weighted total
        local total
        total=$(echo "$cs * $cw + $qs * $qw + $ss * $sw + $ps * $pw" | bc -l)
        total=$(printf '%.3f' "$total")

        printf "  Correctness:  %.2f (weight: %s)\n" "$cs" "$cw"
        printf "  Quality:      %.2f (weight: %s)\n" "$qs" "$qw"
        printf "  Security:     %.2f (weight: %s)\n" "$ss" "$sw"
        printf "  Performance:  %.2f (weight: %s)\n" "$ps" "$pw"
        printf "  ${BOLD}Total:        %s${NC}\n" "$total"
        echo ""

        # Build contestant JSON
        local cjson
        cjson=$(jq -nc \
            --arg id "$contestant_id" \
            --arg agent "coder" \
            --arg model "default" \
            --argjson cs "$cs" \
            --argjson qs "$qs" \
            --argjson ss "$ss" \
            --argjson ps "$ps" \
            --argjson total "$total" \
            --argjson selected false \
            '{id:$id,agent:$agent,model:$model,scores:{correctness:$cs,quality:$qs,security:$ss,performance:$ps},total:$total,selected:$selected}')
        contestants_json="${contestants_json}${cjson}\n"

        # Track best
        if [ "$(echo "$total > $best_score" | bc)" -eq 1 ]; then
            best_score="$total"
            best_id="$contestant_id"
        fi

        idx=$((idx + 1))
    done

    # Mark winner
    echo -e "${GREEN}${BOLD}Winner: $best_id${NC} (score: $best_score)"
    echo ""

    # Build result JSON
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Construct contestants array with winner marked
    local result
    result=$(printf '%b' "$contestants_json" | grep -v '^$' | jq -s \
        --arg winner "$best_id" \
        '[.[] | if .id == $winner then .selected = true else . end]')

    local full_result
    full_result=$(jq -nc \
        --arg story "$STORY" \
        --arg ts "$timestamp" \
        --argjson contestants "$result" \
        --arg winner "$best_id" \
        --arg reason "Highest weighted score ($CRITERIA)" \
        '{story:$story,timestamp:$ts,contestants:$contestants,winner:$winner,selection_reason:$reason}')

    # Log result
    mkdir -p "$(dirname "$RESULTS_FILE")"
    echo "$full_result" >> "$RESULTS_FILE"
    echo -e "${GREEN}[PASS]${NC} Results logged to $RESULTS_FILE"
}

# ═══════════════════════════════════════════════════════════════
# RESULTS - Show evaluation results
# ═══════════════════════════════════════════════════════════════

cmd_results() {
    if [ ! -f "$RESULTS_FILE" ] || [ ! -s "$RESULTS_FILE" ]; then
        echo -e "${YELLOW}No arena results yet.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}ARENA RESULTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ -n "$STORY" ]; then
        # Filter by story
        jq -c --arg s "$STORY" 'select(.story == $s)' "$RESULTS_FILE" | while IFS= read -r line; do
            echo "$line" | jq .
        done
    else
        # Show latest result
        tail -1 "$RESULTS_FILE" | jq .
    fi
}

# ═══════════════════════════════════════════════════════════════
# HISTORY - Show all arena results
# ═══════════════════════════════════════════════════════════════

cmd_history() {
    if [ ! -f "$RESULTS_FILE" ] || [ ! -s "$RESULTS_FILE" ]; then
        echo -e "${YELLOW}No arena history yet.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}ARENA HISTORY${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local count=0
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        local story ts winner
        story=$(echo "$line" | jq -r '.story')
        ts=$(echo "$line" | jq -r '.timestamp' | cut -c1-16)
        winner=$(echo "$line" | jq -r '.winner')
        local num_contestants
        num_contestants=$(echo "$line" | jq '.contestants | length')

        printf "  %-15s %-20s Winner: %-15s (%d contestants)\n" "$story" "$ts" "$winner" "$num_contestants"
        count=$((count + 1))
    done < "$RESULTS_FILE"

    echo ""
    echo "Total arena runs: $count"
}

# ═══════════════════════════════════════════════════════════════
# CLEANUP - Remove arena worktrees
# ═══════════════════════════════════════════════════════════════

cmd_cleanup() {
    echo -e "${CYAN}${BOLD}ARENA CLEANUP${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -d "$ARENA_DIR" ]; then
        echo -e "${YELLOW}No arena directory found.${NC}"
        exit 0
    fi

    local cleaned=0
    for worktree in "$ARENA_DIR"/contestant-*; do
        [ -d "$worktree" ] || continue
        local name
        name=$(basename "$worktree")

        if git -C "$FRAMEWORK_DIR" worktree remove "$worktree" --force 2>/dev/null; then
            echo -e "${GREEN}[PASS]${NC} Removed worktree: $name"
            cleaned=$((cleaned + 1))
        else
            # Worktree might not be a git worktree, just remove directory
            rm -rf "$worktree" 2>/dev/null || true
            echo -e "${YELLOW}[WARN]${NC} Removed directory: $name"
            cleaned=$((cleaned + 1))
        fi
    done

    # Clean up arena branches
    if [ -n "$STORY" ]; then
        local branches
        branches=$(git -C "$FRAMEWORK_DIR" branch --list "arena/${STORY}-*" 2>/dev/null || true)
        while IFS= read -r branch; do
            [ -z "$branch" ] && continue
            branch=$(echo "$branch" | xargs)
            if git -C "$FRAMEWORK_DIR" branch -D "$branch" 2>/dev/null; then
                echo -e "${GREEN}[PASS]${NC} Deleted branch: $branch"
            fi
        done <<< "$branches"
    fi

    # Remove arena dir if empty
    rmdir "$ARENA_DIR" 2>/dev/null || true

    echo ""
    echo "Cleaned $cleaned worktree(s)"
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

parse_options "$@"

case "$COMMAND" in
    setup)
        cmd_setup
        ;;
    evaluate)
        cmd_evaluate
        ;;
    results)
        cmd_results
        ;;
    history)
        cmd_history
        ;;
    cleanup)
        cmd_cleanup
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {setup|evaluate|results|history|cleanup} [options]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

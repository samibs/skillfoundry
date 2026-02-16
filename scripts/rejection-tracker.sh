#!/bin/bash

# Gate Rejection Pattern Tracker
# Tracks, categorizes, and analyzes gate-keeper rejections.
# Feeds into the quality primer for self-improving quality rules.
#
# USAGE:
#   ./scripts/rejection-tracker.sh record <category> <description> [--agent=X] [--story=X]
#   ./scripts/rejection-tracker.sh list [--category=X] [--since=YYYY-MM-DD]
#   ./scripts/rejection-tracker.sh stats
#   ./scripts/rejection-tracker.sh trends [--period=week|month]
#   ./scripts/rejection-tracker.sh rules [approve|reject|active|inject] [ID]
#   ./scripts/rejection-tracker.sh --help

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
REJECTIONS_FILE=".claude/rejections.jsonl"
RULES_FILE=".claude/learned-rules.jsonl"
QUALITY_PRIMER="agents/_quality-primer.md"
RULE_THRESHOLD=3  # Number of identical rejections before auto-proposing a rule

# Parsed args
AGENT=""
STORY=""
CATEGORY=""
SINCE=""
PERIOD="week"

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Gate Rejection Pattern Tracker"
    echo ""
    echo "Tracks patterns in gate-keeper rejections to improve code quality over time."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/rejection-tracker.sh <command> [args] [options]"
    echo ""
    echo "COMMANDS:"
    echo "  record <category> <desc>   Record a new rejection"
    echo "  list                        List all rejections"
    echo "  stats                       Show rejection statistics"
    echo "  trends                      Show rejection trends over time"
    echo "  rules                       List proposed rules"
    echo "  rules approve <ID>          Approve a proposed rule"
    echo "  rules reject <ID>           Reject a proposed rule"
    echo "  rules active                List active (approved) rules"
    echo "  rules inject                Update quality primer with active rules"
    echo ""
    echo "CATEGORIES:"
    echo "  missing_validation    No input validation"
    echo "  banned_pattern        TODO/FIXME/HACK found"
    echo "  missing_tests         Business logic without tests"
    echo "  security_violation    Hardcoded secrets, XSS, etc."
    echo "  missing_docs          Public method without docs"
    echo "  missing_error_handling Silent failures"
    echo "  performance_issue     N+1 queries, missing indexes"
    echo "  accessibility_gap     Missing labels, aria attributes"
    echo "  architectural_violation Wrong layer, circular dep"
    echo "  other                 Uncategorized"
    echo ""
    echo "OPTIONS:"
    echo "  --agent=AGENT         Agent that produced the rejected code"
    echo "  --story=STORY         Story being implemented"
    echo "  --category=CAT        Filter by category (for list)"
    echo "  --since=YYYY-MM-DD    Filter by date (for list)"
    echo "  --period=week|month   Period for trends"
    echo "  --json                JSON output"
    echo "  --help                Show this help"
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

parse_options() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent=*)    AGENT="${1#*=}"; shift ;;
            --story=*)    STORY="${1#*=}"; shift ;;
            --category=*) CATEGORY="${1#*=}"; shift ;;
            --since=*)    SINCE="${1#*=}"; shift ;;
            --period=*)   PERIOD="${1#*=}"; shift ;;
            --json)       JSON_OUTPUT=true; shift ;;
            --help)       show_help; exit 0 ;;
            *)            shift ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════
# RECORD - Log a new rejection
# ═══════════════════════════════════════════════════════════════

cmd_record() {
    local category="${1:-}"
    local description="${2:-}"

    if [ -z "$category" ] || [ -z "$description" ]; then
        echo -e "${RED}Error: category and description required${NC}"
        echo "Usage: rejection-tracker.sh record <category> <description>"
        exit 1
    fi

    # Validate category against known values
    case "$category" in
        missing_validation|banned_pattern|missing_tests|security_violation|missing_docs|\
        missing_error_handling|performance_issue|accessibility_gap|architectural_violation|other)
            ;; # valid
        *)
            echo -e "${RED}Error: unknown category: $category${NC}"
            echo "Valid categories: missing_validation, banned_pattern, missing_tests, security_violation,"
            echo "  missing_docs, missing_error_handling, performance_issue, accessibility_gap,"
            echo "  architectural_violation, other"
            exit 1
            ;;
    esac

    # Determine if auto-fixable
    local auto_fixable="false"
    case "$category" in
        missing_validation|banned_pattern|missing_tests|missing_docs|missing_error_handling|accessibility_gap)
            auto_fixable="true"
            ;;
    esac

    # Determine severity
    local severity="medium"
    case "$category" in
        security_violation|architectural_violation) severity="high" ;;
        banned_pattern) severity="critical" ;;
        missing_docs|accessibility_gap) severity="low" ;;
    esac

    mkdir -p "$(dirname "$REJECTIONS_FILE")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq -nc \
        --arg ts "$timestamp" \
        --arg cat "$category" \
        --arg desc "$description" \
        --arg agent "${AGENT:-unknown}" \
        --arg story "${STORY:-unknown}" \
        --arg sev "$severity" \
        --argjson fix "$auto_fixable" \
        '{timestamp:$ts,category:$cat,description:$desc,agent:$agent,story:$story,severity:$sev,auto_fixable:$fix}' \
        >> "$REJECTIONS_FILE"

    echo -e "${GREEN}[PASS]${NC} Rejection recorded: $category"

    # Check if we've hit the threshold for auto-rule proposal
    check_rule_threshold "$category" "$description"
}

check_rule_threshold() {
    local category="$1"
    local description="$2"

    if [ ! -f "$REJECTIONS_FILE" ]; then return; fi

    local count
    count=$(jq -c --arg cat "$category" 'select(.category == $cat)' "$REJECTIONS_FILE" 2>/dev/null | wc -l)

    if [ "$count" -ge "$RULE_THRESHOLD" ]; then
        # Check if rule already exists for this category (safe jq filtering)
        local existing=""
        if [ -f "$RULES_FILE" ]; then
            existing=$(jq -c --arg cat "$category" 'select(.category == $cat)' "$RULES_FILE" 2>/dev/null || true)
        fi

        if [ -z "$existing" ]; then
            propose_rule "$category" "$count"
        fi
    fi
}

propose_rule() {
    local category="$1"
    local source_count="$2"

    mkdir -p "$(dirname "$RULES_FILE")"

    # Generate rule description based on category
    local rule_desc=""
    case "$category" in
        missing_validation) rule_desc="Always validate request body on POST/PUT/PATCH endpoints before processing" ;;
        banned_pattern) rule_desc="Scan generated code for banned patterns (TODO/FIXME/HACK) before output" ;;
        missing_tests) rule_desc="Generate tests alongside business logic — never output code without matching tests" ;;
        security_violation) rule_desc="Check for hardcoded credentials and ensure all secrets use environment variables" ;;
        missing_docs) rule_desc="Add docstring/JSDoc to every public function and method" ;;
        missing_error_handling) rule_desc="Every catch/except block must log the error with context — no silent failures" ;;
        performance_issue) rule_desc="Use parameterized queries and check for N+1 patterns in database access code" ;;
        accessibility_gap) rule_desc="Include aria-label, alt text, and proper semantic HTML elements in UI code" ;;
        architectural_violation) rule_desc="Verify correct layer separation before generating cross-boundary code" ;;
        *) rule_desc="Address recurring '$category' violations in generated code" ;;
    esac

    local rule_id="LR-$(date +%Y%m%d%H%M%S)"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq -nc \
        --arg id "$rule_id" \
        --arg ts "$timestamp" \
        --arg cat "$category" \
        --arg rule "$rule_desc" \
        --argjson count "$source_count" \
        --arg status "proposed" \
        '{id:$id,created:$ts,category:$cat,rule:$rule,source_rejections:$count,status:$status,approved_by:null}' \
        >> "$RULES_FILE"

    echo -e "${YELLOW}[RULE]${NC} New rule proposed: $rule_id"
    echo "  Category: $category ($source_count rejections)"
    echo "  Rule: $rule_desc"
    echo "  Approve: rejection-tracker.sh rules approve $rule_id"
}

# ═══════════════════════════════════════════════════════════════
# LIST - Show all rejections
# ═══════════════════════════════════════════════════════════════

cmd_list() {
    if [ ! -f "$REJECTIONS_FILE" ] || [ ! -s "$REJECTIONS_FILE" ]; then
        echo -e "${YELLOW}No rejections recorded.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}REJECTION LOG${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local entries
    if [ -n "$CATEGORY" ]; then
        # Use jq for safe filtering — no eval, no shell injection
        entries=$(jq -c --arg cat "$CATEGORY" 'select(.category == $cat)' "$REJECTIONS_FILE" 2>/dev/null || true)
    else
        entries=$(cat "$REJECTIONS_FILE" 2>/dev/null || true)
    fi

    if [ -n "$SINCE" ]; then
        entries=$(echo "$entries" | jq -c --arg since "$SINCE" 'select(.timestamp >= $since)' 2>/dev/null || true)
    fi

    if [ -z "$entries" ]; then
        echo -e "${YELLOW}No rejections matching filter.${NC}"
        exit 0
    fi

    echo "$entries" | while IFS= read -r line; do
        if [ -z "$line" ]; then continue; fi
        local ts cat desc sev agent
        ts=$(echo "$line" | jq -r '.timestamp' 2>/dev/null | cut -c1-16)
        cat=$(echo "$line" | jq -r '.category' 2>/dev/null)
        desc=$(echo "$line" | jq -r '.description' 2>/dev/null)
        sev=$(echo "$line" | jq -r '.severity' 2>/dev/null)
        agent=$(echo "$line" | jq -r '.agent' 2>/dev/null)

        local color="$NC"
        case "$sev" in
            critical) color="$RED" ;;
            high) color="$YELLOW" ;;
            low) color="$BLUE" ;;
        esac

        printf "  %s ${color}%-22s${NC} %-12s %s\n" "$ts" "$cat" "$agent" "$desc"
    done
}

# ═══════════════════════════════════════════════════════════════
# STATS - Rejection statistics
# ═══════════════════════════════════════════════════════════════

cmd_stats() {
    if [ ! -f "$REJECTIONS_FILE" ] || [ ! -s "$REJECTIONS_FILE" ]; then
        echo -e "${YELLOW}No rejections recorded.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}REJECTION STATISTICS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local total
    total=$(wc -l < "$REJECTIONS_FILE")
    echo "Total rejections: $total"
    echo ""

    echo "By category:"
    jq -r '.category' "$REJECTIONS_FILE" | sort | uniq -c | sort -rn | while read -r count cat; do
        local pct=$((count * 100 / total))
        printf "  %-25s %3d (%d%%)\n" "$cat" "$count" "$pct"
    done

    echo ""
    echo "By severity:"
    jq -r '.severity' "$REJECTIONS_FILE" | sort | uniq -c | sort -rn | while read -r count sev; do
        printf "  %-12s %d\n" "$sev" "$count"
    done

    echo ""
    echo "By agent:"
    jq -r '.agent' "$REJECTIONS_FILE" | sort | uniq -c | sort -rn | head -5 | while read -r count agent; do
        printf "  %-20s %d\n" "$agent" "$count"
    done

    local auto_fixable
    auto_fixable=$(jq -r 'select(.auto_fixable == true) | .category' "$REJECTIONS_FILE" | wc -l || echo "0")
    echo ""
    echo "Auto-fixable: $auto_fixable / $total ($((auto_fixable * 100 / total))%)"
}

# ═══════════════════════════════════════════════════════════════
# TRENDS - Rejection trends over time
# ═══════════════════════════════════════════════════════════════

cmd_trends() {
    if [ ! -f "$REJECTIONS_FILE" ] || [ ! -s "$REJECTIONS_FILE" ]; then
        echo -e "${YELLOW}No rejections recorded.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}REJECTION TRENDS${NC} (by $PERIOD)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local date_fmt="%Y-%m-%d"
    if [ "$PERIOD" = "month" ]; then
        date_fmt="%Y-%m"
    fi

    jq -r ".timestamp[:${#date_fmt}+1]" "$REJECTIONS_FILE" 2>/dev/null | \
        cut -c1-$((${#date_fmt})) | \
        sort | uniq -c | while read -r count period; do
        printf "  %-12s %d " "$period" "$count"
        # Simple bar chart
        local bars=$((count * 2))
        local i=0
        while [ "$i" -lt "$bars" ] && [ "$i" -lt 40 ]; do
            printf "█"
            i=$((i + 1))
        done
        echo ""
    done
}

# ═══════════════════════════════════════════════════════════════
# RULES - Manage learned quality rules
# ═══════════════════════════════════════════════════════════════

cmd_rules() {
    local subcmd="${1:-list}"
    local rule_id="${2:-}"

    case "$subcmd" in
        list|"")
            rules_list
            ;;
        approve)
            rules_update "$rule_id" "approved"
            ;;
        reject)
            rules_update "$rule_id" "rejected"
            ;;
        active)
            rules_active
            ;;
        inject)
            rules_inject
            ;;
        *)
            echo -e "${RED}Unknown rules subcommand: $subcmd${NC}"
            exit 1
            ;;
    esac
}

rules_list() {
    if [ ! -f "$RULES_FILE" ] || [ ! -s "$RULES_FILE" ]; then
        echo -e "${YELLOW}No rules proposed yet.${NC}"
        echo "Rules are auto-proposed after $RULE_THRESHOLD+ identical rejections."
        exit 0
    fi

    echo -e "${CYAN}${BOLD}PROPOSED RULES${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    while IFS= read -r line; do
        if [ -z "$line" ]; then continue; fi
        local id status cat rule rej
        id=$(echo "$line" | jq -r '.id')
        status=$(echo "$line" | jq -r '.status')
        cat=$(echo "$line" | jq -r '.category')
        rule=$(echo "$line" | jq -r '.rule')
        rej=$(echo "$line" | jq -r '.source_rejections')

        local icon="?"
        local color="$YELLOW"
        case "$status" in
            proposed) icon="?" ; color="$YELLOW" ;;
            approved) icon="✓" ; color="$GREEN" ;;
            rejected) icon="×" ; color="$RED" ;;
        esac

        echo -e "  ${color}[$icon]${NC} $id ($cat, $rej rejections)"
        echo "      $rule"
        echo "      Status: $status"
        echo ""
    done < "$RULES_FILE"
}

rules_update() {
    local target_id="$1"
    local new_status="$2"

    if [ -z "$target_id" ]; then
        echo -e "${RED}Error: rule ID required${NC}"
        exit 1
    fi

    if [ ! -f "$RULES_FILE" ]; then
        echo -e "${RED}Error: no rules file found${NC}"
        exit 1
    fi

    # Update the rule in-place using a temp file (secure: project dir + restrictive perms)
    local temp_dir
    temp_dir="$(dirname "$RULES_FILE")"
    mkdir -p "$temp_dir"
    local temp_file
    temp_file=$(mktemp "$temp_dir/.rules-update.XXXXXX")
    chmod 600 "$temp_file"
    local found=false

    while IFS= read -r line; do
        local id
        id=$(echo "$line" | jq -r '.id' 2>/dev/null || echo "")
        if [ "$id" = "$target_id" ]; then
            echo "$line" | jq -c --arg s "$new_status" '.status = $s' >> "$temp_file"
            found=true
        else
            echo "$line" >> "$temp_file"
        fi
    done < "$RULES_FILE"

    if [ "$found" = true ]; then
        mv "$temp_file" "$RULES_FILE"
        echo -e "${GREEN}[PASS]${NC} Rule $target_id → $new_status"
    else
        rm "$temp_file"
        echo -e "${RED}Error: Rule $target_id not found${NC}"
        exit 1
    fi
}

rules_active() {
    if [ ! -f "$RULES_FILE" ] || [ ! -s "$RULES_FILE" ]; then
        echo -e "${YELLOW}No rules exist.${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}ACTIVE RULES${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local count=0
    while IFS= read -r line; do
        local status
        status=$(echo "$line" | jq -r '.status' 2>/dev/null)
        if [ "$status" = "approved" ]; then
            local id rule cat
            id=$(echo "$line" | jq -r '.id')
            rule=$(echo "$line" | jq -r '.rule')
            cat=$(echo "$line" | jq -r '.category')
            echo -e "  ${GREEN}[✓]${NC} $id ($cat)"
            echo "      $rule"
            echo ""
            count=$((count + 1))
        fi
    done < "$RULES_FILE"

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No active rules. Approve proposed rules to activate them.${NC}"
    else
        echo "Total: $count active rules"
    fi
}

rules_inject() {
    if [ ! -f "$RULES_FILE" ] || [ ! -s "$RULES_FILE" ]; then
        echo -e "${YELLOW}No rules to inject.${NC}"
        exit 0
    fi

    if [ ! -f "$QUALITY_PRIMER" ]; then
        echo -e "${RED}Error: Quality primer not found at $QUALITY_PRIMER${NC}"
        exit 1
    fi

    # Collect approved rules
    local rules_text=""
    local count=0
    while IFS= read -r line; do
        local status
        status=$(echo "$line" | jq -r '.status' 2>/dev/null)
        if [ "$status" = "approved" ]; then
            local rule cat
            rule=$(echo "$line" | jq -r '.rule')
            cat=$(echo "$line" | jq -r '.category')
            rules_text="${rules_text}\n- **${cat}**: ${rule}"
            count=$((count + 1))
        fi
    done < "$RULES_FILE"

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No approved rules to inject.${NC}"
        exit 0
    fi

    # Replace the learned rules section in quality primer using awk (safe — no user input in patterns)
    local marker="_No learned rules yet"
    local inject_text
    inject_text=$(printf '**%d learned rules active:**\n%b' "$count" "$rules_text")

    if grep -qF "$marker" "$QUALITY_PRIMER"; then
        local temp_primer
        temp_primer=$(mktemp "$(dirname "$QUALITY_PRIMER")/.primer-update.XXXXXX")
        chmod 600 "$temp_primer"
        awk -v marker="$marker" -v replacement="$inject_text" \
            '{if (index($0, marker) > 0) print replacement; else print}' \
            "$QUALITY_PRIMER" > "$temp_primer"
        mv "$temp_primer" "$QUALITY_PRIMER"
        echo -e "${GREEN}[PASS]${NC} Injected $count rules into quality primer"
    else
        echo -e "${YELLOW}[WARN]${NC} Learned rules section marker not found in primer"
        echo "Rules may need manual injection."
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

JSON_OUTPUT=false

COMMAND="${1:-}"
shift 2>/dev/null || true

# Parse remaining options
parse_options "$@"

case "$COMMAND" in
    record)
        cmd_record "$@"
        ;;
    list)
        cmd_list
        ;;
    stats)
        cmd_stats
        ;;
    trends)
        cmd_trends
        ;;
    rules)
        cmd_rules "$@"
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {record|list|stats|trends|rules} [args]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

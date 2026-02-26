#!/bin/bash
# Knowledge Promotion Pipeline - Validate, score, and promote lessons from staging to promoted
# Processes markdown lesson files in knowledge/staging/ according to the lesson schema.
#
# USAGE:
#   ./scripts/promote-knowledge.sh                  Promote qualifying lessons (default)
#   ./scripts/promote-knowledge.sh promote           Promote qualifying lessons (explicit)
#   ./scripts/promote-knowledge.sh scan              Scan and report only (no mutations)
#   ./scripts/promote-knowledge.sh force             Promote all valid lessons regardless of score
#   ./scripts/promote-knowledge.sh reject <id>       Reject a specific lesson by lesson_id
#   ./scripts/promote-knowledge.sh stats             Show staging/promoted/rejected counts
#   ./scripts/promote-knowledge.sh --help            Show help
#
# Pure bash — no external dependencies beyond grep, sed, awk.

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# COLORS & FORMATTING
# ═══════════════════════════════════════════════════════════════

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

# ═══════════════════════════════════════════════════════════════
# DIRECTORY SETUP
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KNOWLEDGE_DIR="$FRAMEWORK_DIR/knowledge"
STAGING_DIR="$KNOWLEDGE_DIR/staging"
PROMOTED_DIR="$KNOWLEDGE_DIR/promoted"
SANITIZE_SCRIPT="$SCRIPT_DIR/sanitize-knowledge.sh"

# Valid categories from schema.md
VALID_CATEGORIES="decision error pattern architecture tooling"

# ═══════════════════════════════════════════════════════════════
# COUNTERS
# ═══════════════════════════════════════════════════════════════

COUNT_SCANNED=0
COUNT_PROMOTED=0
COUNT_KEPT=0
COUNT_REJECTED=0
COUNT_DUPLICATES=0

# Temp file for accumulating warnings
WARN_LOG=""

# ═══════════════════════════════════════════════════════════════
# USAGE / HELP
# ═══════════════════════════════════════════════════════════════

usage() {
    cat <<EOF
${BOLD}promote-knowledge.sh${NC} - Knowledge Promotion Pipeline

${BOLD}USAGE:${NC}
  promote-knowledge.sh                   Promote qualifying lessons (default)
  promote-knowledge.sh promote           Promote qualifying lessons (explicit)
  promote-knowledge.sh scan              Scan and report only (no mutations)
  promote-knowledge.sh force             Promote all valid lessons regardless of score
  promote-knowledge.sh reject <id>       Reject a specific lesson by lesson_id
  promote-knowledge.sh stats             Show staging/promoted/rejected counts
  promote-knowledge.sh --help            Show help

${BOLD}DESCRIPTION:${NC}
  Processes markdown lesson files in knowledge/staging/ through a validation,
  deduplication, and scoring pipeline. Lessons that pass all gates and meet the
  minimum promotion score are moved to knowledge/promoted/.

${BOLD}PROMOTION SCORING:${NC}
  +2  Has all required body sections (Context + Decision/Error/Pattern + Outcome)
  +1  Has 3 or more tags
  +1  Category is "pattern" or "architecture" (higher reuse value)
  +1  Weight >= 0.7

  Minimum score to promote: 3 (out of 5)

${BOLD}VALIDATION RULES:${NC}
  - Required YAML frontmatter: lesson_id, title, category, status, tags
  - Category must be one of: decision, error, pattern, architecture, tooling
  - No security violations (checked via sanitize-knowledge.sh --check)
  - Required body sections: Context, at least one of Decision/Error/Pattern, Outcome

${BOLD}FLOW:${NC}
  knowledge/staging/  →  validate  →  dedup  →  score  →  knowledge/promoted/

${BOLD}EXIT CODES:${NC}
  0  Success
  1  Error (missing directories, invalid arguments, etc.)

${BOLD}EXAMPLES:${NC}
  promote-knowledge.sh                   # Run full promotion pipeline
  promote-knowledge.sh scan              # Preview what would happen
  promote-knowledge.sh force             # Promote everything valid
  promote-knowledge.sh reject my-lesson  # Reject lesson with id "my-lesson"
  promote-knowledge.sh stats             # Quick counts
EOF
}

# ═══════════════════════════════════════════════════════════════
# LOGGING HELPERS
# ═══════════════════════════════════════════════════════════════

log_info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_ok() {
    printf "${GREEN}[OK]${NC} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
    if [ -n "$WARN_LOG" ] && [ -d "$(dirname "$WARN_LOG")" ]; then
        echo "$1" >> "$WARN_LOG"
    fi
}

log_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

log_promote() {
    printf "${GREEN}[PROMOTED]${NC} %s\n" "$1"
}

log_skip() {
    printf "${YELLOW}[SKIP]${NC} %s\n" "$1"
}

log_reject() {
    printf "${RED}[REJECT]${NC} %s\n" "$1"
}

# ═══════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════

cleanup() {
    if [ -n "$WARN_LOG" ] && [ -f "$WARN_LOG" ]; then
        rm -f "$WARN_LOG"
    fi
}

trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
# DIRECTORY VERIFICATION
# ═══════════════════════════════════════════════════════════════

ensure_directories() {
    if [ ! -d "$KNOWLEDGE_DIR" ]; then
        log_error "Knowledge directory not found: $KNOWLEDGE_DIR"
        exit 1
    fi

    # Create staging and promoted if they don't exist
    if [ ! -d "$STAGING_DIR" ]; then
        mkdir -p "$STAGING_DIR"
        log_info "Created staging directory: $STAGING_DIR"
    fi

    if [ ! -d "$PROMOTED_DIR" ]; then
        mkdir -p "$PROMOTED_DIR"
        log_info "Created promoted directory: $PROMOTED_DIR"
    fi
}

# ═══════════════════════════════════════════════════════════════
# FRONTMATTER PARSING
# ═══════════════════════════════════════════════════════════════

# Extract the YAML frontmatter block (between --- delimiters) from a file
# Outputs the frontmatter lines (without the --- delimiters)
extract_frontmatter() {
    local filepath="$1"
    local in_frontmatter=0
    local found_start=0

    while IFS= read -r line || [ -n "$line" ]; do
        if [ "$found_start" -eq 0 ]; then
            # Look for opening ---
            if echo "$line" | grep -qE '^---[[:space:]]*$'; then
                found_start=1
                in_frontmatter=1
                continue
            fi
        elif [ "$in_frontmatter" -eq 1 ]; then
            # Look for closing ---
            if echo "$line" | grep -qE '^---[[:space:]]*$'; then
                return 0
            fi
            echo "$line"
        fi
    done < "$filepath"

    # If we never found closing ---, frontmatter is invalid
    if [ "$found_start" -eq 1 ] && [ "$in_frontmatter" -eq 1 ]; then
        return 1
    fi
    return 1
}

# Extract a single YAML value from frontmatter text
# Handles: key: value, key: "value", key: [a, b, c]
get_frontmatter_value() {
    local frontmatter="$1"
    local key="$2"

    local line
    line=$(echo "$frontmatter" | grep -E "^${key}:" | head -1)

    if [ -z "$line" ]; then
        echo ""
        return
    fi

    # Extract value after "key: "
    local value
    value=$(echo "$line" | sed "s/^${key}:[[:space:]]*//" | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//")
    echo "$value"
}

# Extract tags as a space-separated list (strip YAML array syntax)
get_frontmatter_tags() {
    local frontmatter="$1"

    local raw
    raw=$(get_frontmatter_value "$frontmatter" "tags")

    if [ -z "$raw" ]; then
        echo ""
        return
    fi

    # Strip [ ] and commas, normalize to space-separated
    echo "$raw" | sed 's/^\[//;s/\]$//;s/,/ /g' | tr -s ' ' | sed 's/^ //;s/ $//'
}

# Count tags
count_tags() {
    local tags_str="$1"
    if [ -z "$tags_str" ]; then
        echo "0"
        return
    fi
    echo "$tags_str" | wc -w | tr -d ' '
}

# Extract the weight as a number (default 0.5)
get_frontmatter_weight() {
    local frontmatter="$1"
    local raw
    raw=$(get_frontmatter_value "$frontmatter" "weight")

    if [ -z "$raw" ]; then
        echo "0.5"
        return
    fi

    # Validate it looks like a number
    if echo "$raw" | grep -qE '^[0-9]+\.?[0-9]*$'; then
        echo "$raw"
    else
        echo "0.5"
    fi
}

# ═══════════════════════════════════════════════════════════════
# BODY SECTION DETECTION
# ═══════════════════════════════════════════════════════════════

# Check if a file body contains a specific markdown heading (## Section)
has_body_section() {
    local filepath="$1"
    local section_name="$2"

    # Search for ## Section (case-insensitive)
    grep -qi "^##[[:space:]]*${section_name}" "$filepath" 2>/dev/null
}

# Check required body sections
# Returns: 0 if valid, 1 if missing sections
# Outputs: comma-separated list of missing sections on failure
validate_body_sections() {
    local filepath="$1"
    local missing=""

    # Must have Context
    if ! has_body_section "$filepath" "Context"; then
        missing="Context"
    fi

    # Must have at least one of Decision, Error, Pattern, Fix
    local has_dep=0
    if has_body_section "$filepath" "Decision"; then
        has_dep=1
    elif has_body_section "$filepath" "Error"; then
        has_dep=1
    elif has_body_section "$filepath" "Pattern"; then
        has_dep=1
    elif has_body_section "$filepath" "Fix"; then
        has_dep=1
    fi

    if [ "$has_dep" -eq 0 ]; then
        if [ -n "$missing" ]; then
            missing="${missing}, Decision/Error/Pattern"
        else
            missing="Decision/Error/Pattern"
        fi
    fi

    # Must have Outcome
    if ! has_body_section "$filepath" "Outcome"; then
        if [ -n "$missing" ]; then
            missing="${missing}, Outcome"
        else
            missing="Outcome"
        fi
    fi

    if [ -n "$missing" ]; then
        echo "$missing"
        return 1
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════

# Validate a single lesson file
# Returns 0 if valid, 1 if invalid
# Outputs error reason on failure
validate_lesson() {
    local filepath="$1"
    local filename
    filename=$(basename "$filepath")

    # Extract frontmatter
    local frontmatter
    frontmatter=$(extract_frontmatter "$filepath" 2>/dev/null) || true
    if [ -z "$frontmatter" ]; then
        echo "Missing or malformed YAML frontmatter"
        return 1
    fi

    # Check required frontmatter fields
    local lesson_id
    lesson_id=$(get_frontmatter_value "$frontmatter" "lesson_id")
    if [ -z "$lesson_id" ]; then
        echo "Missing required field: lesson_id"
        return 1
    fi

    local title
    title=$(get_frontmatter_value "$frontmatter" "title")
    if [ -z "$title" ]; then
        echo "Missing required field: title"
        return 1
    fi

    local category
    category=$(get_frontmatter_value "$frontmatter" "category")
    if [ -z "$category" ]; then
        echo "Missing required field: category"
        return 1
    fi

    # Validate category is in allowed set
    local category_valid=0
    for valid_cat in $VALID_CATEGORIES; do
        if [ "$category" = "$valid_cat" ]; then
            category_valid=1
            break
        fi
    done
    if [ "$category_valid" -eq 0 ]; then
        echo "Invalid category '$category' (must be one of: $VALID_CATEGORIES)"
        return 1
    fi

    local status
    status=$(get_frontmatter_value "$frontmatter" "status")
    if [ -z "$status" ]; then
        echo "Missing required field: status"
        return 1
    fi

    local tags_str
    tags_str=$(get_frontmatter_tags "$frontmatter")
    if [ -z "$tags_str" ]; then
        echo "Missing required field: tags"
        return 1
    fi

    # Validate body sections
    local missing_sections
    missing_sections=$(validate_body_sections "$filepath" 2>/dev/null) || true
    if [ -n "$missing_sections" ]; then
        echo "Missing body sections: $missing_sections"
        return 1
    fi

    # Security check via sanitize-knowledge.sh (if available)
    if [ -x "$SANITIZE_SCRIPT" ]; then
        # Create a temp dir with just this file for the check
        local tmpdir
        tmpdir=$(mktemp -d)
        cp "$filepath" "$tmpdir/"
        local sanitize_output
        sanitize_output=$("$SANITIZE_SCRIPT" --check "$tmpdir" 2>&1) || true
        rm -rf "$tmpdir"

        # Check if sanitize flagged any issues (lines redacted > 0)
        if echo "$sanitize_output" | grep -q "Lines redacted:.*[1-9]"; then
            echo "Security violation detected (secrets/PII found)"
            return 1
        fi
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════
# DEDUPLICATION
# ═══════════════════════════════════════════════════════════════

# Check if a lesson_id already exists in promoted/
is_duplicate() {
    local lesson_id="$1"

    if [ ! -d "$PROMOTED_DIR" ]; then
        return 1
    fi

    local promoted_file
    for promoted_file in "$PROMOTED_DIR"/*.md; do
        # Handle glob returning literal pattern when no files match
        if [ ! -f "$promoted_file" ]; then
            continue
        fi

        local promoted_fm
        promoted_fm=$(extract_frontmatter "$promoted_file" 2>/dev/null) || continue
        local promoted_id
        promoted_id=$(get_frontmatter_value "$promoted_fm" "lesson_id")

        if [ "$promoted_id" = "$lesson_id" ]; then
            return 0
        fi
    done

    return 1
}

# ═══════════════════════════════════════════════════════════════
# SCORING
# ═══════════════════════════════════════════════════════════════

# Calculate promotion score for a lesson
# Outputs: numeric score
calculate_score() {
    local filepath="$1"
    local score=0

    local frontmatter
    frontmatter=$(extract_frontmatter "$filepath" 2>/dev/null) || true

    # +2: Has all required body sections (Context + Decision/Error/Pattern + Outcome)
    local has_context=0
    local has_dep=0
    local has_outcome=0

    if has_body_section "$filepath" "Context"; then
        has_context=1
    fi

    if has_body_section "$filepath" "Decision" || \
       has_body_section "$filepath" "Error" || \
       has_body_section "$filepath" "Pattern" || \
       has_body_section "$filepath" "Fix"; then
        has_dep=1
    fi

    if has_body_section "$filepath" "Outcome"; then
        has_outcome=1
    fi

    if [ "$has_context" -eq 1 ] && [ "$has_dep" -eq 1 ] && [ "$has_outcome" -eq 1 ]; then
        score=$((score + 2))
    fi

    # +1: Has 3+ tags
    local tags_str
    tags_str=$(get_frontmatter_tags "$frontmatter")
    local tag_count
    tag_count=$(count_tags "$tags_str")
    if [ "$tag_count" -ge 3 ]; then
        score=$((score + 1))
    fi

    # +1: Category is "pattern" or "architecture"
    local category
    category=$(get_frontmatter_value "$frontmatter" "category")
    if [ "$category" = "pattern" ] || [ "$category" = "architecture" ]; then
        score=$((score + 1))
    fi

    # +1: Weight >= 0.7
    local weight
    weight=$(get_frontmatter_weight "$frontmatter")
    # Compare using awk to avoid bc dependency
    local weight_check
    weight_check=$(awk "BEGIN { print ($weight >= 0.7) ? 1 : 0 }")
    if [ "$weight_check" -eq 1 ]; then
        score=$((score + 1))
    fi

    echo "$score"
}

# ═══════════════════════════════════════════════════════════════
# PROMOTION (FILE OPERATIONS)
# ═══════════════════════════════════════════════════════════════

# Update the status field in frontmatter from staging to promoted
update_status_in_file() {
    local filepath="$1"
    local old_status="$2"
    local new_status="$3"

    # Replace the status line in frontmatter
    sed -i "s/^status:[[:space:]]*${old_status}/status: ${new_status}/" "$filepath"
}

# Promote a lesson: update status, copy to promoted, remove from staging
promote_lesson() {
    local filepath="$1"
    local filename
    filename=$(basename "$filepath")

    # Update status in the file
    update_status_in_file "$filepath" "staging" "promoted"

    # Copy to promoted directory
    cp "$filepath" "$PROMOTED_DIR/$filename"

    # Remove from staging
    rm -f "$filepath"
}

# Reject a lesson: update status in staging
reject_lesson_file() {
    local filepath="$1"
    update_status_in_file "$filepath" "staging" "rejected"
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

# cmd_promote: Run the full promotion pipeline
# Args: force_mode (0 or 1)
cmd_promote() {
    local force_mode="${1:-0}"
    local scan_only="${2:-0}"

    echo ""
    echo "════════════════════════════════════════════════════════"
    if [ "$scan_only" -eq 1 ]; then
        printf "${BOLD}${BLUE}  KNOWLEDGE PROMOTION PIPELINE (SCAN ONLY)${NC}\n"
    elif [ "$force_mode" -eq 1 ]; then
        printf "${BOLD}${CYAN}  KNOWLEDGE PROMOTION PIPELINE (FORCE MODE)${NC}\n"
    else
        printf "${BOLD}${GREEN}  KNOWLEDGE PROMOTION PIPELINE${NC}\n"
    fi
    echo "════════════════════════════════════════════════════════"
    printf "  ${BOLD}Staging:${NC}  %s\n" "$STAGING_DIR"
    printf "  ${BOLD}Promoted:${NC} %s\n" "$PROMOTED_DIR"
    echo "════════════════════════════════════════════════════════"
    echo ""

    # Find all .md files in staging (skip .gitkeep)
    local staging_files
    staging_files=$(mktemp)
    find "$STAGING_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort > "$staging_files"

    local total_files
    total_files=$(wc -l < "$staging_files" | tr -d ' ')

    if [ "$total_files" -eq 0 ]; then
        log_info "No lessons found in staging. Nothing to process."
        rm -f "$staging_files"
        print_report
        return 0
    fi

    log_info "Found $total_files lesson(s) in staging"
    echo ""

    while IFS= read -r filepath; do
        if [ -z "$filepath" ] || [ ! -f "$filepath" ]; then
            continue
        fi

        local filename
        filename=$(basename "$filepath")
        COUNT_SCANNED=$((COUNT_SCANNED + 1))

        log_info "Processing: $filename"

        # ── STEP 1: Validate ──
        local validation_error=""
        local validation_rc=0
        validation_error=$(validate_lesson "$filepath" 2>/dev/null) || validation_rc=$?

        if [ $validation_rc -ne 0 ]; then
            log_reject "$filename — $validation_error"
            if [ "$scan_only" -eq 0 ]; then
                reject_lesson_file "$filepath"
            fi
            COUNT_REJECTED=$((COUNT_REJECTED + 1))
            continue
        fi

        # ── STEP 2: Extract lesson_id for dedup ──
        local frontmatter
        frontmatter=$(extract_frontmatter "$filepath" 2>/dev/null) || true
        local lesson_id
        lesson_id=$(get_frontmatter_value "$frontmatter" "lesson_id")

        # ── STEP 3: Deduplicate ──
        if is_duplicate "$lesson_id"; then
            log_skip "$filename — duplicate (lesson_id '$lesson_id' already in promoted)"
            COUNT_DUPLICATES=$((COUNT_DUPLICATES + 1))
            continue
        fi

        # ── STEP 4: Score ──
        local score
        score=$(calculate_score "$filepath")
        local min_score=3

        if [ "$force_mode" -eq 1 ]; then
            # Force mode: promote all valid lessons
            log_info "  Score: $score/5 (force mode — promoting regardless)"
            if [ "$scan_only" -eq 0 ]; then
                promote_lesson "$filepath"
            fi
            log_promote "$filename (score=$score, lesson_id=$lesson_id)"
            COUNT_PROMOTED=$((COUNT_PROMOTED + 1))
        elif [ "$score" -ge "$min_score" ]; then
            log_info "  Score: $score/5 (meets threshold of $min_score)"
            if [ "$scan_only" -eq 0 ]; then
                promote_lesson "$filepath"
            fi
            log_promote "$filename (score=$score, lesson_id=$lesson_id)"
            COUNT_PROMOTED=$((COUNT_PROMOTED + 1))
        else
            log_info "  Score: $score/5 (below threshold of $min_score — keeping in staging)"
            COUNT_KEPT=$((COUNT_KEPT + 1))
        fi

    done < "$staging_files"

    rm -f "$staging_files"

    echo ""
    print_report

    if [ "$scan_only" -eq 1 ]; then
        log_info "Scan complete. No files were modified."
    else
        log_ok "Promotion pipeline complete."
    fi
}

# cmd_reject: Reject a specific lesson by lesson_id
cmd_reject() {
    local target_id="$1"

    if [ -z "$target_id" ]; then
        log_error "Missing required argument: lesson_id"
        echo "Usage: promote-knowledge.sh reject <lesson_id>"
        exit 1
    fi

    echo ""
    log_info "Searching for lesson_id '$target_id' in staging..."

    local found=0

    for filepath in "$STAGING_DIR"/*.md; do
        if [ ! -f "$filepath" ]; then
            continue
        fi

        local frontmatter
        frontmatter=$(extract_frontmatter "$filepath" 2>/dev/null) || continue
        local lesson_id
        lesson_id=$(get_frontmatter_value "$frontmatter" "lesson_id")

        if [ "$lesson_id" = "$target_id" ]; then
            reject_lesson_file "$filepath"
            log_reject "$(basename "$filepath") — manually rejected (lesson_id=$target_id)"
            found=1
            break
        fi
    done

    if [ "$found" -eq 0 ]; then
        log_error "No lesson with lesson_id '$target_id' found in staging"
        exit 1
    fi
}

# cmd_stats: Show counts in staging, promoted, rejected
cmd_stats() {
    echo ""
    echo "════════════════════════════════════════════════════════"
    printf "${BOLD}${CYAN}  KNOWLEDGE INVENTORY${NC}\n"
    echo "════════════════════════════════════════════════════════"

    # Count staging lessons
    local staging_count=0
    local staging_by_status_staging=0
    local staging_by_status_rejected=0
    for filepath in "$STAGING_DIR"/*.md; do
        if [ ! -f "$filepath" ]; then
            continue
        fi
        staging_count=$((staging_count + 1))

        local fm
        fm=$(extract_frontmatter "$filepath" 2>/dev/null) || continue
        local status
        status=$(get_frontmatter_value "$fm" "status")
        case "$status" in
            staging)  staging_by_status_staging=$((staging_by_status_staging + 1)) ;;
            rejected) staging_by_status_rejected=$((staging_by_status_rejected + 1)) ;;
        esac
    done

    # Count promoted lessons
    local promoted_count=0
    for filepath in "$PROMOTED_DIR"/*.md; do
        if [ ! -f "$filepath" ]; then
            continue
        fi
        promoted_count=$((promoted_count + 1))
    done

    # Count by category in promoted
    local cat_decision=0
    local cat_error=0
    local cat_pattern=0
    local cat_architecture=0
    local cat_tooling=0
    for filepath in "$PROMOTED_DIR"/*.md; do
        if [ ! -f "$filepath" ]; then
            continue
        fi
        local fm
        fm=$(extract_frontmatter "$filepath" 2>/dev/null) || continue
        local cat
        cat=$(get_frontmatter_value "$fm" "category")
        case "$cat" in
            decision)     cat_decision=$((cat_decision + 1)) ;;
            error)        cat_error=$((cat_error + 1)) ;;
            pattern)      cat_pattern=$((cat_pattern + 1)) ;;
            architecture) cat_architecture=$((cat_architecture + 1)) ;;
            tooling)      cat_tooling=$((cat_tooling + 1)) ;;
        esac
    done

    printf "  ${BOLD}Staging:${NC}     %d total (%d pending, %d rejected)\n" \
        "$staging_count" "$staging_by_status_staging" "$staging_by_status_rejected"
    printf "  ${BOLD}Promoted:${NC}    %d total\n" "$promoted_count"

    if [ "$promoted_count" -gt 0 ]; then
        echo ""
        printf "  ${BOLD}Promoted by category:${NC}\n"
        [ "$cat_decision" -gt 0 ]     && printf "    decision:      %d\n" "$cat_decision"
        [ "$cat_error" -gt 0 ]        && printf "    error:         %d\n" "$cat_error"
        [ "$cat_pattern" -gt 0 ]      && printf "    pattern:       %d\n" "$cat_pattern"
        [ "$cat_architecture" -gt 0 ] && printf "    architecture:  %d\n" "$cat_architecture"
        [ "$cat_tooling" -gt 0 ]      && printf "    tooling:       %d\n" "$cat_tooling"
    fi

    echo "════════════════════════════════════════════════════════"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# REPORT
# ═══════════════════════════════════════════════════════════════

print_report() {
    echo ""
    printf "${BOLD}KNOWLEDGE PROMOTION REPORT${NC}\n"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "  Scanned:    %d lessons in staging\n" "$COUNT_SCANNED"
    printf "  Promoted:   %d (moved to knowledge/promoted/)\n" "$COUNT_PROMOTED"
    printf "  Kept:       %d (score too low, remains in staging)\n" "$COUNT_KEPT"
    printf "  Rejected:   %d (validation failed)\n" "$COUNT_REJECTED"
    printf "  Duplicates: %d (already in promoted)\n" "$COUNT_DUPLICATES"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Print warnings if any
    if [ -n "$WARN_LOG" ] && [ -f "$WARN_LOG" ]; then
        local warn_count
        warn_count=$(wc -l < "$WARN_LOG" | tr -d ' ')
        if [ "$warn_count" -gt 0 ]; then
            echo ""
            printf "${YELLOW}${BOLD}  Warnings: %d${NC}\n" "$warn_count"
            while IFS= read -r w; do
                printf "    ${YELLOW}- %s${NC}\n" "$w"
            done < "$WARN_LOG"
        fi
    fi

    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

main() {
    # Initialize warning log
    WARN_LOG=$(mktemp)

    # Ensure directories exist
    ensure_directories

    # Parse command
    local command="${1:-promote}"
    local extra_arg="${2:-}"

    case "$command" in
        --help|-h|help)
            usage
            exit 0
            ;;
        promote)
            cmd_promote 0 0
            ;;
        scan)
            cmd_promote 0 1
            ;;
        force)
            cmd_promote 1 0
            ;;
        reject)
            cmd_reject "$extra_arg"
            ;;
        stats)
            cmd_stats
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            usage
            exit 1
            ;;
    esac
}

main "$@"

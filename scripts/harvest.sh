#!/bin/bash

# Knowledge Harvest Engine - Extract learned knowledge from projects to central framework
# Implements FR-001 (Harvest), FR-003 (Dedup), FR-004 (Promotion), FR-007 (Categories)
#
# USAGE:
#   ./scripts/harvest.sh /path/to/project           # Harvest single project
#   ./scripts/harvest.sh --all                       # Harvest all registered projects
#   ./scripts/harvest.sh --promote                   # Run promotion cycle on central knowledge
#   ./scripts/harvest.sh --status                    # Show harvest statistics

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
CENTRAL_KNOWLEDGE="$FRAMEWORK_DIR/memory_bank/knowledge"
JSON_OUTPUT=false
QUIET=false
VERBOSE=false

# Universal knowledge files
DECISIONS_UNIVERSAL="$CENTRAL_KNOWLEDGE/decisions-universal.jsonl"
ERRORS_UNIVERSAL="$CENTRAL_KNOWLEDGE/errors-universal.jsonl"
PATTERNS_UNIVERSAL="$CENTRAL_KNOWLEDGE/patterns-universal.jsonl"
PROMOTION_REVIEW_FILE="$CENTRAL_KNOWLEDGE/promotion-review.jsonl"

# Ensure central knowledge directory exists
mkdir -p "$CENTRAL_KNOWLEDGE"

# Create universal files if they don't exist
touch "$DECISIONS_UNIVERSAL" 2>/dev/null || true
touch "$ERRORS_UNIVERSAL" 2>/dev/null || true
touch "$PATTERNS_UNIVERSAL" 2>/dev/null || true
touch "$PROMOTION_REVIEW_FILE" 2>/dev/null || true

now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# ═══════════════════════════════════════════════════════════════
# SECURITY: Knowledge Sanitization
# ═══════════════════════════════════════════════════════════════

# Patterns that indicate secrets/PII that should NOT be harvested
SENSITIVE_PATTERNS=(
    'password'
    'api_key'
    'api-key'
    'apikey'
    'secret'
    'token'
    'bearer'
    'authorization'
    'credential'
    'private_key'
    'private-key'
    'ssh-rsa'
    'BEGIN RSA'
    'BEGIN PRIVATE'
    'BEGIN CERTIFICATE'
    '@.*\.com'
    '[0-9]{3}-[0-9]{2}-[0-9]{4}'
    '[0-9]{4}[- ][0-9]{4}[- ][0-9]{4}[- ][0-9]{4}'
)

is_sensitive() {
    local content="$1"
    local lower_content
    lower_content=$(echo "$content" | tr '[:upper:]' '[:lower:]')

    for pattern in "${SENSITIVE_PATTERNS[@]}"; do
        if echo "$lower_content" | grep -qiE "$pattern"; then
            return 0
        fi
    done
    return 1
}

# ═══════════════════════════════════════════════════════════════
# SCOPE DETECTION: Project-specific vs Universal
# ═══════════════════════════════════════════════════════════════

detect_scope() {
    local content="$1"
    local project_path="$2"

    # Indicators of project-specific knowledge
    local project_name
    project_name=$(basename "$project_path" 2>/dev/null || echo "")

    # Check for project-specific references
    if echo "$content" | grep -qiF "$project_name" 2>/dev/null; then
        echo "project"
        return
    fi

    # Check for specific file paths (project-specific)
    if echo "$content" | grep -qE '(src/|app/|lib/|components/)' 2>/dev/null; then
        echo "project"
        return
    fi

    # Check for specific table/model names (likely project-specific)
    if echo "$content" | grep -qE '(table|model|schema|migration).*[A-Z][a-z]+[A-Z]' 2>/dev/null; then
        echo "project"
        return
    fi

    # Default: universal (general pattern/decision/error)
    echo "universal"
}

# ═══════════════════════════════════════════════════════════════
# DEDUPLICATION
# ═══════════════════════════════════════════════════════════════

is_duplicate() {
    local content="$1"
    local target_file="$2"

    if [ ! -f "$target_file" ] || [ ! -s "$target_file" ]; then
        return 1
    fi

    # Normalize content for comparison (lowercase, trim whitespace)
    local normalized
    normalized=$(echo "$content" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')
    local signature
    signature=$(printf "%s" "$normalized" | sha256sum 2>/dev/null | awk '{print $1}')
    if [ -z "$signature" ]; then
        signature="$normalized"
    fi

    # Check each line for similarity
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            local existing_content
            existing_content=$(echo "$line" | jq -r '.content // ""' 2>/dev/null)
            local existing_sig
            existing_sig=$(echo "$line" | jq -r '.signature // ""' 2>/dev/null)
            local existing_normalized
            existing_normalized=$(echo "$existing_content" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//')
            if [ -z "$existing_sig" ]; then
                existing_sig=$(printf "%s" "$existing_normalized" | sha256sum 2>/dev/null | awk '{print $1}')
            fi

            # Signature match (or fallback exact normalized content match)
            if [ "$signature" = "$existing_sig" ] || [ "$normalized" = "$existing_normalized" ]; then
                # Boost weight of existing entry
                local existing_id
                existing_id=$(echo "$line" | jq -r '.id // ""' 2>/dev/null)
                local existing_weight
                existing_weight=$(echo "$line" | jq -r '.weight // 0.5' 2>/dev/null)
                local promo_count
                promo_count=$(echo "$line" | jq -r '.promotion_count // 0' 2>/dev/null)

                # Boost weight (capped at 1.0) and increment promotion count
                local new_weight
                new_weight=$(echo "$existing_weight + 0.1" | bc 2>/dev/null || echo "0.6")
                if [ "$(echo "$new_weight > 1.0" | bc 2>/dev/null)" = "1" ]; then
                    new_weight="1.0"
                fi
                local new_promo=$((promo_count + 1))
                local source_project
                source_project=$(echo "$line" | jq -r '.source_project // ""' 2>/dev/null)

                # Update entry in-place
                local temp_file
                temp_file=$(mktemp)
                while IFS= read -r update_line; do
                    local update_id
                    update_id=$(echo "$update_line" | jq -r '.id // ""' 2>/dev/null)
                    if [ "$update_id" = "$existing_id" ]; then
                        echo "$update_line" | jq -c \
                            --argjson w "$new_weight" \
                            --argjson pc "$new_promo" \
                            --arg sig "$signature" \
                            '.weight = $w | .promotion_count = $pc | .signature = $sig' >> "$temp_file"
                    else
                        echo "$update_line" >> "$temp_file"
                    fi
                done < "$target_file"
                mv "$temp_file" "$target_file"

                return 0
            fi
        fi
    done < "$target_file"

    return 1
}

# ═══════════════════════════════════════════════════════════════
# HARVEST: Extract knowledge from a single project
# ═══════════════════════════════════════════════════════════════

harvest_project() {
    local project_path="$1"

    if [ ! -d "$project_path" ]; then
        echo -e "${RED}[FAIL]${NC} Directory not found: $project_path"
        return 1
    fi

    local project_knowledge="$project_path/memory_bank/knowledge"

    if [ ! -d "$project_knowledge" ]; then
        echo -e "${YELLOW}[WARN]${NC} No knowledge directory: $project_path"
        return 0
    fi

    if [ "$QUIET" != "true" ] && [ "$JSON_OUTPUT" != "true" ]; then
        echo -e "${BLUE}[STEP 1/4]${NC} Scanning project: $(basename "$project_path")"
    fi

    local harvested=0
    local skipped_sensitive=0
    local skipped_duplicate=0
    local skipped_scope=0
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Process each knowledge type
    for source_file in "$project_knowledge"/*.jsonl; do
        if [ ! -f "$source_file" ] || [ ! -s "$source_file" ]; then
            continue
        fi

        local file_type
        file_type=$(basename "$source_file" .jsonl)

        # Skip bootstrap (it comes from framework, no need to harvest back)
        if [ "$file_type" = "bootstrap" ]; then
            continue
        fi

        if [ "$VERBOSE" = "true" ] && [ "$QUIET" != "true" ] && [ "$JSON_OUTPUT" != "true" ]; then
            echo -e "${BLUE}[STEP 2/4]${NC} Processing: $file_type"
        fi

        # Determine target universal file
        local target_file=""
        case "$file_type" in
            decisions) target_file="$DECISIONS_UNIVERSAL" ;;
            errors)    target_file="$ERRORS_UNIVERSAL" ;;
            facts)     target_file="$DECISIONS_UNIVERSAL" ;; # Facts promote to decisions
            preferences) continue ;; # Preferences are project-specific
            patterns*) target_file="$PATTERNS_UNIVERSAL" ;;
            *)         target_file="$DECISIONS_UNIVERSAL" ;;
        esac

        while IFS= read -r entry; do
            if [ -z "$entry" ]; then
                continue
            fi

            local content
            content=$(echo "$entry" | jq -r '.content // ""' 2>/dev/null)

            if [ -z "$content" ]; then
                continue
            fi

            # Security check: skip entries with sensitive data
            if is_sensitive "$content"; then
                skipped_sensitive=$((skipped_sensitive + 1))
                continue
            fi

            # Scope detection
            local scope
            scope=$(detect_scope "$content" "$project_path")
            if [ "$scope" = "project" ]; then
                skipped_scope=$((skipped_scope + 1))
                continue
            fi

            # Deduplication check
            if is_duplicate "$content" "$target_file"; then
                skipped_duplicate=$((skipped_duplicate + 1))
                continue
            fi

            # Create harvested entry
            local entry_id
            if command -v uuidgen &> /dev/null; then
                entry_id=$(uuidgen)
            elif [ -f /proc/sys/kernel/random/uuid ]; then
                entry_id=$(cat /proc/sys/kernel/random/uuid)
            else
                entry_id="harvest-$(date +%s)-$RANDOM"
            fi

            local original_type
            original_type=$(echo "$entry" | jq -r '.type // "fact"' 2>/dev/null)
            local original_weight
            original_weight=$(echo "$entry" | jq -r '.weight // 0.5' 2>/dev/null)
            local original_tags
            original_tags=$(echo "$entry" | jq -c '.tags // []' 2>/dev/null)

            local harvested_entry
            harvested_entry=$(jq -nc \
                --arg id "$entry_id" \
                --arg type "$original_type" \
                --arg content "$content" \
                --argjson weight "$original_weight" \
                --argjson tags "$original_tags" \
                --arg scope "universal" \
                --arg source "$project_path" \
                --arg harvested_at "$timestamp" \
                --arg promotion_status "HARVESTED" \
                --arg sig "$(printf "%s" "$content" | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //;s/ $//' | sha256sum 2>/dev/null | awk '{print $1}')" \
                '{
                    id: $id,
                    type: $type,
                    content: $content,
                    weight: $weight,
                    tags: $tags,
                    scope: $scope,
                    source_project: $source,
                    signature: $sig,
                    promotion_count: 1,
                    promotion_status: $promotion_status,
                    harvested_at: $harvested_at,
                    lineage: {parent_id: null, supersedes: [], superseded_by: null}
                }')

            echo "$harvested_entry" >> "$target_file"
            harvested=$((harvested + 1))
        done < "$source_file"
    done

    if [ "$QUIET" != "true" ] && [ "$JSON_OUTPUT" != "true" ]; then
        echo -e "${BLUE}[STEP 3/4]${NC} Updating registry metadata"
    fi

    # Update registry metadata with harvest timestamp
    if [ -f "$SCRIPT_DIR/registry.sh" ]; then
        bash "$SCRIPT_DIR/registry.sh" update-meta "$project_path" --last_harvested="$timestamp" 2>/dev/null || true
    fi

    if [ "$JSON_OUTPUT" = "true" ]; then
        jq -nc \
            --arg project "$(basename "$project_path")" \
            --arg path "$project_path" \
            --arg ts "$timestamp" \
            --argjson harvested "$harvested" \
            --argjson skipped_sensitive "$skipped_sensitive" \
            --argjson skipped_duplicate "$skipped_duplicate" \
            --argjson skipped_scope "$skipped_scope" \
            '{status:"ok",project:$project,path:$path,harvested_at:$ts,harvested:$harvested,skipped:{sensitive:$skipped_sensitive,duplicate:$skipped_duplicate,scope:$skipped_scope}}'
    elif [ "$QUIET" != "true" ]; then
        echo -e "${BLUE}[STEP 4/4]${NC} Harvest complete"
        echo ""
        echo -e "${GREEN}[PASS]${NC} Harvest results for $(basename "$project_path")"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Harvested:         $harvested entries"
        echo "  Skipped (secrets): $skipped_sensitive"
        echo "  Skipped (dupes):   $skipped_duplicate"
        echo "  Skipped (scope):   $skipped_scope (project-specific)"
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════
# HARVEST ALL: Process all registered projects
# ═══════════════════════════════════════════════════════════════

harvest_all() {
    if [ ! -f "$REGISTRY_FILE" ] || [ ! -s "$REGISTRY_FILE" ]; then
        echo -e "${YELLOW}[WARN]${NC} No projects registered"
        echo "Register projects first: ./scripts/registry.sh register /path/to/project"
        return 0
    fi

    local total=0
    local project_count=0

    # Count projects
    while IFS= read -r _; do
        project_count=$((project_count + 1))
    done < "$REGISTRY_FILE"

    # Confirmation
    if [ "${FORCE:-}" != "true" ]; then
        echo -e "${YELLOW}Harvest from $project_count projects?${NC}"
        read -p "Continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}[WARN]${NC} Cancelled"
            exit 2
        fi
    fi

    echo -e "${CYAN}KNOWLEDGE HARVEST (ALL PROJECTS)${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local idx=0
    while IFS= read -r project_path; do
        if [ -n "$project_path" ] && [ -d "$project_path" ]; then
            idx=$((idx + 1))
            echo -e "${CYAN}[$idx/$project_count]${NC} Harvesting: $(basename "$project_path")"
            harvest_project "$project_path"
            echo ""
        fi
    done < "$REGISTRY_FILE"

    echo -e "${GREEN}[PASS]${NC} Harvest complete for all $project_count projects"

    # Auto-run promotion after harvesting all
    echo ""
    promote_knowledge
}

# ═══════════════════════════════════════════════════════════════
# PROMOTION: Elevate knowledge based on criteria (FR-004)
# ═══════════════════════════════════════════════════════════════

promote_knowledge() {
    echo -e "${CYAN}KNOWLEDGE PROMOTION CYCLE${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local promoted=0
    local candidates=0
    local review_queued=0

    for universal_file in "$DECISIONS_UNIVERSAL" "$ERRORS_UNIVERSAL" "$PATTERNS_UNIVERSAL"; do
        if [ ! -f "$universal_file" ] || [ ! -s "$universal_file" ]; then
            continue
        fi

        local temp_file
        temp_file=$(mktemp)

        while IFS= read -r entry; do
            if [ -z "$entry" ]; then
                echo "$entry" >> "$temp_file"
                continue
            fi

            local status
            status=$(echo "$entry" | jq -r '.promotion_status // "HARVESTED"' 2>/dev/null)
            local promo_count
            promo_count=$(echo "$entry" | jq -r '.promotion_count // 0' 2>/dev/null)
            local weight
            weight=$(echo "$entry" | jq -r '.weight // 0.5' 2>/dev/null)

            if [ "$status" = "PROMOTED" ] || [ "$status" = "REJECTED" ]; then
                echo "$entry" >> "$temp_file"
                continue
            fi

            # Promotion criteria:
            # - Appears in 3+ projects (promotion_count >= 3) OR weight > 0.8
            local should_promote=false

            if [ "$promo_count" -ge 3 ] 2>/dev/null; then
                should_promote=true
            fi

            if [ "$(echo "$weight > 0.8" | bc 2>/dev/null)" = "1" ] 2>/dev/null; then
                should_promote=true
            fi

            # Candidate check (2+ projects moves to CANDIDATE)
            if [ "$status" = "HARVESTED" ] && [ "$promo_count" -ge 2 ] 2>/dev/null; then
                entry=$(echo "$entry" | jq -c '.promotion_status = "CANDIDATE"')
                candidates=$((candidates + 1))
            fi

            if [ "$should_promote" = true ]; then
                entry=$(echo "$entry" | jq -c '.promotion_status = "PROMOTED"')
                promoted=$((promoted + 1))

                # Also add to bootstrap for future project installations
                local content
                content=$(echo "$entry" | jq -r '.content // ""' 2>/dev/null)
                local bootstrap_file="$CENTRAL_KNOWLEDGE/bootstrap.jsonl"
                if [ -f "$bootstrap_file" ]; then
                    if ! grep -qF "$content" "$bootstrap_file" 2>/dev/null; then
                        echo "$entry" >> "$bootstrap_file"
                    fi
                fi
            elif [ "$status" = "CANDIDATE" ] || [ "$promo_count" -ge 2 ] 2>/dev/null; then
                local content
                content=$(echo "$entry" | jq -r '.content // ""' 2>/dev/null)
                if [ -n "$content" ] && ! grep -qF "$content" "$PROMOTION_REVIEW_FILE" 2>/dev/null; then
                    local review_entry
                    review_entry=$(echo "$entry" | jq -c --arg queued_at "$(now_ts)" '.review_status = "PENDING" | .review_queued_at = $queued_at')
                    echo "$review_entry" >> "$PROMOTION_REVIEW_FILE"
                    review_queued=$((review_queued + 1))
                fi
            fi

            echo "$entry" >> "$temp_file"
        done < "$universal_file"

        mv "$temp_file" "$universal_file"
    done

    echo -e "${GREEN}[PASS]${NC} Promotion results"
    echo "  New candidates: $candidates"
    echo "  Promoted:       $promoted"
    echo "  Review queued:  $review_queued"

    # Push promoted knowledge to hub if configured
    local sync_script="$SCRIPT_DIR/knowledge-sync.sh"
    if [ -f "$sync_script" ] && [ -x "$sync_script" ]; then
        if [ -f "$FRAMEWORK_DIR/.claude/hub.json" ]; then
            echo ""
            echo -e "${BLUE}Pushing promoted knowledge to hub...${NC}"
            bash "$sync_script" push 2>/dev/null || echo -e "${YELLOW}Hub push skipped (offline or not configured)${NC}"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# STATUS: Show harvest statistics
# ═══════════════════════════════════════════════════════════════

show_status() {
    if [ "$JSON_OUTPUT" = "true" ]; then
        local decisions_total decisions_harvested decisions_candidate decisions_promoted
        local errors_total errors_harvested errors_candidate errors_promoted
        local patterns_total patterns_harvested patterns_candidate patterns_promoted
        local bootstrap_total
        local review_total

        decisions_total=$(wc -l < "$DECISIONS_UNIVERSAL" 2>/dev/null || echo "0")
        decisions_total=$(echo "$decisions_total" | tr -cd '0-9')
        [ -z "$decisions_total" ] && decisions_total=0
        decisions_harvested=$(grep -c '"HARVESTED"' "$DECISIONS_UNIVERSAL" 2>/dev/null || echo "0")
        decisions_harvested=$(echo "$decisions_harvested" | tr -cd '0-9')
        [ -z "$decisions_harvested" ] && decisions_harvested=0
        decisions_candidate=$(grep -c '"CANDIDATE"' "$DECISIONS_UNIVERSAL" 2>/dev/null || echo "0")
        decisions_candidate=$(echo "$decisions_candidate" | tr -cd '0-9')
        [ -z "$decisions_candidate" ] && decisions_candidate=0
        decisions_promoted=$(grep -c '"PROMOTED"' "$DECISIONS_UNIVERSAL" 2>/dev/null || echo "0")
        decisions_promoted=$(echo "$decisions_promoted" | tr -cd '0-9')
        [ -z "$decisions_promoted" ] && decisions_promoted=0

        errors_total=$(wc -l < "$ERRORS_UNIVERSAL" 2>/dev/null || echo "0")
        errors_total=$(echo "$errors_total" | tr -cd '0-9')
        [ -z "$errors_total" ] && errors_total=0
        errors_harvested=$(grep -c '"HARVESTED"' "$ERRORS_UNIVERSAL" 2>/dev/null || echo "0")
        errors_harvested=$(echo "$errors_harvested" | tr -cd '0-9')
        [ -z "$errors_harvested" ] && errors_harvested=0
        errors_candidate=$(grep -c '"CANDIDATE"' "$ERRORS_UNIVERSAL" 2>/dev/null || echo "0")
        errors_candidate=$(echo "$errors_candidate" | tr -cd '0-9')
        [ -z "$errors_candidate" ] && errors_candidate=0
        errors_promoted=$(grep -c '"PROMOTED"' "$ERRORS_UNIVERSAL" 2>/dev/null || echo "0")
        errors_promoted=$(echo "$errors_promoted" | tr -cd '0-9')
        [ -z "$errors_promoted" ] && errors_promoted=0

        patterns_total=$(wc -l < "$PATTERNS_UNIVERSAL" 2>/dev/null || echo "0")
        patterns_total=$(echo "$patterns_total" | tr -cd '0-9')
        [ -z "$patterns_total" ] && patterns_total=0
        patterns_harvested=$(grep -c '"HARVESTED"' "$PATTERNS_UNIVERSAL" 2>/dev/null || echo "0")
        patterns_harvested=$(echo "$patterns_harvested" | tr -cd '0-9')
        [ -z "$patterns_harvested" ] && patterns_harvested=0
        patterns_candidate=$(grep -c '"CANDIDATE"' "$PATTERNS_UNIVERSAL" 2>/dev/null || echo "0")
        patterns_candidate=$(echo "$patterns_candidate" | tr -cd '0-9')
        [ -z "$patterns_candidate" ] && patterns_candidate=0
        patterns_promoted=$(grep -c '"PROMOTED"' "$PATTERNS_UNIVERSAL" 2>/dev/null || echo "0")
        patterns_promoted=$(echo "$patterns_promoted" | tr -cd '0-9')
        [ -z "$patterns_promoted" ] && patterns_promoted=0

        bootstrap_total=$(wc -l < "$CENTRAL_KNOWLEDGE/bootstrap.jsonl" 2>/dev/null || echo "0")
        bootstrap_total=$(echo "$bootstrap_total" | tr -cd '0-9')
        [ -z "$bootstrap_total" ] && bootstrap_total=0
        review_total=$(wc -l < "$PROMOTION_REVIEW_FILE" 2>/dev/null || echo "0")
        review_total=$(echo "$review_total" | tr -cd '0-9')
        [ -z "$review_total" ] && review_total=0

        jq -nc \
            --argjson decisions_total "$decisions_total" \
            --argjson decisions_harvested "$decisions_harvested" \
            --argjson decisions_candidate "$decisions_candidate" \
            --argjson decisions_promoted "$decisions_promoted" \
            --argjson errors_total "$errors_total" \
            --argjson errors_harvested "$errors_harvested" \
            --argjson errors_candidate "$errors_candidate" \
            --argjson errors_promoted "$errors_promoted" \
            --argjson patterns_total "$patterns_total" \
            --argjson patterns_harvested "$patterns_harvested" \
            --argjson patterns_candidate "$patterns_candidate" \
            --argjson patterns_promoted "$patterns_promoted" \
            --argjson bootstrap_total "$bootstrap_total" \
            --argjson review_total "$review_total" \
            '{status:"ok",decisions:{total:$decisions_total,harvested:$decisions_harvested,candidate:$decisions_candidate,promoted:$decisions_promoted},errors:{total:$errors_total,harvested:$errors_harvested,candidate:$errors_candidate,promoted:$errors_promoted},patterns:{total:$patterns_total,harvested:$patterns_harvested,candidate:$patterns_candidate,promoted:$patterns_promoted},bootstrap:{total:$bootstrap_total},review:{total:$review_total}}'
        return
    fi

    echo -e "${CYAN}HARVEST STATUS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for file in "$DECISIONS_UNIVERSAL" "$ERRORS_UNIVERSAL" "$PATTERNS_UNIVERSAL"; do
        local name
        name=$(basename "$file" .jsonl)
        if [ -f "$file" ] && [ -s "$file" ]; then
            local total
            total=$(wc -l < "$file" 2>/dev/null || echo "0")
            local harvested
            harvested=$(grep -c '"HARVESTED"' "$file" 2>/dev/null || echo "0")
            local candidate
            candidate=$(grep -c '"CANDIDATE"' "$file" 2>/dev/null || echo "0")
            local promoted
            promoted=$(grep -c '"PROMOTED"' "$file" 2>/dev/null || echo "0")

            echo "$name: $total total ($harvested harvested, $candidate candidates, $promoted promoted)"
        else
            echo "$name: 0 entries"
        fi
    done

    # Bootstrap count
    local bootstrap="$CENTRAL_KNOWLEDGE/bootstrap.jsonl"
    if [ -f "$bootstrap" ] && [ -s "$bootstrap" ]; then
        echo "bootstrap: $(wc -l < "$bootstrap") entries"
    fi
    if [ -f "$PROMOTION_REVIEW_FILE" ] && [ -s "$PROMOTION_REVIEW_FILE" ]; then
        echo "promotion-review: $(wc -l < "$PROMOTION_REVIEW_FILE") entries"
    fi

    echo ""

    # Project harvest dates
    if [ -f "$REGISTRY_FILE" ] && [ -s "$REGISTRY_FILE" ]; then
        echo "Last harvest per project:"
        local registry_meta="$FRAMEWORK_DIR/.project-registry-meta.jsonl"
        while IFS= read -r project_path; do
            if [ -n "$project_path" ]; then
                local last="never"
                if [ -f "$registry_meta" ] && [ -s "$registry_meta" ]; then
                    local meta
                    meta=$(grep -F "\"path\":\"$project_path\"" "$registry_meta" 2>/dev/null | tail -1 || true)
                    if [ -n "$meta" ]; then
                        local lh
                        lh=$(echo "$meta" | jq -r '.last_harvested // "never"' 2>/dev/null)
                        if [ "$lh" != "null" ]; then
                            last="$lh"
                        fi
                    fi
                fi
                echo "  $(basename "$project_path"): $last"
            fi
        done < "$REGISTRY_FILE"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ═══════════════════════════════════════════════════════════════

PRIMARY_ARG=""
for arg in "$@"; do
    case "$arg" in
        --json) JSON_OUTPUT=true ;;
        --quiet) QUIET=true ;;
        --verbose) VERBOSE=true ;;
        --force) FORCE=true ;;
        *)
            if [ -z "$PRIMARY_ARG" ]; then
                PRIMARY_ARG="$arg"
            fi
            ;;
    esac
done

case "${PRIMARY_ARG:-}" in
    --all)
        harvest_all
        ;;
    --promote)
        promote_knowledge
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        echo "Usage: $0 [PROJECT_PATH|--all|--promote|--status]"
        echo ""
        echo "Commands:"
        echo "  <path>      Harvest knowledge from a single project"
        echo "  --all       Harvest from all registered projects"
        echo "  --promote   Run promotion cycle on central knowledge"
        echo "  --status    Show harvest statistics"
        echo ""
        echo "Options:"
        echo "  --force     Skip confirmation prompts"
        echo "  --help      Show this help"
        echo "  --json      Machine-readable output"
        echo "  --quiet     Suppress non-essential output"
        echo "  --verbose   Detailed logging"
        echo ""
        echo "Knowledge flows: PROJECT → HARVESTED → CANDIDATE → PROMOTED → BOOTSTRAP"
        echo ""
        echo "Promotion criteria:"
        echo "  HARVESTED → CANDIDATE: Appears in 2+ projects"
        echo "  CANDIDATE → PROMOTED:  Appears in 3+ projects OR weight > 0.8"
        echo ""
        echo "Exit codes: 0=success, 1=error, 2=user cancellation"
        ;;
    "")
        echo "Usage: $0 [PROJECT_PATH|--all|--promote|--status]"
        echo "Run '$0 --help' for details"
        exit 1
        ;;
    *)
        # Assume it's a project path
        harvest_project "$1"
        ;;
esac

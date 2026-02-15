#!/bin/bash

# Checkpoint Manager - Named rewindable save points
# Creates lightweight git-based checkpoints that can be rewound to at any time.
# Uses git tags for checkpoints and stores metadata in .claude/checkpoints.json.
#
# USAGE:
#   ./scripts/checkpoint.sh create "description"
#   ./scripts/checkpoint.sh list [--limit=N]
#   ./scripts/checkpoint.sh rewind <name-or-index>
#   ./scripts/checkpoint.sh diff <a> <b>
#   ./scripts/checkpoint.sh show <name-or-index>
#   ./scripts/checkpoint.sh clean [--older-than=N] [--force]
#   ./scripts/checkpoint.sh --help

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

# Config
CHECKPOINT_PREFIX="cas-cp"
CHECKPOINT_META=".claude/checkpoints.json"
FORCE=false
LIMIT="20"
OLDER_THAN=""

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Checkpoint Manager - Named rewindable save points"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/checkpoint.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  create \"description\"   Create a named checkpoint at current state"
    echo "  list                    List all checkpoints"
    echo "  rewind <name|index>     Rewind to a checkpoint (restores code state)"
    echo "  diff <a> <b>            Show diff between two checkpoints"
    echo "  show <name|index>       Show checkpoint details"
    echo "  clean                   Remove old checkpoints"
    echo ""
    echo "OPTIONS:"
    echo "  --limit=N               Max checkpoints to list (default: 20)"
    echo "  --older-than=N          Clean checkpoints older than N days"
    echo "  --force                 Skip confirmation prompts"
    echo "  --help                  Show this help message"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/checkpoint.sh create \"before auth refactor\""
    echo "  ./scripts/checkpoint.sh list"
    echo "  ./scripts/checkpoint.sh rewind 1              # rewind to most recent"
    echo "  ./scripts/checkpoint.sh rewind before-auth    # rewind by name"
    echo "  ./scripts/checkpoint.sh diff 1 2              # diff between checkpoints"
    echo ""
    echo "INTEGRATION:"
    echo "  /go auto-creates checkpoints before each story"
    echo "  /fixer creates checkpoints before auto-remediation"
    echo "  /anvil creates checkpoints before gate evaluation"
}

# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

init_meta() {
    mkdir -p "$(dirname "$CHECKPOINT_META")"
    if [ ! -f "$CHECKPOINT_META" ]; then
        echo '{"checkpoints":[]}' > "$CHECKPOINT_META"
    fi
}

slugify() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | head -c 40
}

get_tag_name() {
    local slug="$1"
    local ts="$2"
    echo "${CHECKPOINT_PREFIX}-${ts}-${slug}"
}

# Resolve a name or index to a tag name
resolve_checkpoint() {
    local ref="$1"

    # If it's a number, treat as 1-based index from most recent
    if [[ "$ref" =~ ^[0-9]+$ ]]; then
        local tags
        tags=$(git tag -l "${CHECKPOINT_PREFIX}-*" --sort=-creatordate 2>/dev/null)
        local tag
        tag=$(echo "$tags" | sed -n "${ref}p")
        if [ -z "$tag" ]; then
            echo -e "${RED}Error: Checkpoint index $ref not found. Use 'list' to see available.${NC}" >&2
            exit 1
        fi
        echo "$tag"
    else
        # Try exact match first
        if git rev-parse "refs/tags/$ref" &>/dev/null; then
            echo "$ref"
            return
        fi
        # Try prefix match
        local matches
        matches=$(git tag -l "${CHECKPOINT_PREFIX}-*${ref}*" --sort=-creatordate 2>/dev/null | head -1)
        if [ -n "$matches" ]; then
            echo "$matches"
        else
            echo -e "${RED}Error: Checkpoint '$ref' not found.${NC}" >&2
            exit 1
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# CREATE - Create a new checkpoint
# ═══════════════════════════════════════════════════════════════

cmd_create() {
    local description="${1:-checkpoint}"

    # Verify we're in a git repo
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        echo -e "${RED}Error: Not in a git repository.${NC}"
        exit 1
    fi

    init_meta

    local slug
    slug=$(slugify "$description")
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local tag_name
    tag_name=$(get_tag_name "$slug" "$timestamp")
    local commit_hash
    commit_hash=$(git rev-parse HEAD)
    local iso_timestamp
    iso_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Check for uncommitted changes - stash them with the checkpoint
    local has_changes=false
    if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        has_changes=true
    fi

    local stash_ref="none"
    if [ "$has_changes" = true ]; then
        # Create a temporary commit to include working changes in the tag
        stash_ref=$(git stash create "checkpoint: $description" 2>/dev/null || echo "none")
    fi

    # Create annotated tag
    git tag -a "$tag_name" -m "Checkpoint: $description" "$commit_hash"

    # Update metadata
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
    local changed_files
    changed_files=$(git diff --name-only HEAD 2>/dev/null | wc -l || echo "0")

    local entry
    entry=$(cat <<EOF
{
  "tag": "$tag_name",
  "description": $(echo "$description" | jq -R .),
  "commit": "$commit_hash",
  "branch": "$branch",
  "created_at": "$iso_timestamp",
  "has_uncommitted": $has_changes,
  "stash_ref": "$stash_ref",
  "changed_files": $changed_files
}
EOF
    )

    # Append to metadata
    local tmp
    tmp=$(mktemp)
    jq --argjson entry "$entry" '.checkpoints += [$entry]' "$CHECKPOINT_META" > "$tmp"
    mv "$tmp" "$CHECKPOINT_META"

    echo -e "${GREEN}[PASS]${NC} Checkpoint created"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Name:        $tag_name"
    echo "Description: $description"
    echo "Commit:      ${commit_hash:0:12}"
    echo "Branch:      $branch"
    [ "$has_changes" = true ] && echo "Note:        Has uncommitted changes (stash: ${stash_ref:0:12})"
}

# ═══════════════════════════════════════════════════════════════
# LIST - Show all checkpoints
# ═══════════════════════════════════════════════════════════════

cmd_list() {
    local tags
    tags=$(git tag -l "${CHECKPOINT_PREFIX}-*" --sort=-creatordate 2>/dev/null)

    if [ -z "$tags" ]; then
        echo -e "${YELLOW}No checkpoints found.${NC}"
        echo "Create one: ./scripts/checkpoint.sh create \"my save point\""
        exit 0
    fi

    echo -e "${CYAN}${BOLD}CHECKPOINTS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local idx=0
    while IFS= read -r tag; do
        if [ -z "$tag" ]; then continue; fi
        idx=$((idx + 1))
        if [ "$idx" -gt "$LIMIT" ]; then break; fi

        local commit
        commit=$(git rev-parse --short "$tag" 2>/dev/null || echo "???")
        local date_str
        date_str=$(git tag -l "$tag" --format='%(creatordate:short)' 2>/dev/null || echo "unknown")
        local msg
        msg=$(git tag -l "$tag" --format='%(contents:subject)' 2>/dev/null || echo "$tag")

        # Remove "Checkpoint: " prefix from message for display
        msg="${msg#Checkpoint: }"

        printf "  ${BOLD}%2d${NC}  %-14s  %-12s  %s  %s\n" "$idx" "$tag" "$commit" "$date_str" "$msg"
    done <<< "$tags"

    local total
    total=$(echo "$tags" | grep -c . || echo "0")
    echo ""
    echo "Total: $total checkpoints (showing $idx)"
}

# ═══════════════════════════════════════════════════════════════
# REWIND - Restore to a checkpoint
# ═══════════════════════════════════════════════════════════════

cmd_rewind() {
    local ref="${1:-}"
    if [ -z "$ref" ]; then
        echo -e "${RED}Error: Specify checkpoint name or index.${NC}"
        echo "Usage: ./scripts/checkpoint.sh rewind <name|index>"
        echo "Run: ./scripts/checkpoint.sh list"
        exit 1
    fi

    local tag
    tag=$(resolve_checkpoint "$ref")
    local commit
    commit=$(git rev-parse "$tag")
    local msg
    msg=$(git tag -l "$tag" --format='%(contents:subject)' 2>/dev/null)
    msg="${msg#Checkpoint: }"

    echo -e "${YELLOW}REWIND REQUEST${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Target:      $tag"
    echo "Commit:      ${commit:0:12}"
    echo "Description: $msg"
    echo ""

    # Check for uncommitted changes
    if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        echo -e "${YELLOW}Warning: You have uncommitted changes that will be lost.${NC}"
    fi

    if [ "$FORCE" != true ]; then
        read -p "Rewind to this checkpoint? This cannot be undone. (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Cancelled.${NC}"
            exit 0
        fi
    fi

    # Create a safety checkpoint before rewinding
    local safety_tag="${CHECKPOINT_PREFIX}-prerewind-$(date +%Y%m%d-%H%M%S)"
    git tag -a "$safety_tag" -m "Auto-checkpoint before rewind to $tag" HEAD 2>/dev/null || true

    # Rewind
    git reset --hard "$commit"

    echo -e "${GREEN}[PASS]${NC} Rewound to checkpoint"
    echo "Safety tag: $safety_tag (use to undo this rewind)"
}

# ═══════════════════════════════════════════════════════════════
# DIFF - Compare two checkpoints
# ═══════════════════════════════════════════════════════════════

cmd_diff() {
    local ref_a="${1:-}"
    local ref_b="${2:-}"

    if [ -z "$ref_a" ] || [ -z "$ref_b" ]; then
        echo -e "${RED}Error: Two checkpoint references required.${NC}"
        echo "Usage: ./scripts/checkpoint.sh diff <a> <b>"
        exit 1
    fi

    local tag_a
    tag_a=$(resolve_checkpoint "$ref_a")
    local tag_b
    tag_b=$(resolve_checkpoint "$ref_b")

    echo -e "${CYAN}${BOLD}CHECKPOINT DIFF${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "From: $tag_a"
    echo "To:   $tag_b"
    echo ""

    git diff --stat "$tag_a" "$tag_b"
    echo ""
    git diff "$tag_a" "$tag_b"
}

# ═══════════════════════════════════════════════════════════════
# SHOW - Show checkpoint details
# ═══════════════════════════════════════════════════════════════

cmd_show() {
    local ref="${1:-}"
    if [ -z "$ref" ]; then
        echo -e "${RED}Error: Specify checkpoint name or index.${NC}"
        exit 1
    fi

    local tag
    tag=$(resolve_checkpoint "$ref")
    local commit
    commit=$(git rev-parse "$tag")
    local msg
    msg=$(git tag -l "$tag" --format='%(contents:subject)' 2>/dev/null)
    msg="${msg#Checkpoint: }"
    local date_str
    date_str=$(git tag -l "$tag" --format='%(creatordate:iso)' 2>/dev/null)

    echo -e "${CYAN}${BOLD}CHECKPOINT DETAILS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Tag:         $tag"
    echo "Description: $msg"
    echo "Commit:      $commit"
    echo "Created:     $date_str"
    echo ""

    # Show metadata if available
    if [ -f "$CHECKPOINT_META" ]; then
        local meta
        meta=$(jq -r --arg t "$tag" '.checkpoints[] | select(.tag == $t)' "$CHECKPOINT_META" 2>/dev/null)
        if [ -n "$meta" ]; then
            echo "Branch:      $(echo "$meta" | jq -r '.branch')"
            echo "Uncommitted: $(echo "$meta" | jq -r '.has_uncommitted')"
        fi
    fi

    echo ""
    echo "Files at this checkpoint:"
    git diff --stat "$tag" HEAD 2>/dev/null || echo "  (same as HEAD)"
}

# ═══════════════════════════════════════════════════════════════
# CLEAN - Remove old checkpoints
# ═══════════════════════════════════════════════════════════════

cmd_clean() {
    local tags
    tags=$(git tag -l "${CHECKPOINT_PREFIX}-*" --sort=-creatordate 2>/dev/null)

    if [ -z "$tags" ]; then
        echo "No checkpoints to clean."
        exit 0
    fi

    local to_delete=""
    local count=0

    if [ -n "$OLDER_THAN" ]; then
        local cutoff
        cutoff=$(date -d "$OLDER_THAN days ago" +%s 2>/dev/null || date -v-"${OLDER_THAN}"d +%s 2>/dev/null)

        while IFS= read -r tag; do
            if [ -z "$tag" ]; then continue; fi
            local tag_date
            tag_date=$(git tag -l "$tag" --format='%(creatordate:unix)' 2>/dev/null || echo "0")
            if [ "$tag_date" -lt "$cutoff" ] 2>/dev/null; then
                to_delete="$to_delete $tag"
                count=$((count + 1))
            fi
        done <<< "$tags"
    else
        to_delete="$tags"
        count=$(echo "$tags" | grep -c . || echo "0")
    fi

    if [ "$count" -eq 0 ]; then
        echo "No checkpoints match cleanup criteria."
        exit 0
    fi

    echo -e "${YELLOW}Will delete $count checkpoint(s)${NC}"

    if [ "$FORCE" != true ]; then
        read -p "Continue? (y/N): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Cancelled."
            exit 0
        fi
    fi

    for tag in $to_delete; do
        git tag -d "$tag" 2>/dev/null && echo "  Deleted: $tag"
    done

    # Clean metadata
    if [ -f "$CHECKPOINT_META" ]; then
        local tmp
        tmp=$(mktemp)
        local remaining_tags
        remaining_tags=$(git tag -l "${CHECKPOINT_PREFIX}-*" 2>/dev/null | jq -R . | jq -s .)
        jq --argjson tags "$remaining_tags" '.checkpoints = [.checkpoints[] | select(.tag as $t | $tags | index($t))]' "$CHECKPOINT_META" > "$tmp"
        mv "$tmp" "$CHECKPOINT_META"
    fi

    echo -e "${GREEN}[PASS]${NC} Cleaned $count checkpoints"
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

# Parse global flags first
POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case $1 in
        --limit=*)       LIMIT="${1#*=}"; shift ;;
        --older-than=*)  OLDER_THAN="${1#*=}"; shift ;;
        --force)         FORCE=true; shift ;;
        --help)          show_help; exit 0 ;;
        *)               POSITIONAL+=("$1"); shift ;;
    esac
done

case "$COMMAND" in
    create)  cmd_create "${POSITIONAL[0]:-checkpoint}" ;;
    list)    cmd_list ;;
    rewind)  cmd_rewind "${POSITIONAL[0]:-}" ;;
    diff)    cmd_diff "${POSITIONAL[0]:-}" "${POSITIONAL[1]:-}" ;;
    show)    cmd_show "${POSITIONAL[0]:-}" ;;
    clean)   cmd_clean ;;
    --help|help) show_help ;;
    *)
        echo "Usage: $0 {create|list|rewind|diff|show|clean} [options]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

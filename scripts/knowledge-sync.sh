#!/bin/bash
# Knowledge Hub Sync - Remote transport layer for knowledge, scratchpads, and metrics
# Handles git push/pull operations against the configured hub repository.
# Does NOT duplicate harvest.sh — this is the REMOTE layer only.
#
# USAGE:
#   ./scripts/knowledge-sync.sh setup <repo-url> [--machine-id=name]
#   ./scripts/knowledge-sync.sh push [lesson-file.md]
#   ./scripts/knowledge-sync.sh pull
#   ./scripts/knowledge-sync.sh scratchpad push
#   ./scripts/knowledge-sync.sh scratchpad pull [machine-id]
#   ./scripts/knowledge-sync.sh metrics push
#   ./scripts/knowledge-sync.sh status
#   ./scripts/knowledge-sync.sh --help

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Hub paths
HUB_CONFIG="$FRAMEWORK_DIR/.claude/hub.json"
KNOWLEDGE_DIR="$FRAMEWORK_DIR/knowledge"
SCRATCHPADS_DIR="$FRAMEWORK_DIR/scratchpads"
METRICS_DIR="$FRAMEWORK_DIR/metrics"
CENTRAL_KNOWLEDGE="$FRAMEWORK_DIR/memory_bank/knowledge"

# ═══════════════════════════════════════════════════════════════
# CONFIG HELPERS (jq-free for portability)
# ═══════════════════════════════════════════════════════════════

read_config() {
    local key="$1"
    if [ ! -f "$HUB_CONFIG" ]; then
        echo ""
        return
    fi
    grep "\"$key\"" "$HUB_CONFIG" 2>/dev/null | sed 's/.*: *"\([^"]*\)".*/\1/' | head -1
}

write_config() {
    local hub_url="$1"
    local machine_id="$2"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$(dirname "$HUB_CONFIG")"
    cat > "$HUB_CONFIG" <<EOF
{
    "hub_url": "$hub_url",
    "machine_id": "$machine_id",
    "created_at": "$now",
    "last_pull": null,
    "last_push": null
}
EOF
}

update_config_timestamp() {
    local field="$1"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    if [ -f "$HUB_CONFIG" ]; then
        sed -i "s/\"$field\": *\"[^\"]*\"/\"$field\": \"$now\"/" "$HUB_CONFIG"
        sed -i "s/\"$field\": *null/\"$field\": \"$now\"/" "$HUB_CONFIG"
    fi
}

# ═══════════════════════════════════════════════════════════════
# CHECKS
# ═══════════════════════════════════════════════════════════════

check_hub_configured() {
    if [ ! -f "$HUB_CONFIG" ]; then
        echo -e "${RED}Hub not configured.${NC}"
        echo -e "Run: ${CYAN}./scripts/knowledge-sync.sh setup <repo-url>${NC}"
        exit 1
    fi
    local url
    url=$(read_config "hub_url")
    if [ -z "$url" ]; then
        echo -e "${RED}Hub URL not set in $HUB_CONFIG${NC}"
        exit 1
    fi
}

check_git_initialized() {
    if [ ! -d "$FRAMEWORK_DIR/.git" ]; then
        echo -e "${RED}Git not initialized in framework directory.${NC}"
        echo -e "Run: ${CYAN}cd $FRAMEWORK_DIR && git init${NC}"
        exit 1
    fi
    if ! git -C "$FRAMEWORK_DIR" remote get-url origin &>/dev/null; then
        local url
        url=$(read_config "hub_url")
        echo -e "${RED}No 'origin' remote configured.${NC}"
        echo -e "Run: ${CYAN}cd $FRAMEWORK_DIR && git remote add origin $url${NC}"
        exit 1
    fi
}

check_connectivity() {
    if ! git -C "$FRAMEWORK_DIR" ls-remote --exit-code origin HEAD &>/dev/null; then
        return 1
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo -e "${BOLD}Knowledge Hub Sync${NC} - Remote transport layer"
    echo ""
    echo -e "${CYAN}USAGE${NC}"
    echo "  ./scripts/knowledge-sync.sh <command> [args]"
    echo ""
    echo -e "${CYAN}COMMANDS${NC}"
    echo "  setup <repo-url> [--machine-id=name]   Configure hub repository and machine identity"
    echo "  push [lesson-file.md]                   Push knowledge to hub (lesson or central JSONL)"
    echo "  pull                                    Pull latest from hub"
    echo "  scratchpad push                         Push project scratchpad for cross-machine sync"
    echo "  scratchpad pull [machine-id]             Pull scratchpad from another machine"
    echo "  metrics push                            Aggregate and push usage metrics"
    echo "  status                                  Show hub configuration and sync state"
    echo ""
    echo -e "${CYAN}OPTIONS${NC}"
    echo "  --help, -h                              Show this help message"
    echo ""
    echo -e "${CYAN}EXAMPLES${NC}"
    echo "  # First-time setup"
    echo "  ./scripts/knowledge-sync.sh setup git@github.com:user/repo.git"
    echo ""
    echo "  # Push a lesson"
    echo "  ./scripts/knowledge-sync.sh push knowledge/staging/my-lesson.md"
    echo ""
    echo "  # Push all central knowledge (bootstrap + universals)"
    echo "  ./scripts/knowledge-sync.sh push"
    echo ""
    echo "  # Pull latest from hub"
    echo "  ./scripts/knowledge-sync.sh pull"
    echo ""
    echo "  # Cross-machine scratchpad sync"
    echo "  ./scripts/knowledge-sync.sh scratchpad push"
    echo "  ./scripts/knowledge-sync.sh scratchpad pull desktop-main"
    echo ""
    echo -e "${CYAN}OFFLINE BEHAVIOR${NC}"
    echo "  All push commands commit locally first, then attempt git push."
    echo "  If offline, the commit is preserved and pushed on next sync."
    echo ""
    echo -e "${CYAN}HUB DIRECTORIES${NC}"
    echo "  knowledge/promoted/   Curated lessons (markdown)"
    echo "  knowledge/staging/    Submitted lessons awaiting review"
    echo "  scratchpads/          Cross-machine session state"
    echo "  metrics/              Aggregated usage metrics"
}

cmd_setup() {
    local repo_url=""
    local machine_id=""

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --machine-id=*)
                machine_id="${arg#--machine-id=}"
                ;;
            *)
                if [ -z "$repo_url" ]; then
                    repo_url="$arg"
                fi
                ;;
        esac
    done

    if [ -z "$repo_url" ]; then
        echo -e "${RED}Usage: knowledge-sync.sh setup <repo-url> [--machine-id=name]${NC}"
        exit 1
    fi

    # Default machine ID
    if [ -z "$machine_id" ]; then
        machine_id="$(hostname)-$(whoami)"
    fi

    echo -e "${CYAN}KNOWLEDGE HUB SETUP${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Write config
    write_config "$repo_url" "$machine_id"
    echo -e "${GREEN}[OK]${NC} Hub config written to $HUB_CONFIG"
    echo "  URL:        $repo_url"
    echo "  Machine ID: $machine_id"

    # Initialize git if needed
    if [ ! -d "$FRAMEWORK_DIR/.git" ]; then
        echo ""
        echo -e "${BLUE}Initializing git repository...${NC}"
        git -C "$FRAMEWORK_DIR" init
        echo -e "${GREEN}[OK]${NC} Git initialized"
    fi

    # Add remote if needed
    if git -C "$FRAMEWORK_DIR" remote get-url origin &>/dev/null; then
        local current_url
        current_url=$(git -C "$FRAMEWORK_DIR" remote get-url origin)
        if [ "$current_url" != "$repo_url" ]; then
            echo -e "${YELLOW}Remote 'origin' exists with different URL: $current_url${NC}"
            echo -e "Updating to: $repo_url"
            git -C "$FRAMEWORK_DIR" remote set-url origin "$repo_url"
            echo -e "${GREEN}[OK]${NC} Remote updated"
        else
            echo -e "${GREEN}[OK]${NC} Remote 'origin' already set to $repo_url"
        fi
    else
        git -C "$FRAMEWORK_DIR" remote add origin "$repo_url"
        echo -e "${GREEN}[OK]${NC} Remote 'origin' added"
    fi

    echo ""
    echo -e "${GREEN}Hub setup complete.${NC}"
    echo ""
    echo -e "Next steps:"
    echo -e "  ${CYAN}git add -A && git commit -m 'Initial commit'${NC}"
    echo -e "  ${CYAN}git branch -M main && git push -u origin main${NC}"
}

cmd_push() {
    local lesson_file="${1:-}"

    check_hub_configured
    check_git_initialized

    local machine_id
    machine_id=$(read_config "machine_id")
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local committed=false

    echo -e "${CYAN}KNOWLEDGE HUB PUSH${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ -n "$lesson_file" ]; then
        # Push a specific lesson file
        if [ ! -f "$lesson_file" ]; then
            echo -e "${RED}File not found: $lesson_file${NC}"
            exit 1
        fi

        local filename
        filename=$(basename "$lesson_file")

        # Copy to staging if not already there
        if [[ "$lesson_file" != "$KNOWLEDGE_DIR/staging/"* ]]; then
            cp "$lesson_file" "$KNOWLEDGE_DIR/staging/$filename"
            echo -e "${GREEN}[OK]${NC} Copied to knowledge/staging/$filename"
        fi

        git -C "$FRAMEWORK_DIR" add "knowledge/staging/$filename"
        if git -C "$FRAMEWORK_DIR" diff --cached --quiet; then
            echo -e "${YELLOW}No changes to commit (file already staged)${NC}"
        else
            git -C "$FRAMEWORK_DIR" commit -m "knowledge: lesson from $machine_id - $filename"
            committed=true
            echo -e "${GREEN}[OK]${NC} Committed lesson: $filename"
        fi
    else
        # Push central knowledge (bootstrap + universals)
        local files_to_add=()

        if [ -f "$CENTRAL_KNOWLEDGE/bootstrap.jsonl" ]; then
            files_to_add+=("memory_bank/knowledge/bootstrap.jsonl")
        fi

        for f in "$CENTRAL_KNOWLEDGE"/*-universal.jsonl; do
            if [ -f "$f" ]; then
                files_to_add+=("memory_bank/knowledge/$(basename "$f")")
            fi
        done

        # Also add any knowledge/ changes
        if [ -d "$KNOWLEDGE_DIR" ]; then
            files_to_add+=("knowledge/")
        fi

        if [ ${#files_to_add[@]} -eq 0 ]; then
            echo -e "${YELLOW}No knowledge files to push${NC}"
            return 0
        fi

        git -C "$FRAMEWORK_DIR" add "${files_to_add[@]}" 2>/dev/null || true

        if git -C "$FRAMEWORK_DIR" diff --cached --quiet; then
            echo -e "${YELLOW}No changes to commit (everything up-to-date)${NC}"
        else
            git -C "$FRAMEWORK_DIR" commit -m "knowledge: central sync from $machine_id at $now"
            committed=true
            echo -e "${GREEN}[OK]${NC} Committed central knowledge"
        fi
    fi

    # Push to remote
    if [ "$committed" = true ] || ! git -C "$FRAMEWORK_DIR" diff --cached --quiet 2>/dev/null; then
        if check_connectivity; then
            local branch
            branch=$(git -C "$FRAMEWORK_DIR" branch --show-current 2>/dev/null || echo "main")
            git -C "$FRAMEWORK_DIR" push origin "$branch" 2>/dev/null
            update_config_timestamp "last_push"
            echo -e "${GREEN}[OK]${NC} Pushed to hub"
        else
            echo -e "${YELLOW}Offline — committed locally, will push on next sync${NC}"
        fi
    fi
}

cmd_pull() {
    check_hub_configured
    check_git_initialized

    echo -e "${CYAN}KNOWLEDGE HUB PULL${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if ! check_connectivity; then
        echo -e "${YELLOW}Offline — cannot pull from hub${NC}"
        return 1
    fi

    local branch
    branch=$(git -C "$FRAMEWORK_DIR" branch --show-current 2>/dev/null || echo "main")

    # Try rebase-pull first (cleaner history)
    if ! git -C "$FRAMEWORK_DIR" pull --rebase origin "$branch" 2>/dev/null; then
        echo -e "${YELLOW}Rebase failed, trying merge...${NC}"
        git -C "$FRAMEWORK_DIR" rebase --abort 2>/dev/null || true

        if ! git -C "$FRAMEWORK_DIR" pull --no-rebase origin "$branch" 2>/dev/null; then
            echo -e "${RED}Pull failed — manual conflict resolution needed${NC}"
            echo -e "Run: ${CYAN}cd $FRAMEWORK_DIR && git status${NC}"
            return 1
        fi
    fi

    update_config_timestamp "last_pull"

    # Report what was updated
    local promoted_count=0
    local scratchpad_count=0
    if [ -d "$KNOWLEDGE_DIR/promoted" ]; then
        promoted_count=$(find "$KNOWLEDGE_DIR/promoted" -name "*.md" 2>/dev/null | wc -l)
    fi
    if [ -d "$SCRATCHPADS_DIR" ]; then
        scratchpad_count=$(find "$SCRATCHPADS_DIR" -name "*.md" 2>/dev/null | wc -l)
    fi

    echo -e "${GREEN}[OK]${NC} Pulled from hub"
    echo "  Promoted lessons: $promoted_count"
    echo "  Scratchpads:      $scratchpad_count"
}

cmd_scratchpad_push() {
    check_hub_configured
    check_git_initialized

    local machine_id
    machine_id=$(read_config "machine_id")
    local project_dir="$PWD"
    local scratchpad="$project_dir/.claude/scratchpad.md"

    echo -e "${CYAN}SCRATCHPAD PUSH${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$project_dir" = "$FRAMEWORK_DIR" ]; then
        echo -e "${YELLOW}Run this from a project directory, not the framework.${NC}"
        echo -e "Usage: ${CYAN}cd /path/to/project && $FRAMEWORK_DIR/scripts/knowledge-sync.sh scratchpad push${NC}"
        return 1
    fi

    if [ ! -f "$scratchpad" ]; then
        echo -e "${YELLOW}No scratchpad found at $scratchpad${NC}"
        return 1
    fi

    local dest="$SCRATCHPADS_DIR/$machine_id.md"
    cp "$scratchpad" "$dest"
    echo -e "${GREEN}[OK]${NC} Copied scratchpad → scratchpads/$machine_id.md"

    git -C "$FRAMEWORK_DIR" add "scratchpads/$machine_id.md"
    if ! git -C "$FRAMEWORK_DIR" diff --cached --quiet; then
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        git -C "$FRAMEWORK_DIR" commit -m "scratchpad: $machine_id at $now"
        echo -e "${GREEN}[OK]${NC} Committed"
    fi

    if check_connectivity; then
        local branch
        branch=$(git -C "$FRAMEWORK_DIR" branch --show-current 2>/dev/null || echo "main")
        git -C "$FRAMEWORK_DIR" push origin "$branch" 2>/dev/null
        update_config_timestamp "last_push"
        echo -e "${GREEN}[OK]${NC} Pushed to hub"
    else
        echo -e "${YELLOW}Offline — committed locally, will push on next sync${NC}"
    fi
}

cmd_scratchpad_pull() {
    local target_id="${1:-}"

    check_hub_configured
    check_git_initialized

    echo -e "${CYAN}SCRATCHPAD PULL${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Pull latest first
    if check_connectivity; then
        local branch
        branch=$(git -C "$FRAMEWORK_DIR" branch --show-current 2>/dev/null || echo "main")
        git -C "$FRAMEWORK_DIR" pull --rebase origin "$branch" 2>/dev/null || true
    fi

    # List available scratchpads
    local scratchpads=()
    if [ -d "$SCRATCHPADS_DIR" ]; then
        while IFS= read -r f; do
            scratchpads+=("$f")
        done < <(find "$SCRATCHPADS_DIR" -name "*.md" -not -name ".gitkeep" 2>/dev/null | sort)
    fi

    if [ ${#scratchpads[@]} -eq 0 ]; then
        echo -e "${YELLOW}No scratchpads available in hub${NC}"
        return 1
    fi

    if [ -z "$target_id" ]; then
        echo -e "Available scratchpads:"
        for f in "${scratchpads[@]}"; do
            local name
            name=$(basename "$f" .md)
            local mod_date
            mod_date=$(date -r "$f" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
            echo -e "  ${CYAN}$name${NC}  (last updated: $mod_date)"
        done
        echo ""
        echo -e "Pull with: ${CYAN}knowledge-sync.sh scratchpad pull <machine-id>${NC}"
        return 0
    fi

    local source="$SCRATCHPADS_DIR/$target_id.md"
    if [ ! -f "$source" ]; then
        echo -e "${RED}Scratchpad not found: $target_id${NC}"
        echo -e "Available: $(ls "$SCRATCHPADS_DIR"/*.md 2>/dev/null | xargs -I{} basename {} .md | tr '\n' ' ')"
        return 1
    fi

    local project_dir="$PWD"
    local dest="$project_dir/.claude/scratchpad.md"

    if [ -f "$dest" ]; then
        echo -e "${YELLOW}Local scratchpad exists. Overwriting with $target_id.${NC}"
    fi

    mkdir -p "$project_dir/.claude"
    cp "$source" "$dest"
    echo -e "${GREEN}[OK]${NC} Pulled scratchpad from $target_id → .claude/scratchpad.md"
}

cmd_metrics_push() {
    check_hub_configured
    check_git_initialized

    local machine_id
    machine_id=$(read_config "machine_id")
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local date_tag
    date_tag=$(date -u +"%Y-%m-%d")

    echo -e "${CYAN}METRICS PUSH${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Aggregate metrics
    local bootstrap_count=0
    local universal_count=0
    local project_count=0
    local promoted_count=0
    local staging_count=0

    if [ -f "$CENTRAL_KNOWLEDGE/bootstrap.jsonl" ]; then
        bootstrap_count=$(wc -l < "$CENTRAL_KNOWLEDGE/bootstrap.jsonl" 2>/dev/null || echo 0)
    fi

    for f in "$CENTRAL_KNOWLEDGE"/*-universal.jsonl; do
        if [ -f "$f" ]; then
            local c
            c=$(wc -l < "$f" 2>/dev/null || echo 0)
            universal_count=$((universal_count + c))
        fi
    done

    if [ -f "$FRAMEWORK_DIR/.project-registry" ]; then
        project_count=$(wc -l < "$FRAMEWORK_DIR/.project-registry" 2>/dev/null || echo 0)
    fi

    if [ -d "$KNOWLEDGE_DIR/promoted" ]; then
        promoted_count=$(find "$KNOWLEDGE_DIR/promoted" -name "*.md" 2>/dev/null | wc -l)
    fi

    if [ -d "$KNOWLEDGE_DIR/staging" ]; then
        staging_count=$(find "$KNOWLEDGE_DIR/staging" -name "*.md" 2>/dev/null | wc -l)
    fi

    local version
    version=$(cat "$FRAMEWORK_DIR/.version" 2>/dev/null || echo "unknown")

    # Write metrics file
    local metrics_file="$METRICS_DIR/${machine_id}-${date_tag}.json"
    cat > "$metrics_file" <<EOF
{
    "machine_id": "$machine_id",
    "timestamp": "$now",
    "framework_version": "$version",
    "knowledge": {
        "bootstrap_entries": $bootstrap_count,
        "universal_entries": $universal_count,
        "promoted_lessons": $promoted_count,
        "staging_lessons": $staging_count
    },
    "projects": {
        "registered": $project_count
    }
}
EOF

    echo -e "${GREEN}[OK]${NC} Metrics written to metrics/${machine_id}-${date_tag}.json"

    git -C "$FRAMEWORK_DIR" add "metrics/"
    if ! git -C "$FRAMEWORK_DIR" diff --cached --quiet; then
        git -C "$FRAMEWORK_DIR" commit -m "metrics: $machine_id at $now"
        echo -e "${GREEN}[OK]${NC} Committed"
    fi

    if check_connectivity; then
        local branch
        branch=$(git -C "$FRAMEWORK_DIR" branch --show-current 2>/dev/null || echo "main")
        git -C "$FRAMEWORK_DIR" push origin "$branch" 2>/dev/null
        update_config_timestamp "last_push"
        echo -e "${GREEN}[OK]${NC} Pushed to hub"
    else
        echo -e "${YELLOW}Offline — committed locally${NC}"
    fi
}

cmd_status() {
    echo -e "${CYAN}KNOWLEDGE HUB STATUS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -f "$HUB_CONFIG" ]; then
        echo -e "${YELLOW}Hub not configured.${NC}"
        echo -e "Run: ${CYAN}./scripts/knowledge-sync.sh setup <repo-url>${NC}"
        return 0
    fi

    local hub_url machine_id last_pull last_push created_at
    hub_url=$(read_config "hub_url")
    machine_id=$(read_config "machine_id")
    last_pull=$(read_config "last_pull")
    last_push=$(read_config "last_push")
    created_at=$(read_config "created_at")

    echo -e "Hub URL:     ${BOLD}$hub_url${NC}"
    echo -e "Machine ID:  ${BOLD}$machine_id${NC}"
    echo -e "Configured:  $created_at"
    echo -e "Last Pull:   ${last_pull:-never}"
    echo -e "Last Push:   ${last_push:-never}"

    echo ""

    # Git status
    if [ -d "$FRAMEWORK_DIR/.git" ]; then
        if git -C "$FRAMEWORK_DIR" remote get-url origin &>/dev/null; then
            echo -e "Git Remote:  ${GREEN}configured${NC}"
            if check_connectivity; then
                echo -e "Connectivity: ${GREEN}online${NC}"
            else
                echo -e "Connectivity: ${YELLOW}offline${NC}"
            fi
        else
            echo -e "Git Remote:  ${RED}not configured${NC}"
        fi
    else
        echo -e "Git:         ${RED}not initialized${NC}"
    fi

    echo ""

    # Knowledge counts
    local promoted=0 staging=0 scratchpads=0 metrics=0
    if [ -d "$KNOWLEDGE_DIR/promoted" ]; then
        promoted=$(find "$KNOWLEDGE_DIR/promoted" -name "*.md" 2>/dev/null | wc -l)
    fi
    if [ -d "$KNOWLEDGE_DIR/staging" ]; then
        staging=$(find "$KNOWLEDGE_DIR/staging" -name "*.md" 2>/dev/null | wc -l)
    fi
    if [ -d "$SCRATCHPADS_DIR" ]; then
        scratchpads=$(find "$SCRATCHPADS_DIR" -name "*.md" -not -name ".gitkeep" 2>/dev/null | wc -l)
    fi
    if [ -d "$METRICS_DIR" ]; then
        metrics=$(find "$METRICS_DIR" -name "*.json" 2>/dev/null | wc -l)
    fi

    echo -e "Knowledge:"
    echo -e "  Promoted:    $promoted"
    echo -e "  Staging:     $staging"
    echo -e "  Scratchpads: $scratchpads"
    echo -e "  Metrics:     $metrics"
}

# ═══════════════════════════════════════════════════════════════
# COMMAND DISPATCHER
# ═══════════════════════════════════════════════════════════════

case "${1:-}" in
    setup)
        shift
        cmd_setup "$@"
        ;;
    push)
        shift
        cmd_push "${1:-}"
        ;;
    pull)
        cmd_pull
        ;;
    scratchpad)
        shift
        case "${1:-}" in
            push)
                cmd_scratchpad_push
                ;;
            pull)
                shift
                cmd_scratchpad_pull "${1:-}"
                ;;
            *)
                echo -e "${RED}Usage: $0 scratchpad {push|pull [machine-id]}${NC}"
                exit 1
                ;;
        esac
        ;;
    metrics)
        shift
        case "${1:-}" in
            push)
                cmd_metrics_push
                ;;
            *)
                echo -e "${RED}Usage: $0 metrics push${NC}"
                exit 1
                ;;
        esac
        ;;
    status)
        cmd_status
        ;;
    --help|-h)
        show_help
        ;;
    "")
        echo -e "${BOLD}Knowledge Hub Sync${NC}"
        echo ""
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands: setup, push, pull, scratchpad, metrics, status"
        echo ""
        echo "Run '$0 --help' for full usage."
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 --help' for usage."
        exit 1
        ;;
esac

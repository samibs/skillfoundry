#!/bin/bash

# Knowledge Sync Daemon - Background sync of project knowledge to a global GitHub repository
# Periodically detects changes in memory_bank/, logs/sessions/, scratchpads/, and agent-stats,
# sanitizes them, and pushes to a central dev-memory repository. Pulls global lessons back.
#
# macOS bash 3.2 compatible: NO declare -A, NO ${var^^}, NO mapfile/readarray.
#
# USAGE:
#   ./scripts/knowledge-sync.sh init <github-repo-url>
#   ./scripts/knowledge-sync.sh start [--if-not-running]
#   ./scripts/knowledge-sync.sh stop
#   ./scripts/knowledge-sync.sh sync
#   ./scripts/knowledge-sync.sh status
#   ./scripts/knowledge-sync.sh register [project-dir]
#   ./scripts/knowledge-sync.sh promote
#   ./scripts/knowledge-sync.sh log
#   ./scripts/knowledge-sync.sh --help
#   ./scripts/knowledge-sync.sh --version

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# SETUP & CONSTANTS
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Paths
PID_FILE="$FRAMEWORK_DIR/.claude/knowledge-sync.pid"
CONF_FILE="$FRAMEWORK_DIR/.claude/knowledge-sync.conf"
LOG_FILE="$FRAMEWORK_DIR/logs/knowledge-sync.log"
MAX_LOG_LINES=1000

# Configurable sync interval (seconds); default 5 minutes
SYNC_INTERVAL="${KNOWLEDGE_SYNC_INTERVAL:-300}"

# Tracking file for change detection — stores epoch of last successful sync
LAST_SYNC_MARKER="$FRAMEWORK_DIR/.claude/.knowledge-sync-marker"

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo -e "${BOLD}Knowledge Hub Sync Daemon${NC} — Background sync of project knowledge"
    echo ""
    echo -e "${CYAN}USAGE${NC}"
    echo "  ./scripts/knowledge-sync.sh <command> [args]"
    echo ""
    echo -e "${CYAN}COMMANDS${NC}"
    echo "  init <github-repo-url>    Configure the knowledge repo (clone or create)"
    echo "  start                     Start the daemon (backgrounds itself)"
    echo "  start --if-not-running    Start only if not already running"
    echo "  stop                      Stop the daemon gracefully"
    echo "  sync                      One-shot manual sync (foreground)"
    echo "  status                    Show daemon status, last sync time, repo URL"
    echo "  register [project-dir]    Register current/specified project in the global repo"
    echo "  promote                   Check errors.jsonl for patterns to promote to global/lessons.jsonl"
    echo "  log                       Show last 50 lines of sync log"
    echo "  --help                    Show this help"
    echo "  --version                 Show version"
    echo ""
    echo -e "${CYAN}ENVIRONMENT${NC}"
    echo "  KNOWLEDGE_SYNC_INTERVAL   Sync interval in seconds (default: 300 = 5 min)"
    echo ""
    echo -e "${CYAN}CONFIG FILE${NC}"
    echo "  $CONF_FILE"
    echo ""
    echo -e "${CYAN}GLOBAL KNOWLEDGE REPO STRUCTURE${NC}"
    echo "  dev-memory/"
    echo "  ├── global/"
    echo "  │   ├── preferences.json"
    echo "  │   ├── lessons.jsonl"
    echo "  │   ├── tech-stack.json"
    echo "  │   └── anti-patterns.jsonl"
    echo "  ├── projects/"
    echo "  │   └── <project-name>/"
    echo "  │       ├── memory_bank/knowledge/"
    echo "  │       ├── relationships/"
    echo "  │       ├── sessions/"
    echo "  │       └── agent-stats.jsonl"
    echo "  ├── EVOLUTION.md"
    echo "  └── .sync-meta.json"
    echo ""
    echo -e "${CYAN}SYNC CYCLE${NC}"
    echo "  1. Detect changed files in memory_bank/, logs/sessions/, scratchpads/, .claude/agent-stats.jsonl"
    echo "  2. If no changes, skip"
    echo "  3. Stage, sanitize, copy to knowledge repo under projects/<project-name>/"
    echo "  4. Commit and push"
    echo "  5. Pull global/ updates; copy lessons.jsonl into project memory_bank/knowledge/"
    echo ""
    echo -e "${CYAN}EXAMPLES${NC}"
    echo "  # First-time setup"
    echo "  ./scripts/knowledge-sync.sh init https://github.com/user/dev-memory.git"
    echo ""
    echo "  # Start daemon in background"
    echo "  ./scripts/knowledge-sync.sh start"
    echo ""
    echo "  # Manual one-shot sync"
    echo "  ./scripts/knowledge-sync.sh sync"
    echo ""
    echo "  # Register a project"
    echo "  ./scripts/knowledge-sync.sh register /path/to/my-project"
    echo ""
    echo "  # Promote recurring error patterns to global lessons"
    echo "  ./scripts/knowledge-sync.sh promote"
}

show_version() {
    echo "knowledge-sync.sh v${VERSION}"
}

# ═══════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════

log_msg() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    mkdir -p "$(dirname "$LOG_FILE")"
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"

    # Rotate: keep last MAX_LOG_LINES lines
    if [ -f "$LOG_FILE" ]; then
        local line_count
        line_count=$(wc -l < "$LOG_FILE" 2>/dev/null || echo "0")
        # Trim whitespace from wc output (macOS)
        line_count=$(echo "$line_count" | tr -d ' ')
        if [ "$line_count" -gt "$MAX_LOG_LINES" ]; then
            local tmp
            tmp=$(mktemp "$(dirname "$LOG_FILE")/.ksync-log.XXXXXX")
            chmod 600 "$tmp"
            tail -"$MAX_LOG_LINES" "$LOG_FILE" > "$tmp"
            mv "$tmp" "$LOG_FILE"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# CONFIG FILE MANAGEMENT
# ═══════════════════════════════════════════════════════════════

read_conf() {
    local key="$1"
    if [ ! -f "$CONF_FILE" ]; then
        echo ""
        return
    fi
    grep "^${key}=" "$CONF_FILE" 2>/dev/null | head -1 | sed "s/^${key}=//"
}

write_conf() {
    local key="$1"
    local value="$2"
    mkdir -p "$(dirname "$CONF_FILE")"

    if [ ! -f "$CONF_FILE" ]; then
        echo "${key}=${value}" > "$CONF_FILE"
        return
    fi

    if grep -q "^${key}=" "$CONF_FILE" 2>/dev/null; then
        # Replace existing key — use a temp file for macOS sed compatibility
        local tmp
        tmp=$(mktemp "$(dirname "$CONF_FILE")/.ksync-conf.XXXXXX")
        chmod 600 "$tmp"
        sed "s|^${key}=.*|${key}=${value}|" "$CONF_FILE" > "$tmp"
        mv "$tmp" "$CONF_FILE"
    else
        echo "${key}=${value}" >> "$CONF_FILE"
    fi
}

ensure_configured() {
    if [ ! -f "$CONF_FILE" ]; then
        echo -e "${RED}Knowledge sync not configured.${NC}"
        echo -e "Run: ${CYAN}./scripts/knowledge-sync.sh init <github-repo-url>${NC}"
        exit 1
    fi

    local url
    url=$(read_conf "KNOWLEDGE_REPO_URL")
    if [ -z "$url" ]; then
        echo -e "${RED}KNOWLEDGE_REPO_URL not set in $CONF_FILE${NC}"
        exit 1
    fi
}

get_repo_local() {
    local local_path
    local_path=$(read_conf "KNOWLEDGE_REPO_LOCAL")
    if [ -z "$local_path" ]; then
        local_path="$HOME/.claude-knowledge"
    fi
    echo "$local_path"
}

get_project_name() {
    local name
    name=$(read_conf "PROJECT_NAME")
    if [ -z "$name" ]; then
        name=$(basename "$FRAMEWORK_DIR")
    fi
    echo "$name"
}

# ═══════════════════════════════════════════════════════════════
# PID FILE MANAGEMENT
# ═══════════════════════════════════════════════════════════════

is_daemon_running() {
    if [ ! -f "$PID_FILE" ]; then
        return 1
    fi

    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -z "$pid" ]; then
        rm -f "$PID_FILE"
        return 1
    fi

    # Check if the process is still alive
    if kill -0 "$pid" 2>/dev/null; then
        return 0
    fi

    # Stale PID file — process no longer running
    log_msg "WARN" "Stale PID file found (PID $pid no longer running), cleaning up"
    rm -f "$PID_FILE"
    return 1
}

cleanup_pid() {
    rm -f "$PID_FILE"
}

# ═══════════════════════════════════════════════════════════════
# INIT — Configure the knowledge repository
# ═══════════════════════════════════════════════════════════════

cmd_init() {
    local repo_url="${1:-}"

    if [ -z "$repo_url" ]; then
        echo -e "${RED}Usage: knowledge-sync.sh init <github-repo-url>${NC}"
        echo ""
        echo "Examples:"
        echo "  knowledge-sync.sh init https://github.com/user/dev-memory.git"
        echo "  knowledge-sync.sh init git@github.com:user/dev-memory.git"
        exit 1
    fi

    echo -e "${BOLD}${CYAN}KNOWLEDGE SYNC INIT${NC}"
    echo "═══════════════════════════════════════════════════════"

    local local_path="$HOME/.claude-knowledge"
    local project_name
    project_name=$(basename "$FRAMEWORK_DIR")
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Write the config file
    mkdir -p "$(dirname "$CONF_FILE")"
    cat > "$CONF_FILE" <<CONFEOF
KNOWLEDGE_REPO_URL=${repo_url}
KNOWLEDGE_REPO_LOCAL=${local_path}
PROJECT_NAME=${project_name}
LAST_SYNC=
SYNC_COUNT=0
CONFEOF

    echo -e "${GREEN}[OK]${NC} Config written to $CONF_FILE"
    echo "  Repo URL:     $repo_url"
    echo "  Local clone:  $local_path"
    echo "  Project name: $project_name"

    # Clone or verify the local clone
    echo ""
    if [ -d "$local_path/.git" ]; then
        echo -e "${BLUE}Local clone already exists at $local_path${NC}"
        # Verify the remote matches
        local existing_remote
        existing_remote=$(git -C "$local_path" remote get-url origin 2>/dev/null || echo "")
        if [ "$existing_remote" != "$repo_url" ]; then
            echo -e "${YELLOW}Remote URL mismatch. Updating origin to $repo_url${NC}"
            git -C "$local_path" remote set-url origin "$repo_url"
            echo -e "${GREEN}[OK]${NC} Remote updated"
        else
            echo -e "${GREEN}[OK]${NC} Remote matches"
        fi
        # Pull latest
        echo -e "${BLUE}Pulling latest changes...${NC}"
        if git -C "$local_path" pull --rebase origin main 2>/dev/null || git -C "$local_path" pull --rebase origin master 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} Pulled latest"
        else
            echo -e "${YELLOW}[WARN]${NC} Could not pull (may be empty or offline)"
        fi
    else
        echo -e "${BLUE}Cloning knowledge repo...${NC}"
        if git clone "$repo_url" "$local_path" 2>/dev/null; then
            echo -e "${GREEN}[OK]${NC} Cloned to $local_path"
        else
            # Repo might not exist yet — try creating with gh CLI
            echo -e "${YELLOW}Clone failed. Attempting to create with gh CLI...${NC}"
            local repo_name
            # Extract owner/repo from URL patterns
            repo_name=$(echo "$repo_url" | sed -E 's#.*[:/]([^/]+/[^/]+?)(\.git)?$#\1#')

            if command -v gh >/dev/null 2>&1; then
                if gh repo create "$repo_name" --private --description "SkillFoundry Knowledge Repository" 2>/dev/null; then
                    echo -e "${GREEN}[OK]${NC} Created remote repo: $repo_name"
                    sleep 2
                    if git clone "$repo_url" "$local_path" 2>/dev/null; then
                        echo -e "${GREEN}[OK]${NC} Cloned to $local_path"
                    else
                        # Initialize locally and set remote
                        mkdir -p "$local_path"
                        git -C "$local_path" init
                        git -C "$local_path" remote add origin "$repo_url"
                        echo -e "${GREEN}[OK]${NC} Initialized local repo with remote"
                    fi
                else
                    echo -e "${YELLOW}Could not create repo via gh. Initializing locally.${NC}"
                    mkdir -p "$local_path"
                    git -C "$local_path" init
                    git -C "$local_path" remote add origin "$repo_url"
                    echo -e "${GREEN}[OK]${NC} Initialized local repo with remote"
                fi
            else
                echo -e "${YELLOW}gh CLI not found. Initializing locally.${NC}"
                mkdir -p "$local_path"
                git -C "$local_path" init
                git -C "$local_path" remote add origin "$repo_url"
                echo -e "${GREEN}[OK]${NC} Initialized local repo with remote"
                echo -e "${YELLOW}You must create the remote repo manually: $repo_url${NC}"
            fi
        fi
    fi

    # Create the repo scaffold if it does not exist
    scaffold_repo "$local_path"

    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo -e "${GREEN}Knowledge sync initialized.${NC}"
    echo ""
    echo "Next steps:"
    echo -e "  ${CYAN}./scripts/knowledge-sync.sh register${NC}            # Register this project"
    echo -e "  ${CYAN}./scripts/knowledge-sync.sh sync${NC}                # Run a manual sync"
    echo -e "  ${CYAN}./scripts/knowledge-sync.sh start${NC}               # Start the daemon"
    log_msg "INFO" "Initialized with repo $repo_url"
}

scaffold_repo() {
    local repo_dir="$1"

    mkdir -p "$repo_dir/global"
    mkdir -p "$repo_dir/projects"

    # global/preferences.json
    if [ ! -f "$repo_dir/global/preferences.json" ]; then
        cat > "$repo_dir/global/preferences.json" <<'SCAFFOLDEOF'
{
  "editor": "vscode",
  "theme": "dark",
  "language": "en",
  "updated_at": ""
}
SCAFFOLDEOF
    fi

    # global/lessons.jsonl
    if [ ! -f "$repo_dir/global/lessons.jsonl" ]; then
        touch "$repo_dir/global/lessons.jsonl"
    fi

    # global/tech-stack.json
    if [ ! -f "$repo_dir/global/tech-stack.json" ]; then
        cat > "$repo_dir/global/tech-stack.json" <<'SCAFFOLDEOF'
{
  "languages": [],
  "frameworks": [],
  "databases": [],
  "tools": [],
  "updated_at": ""
}
SCAFFOLDEOF
    fi

    # global/anti-patterns.jsonl
    if [ ! -f "$repo_dir/global/anti-patterns.jsonl" ]; then
        touch "$repo_dir/global/anti-patterns.jsonl"
    fi

    # EVOLUTION.md
    if [ ! -f "$repo_dir/EVOLUTION.md" ]; then
        cat > "$repo_dir/EVOLUTION.md" <<'SCAFFOLDEOF'
# Knowledge Evolution Log

Tracks how global knowledge evolves over time via promotions and corrections.

| Date | Action | Source | Entry |
|------|--------|--------|-------|
SCAFFOLDEOF
    fi

    # .sync-meta.json
    if [ ! -f "$repo_dir/.sync-meta.json" ]; then
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        cat > "$repo_dir/.sync-meta.json" <<SCAFFOLDEOF
{
  "created_at": "$now",
  "schema_version": "1.0.0",
  "registered_projects": [],
  "total_syncs": 0
}
SCAFFOLDEOF
    fi

    # Commit scaffold if there are changes
    if [ -d "$repo_dir/.git" ]; then
        git -C "$repo_dir" add -A 2>/dev/null || true
        if ! git -C "$repo_dir" diff --cached --quiet 2>/dev/null; then
            git -C "$repo_dir" commit -m "scaffold: initialize dev-memory repo structure" 2>/dev/null || true
            local branch
            branch=$(git -C "$repo_dir" branch --show-current 2>/dev/null || echo "main")
            git -C "$repo_dir" push -u origin "$branch" 2>/dev/null || true
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# REGISTER — Register a project in the global knowledge repo
# ═══════════════════════════════════════════════════════════════

cmd_register() {
    local project_dir="${1:-$(pwd)}"
    ensure_configured

    # Resolve to absolute path
    if [ ! -d "$project_dir" ]; then
        echo -e "${RED}Directory not found: $project_dir${NC}"
        exit 1
    fi
    project_dir="$(cd "$project_dir" && pwd)"

    local project_name
    project_name=$(basename "$project_dir")
    local repo_local
    repo_local=$(get_repo_local)

    echo -e "${BOLD}${CYAN}REGISTER PROJECT${NC}"
    echo "═══════════════════════════════════════════════════════"
    echo "Project: $project_name"
    echo "Path:    $project_dir"
    echo ""

    if [ ! -d "$repo_local" ]; then
        echo -e "${RED}Knowledge repo not found at $repo_local${NC}"
        echo -e "Run: ${CYAN}./scripts/knowledge-sync.sh init <url>${NC}"
        exit 1
    fi

    # Create project directory structure in the knowledge repo
    local project_repo_dir="$repo_local/projects/$project_name"
    mkdir -p "$project_repo_dir/memory_bank/knowledge"
    mkdir -p "$project_repo_dir/relationships"
    mkdir -p "$project_repo_dir/sessions"

    # Create agent-stats.jsonl if it does not exist
    if [ ! -f "$project_repo_dir/agent-stats.jsonl" ]; then
        touch "$project_repo_dir/agent-stats.jsonl"
    fi

    echo -e "${GREEN}[OK]${NC} Created project structure in knowledge repo"

    # Update .sync-meta.json to register this project
    local meta_file="$repo_local/.sync-meta.json"
    if [ -f "$meta_file" ]; then
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        # Check if the project is already registered (simple grep check)
        if grep -q "\"$project_name\"" "$meta_file" 2>/dev/null; then
            echo -e "${YELLOW}Project '$project_name' already registered${NC}"
        else
            # Append to registered_projects array using sed (jq-free)
            # Find the line with "registered_projects" and insert after the opening bracket
            local tmp
            tmp=$(mktemp "$(dirname "$meta_file")/.sync-meta.XXXXXX")
            chmod 600 "$tmp"

            local found_array=false
            while IFS= read -r line; do
                echo "$line" >> "$tmp"
                if echo "$line" | grep -q '"registered_projects"' 2>/dev/null; then
                    found_array=true
                fi
                # After the opening bracket of registered_projects, insert the entry
                if [ "$found_array" = true ] && echo "$line" | grep -q '\[' 2>/dev/null; then
                    # Check if the array is empty
                    if echo "$line" | grep -q '\[\]' 2>/dev/null; then
                        # Replace the last line (which has []) with the new content
                        local tmp2
                        tmp2=$(mktemp "$(dirname "$meta_file")/.sync-meta2.XXXXXX")
                        chmod 600 "$tmp2"
                        # Remove the last line from tmp and rewrite
                        local total_lines
                        total_lines=$(wc -l < "$tmp" | tr -d ' ')
                        head -$((total_lines - 1)) "$tmp" > "$tmp2"
                        echo "  \"registered_projects\": [\"$project_name\"]," >> "$tmp2"
                        mv "$tmp2" "$tmp"
                    else
                        # Non-empty array: add entry after [
                        echo "    \"$project_name\"," >> "$tmp"
                    fi
                    found_array=false
                fi
            done < "$meta_file"
            mv "$tmp" "$meta_file"
            echo -e "${GREEN}[OK]${NC} Registered '$project_name' in .sync-meta.json"
        fi
    fi

    # Commit the registration
    git -C "$repo_local" add -A 2>/dev/null || true
    if ! git -C "$repo_local" diff --cached --quiet 2>/dev/null; then
        git -C "$repo_local" commit -m "register: $project_name" 2>/dev/null || true
        local branch
        branch=$(git -C "$repo_local" branch --show-current 2>/dev/null || echo "main")
        git -C "$repo_local" push origin "$branch" 2>/dev/null || true
        echo -e "${GREEN}[OK]${NC} Committed and pushed registration"
    fi

    echo ""
    echo -e "${GREEN}Project registered.${NC}"
    log_msg "INFO" "Registered project: $project_name ($project_dir)"
}

# ═══════════════════════════════════════════════════════════════
# CHANGE DETECTION
# ═══════════════════════════════════════════════════════════════

detect_changes() {
    # Returns 0 (true) if there are changes since last sync, 1 otherwise.
    # Checks: memory_bank/, logs/sessions/, scratchpads/, .claude/agent-stats.jsonl

    local last_sync_epoch=0
    if [ -f "$LAST_SYNC_MARKER" ]; then
        last_sync_epoch=$(cat "$LAST_SYNC_MARKER" 2>/dev/null || echo "0")
        last_sync_epoch=$(echo "$last_sync_epoch" | tr -d ' ')
    fi

    local dirs_to_check=""
    local files_to_check=""

    # Build list of directories to scan
    if [ -d "$FRAMEWORK_DIR/memory_bank" ]; then
        dirs_to_check="$FRAMEWORK_DIR/memory_bank"
    fi
    if [ -d "$FRAMEWORK_DIR/logs/sessions" ]; then
        dirs_to_check="$dirs_to_check $FRAMEWORK_DIR/logs/sessions"
    fi
    if [ -d "$FRAMEWORK_DIR/scratchpads" ]; then
        dirs_to_check="$dirs_to_check $FRAMEWORK_DIR/scratchpads"
    fi

    # Individual files
    if [ -f "$FRAMEWORK_DIR/.claude/agent-stats.jsonl" ]; then
        files_to_check="$FRAMEWORK_DIR/.claude/agent-stats.jsonl"
    fi

    if [ -z "$dirs_to_check" ] && [ -z "$files_to_check" ]; then
        return 1
    fi

    # Use find to detect files newer than the marker
    local changed_count=0

    for dir in $dirs_to_check; do
        if [ -d "$dir" ]; then
            local count
            if [ "$last_sync_epoch" -gt 0 ] && [ -f "$LAST_SYNC_MARKER" ]; then
                count=$(find "$dir" -type f -newer "$LAST_SYNC_MARKER" 2>/dev/null | wc -l | tr -d ' ')
            else
                # First sync — all files are "changed"
                count=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
            fi
            changed_count=$((changed_count + count))
        fi
    done

    for f in $files_to_check; do
        if [ -f "$f" ]; then
            if [ "$last_sync_epoch" -gt 0 ] && [ -f "$LAST_SYNC_MARKER" ]; then
                local count
                count=$(find "$f" -newer "$LAST_SYNC_MARKER" 2>/dev/null | wc -l | tr -d ' ')
                changed_count=$((changed_count + count))
            else
                changed_count=$((changed_count + 1))
            fi
        fi
    done

    if [ "$changed_count" -gt 0 ]; then
        return 0
    fi
    return 1
}

collect_changed_files() {
    # Outputs a list of changed files (one per line) relative to FRAMEWORK_DIR
    local dirs_to_check=""

    if [ -d "$FRAMEWORK_DIR/memory_bank" ]; then
        dirs_to_check="$FRAMEWORK_DIR/memory_bank"
    fi
    if [ -d "$FRAMEWORK_DIR/logs/sessions" ]; then
        dirs_to_check="$dirs_to_check $FRAMEWORK_DIR/logs/sessions"
    fi
    if [ -d "$FRAMEWORK_DIR/scratchpads" ]; then
        dirs_to_check="$dirs_to_check $FRAMEWORK_DIR/scratchpads"
    fi

    for dir in $dirs_to_check; do
        if [ -d "$dir" ]; then
            if [ -f "$LAST_SYNC_MARKER" ]; then
                find "$dir" -type f -newer "$LAST_SYNC_MARKER" 2>/dev/null || true
            else
                find "$dir" -type f 2>/dev/null || true
            fi
        fi
    done

    # Individual files
    if [ -f "$FRAMEWORK_DIR/.claude/agent-stats.jsonl" ]; then
        if [ -f "$LAST_SYNC_MARKER" ]; then
            find "$FRAMEWORK_DIR/.claude/agent-stats.jsonl" -newer "$LAST_SYNC_MARKER" 2>/dev/null || true
        else
            echo "$FRAMEWORK_DIR/.claude/agent-stats.jsonl"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# SANITIZATION
# ═══════════════════════════════════════════════════════════════

sanitize_directory() {
    # Sanitize all files in a staging directory.
    # If sanitize-knowledge.sh exists in the framework, use it.
    # Otherwise, apply built-in sanitization.
    local staging_dir="$1"

    if [ -x "$SCRIPT_DIR/sanitize-knowledge.sh" ]; then
        "$SCRIPT_DIR/sanitize-knowledge.sh" "$staging_dir"
        return $?
    fi

    # Built-in sanitization: strip secrets, API keys, tokens, passwords
    local sensitive_patterns="password|passwd|api_key|apikey|api-key|secret|token|bearer|authorization|credential|private_key|private-key|ssh-rsa|BEGIN RSA|BEGIN PRIVATE|BEGIN OPENSSH"

    while IFS= read -r file; do
        if [ -z "$file" ]; then continue; fi
        # Only sanitize text files
        if file "$file" 2>/dev/null | grep -q "text"; then
            local tmp
            tmp=$(mktemp "$(dirname "$file")/.sanitize.XXXXXX")
            chmod 600 "$tmp"
            # Redact lines that contain sensitive patterns with actual values
            sed -E "s/(${sensitive_patterns})[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_.\/+=-]{8,}[\"']?/\1=[REDACTED]/gi" "$file" > "$tmp"
            mv "$tmp" "$file"
        fi
    done <<EOF
$(find "$staging_dir" -type f 2>/dev/null)
EOF
}

# ═══════════════════════════════════════════════════════════════
# SYNC CYCLE — Core logic
# ═══════════════════════════════════════════════════════════════

run_sync_cycle() {
    local repo_local
    repo_local=$(get_repo_local)
    local project_name
    project_name=$(get_project_name)
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Step 1: Check for changes
    if ! detect_changes; then
        log_msg "INFO" "No changes detected, skipping sync"
        return 0
    fi

    log_msg "INFO" "Changes detected, starting sync cycle"

    # Verify repo exists
    if [ ! -d "$repo_local/.git" ]; then
        log_msg "ERROR" "Knowledge repo not found at $repo_local"
        return 1
    fi

    # Step 2: Pull latest from knowledge repo first (to avoid conflicts)
    local branch
    branch=$(git -C "$repo_local" branch --show-current 2>/dev/null || echo "main")
    if [ -z "$branch" ]; then
        branch="main"
    fi
    git -C "$repo_local" pull --rebase origin "$branch" 2>/dev/null || true

    # Step 3: Create staging directory
    local staging_dir
    staging_dir=$(mktemp -d "${TMPDIR:-/tmp}/knowledge-sync-staging.XXXXXX")
    # Ensure cleanup on exit from this function
    trap "rm -rf '$staging_dir'" RETURN

    # Step 4: Collect changed files into staging
    local changed_file_count=0
    while IFS= read -r abs_path; do
        if [ -z "$abs_path" ]; then continue; fi
        if [ ! -f "$abs_path" ]; then continue; fi

        # Compute relative path from FRAMEWORK_DIR
        local rel_path
        rel_path=$(echo "$abs_path" | sed "s|^${FRAMEWORK_DIR}/||")

        # Create parent directory in staging
        local staging_dest="$staging_dir/$rel_path"
        mkdir -p "$(dirname "$staging_dest")"
        cp "$abs_path" "$staging_dest"
        changed_file_count=$((changed_file_count + 1))
    done <<EOF
$(collect_changed_files)
EOF

    if [ "$changed_file_count" -eq 0 ]; then
        log_msg "INFO" "No files collected for sync"
        return 0
    fi

    log_msg "INFO" "Collected $changed_file_count file(s) for sync"

    # Step 5: Sanitize the staging directory
    sanitize_directory "$staging_dir"
    log_msg "INFO" "Sanitization complete"

    # Step 6: Copy sanitized files to the knowledge repo
    local project_repo_dir="$repo_local/projects/$project_name"
    mkdir -p "$project_repo_dir"

    # Copy each file from staging into the project directory in the knowledge repo
    while IFS= read -r staged_file; do
        if [ -z "$staged_file" ]; then continue; fi
        if [ ! -f "$staged_file" ]; then continue; fi

        local rel_path
        rel_path=$(echo "$staged_file" | sed "s|^${staging_dir}/||")

        # Determine destination based on the source path
        local dest_path=""
        case "$rel_path" in
            memory_bank/knowledge/*)
                dest_path="$project_repo_dir/memory_bank/knowledge/$(basename "$rel_path")"
                ;;
            memory_bank/relationships/*)
                dest_path="$project_repo_dir/relationships/$(basename "$rel_path")"
                ;;
            memory_bank/*)
                dest_path="$project_repo_dir/memory_bank/$(echo "$rel_path" | sed 's|^memory_bank/||')"
                ;;
            logs/sessions/*)
                dest_path="$project_repo_dir/sessions/$(echo "$rel_path" | sed 's|^logs/sessions/||')"
                ;;
            scratchpads/*)
                dest_path="$project_repo_dir/$rel_path"
                ;;
            .claude/agent-stats.jsonl)
                dest_path="$project_repo_dir/agent-stats.jsonl"
                ;;
            *)
                dest_path="$project_repo_dir/$rel_path"
                ;;
        esac

        if [ -n "$dest_path" ]; then
            mkdir -p "$(dirname "$dest_path")"
            cp "$staged_file" "$dest_path"
        fi
    done <<EOF
$(find "$staging_dir" -type f 2>/dev/null)
EOF

    # Step 7: Git add, commit, push
    git -C "$repo_local" add -A 2>/dev/null || true
    if git -C "$repo_local" diff --cached --quiet 2>/dev/null; then
        log_msg "INFO" "No effective changes after sanitization"
    else
        git -C "$repo_local" commit -m "sync: $project_name $now" 2>/dev/null
        if git -C "$repo_local" push origin "$branch" 2>/dev/null; then
            log_msg "INFO" "Pushed sync commit to origin/$branch"
        else
            log_msg "WARN" "Push failed (offline or auth issue). Commit saved locally."
        fi
    fi

    # Step 8: Check if global/ has updates
    local global_lessons="$repo_local/global/lessons.jsonl"
    if [ -f "$global_lessons" ] && [ -s "$global_lessons" ]; then
        local local_lessons_dir="$FRAMEWORK_DIR/memory_bank/knowledge"
        mkdir -p "$local_lessons_dir"
        local local_lessons="$local_lessons_dir/global-lessons.jsonl"

        # Check if the global lessons file is newer than our local copy
        local should_copy=false
        if [ ! -f "$local_lessons" ]; then
            should_copy=true
        elif [ "$global_lessons" -nt "$local_lessons" ]; then
            should_copy=true
        fi

        if [ "$should_copy" = true ]; then
            cp "$global_lessons" "$local_lessons"
            log_msg "INFO" "Updated local global-lessons.jsonl from global/lessons.jsonl"
        fi
    fi

    # Step 9: Update sync marker and config
    date +%s > "$LAST_SYNC_MARKER"
    write_conf "LAST_SYNC" "$now"

    local sync_count
    sync_count=$(read_conf "SYNC_COUNT")
    if [ -z "$sync_count" ]; then
        sync_count=0
    fi
    sync_count=$((sync_count + 1))
    write_conf "SYNC_COUNT" "$sync_count"

    log_msg "INFO" "Sync cycle complete ($changed_file_count files, total syncs: $sync_count)"
    return 0
}

# ═══════════════════════════════════════════════════════════════
# SYNC — One-shot manual sync (foreground)
# ═══════════════════════════════════════════════════════════════

cmd_sync() {
    ensure_configured

    echo -e "${BOLD}${CYAN}KNOWLEDGE SYNC${NC}"
    echo "═══════════════════════════════════════════════════════"

    local project_name
    project_name=$(get_project_name)
    local repo_url
    repo_url=$(read_conf "KNOWLEDGE_REPO_URL")
    echo "Project: $project_name"
    echo "Repo:    $repo_url"
    echo ""

    if run_sync_cycle; then
        local last_sync
        last_sync=$(read_conf "LAST_SYNC")
        if [ -n "$last_sync" ]; then
            echo -e "${GREEN}[OK]${NC} Sync complete at $last_sync"
        else
            echo -e "${GREEN}[OK]${NC} No changes to sync"
        fi
    else
        echo -e "${RED}[FAIL]${NC} Sync failed. Check log: $LOG_FILE"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# START — Start the background daemon
# ═══════════════════════════════════════════════════════════════

cmd_start() {
    local if_not_running=false
    local arg
    for arg in "$@"; do
        case "$arg" in
            --if-not-running) if_not_running=true ;;
        esac
    done

    ensure_configured

    if is_daemon_running; then
        local pid
        pid=$(cat "$PID_FILE")
        if [ "$if_not_running" = true ]; then
            echo -e "${YELLOW}Daemon already running (PID $pid), skipping start.${NC}"
            return 0
        fi
        echo -e "${YELLOW}Daemon already running (PID $pid).${NC}"
        echo "Use 'stop' first, or 'start --if-not-running' to skip."
        return 0
    fi

    echo -e "${BOLD}${CYAN}KNOWLEDGE SYNC DAEMON${NC}"
    echo "═══════════════════════════════════════════════════════"

    mkdir -p "$(dirname "$PID_FILE")"
    mkdir -p "$(dirname "$LOG_FILE")"

    # Launch daemon as a background subshell
    (
        # Write own PID
        echo $$ > "$PID_FILE"

        # Trap signals for clean shutdown
        trap 'cleanup_pid; exit 0' INT TERM HUP

        log_msg "INFO" "Daemon started (PID $$, interval ${SYNC_INTERVAL}s)"

        while true; do
            # Relax set -e inside the loop so a single failure does not kill the daemon
            set +e
            run_sync_cycle
            local cycle_exit=$?
            set -e

            if [ "$cycle_exit" -ne 0 ]; then
                log_msg "ERROR" "Sync cycle failed with exit code $cycle_exit"
            fi

            sleep "$SYNC_INTERVAL"
        done
    ) &

    local daemon_pid=$!
    # Brief pause to let the subshell write its PID file
    sleep 1

    local project_name
    project_name=$(get_project_name)

    echo -e "${GREEN}[OK]${NC} Daemon started"
    echo "  PID:      $daemon_pid"
    echo "  Interval: ${SYNC_INTERVAL}s ($(( SYNC_INTERVAL / 60 )) minutes)"
    echo "  Project:  $project_name"
    echo "  Log:      $LOG_FILE"
    echo ""
    echo "  Stop:     ./scripts/knowledge-sync.sh stop"
    echo "  Status:   ./scripts/knowledge-sync.sh status"
    log_msg "INFO" "Daemon launched from CLI (PID $daemon_pid)"
}

# ═══════════════════════════════════════════════════════════════
# STOP — Stop the daemon gracefully
# ═══════════════════════════════════════════════════════════════

cmd_stop() {
    if ! is_daemon_running; then
        echo -e "${YELLOW}Daemon not running.${NC}"
        return 0
    fi

    local pid
    pid=$(cat "$PID_FILE")

    echo -e "${BOLD}${CYAN}STOPPING DAEMON${NC}"
    echo "═══════════════════════════════════════════════════════"

    kill "$pid" 2>/dev/null || true

    # Wait briefly for the process to die
    local wait_count=0
    while kill -0 "$pid" 2>/dev/null && [ "$wait_count" -lt 10 ]; do
        sleep 1
        wait_count=$((wait_count + 1))
    done

    # Force kill if still alive
    if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
        log_msg "WARN" "Daemon PID $pid did not stop gracefully, sent SIGKILL"
    fi

    rm -f "$PID_FILE"
    log_msg "INFO" "Daemon stopped (was PID $pid)"
    echo -e "${GREEN}[OK]${NC} Daemon stopped (was PID $pid)"
}

# ═══════════════════════════════════════════════════════════════
# STATUS — Show daemon status
# ═══════════════════════════════════════════════════════════════

cmd_status() {
    echo -e "${BOLD}${CYAN}KNOWLEDGE SYNC STATUS${NC}"
    echo "═══════════════════════════════════════════════════════"

    # Config
    if [ ! -f "$CONF_FILE" ]; then
        echo -e "  Config:     ${YELLOW}Not configured${NC}"
        echo -e "  Run: ${CYAN}./scripts/knowledge-sync.sh init <github-repo-url>${NC}"
        return 0
    fi

    local repo_url
    repo_url=$(read_conf "KNOWLEDGE_REPO_URL")
    local repo_local
    repo_local=$(get_repo_local)
    local project_name
    project_name=$(get_project_name)
    local last_sync
    last_sync=$(read_conf "LAST_SYNC")
    local sync_count
    sync_count=$(read_conf "SYNC_COUNT")

    echo -e "  Repo URL:    ${BOLD}$repo_url${NC}"
    echo -e "  Local clone: $repo_local"
    echo -e "  Project:     ${BOLD}$project_name${NC}"
    echo -e "  Last sync:   ${last_sync:-never}"
    echo -e "  Total syncs: ${sync_count:-0}"
    echo -e "  Interval:    ${SYNC_INTERVAL}s ($(( SYNC_INTERVAL / 60 )) min)"
    echo ""

    # Daemon status
    if is_daemon_running; then
        local pid
        pid=$(cat "$PID_FILE")
        echo -e "  Daemon:      ${GREEN}Running${NC} (PID $pid)"
    else
        echo -e "  Daemon:      ${YELLOW}Stopped${NC}"
    fi

    # Repo health
    if [ -d "$repo_local/.git" ]; then
        echo -e "  Repo clone:  ${GREEN}Present${NC}"
        # Check connectivity
        if git -C "$repo_local" ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
            echo -e "  Remote:      ${GREEN}Reachable${NC}"
        else
            echo -e "  Remote:      ${YELLOW}Unreachable${NC}"
        fi

        # Count projects
        local project_count=0
        if [ -d "$repo_local/projects" ]; then
            project_count=$(find "$repo_local/projects" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
        fi

        # Count global lessons
        local lesson_count=0
        if [ -f "$repo_local/global/lessons.jsonl" ]; then
            lesson_count=$(wc -l < "$repo_local/global/lessons.jsonl" 2>/dev/null | tr -d ' ')
        fi

        echo ""
        echo -e "  ${BOLD}Knowledge Repo:${NC}"
        echo -e "    Projects:  $project_count"
        echo -e "    Lessons:   $lesson_count"
    else
        echo -e "  Repo clone:  ${RED}Missing${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# PROMOTE — Promote recurring error patterns to global lessons
# ═══════════════════════════════════════════════════════════════

cmd_promote() {
    ensure_configured

    local repo_local
    repo_local=$(get_repo_local)

    echo -e "${BOLD}${CYAN}KNOWLEDGE PROMOTION${NC}"
    echo "═══════════════════════════════════════════════════════"

    if [ ! -d "$repo_local/projects" ]; then
        echo -e "${YELLOW}No projects found in knowledge repo.${NC}"
        return 0
    fi

    local global_lessons="$repo_local/global/lessons.jsonl"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local promoted_count=0

    # Pull latest first
    local branch
    branch=$(git -C "$repo_local" branch --show-current 2>/dev/null || echo "main")
    git -C "$repo_local" pull --rebase origin "$branch" 2>/dev/null || true

    # Collect all error patterns from all projects' errors.jsonl files
    # We gather error "category" or "error" fields and count occurrences
    local all_errors_tmp
    all_errors_tmp=$(mktemp "${TMPDIR:-/tmp}/ksync-errors.XXXXXX")
    chmod 600 "$all_errors_tmp"

    # Gather errors from all projects
    while IFS= read -r errors_file; do
        if [ -z "$errors_file" ]; then continue; fi
        if [ ! -f "$errors_file" ]; then continue; fi
        # Extract the error pattern or category from each line
        # Try to extract a "pattern" or "error" or "category" field
        while IFS= read -r line; do
            if [ -z "$line" ]; then continue; fi
            # Try to extract a short pattern: use the "error" or "category" or "pattern" field
            local pattern=""
            # Extract error field — simple grep/sed approach (jq-free)
            pattern=$(echo "$line" | sed -n 's/.*"error"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
            if [ -z "$pattern" ]; then
                pattern=$(echo "$line" | sed -n 's/.*"pattern"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
            fi
            if [ -z "$pattern" ]; then
                pattern=$(echo "$line" | sed -n 's/.*"category"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
            fi
            if [ -n "$pattern" ]; then
                echo "$pattern" >> "$all_errors_tmp"
            fi
        done < "$errors_file"
    done <<EOF
$(find "$repo_local/projects" -path "*/memory_bank/knowledge/errors.jsonl" -type f 2>/dev/null)
EOF

    if [ ! -s "$all_errors_tmp" ]; then
        echo -e "${YELLOW}No error patterns found across projects.${NC}"
        rm -f "$all_errors_tmp"
        return 0
    fi

    # Count occurrences, find patterns appearing 3+ times
    # sort | uniq -c | sort -rn — works on bash 3.2
    local frequent_tmp
    frequent_tmp=$(mktemp "${TMPDIR:-/tmp}/ksync-frequent.XXXXXX")
    chmod 600 "$frequent_tmp"

    sort "$all_errors_tmp" | uniq -c | sort -rn | while IFS= read -r count_line; do
        local count
        count=$(echo "$count_line" | awk '{print $1}')
        local pattern
        pattern=$(echo "$count_line" | sed 's/^[[:space:]]*[0-9]*[[:space:]]*//')

        if [ "$count" -ge 3 ] && [ -n "$pattern" ]; then
            echo "${count}|${pattern}" >> "$frequent_tmp"
        fi
    done

    if [ ! -s "$frequent_tmp" ]; then
        echo -e "${YELLOW}No error patterns found with 3+ occurrences.${NC}"
        rm -f "$all_errors_tmp" "$frequent_tmp"
        return 0
    fi

    echo -e "Found patterns with 3+ occurrences:"
    echo ""

    while IFS= read -r entry; do
        if [ -z "$entry" ]; then continue; fi
        local count
        count=$(echo "$entry" | cut -d'|' -f1)
        local pattern
        pattern=$(echo "$entry" | cut -d'|' -f2-)

        # Check if this pattern is already in global lessons
        if grep -qF "$pattern" "$global_lessons" 2>/dev/null; then
            echo -e "  ${YELLOW}[SKIP]${NC} Already promoted: $pattern ($count occurrences)"
            continue
        fi

        # Escape the pattern for JSON
        local escaped_pattern
        escaped_pattern=$(echo "$pattern" | sed 's/"/\\"/g; s/\\/\\\\/g')

        # Append to global/lessons.jsonl
        echo "{\"type\":\"promoted_error\",\"pattern\":\"$escaped_pattern\",\"occurrences\":$count,\"promoted_at\":\"$now\",\"source\":\"cross-project-analysis\"}" >> "$global_lessons"
        promoted_count=$((promoted_count + 1))

        echo -e "  ${GREEN}[PROMOTED]${NC} $pattern ($count occurrences)"
    done < "$frequent_tmp"

    rm -f "$all_errors_tmp" "$frequent_tmp"

    # Log to EVOLUTION.md
    if [ "$promoted_count" -gt 0 ]; then
        local evolution_file="$repo_local/EVOLUTION.md"
        if [ -f "$evolution_file" ]; then
            local date_tag
            date_tag=$(date +"%Y-%m-%d")
            echo "| $date_tag | Promote | cross-project | $promoted_count error pattern(s) promoted to global lessons |" >> "$evolution_file"
        fi

        # Commit and push
        git -C "$repo_local" add -A 2>/dev/null || true
        if ! git -C "$repo_local" diff --cached --quiet 2>/dev/null; then
            git -C "$repo_local" commit -m "promote: $promoted_count error patterns to global lessons ($now)" 2>/dev/null
            if git -C "$repo_local" push origin "$branch" 2>/dev/null; then
                echo ""
                echo -e "${GREEN}[OK]${NC} Promoted $promoted_count pattern(s) and pushed to origin"
            else
                echo ""
                echo -e "${YELLOW}[WARN]${NC} Committed locally but push failed"
            fi
        fi
    fi

    echo ""
    echo -e "${GREEN}Promotion complete.${NC} $promoted_count new pattern(s) promoted."
    log_msg "INFO" "Promotion: $promoted_count patterns promoted to global/lessons.jsonl"
}

# ═══════════════════════════════════════════════════════════════
# LOG — Show last N lines of the sync log
# ═══════════════════════════════════════════════════════════════

cmd_log() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}No sync log yet.${NC}"
        echo "Run a sync or start the daemon first."
        return 0
    fi

    echo -e "${BOLD}${CYAN}KNOWLEDGE SYNC LOG${NC} (last 50 lines)"
    echo "═══════════════════════════════════════════════════════"
    tail -50 "$LOG_FILE"
}

# ═══════════════════════════════════════════════════════════════
# COMMAND DISPATCHER
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
    init)
        cmd_init "$@"
        ;;
    start)
        cmd_start "$@"
        ;;
    stop)
        cmd_stop
        ;;
    sync)
        cmd_sync
        ;;
    status)
        cmd_status
        ;;
    register)
        cmd_register "$@"
        ;;
    promote)
        cmd_promote
        ;;
    log)
        cmd_log
        ;;
    --help|-h|help)
        show_help
        ;;
    --version|-v)
        show_version
        ;;
    "")
        echo -e "${BOLD}Knowledge Sync Daemon${NC} v${VERSION}"
        echo ""
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands: init, start, stop, sync, status, register, promote, log"
        echo ""
        echo "Run '$0 --help' for full usage."
        ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo "Run '$0 --help' for usage."
        exit 1
        ;;
esac

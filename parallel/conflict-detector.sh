#!/bin/bash

# Conflict Detector - Real-time file conflict detection for swarm agents
# Implements FR-014 (Conflict Detection)
# Detects when multiple agents touch the same file and resolves conflicts
#
# USAGE:
#   ./parallel/conflict-detector.sh register --task=TASK_ID --files=f1,f2
#   ./parallel/conflict-detector.sh release --task=TASK_ID
#   ./parallel/conflict-detector.sh check --files=f1,f2
#   ./parallel/conflict-detector.sh status
#   ./parallel/conflict-detector.sh resolve --file=FILE [--strategy=serialize|skip] [--force]
#   ./parallel/conflict-detector.sh list [--json]
#   ./parallel/conflict-detector.sh --help

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
SWARM_DIR="${SWARM_DIR:-.claude/swarm}"
LOCKS_FILE=""
CONFLICTS_FILE=""
LOCK_FILE=""
FORCE="${FORCE:-false}"
JSON_OUTPUT=false

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Conflict Detector - File conflict detection for swarm agents"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/conflict-detector.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  register                Register files that a task will touch"
    echo "  release                 Release file locks for a completed task"
    echo "  check                   Check if files have conflicts with active tasks"
    echo "  status                  Show conflict detection summary"
    echo "  resolve                 Resolve a detected conflict"
    echo "  list                    List all active file locks"
    echo ""
    echo "OPTIONS:"
    echo "  --task=TASK_ID          Task identifier"
    echo "  --files=f1,f2           Comma-separated file paths"
    echo "  --file=FILE             Single file path (for resolve)"
    echo "  --strategy=STRATEGY     Resolution strategy: serialize (default), skip"
    echo "  --dir=PATH              Swarm directory (default: .claude/swarm)"
    echo "  --json                  Output in JSON format"
    echo "  --force                 Skip confirmation prompts"
    echo "  --help                  Show this help message"
    echo ""
    echo "RESOLUTION STRATEGIES:"
    echo "  serialize               Queue the conflicting task to run after the current holder"
    echo "  skip                    Skip the conflicting file (task proceeds without it)"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/conflict-detector.sh register --task=STORY-001 --files=src/auth.ts,src/types.ts"
    echo "  ./parallel/conflict-detector.sh check --files=src/auth.ts"
    echo "  ./parallel/conflict-detector.sh resolve --file=src/auth.ts --strategy=serialize"
    echo "  ./parallel/conflict-detector.sh release --task=STORY-001"
    echo "  ./parallel/conflict-detector.sh status"
}

# Parse arguments
COMMAND=""
TASK_ID=""
FILES=""
SINGLE_FILE=""
STRATEGY="serialize"

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --task=*) TASK_ID="${arg#--task=}" ;;
        --files=*) FILES="${arg#--files=}" ;;
        --file=*) SINGLE_FILE="${arg#--file=}" ;;
        --strategy=*) STRATEGY="${arg#--strategy=}" ;;
        --dir=*) SWARM_DIR="${arg#--dir=}" ;;
        --json) JSON_OUTPUT=true ;;
        --force) FORCE=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$COMMAND" ] && COMMAND="$arg" ;;
    esac
done

# Set file paths
LOCKS_FILE="$SWARM_DIR/file-locks.jsonl"
CONFLICTS_FILE="$SWARM_DIR/conflicts.jsonl"
LOCK_FILE="$SWARM_DIR/.conflicts.lock"

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

acquire_lock() {
    mkdir -p "$SWARM_DIR"
    local lock_fd=202
    eval "exec $lock_fd>$LOCK_FILE"
    if command -v flock &>/dev/null; then
        flock -w 5 $lock_fd 2>/dev/null || {
            echo -e "${RED}[FAIL]${NC} Could not acquire conflict detector lock"
            exit 1
        }
    fi
}

release_lock() {
    local lock_fd=202
    eval "exec $lock_fd>&-" 2>/dev/null || true
}

json_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

# Find which task holds a lock on a file
find_lock_holder() {
    local file="$1"
    if [ ! -f "$LOCKS_FILE" ]; then
        return
    fi
    # Search for a lock entry containing this file
    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        if echo "$entry" | grep -q "\"$file\""; then
            json_field "$entry" "task_id"
            return
        fi
    done < "$LOCKS_FILE"
}

# Check if a file has an active lock
is_file_locked() {
    local file="$1"
    local holder
    holder=$(find_lock_holder "$file")
    [ -n "$holder" ]
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_register() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --task is required"
        exit 1
    fi
    if [ -z "$FILES" ]; then
        echo -e "${RED}[FAIL]${NC} --files is required"
        exit 1
    fi

    acquire_lock

    mkdir -p "$SWARM_DIR"
    touch "$LOCKS_FILE"
    touch "$CONFLICTS_FILE"

    local ts
    ts=$(now_ts)
    local conflicts_found=false
    local conflict_files=""

    # Check each file for existing locks
    IFS=',' read -ra file_array <<< "$FILES"
    for file in "${file_array[@]}"; do
        file=$(echo "$file" | xargs)  # trim whitespace
        local holder
        holder=$(find_lock_holder "$file")
        if [ -n "$holder" ] && [ "$holder" != "$TASK_ID" ]; then
            conflicts_found=true
            conflict_files="$conflict_files $file(held by $holder)"

            # Record conflict
            local conflict_json="{\"id\":\"CONFLICT-$(date +%s%N | head -c 13)\",\"file\":\"$file\",\"holder_task\":\"$holder\",\"requesting_task\":\"$TASK_ID\",\"status\":\"detected\",\"resolution\":\"\",\"detected_at\":\"$ts\"}"
            echo "$conflict_json" >> "$CONFLICTS_FILE"
        fi
    done

    if [ "$conflicts_found" = true ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} File conflicts detected for task $TASK_ID:"
        for cf in $conflict_files; do
            echo -e "  ${YELLOW}$cf${NC}"
        done
        echo -e "${CYAN}[INFO]${NC} Use 'conflict-detector.sh resolve' to resolve"
        exit 1
    fi

    # No conflicts - register all file locks
    # Remove any existing entry for this task first
    if [ -s "$LOCKS_FILE" ]; then
        local tmp_file="$LOCKS_FILE.tmp"
        grep -v "\"task_id\":\"$TASK_ID\"" "$LOCKS_FILE" > "$tmp_file" 2>/dev/null || true
        mv "$tmp_file" "$LOCKS_FILE"
    fi

    # Build files JSON array
    local files_json=""
    for file in "${file_array[@]}"; do
        file=$(echo "$file" | xargs)
        if [ -n "$files_json" ]; then
            files_json="$files_json,\"$file\""
        else
            files_json="\"$file\""
        fi
    done

    local lock_json="{\"task_id\":\"$TASK_ID\",\"files\":[$files_json],\"registered_at\":\"$ts\"}"
    echo "$lock_json" >> "$LOCKS_FILE"

    release_lock

    echo -e "${GREEN}[PASS]${NC} File locks registered for task $TASK_ID (${#file_array[@]} files)"
}

cmd_release() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --task is required"
        exit 1
    fi
    if [ ! -f "$LOCKS_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} No locks to release"
        return 0
    fi

    acquire_lock

    local entry
    entry=$(grep "\"task_id\":\"$TASK_ID\"" "$LOCKS_FILE" 2>/dev/null | head -1)
    if [ -z "$entry" ]; then
        release_lock
        echo -e "${CYAN}[INFO]${NC} No locks held by task $TASK_ID"
        return 0
    fi

    # Remove the lock entry
    local tmp_file="$LOCKS_FILE.tmp"
    grep -v "\"task_id\":\"$TASK_ID\"" "$LOCKS_FILE" > "$tmp_file" 2>/dev/null || true
    mv "$tmp_file" "$LOCKS_FILE"

    release_lock

    echo -e "${GREEN}[PASS]${NC} File locks released for task $TASK_ID"
}

cmd_check() {
    if [ -z "$FILES" ]; then
        echo -e "${RED}[FAIL]${NC} --files is required"
        exit 1
    fi
    if [ ! -f "$LOCKS_FILE" ] || [ ! -s "$LOCKS_FILE" ]; then
        echo -e "${GREEN}[PASS]${NC} No active locks - all files available"
        return 0
    fi

    local has_conflict=false

    IFS=',' read -ra file_array <<< "$FILES"
    for file in "${file_array[@]}"; do
        file=$(echo "$file" | xargs)
        local holder
        holder=$(find_lock_holder "$file")
        if [ -n "$holder" ]; then
            has_conflict=true
            echo -e "${RED}[CONFLICT]${NC} $file is locked by task $holder"
        else
            echo -e "${GREEN}[FREE]${NC} $file is available"
        fi
    done

    if [ "$has_conflict" = true ]; then
        exit 1
    fi
}

cmd_resolve() {
    if [ -z "$SINGLE_FILE" ]; then
        echo -e "${RED}[FAIL]${NC} --file is required"
        exit 1
    fi

    # Validate strategy
    if [ "$STRATEGY" != "serialize" ] && [ "$STRATEGY" != "skip" ]; then
        echo -e "${RED}[FAIL]${NC} Invalid strategy: $STRATEGY (must be serialize or skip)"
        exit 1
    fi

    if [ ! -f "$CONFLICTS_FILE" ] || [ ! -s "$CONFLICTS_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} No conflicts to resolve"
        return 0
    fi

    # Find unresolved conflict for this file
    local conflict
    conflict=$(grep "\"file\":\"$SINGLE_FILE\"" "$CONFLICTS_FILE" 2>/dev/null | grep '"status":"detected"' | head -1)
    if [ -z "$conflict" ]; then
        echo -e "${CYAN}[INFO]${NC} No unresolved conflict for $SINGLE_FILE"
        return 0
    fi

    local conflict_id holder requester
    conflict_id=$(json_field "$conflict" "id")
    holder=$(json_field "$conflict" "holder_task")
    requester=$(json_field "$conflict" "requesting_task")

    # Confirmation per CLI confirmation matrix
    if [ "$FORCE" != "true" ]; then
        echo -e "${YELLOW}Resolve conflict on $SINGLE_FILE?${NC}"
        echo "  Holder:    $holder"
        echo "  Requester: $requester"
        echo "  Strategy:  $STRATEGY"
        echo -n "Continue? (y/N) "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo -e "${CYAN}[INFO]${NC} Resolution cancelled"
            exit 2
        fi
    fi

    acquire_lock

    # Update conflict status
    local ts
    ts=$(now_ts)
    local resolved_conflict
    resolved_conflict=$(echo "$conflict" | sed "s/\"status\":\"detected\"/\"status\":\"resolved\"/" | sed "s/\"resolution\":\"\"/\"resolution\":\"$STRATEGY\"/")

    local tmp_file="$CONFLICTS_FILE.tmp"
    grep -v "\"id\":\"$conflict_id\"" "$CONFLICTS_FILE" > "$tmp_file" 2>/dev/null || true
    echo "$resolved_conflict" >> "$tmp_file"
    mv "$tmp_file" "$CONFLICTS_FILE"

    release_lock

    case "$STRATEGY" in
        serialize)
            echo -e "${GREEN}[PASS]${NC} Conflict resolved: $requester will wait for $holder to release $SINGLE_FILE"
            echo -e "${CYAN}[INFO]${NC} Re-run 'register' for $requester after $holder completes"
            ;;
        skip)
            echo -e "${GREEN}[PASS]${NC} Conflict resolved: $requester will skip $SINGLE_FILE"
            ;;
    esac
}

cmd_status() {
    echo ""
    echo -e "${BOLD}Conflict Detector Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Active locks
    local lock_count=0
    local file_count=0
    if [ -f "$LOCKS_FILE" ] && [ -s "$LOCKS_FILE" ]; then
        lock_count=$(wc -l < "$LOCKS_FILE" | tr -d ' ')
        # Count total files across all locks
        file_count=$(grep -o '"[^"]*"' "$LOCKS_FILE" | grep -v -E '"(task_id|files|registered_at)"' | grep -v '^\[' | grep -v '^\]' | wc -l | tr -d ' ')
    fi

    echo -e "  Active locks:    ${BOLD}$lock_count${NC} tasks"
    echo -e "  Locked files:    ${BOLD}$file_count${NC} files"

    # Conflicts
    local total_conflicts=0
    local unresolved=0
    local resolved=0
    if [ -f "$CONFLICTS_FILE" ] && [ -s "$CONFLICTS_FILE" ]; then
        total_conflicts=$(wc -l < "$CONFLICTS_FILE" | tr -d ' ')
        unresolved=$(grep -c '"status":"detected"' "$CONFLICTS_FILE" 2>/dev/null || echo "0")
        resolved=$(grep -c '"status":"resolved"' "$CONFLICTS_FILE" 2>/dev/null || echo "0")
    fi

    echo -e "  Total conflicts: ${BOLD}$total_conflicts${NC}"
    if [ "$unresolved" -gt 0 ]; then
        echo -e "  ${RED}Unresolved:      $unresolved${NC}"
    else
        echo -e "  Unresolved:      ${GREEN}0${NC}"
    fi
    echo -e "  Resolved:        ${GREEN}$resolved${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Show active locks detail
    if [ "$lock_count" -gt 0 ]; then
        echo ""
        echo -e "  ${BOLD}Active Locks:${NC}"
        while IFS= read -r entry; do
            [ -z "$entry" ] && continue
            local task
            task=$(json_field "$entry" "task_id")
            local files_str
            files_str=$(echo "$entry" | grep -o '"files":\[[^]]*\]' | head -1)
            local file_list
            file_list=$(echo "$files_str" | grep -o '"[^"]*"' | grep -v '"files"' | tr -d '"' | tr '\n' ', ' | sed 's/,$//')
            echo -e "    ${CYAN}$task${NC}: $file_list"
        done < "$LOCKS_FILE"
    fi

    # Show unresolved conflicts
    if [ "$unresolved" -gt 0 ]; then
        echo ""
        echo -e "  ${BOLD}${RED}Unresolved Conflicts:${NC}"
        grep '"status":"detected"' "$CONFLICTS_FILE" 2>/dev/null | while IFS= read -r conflict; do
            local file holder requester
            file=$(json_field "$conflict" "file")
            holder=$(json_field "$conflict" "holder_task")
            requester=$(json_field "$conflict" "requesting_task")
            echo -e "    ${RED}$file${NC}: $holder vs $requester"
        done
    fi
    echo ""
}

cmd_list() {
    if [ ! -f "$LOCKS_FILE" ] || [ ! -s "$LOCKS_FILE" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"locks":[]}'
        else
            echo -e "${CYAN}[INFO]${NC} No active file locks"
        fi
        return
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"locks":['
        local first=true
        while IFS= read -r entry; do
            [ -z "$entry" ] && continue
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            echo "$entry"
        done < "$LOCKS_FILE"
        echo ']}'
        return
    fi

    echo ""
    printf "${BOLD}%-20s %-50s %-25s${NC}\n" "TASK" "FILES" "REGISTERED"
    printf "%-20s %-50s %-25s\n" "--------------------" "--------------------------------------------------" "-------------------------"

    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        local task
        task=$(json_field "$entry" "task_id")
        local ts
        ts=$(json_field "$entry" "registered_at")
        local files_str
        files_str=$(echo "$entry" | grep -o '"files":\[[^]]*\]' | head -1)
        local file_list
        file_list=$(echo "$files_str" | grep -o '"[^"]*"' | grep -v '"files"' | tr -d '"' | tr '\n' ', ' | sed 's/,$//')

        printf "%-20s %-50s %-25s\n" "$task" "$file_list" "$ts"
    done < "$LOCKS_FILE"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if [ -z "$COMMAND" ]; then
    show_help
    exit 0
fi

case "$COMMAND" in
    register) cmd_register ;;
    release) cmd_release ;;
    check) cmd_check ;;
    status) cmd_status ;;
    resolve) cmd_resolve ;;
    list) cmd_list ;;
    *)
        echo -e "${RED}[FAIL]${NC} Unknown command: $COMMAND"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

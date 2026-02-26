#!/bin/bash

# Swarm Task Queue - CRUD operations for shared task queue
# Implements FR-010 (Shared Task Queue), FR-017 (Agent Availability Pool)
# SwarmTask state machine per PRD Section 6.1
#
# USAGE:
#   ./parallel/swarm-queue.sh init [--dir=PATH]
#   ./parallel/swarm-queue.sh add --id=TASK_ID --story=STORY_ID [--deps=ID1,ID2] [--files=f1,f2]
#   ./parallel/swarm-queue.sh claim --id=TASK_ID --agent=AGENT_TYPE
#   ./parallel/swarm-queue.sh start --id=TASK_ID
#   ./parallel/swarm-queue.sh complete --id=TASK_ID [--result=JSON] [--handoff-to=AGENT]
#   ./parallel/swarm-queue.sh fail --id=TASK_ID --reason=REASON
#   ./parallel/swarm-queue.sh block --id=TASK_ID --reason=REASON
#   ./parallel/swarm-queue.sh unblock --id=TASK_ID
#   ./parallel/swarm-queue.sh list [--status=STATUS] [--json]
#   ./parallel/swarm-queue.sh status
#   ./parallel/swarm-queue.sh pool
#   ./parallel/swarm-queue.sh fallback [--reason=TEXT]
#   ./parallel/swarm-queue.sh recover
#   ./parallel/swarm-queue.sh reset [--force]
#   ./parallel/swarm-queue.sh --help

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
QUEUE_DIR="${QUEUE_DIR:-.claude/swarm}"
QUEUE_FILE=""
POOL_FILE=""
LOCK_FILE=""
MODE_FILE=""
MAX_CONCURRENT=5
MAX_RETRIES=3
FORCE="${FORCE:-false}"
JSON_OUTPUT=false

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Swarm Task Queue - Shared task queue for swarm agent coordination"
    echo ""
    echo "USAGE:"
    echo "  ./parallel/swarm-queue.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  init                    Initialize swarm queue directory and files"
    echo "  add                     Add a task to the queue"
    echo "  claim                   Claim a queued task for an agent"
    echo "  start                   Mark a claimed task as in-progress"
    echo "  complete                Mark a task as complete"
    echo "  fail                    Mark a task as failed"
    echo "  block                   Mark a task as blocked"
    echo "  unblock                 Re-queue a blocked task"
    echo "  list                    List tasks (optionally filtered by status)"
    echo "  status                  Show queue summary statistics"
    echo "  pool                    Show agent availability pool"
    echo "  recover                 Compact queue file and drop invalid entries"
    echo "  reset                   Clear all tasks (requires confirmation)"
    echo ""
    echo "OPTIONS:"
    echo "  --id=TASK_ID            Task identifier"
    echo "  --story=STORY_ID        Parent story identifier"
    echo "  --agent=AGENT_TYPE      Agent type (coder, tester, security, evaluator, etc.)"
    echo "  --deps=ID1,ID2          Comma-separated dependency task IDs"
    echo "  --files=f1,f2           Comma-separated files this task will touch"
    echo "  --reason=REASON         Reason for failure or block"
    echo "  --result=JSON           Completion result as JSON string"
    echo "  --handoff-to=AGENT      Write handoff note to scratchpad for next agent"
    echo "  --status=STATUS         Filter by status (queued, claimed, in_progress, complete, failed, blocked)"
    echo "  --dir=PATH              Queue directory (default: .claude/swarm)"
    echo "  --json                  Output in JSON format"
    echo "  --force                 Skip confirmation prompts"
    echo "  --help                  Show this help message"
    echo ""
    echo "STATE TRANSITIONS (Section 6.1):"
    echo "  QUEUED -> CLAIMED -> IN_PROGRESS -> COMPLETE"
    echo "                    -> IN_PROGRESS -> FAILED -> QUEUED (retry, max 3)"
    echo "                    -> IN_PROGRESS -> BLOCKED -> QUEUED (unblock)"
    echo ""
    echo "EXAMPLES:"
    echo "  ./parallel/swarm-queue.sh init"
    echo "  ./parallel/swarm-queue.sh add --id=STORY-001 --story=auth --files=src/auth.ts"
    echo "  ./parallel/swarm-queue.sh claim --id=STORY-001 --agent=coder"
    echo "  ./parallel/swarm-queue.sh start --id=STORY-001"
    echo "  ./parallel/swarm-queue.sh complete --id=STORY-001"
    echo "  ./parallel/swarm-queue.sh list --status=queued"
    echo "  ./parallel/swarm-queue.sh status"
}

# Parse arguments
COMMAND=""
TASK_ID=""
STORY_ID=""
AGENT_TYPE=""
DEPS=""
FILES=""
REASON=""
RESULT=""
HANDOFF_TO=""
FILTER_STATUS=""
REASON=""

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --id=*) TASK_ID="${arg#--id=}" ;;
        --story=*) STORY_ID="${arg#--story=}" ;;
        --agent=*) AGENT_TYPE="${arg#--agent=}" ;;
        --deps=*) DEPS="${arg#--deps=}" ;;
        --files=*) FILES="${arg#--files=}" ;;
        --reason=*) REASON="${arg#--reason=}" ;;
        --result=*) RESULT="${arg#--result=}" ;;
        --handoff-to=*) HANDOFF_TO="${arg#--handoff-to=}" ;;
        --status=*) FILTER_STATUS="${arg#--status=}" ;;
        --reason=*) REASON="${arg#--reason=}" ;;
        --dir=*) QUEUE_DIR="${arg#--dir=}" ;;
        --json) JSON_OUTPUT=true ;;
        --force) FORCE=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; exit 1 ;;
        *) [ -z "$COMMAND" ] && COMMAND="$arg" ;;
    esac
done

# Set file paths after QUEUE_DIR is finalized
QUEUE_FILE="$QUEUE_DIR/task-queue.jsonl"
POOL_FILE="$QUEUE_DIR/agent-pool.json"
LOCK_FILE="$QUEUE_DIR/.queue.lock"
MODE_FILE="$QUEUE_DIR/mode.json"

# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# Get current timestamp in ISO8601
now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Acquire file lock (with timeout)
acquire_lock() {
    local lock_fd=200
    eval "exec $lock_fd>$LOCK_FILE"
    if command -v flock &>/dev/null; then
        flock -w 5 $lock_fd 2>/dev/null || {
            echo -e "${RED}[FAIL]${NC} Could not acquire queue lock (timeout after 5s)"
            exit 1
        }
    fi
}

# Release file lock
release_lock() {
    local lock_fd=200
    eval "exec $lock_fd>&-" 2>/dev/null || true
}

# Read a task by ID from queue file
get_task() {
    local task_id="$1"
    if [ ! -f "$QUEUE_FILE" ]; then
        echo ""
        return 0
    fi
    grep "\"id\":\"$task_id\"" "$QUEUE_FILE" 2>/dev/null | tail -1 || true
}

# Compact queue file by keeping the latest valid record per task id.
recover_queue_file() {
    if [ ! -f "$QUEUE_FILE" ]; then
        return 0
    fi

    local tmp_file
    tmp_file=$(mktemp)
    local invalid=0
    local duplicates=0

    declare -A task_map=()
    local ordered_ids=()
    local line
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if ! echo "$line" | jq -e . >/dev/null 2>&1; then
            invalid=$((invalid + 1))
            continue
        fi
        local id
        id=$(echo "$line" | jq -r '.id // ""' 2>/dev/null)
        if [ -z "$id" ]; then
            invalid=$((invalid + 1))
            continue
        fi
        if [ -n "${task_map[$id]+x}" ]; then
            duplicates=$((duplicates + 1))
        else
            ordered_ids+=("$id")
        fi
        task_map["$id"]="$line"
    done < "$QUEUE_FILE"

    local id
    for id in "${ordered_ids[@]}"; do
        echo "${task_map[$id]}" >> "$tmp_file"
    done
    mv "$tmp_file" "$QUEUE_FILE"

    if [ "$JSON_OUTPUT" = true ]; then
        echo "{\"invalid_removed\":$invalid,\"duplicates_compacted\":$duplicates,\"remaining\":${#ordered_ids[@]}}"
    else
        echo -e "${GREEN}[PASS]${NC} Queue recovered: removed $invalid invalid line(s), compacted $duplicates duplicate record(s)"
    fi
}

ensure_mode_file() {
    if [ ! -f "$MODE_FILE" ]; then
        jq -nc --arg mode "swarm" --arg ts "$(now_ts)" '{mode:$mode,last_transition_at:$ts,last_reason:""}' > "$MODE_FILE"
    fi
}

set_mode() {
    local mode="$1"
    local reason="${2:-}"
    ensure_mode_file
    local tmp
    tmp=$(mktemp)
    jq --arg mode "$mode" --arg reason "$reason" --arg ts "$(now_ts)" '.mode=$mode | .last_transition_at=$ts | .last_reason=$reason' "$MODE_FILE" > "$tmp"
    mv "$tmp" "$MODE_FILE"
}

current_mode() {
    ensure_mode_file
    jq -r '.mode // "swarm"' "$MODE_FILE" 2>/dev/null || echo "swarm"
}

# Update a task in the queue file (replace line matching ID)
update_task() {
    local task_id="$1"
    local new_line="$2"
    local tmp_file="$QUEUE_FILE.tmp"

    if [ ! -f "$QUEUE_FILE" ]; then
        echo "$new_line" > "$QUEUE_FILE"
        return
    fi

    # Remove old entry, append new one
    grep -v "\"id\":\"$task_id\"" "$QUEUE_FILE" > "$tmp_file" 2>/dev/null || true
    echo "$new_line" >> "$tmp_file"
    mv "$tmp_file" "$QUEUE_FILE"
}

# Count tasks by status
count_by_status() {
    local status="$1"
    if [ ! -f "$QUEUE_FILE" ]; then
        echo "0"
        return
    fi
    local count
    count=$(grep -c "\"status\":\"$status\"" "$QUEUE_FILE" 2>/dev/null) || true
    echo "${count:-0}"
}

# Get tasks by status
tasks_by_status() {
    local status="$1"
    if [ ! -f "$QUEUE_FILE" ]; then
        return
    fi
    grep "\"status\":\"$status\"" "$QUEUE_FILE" 2>/dev/null || true
}

# Extract JSON field value (simple grep-based, no jq dependency)
json_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":\"[^\"]*\"" 2>/dev/null | head -1 | cut -d'"' -f4 || true
}

# Extract JSON numeric field
json_num_field() {
    local json="$1"
    local field="$2"
    echo "$json" | grep -o "\"$field\":[0-9]*" 2>/dev/null | head -1 | cut -d':' -f2 || true
}

# Check if all dependencies of a task are complete
deps_satisfied() {
    local task_json="$1"
    local deps_str
    deps_str=$(echo "$task_json" | grep -o '"dependencies":\[[^]]*\]' 2>/dev/null | head -1 || true)

    # No dependencies field or empty array
    if [ -z "$deps_str" ] || (echo "$deps_str" | grep -q '"dependencies":\[\]' 2>/dev/null); then
        return 0
    fi

    # Extract each dependency ID
    local dep_ids
    dep_ids=$(echo "$deps_str" | grep -o '"[A-Za-z0-9_-]*"' | tr -d '"')

    for dep_id in $dep_ids; do
        local dep_task
        dep_task=$(get_task "$dep_id")
        if [ -z "$dep_task" ]; then
            return 1
        fi
        local dep_status
        dep_status=$(json_field "$dep_task" "status")
        if [ "$dep_status" != "complete" ]; then
            return 1
        fi
    done
    return 0
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_init() {
    if [ -d "$QUEUE_DIR" ] && [ -f "$QUEUE_FILE" ]; then
        echo -e "${YELLOW}[WARN]${NC} Swarm queue already initialized at $QUEUE_DIR"
        recover_queue_file >/dev/null 2>&1 || true
        return 0
    fi

    mkdir -p "$QUEUE_DIR"

    # Create empty queue file
    touch "$QUEUE_FILE"
    ensure_mode_file

    # Create agent pool file
    cat > "$POOL_FILE" << 'POOL_EOF'
{
  "max_concurrent": 5,
  "agents": [],
  "metadata": {
    "created": "",
    "last_updated": ""
  }
}
POOL_EOF
    # Stamp timestamps
    local ts
    ts=$(now_ts)
    if command -v sed &>/dev/null; then
        sed -i "s/\"created\": \"\"/\"created\": \"$ts\"/" "$POOL_FILE"
        sed -i "s/\"last_updated\": \"\"/\"last_updated\": \"$ts\"/" "$POOL_FILE"
    fi

    echo -e "${GREEN}[PASS]${NC} Swarm queue initialized at $QUEUE_DIR"
    echo -e "${CYAN}[INFO]${NC} Queue file: $QUEUE_FILE"
    echo -e "${CYAN}[INFO]${NC} Agent pool: $POOL_FILE"
    echo -e "${CYAN}[INFO]${NC} Max concurrent agents: $MAX_CONCURRENT"
}

cmd_add() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi
    if [ -z "$STORY_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --story is required"
        exit 1
    fi
    if [ ! -f "$QUEUE_FILE" ]; then
        echo -e "${RED}[FAIL]${NC} Queue not initialized. Run: swarm-queue.sh init"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    # Check for duplicate under lock to prevent races.
    local existing
    existing=$(get_task "$TASK_ID")
    if [ -n "$existing" ]; then
        release_lock
        echo -e "${YELLOW}[WARN]${NC} Task $TASK_ID already exists (status: $(json_field "$existing" "status"))"
        return 0
    fi

    # Build dependencies array
    local deps_json="[]"
    if [ -n "$DEPS" ]; then
        deps_json="[$(echo "$DEPS" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]"
    fi

    # Build files array
    local files_json="[]"
    if [ -n "$FILES" ]; then
        files_json="[$(echo "$FILES" | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/' )]"
    fi

    local ts
    ts=$(now_ts)
    local task_json="{\"id\":\"$TASK_ID\",\"story_id\":\"$STORY_ID\",\"status\":\"queued\",\"claimed_by\":\"\",\"claimed_at\":\"\",\"started_at\":\"\",\"completed_at\":\"\",\"dependencies\":$deps_json,\"files_touched\":$files_json,\"retry_count\":0,\"max_retries\":$MAX_RETRIES,\"block_reason\":\"\",\"fail_reason\":\"\",\"result\":{},\"created_at\":\"$ts\"}"

    echo "$task_json" >> "$QUEUE_FILE"
    release_lock

    echo -e "${GREEN}[PASS]${NC} Task $TASK_ID added to queue (story: $STORY_ID)"
    if [ -n "$DEPS" ]; then
        echo -e "${CYAN}[INFO]${NC} Dependencies: $DEPS"
    fi
    if [ -n "$FILES" ]; then
        echo -e "${CYAN}[INFO]${NC} Files: $FILES"
    fi
}

cmd_claim() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi
    if [ -z "$AGENT_TYPE" ]; then
        echo -e "${RED}[FAIL]${NC} --agent is required"
        exit 1
    fi
    if [ ! -f "$QUEUE_FILE" ]; then
        echo -e "${RED}[FAIL]${NC} Queue not initialized"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate transition: only QUEUED -> CLAIMED is valid
    if [ "$current_status" != "queued" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> claimed (task must be QUEUED)"
        exit 1
    fi

    # Check dependency satisfaction
    if ! deps_satisfied "$task"; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID has unmet dependencies"
        exit 1
    fi

    # Check concurrent agent limit
    local in_progress_count
    in_progress_count=$(count_by_status "in_progress")
    local claimed_count
    claimed_count=$(count_by_status "claimed")
    local active_count=$((in_progress_count + claimed_count))
    if [ "$active_count" -ge "$MAX_CONCURRENT" ]; then
        release_lock
        echo -e "${YELLOW}[WARN]${NC} Max concurrent agents ($MAX_CONCURRENT) reached. Cannot claim."
        exit 1
    fi

    # Check file conflicts with in-progress tasks
    local task_files
    task_files=$(echo "$task" | grep -o '"files_touched":\[[^]]*\]' 2>/dev/null | head -1 || true)
    if [ -n "$task_files" ] && ! (echo "$task_files" | grep -q '"files_touched":\[\]' 2>/dev/null); then
        local in_progress_tasks
        in_progress_tasks=$(tasks_by_status "in_progress")
        if [ -n "$in_progress_tasks" ]; then
            while IFS= read -r ip_task; do
                local ip_files
                ip_files=$(echo "$ip_task" | grep -o '"files_touched":\[[^]]*\]' 2>/dev/null | head -1 || true)
                # Simple overlap check - extract file names and compare
                local overlap=false
                local task_file_list
                task_file_list=$(echo "$task_files" | grep -o '"[^"]*"' 2>/dev/null | tr -d '"' | grep -v "files_touched" || true)
                local ip_file_list
                ip_file_list=$(echo "$ip_files" | grep -o '"[^"]*"' 2>/dev/null | tr -d '"' | grep -v "files_touched" || true)
                for tf in $task_file_list; do
                    for ipf in $ip_file_list; do
                        if [ "$tf" = "$ipf" ]; then
                            overlap=true
                            break 2
                        fi
                    done
                done
                if [ "$overlap" = true ]; then
                    local ip_id
                    ip_id=$(json_field "$ip_task" "id")
                    local fallback_reason
                    fallback_reason="file conflict: $TASK_ID overlaps with in-progress $ip_id"
                    set_mode "wave" "$fallback_reason"
                    release_lock
                    echo -e "${RED}[FAIL]${NC} File conflict with in-progress task $ip_id"
                    echo -e "${YELLOW}[WARN]${NC} Swarm fallback activated (mode: wave)"
                    exit 1
                fi
            done <<< "$in_progress_tasks"
        fi
    fi

    # Register file locks in conflict detector before claiming.
    local conflict_script
    conflict_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conflict-detector.sh"
    if [ -f "$conflict_script" ] && [ -n "$task_files" ] && ! (echo "$task_files" | grep -q '"files_touched":\[\]' 2>/dev/null); then
        local task_csv
        task_csv=$(echo "$task_files" | grep -o '"[^"]*"' 2>/dev/null | tr -d '"' | grep -v "files_touched" | paste -sd, -)
        if [ -n "$task_csv" ]; then
            if ! SWARM_DIR="$QUEUE_DIR" bash "$conflict_script" register --task="$TASK_ID" --files="$task_csv" >/dev/null 2>&1; then
                local fallback_reason
                fallback_reason="conflict-detector register failed for $TASK_ID ($task_csv)"
                set_mode "wave" "$fallback_reason"
                release_lock
                echo -e "${RED}[FAIL]${NC} Conflict detector blocked claim for $TASK_ID"
                echo -e "${YELLOW}[WARN]${NC} Swarm fallback activated (mode: wave)"
                exit 1
            fi
        fi
    fi

    # Perform the transition
    local ts
    ts=$(now_ts)
    local new_task
    new_task=$(echo "$task" | sed "s/\"status\":\"queued\"/\"status\":\"claimed\"/" | sed "s/\"claimed_by\":\"\"/\"claimed_by\":\"$AGENT_TYPE\"/" | sed "s/\"claimed_at\":\"\"/\"claimed_at\":\"$ts\"/")
    update_task "$TASK_ID" "$new_task"

    release_lock

    echo -e "${GREEN}[PASS]${NC} Task $TASK_ID claimed by $AGENT_TYPE"
}

cmd_start() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate: only CLAIMED -> IN_PROGRESS
    if [ "$current_status" != "claimed" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> in_progress (task must be CLAIMED)"
        exit 1
    fi

    local ts
    ts=$(now_ts)
    local new_task
    new_task=$(echo "$task" | sed "s/\"status\":\"claimed\"/\"status\":\"in_progress\"/" | sed "s/\"started_at\":\"\"/\"started_at\":\"$ts\"/")
    update_task "$TASK_ID" "$new_task"

    release_lock

    echo -e "${GREEN}[PASS]${NC} Task $TASK_ID started (in_progress)"
}

cmd_complete() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate: only IN_PROGRESS -> COMPLETE
    if [ "$current_status" != "in_progress" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> complete (task must be IN_PROGRESS)"
        exit 1
    fi

    local ts
    ts=$(now_ts)
    local new_task
    new_task=$(echo "$task" | sed "s/\"status\":\"in_progress\"/\"status\":\"complete\"/" | sed "s/\"completed_at\":\"\"/\"completed_at\":\"$ts\"/")

    # Add result if provided
    if [ -n "$RESULT" ]; then
        new_task=$(echo "$new_task" | sed "s/\"result\":{}/\"result\":$RESULT/")
    fi

    update_task "$TASK_ID" "$new_task"

    release_lock

    echo -e "${GREEN}[PASS]${NC} Task $TASK_ID completed"

    # Optional dynamic handoff note to downstream agent.
    if [ -n "$HANDOFF_TO" ]; then
        local from_agent
        from_agent=$(json_field "$task" "claimed_by")
        [ -z "$from_agent" ] && from_agent="system"
        local handoff_msg
        handoff_msg="Handoff from $from_agent: task $TASK_ID completed; continue with downstream validation."
        if [ -n "$RESULT" ]; then
            local compact_result
            compact_result=$(echo "$RESULT" | tr '\n' ' ' | sed 's/"/'\''/g' | cut -c1-140)
            handoff_msg="$handoff_msg Result: $compact_result"
        fi
        local scratchpad_script
        scratchpad_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/swarm-scratchpad.sh"
        if [ -f "$scratchpad_script" ]; then
            SWARM_DIR="$QUEUE_DIR" bash "$scratchpad_script" write \
                --from="$from_agent" \
                --to="$HANDOFF_TO" \
                --task="$TASK_ID" \
                --priority=high \
                --msg="$handoff_msg" >/dev/null 2>&1 || true
            echo -e "${CYAN}[INFO]${NC} Handoff note created for $HANDOFF_TO"
        fi
    fi

    # Release conflict-detector locks held by this task.
    local conflict_script
    conflict_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conflict-detector.sh"
    if [ -f "$conflict_script" ]; then
        SWARM_DIR="$QUEUE_DIR" bash "$conflict_script" release --task="$TASK_ID" >/dev/null 2>&1 || true
    fi

    # Check if any blocked tasks can now be unblocked
    local blocked_tasks
    blocked_tasks=$(tasks_by_status "blocked")
    if [ -n "$blocked_tasks" ]; then
        while IFS= read -r bt; do
            local bt_id
            bt_id=$(json_field "$bt" "id")
            if deps_satisfied "$bt"; then
                echo -e "${CYAN}[INFO]${NC} Task $bt_id may now be unblockable (dependency $TASK_ID completed)"
            fi
        done <<< "$blocked_tasks"
    fi
}

cmd_fail() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi
    if [ -z "$REASON" ]; then
        echo -e "${RED}[FAIL]${NC} --reason is required"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate: only IN_PROGRESS -> FAILED
    if [ "$current_status" != "in_progress" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> failed (task must be IN_PROGRESS)"
        exit 1
    fi

    local retry_count
    retry_count=$(json_num_field "$task" "retry_count")
    retry_count=${retry_count:-0}

    # Escape reason for JSON
    local safe_reason
    safe_reason=$(echo "$REASON" | sed 's/"/\\"/g')

    local new_task
    new_task=$(echo "$task" | sed "s/\"status\":\"in_progress\"/\"status\":\"failed\"/" | sed "s/\"fail_reason\":\"\"/\"fail_reason\":\"$safe_reason\"/")
    update_task "$TASK_ID" "$new_task"

    release_lock

    if [ "$retry_count" -lt "$MAX_RETRIES" ]; then
        echo -e "${YELLOW}[WARN]${NC} Task $TASK_ID failed: $REASON (retry $((retry_count + 1))/$MAX_RETRIES available)"
        echo -e "${CYAN}[INFO]${NC} Run: swarm-queue.sh unblock --id=$TASK_ID to re-queue for retry"
    else
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID failed: $REASON (max retries exhausted - escalate)"
    fi

    # Release locks on failure; task can reacquire on retry claim.
    local conflict_script
    conflict_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conflict-detector.sh"
    if [ -f "$conflict_script" ]; then
        SWARM_DIR="$QUEUE_DIR" bash "$conflict_script" release --task="$TASK_ID" >/dev/null 2>&1 || true
    fi
}

cmd_block() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi
    if [ -z "$REASON" ]; then
        echo -e "${RED}[FAIL]${NC} --reason is required"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate: only IN_PROGRESS -> BLOCKED
    if [ "$current_status" != "in_progress" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> blocked (task must be IN_PROGRESS)"
        exit 1
    fi

    local safe_reason
    safe_reason=$(echo "$REASON" | sed 's/"/\\"/g')

    local new_task
    new_task=$(echo "$task" | sed "s/\"status\":\"in_progress\"/\"status\":\"blocked\"/" | sed "s/\"block_reason\":\"\"/\"block_reason\":\"$safe_reason\"/")
    update_task "$TASK_ID" "$new_task"

    release_lock

    echo -e "${YELLOW}[WARN]${NC} Task $TASK_ID blocked: $REASON"

    # Release locks when blocked to avoid deadlocks.
    local conflict_script
    conflict_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/conflict-detector.sh"
    if [ -f "$conflict_script" ]; then
        SWARM_DIR="$QUEUE_DIR" bash "$conflict_script" release --task="$TASK_ID" >/dev/null 2>&1 || true
    fi
}

cmd_unblock() {
    if [ -z "$TASK_ID" ]; then
        echo -e "${RED}[FAIL]${NC} --id is required"
        exit 1
    fi

    acquire_lock
    recover_queue_file >/dev/null 2>&1 || true

    local task
    task=$(get_task "$TASK_ID")
    if [ -z "$task" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Task $TASK_ID not found"
        exit 1
    fi

    local current_status
    current_status=$(json_field "$task" "status")

    # Validate: BLOCKED -> QUEUED or FAILED -> QUEUED (retry)
    if [ "$current_status" != "blocked" ] && [ "$current_status" != "failed" ]; then
        release_lock
        echo -e "${RED}[FAIL]${NC} Invalid transition: $current_status -> queued (task must be BLOCKED or FAILED)"
        exit 1
    fi

    # For failed tasks, check retry count
    if [ "$current_status" = "failed" ]; then
        local retry_count
        retry_count=$(json_num_field "$task" "retry_count")
        retry_count=${retry_count:-0}
        if [ "$retry_count" -ge "$MAX_RETRIES" ]; then
            release_lock
            echo -e "${RED}[FAIL]${NC} Task $TASK_ID has exceeded max retries ($MAX_RETRIES). Cannot re-queue."
            exit 1
        fi
        # Increment retry count
        local new_count=$((retry_count + 1))
        local new_task
        new_task=$(echo "$task" | sed "s/\"status\":\"failed\"/\"status\":\"queued\"/" | sed "s/\"retry_count\":$retry_count/\"retry_count\":$new_count/" | sed "s/\"claimed_by\":\"[^\"]*\"/\"claimed_by\":\"\"/" | sed "s/\"claimed_at\":\"[^\"]*\"/\"claimed_at\":\"\"/" | sed "s/\"started_at\":\"[^\"]*\"/\"started_at\":\"\"/" | sed "s/\"completed_at\":\"[^\"]*\"/\"completed_at\":\"\"/" | sed "s/\"fail_reason\":\"[^\"]*\"/\"fail_reason\":\"\"/" | sed "s/\"result\":{[^}]*}/\"result\":{}/")
        update_task "$TASK_ID" "$new_task"
        release_lock
        echo -e "${GREEN}[PASS]${NC} Task $TASK_ID re-queued for retry ($new_count/$MAX_RETRIES)"
    else
        # Blocked -> Queued
        local new_task
        new_task=$(echo "$task" | sed "s/\"status\":\"blocked\"/\"status\":\"queued\"/" | sed "s/\"claimed_by\":\"[^\"]*\"/\"claimed_by\":\"\"/" | sed "s/\"claimed_at\":\"[^\"]*\"/\"claimed_at\":\"\"/" | sed "s/\"started_at\":\"[^\"]*\"/\"started_at\":\"\"/" | sed "s/\"completed_at\":\"[^\"]*\"/\"completed_at\":\"\"/" | sed "s/\"block_reason\":\"[^\"]*\"/\"block_reason\":\"\"/" | sed "s/\"result\":{[^}]*}/\"result\":{}/")
        update_task "$TASK_ID" "$new_task"
        release_lock
        echo -e "${GREEN}[PASS]${NC} Task $TASK_ID unblocked and re-queued"
    fi
}

cmd_list() {
    if [ ! -f "$QUEUE_FILE" ] || [ ! -s "$QUEUE_FILE" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"tasks":[]}'
        else
            echo -e "${CYAN}[INFO]${NC} Queue is empty"
        fi
        return
    fi

    local tasks
    if [ -n "$FILTER_STATUS" ]; then
        tasks=$(tasks_by_status "$FILTER_STATUS")
    else
        tasks=$(cat "$QUEUE_FILE")
    fi

    if [ -z "$tasks" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            echo '{"tasks":[]}'
        else
            echo -e "${CYAN}[INFO]${NC} No tasks found${FILTER_STATUS:+ with status: $FILTER_STATUS}"
        fi
        return
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        echo '{"tasks":['
        local first=true
        while IFS= read -r task; do
            [ -z "$task" ] && continue
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            echo "$task"
        done <<< "$tasks"
        echo ']}'
        return
    fi

    # Table format
    echo ""
    printf "${BOLD}%-20s %-15s %-14s %-15s %-6s${NC}\n" "TASK ID" "STORY" "STATUS" "AGENT" "RETRY"
    printf "%-20s %-15s %-14s %-15s %-6s\n" "--------------------" "---------------" "--------------" "---------------" "------"

    while IFS= read -r task; do
        [ -z "$task" ] && continue
        local id status story agent retry
        id=$(json_field "$task" "id")
        status=$(json_field "$task" "status")
        story=$(json_field "$task" "story_id")
        agent=$(json_field "$task" "claimed_by")
        retry=$(json_num_field "$task" "retry_count")
        [ -z "$agent" ] && agent="-"
        [ -z "$retry" ] && retry="0"

        local color="$NC"
        case "$status" in
            queued) color="$BLUE" ;;
            claimed) color="$CYAN" ;;
            in_progress) color="$YELLOW" ;;
            complete) color="$GREEN" ;;
            failed) color="$RED" ;;
            blocked) color="$RED" ;;
        esac

        printf "%-20s %-15s ${color}%-14s${NC} %-15s %-6s\n" "$id" "$story" "$status" "$agent" "$retry"
    done <<< "$tasks"
    echo ""
}

cmd_status() {
    if [ ! -f "$QUEUE_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} Queue not initialized"
        return
    fi

    local total queued claimed in_progress complete failed blocked
    recover_queue_file >/dev/null 2>&1 || true
    ensure_mode_file
    total=$(wc -l < "$QUEUE_FILE" 2>/dev/null || echo "0")
    total=$(echo "$total" | tr -d ' ')
    queued=$(count_by_status "queued")
    claimed=$(count_by_status "claimed")
    in_progress=$(count_by_status "in_progress")
    complete=$(count_by_status "complete")
    failed=$(count_by_status "failed")
    blocked=$(count_by_status "blocked")

    if [ "$JSON_OUTPUT" = true ]; then
        echo "{\"mode\":\"$(current_mode)\",\"total\":$total,\"queued\":$queued,\"claimed\":$claimed,\"in_progress\":$in_progress,\"complete\":$complete,\"failed\":$failed,\"blocked\":$blocked}"
        return
    fi

    echo ""
    echo -e "${BOLD}Swarm Task Queue Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  Total tasks:     ${BOLD}$total${NC}"
    echo -e "  ${BLUE}Queued:${NC}          $queued"
    echo -e "  ${CYAN}Claimed:${NC}         $claimed"
    echo -e "  ${YELLOW}In Progress:${NC}     $in_progress"
    echo -e "  ${GREEN}Complete:${NC}        $complete"
    echo -e "  ${RED}Failed:${NC}          $failed"
    echo -e "  ${RED}Blocked:${NC}         $blocked"
    echo -e "  Mode:            ${BOLD}$(current_mode)${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local active=$((claimed + in_progress))
    echo -e "  Active agents:   $active / $MAX_CONCURRENT"

    if [ "$complete" -gt 0 ] && [ "$total" -gt 0 ]; then
        local pct=$((complete * 100 / total))
        echo -e "  Progress:        ${GREEN}${pct}%${NC}"
    fi
    echo ""
}

cmd_pool() {
    if [ ! -f "$QUEUE_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} Queue not initialized"
        return
    fi
    recover_queue_file >/dev/null 2>&1 || true

    echo ""
    echo -e "${BOLD}Agent Availability Pool${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local claimed_count
    claimed_count=$(count_by_status "claimed")
    local in_progress_count
    in_progress_count=$(count_by_status "in_progress")
    local active=$((claimed_count + in_progress_count))
    local available=$((MAX_CONCURRENT - active))
    [ "$available" -lt 0 ] && available=0

    echo -e "  Max concurrent:  $MAX_CONCURRENT"
    echo -e "  Active:          $active"
    echo -e "  Available:       ${GREEN}$available${NC}"
    echo ""

    # Show active agents
    if [ "$active" -gt 0 ]; then
        echo -e "  ${BOLD}Active Agents:${NC}"
        local active_tasks
        active_tasks=$(tasks_by_status "claimed")
        if [ -n "$active_tasks" ]; then
            while IFS= read -r task; do
                [ -z "$task" ] && continue
                local id agent
                id=$(json_field "$task" "id")
                agent=$(json_field "$task" "claimed_by")
                echo -e "    ${CYAN}$agent${NC} -> $id (claimed)"
            done <<< "$active_tasks"
        fi

        active_tasks=$(tasks_by_status "in_progress")
        if [ -n "$active_tasks" ]; then
            while IFS= read -r task; do
                [ -z "$task" ] && continue
                local id agent
                id=$(json_field "$task" "id")
                agent=$(json_field "$task" "claimed_by")
                echo -e "    ${YELLOW}$agent${NC} -> $id (in_progress)"
            done <<< "$active_tasks"
        fi
    fi
    echo ""
}

cmd_reset() {
    if [ ! -f "$QUEUE_FILE" ]; then
        echo -e "${CYAN}[INFO]${NC} Nothing to reset"
        return 0
    fi

    local total
    total=$(wc -l < "$QUEUE_FILE" 2>/dev/null || echo "0")
    total=$(echo "$total" | tr -d ' ')

    if [ "$total" = "0" ]; then
        echo -e "${CYAN}[INFO]${NC} Queue is already empty"
        return 0
    fi

    # Confirmation per CLI confirmation matrix
    if [ "$FORCE" != "true" ]; then
        local in_progress
        in_progress=$(count_by_status "in_progress")
        echo -e "${YELLOW}Clear task queue? $total tasks will be removed."
        if [ "$in_progress" -gt 0 ]; then
            echo -e "${RED}$in_progress in-progress tasks will be abandoned.${NC}"
        fi
        echo -n "Continue? (y/N) "
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo -e "${CYAN}[INFO]${NC} Reset cancelled"
            exit 2
        fi
    fi

    > "$QUEUE_FILE"
    echo -e "${GREEN}[PASS]${NC} Queue cleared ($total tasks removed)"
}

cmd_recover() {
    acquire_lock
    recover_queue_file
    release_lock
}

cmd_fallback() {
    acquire_lock
    set_mode "wave" "${REASON:-manual fallback}"
    release_lock
    echo -e "${YELLOW}[WARN]${NC} Swarm fallback activated (mode: wave)"
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if [ -z "$COMMAND" ]; then
    show_help
    exit 0
fi

case "$COMMAND" in
    init) cmd_init ;;
    add) cmd_add ;;
    claim) cmd_claim ;;
    start) cmd_start ;;
    complete) cmd_complete ;;
    fail) cmd_fail ;;
    block) cmd_block ;;
    unblock) cmd_unblock ;;
    list) cmd_list ;;
    status) cmd_status ;;
    pool) cmd_pool ;;
    fallback) cmd_fallback ;;
    recover) cmd_recover ;;
    reset) cmd_reset ;;
    *)
        echo -e "${RED}[FAIL]${NC} Unknown command: $COMMAND"
        echo "Run with --help for usage"
        exit 1
        ;;
esac

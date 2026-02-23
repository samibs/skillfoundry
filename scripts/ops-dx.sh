#!/bin/bash

# DX Ops command suite for /explain, /undo, /health and cost envelope.
# Implements FR-022, FR-023, FR-024, FR-025 behavior contracts.

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JSON_OUTPUT=false
FORCE=false

show_help() {
    cat <<'HELP'
DX Ops Suite

USAGE:
  ./scripts/ops-dx.sh explain [--story=STORY-001] [--json]
  ./scripts/ops-dx.sh undo [--dry-run] [--list] [--force] [--json]
  ./scripts/ops-dx.sh health [--quick] [--json]
  ./scripts/ops-dx.sh cost [--json]
HELP
}

latest_swarm_action() {
    local queue_file=".claude/swarm/task-queue.jsonl"
    if [ -f "$queue_file" ] && [ -s "$queue_file" ]; then
        jq -sc 'map(select(.status=="complete" or .status=="failed")) | last // {}' "$queue_file" 2>/dev/null || echo "{}"
    else
        echo "{}"
    fi
}

cmd_explain() {
    local story_filter=""
    for arg in "$@"; do
        case "$arg" in
            --story=*) story_filter="${arg#--story=}" ;;
            --json) JSON_OUTPUT=true ;;
        esac
    done

    local action_json
    action_json=$(latest_swarm_action)
    local id story agent status
    id=$(echo "$action_json" | jq -r '.id // ""')
    story=$(echo "$action_json" | jq -r '.story_id // ""')
    agent=$(echo "$action_json" | jq -r '.claimed_by // "unknown"')
    status=$(echo "$action_json" | jq -r '.status // ""')

    if [ -n "$story_filter" ] && [ "$story" != "$story_filter" ]; then
        id=""
    fi

    if [ -z "$id" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            jq -nc '{status:"empty",message:"No previous actions found. Run /go first."}'
        else
            echo "No previous actions found. Run /go first."
        fi
        return 0
    fi

    local out
    out=$(jq -nc --arg id "$id" --arg story "$story" --arg agent "$agent" --arg status "$status" \
      '{status:"ok",last_action:{task_id:$id,story:$story,agent:$agent,result:$status},explanation:{what_happened:("Agent " + $agent + " finished task " + $id + " for " + $story + " with status " + $status + "."),why:"This action advances the active story toward acceptance criteria.",next:"Continue with dependent or queued stories."}}')

    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "Last Action: $agent performed task $id on $story"
        echo ""
        echo "What happened:"
        echo "  - Status: $status"
        echo "  - Task completed in swarm queue"
        echo ""
        echo "Why:"
        echo "  - Advances story completion against PRD requirements"
        echo ""
        echo "Next:"
        echo "  - Continue with next queued/blocked dependency"
    fi
}

cmd_undo() {
    local dry_run=false
    local list_only=false
    for arg in "$@"; do
        case "$arg" in
            --dry-run) dry_run=true ;;
            --list) list_only=true ;;
            --force) FORCE=true ;;
            --json) JSON_OUTPUT=true ;;
        esac
    done

    if [ "$list_only" = true ]; then
        local list
        list=$(git log -5 --pretty=format:'%h|%s' 2>/dev/null || true)
        if [ "$JSON_OUTPUT" = true ]; then
            echo "$list" | awk -F'|' '{print "{\"ref\":\""$1"\",\"summary\":\""$2"\",\"reversible\":false}"}' | jq -s '{status:"ok",actions:.}'
        else
            echo "Recent actions (commit history):"
            echo "$list" | sed 's/^/  - /'
            echo "Note: committed actions are not auto-reversible by /undo."
        fi
        return 0
    fi

    local changed
    changed=$(git status --porcelain 2>/dev/null | awk '{print $2}' || true)
    if [ -z "$changed" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            jq -nc '{status:"warn",reversible:false,message:"No uncommitted changes to undo."}'
        else
            echo "No uncommitted changes to undo."
        fi
        return 0
    fi

    if [ "$dry_run" = true ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            printf '%s\n' "$changed" | jq -R . | jq -s '{status:"ok",reversible:true,dry_run:true,files:.}'
        else
            echo "Would restore these files:"
            printf '%s\n' "$changed" | sed 's/^/  - /'
        fi
        return 0
    fi

    if [ "$FORCE" != true ]; then
        printf "Undo uncommitted changes for %s file(s)? (y/N): " "$(printf '%s\n' "$changed" | grep -c .)"
        read -r ans
        if [[ "$ans" != "y" && "$ans" != "Y" ]]; then
            echo "Cancelled"
            return 2
        fi
    fi

    git restore --staged --worktree -- $(printf '%s ' $changed)
    if [ "$JSON_OUTPUT" = true ]; then
        printf '%s\n' "$changed" | jq -R . | jq -s '{status:"ok",reversible:true,undone_files:.}'
    else
        echo "[PASS] Reverted uncommitted changes."
    fi
}

cmd_health() {
    local quick=false
    for arg in "$@"; do
        case "$arg" in
            --quick) quick=true ;;
            --json) JSON_OUTPUT=true ;;
        esac
    done

    local checks="[]"
    local overall="HEALTHY"

    local version="MISSING"
    if [ -f ".version" ]; then
        version=$(tr -d '[:space:]' < .version)
    fi
    checks=$(echo "$checks" | jq --arg n "Version" --arg s "$( [ "$version" = "MISSING" ] && echo fail || echo pass )" --arg d "$version" '. + [{name:$n,status:$s,detail:$d}]')

    local required_ok=true
    for p in ".claude/commands" "genesis" "docs"; do
        [ -e "$p" ] || required_ok=false
    done
    checks=$(echo "$checks" | jq --arg n "Structure" --arg s "$( [ "$required_ok" = true ] && echo pass || echo fail )" --arg d "Required directories and command assets" '. + [{name:$n,status:$s,detail:$d}]')

    local agent_count
    agent_count=$(find .claude/commands -maxdepth 1 -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    checks=$(echo "$checks" | jq --arg n "Agents" --arg s "$( [ "$agent_count" -ge 5 ] && echo pass || echo warn )" --arg d "$agent_count commands available" '. + [{name:$n,status:$s,detail:$d}]')

    if [ "$quick" != true ]; then
        local memory_detail="missing"
        local memory_status="warn"
        if [ -d "memory_bank/knowledge" ]; then
            local kcount
            kcount=$(find memory_bank/knowledge -type f -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
            memory_detail="$kcount knowledge files"
            memory_status="pass"
        fi
        checks=$(echo "$checks" | jq --arg n "Memory Bank" --arg s "$memory_status" --arg d "$memory_detail" '. + [{name:$n,status:$s,detail:$d}]')

        local swarm_status="warn"
        [ -x "parallel/swarm-queue.sh" ] && [ -x "parallel/swarm-scratchpad.sh" ] && swarm_status="pass"
        checks=$(echo "$checks" | jq --arg n "Swarm" --arg s "$swarm_status" --arg d "parallel scripts availability" '. + [{name:$n,status:$s,detail:$d}]')

        local prd_count
        prd_count=$(find genesis -maxdepth 1 -type f -name '*.md' ! -name 'TEMPLATE.md' 2>/dev/null | wc -l | tr -d ' ')
        checks=$(echo "$checks" | jq --arg n "PRDs" --arg s "info" --arg d "$prd_count PRDs" '. + [{name:$n,status:$s,detail:$d}]')
    fi

    if echo "$checks" | jq -e 'any(.[]; .status=="fail")' >/dev/null; then
        overall="DEGRADED"
    fi

    if [ "$JSON_OUTPUT" = true ]; then
        jq -nc --arg overall "$overall" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson checks "$checks" '{status:"ok",overall:$overall,timestamp:$ts,checks:$checks}'
    else
        echo "Framework Health Check"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "$checks" | jq -r '.[] | "  " + .name + ": [" + (.status|ascii_upcase) + "] " + .detail'
        echo ""
        echo "  Overall: $overall"
    fi
}

cmd_cost() {
    local file=".claude/costs/usage.jsonl"
    if [ ! -f "$file" ] || [ ! -s "$file" ]; then
        if [ "$JSON_OUTPUT" = true ]; then
            jq -nc '{status:"ok",usage:{total_tokens:0,records:0,by_agent:[],by_story:[],by_phase:[]}}'
        else
            echo "No cost data recorded yet."
        fi
        return 0
    fi

    local tmp_json
    tmp_json=$(mktemp)
    jq -sc '
      def group_sum(k): map({key: .[k], tokens: .tokens})
        | group_by(.key)
        | map({key: (.[0].key // "unknown"), tokens: (map(.tokens)|add)});
      {
        total_tokens: (map(.tokens)|add),
        records: length,
        by_agent: group_sum("agent"),
        by_story: group_sum("story"),
        by_phase: group_sum("phase")
      }' "$file" > "$tmp_json"

    if [ "$JSON_OUTPUT" = true ]; then
        jq -nc --argjson usage "$(cat "$tmp_json")" '{status:"ok",usage:$usage}'
    else
        jq -r '. as $u | "Total tokens: \($u.total_tokens) across \($u.records) records"' "$tmp_json"
        echo "By Agent:"
        jq -r '.by_agent[] | "  - " + .key + ": " + (.tokens|tostring)' "$tmp_json"
        echo "By Story:"
        jq -r '.by_story[] | "  - " + .key + ": " + (.tokens|tostring)' "$tmp_json"
        echo "By Phase:"
        jq -r '.by_phase[] | "  - " + .key + ": " + (.tokens|tostring)' "$tmp_json"
    fi

    rm -f "$tmp_json"
}

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
    explain) cmd_explain "$@" ;;
    undo) cmd_undo "$@" ;;
    health) cmd_health "$@" ;;
    cost) cmd_cost "$@" ;;
    ""|help|--help|-h) show_help ;;
    *) echo "[FAIL] Unknown command: $COMMAND" >&2; exit 1 ;;
esac

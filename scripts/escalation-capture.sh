#!/bin/bash

# Escalation Auto-Capture
# Implements FR-005: capture escalation decisions into project knowledge automatically.

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="."
AGENT=""
QUESTION=""
DECISION=""
CONTEXT=""
REVIEWER=""
ANNOTATION=""
JSON_OUTPUT=false
QUIET=false

show_help() {
    cat <<'HELP'
Escalation Auto-Capture

USAGE:
  ./scripts/escalation-capture.sh capture --agent=AGENT --question="..." --decision="..." [options]

OPTIONS:
  --project=PATH         Project directory (default: .)
  --agent=AGENT          Agent that raised escalation (required)
  --question=TEXT        Escalation question (required)
  --decision=TEXT        User decision (required)
  --context=TEXT         Optional context summary
  --reviewer=NAME        Optional reviewer name
  --annotation=TEXT      Optional reviewer annotation
  --json                 Output machine-readable envelope
  --quiet                Suppress non-essential output
  --help                 Show help
HELP
}

normalize_text() {
    echo "$1" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//'
}

detect_scope() {
    local content_lc
    content_lc=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    if echo "$content_lc" | grep -Eq '(project|repo|package|module|path|workspace)'; then
        echo "project"
    else
        echo "universal"
    fi
}

notify_escalation_captured() {
    local msg="$1"
    if [ -f "$SCRIPT_DIR/notify.sh" ]; then
        # shellcheck source=/dev/null
        source "$SCRIPT_DIR/notify.sh"
        notify info "$msg" || true
    fi
}

capture_entry() {
    local knowledge_dir="$PROJECT_DIR/memory_bank/knowledge"
    local decision_file="$knowledge_dir/decisions.jsonl"
    local escalation_log="$PROJECT_DIR/logs/escalations.md"
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$knowledge_dir" "$PROJECT_DIR/logs" "$PROJECT_DIR/.claude"

    local context_summary="$CONTEXT"
    if [ -z "$context_summary" ]; then
        context_summary="$(normalize_text "$QUESTION -> $DECISION")"
    fi

    local content
    content=$(normalize_text "Escalation decision: $QUESTION | Selected: $DECISION")
    local scope
    scope=$(detect_scope "$content")
    local id
    id="esc-$(date +%Y%m%d%H%M%S)-$RANDOM"

    local entry
    entry=$(jq -nc \
        --arg id "$id" \
        --arg content "$content" \
        --arg scope "$scope" \
        --arg ts "$ts" \
        --arg agent "$AGENT" \
        --arg question "$QUESTION" \
        --arg decision "$DECISION" \
        --arg context "$context_summary" \
        --arg reviewer "$REVIEWER" \
        --arg annotation "$ANNOTATION" \
        '{id:$id,type:"decision",content:$content,weight:0.9,tags:["escalation","auto-captured"],scope:$scope,harvested_at:null,promotion_count:0,lineage:{captured_at:$ts,source:"escalation",agent:$agent,question:$question,decision:$decision,context_summary:$context,reviewer:(if $reviewer=="" then null else $reviewer end),annotation:(if $annotation=="" then null else $annotation end)}}')

    echo "$entry" >> "$decision_file"

    {
        echo "## $(date -u +"%Y-%m-%d %H:%M:%S UTC") | $AGENT"
        echo "- Question: $QUESTION"
        echo "- Decision: $DECISION"
        echo "- Context: $context_summary"
        if [ -n "$REVIEWER" ]; then
            echo "- Reviewer: $REVIEWER"
        fi
        if [ -n "$ANNOTATION" ]; then
            echo "- Annotation: $ANNOTATION"
        fi
        echo ""
    } >> "$escalation_log"

    jq -nc --arg ts "$ts" --arg agent "$AGENT" --arg q "$QUESTION" --arg d "$DECISION" --arg id "$id" \
      '{timestamp:$ts,agent:$agent,question:$q,decision:$d,id:$id}' >> "$PROJECT_DIR/.claude/escalations.jsonl"

    notify_escalation_captured "Escalation captured for $AGENT: $DECISION"

    if [ "$JSON_OUTPUT" = true ]; then
        jq -nc --arg status "ok" --arg id "$id" --arg timestamp "$ts" --arg agent "$AGENT" --arg context "$context_summary" \
          '{status:$status,decision_id:$id,timestamp:$timestamp,agent:$agent,context_summary:$context}'
    elif [ "$QUIET" != true ]; then
        echo "[PASS] Escalation captured: $id"
        echo "[INFO] Agent: $AGENT"
        echo "[INFO] Context: $context_summary"
    fi
}

COMMAND="${1:-}"
shift || true

while [ $# -gt 0 ]; do
    case "$1" in
        --project=*) PROJECT_DIR="${1#--project=}"; shift ;;
        --agent=*) AGENT="${1#--agent=}"; shift ;;
        --question=*) QUESTION="${1#--question=}"; shift ;;
        --decision=*) DECISION="${1#--decision=}"; shift ;;
        --context=*) CONTEXT="${1#--context=}"; shift ;;
        --reviewer=*) REVIEWER="${1#--reviewer=}"; shift ;;
        --annotation=*) ANNOTATION="${1#--annotation=}"; shift ;;
        --json) JSON_OUTPUT=true; shift ;;
        --quiet) QUIET=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "[FAIL] Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [ -z "$COMMAND" ] || [ "$COMMAND" = "capture" ]; then
    [ -n "$AGENT" ] || { echo "[FAIL] --agent is required" >&2; exit 1; }
    [ -n "$QUESTION" ] || { echo "[FAIL] --question is required" >&2; exit 1; }
    [ -n "$DECISION" ] || { echo "[FAIL] --decision is required" >&2; exit 1; }
    capture_entry
    exit 0
fi

echo "[FAIL] Unknown command: $COMMAND" >&2
exit 1

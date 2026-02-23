#!/bin/bash

# /go workflow support script for framework-evolution stories.
# Implements FR-020, FR-021, FR-027, FR-039 and integrates FR-026 hooks.

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PRD_FILE="genesis/2026-02-07-framework-evolution.md"
STORIES_DIR="docs/stories/framework-evolution"
STATE_DIR=".claude"
STORY_STATE_FILE="$STATE_DIR/go-story-status.json"
JSON_OUTPUT=false
BASE_REF=""

show_help() {
    cat <<'HELP'
/go Framework Support

USAGE:
  ./scripts/go-framework.sh dry-run [--prd=FILE] [--json]
  ./scripts/go-framework.sh review-only [--json]
  ./scripts/go-framework.sh prd-diff [--prd=FILE] [--base=GIT_REF] [--json]
  ./scripts/go-framework.sh incremental [--prd=FILE] [--base=GIT_REF] [--json]
  ./scripts/go-framework.sh mark-complete --story=STORY-001

OPTIONS:
  --prd=FILE             PRD path (default: genesis/2026-02-07-framework-evolution.md)
  --base=GIT_REF         Base ref for diff (default: working tree against HEAD)
  --story=STORY-001      Story id for mark-complete
  --json                 JSON output
  --help                 Show help
HELP
}

notify_hook() {
    local level="$1"
    local message="$2"
    if [ -f "$SCRIPT_DIR/notify.sh" ]; then
        # shellcheck source=/dev/null
        source "$SCRIPT_DIR/notify.sh"
        notify "$level" "$message" || true
    fi
}

story_files_csv() {
    local sid="$1"
    case "$sid" in
        STORY-001|STORY-002|STORY-003|STORY-004)
            echo "scripts/harvest.sh,scripts/memory.sh,scripts/escalation-capture.sh" ;;
        STORY-005|STORY-006|STORY-007)
            echo "parallel/swarm-queue.sh,parallel/swarm-scratchpad.sh,parallel/conflict-detector.sh" ;;
        STORY-008|STORY-009)
            echo "scripts/go-framework.sh,scripts/ops-dx.sh,scripts/cost-tracker.sh" ;;
        STORY-010)
            echo "scripts/dashboard.sh,scripts/notify.sh,scripts/registry.sh" ;;
        STORY-011)
            echo "scripts/go-framework.sh,scripts/semantic-search.sh,docs/stories/framework-evolution" ;;
        STORY-012)
            echo "scripts/advanced-ops.sh,scripts/compliance-evidence.sh,scripts/monorepo.sh,genesis/TEMPLATES" ;;
        *)
            echo "scripts,docs/stories" ;;
    esac
}

story_agents_csv() {
    local sid="$1"
    case "$sid" in
        STORY-001|STORY-002|STORY-003|STORY-004) echo "memory,coder,tester" ;;
        STORY-005|STORY-006|STORY-007) echo "swarm,coder,tester,security" ;;
        STORY-008|STORY-009) echo "go,review,tester" ;;
        STORY-010) echo "ops,status,analytics" ;;
        STORY-011) echo "go,memory,stories" ;;
        STORY-012) echo "security,devops,data-architect" ;;
        *) echo "go" ;;
    esac
}

list_story_ids() {
    find "$STORIES_DIR" -maxdepth 1 -type f -name 'STORY-*.md' 2>/dev/null \
      | xargs -n1 basename 2>/dev/null | sed 's/\.md$//' | awk -F'-' '{print $1 "-" $2}' | sort -u
}

extract_impacted_from_prd() {
    local prd="$1"
    local base="$2"
    local patch
    if [ -n "$base" ] && git rev-parse --verify "$base" >/dev/null 2>&1; then
        patch=$(git diff --unified=0 "$base" -- "$prd" 2>/dev/null || true)
    else
        patch=$(git diff --unified=0 -- "$prd" 2>/dev/null || true)
    fi

    local frs
    frs=$(echo "$patch" | grep -o 'FR-[0-9]\{3\}' | sort -u || true)

    local impacted="[]"
    if [ -z "$frs" ]; then
        echo "$impacted"
        return
    fi

    while IFS= read -r fr; do
        [ -z "$fr" ] && continue
        while IFS= read -r story_file; do
            [ -z "$story_file" ] && continue
            local sid
            sid=$(basename "$story_file" .md | cut -d'-' -f1-2)
            impacted=$(echo "$impacted" | jq --arg sid "$sid" --arg fr "$fr" \
              'if any(.[]; .story_id == $sid and .reason == $fr) then . else . + [{story_id:$sid,reason:$fr}] end')
        done < <(rg -l "$fr" "$STORIES_DIR" -g 'STORY-*.md' 2>/dev/null || true)
    done <<< "$frs"

    echo "$impacted"
}

cmd_dry_run() {
    local stories_json="[]"
    while IFS= read -r sid; do
        [ -z "$sid" ] && continue
        local files_json agents_json
        files_json=$(story_files_csv "$sid" | tr ',' '\n' | jq -R . | jq -s .)
        agents_json=$(story_agents_csv "$sid" | tr ',' '\n' | jq -R . | jq -s .)
        stories_json=$(echo "$stories_json" | jq --arg sid "$sid" --argjson files "$files_json" --argjson agents "$agents_json" \
          '. + [{story_id:$sid,agents:$agents,files:$files}]')
    done < <(list_story_ids)

    local out
    out=$(jq -nc --arg mode "dry-run" --arg prd "$PRD_FILE" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson stories "$stories_json" \
      '{status:"ok",mode:$mode,prd:$prd,timestamp:$ts,stories:$stories,summary:{story_count:($stories|length),mutations:false}}')

    notify_hook info "go dry-run completed"
    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "[PASS] Dry-run completed"
        echo "$out" | jq .
    fi
}

cmd_review_only() {
    local findings="[]"

    if ! bash "$SCRIPT_DIR/anvil.sh" check scripts >/dev/null 2>&1; then
        findings=$(echo "$findings" | jq '. + [{id:"review-anvil",severity:"warn",message:"Anvil check on scripts failed"}]')
    fi

    local banned_re
    banned_re='[T][O][D][O]|[F][I][X][M][E]|[P][L][A][C][E][H][O][L][D][E][R]|[S][T][U][B]|[H][A][C][K]|[X][X][X]|[W][I][P]|[T][E][M][P]|[C][O][M][I][N][G][[:space:]][S][O][O][N]|Not[I]mplemented[E]rror'
    if rg -n "$banned_re" scripts parallel docs/stories/framework-evolution >/dev/null 2>&1; then
        findings=$(echo "$findings" | jq '. + [{id:"review-banned",severity:"fail",message:"Banned patterns detected"}]')
    fi

    if ! command -v jq >/dev/null 2>&1; then
        findings=$(echo "$findings" | jq '. + [{id:"review-jq",severity:"fail",message:"jq not available"}]')
    fi

    local status="pass"
    if [ "$(echo "$findings" | jq 'length')" -gt 0 ]; then
        if echo "$findings" | jq -e 'any(.[]; .severity=="fail")' >/dev/null; then
            status="fail"
        else
            status="warn"
        fi
    fi

    local out
    out=$(jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg status "$status" --arg mode "review-only" --argjson findings "$findings" \
      '{status:$status,mode:$mode,timestamp:$ts,findings:$findings,summary:{finding_count:($findings|length)}}')

    notify_hook "$( [ "$status" = "fail" ] && echo error || echo success )" "go review-only completed with status=$status"
    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "$out" | jq .
    fi

    [ "$status" = "fail" ] && return 2 || return 0
}

cmd_prd_diff() {
    local impacted
    impacted=$(extract_impacted_from_prd "$PRD_FILE" "$BASE_REF")
    local change_count
    if [ -n "$BASE_REF" ] && git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
        change_count=$(git diff --unified=0 "$BASE_REF" -- "$PRD_FILE" 2>/dev/null | grep -c '^@@' || true)
    else
        change_count=$(git diff --unified=0 -- "$PRD_FILE" 2>/dev/null | grep -c '^@@' || true)
    fi

    local out
    out=$(jq -nc --arg prd "$PRD_FILE" --arg base "$BASE_REF" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson impacted "$impacted" --argjson cc "${change_count:-0}" \
      '{status:"ok",prd:$prd,base:(if $base=="" then "HEAD" else $base end),timestamp:$ts,impacted_stories:$impacted,summary:{hunks:$cc,impacted_count:($impacted|length)}}')

    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "$out" | jq .
    fi
}

ensure_story_state() {
    mkdir -p "$STATE_DIR"
    if [ ! -f "$STORY_STATE_FILE" ] || ! jq -e '.' "$STORY_STATE_FILE" >/dev/null 2>&1; then
        jq -nc '{completed:{},updated_at:null}' > "$STORY_STATE_FILE"
    fi
}

cmd_mark_complete() {
    local sid="$1"
    [ -n "$sid" ] || { echo "[FAIL] --story is required" >&2; return 1; }
    ensure_story_state
    local tmp
    tmp=$(mktemp)
    jq --arg sid "$sid" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.completed[$sid]=true | .updated_at=$ts' "$STORY_STATE_FILE" > "$tmp"
    mv "$tmp" "$STORY_STATE_FILE"
    echo "[PASS] Marked complete: $sid"
}

cmd_incremental() {
    ensure_story_state
    local impacted
    impacted=$(extract_impacted_from_prd "$PRD_FILE" "$BASE_REF")

    local run_plan="[]"
    local skipped="[]"
    local all
    all=$(list_story_ids)
    while IFS= read -r sid; do
        [ -z "$sid" ] && continue
        local is_impacted is_completed
        is_impacted=$(echo "$impacted" | jq --arg sid "$sid" 'any(.[]; .story_id==$sid)')
        is_completed=$(jq -r --arg sid "$sid" '.completed[$sid] // false' "$STORY_STATE_FILE")
        if [ "$is_impacted" = "true" ] && [ "$is_completed" != "true" ]; then
            run_plan=$(echo "$run_plan" | jq --arg sid "$sid" '. + [$sid]')
        else
            local reason="unaffected"
            if [ "$is_completed" = "true" ]; then
                reason="already_completed"
            fi
            skipped=$(echo "$skipped" | jq --arg sid "$sid" --arg reason "$reason" '. + [{story_id:$sid,reason:$reason}]')
        fi
    done <<< "$all"

    local out
    out=$(jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson impacted "$impacted" --argjson run "$run_plan" --argjson skipped "$skipped" \
      '{status:"ok",mode:"incremental",timestamp:$ts,impacted_stories:$impacted,run_plan:$run,skipped:$skipped,summary:{run_count:($run|length),skipped_count:($skipped|length)}}')

    notify_hook success "go incremental prepared: $(echo "$run_plan" | jq 'length') stories"
    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "$out" | jq .
    fi
}

COMMAND="${1:-}"
shift || true
MARK_STORY=""

while [ $# -gt 0 ]; do
    case "$1" in
        --prd=*) PRD_FILE="${1#--prd=}"; shift ;;
        --base=*) BASE_REF="${1#--base=}"; shift ;;
        --story=*) MARK_STORY="${1#--story=}"; shift ;;
        --json) JSON_OUTPUT=true; shift ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "[FAIL] Unknown option: $1" >&2; exit 1 ;;
    esac
done

case "$COMMAND" in
    dry-run) cmd_dry_run ;;
    review-only) cmd_review_only ;;
    prd-diff) cmd_prd_diff ;;
    incremental) cmd_incremental ;;
    mark-complete) cmd_mark_complete "$MARK_STORY" ;;
    ""|help) show_help ;;
    *) echo "[FAIL] Unknown command: $COMMAND" >&2; exit 1 ;;
esac

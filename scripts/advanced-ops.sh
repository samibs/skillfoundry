#!/bin/bash

# Advanced intelligence operations for framework evolution.
# Implements FR-033..FR-036, FR-038, FR-040 coverage helpers.

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JSON_OUTPUT=false

show_help() {
    cat <<'HELP'
Advanced Ops

USAGE:
  ./scripts/advanced-ops.sh compliance --profile=hipaa[,soc2,...] [--project=PATH] [--json]
  ./scripts/advanced-ops.sh monorepo-order [--root=PATH] [--json]
  ./scripts/advanced-ops.sh metrics-trend [--file=PATH] [--json]
  ./scripts/advanced-ops.sh template-inherit --base=FILE --overlay=FILE --out=FILE [--json]
HELP
}

secret_scan() {
    local target="$1"
    local tmp
    tmp=$(mktemp)
    if rg -n -i '(api[_-]?key|secret|password|token)[[:space:]]*[:=][[:space:]]*["'"'\''][^"'"'\'']{6,}' "$target" \
      -g '!**/.git/**' -g '!**/node_modules/**' > "$tmp" 2>/dev/null; then
        local count
        count=$(wc -l < "$tmp" | tr -d ' ')
        jq -nc --arg status "fail" --argjson count "$count" '{status:$status,findings:$count}'
    else
        jq -nc '{status:"pass",findings:0}'
    fi
    rm -f "$tmp"
}

dependency_audit() {
    local target="$1"
    local status="pass"
    local detail="No dependency manifest found"

    if [ -f "$target/package.json" ]; then
        if command -v npm >/dev/null 2>&1; then
            if npm audit --json --prefix "$target" >/dev/null 2>&1; then
                status="pass"; detail="npm audit passed"
            else
                status="warn"; detail="npm audit reported issues"
            fi
        else
            status="warn"; detail="npm manifest found but npm is unavailable"
        fi
    elif [ -f "$target/requirements.txt" ]; then
        if command -v pip-audit >/dev/null 2>&1; then
            if pip-audit -r "$target/requirements.txt" >/dev/null 2>&1; then
                status="pass"; detail="pip-audit passed"
            else
                status="warn"; detail="pip-audit reported issues"
            fi
        else
            status="warn"; detail="requirements.txt found but pip-audit is unavailable"
        fi
    fi

    jq -nc --arg status "$status" --arg detail "$detail" '{status:$status,detail:$detail}'
}

cmd_compliance() {
    local profiles_csv=""
    local project="."

    for arg in "$@"; do
        case "$arg" in
            --profile=*) profiles_csv="${arg#--profile=}" ;;
            --project=*) project="${arg#--project=}" ;;
            --json) JSON_OUTPUT=true ;;
            --help|-h) show_help; exit 0 ;;
            *) echo "[FAIL] Unknown option: $arg" >&2; exit 1 ;;
        esac
    done

    [ -n "$profiles_csv" ] || { echo "[FAIL] --profile is required" >&2; exit 1; }

    local baseline="pass"
    [ -f "$ROOT_DIR/docs/ANTI_PATTERNS_BREADTH.md" ] || baseline="warn"
    [ -f "$ROOT_DIR/docs/ANTI_PATTERNS_DEPTH.md" ] || baseline="warn"

    local profiles="[]"
    IFS=',' read -r -a profile_list <<< "$profiles_csv"
    for profile in "${profile_list[@]}"; do
        local check_script="$ROOT_DIR/compliance/$profile/checks.sh"
        [ -f "$check_script" ] || { echo "[FAIL] Unknown profile: $profile" >&2; exit 1; }
        local results
        results=$(bash "$check_script" "$project")
        local pass fail warn
        pass=$(echo "$results" | jq '[.[] | select(.status=="pass")] | length')
        fail=$(echo "$results" | jq '[.[] | select(.status=="fail")] | length')
        warn=$(echo "$results" | jq '[.[] | select(.status=="warn")] | length')
        profiles=$(echo "$profiles" | jq --arg profile "$profile" --argjson p "$pass" --argjson f "$fail" --argjson w "$warn" '. + [{profile:$profile,pass:$p,fail:$f,warn:$w}]')
    done

    local secret dependency
    secret=$(secret_scan "$project")
    dependency=$(dependency_audit "$project")

    local status="ok"
    if echo "$profiles" | jq -e 'any(.[]; .fail > 0)' >/dev/null; then
        status="warn"
    fi
    if [ "$(echo "$secret" | jq -r '.status')" = "fail" ]; then
        status="fail"
    fi

    local out
    out=$(jq -nc --arg status "$status" --arg baseline "$baseline" --argjson profiles "$profiles" --argjson secret "$secret" --argjson dep "$dependency" \
      '{status:$status,baseline_rules:$baseline,profiles:$profiles,secret_scan:$secret,dependency_scan:$dep}')

    if [ "$JSON_OUTPUT" = true ]; then
        echo "$out"
    else
        echo "$out" | jq .
    fi
}

cmd_monorepo_order() {
    local root="."
    for arg in "$@"; do
        case "$arg" in
            --root=*) root="${arg#--root=}" ;;
            --json) JSON_OUTPUT=true ;;
            *) echo "[FAIL] Unknown option: $arg" >&2; exit 1 ;;
        esac
    done

    local order_json
    order_json=$(bash "$SCRIPT_DIR/monorepo.sh" order --root="$root" --json)
    if [ "$JSON_OUTPUT" = true ]; then
        echo "$order_json"
    else
        echo "$order_json" | jq .
    fi
}

cmd_metrics_trend() {
    local file=".claude/costs/usage.jsonl"
    for arg in "$@"; do
        case "$arg" in
            --file=*) file="${arg#--file=}" ;;
            --json) JSON_OUTPUT=true ;;
            *) echo "[FAIL] Unknown option: $arg" >&2; exit 1 ;;
        esac
    done

    if [ ! -f "$file" ] || [ ! -s "$file" ]; then
        local empty='{"status":"ok","points":[],"summary":{"latest":0,"previous":0,"delta":0}}'
        [ "$JSON_OUTPUT" = true ] && echo "$empty" || echo "$empty" | jq .
        return 0
    fi

    local trend
    trend=$(jq -sc '
      map(. + {day:(.timestamp[0:10])})
      | group_by(.day)
      | map({day: .[0].day, tokens: (map(.tokens)|add), records: length})
      | sort_by(.day)
      | . as $pts
      | {
          status:"ok",
          points:$pts,
          summary:{
            latest: (if ($pts|length)>0 then $pts[-1].tokens else 0 end),
            previous: (if ($pts|length)>1 then $pts[-2].tokens else 0 end),
            delta: (if ($pts|length)>1 then ($pts[-1].tokens - $pts[-2].tokens) else 0 end)
          }
        }' "$file")

    [ "$JSON_OUTPUT" = true ] && echo "$trend" || echo "$trend" | jq .
}

cmd_template_inherit() {
    local base=""
    local overlay=""
    local out=""
    for arg in "$@"; do
        case "$arg" in
            --base=*) base="${arg#--base=}" ;;
            --overlay=*) overlay="${arg#--overlay=}" ;;
            --out=*) out="${arg#--out=}" ;;
            --json) JSON_OUTPUT=true ;;
            *) echo "[FAIL] Unknown option: $arg" >&2; exit 1 ;;
        esac
    done

    [ -f "$base" ] || { echo "[FAIL] Base template missing: $base" >&2; exit 1; }
    [ -f "$overlay" ] || { echo "[FAIL] Overlay template missing: $overlay" >&2; exit 1; }
    [ -n "$out" ] || { echo "[FAIL] --out is required" >&2; exit 1; }

    mkdir -p "$(dirname "$out")"
    {
        echo "<!-- inherited-from: $base -->"
        cat "$base"
        echo ""
        echo "<!-- overlay-from: $overlay -->"
        cat "$overlay"
    } > "$out"

    if [ "$JSON_OUTPUT" = true ]; then
        jq -nc --arg status "ok" --arg out "$out" '{status:$status,output:$out}'
    else
        echo "[PASS] Generated inherited template: $out"
    fi
}

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
    compliance) cmd_compliance "$@" ;;
    monorepo-order) cmd_monorepo_order "$@" ;;
    metrics-trend) cmd_metrics_trend "$@" ;;
    template-inherit) cmd_template_inherit "$@" ;;
    ""|help|--help|-h) show_help ;;
    *) echo "[FAIL] Unknown command: $COMMAND" >&2; exit 1 ;;
esac

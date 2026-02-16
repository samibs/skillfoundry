#!/bin/bash

# Attribution Tracker - Human vs AI code attribution
# Tracks which lines of code were written by AI agents vs humans.
# Creates baselines before agent sessions, calculates attribution after.
#
# USAGE:
#   ./scripts/attribution.sh baseline [--session=ID]
#   ./scripts/attribution.sh calculate [--session=ID]
#   ./scripts/attribution.sh report [--file=PATH] [--json] [--format=agent-trace]
#   ./scripts/attribution.sh trailer [--session=ID]
#   ./scripts/attribution.sh status
#   ./scripts/attribution.sh --help

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
ATTRIBUTION_DIR="${ATTRIBUTION_DIR:-.claude/attribution}"
ATTRIBUTION_FILE="$ATTRIBUTION_DIR/attribution.json"
BASELINE_DIR="$ATTRIBUTION_DIR/baselines"
JSON_OUTPUT=false
SESSION_ID=""
TARGET_FILE=""
OUTPUT_FORMAT="text"

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Attribution Tracker - Human vs AI code attribution"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/attribution.sh <command> [options]"
    echo ""
    echo "COMMANDS:"
    echo "  baseline              Snapshot working tree before agent session"
    echo "  calculate             Calculate attribution after agent session"
    echo "  report                Show attribution report"
    echo "  trailer               Output git commit trailer for current attribution"
    echo "  status                Show attribution tracking status"
    echo ""
    echo "OPTIONS:"
    echo "  --session=ID          Session identifier (default: auto-generated)"
    echo "  --file=PATH           Filter report to specific file"
    echo "  --json                Output in JSON format"
    echo "  --format=FORMAT       Output format: text (default), json, agent-trace"
    echo "  --help                Show this help message"
    echo ""
    echo "WORKFLOW:"
    echo "  1. Before agent session:  ./scripts/attribution.sh baseline"
    echo "  2. Agent does work..."
    echo "  3. After agent session:   ./scripts/attribution.sh calculate"
    echo "  4. View results:          ./scripts/attribution.sh report"
    echo "  5. Add to commit:         git commit -m \"\$(./scripts/attribution.sh trailer)\""
}

parse_args() {
    COMMAND="${1:-}"
    shift 2>/dev/null || true

    while [[ $# -gt 0 ]]; do
        case $1 in
            --session=*)
                SESSION_ID="${1#*=}"
                shift
                ;;
            --file=*)
                TARGET_FILE="${1#*=}"
                shift
                ;;
            --json)
                JSON_OUTPUT=true
                OUTPUT_FORMAT="json"
                shift
                ;;
            --format=*)
                OUTPUT_FORMAT="${1#*=}"
                if [ "$OUTPUT_FORMAT" = "json" ]; then
                    JSON_OUTPUT=true
                fi
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done

    if [ -z "$SESSION_ID" ]; then
        SESSION_ID="session_$(date +%Y%m%d_%H%M%S)"
    fi
}

# ═══════════════════════════════════════════════════════════════
# INITIALIZATION
# ═══════════════════════════════════════════════════════════════

init_attribution() {
    mkdir -p "$ATTRIBUTION_DIR"
    mkdir -p "$BASELINE_DIR"

    if [ ! -f "$ATTRIBUTION_FILE" ]; then
        local timestamp
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        cat > "$ATTRIBUTION_FILE" <<EOF
{
  "version": "1.0",
  "created": "$timestamp",
  "updated": "$timestamp",
  "sessions": [],
  "files": {}
}
EOF
    fi
}

# ═══════════════════════════════════════════════════════════════
# BASELINE - Snapshot before agent session
# ═══════════════════════════════════════════════════════════════

cmd_baseline() {
    init_attribution

    local baseline_file="$BASELINE_DIR/${SESSION_ID}.baseline"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Capture current state of all tracked files
    # Use git diff --stat against HEAD to know current working state
    # Store the commit hash as the baseline reference point
    local head_hash
    head_hash=$(git rev-parse HEAD 2>/dev/null || echo "none")

    # Record all tracked file checksums
    local file_list
    file_list=$(git ls-files 2>/dev/null || true)

    cat > "$baseline_file" <<EOF
{
  "session_id": "$SESSION_ID",
  "timestamp": "$timestamp",
  "head_commit": "$head_hash",
  "tracked_files": $(echo "$file_list" | jq -R -s 'split("\n") | map(select(length > 0))'),
  "file_hashes": {
EOF

    local first=true
    while IFS= read -r file; do
        if [ -n "$file" ] && [ -f "$file" ]; then
            local hash
            hash=$(git hash-object "$file" 2>/dev/null || echo "untracked")
            local lines
            lines=$(wc -l < "$file" 2>/dev/null || echo "0")
            if [ "$first" = true ]; then
                first=false
            else
                echo "," >> "$baseline_file"
            fi
            printf '    %s: {"hash": "%s", "lines": %s}' \
                "$(echo "$file" | jq -R .)" "$hash" "$lines" >> "$baseline_file"
        fi
    done <<< "$file_list"

    cat >> "$baseline_file" <<EOF

  }
}
EOF

    echo -e "${GREEN}[PASS]${NC} Baseline created"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Session:  $SESSION_ID"
    echo "Commit:   ${head_hash:0:12}"
    echo "Files:    $(echo "$file_list" | grep -c . || echo "0") tracked"
    echo "Stored:   $baseline_file"
    echo ""
    echo "Next: Run your agent session, then:"
    echo "  ./scripts/attribution.sh calculate --session=$SESSION_ID"
}

# ═══════════════════════════════════════════════════════════════
# CALCULATE - Compute attribution after agent session
# ═══════════════════════════════════════════════════════════════

cmd_calculate() {
    init_attribution

    local baseline_file="$BASELINE_DIR/${SESSION_ID}.baseline"
    if [ ! -f "$baseline_file" ]; then
        echo -e "${RED}Error: No baseline found for session $SESSION_ID${NC}"
        echo "Run: ./scripts/attribution.sh baseline --session=$SESSION_ID"
        exit 1
    fi

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local head_before
    head_before=$(jq -r '.head_commit' "$baseline_file")

    # Get all files that changed since baseline
    local total_agent_lines=0
    local total_lines=0
    local files_created=0
    local files_modified=0
    local result_file="$ATTRIBUTION_DIR/${SESSION_ID}.result.json"

    echo "{" > "$result_file"
    echo "  \"session_id\": \"$SESSION_ID\"," >> "$result_file"
    echo "  \"calculated_at\": \"$timestamp\"," >> "$result_file"
    echo "  \"baseline_commit\": \"$head_before\"," >> "$result_file"
    echo "  \"files\": {" >> "$result_file"

    local first=true

    # Check git diff for modified files
    local changed_files
    if [ "$head_before" != "none" ]; then
        changed_files=$(git diff --name-only "$head_before" HEAD 2>/dev/null || true)
        # Also include unstaged/staged changes not yet committed
        local working_changes
        working_changes=$(git diff --name-only HEAD 2>/dev/null || true)
        local staged_changes
        staged_changes=$(git diff --cached --name-only 2>/dev/null || true)
        changed_files=$(printf '%s\n%s\n%s' "$changed_files" "$working_changes" "$staged_changes" | sort -u | grep -v '^$' || true)
    else
        changed_files=$(git diff --name-only 2>/dev/null || true)
    fi

    # Also check for untracked new files
    local new_files
    new_files=$(git ls-files --others --exclude-standard 2>/dev/null || true)
    changed_files=$(printf '%s\n%s' "$changed_files" "$new_files" | sort -u | grep -v '^$' || true)

    while IFS= read -r file; do
        if [ -z "$file" ] || [ ! -f "$file" ]; then
            continue
        fi

        local current_lines
        current_lines=$(wc -l < "$file" 2>/dev/null || echo "0")
        current_lines=$((current_lines))
        total_lines=$((total_lines + current_lines))

        # Check if file existed in baseline
        local baseline_hash
        baseline_hash=$(jq -r --arg f "$file" '.file_hashes[$f].hash // "new"' "$baseline_file" 2>/dev/null || echo "new")
        local baseline_lines
        baseline_lines=$(jq -r --arg f "$file" '.file_hashes[$f].lines // 0' "$baseline_file" 2>/dev/null || echo "0")
        baseline_lines=$((baseline_lines))

        local agent_lines=0
        local status="unchanged"

        if [ "$baseline_hash" = "new" ]; then
            # Entirely new file - 100% agent
            agent_lines=$current_lines
            status="created"
            files_created=$((files_created + 1))
        else
            # Modified file - count changed lines
            if [ "$head_before" != "none" ]; then
                agent_lines=$(git diff "$head_before" -- "$file" 2>/dev/null | grep -c '^+[^+]' || echo "0")
            else
                agent_lines=$(git diff -- "$file" 2>/dev/null | grep -c '^+[^+]' || echo "0")
            fi
            # Also count working tree changes
            local working_additions
            working_additions=$(git diff HEAD -- "$file" 2>/dev/null | grep -c '^+[^+]' || echo "0")
            agent_lines=$((agent_lines + working_additions))

            if [ "$agent_lines" -gt 0 ]; then
                status="modified"
                files_modified=$((files_modified + 1))
            fi
        fi

        total_agent_lines=$((total_agent_lines + agent_lines))

        local pct=0
        if [ "$current_lines" -gt 0 ]; then
            pct=$((agent_lines * 100 / current_lines))
        fi

        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$result_file"
        fi

        printf '    %s: {"status": "%s", "total_lines": %d, "agent_lines": %d, "human_lines": %d, "agent_pct": %d}' \
            "$(echo "$file" | jq -R .)" "$status" "$current_lines" "$agent_lines" "$((current_lines - agent_lines))" "$pct" >> "$result_file"

    done <<< "$changed_files"

    local overall_pct=0
    if [ "$total_lines" -gt 0 ]; then
        overall_pct=$((total_agent_lines * 100 / total_lines))
    fi

    cat >> "$result_file" <<EOF

  },
  "summary": {
    "files_created": $files_created,
    "files_modified": $files_modified,
    "total_agent_lines": $total_agent_lines,
    "total_lines_in_changed_files": $total_lines,
    "overall_agent_pct": $overall_pct
  }
}
EOF

    if [ "$JSON_OUTPUT" = true ]; then
        cat "$result_file"
    else
        echo -e "${GREEN}[PASS]${NC} Attribution calculated"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Session:         $SESSION_ID"
        echo "Files created:   $files_created"
        echo "Files modified:  $files_modified"
        echo "Agent lines:     $total_agent_lines / $total_lines ($overall_pct%)"
        echo "Human lines:     $((total_lines - total_agent_lines)) / $total_lines ($((100 - overall_pct))%)"
        echo ""
        echo "Per-file breakdown:"
        while IFS= read -r file; do
            if [ -z "$file" ] || [ ! -f "$file" ]; then continue; fi
            local info
            info=$(jq -r --arg f "$file" '.files[$f] // empty | "\(.status) \(.agent_lines)/\(.total_lines) (\(.agent_pct)%)"' "$result_file" 2>/dev/null || true)
            if [ -n "$info" ]; then
                local file_status
                file_status=$(echo "$info" | cut -d' ' -f1)
                local icon="~"
                [ "$file_status" = "created" ] && icon="+"
                echo "  $icon $file: $info"
            fi
        done <<< "$changed_files"
    fi
}

# ═══════════════════════════════════════════════════════════════
# REPORT - Show attribution summary
# ═══════════════════════════════════════════════════════════════

cmd_report() {
    init_attribution

    local result_files
    result_files=$(find "$ATTRIBUTION_DIR" -name "*.result.json" -type f 2>/dev/null | sort -r)

    if [ -z "$result_files" ]; then
        echo -e "${YELLOW}No attribution data found.${NC}"
        echo "Run: ./scripts/attribution.sh baseline && <agent work> && ./scripts/attribution.sh calculate"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}ATTRIBUTION REPORT${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local grand_agent=0
    local grand_total=0
    local session_count=0

    while IFS= read -r result; do
        if [ -z "$result" ]; then continue; fi
        session_count=$((session_count + 1))

        local sid
        sid=$(jq -r '.session_id' "$result")
        local calc_at
        calc_at=$(jq -r '.calculated_at' "$result")
        local created
        created=$(jq -r '.summary.files_created' "$result")
        local modified
        modified=$(jq -r '.summary.files_modified' "$result")
        local agent_lines
        agent_lines=$(jq -r '.summary.total_agent_lines' "$result")
        local total_lines
        total_lines=$(jq -r '.summary.total_lines_in_changed_files' "$result")
        local pct
        pct=$(jq -r '.summary.overall_agent_pct' "$result")

        grand_agent=$((grand_agent + agent_lines))
        grand_total=$((grand_total + total_lines))

        if [ -n "$TARGET_FILE" ]; then
            local file_info
            file_info=$(jq -r --arg f "$TARGET_FILE" '.files[$f] // empty' "$result" 2>/dev/null)
            if [ -n "$file_info" ]; then
                echo ""
                echo "Session: $sid ($calc_at)"
                echo "  File: $TARGET_FILE"
                echo "  $(echo "$file_info" | jq -r '"Status: \(.status) | Agent: \(.agent_lines)/\(.total_lines) (\(.agent_pct)%)"')"
            fi
        else
            echo ""
            echo "Session: $sid"
            echo "  Date:     $calc_at"
            echo "  Created:  $created files | Modified: $modified files"
            echo "  Agent:    $agent_lines lines ($pct%)"
        fi
    done <<< "$result_files"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    local grand_pct=0
    if [ "$grand_total" -gt 0 ]; then
        grand_pct=$((grand_agent * 100 / grand_total))
    fi
    echo "Total: $session_count sessions | Agent: $grand_agent/$grand_total lines ($grand_pct%)"
}

# ═══════════════════════════════════════════════════════════════
# TRAILER - Output git commit trailer
# ═══════════════════════════════════════════════════════════════

cmd_trailer() {
    init_attribution

    # Find most recent result
    local latest
    latest=$(find "$ATTRIBUTION_DIR" -name "*.result.json" -type f 2>/dev/null | sort -r | head -1)

    if [ -z "$latest" ]; then
        echo -e "${YELLOW}No attribution data. Run baseline + calculate first.${NC}"
        exit 1
    fi

    local agent_lines
    agent_lines=$(jq -r '.summary.total_agent_lines' "$latest")
    local total_lines
    total_lines=$(jq -r '.summary.total_lines_in_changed_files' "$latest")
    local pct
    pct=$(jq -r '.summary.overall_agent_pct' "$latest")
    local sid
    sid=$(jq -r '.session_id' "$latest")

    echo "Claude-AS-Attribution: ${pct}% agent (${agent_lines}/${total_lines} lines)"
    echo "Claude-AS-Session: $sid"
}

# ═══════════════════════════════════════════════════════════════
# STATUS
# ═══════════════════════════════════════════════════════════════

cmd_status() {
    init_attribution

    local baseline_count
    baseline_count=$(find "$BASELINE_DIR" -name "*.baseline" -type f 2>/dev/null | wc -l || echo "0")
    local result_count
    result_count=$(find "$ATTRIBUTION_DIR" -name "*.result.json" -type f 2>/dev/null | wc -l || echo "0")

    echo -e "${CYAN}ATTRIBUTION STATUS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Baselines:  $baseline_count"
    echo "Results:    $result_count"
    echo "Directory:  $ATTRIBUTION_DIR"

    if [ "$result_count" -gt 0 ]; then
        local latest
        latest=$(find "$ATTRIBUTION_DIR" -name "*.result.json" -type f 2>/dev/null | sort -r | head -1)
        local pct
        pct=$(jq -r '.summary.overall_agent_pct' "$latest")
        echo "Latest:     ${pct}% agent attribution"
    fi
}

# ═══════════════════════════════════════════════════════════════
# AGENT TRACE FORMAT - Industry-standard attribution output
# ═══════════════════════════════════════════════════════════════

cmd_report_agent_trace() {
    init_attribution

    # Find most recent result
    local latest
    latest=$(find "$ATTRIBUTION_DIR" -name "*.result.json" -type f 2>/dev/null | sort -r | head -1)

    if [ -z "$latest" ]; then
        echo '{"error": "No attribution data found"}'
        exit 0
    fi

    local sid
    sid=$(jq -r '.session_id' "$latest")
    local calc_at
    calc_at=$(jq -r '.calculated_at' "$latest")
    local framework_version
    framework_version=$(cat .version 2>/dev/null || echo "unknown")

    # Read session data for decisions (if session-recorder data exists)
    local session_dir="logs/sessions"
    local session_file=""
    if [ -d "$session_dir" ]; then
        session_file=$(find "$session_dir" -name "*${sid}*" -o -name "*.jsonl" 2>/dev/null | sort -r | head -1 || true)
    fi

    # Build traces array
    local traces="[]"

    # Add file_edit traces from attribution result
    local file_traces
    file_traces=$(jq -r '.files | to_entries[] | select(.value.status != "unchanged") | @json' "$latest" 2>/dev/null || true)

    if [ -n "$file_traces" ]; then
        traces=$(echo "$file_traces" | jq -s '[.[] | fromjson | {
            type: "file_edit",
            timestamp: "'$calc_at'",
            file: .key,
            lines_added: .value.agent_lines,
            lines_removed: 0,
            total_lines: .value.total_lines,
            attribution: (if .value.agent_pct > 50 then "agent" else "human" end),
            agent_pct: .value.agent_pct
        }]' 2>/dev/null || echo "[]")
    fi

    # Add decision traces from session recorder (if available)
    if [ -n "$session_file" ] && [ -f "$session_file" ]; then
        local decision_traces
        decision_traces=$(grep '"type":"decision"' "$session_file" 2>/dev/null | jq -s '[.[] | {
            type: "decision",
            timestamp: .timestamp,
            what: .what,
            why: .why,
            confidence: (.confidence // 0.8)
        }]' 2>/dev/null || echo "[]")

        if [ "$decision_traces" != "[]" ]; then
            traces=$(echo "$traces" "$decision_traces" | jq -s 'add | sort_by(.timestamp)' 2>/dev/null || echo "$traces")
        fi
    fi

    # Build summary from attribution result
    local files_modified
    files_modified=$(jq -r '.summary.files_created + .summary.files_modified' "$latest")
    local agent_lines
    agent_lines=$(jq -r '.summary.total_agent_lines' "$latest")
    local total_lines
    total_lines=$(jq -r '.summary.total_lines_in_changed_files' "$latest")
    local agent_pct
    agent_pct=$(jq -r '.summary.overall_agent_pct' "$latest")
    local decisions_count
    decisions_count=$(echo "$traces" | jq '[.[] | select(.type == "decision")] | length' 2>/dev/null || echo "0")
    local file_edits_count
    file_edits_count=$(echo "$traces" | jq '[.[] | select(.type == "file_edit")] | length' 2>/dev/null || echo "0")

    # Determine agent name from session data or default
    local agent_name="unknown"
    if [ -n "$session_file" ] && [ -f "$session_file" ]; then
        agent_name=$(grep '"agent"' "$session_file" 2>/dev/null | head -1 | jq -r '.agent // "unknown"' 2>/dev/null || echo "unknown")
    fi

    # Output Agent Trace JSON
    jq -nc \
        --arg version "0.1" \
        --arg sid "$sid" \
        --arg agent "$agent_name" \
        --arg framework "claude-as" \
        --arg fw_version "$framework_version" \
        --arg calc_at "$calc_at" \
        --argjson traces "$traces" \
        --argjson files_modified "$files_modified" \
        --argjson lines_added "$agent_lines" \
        --argjson lines_removed 0 \
        --argjson total_lines "$total_lines" \
        --argjson agent_pct "$agent_pct" \
        --argjson decisions "$decisions_count" \
        --argjson file_edits "$file_edits_count" \
        '{
            version: $version,
            session_id: $sid,
            agent: $agent,
            framework: $framework,
            framework_version: $fw_version,
            generated_at: $calc_at,
            traces: $traces,
            summary: {
                files_modified: $files_modified,
                lines_added: $lines_added,
                lines_removed: $lines_removed,
                total_lines_in_scope: $total_lines,
                agent_attribution_pct: $agent_pct,
                decisions_made: $decisions,
                file_edits: $file_edits
            }
        }'
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

parse_args "$@"

case "$COMMAND" in
    baseline)
        cmd_baseline
        ;;
    calculate)
        cmd_calculate
        ;;
    report)
        if [ "$OUTPUT_FORMAT" = "agent-trace" ]; then
            cmd_report_agent_trace
        else
            cmd_report
        fi
        ;;
    trailer)
        cmd_trailer
        ;;
    status)
        cmd_status
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {baseline|calculate|report|trailer|status} [options]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

#!/bin/bash

# Session Monitor — Detect erratic LLM agent behavior in real-time
#
# Runs as a Claude Code PostToolUse hook on Bash commands. Tracks command
# patterns, consecutive failures, service restart loops, and self-inflicted
# regressions. Injects diagnostic nudges back into the agent's context
# when erratic patterns are detected.
#
# HOOK INTEGRATION:
#   Receives JSON on stdin with: session_id, cwd, tool_name, tool_input, tool_output, exit_code
#   Exit 0 = allow (no feedback)
#   Exit 2 = inject feedback to agent (stderr becomes context)
#
# STATE FILE:
#   $PROJECT_DIR/.claude/session-monitor-state.json
#   Tracks: command history, failure counts, service restarts, modified files
#
# LOG FILE:
#   $FRAMEWORK_DIR/logs/session-monitor.jsonl
#   Structured log of all detected patterns (harvested by auto-harvest)

set -o pipefail

# ── Read hook input ─────────────────────────────────────────────────────────

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

# Only monitor Bash tool calls
[ "$TOOL_NAME" != "Bash" ] && exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."' 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // ""' 2>/dev/null)
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_input.exit_code // "0"' 2>/dev/null)

# Also try to get exit code from the output wrapper
if [ "$EXIT_CODE" = "0" ] || [ "$EXIT_CODE" = "null" ]; then
    if echo "$TOOL_OUTPUT" | grep -q "Exit code [0-9]"; then
        EXIT_CODE=$(echo "$TOOL_OUTPUT" | grep -oP 'Exit code \K[0-9]+' | tail -1)
    fi
fi

[ -z "$TOOL_INPUT" ] && exit 0

# ── Framework paths ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo ".")"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd || echo "$HOME/dev_tools_20260120_latest/skillfoundry")"
STATE_DIR="$CWD/.claude"
STATE_FILE="$STATE_DIR/session-monitor-state.json"
LOG_DIR="$FRAMEWORK_DIR/logs"
LOG_FILE="$LOG_DIR/session-monitor.jsonl"

mkdir -p "$STATE_DIR" "$LOG_DIR" 2>/dev/null || true

# ── State management ────────────────────────────────────────────────────────

now_ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
now_epoch() { date +%s; }

load_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo '{
            "session_id": "'"$SESSION_ID"'",
            "started_at": "'"$(now_ts)"'",
            "consecutive_failures": 0,
            "last_error_signature": "",
            "last_error_command": "",
            "total_commands": 0,
            "total_failures": 0,
            "service_restarts": {},
            "source_env_attempts": 0,
            "modified_files": [],
            "alerts_sent": 0,
            "last_alert_epoch": 0
        }'
    fi
}

save_state() {
    local state="$1"
    echo "$state" | jq '.' > "$STATE_FILE" 2>/dev/null || echo "$state" > "$STATE_FILE"
}

log_pattern() {
    local pattern="$1"
    local severity="$2"
    local detail="$3"
    local entry
    entry=$(jq -nc \
        --arg ts "$(now_ts)" \
        --arg sid "$SESSION_ID" \
        --arg cwd "$CWD" \
        --arg pattern "$pattern" \
        --arg severity "$severity" \
        --arg detail "$detail" \
        --arg command "$TOOL_INPUT" \
        '{timestamp: $ts, session_id: $sid, cwd: $cwd, pattern: $pattern, severity: $severity, detail: $detail, command: $command}')
    echo "$entry" >> "$LOG_FILE" 2>/dev/null || true
}

# ── Throttle alerts (max 1 per 30 seconds) ──────────────────────────────────

should_alert() {
    local state="$1"
    local last_alert
    last_alert=$(echo "$state" | jq -r '.last_alert_epoch // 0')
    local now
    now=$(now_epoch)
    local diff=$((now - last_alert))
    [ "$diff" -ge 30 ]
}

# ── Pattern detectors ───────────────────────────────────────────────────────

# Extract a normalized error signature from output (strip paths, line numbers, timestamps)
error_signature() {
    local output="$1"
    echo "$output" | grep -iE "error|fatal|cannot|failed|denied|not found|ENOENT|syntax error" | head -3 | \
        sed 's|/[^ ]*||g; s|line [0-9]*||g; s|[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}||g' | \
        tr '[:upper:]' '[:lower:]' | tr -s ' ' | head -c 200
}

# Check if two error signatures are similar (>50% word overlap)
errors_similar() {
    local sig1="$1" sig2="$2"
    [ -z "$sig1" ] || [ -z "$sig2" ] && return 1
    local words1 words2 common total
    words1=$(echo "$sig1" | tr ' ' '\n' | sort -u)
    words2=$(echo "$sig2" | tr ' ' '\n' | sort -u)
    common=$(comm -12 <(echo "$words1") <(echo "$words2") | wc -l)
    total=$(echo -e "$words1\n$words2" | sort -u | wc -l)
    [ "$total" -eq 0 ] && return 1
    local pct=$((common * 100 / total))
    [ "$pct" -ge 50 ]
}

# ── DETECTOR 1: source .env ─────────────────────────────────────────────────

detect_source_env() {
    if echo "$TOOL_INPUT" | grep -qE '^\s*(source|\.)\s+.*\.env'; then
        local state="$1"
        local attempts
        attempts=$(echo "$state" | jq -r '.source_env_attempts // 0')
        attempts=$((attempts + 1))
        state=$(echo "$state" | jq ".source_env_attempts = $attempts")
        save_state "$state"

        log_pattern "SOURCE_DOTENV" "CRITICAL" "Agent used 'source .env' (attempt #$attempts). .env files contain bash-unsafe characters."

        # Always block source .env — exit 2 injects feedback
        echo "SESSION MONITOR: NEVER use 'source .env' — .env files are NOT bash scripts. They contain characters like <, >, |, & that bash interprets as operators. Extract specific values with: grep '^KEY=' .env | cut -d= -f2-" >&2
        exit 2
    fi
}

# ── DETECTOR 2: Consecutive failures (2-Failure Rule) ───────────────────────

detect_consecutive_failures() {
    local state="$1"
    [ "$EXIT_CODE" = "0" ] && {
        # Reset on success
        state=$(echo "$state" | jq '.consecutive_failures = 0 | .last_error_signature = "" | .last_error_command = ""')
        save_state "$state"
        return
    }

    local current_sig
    current_sig=$(error_signature "$TOOL_OUTPUT")
    local last_sig
    last_sig=$(echo "$state" | jq -r '.last_error_signature // ""')
    local consec
    consec=$(echo "$state" | jq -r '.consecutive_failures // 0')

    if errors_similar "$current_sig" "$last_sig"; then
        consec=$((consec + 1))
    else
        consec=1
    fi

    state=$(echo "$state" | jq \
        --arg sig "$current_sig" \
        --arg cmd "$TOOL_INPUT" \
        --argjson consec "$consec" \
        '.consecutive_failures = $consec | .last_error_signature = $sig | .last_error_command = $cmd')

    local total_fail
    total_fail=$(echo "$state" | jq -r '.total_failures // 0')
    state=$(echo "$state" | jq ".total_failures = $((total_fail + 1))")
    save_state "$state"

    if [ "$consec" -ge 3 ]; then
        log_pattern "RETRY_LOOP" "CRITICAL" "Same error $consec consecutive times. Agent is in a retry loop."
        if should_alert "$state"; then
            state=$(echo "$state" | jq ".last_alert_epoch = $(now_epoch) | .alerts_sent = (.alerts_sent + 1)")
            save_state "$state"
            echo "SESSION MONITOR: STOP. You have hit the same error $consec times in a row. Do NOT retry the same command. Switch to diagnostic mode: read the error message, run inspection commands (which, ls, cat), form a hypothesis, then try a DIFFERENT approach." >&2
            exit 2
        fi
    elif [ "$consec" -ge 2 ]; then
        log_pattern "TWO_FAILURE_RULE" "HIGH" "Same error 2 consecutive times. 2-Failure Rule triggered."
        if should_alert "$state"; then
            state=$(echo "$state" | jq ".last_alert_epoch = $(now_epoch) | .alerts_sent = (.alerts_sent + 1)")
            save_state "$state"
            echo "SESSION MONITOR: 2-Failure Rule — you've failed twice with a similar error. Before retrying, diagnose: read the error output carefully, check if the issue is in a file YOU modified this session, and inspect the environment (paths, permissions, installed packages)." >&2
            exit 2
        fi
    fi
}

# ── DETECTOR 3: Service restart loops ────────────────────────────────────────

detect_restart_loop() {
    local state="$1"

    # Detect pm2 restart/start/delete commands
    local service_name=""
    if echo "$TOOL_INPUT" | grep -qE 'pm2\s+(restart|start|delete)'; then
        service_name=$(echo "$TOOL_INPUT" | grep -oP 'pm2\s+(restart|start|delete)\s+\K[^\s]+' | head -1)
    elif echo "$TOOL_INPUT" | grep -qE 'docker\s+(restart|start|stop)'; then
        service_name=$(echo "$TOOL_INPUT" | grep -oP 'docker\s+(restart|start|stop)\s+\K[^\s]+' | head -1)
    elif echo "$TOOL_INPUT" | grep -qE 'systemctl\s+(restart|start|stop)'; then
        service_name=$(echo "$TOOL_INPUT" | grep -oP 'systemctl\s+(restart|start|stop)\s+\K[^\s]+' | head -1)
    fi

    [ -z "$service_name" ] && return

    # Increment restart count for this service
    local restart_count
    restart_count=$(echo "$state" | jq -r ".service_restarts[\"$service_name\"] // 0")
    restart_count=$((restart_count + 1))
    state=$(echo "$state" | jq ".service_restarts[\"$service_name\"] = $restart_count")
    save_state "$state"

    if [ "$restart_count" -ge 3 ]; then
        log_pattern "RESTART_LOOP" "CRITICAL" "Service '$service_name' restarted $restart_count times this session."
        if should_alert "$state"; then
            state=$(echo "$state" | jq ".last_alert_epoch = $(now_epoch) | .alerts_sent = (.alerts_sent + 1)")
            save_state "$state"
            echo "SESSION MONITOR: Service '$service_name' has been restarted $restart_count times this session. STOP restarting blindly. Read the FULL error log first: pm2 logs $service_name --nostream --lines 50. Check if the error is in a file you modified (git diff --name-only). Fix ALL issues before the next restart." >&2
            exit 2
        fi
    elif [ "$restart_count" -ge 2 ]; then
        log_pattern "SERVICE_RESTART_REPEAT" "HIGH" "Service '$service_name' restarted $restart_count times."
        # Check if agent read logs before restarting
        local read_logs
        read_logs=$(echo "$state" | jq -r ".last_logs_read_service // \"\"")
        if [ "$read_logs" != "$service_name" ]; then
            if should_alert "$state"; then
                state=$(echo "$state" | jq ".last_alert_epoch = $(now_epoch) | .alerts_sent = (.alerts_sent + 1)")
                save_state "$state"
                echo "SESSION MONITOR: You're restarting '$service_name' again without reading its error logs first. Run: pm2 logs $service_name --nostream --lines 30 — then diagnose before restarting." >&2
                exit 2
            fi
        fi
    fi

    # Track if this was a logs read (for restart-without-logs detection)
    if echo "$TOOL_INPUT" | grep -qE 'pm2\s+logs'; then
        local logs_service
        logs_service=$(echo "$TOOL_INPUT" | grep -oP 'pm2\s+logs\s+\K[^\s]+' | head -1)
        if [ -n "$logs_service" ]; then
            state=$(echo "$state" | jq --arg s "$logs_service" '.last_logs_read_service = $s')
            save_state "$state"
        fi
    fi
}

# ── DETECTOR 4: Self-inflicted regression detection ─────────────────────────

detect_self_inflicted() {
    local state="$1"

    # Track git-modified files
    if echo "$TOOL_INPUT" | grep -qE '^git\s+(add|commit)'; then
        # After a commit, snapshot the modified files
        local modified
        modified=$(cd "$CWD" 2>/dev/null && git diff --name-only HEAD~1 2>/dev/null | head -20 | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || echo '[]')
        state=$(echo "$state" | jq --argjson files "$modified" '.modified_files = (.modified_files + $files | unique)')
        save_state "$state"
        return
    fi

    # Also track files written/edited this session via Edit/Write tool outputs would go here
    # For bash, track files modified via sed, tee, etc.
    if echo "$TOOL_INPUT" | grep -qE '(sed\s+-i|tee\s|>\s|>>)\s'; then
        local target_file
        target_file=$(echo "$TOOL_INPUT" | grep -oP '(?:>\s*|>>\s*|sed\s+-i[^\s]*\s+[^\s]+\s+)(\S+)' | tail -1)
        if [ -n "$target_file" ]; then
            state=$(echo "$state" | jq --arg f "$target_file" '.modified_files = (.modified_files + [$f] | unique)')
            save_state "$state"
        fi
    fi

    # Check if error output references files we modified
    if [ "$EXIT_CODE" != "0" ] && [ -n "$TOOL_OUTPUT" ]; then
        local modified_files
        modified_files=$(echo "$state" | jq -r '.modified_files[]? // empty' 2>/dev/null)
        [ -z "$modified_files" ] && return

        while IFS= read -r mfile; do
            [ -z "$mfile" ] && continue
            local basename_file
            basename_file=$(basename "$mfile" 2>/dev/null)
            if echo "$TOOL_OUTPUT" | grep -q "$basename_file"; then
                log_pattern "SELF_INFLICTED" "HIGH" "Error references '$mfile' which was modified this session. This is likely YOUR change, not pre-existing."
                # Don't exit 2 here — just log. The consecutive failure detector handles the nudge.
                return
            fi
        done <<< "$modified_files"
    fi
}

# ── DETECTOR 5: Restart without prior log read ──────────────────────────────

detect_restart_without_logs() {
    local state="$1"

    # If this is a restart command, check if we read logs recently
    if echo "$TOOL_INPUT" | grep -qE 'pm2\s+restart'; then
        local service_name
        service_name=$(echo "$TOOL_INPUT" | grep -oP 'pm2\s+restart\s+\K[^\s]+' | head -1)
        [ -z "$service_name" ] && return

        local read_service
        read_service=$(echo "$state" | jq -r '.last_logs_read_service // ""')

        if [ "$read_service" != "$service_name" ]; then
            log_pattern "RESTART_WITHOUT_LOGS" "MEDIUM" "Restarting '$service_name' without reading its logs first."
        fi
    fi
}

# ── Main execution ──────────────────────────────────────────────────────────

STATE=$(load_state)

# Increment total commands
total_cmds=$(echo "$STATE" | jq -r '.total_commands // 0')
STATE=$(echo "$STATE" | jq ".total_commands = $((total_cmds + 1))")

# Reset state if session_id changed
stored_sid=$(echo "$STATE" | jq -r '.session_id // ""')
if [ "$stored_sid" != "$SESSION_ID" ] && [ "$stored_sid" != "" ]; then
    # New session — archive old state and reset
    if [ -f "$STATE_FILE" ]; then
        local_archive="$STATE_DIR/session-monitor-archive.jsonl"
        cat "$STATE_FILE" >> "$local_archive" 2>/dev/null || true
    fi
    STATE=$(load_state | jq --arg sid "$SESSION_ID" '.session_id = $sid')
fi

# Save base state (total_commands incremented, session rotated)
save_state "$STATE"

# Run all detectors (order matters — source .env exits immediately)
# Each detector reloads state from file so mutations chain correctly
detect_source_env "$(load_state)"
detect_restart_without_logs "$(load_state)"
detect_restart_loop "$(load_state)"
detect_self_inflicted "$(load_state)"
detect_consecutive_failures "$(load_state)"

exit 0

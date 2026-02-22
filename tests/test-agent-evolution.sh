#!/bin/bash

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"
ENGINE="$FRAMEWORK_DIR/scripts/agent-evolution.sh"
REPORT_JSON="$FRAMEWORK_DIR/logs/agent-evolution/iteration-1.json"

fail() {
    echo "[FAIL] $*" >&2
    exit 1
}

pass() {
    echo "[PASS] $*"
}

[ -f "$ENGINE" ] || fail "missing script: $ENGINE"
bash -n "$ENGINE" || fail "shell syntax invalid: $ENGINE"
pass "syntax check passed"

bash "$ENGINE" analyze >/tmp/agent-evolution-analyze.out 2>/tmp/agent-evolution-analyze.err \
    || fail "analyze command failed"
pass "analyze command runs"

[ -f "$REPORT_JSON" ] || fail "missing report: $REPORT_JSON"
jq -e '.iteration == 1' "$REPORT_JSON" >/dev/null || fail "report iteration mismatch"
jq -e '.system_map.core_roster != null' "$REPORT_JSON" >/dev/null || fail "missing system map"
jq -e '.weak_points != null' "$REPORT_JSON" >/dev/null || fail "missing weak points"
jq -e '.risk_areas.stabilized != null' "$REPORT_JSON" >/dev/null || fail "missing stabilization flag"
pass "report schema validated"

echo "[PASS] test-agent-evolution complete"

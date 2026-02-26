#!/bin/bash

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$SCRIPT_DIR/agent-evolution.sh"

COMMAND="${1:-help}"
shift 2>/dev/null || true

AUTO_FIX=false
MIN_ITERATIONS=1
MAX_ITERATIONS=10
TARGET_COUNT=0
ROSTER_FILE=""
PHASES="debate,implement,iterate"

usage() {
    cat <<EOF
Evolve CLI

Usage:
  ./scripts/evolve.sh debate [--target-count=N] [--roster-file=path]
  ./scripts/evolve.sh implement [--auto-fix] [--target-count=N] [--roster-file=path]
  ./scripts/evolve.sh iterate [--auto-fix] [--min-iterations=N] [--max-iterations=N]
  ./scripts/evolve.sh run [--phases=debate,implement,iterate] [--auto-fix] [--min-iterations=N] [--max-iterations=N]
EOF
}

die() {
    echo "Error: $*" >&2
    exit 1
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --auto-fix) AUTO_FIX=true; shift ;;
            --min-iterations=*) MIN_ITERATIONS="${1#*=}"; shift ;;
            --max-iterations=*) MAX_ITERATIONS="${1#*=}"; shift ;;
            --target-count=*) TARGET_COUNT="${1#*=}"; shift ;;
            --roster-file=*) ROSTER_FILE="${1#*=}"; shift ;;
            --phases=*) PHASES="${1#*=}"; shift ;;
            --help) usage; exit 0 ;;
            *) die "Unknown option: $1" ;;
        esac
    done
}

build_engine_args() {
    local sub="$1"
    local args=("$sub")
    if [ "$AUTO_FIX" = "true" ]; then args+=("--auto-fix"); fi
    if [ "$MIN_ITERATIONS" -gt 0 ]; then args+=("--min-iterations=$MIN_ITERATIONS"); fi
    if [ "$MAX_ITERATIONS" -gt 0 ]; then args+=("--max-iterations=$MAX_ITERATIONS"); fi
    if [ "$TARGET_COUNT" -gt 0 ]; then args+=("--target-count=$TARGET_COUNT"); fi
    if [ -n "$ROSTER_FILE" ]; then args+=("--roster-file=$ROSTER_FILE"); fi
    printf '%s\n' "${args[@]}"
}

invoke_engine() {
    local sub="$1"
    [ -f "$ENGINE" ] || die "Engine not found: $ENGINE"
    mapfile -t ea < <(build_engine_args "$sub")
    bash "$ENGINE" "${ea[@]}"
}

run_phases() {
    IFS=',' read -r -a list <<< "$PHASES"
    for phase in "${list[@]}"; do
        phase="$(echo "$phase" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
        case "$phase" in
            debate)
                invoke_engine debate
                ;;
            implement)
                AUTO_FIX=true
                MIN_ITERATIONS=1
                MAX_ITERATIONS=2
                invoke_engine cycle
                ;;
            iterate)
                invoke_engine cycle
                ;;
            *)
                die "Unsupported phase: $phase"
                ;;
        esac
    done
}

parse_args "$@"

case "$COMMAND" in
    help|--help) usage ;;
    debate) invoke_engine debate ;;
    implement)
        AUTO_FIX=true
        MIN_ITERATIONS=1
        MAX_ITERATIONS=2
        invoke_engine cycle
        ;;
    iterate) invoke_engine cycle ;;
    run) run_phases ;;
    *) die "Unknown command: $COMMAND" ;;
esac

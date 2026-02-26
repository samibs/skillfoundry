#!/bin/bash

# Agent Evolution Engine
# Runs iterative analysis/fix cycles to stabilize a canonical core agent architecture.
#
# Usage:
#   ./scripts/agent-evolution.sh analyze
#   ./scripts/agent-evolution.sh cycle --max-iterations=5
#   ./scripts/agent-evolution.sh cycle --auto-fix --max-iterations=5

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$FRAMEWORK_DIR/.agents/skills"
COMMANDS_DIR="$FRAMEWORK_DIR/.claude/commands"
CORE_ROSTER_FILE_53="$FRAMEWORK_DIR/config/core-agents-53.txt"
CORE_ROSTER_FILE_46="$FRAMEWORK_DIR/config/core-agents-46.txt"
CORE_ROSTER_FILE=""
REPORT_DIR="$FRAMEWORK_DIR/logs/agent-evolution"
TARGET_CORE_COUNT=0
MAX_ITERATIONS=5
AUTO_FIX=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

usage() {
    cat <<EOF
Agent Evolution Engine

Usage:
  ./scripts/agent-evolution.sh analyze [--target-count=N] [--roster-file=path]
  ./scripts/agent-evolution.sh cycle [--auto-fix] [--max-iterations=5] [--target-count=N] [--roster-file=path]

Commands:
  analyze    Build one architecture assessment report (no file mutations)
  cycle      Run iterative analysis and optional remediation until stable or max iterations reached

Options:
  --auto-fix          Create missing core agent artifacts and patch weak skill files
  --max-iterations=N  Iteration cap for cycle command (default: 5)
  --target-count=N    Expected core agent count (default: roster size)
  --roster-file=path  Override roster file (default: config/core-agents-53.txt if present)
  --help              Show this message
EOF
}

die() {
    echo -e "${RED}Error:${NC} $*" >&2
    exit 1
}

resolve_roster_file() {
    if [ -n "$CORE_ROSTER_FILE" ]; then
        return
    fi
    if [ -f "$CORE_ROSTER_FILE_53" ]; then
        CORE_ROSTER_FILE="$CORE_ROSTER_FILE_53"
    else
        CORE_ROSTER_FILE="$CORE_ROSTER_FILE_46"
    fi
}

require_tools() {
    command -v jq >/dev/null 2>&1 || die "jq is required"
    command -v awk >/dev/null 2>&1 || die "awk is required"
    command -v sort >/dev/null 2>&1 || die "sort is required"
}

ensure_layout() {
    resolve_roster_file
    [ -d "$SKILLS_DIR" ] || die "Skills directory not found: $SKILLS_DIR"
    [ -d "$COMMANDS_DIR" ] || die "Commands directory not found: $COMMANDS_DIR"
    [ -f "$CORE_ROSTER_FILE" ] || die "Core roster file not found: $CORE_ROSTER_FILE"
    mkdir -p "$REPORT_DIR"
}

read_core_roster() {
    sed 's/#.*$//' "$CORE_ROSTER_FILE" | awk 'NF' | sort -u
}

list_skills() {
    find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -u
}

list_commands() {
    find "$COMMANDS_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.md' -printf '%f\n' \
        | sed 's/\.md$//' | sort -u
}

contains_line() {
    local target="$1"
    local file="$2"
    grep -Fxq "$target" "$file"
}

collect_weak_skills() {
    local core_file="$1"
    local weak_file="$2"
    : > "$weak_file"

    while IFS= read -r agent; do
        [ -n "$agent" ] || continue
        local skill_file="$SKILLS_DIR/$agent/SKILL.md"
        if [ ! -f "$skill_file" ]; then
            continue
        fi

        # Weak if skill lacks explicit self-critique and collaboration signals.
        if ! grep -Eqi 'reflection-protocol|self-critique|self critique' "$skill_file"; then
            echo "$agent" >> "$weak_file"
            continue
        fi
        if ! grep -Eqi 'handoff|collaborat|delegate|peer|review' "$skill_file"; then
            echo "$agent" >> "$weak_file"
            continue
        fi
    done < "$core_file"
}

append_reflection_contract() {
    local agent="$1"
    local skill_file="$SKILLS_DIR/$agent/SKILL.md"
    local tmp_file
    tmp_file="$(mktemp)"

    if grep -Eqi 'reflection-protocol|self-critique|self critique' "$skill_file" \
        && grep -Eqi 'handoff|collaborat|delegate|peer|review' "$skill_file"; then
        rm -f "$tmp_file"
        return 0
    fi

    cat "$skill_file" > "$tmp_file"
    cat >> "$tmp_file" <<'EOF'

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: `agents/_reflection-protocol.md`
EOF
    mv "$tmp_file" "$skill_file"
}

create_skill_file() {
    local agent="$1"
    local dir="$SKILLS_DIR/$agent"
    local file="$dir/SKILL.md"
    mkdir -p "$dir"
    cat > "$file" <<EOF
---
name: $agent
description: >-
  Use this agent when you need $agent responsibilities executed with strict quality gates.
---

You are the $agent agent.

## Responsibilities
- Execute your domain tasks with deterministic, testable outputs.
- Validate inputs and reject ambiguous or unsafe requests.
- Emit concise technical artifacts that downstream agents can consume.

## Workflow
1. Analyze scope, assumptions, and hard constraints.
2. Produce implementation-ready outputs with explicit acceptance criteria.
3. Run self-critique against correctness, security, and maintainability.
4. Handoff findings and artifacts to the next agent with failure signals.

## Continuous Improvement Contract
- Run self-critique before handoff and after implementation updates.
- Record one weakness and one improvement action per major task.
- Ask peer agents to challenge risky decisions.
- Reference: \`agents/_reflection-protocol.md\`
EOF
}

create_command_file() {
    local agent="$1"
    local file="$COMMANDS_DIR/$agent.md"
    cat > "$file" <<EOF
# /$agent

## Purpose
Execute the $agent workflow with production-oriented quality gates.

## Execution Contract
1. Analyze constraints and define deterministic outputs.
2. Produce implementation artifacts with explicit failure handling.
3. Run self-critique and call out risk concentrations.
4. Handoff to peer agents for adversarial validation.

## Required Signals
- Inputs consumed
- Outputs produced
- Risks detected
- Improvement actions
EOF
}

set_ops() {
    local left_file="$1"
    local right_file="$2"
    local left_only="$3"
    local right_only="$4"

    comm -23 "$left_file" "$right_file" > "$left_only"
    comm -13 "$left_file" "$right_file" > "$right_only"
}

render_report() {
    local iteration="$1"
    local core_file="$2"
    local skill_file="$3"
    local cmd_file="$4"
    local missing_skills="$5"
    local missing_commands="$6"
    local weak_skills="$7"
    local report_file="$8"
    local system_map="$9"

    local core_count
    core_count=$(wc -l < "$core_file" | tr -d ' ')
    local skills_count
    skills_count=$(wc -l < "$skill_file" | tr -d ' ')
    local commands_count
    commands_count=$(wc -l < "$cmd_file" | tr -d ' ')
    local missing_skills_count
    missing_skills_count=$(wc -l < "$missing_skills" | tr -d ' ')
    local missing_commands_count
    missing_commands_count=$(wc -l < "$missing_commands" | tr -d ' ')
    local weak_skills_count
    weak_skills_count=$(wc -l < "$weak_skills" | tr -d ' ')

    local stabilized="false"
    if [ "$core_count" -eq "$TARGET_CORE_COUNT" ] \
        && [ "$missing_skills_count" -eq 0 ] \
        && [ "$missing_commands_count" -eq 0 ] \
        && [ "$weak_skills_count" -eq 0 ]; then
        stabilized="true"
    fi

    cat > "$report_file" <<EOF
{
  "iteration": $iteration,
  "target_core_count": $TARGET_CORE_COUNT,
  "core_count": $core_count,
  "skills_count": $skills_count,
  "commands_count": $commands_count,
  "system_map": {
    "core_roster": "$CORE_ROSTER_FILE",
    "skills_dir": "$SKILLS_DIR",
    "commands_dir": "$COMMANDS_DIR",
    "analysis_time_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  },
  "weak_points": {
    "missing_core_skills": $missing_skills_count,
    "missing_core_commands": $missing_commands_count,
    "weak_skill_contracts": $weak_skills_count
  },
  "risk_areas": {
    "count_drift": $([ "$core_count" -ne "$TARGET_CORE_COUNT" ] && echo "true" || echo "false"),
    "stabilized": $stabilized
  }
}
EOF

    {
        echo "Iteration $iteration"
        echo "System Map"
        echo "- Core roster file: $CORE_ROSTER_FILE"
        echo "- Skills scanned: $skills_count"
        echo "- Commands scanned: $commands_count"
        echo "- Target core count: $TARGET_CORE_COUNT"
        echo ""
        echo "Weak Points"
        if [ "$missing_skills_count" -gt 0 ]; then
            echo "- Missing core skill definitions:"
            sed 's/^/  - /' "$missing_skills"
        else
            echo "- Missing core skill definitions: none"
        fi
        if [ "$missing_commands_count" -gt 0 ]; then
            echo "- Missing core command definitions:"
            sed 's/^/  - /' "$missing_commands"
        else
            echo "- Missing core command definitions: none"
        fi
        if [ "$weak_skills_count" -gt 0 ]; then
            echo "- Weak skill contracts (no reflection/collab hooks):"
            sed 's/^/  - /' "$weak_skills"
        else
            echo "- Weak skill contracts: none"
        fi
        echo ""
        echo "Risk Areas"
        echo "- Core count drift: $([ "$core_count" -ne "$TARGET_CORE_COUNT" ] && echo "yes" || echo "no")"
        echo "- Stabilized: $stabilized"
    } > "$system_map"
}

perform_analysis() {
    local iteration="$1"
    local work_dir
    work_dir="$(mktemp -d)"
    local core_file="$work_dir/core.txt"
    local skills_file="$work_dir/skills.txt"
    local commands_file="$work_dir/commands.txt"
    local missing_skills="$work_dir/missing_skills.txt"
    local missing_commands="$work_dir/missing_commands.txt"
    local weak_skills="$work_dir/weak_skills.txt"

    read_core_roster > "$core_file"
    list_skills > "$skills_file"
    list_commands > "$commands_file"

    set_ops "$core_file" "$skills_file" "$missing_skills" "$work_dir/non_core_skills.txt"
    set_ops "$core_file" "$commands_file" "$missing_commands" "$work_dir/non_core_commands.txt"
    collect_weak_skills "$core_file" "$weak_skills"

    local report_json="$REPORT_DIR/iteration-${iteration}.json"
    local report_txt="$REPORT_DIR/iteration-${iteration}.txt"
    render_report "$iteration" "$core_file" "$skills_file" "$commands_file" \
        "$missing_skills" "$missing_commands" "$weak_skills" "$report_json" "$report_txt"

    echo "$work_dir"
}

perform_fixes() {
    local work_dir="$1"
    local changes=0

    while IFS= read -r agent; do
        [ -n "$agent" ] || continue
        if [ "$AUTO_FIX" = "true" ]; then
            create_skill_file "$agent"
            changes=$((changes + 1))
        fi
    done < "$work_dir/missing_skills.txt"

    while IFS= read -r agent; do
        [ -n "$agent" ] || continue
        if [ "$AUTO_FIX" = "true" ]; then
            create_command_file "$agent"
            changes=$((changes + 1))
        fi
    done < "$work_dir/missing_commands.txt"

    while IFS= read -r agent; do
        [ -n "$agent" ] || continue
        if [ "$AUTO_FIX" = "true" ]; then
            append_reflection_contract "$agent"
            changes=$((changes + 1))
        fi
    done < "$work_dir/weak_skills.txt"

    echo "$changes"
}

is_stabilized() {
    local report_json="$1"
    jq -e '.risk_areas.stabilized == true' "$report_json" >/dev/null
}

run_analyze() {
    local work_dir
    work_dir=$(perform_analysis 1)
    local report_json="$REPORT_DIR/iteration-1.json"
    local report_txt="$REPORT_DIR/iteration-1.txt"
    cat "$report_txt"
    echo ""
    echo "Report JSON: $report_json"
    rm -rf "$work_dir"
}

run_cycle() {
    local i=1
    while [ "$i" -le "$MAX_ITERATIONS" ]; do
        local work_dir
        work_dir=$(perform_analysis "$i")
        local report_json="$REPORT_DIR/iteration-${i}.json"
        local report_txt="$REPORT_DIR/iteration-${i}.txt"

        echo -e "${CYAN}${BOLD}Iteration $i${NC}"
        cat "$report_txt"
        echo ""

        if is_stabilized "$report_json"; then
            echo -e "${GREEN}Stabilized at iteration $i.${NC}"
            rm -rf "$work_dir"
            return 0
        fi

        if [ "$AUTO_FIX" = "true" ]; then
            local changes
            changes=$(perform_fixes "$work_dir")
            echo -e "${YELLOW}Applied $changes remediation actions.${NC}"
        else
            echo -e "${YELLOW}Auto-fix disabled; no remediations applied.${NC}"
        fi

        rm -rf "$work_dir"
        i=$((i + 1))
    done

    echo -e "${RED}Reached max iterations ($MAX_ITERATIONS) without stabilization.${NC}"
    return 1
}

parse_args() {
    local command="${1:-}"
    shift || true

    while [ $# -gt 0 ]; do
        case "$1" in
            --auto-fix)
                AUTO_FIX=true
                shift
                ;;
            --max-iterations=*)
                MAX_ITERATIONS="${1#*=}"
                shift
                ;;
            --target-count=*)
                TARGET_CORE_COUNT="${1#*=}"
                shift
                ;;
            --roster-file=*)
                CORE_ROSTER_FILE="${1#*=}"
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                die "Unknown option: $1"
                ;;
        esac
    done

    ensure_layout
    if [ "$TARGET_CORE_COUNT" -eq 0 ]; then
        TARGET_CORE_COUNT=$(read_core_roster | wc -l | tr -d ' ')
    fi

    case "$command" in
        analyze)
            run_analyze
            ;;
        cycle)
            run_cycle
            ;;
        ""|help|--help)
            usage
            ;;
        *)
            die "Unknown command: $command"
            ;;
    esac
}

require_tools
parse_args "$@"

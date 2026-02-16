#!/bin/bash

# Cost-Aware Agent Routing Engine
# Routes agents to appropriate model tiers based on task complexity.
# Reduces cost by directing simple tasks to cheaper/faster models.
#
# USAGE:
#   ./scripts/cost-router.sh assess <agent> <task-description>
#   ./scripts/cost-router.sh route <agent> <complexity>
#   ./scripts/cost-router.sh config
#   ./scripts/cost-router.sh stats
#   ./scripts/cost-router.sh --help

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
ROUTING_CONFIG=".claude/routing.json"
ROUTING_LOG=".claude/routing-log.jsonl"

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Cost-Aware Agent Routing Engine"
    echo ""
    echo "Routes agents to appropriate model tiers based on task complexity."
    echo "Disabled by default — enable in .claude/routing.json."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/cost-router.sh <command> [args]"
    echo ""
    echo "COMMANDS:"
    echo "  assess <agent> <desc>   Assess task complexity (low|medium|high|critical)"
    echo "  route <agent> <level>   Get model tier for complexity level"
    echo "  config                  Show current routing configuration"
    echo "  stats                   Show routing statistics"
    echo "  init                    Create default routing config"
    echo ""
    echo "COMPLEXITY LEVELS:"
    echo "  low       Simple tasks (docs, boilerplate)        → fast tier"
    echo "  medium    Standard implementation                  → standard tier"
    echo "  high      Architecture, security, complex logic    → advanced tier"
    echo "  critical  Quality gates, evaluations               → advanced tier (enforced)"
    echo ""
    echo "MODEL TIERS:"
    echo "  fast      Haiku-class models (cheapest, fastest)"
    echo "  standard  Sonnet-class models (balanced)"
    echo "  advanced  Opus-class models (most capable)"
    echo ""
    echo "OPTIONS:"
    echo "  --json    Output in JSON format"
    echo "  --help    Show this help message"
}

# ═══════════════════════════════════════════════════════════════
# CONFIG MANAGEMENT
# ═══════════════════════════════════════════════════════════════

load_config() {
    if [ -f "$ROUTING_CONFIG" ]; then
        cat "$ROUTING_CONFIG"
    else
        # Default config (routing disabled)
        cat <<'EOF'
{
  "enabled": false,
  "default_tier": "standard",
  "overrides": {
    "gate-keeper": "advanced",
    "evaluator": "advanced",
    "security": "advanced",
    "security-scanner": "advanced",
    "tech-lead": "advanced",
    "architect": "advanced",
    "docs": "fast",
    "learn": "fast",
    "math-check": "fast"
  },
  "complexity_thresholds": {
    "low_max_lines": 50,
    "medium_max_lines": 200
  }
}
EOF
    fi
}

cmd_init() {
    if [ -f "$ROUTING_CONFIG" ]; then
        echo -e "${YELLOW}[WARN]${NC} Config already exists: $ROUTING_CONFIG"
        echo "Delete it first if you want to reinitialize."
        exit 0
    fi

    mkdir -p "$(dirname "$ROUTING_CONFIG")"
    load_config > "$ROUTING_CONFIG"
    echo -e "${GREEN}[PASS]${NC} Default routing config created: $ROUTING_CONFIG"
    echo -e "${CYAN}[INFO]${NC} Routing is disabled by default. Set \"enabled\": true to activate."
}

cmd_config() {
    local config
    config=$(load_config)

    local enabled
    enabled=$(echo "$config" | jq -r '.enabled')
    local default_tier
    default_tier=$(echo "$config" | jq -r '.default_tier')

    echo -e "${CYAN}${BOLD}ROUTING CONFIGURATION${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$enabled" = "true" ]; then
        echo -e "Status:     ${GREEN}ENABLED${NC}"
    else
        echo -e "Status:     ${YELLOW}DISABLED${NC} (all agents use default tier)"
    fi
    echo "Default:    $default_tier"
    echo "Config:     $ROUTING_CONFIG"
    echo ""

    echo "Agent Overrides:"
    echo "$config" | jq -r '.overrides | to_entries[] | "  \(.key): \(.value)"' 2>/dev/null || echo "  (none)"

    echo ""
    echo "Complexity Thresholds:"
    local low_max
    low_max=$(echo "$config" | jq -r '.complexity_thresholds.low_max_lines // 50')
    local med_max
    med_max=$(echo "$config" | jq -r '.complexity_thresholds.medium_max_lines // 200')
    echo "  low:    ≤ $low_max lines"
    echo "  medium: ≤ $med_max lines"
    echo "  high:   > $med_max lines"
}

# ═══════════════════════════════════════════════════════════════
# ASSESS - Determine task complexity
# ═══════════════════════════════════════════════════════════════

# Agent type complexity baseline
get_agent_baseline() {
    local agent="$1"
    case "$agent" in
        docs|learn|math-check)
            echo "low"
            ;;
        coder|refactor|fixer|tester|debugger)
            echo "medium"
            ;;
        architect|api-design|data-architect|security|tech-lead|senior-engineer)
            echo "high"
            ;;
        gate-keeper|evaluator|security-scanner)
            echo "critical"
            ;;
        *)
            echo "medium"
            ;;
    esac
}

# Heuristic signals from task description
assess_description() {
    local desc="$1"
    local score=0

    # Security-related terms bump complexity
    if echo "$desc" | grep -qiE "(auth|security|encrypt|credential|jwt|oauth|permission|rbac)"; then
        score=$((score + 2))
    fi

    # Database-related terms bump complexity
    if echo "$desc" | grep -qiE "(database|migration|schema|query|index|transaction)"; then
        score=$((score + 1))
    fi

    # Architecture-related terms bump complexity
    if echo "$desc" | grep -qiE "(architect|design|pattern|microservice|distributed|scale)"; then
        score=$((score + 2))
    fi

    # Simple task indicators lower complexity
    if echo "$desc" | grep -qiE "(readme|docs|comment|rename|typo|format|lint)"; then
        score=$((score - 2))
    fi

    echo "$score"
}

complexity_from_score() {
    local score="$1"
    if [ "$score" -le 0 ]; then
        echo "low"
    elif [ "$score" -le 2 ]; then
        echo "medium"
    elif [ "$score" -le 4 ]; then
        echo "high"
    else
        echo "critical"
    fi
}

cmd_assess() {
    local agent="${1:-}"
    local description="${2:-}"

    if [ -z "$agent" ]; then
        echo -e "${RED}Error: agent name required${NC}"
        echo "Usage: cost-router.sh assess <agent> <description>"
        exit 1
    fi

    # Start with agent baseline
    local baseline
    baseline=$(get_agent_baseline "$agent")

    # Convert baseline to numeric
    local base_score=0
    case "$baseline" in
        low) base_score=0 ;;
        medium) base_score=2 ;;
        high) base_score=4 ;;
        critical) base_score=6 ;;
    esac

    # Add description heuristics
    local desc_score=0
    if [ -n "$description" ]; then
        desc_score=$(assess_description "$description")
    fi

    local total=$((base_score + desc_score))
    local complexity
    complexity=$(complexity_from_score "$total")

    # Critical agents always stay critical
    if [ "$baseline" = "critical" ]; then
        complexity="critical"
    fi

    if [ "${JSON_OUTPUT:-}" = "true" ]; then
        jq -nc \
            --arg agent "$agent" \
            --arg baseline "$baseline" \
            --argjson desc_score "$desc_score" \
            --arg complexity "$complexity" \
            '{agent:$agent,baseline:$baseline,description_score:$desc_score,assessed_complexity:$complexity}'
    else
        echo "$complexity"
    fi
}

# ═══════════════════════════════════════════════════════════════
# ROUTE - Get model tier for a complexity level
# ═══════════════════════════════════════════════════════════════

cmd_route() {
    local agent="${1:-}"
    local complexity="${2:-}"

    if [ -z "$agent" ] || [ -z "$complexity" ]; then
        echo -e "${RED}Error: agent and complexity required${NC}"
        echo "Usage: cost-router.sh route <agent> <complexity>"
        exit 1
    fi

    local config
    config=$(load_config)

    local enabled
    enabled=$(echo "$config" | jq -r '.enabled')

    # If routing disabled, return default
    if [ "$enabled" != "true" ]; then
        local default_tier
        default_tier=$(echo "$config" | jq -r '.default_tier // "standard"')
        echo "$default_tier"
        return
    fi

    # Check for agent-specific override
    local override
    override=$(echo "$config" | jq -r --arg a "$agent" '.overrides[$a] // empty')

    if [ -n "$override" ]; then
        echo "$override"
        log_routing "$agent" "$complexity" "$override" "override"
        return
    fi

    # Map complexity to tier
    local tier
    case "$complexity" in
        low)      tier="fast" ;;
        medium)   tier="standard" ;;
        high)     tier="advanced" ;;
        critical) tier="advanced" ;;
        *)        tier="standard" ;;
    esac

    echo "$tier"
    log_routing "$agent" "$complexity" "$tier" "assessed"
}

# ═══════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════

log_routing() {
    local agent="$1"
    local complexity="$2"
    local tier="$3"
    local reason="$4"

    mkdir -p "$(dirname "$ROUTING_LOG")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    jq -nc \
        --arg ts "$timestamp" \
        --arg agent "$agent" \
        --arg complexity "$complexity" \
        --arg tier "$tier" \
        --arg reason "$reason" \
        '{timestamp:$ts,agent:$agent,complexity:$complexity,tier:$tier,reason:$reason}' \
        >> "$ROUTING_LOG" 2>/dev/null || true
}

# ═══════════════════════════════════════════════════════════════
# STATS - Routing statistics
# ═══════════════════════════════════════════════════════════════

cmd_stats() {
    echo -e "${CYAN}${BOLD}ROUTING STATISTICS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -f "$ROUTING_LOG" ] || [ ! -s "$ROUTING_LOG" ]; then
        echo -e "${YELLOW}No routing data yet.${NC}"
        echo "Routing is logged when agents are dispatched with routing enabled."
        exit 0
    fi

    local total
    total=$(wc -l < "$ROUTING_LOG")
    echo "Total routed: $total"
    echo ""

    echo "By tier:"
    jq -r '.tier' "$ROUTING_LOG" | sort | uniq -c | sort -rn | while read -r count tier; do
        printf "  %-12s %d\n" "$tier" "$count"
    done

    echo ""
    echo "By agent:"
    jq -r '.agent' "$ROUTING_LOG" | sort | uniq -c | sort -rn | head -10 | while read -r count agent; do
        printf "  %-20s %d\n" "$agent" "$count"
    done

    echo ""
    echo "By reason:"
    jq -r '.reason' "$ROUTING_LOG" | sort | uniq -c | sort -rn | while read -r count reason; do
        printf "  %-12s %d\n" "$reason" "$count"
    done
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

JSON_OUTPUT=false

COMMAND="${1:-}"
shift 2>/dev/null || true

# Check for --json flag in remaining args
for arg in "$@"; do
    [ "$arg" = "--json" ] && JSON_OUTPUT=true
done

case "$COMMAND" in
    assess)
        cmd_assess "$@"
        ;;
    route)
        cmd_route "$@"
        ;;
    config)
        cmd_config
        ;;
    stats)
        cmd_stats
        ;;
    init)
        cmd_init
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {assess|route|config|stats|init} [args]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

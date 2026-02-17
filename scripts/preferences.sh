#!/bin/bash

# Developer Preferences — Behavioral Memory
# Manages persistent developer preferences (code style, frameworks, testing
# patterns) that can be auto-learned from the codebase and injected into
# agent prompts for consistent code generation.
#
# USAGE:
#   ./scripts/preferences.sh set <key> <value>
#   ./scripts/preferences.sh get <key>
#   ./scripts/preferences.sh list
#   ./scripts/preferences.sh learn
#   ./scripts/preferences.sh inject
#   ./scripts/preferences.sh init
#   ./scripts/preferences.sh reset
#   ./scripts/preferences.sh --help

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

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

# Defaults
PROJECT_PREFS="$PROJECT_DIR/.claude/preferences.json"
GLOBAL_PREFS="${HOME}/.claude/preferences.json"
MAX_SAMPLE_FILES=10

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Developer Preferences — Behavioral Memory"
    echo ""
    echo "Auto-learns code style, frameworks, and workflow preferences from your"
    echo "codebase. Injects them into agent prompts for consistent code generation."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/preferences.sh <command> [args]"
    echo ""
    echo "COMMANDS:"
    echo "  set <key> <value>   Set an explicit preference"
    echo "  get <key>           Get a preference value"
    echo "  list                List all preferences"
    echo "  learn               Auto-detect preferences from codebase"
    echo "  inject              Output markdown summary for agent prompts"
    echo "  init                Create default preferences file"
    echo "  reset               Clear all learned preferences (keeps explicit)"
    echo ""
    echo "PREFERENCE KEYS:"
    echo "  code.naming.python       Naming convention: snake_case, camelCase, PascalCase"
    echo "  code.naming.javascript   Same for JavaScript/TypeScript"
    echo "  code.indent.python       Indentation: '4 spaces', '2 spaces', 'tabs'"
    echo "  code.indent.javascript   Same for JavaScript/TypeScript"
    echo "  code.line_length         Max line length (e.g., 100)"
    echo "  framework.backend        Preferred backend: FastAPI, Flask, Django, Express, .NET"
    echo "  framework.frontend       Preferred frontend: React, Angular, Vue"
    echo "  framework.testing        Preferred test framework: pytest, Jest, xUnit"
    echo "  testing.coverage         Coverage threshold: 0-100 (e.g., 80)"
    echo "  testing.style            Testing style: TDD, BDD, standard"
    echo "  commit.format            Commit style: conventional, freeform"
    echo "  docs.level               Documentation level: minimal, standard, detailed"
    echo ""
    echo "STORAGE:"
    echo "  Project:  .claude/preferences.json (overrides global)"
    echo "  Global:   ~/.claude/preferences.json"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/preferences.sh init"
    echo "  ./scripts/preferences.sh learn"
    echo "  ./scripts/preferences.sh set testing.coverage 80"
    echo "  ./scripts/preferences.sh set commit.format conventional"
    echo "  ./scripts/preferences.sh get testing.coverage"
    echo "  ./scripts/preferences.sh inject"
    echo "  ./scripts/preferences.sh list"
}

# ═══════════════════════════════════════════════════════════════
# PREFERENCES FILE MANAGEMENT
# ═══════════════════════════════════════════════════════════════

default_prefs() {
    cat <<'EOF'
{
  "version": "1.0",
  "preferences": {}
}
EOF
}

ensure_prefs() {
    if [ ! -f "$PROJECT_PREFS" ]; then
        mkdir -p "$(dirname "$PROJECT_PREFS")"
        default_prefs > "$PROJECT_PREFS"
    fi
}

set_preference() {
    local key="$1"
    local value="$2"
    local source="${3:-explicit}"
    local confidence="${4:-1.0}"
    local learned_from="${5:-[]}"

    ensure_prefs

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local temp_dir
    temp_dir="$(dirname "$PROJECT_PREFS")"
    local tmp
    tmp=$(mktemp "$temp_dir/.prefs-update.XXXXXX")
    chmod 600 "$tmp"

    # Build the preference entry
    local entry
    entry=$(jq -nc \
        --arg val "$value" \
        --arg src "$source" \
        --argjson conf "$confidence" \
        --argjson from "$learned_from" \
        --arg ts "$timestamp" \
        '{value:$val,source:$src,confidence:$conf,learned_from:$from,updated_at:$ts}')

    jq --arg key "$key" --argjson entry "$entry" \
        '.preferences[$key] = $entry' \
        "$PROJECT_PREFS" > "$tmp"

    mv "$tmp" "$PROJECT_PREFS"
}

get_preference() {
    local key="$1"
    local value=""

    # Project overrides global
    if [ -f "$PROJECT_PREFS" ]; then
        value=$(jq -r --arg key "$key" '.preferences[$key].value // empty' "$PROJECT_PREFS" 2>/dev/null)
    fi

    # Fall back to global
    if [ -z "$value" ] && [ -f "$GLOBAL_PREFS" ]; then
        value=$(jq -r --arg key "$key" '.preferences[$key].value // empty' "$GLOBAL_PREFS" 2>/dev/null)
    fi

    echo "$value"
}

merge_preferences() {
    # Merge global + project (project wins)
    local global='{}'
    local project='{}'

    if [ -f "$GLOBAL_PREFS" ]; then
        global=$(jq '.preferences // {}' "$GLOBAL_PREFS" 2>/dev/null || echo '{}')
    fi

    if [ -f "$PROJECT_PREFS" ]; then
        project=$(jq '.preferences // {}' "$PROJECT_PREFS" 2>/dev/null || echo '{}')
    fi

    # Merge: project overrides global
    echo "$global" "$project" | jq -s '.[0] * .[1]'
}

# ═══════════════════════════════════════════════════════════════
# LEARN: AUTO-DETECT FROM CODEBASE
# ═══════════════════════════════════════════════════════════════

find_sample_files() {
    local ext="$1"
    find "$PROJECT_DIR" -name "*.$ext" -type f \
        ! -path "*/node_modules/*" \
        ! -path "*/__pycache__/*" \
        ! -path "*/.git/*" \
        ! -path "*/dist/*" \
        ! -path "*/build/*" \
        ! -path "*/.agents/*" \
        2>/dev/null | head -"$MAX_SAMPLE_FILES"
}

detect_indentation() {
    local ext="$1"
    local lang_key="$2"
    local files=()

    while IFS= read -r f; do
        [ -n "$f" ] && files+=("$f")
    done < <(find_sample_files "$ext")

    [ ${#files[@]} -eq 0 ] && return

    local spaces_count=0
    local tabs_count=0
    local indent_sizes=()

    for file in "${files[@]}"; do
        # Count lines starting with spaces vs tabs
        local sp
        sp=$(grep -cE '^  +[^ ]' "$file" 2>/dev/null || true)
        sp=${sp:-0}; sp=$(echo "$sp" | tr -d '[:space:]')
        local tb
        tb=$(grep -cE '^	' "$file" 2>/dev/null || true)
        tb=${tb:-0}; tb=$(echo "$tb" | tr -d '[:space:]')
        spaces_count=$((spaces_count + sp))
        tabs_count=$((tabs_count + tb))

        # Detect indent size from first indented line
        local first_indent
        first_indent=$(grep -oE '^  +' "$file" 2>/dev/null | head -1 || true)
        if [ -n "$first_indent" ]; then
            local indent_chars=${#first_indent}
            [ "$indent_chars" -gt 0 ] && [ "$indent_chars" -le 8 ] && indent_sizes+=("$indent_chars")
        fi
    done

    local total=$((spaces_count + tabs_count))
    [ "$total" -eq 0 ] && return

    local indent_type="spaces"
    [ "$tabs_count" -gt "$spaces_count" ] && indent_type="tabs"

    # Most common indent size
    local indent_size=4
    if [ ${#indent_sizes[@]} -gt 0 ]; then
        indent_size=$(printf '%s\n' "${indent_sizes[@]}" | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
    fi

    local value="$indent_size spaces"
    [ "$indent_type" = "tabs" ] && value="tabs"

    local confidence
    if [ "$indent_type" = "spaces" ]; then
        confidence=$(echo "scale=2; $spaces_count / $total" | bc 2>/dev/null || echo "0.8")
    else
        confidence=$(echo "scale=2; $tabs_count / $total" | bc 2>/dev/null || echo "0.8")
    fi

    local learned_from
    learned_from=$(printf '%s\n' "${files[@]:0:3}" | sed "s|$PROJECT_DIR/||g" | jq -R . | jq -s '.')

    set_preference "code.indent.$lang_key" "$value" "learned" "$confidence" "$learned_from"
}

detect_naming() {
    local ext="$1"
    local lang_key="$2"
    local files=()

    while IFS= read -r f; do
        [ -n "$f" ] && files+=("$f")
    done < <(find_sample_files "$ext")

    [ ${#files[@]} -eq 0 ] && return

    local snake_count=0
    local camel_count=0

    for file in "${files[@]}"; do
        case "$ext" in
            py)
                snake_count=$((snake_count + $(grep -cE '^def [a-z_][a-z0-9_]*\(' "$file" 2>/dev/null || echo 0)))
                camel_count=$((camel_count + $(grep -cE '^def [a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\(' "$file" 2>/dev/null || echo 0)))
                ;;
            js|ts|tsx|jsx)
                snake_count=$((snake_count + $(grep -cE '(function |const |let |var )[a-z_][a-z0-9_]* ' "$file" 2>/dev/null || echo 0)))
                camel_count=$((camel_count + $(grep -cE '(function |const |let |var )[a-z][a-zA-Z]*[A-Z]' "$file" 2>/dev/null || echo 0)))
                ;;
        esac
    done

    local total=$((snake_count + camel_count))
    [ "$total" -eq 0 ] && return

    local convention="snake_case"
    local max=$snake_count
    if [ "$camel_count" -gt "$max" ]; then
        convention="camelCase"
        max=$camel_count
    fi

    local confidence
    confidence=$(echo "scale=2; $max / $total" | bc 2>/dev/null || echo "0.8")

    local learned_from
    learned_from=$(printf '%s\n' "${files[@]:0:3}" | sed "s|$PROJECT_DIR/||g" | jq -R . | jq -s '.')

    set_preference "code.naming.$lang_key" "$convention" "learned" "$confidence" "$learned_from"
}

detect_frameworks() {
    # Python backend
    if [ -f "$PROJECT_DIR/requirements.txt" ]; then
        local py_req="$PROJECT_DIR/requirements.txt"
        if grep -qi "fastapi" "$py_req"; then
            set_preference "framework.backend" "FastAPI" "learned" "0.9" '["requirements.txt"]'
        elif grep -qi "flask" "$py_req"; then
            set_preference "framework.backend" "Flask" "learned" "0.9" '["requirements.txt"]'
        elif grep -qi "django" "$py_req"; then
            set_preference "framework.backend" "Django" "learned" "0.9" '["requirements.txt"]'
        fi

        if grep -qi "pytest" "$py_req"; then
            set_preference "framework.testing" "pytest" "learned" "0.9" '["requirements.txt"]'
        fi
    fi

    # Node.js
    if [ -f "$PROJECT_DIR/package.json" ]; then
        local pkg="$PROJECT_DIR/package.json"
        local deps
        deps=$(jq -r '.dependencies // {} | keys[]' "$pkg" 2>/dev/null || true)
        local dev_deps
        dev_deps=$(jq -r '.devDependencies // {} | keys[]' "$pkg" 2>/dev/null || true)
        local all_deps="$deps $dev_deps"

        # Backend
        if echo "$all_deps" | grep -q "express"; then
            set_preference "framework.backend" "Express" "learned" "0.9" '["package.json"]'
        fi

        # Frontend
        if echo "$all_deps" | grep -q "^react$"; then
            set_preference "framework.frontend" "React" "learned" "0.9" '["package.json"]'
        elif echo "$all_deps" | grep -q "@angular/core"; then
            set_preference "framework.frontend" "Angular" "learned" "0.9" '["package.json"]'
        elif echo "$all_deps" | grep -q "^vue$"; then
            set_preference "framework.frontend" "Vue" "learned" "0.9" '["package.json"]'
        fi

        # Testing
        if echo "$all_deps" | grep -q "^jest$"; then
            set_preference "framework.testing" "Jest" "learned" "0.9" '["package.json"]'
        elif echo "$all_deps" | grep -q "vitest"; then
            set_preference "framework.testing" "Vitest" "learned" "0.9" '["package.json"]'
        elif echo "$all_deps" | grep -q "mocha"; then
            set_preference "framework.testing" "Mocha" "learned" "0.9" '["package.json"]'
        fi
    fi

    # .NET
    local csproj_files
    csproj_files=$(find "$PROJECT_DIR" -maxdepth 2 -name "*.csproj" 2>/dev/null | head -1)
    if [ -n "$csproj_files" ]; then
        set_preference "framework.backend" ".NET" "learned" "0.85" '["*.csproj"]'
        set_preference "framework.testing" "xUnit" "learned" "0.7" '["*.csproj"]'
    fi
}

detect_test_patterns() {
    # Detect test style from existing test files
    local test_files=()
    while IFS= read -r f; do
        [ -n "$f" ] && test_files+=("$f")
    done < <(find "$PROJECT_DIR" \( -name "test_*.py" -o -name "*_test.py" -o -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.js" -o -name "*.spec.js" \) -type f ! -path "*/node_modules/*" 2>/dev/null | head -5)

    [ ${#test_files[@]} -eq 0 ] && return

    local bdd_count=0
    local tdd_count=0

    for file in "${test_files[@]}"; do
        bdd_count=$((bdd_count + $(grep -ciE '\b(given|when|then|describe|it)\b' "$file" 2>/dev/null || echo 0)))
        tdd_count=$((tdd_count + $(grep -ciE '\b(arrange|act|assert|test_|def test)\b' "$file" 2>/dev/null || echo 0)))
    done

    local style="standard"
    if [ "$bdd_count" -gt "$tdd_count" ] && [ "$bdd_count" -gt 5 ]; then
        style="BDD"
    elif [ "$tdd_count" -gt 5 ]; then
        style="TDD"
    fi

    local learned_from
    learned_from=$(printf '%s\n' "${test_files[@]:0:3}" | sed "s|$PROJECT_DIR/||g" | jq -R . | jq -s '.')

    set_preference "testing.style" "$style" "learned" "0.75" "$learned_from"

    # Detect coverage threshold from config files
    if [ -f "$PROJECT_DIR/pytest.ini" ]; then
        local cov
        cov=$(grep -oP 'fail_under\s*=\s*\K\d+' "$PROJECT_DIR/pytest.ini" 2>/dev/null || true)
        [ -n "$cov" ] && set_preference "testing.coverage" "$cov" "learned" "0.95" '["pytest.ini"]'
    elif [ -f "$PROJECT_DIR/setup.cfg" ]; then
        local cov
        cov=$(grep -oP 'fail_under\s*=\s*\K\d+' "$PROJECT_DIR/setup.cfg" 2>/dev/null || true)
        [ -n "$cov" ] && set_preference "testing.coverage" "$cov" "learned" "0.95" '["setup.cfg"]'
    fi
}

detect_commit_style() {
    # Analyze last 20 commit messages
    if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return
    fi

    local messages
    messages=$(git -C "$PROJECT_DIR" log -20 --pretty=format:%s 2>/dev/null || true)
    [ -z "$messages" ] && return

    local total_count
    total_count=$(echo "$messages" | wc -l)
    [ "$total_count" -eq 0 ] && return

    local conventional_count
    conventional_count=$(echo "$messages" | grep -cE '^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: ' || echo 0)

    local style="freeform"
    local confidence=0.5

    if [ "$conventional_count" -gt $((total_count / 2)) ]; then
        style="conventional"
        confidence=$(echo "scale=2; $conventional_count / $total_count" | bc 2>/dev/null || echo "0.8")
    else
        confidence=$(echo "scale=2; ($total_count - $conventional_count) / $total_count" | bc 2>/dev/null || echo "0.7")
    fi

    set_preference "commit.format" "$style" "learned" "$confidence" '["git log"]'
}

# ═══════════════════════════════════════════════════════════════
# INJECT: GENERATE MARKDOWN FOR AGENT PROMPTS
# ═══════════════════════════════════════════════════════════════

cmd_inject() {
    ensure_prefs

    local merged
    merged=$(merge_preferences)

    echo "## Developer Preferences"
    echo ""
    echo "**Auto-detected from codebase and user settings. Follow these conventions.**"
    echo ""

    # Python
    local py_indent py_naming
    py_indent=$(echo "$merged" | jq -r '.["code.indent.python"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    py_naming=$(echo "$merged" | jq -r '.["code.naming.python"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$py_indent" ] || [ -n "$py_naming" ]; then
        echo "### Python"
        [ -n "$py_naming" ] && echo "- Naming: $py_naming"
        [ -n "$py_indent" ] && echo "- Indentation: $py_indent"
        echo ""
    fi

    # JavaScript/TypeScript
    local js_indent js_naming
    js_indent=$(echo "$merged" | jq -r '.["code.indent.javascript"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    js_naming=$(echo "$merged" | jq -r '.["code.naming.javascript"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$js_indent" ] || [ -n "$js_naming" ]; then
        echo "### JavaScript / TypeScript"
        [ -n "$js_naming" ] && echo "- Naming: $js_naming"
        [ -n "$js_indent" ] && echo "- Indentation: $js_indent"
        echo ""
    fi

    # Frameworks
    local backend frontend
    backend=$(echo "$merged" | jq -r '.["framework.backend"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    frontend=$(echo "$merged" | jq -r '.["framework.frontend"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$backend" ] || [ -n "$frontend" ]; then
        echo "### Frameworks"
        [ -n "$backend" ] && echo "- Backend: $backend preferred"
        [ -n "$frontend" ] && echo "- Frontend: $frontend preferred"
        echo ""
    fi

    # Testing
    local test_fw test_cov test_style
    test_fw=$(echo "$merged" | jq -r '.["framework.testing"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    test_cov=$(echo "$merged" | jq -r '.["testing.coverage"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    test_style=$(echo "$merged" | jq -r '.["testing.style"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$test_fw" ] || [ -n "$test_cov" ] || [ -n "$test_style" ]; then
        echo "### Testing"
        [ -n "$test_fw" ] && echo "- Framework: $test_fw"
        [ -n "$test_cov" ] && echo "- Coverage threshold: ${test_cov}%"
        [ -n "$test_style" ] && echo "- Style: $test_style"
        echo ""
    fi

    # Commits
    local commit_fmt
    commit_fmt=$(echo "$merged" | jq -r '.["commit.format"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$commit_fmt" ]; then
        echo "### Commits"
        echo "- Format: $commit_fmt"
        [ "$commit_fmt" = "conventional" ] && echo "  Use: feat:, fix:, docs:, refactor:, test:, chore:"
        echo ""
    fi

    # Docs level
    local docs_lvl
    docs_lvl=$(echo "$merged" | jq -r '.["docs.level"] | select(.confidence > 0.7) | .value // empty' 2>/dev/null)
    if [ -n "$docs_lvl" ]; then
        echo "### Documentation"
        echo "- Level: $docs_lvl"
        echo ""
    fi

    echo "---"
    echo "*Generated by preferences.sh inject at $(date -u +"%Y-%m-%dT%H:%M:%SZ")*"
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_init() {
    if [ -f "$PROJECT_PREFS" ]; then
        echo -e "${YELLOW}Preferences file already exists:${NC} $PROJECT_PREFS"
        echo "Use 'reset' to clear learned preferences, or delete the file to start fresh."
        return 0
    fi

    mkdir -p "$(dirname "$PROJECT_PREFS")"
    default_prefs > "$PROJECT_PREFS"
    echo -e "${GREEN}Created preferences file:${NC} $PROJECT_PREFS"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./scripts/preferences.sh learn    (auto-detect from codebase)"
    echo "  2. Run: ./scripts/preferences.sh list      (view detected preferences)"
    echo "  3. Run: ./scripts/preferences.sh inject    (markdown for agent prompts)"
    echo "  4. Set manually: ./scripts/preferences.sh set testing.coverage 80"
}

cmd_set() {
    local key="${1:-}"
    local value="${2:-}"

    if [ -z "$key" ] || [ -z "$value" ]; then
        echo -e "${RED}Error: key and value are required${NC}"
        echo "Usage: ./scripts/preferences.sh set <key> <value>"
        exit 1
    fi

    set_preference "$key" "$value" "explicit" "1.0" '[]'
    echo -e "${GREEN}Set:${NC} $key = $value (explicit, confidence: 1.0)"
}

cmd_get() {
    local key="${1:-}"

    if [ -z "$key" ]; then
        echo -e "${RED}Error: key is required${NC}"
        echo "Usage: ./scripts/preferences.sh get <key>"
        exit 1
    fi

    local value
    value=$(get_preference "$key")

    if [ -n "$value" ]; then
        echo "$value"
    else
        echo -e "${YELLOW}Not set:${NC} $key" >&2
        exit 1
    fi
}

cmd_list() {
    ensure_prefs

    local merged
    merged=$(merge_preferences)

    local count
    count=$(echo "$merged" | jq 'length' 2>/dev/null || echo 0)

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}No preferences set.${NC}"
        echo "Run: ./scripts/preferences.sh learn"
        return 0
    fi

    echo -e "${BOLD}Developer Preferences${NC} ($count entries)"
    echo ""

    echo "$merged" | jq -r 'to_entries | sort_by(.key) | .[] |
        "\(.key)\t\(.value.value)\t\(.value.source)\t\(.value.confidence)"' 2>/dev/null | \
    while IFS=$'\t' read -r key value source confidence; do
        local src_color="$CYAN"
        [ "$source" = "explicit" ] && src_color="$GREEN"

        echo -e "  ${BOLD}$key${NC}"
        echo -e "    Value:      $value"
        echo -e "    Source:     ${src_color}$source${NC}"
        echo -e "    Confidence: $confidence"
        echo ""
    done
}

cmd_learn() {
    ensure_prefs

    echo -e "${BOLD}Learning preferences from codebase...${NC}"
    echo ""

    # Detect Python
    local py_files
    py_files=$(find "$PROJECT_DIR" -name "*.py" -type f ! -path "*/node_modules/*" ! -path "*/__pycache__/*" ! -path "*/.git/*" 2>/dev/null | head -1)
    if [ -n "$py_files" ]; then
        echo -e "  ${CYAN}Python:${NC} Analyzing..."
        detect_indentation "py" "python"
        detect_naming "py" "python"
        echo -e "  ${GREEN}Python:${NC} Done"
    fi

    # Detect JavaScript/TypeScript
    local js_files
    js_files=$(find "$PROJECT_DIR" \( -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \) -type f ! -path "*/node_modules/*" ! -path "*/.git/*" 2>/dev/null | head -1)
    if [ -n "$js_files" ]; then
        echo -e "  ${CYAN}JavaScript:${NC} Analyzing..."
        detect_indentation "js" "javascript"
        detect_naming "js" "javascript"
        echo -e "  ${GREEN}JavaScript:${NC} Done"
    fi

    # Detect frameworks
    echo -e "  ${CYAN}Frameworks:${NC} Scanning..."
    detect_frameworks
    echo -e "  ${GREEN}Frameworks:${NC} Done"

    # Detect test patterns
    echo -e "  ${CYAN}Testing:${NC} Analyzing..."
    detect_test_patterns
    echo -e "  ${GREEN}Testing:${NC} Done"

    # Detect commit style
    echo -e "  ${CYAN}Commits:${NC} Analyzing..."
    detect_commit_style
    echo -e "  ${GREEN}Commits:${NC} Done"

    echo ""

    local count
    count=$(jq '.preferences | length' "$PROJECT_PREFS" 2>/dev/null || echo 0)
    echo -e "${GREEN}Learned $count preference(s).${NC}"
    echo "Run: ./scripts/preferences.sh list    (to view)"
    echo "Run: ./scripts/preferences.sh inject  (markdown output for agents)"
}

cmd_reset() {
    ensure_prefs

    # Keep explicit preferences, remove learned
    local temp_dir
    temp_dir="$(dirname "$PROJECT_PREFS")"
    local tmp
    tmp=$(mktemp "$temp_dir/.prefs-reset.XXXXXX")
    chmod 600 "$tmp"

    jq '{version: .version, preferences: (.preferences | to_entries | map(select(.value.source == "explicit")) | from_entries)}' \
        "$PROJECT_PREFS" > "$tmp"

    mv "$tmp" "$PROJECT_PREFS"

    local remaining
    remaining=$(jq '.preferences | length' "$PROJECT_PREFS" 2>/dev/null || echo 0)
    echo -e "${GREEN}Reset complete.${NC} Kept $remaining explicit preference(s), removed all learned."
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING & DISPATCH
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
    set)     cmd_set "$@" ;;
    get)     cmd_get "$@" ;;
    list)    cmd_list ;;
    learn)   cmd_learn ;;
    inject)  cmd_inject ;;
    init)    cmd_init ;;
    reset)   cmd_reset ;;
    --help|help) show_help ;;
    "")      show_help ;;
    *)
        echo -e "${RED}Unknown command: $COMMAND${NC}"
        echo "Run ./scripts/preferences.sh --help for usage."
        exit 1
        ;;
esac

#!/bin/bash

# The Anvil — Tier 1 Shell Pre-Flight Validation
# Pure shell checks (no LLM). Catches syntax errors, banned patterns,
# broken imports, and scope drift BEFORE expensive agents run.
#
# USAGE:
#   ./scripts/anvil.sh check <file-or-dir>     Run all T1 checks
#   ./scripts/anvil.sh syntax <file>            Syntax validation only
#   ./scripts/anvil.sh patterns <file-or-dir>   Banned pattern scan only
#   ./scripts/anvil.sh imports <file>           Import resolution check
#   ./scripts/anvil.sh scope <story-file>       T4: Scope validation
#   ./scripts/anvil.sh --help                   Show help
#
# EXIT CODES: 0=pass, 1=warnings, 2=errors (blocks pipeline)
#
# Part of: Claude AS Framework - The Anvil (v1.9.0.13)

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

# Framework directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Counters
ERRORS=0
WARNINGS=0
PASSED=0

# ═══════════════════════════════════════════════════════════════
# BANNED PATTERNS (matches gate-keeper.md zero-tolerance list)
# ═══════════════════════════════════════════════════════════════

BANNED_KEYWORDS=(
    'TODO'
    'FIXME'
    'HACK'
    'XXX'
    'PLACEHOLDER'
    'STUB'
    'COMING SOON'
    'NOT IMPLEMENTED'
    'WIP'
    'WORK IN PROGRESS'
    'TEMPORARY'
    'Lorem ipsum'
)

BANNED_CODE_PATTERNS=(
    'NotImplementedError'
    'NotImplementedException'
    'throw new Error\("Not implemented"\)'
    'throw new Error\("not implemented"\)'
    'console\.log\("TODO'
    'return null.*placeholder'
    'return null.*stub'
    '/\* stub \*/'
    '/\* fake \*/'
    '// will implement later'
)

# File extensions to check
CODE_EXTENSIONS="py|js|ts|tsx|jsx|cs|sh|bash|rb|go|rs|java|php"

# ═══════════════════════════════════════════════════════════════
# SYNTAX VALIDATION
# ═══════════════════════════════════════════════════════════════

check_syntax() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo -e "  ${RED}[BLOCK]${NC} File not found: $file"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    local ext="${file##*.}"
    local result=0

    case "$ext" in
        py)
            if command -v python3 &>/dev/null; then
                if ! python3 -m py_compile "$file" 2>/dev/null; then
                    echo -e "  ${RED}[BLOCK]${NC} Python syntax error: $file"
                    ERRORS=$((ERRORS + 1))
                    result=1
                else
                    PASSED=$((PASSED + 1))
                fi
            fi
            ;;
        js|mjs)
            if command -v node &>/dev/null; then
                if ! node --check "$file" 2>/dev/null; then
                    echo -e "  ${RED}[BLOCK]${NC} JavaScript syntax error: $file"
                    ERRORS=$((ERRORS + 1))
                    result=1
                else
                    PASSED=$((PASSED + 1))
                fi
            fi
            ;;
        sh|bash)
            if ! bash -n "$file" 2>/dev/null; then
                echo -e "  ${RED}[BLOCK]${NC} Shell syntax error: $file"
                ERRORS=$((ERRORS + 1))
                result=1
            else
                PASSED=$((PASSED + 1))
            fi
            ;;
        json)
            if command -v jq &>/dev/null; then
                if ! jq empty "$file" 2>/dev/null; then
                    echo -e "  ${RED}[BLOCK]${NC} JSON syntax error: $file"
                    ERRORS=$((ERRORS + 1))
                    result=1
                else
                    PASSED=$((PASSED + 1))
                fi
            elif command -v python3 &>/dev/null; then
                if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
                    echo -e "  ${RED}[BLOCK]${NC} JSON syntax error: $file"
                    ERRORS=$((ERRORS + 1))
                    result=1
                else
                    PASSED=$((PASSED + 1))
                fi
            fi
            ;;
        *)
            # No syntax checker available for this extension
            PASSED=$((PASSED + 1))
            ;;
    esac

    return $result
}

# ═══════════════════════════════════════════════════════════════
# BANNED PATTERN SCAN
# ═══════════════════════════════════════════════════════════════

check_banned_patterns() {
    local target="$1"
    local found=0

    if [ ! -e "$target" ]; then
        echo -e "  ${RED}[BLOCK]${NC} Target not found: $target"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    # Build grep include flags for code files
    local include_flags=""
    for ext in py js ts tsx jsx cs sh bash rb go rs java php; do
        include_flags="$include_flags --include=*.${ext}"
    done

    # Exclude test files, node_modules, __pycache__
    local exclude_flags="--exclude-dir=node_modules --exclude-dir=__pycache__ --exclude-dir=.git --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build"

    # Check banned keywords
    for keyword in "${BANNED_KEYWORDS[@]}"; do
        local matches
        if [ -d "$target" ]; then
            matches=$(grep -rn "$keyword" $include_flags $exclude_flags "$target" 2>/dev/null || true)
        else
            matches=$(grep -n "$keyword" "$target" 2>/dev/null || true)
        fi

        if [ -n "$matches" ]; then
            while IFS= read -r match; do
                echo -e "  ${RED}[BLOCK]${NC} Banned pattern '${keyword}': $match"
                ERRORS=$((ERRORS + 1))
                found=$((found + 1))
            done <<< "$matches"
        fi
    done

    # Check banned code patterns
    for pattern in "${BANNED_CODE_PATTERNS[@]}"; do
        local matches
        if [ -d "$target" ]; then
            matches=$(grep -rn -E "$pattern" $include_flags $exclude_flags "$target" 2>/dev/null || true)
        else
            matches=$(grep -n -E "$pattern" "$target" 2>/dev/null || true)
        fi

        if [ -n "$matches" ]; then
            while IFS= read -r match; do
                echo -e "  ${RED}[BLOCK]${NC} Banned code pattern: $match"
                ERRORS=$((ERRORS + 1))
                found=$((found + 1))
            done <<< "$matches"
        fi
    done

    if [ "$found" -eq 0 ]; then
        PASSED=$((PASSED + 1))
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════
# IMPORT RESOLUTION (basic check)
# ═══════════════════════════════════════════════════════════════

check_imports() {
    local file="$1"

    if [ ! -f "$file" ]; then
        echo -e "  ${RED}[BLOCK]${NC} File not found: $file"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    local ext="${file##*.}"
    local dir
    dir=$(dirname "$file")

    case "$ext" in
        py)
            # Check relative imports resolve to existing files
            local imports
            imports=$(grep -n "^from \.\|^from \.\." "$file" 2>/dev/null || true)
            if [ -n "$imports" ]; then
                while IFS= read -r line; do
                    local lineno
                    lineno=$(echo "$line" | cut -d: -f1)
                    local module
                    module=$(echo "$line" | sed 's/.*from \(\.\.* *[a-zA-Z_]*\).*/\1/' | sed 's/^\.*//' | tr '.' '/')
                    if [ -n "$module" ]; then
                        if [ ! -f "$dir/$module.py" ] && [ ! -d "$dir/$module" ]; then
                            echo -e "  ${YELLOW}[WARN]${NC} Unresolved import at $file:$lineno — module '$module'"
                            WARNINGS=$((WARNINGS + 1))
                        fi
                    fi
                done <<< "$imports"
            fi
            PASSED=$((PASSED + 1))
            ;;
        js|ts|tsx|jsx|mjs)
            # Check local imports (./path or ../path) resolve to existing files
            local imports
            imports=$(grep -n "from ['\"]\.\.*/\|require(['\"]\.\.*/" "$file" 2>/dev/null || true)
            if [ -n "$imports" ]; then
                while IFS= read -r line; do
                    local lineno
                    lineno=$(echo "$line" | cut -d: -f1)
                    local import_path
                    import_path=$(echo "$line" | grep -o "['\"]\.\.*/[^'\"]*['\"]" | tr -d "'" | tr -d '"')
                    if [ -n "$import_path" ]; then
                        local resolved="$dir/$import_path"
                        # Check with and without common extensions
                        if [ ! -f "$resolved" ] && [ ! -f "${resolved}.js" ] && [ ! -f "${resolved}.ts" ] && [ ! -f "${resolved}.tsx" ] && [ ! -f "${resolved}/index.js" ] && [ ! -f "${resolved}/index.ts" ]; then
                            echo -e "  ${YELLOW}[WARN]${NC} Unresolved import at $file:$lineno — path '$import_path'"
                            WARNINGS=$((WARNINGS + 1))
                        fi
                    fi
                done <<< "$imports"
            fi
            PASSED=$((PASSED + 1))
            ;;
        *)
            PASSED=$((PASSED + 1))
            ;;
    esac

    return 0
}

# ═══════════════════════════════════════════════════════════════
# SCOPE VALIDATION (T4: expected vs actual changes)
# ═══════════════════════════════════════════════════════════════

check_scope() {
    local story_file="$1"

    if [ ! -f "$story_file" ]; then
        echo -e "  ${RED}[BLOCK]${NC} Story file not found: $story_file"
        ERRORS=$((ERRORS + 1))
        return 1
    fi

    echo -e "${CYAN}ANVIL T4: Scope Validation${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Extract expected files from story (look for "Expected Changes" section)
    local expected_create
    local expected_modify
    expected_create=$(sed -n '/### Expected Changes/,/###/{/Create:/,/Modify:\|###/{/Create:/d;/Modify:\|###/d;p}}' "$story_file" 2>/dev/null | sed 's/^[[:space:]]*-[[:space:]]*//' | grep -v '^$' || true)
    expected_modify=$(sed -n '/### Expected Changes/,/###/{/Modify:/,/###/{/Modify:/d;/###/d;p}}' "$story_file" 2>/dev/null | sed 's/^[[:space:]]*-[[:space:]]*//' | grep -v '^$' || true)

    if [ -z "$expected_create" ] && [ -z "$expected_modify" ]; then
        echo -e "  ${YELLOW}[WARN]${NC} No 'Expected Changes' section found in story"
        WARNINGS=$((WARNINGS + 1))
        return 0
    fi

    # Get actual changes from git
    local actual_changes
    actual_changes=$(git diff --name-only HEAD 2>/dev/null || git diff --name-only 2>/dev/null || true)

    if [ -z "$actual_changes" ]; then
        echo -e "  ${YELLOW}[WARN]${NC} No git changes detected"
        WARNINGS=$((WARNINGS + 1))
        return 0
    fi

    local scope_errors=0
    local scope_warnings=0

    # Check expected files were actually changed
    for expected_file in $expected_create $expected_modify; do
        if [ -n "$expected_file" ]; then
            if ! echo "$actual_changes" | grep -qF "$expected_file"; then
                echo -e "  ${RED}[BLOCK]${NC} Expected file NOT changed: $expected_file"
                scope_errors=$((scope_errors + 1))
            fi
        fi
    done

    # Check for unexpected changes (scope creep)
    while IFS= read -r actual_file; do
        if [ -n "$actual_file" ]; then
            local found=false
            for expected in $expected_create $expected_modify; do
                if [ "$actual_file" = "$expected" ]; then
                    found=true
                    break
                fi
            done
            if [ "$found" = false ]; then
                echo -e "  ${YELLOW}[WARN]${NC} Unexpected file changed (scope creep?): $actual_file"
                scope_warnings=$((scope_warnings + 1))
            fi
        fi
    done <<< "$actual_changes"

    ERRORS=$((ERRORS + scope_errors))
    WARNINGS=$((WARNINGS + scope_warnings))

    if [ "$scope_errors" -eq 0 ] && [ "$scope_warnings" -eq 0 ]; then
        echo -e "  ${GREEN}[PASS]${NC} Scope matches expected changes"
        PASSED=$((PASSED + 1))
    fi

    return 0
}

# ═══════════════════════════════════════════════════════════════
# RUN ALL T1 CHECKS on a file or directory
# ═══════════════════════════════════════════════════════════════

run_all_checks() {
    local target="$1"

    if [ ! -e "$target" ]; then
        echo -e "${RED}[BLOCK]${NC} Target not found: $target"
        exit 2
    fi

    echo -e "${CYAN}ANVIL T1: Shell Pre-Flight Validation${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Target: ${BOLD}$target${NC}"
    echo ""

    # Phase 1: Banned patterns
    echo -e "${BLUE}[1/3]${NC} Scanning for banned patterns..."
    check_banned_patterns "$target"
    echo ""

    # Phase 2: Syntax validation
    echo -e "${BLUE}[2/3]${NC} Validating syntax..."
    if [ -d "$target" ]; then
        while IFS= read -r -d '' file; do
            check_syntax "$file"
        done < <(find "$target" -type f \( -name "*.py" -o -name "*.js" -o -name "*.mjs" -o -name "*.sh" -o -name "*.bash" -o -name "*.json" \) -not -path "*/node_modules/*" -not -path "*/__pycache__/*" -not -path "*/.git/*" -print0 2>/dev/null)
    else
        check_syntax "$target"
    fi
    echo ""

    # Phase 3: Import resolution
    echo -e "${BLUE}[3/3]${NC} Checking import resolution..."
    if [ -d "$target" ]; then
        while IFS= read -r -d '' file; do
            check_imports "$file"
        done < <(find "$target" -type f \( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" \) -not -path "*/node_modules/*" -not -path "*/__pycache__/*" -not -path "*/.git/*" -print0 2>/dev/null)
    else
        check_imports "$target"
    fi
    echo ""

    # Summary
    print_summary
}

# ═══════════════════════════════════════════════════════════════
# SUMMARY OUTPUT
# ═══════════════════════════════════════════════════════════════

print_summary() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}ANVIL VERDICT: FAIL${NC}"
        echo -e "  Errors:   ${RED}$ERRORS${NC}"
        echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"
        echo -e "  Passed:   ${GREEN}$PASSED${NC}"
        echo ""
        echo -e "Action: ${RED}BLOCK${NC} — Fix errors before proceeding."
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}ANVIL VERDICT: WARN${NC}"
        echo -e "  Errors:   ${GREEN}0${NC}"
        echo -e "  Warnings: ${YELLOW}$WARNINGS${NC}"
        echo -e "  Passed:   ${GREEN}$PASSED${NC}"
        echo ""
        echo -e "Action: ${YELLOW}CONTINUE${NC} — Warnings logged. Tester should cover these."
    else
        echo -e "${GREEN}ANVIL VERDICT: PASS${NC}"
        echo -e "  Errors:   ${GREEN}0${NC}"
        echo -e "  Warnings: ${GREEN}0${NC}"
        echo -e "  Passed:   ${GREEN}$PASSED${NC}"
        echo ""
        echo -e "Action: ${GREEN}CONTINUE${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ═══════════════════════════════════════════════════════════════

case "${1:-}" in
    check)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 check <file-or-dir>"
            exit 1
        fi
        run_all_checks "$2"
        if [ "$ERRORS" -gt 0 ]; then
            exit 2
        elif [ "$WARNINGS" -gt 0 ]; then
            exit 1
        fi
        exit 0
        ;;
    syntax)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 syntax <file>"
            exit 1
        fi
        echo -e "${CYAN}ANVIL T1: Syntax Validation${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        check_syntax "$2"
        print_summary
        [ "$ERRORS" -gt 0 ] && exit 2
        exit 0
        ;;
    patterns)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 patterns <file-or-dir>"
            exit 1
        fi
        echo -e "${CYAN}ANVIL T1: Banned Pattern Scan${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        check_banned_patterns "$2"
        print_summary
        [ "$ERRORS" -gt 0 ] && exit 2
        exit 0
        ;;
    imports)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 imports <file>"
            exit 1
        fi
        echo -e "${CYAN}ANVIL T1: Import Resolution${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        check_imports "$2"
        print_summary
        [ "$ERRORS" -gt 0 ] && exit 2
        [ "$WARNINGS" -gt 0 ] && exit 1
        exit 0
        ;;
    scope)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 scope <story-file>"
            exit 1
        fi
        check_scope "$2"
        print_summary
        [ "$ERRORS" -gt 0 ] && exit 2
        [ "$WARNINGS" -gt 0 ] && exit 1
        exit 0
        ;;
    --help|-h)
        echo "The Anvil — Tier 1 Shell Pre-Flight Validation"
        echo ""
        echo "Usage: $0 <command> [target]"
        echo ""
        echo "Commands:"
        echo "  check <file-or-dir>     Run all T1 checks (syntax + patterns + imports)"
        echo "  syntax <file>           Syntax validation only"
        echo "  patterns <file-or-dir>  Banned pattern scan only"
        echo "  imports <file>          Import resolution check"
        echo "  scope <story-file>      T4: Scope validation (expected vs actual changes)"
        echo ""
        echo "Exit codes:"
        echo "  0  All checks passed"
        echo "  1  Warnings found (pipeline continues)"
        echo "  2  Errors found (pipeline BLOCKED)"
        echo ""
        echo "Supported languages:"
        echo "  Syntax:   Python, JavaScript, Shell, JSON"
        echo "  Imports:  Python, JavaScript/TypeScript"
        echo "  Patterns: All code files ($CODE_EXTENSIONS)"
        echo ""
        echo "Part of: Claude AS Framework - The Anvil (v1.9.0.13)"
        ;;
    "")
        echo "Usage: $0 <command> [target]"
        echo "Run '$0 --help' for details"
        exit 1
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run '$0 --help' for available commands"
        exit 1
        ;;
esac

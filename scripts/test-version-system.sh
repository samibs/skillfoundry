#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VERSION SYSTEM TEST SCRIPT
# ═══════════════════════════════════════════════════════════════
# Tests version detection, comparison, and update logic across
# all 3 platforms (Claude Code, Copilot CLI, Cursor)
# ═══════════════════════════════════════════════════════════════

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"

# Test directory (use mktemp for safe temp dir - avoids symlink race)
TEST_DIR="$(mktemp -d /tmp/skillfoundry-version-test.XXXXXXXXXX)"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# ═══════════════════════════════════════════════════════════════
# TEST HELPERS
# ═══════════════════════════════════════════════════════════════

print_test_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${RED}✗${NC} $test_name"
        echo -e "    Expected: ${YELLOW}$expected${NC}"
        echo -e "    Actual:   ${RED}$actual${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_file_exists() {
    local file="$1"
    local test_name="$2"

    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "  ${RED}✗${NC} $test_name"
        echo -e "    File not found: ${RED}$file${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

cleanup_test_dir() {
    if [ -d "$TEST_DIR" ] && [[ "$TEST_DIR" == /tmp/skillfoundry-version-test.* ]]; then
        rm -rf "$TEST_DIR"
    fi
    mkdir -p "$TEST_DIR"
}

# ═══════════════════════════════════════════════════════════════
# TEST: VERSION FORMAT PARSING
# ═══════════════════════════════════════════════════════════════

test_version_parsing() {
    print_test_header "TEST: Version Format Parsing"

    # Source the version-check.sh functions
    source "$SCRIPT_DIR/version-check.sh"

    # Test 4-component version
    parse_version "1.7.0.0"
    assert_equals "1" "$MAJOR" "Parse MAJOR from 1.7.0.0"
    assert_equals "7" "$FEATURE" "Parse FEATURE from 1.7.0.0"
    assert_equals "0" "$DATABASE" "Parse DATABASE from 1.7.0.0"
    assert_equals "0" "$ITERATION" "Parse ITERATION from 1.7.0.0"

    # Test 3-component version (legacy)
    parse_version "1.6.0"
    assert_equals "1" "$MAJOR" "Parse MAJOR from 1.6.0"
    assert_equals "6" "$FEATURE" "Parse FEATURE from 1.6.0"
    assert_equals "0" "$DATABASE" "Parse DATABASE from 1.6.0 (legacy)"
    assert_equals "0" "$ITERATION" "Parse ITERATION from 1.6.0 (defaults to 0)"

    # Test version with 'v' prefix
    parse_version "v1.8.0.5"
    assert_equals "1" "$MAJOR" "Parse MAJOR from v1.8.0.5 (strip v)"
    assert_equals "8" "$FEATURE" "Parse FEATURE from v1.8.0.5"
}

# ═══════════════════════════════════════════════════════════════
# TEST: VERSION COMPARISON
# ═══════════════════════════════════════════════════════════════

test_version_comparison() {
    print_test_header "TEST: Version Comparison Logic"

    source "$SCRIPT_DIR/version-check.sh"

    # Test same version
    result=$(compare_versions "1.7.0.0" "1.7.0.0")
    assert_equals "same" "$result" "1.7.0.0 vs 1.7.0.0 = same"

    # Test older version
    result=$(compare_versions "1.6.0.0" "1.7.0.0")
    assert_equals "older" "$result" "1.6.0.0 vs 1.7.0.0 = older"

    # Test newer version
    result=$(compare_versions "1.8.0.0" "1.7.0.0")
    assert_equals "newer" "$result" "1.8.0.0 vs 1.7.0.0 = newer"

    # Test patch difference
    result=$(compare_versions "1.7.0.0" "1.7.0.1")
    assert_equals "older" "$result" "1.7.0.0 vs 1.7.0.1 = older (patch)"

    # Test database difference
    result=$(compare_versions "1.7.0.0" "1.7.1.0")
    assert_equals "older" "$result" "1.7.0.0 vs 1.7.1.0 = older (database)"

    # Test feature difference
    result=$(compare_versions "1.7.0.0" "1.8.0.0")
    assert_equals "older" "$result" "1.7.0.0 vs 1.8.0.0 = older (feature)"

    # Test major difference
    result=$(compare_versions "1.7.0.0" "2.0.0.0")
    assert_equals "older" "$result" "1.7.0.0 vs 2.0.0.0 = older (major)"
}

# ═══════════════════════════════════════════════════════════════
# TEST: UPDATE DECISION LOGIC
# ═══════════════════════════════════════════════════════════════

test_update_decisions() {
    print_test_header "TEST: Update Decision Logic"

    source "$SCRIPT_DIR/version-check.sh"

    # Test fresh install
    result=$(determine_action "none" "1.7.0.0")
    assert_equals "FRESH_INSTALL" "$result" "No existing install → FRESH_INSTALL"

    # Test up to date
    result=$(determine_action "1.7.0.0" "1.7.0.0")
    assert_equals "UP_TO_DATE" "$result" "1.7.0.0 → 1.7.0.0 = UP_TO_DATE"

    # Test patch update
    result=$(determine_action "1.7.0.0" "1.7.0.1")
    assert_equals "PATCH_UPDATE" "$result" "1.7.0.0 → 1.7.0.1 = PATCH_UPDATE"

    # Test feature update
    result=$(determine_action "1.7.0.0" "1.8.0.0")
    assert_equals "FEATURE_UPDATE" "$result" "1.7.0.0 → 1.8.0.0 = FEATURE_UPDATE"

    # Test database migration
    result=$(determine_action "1.7.0.0" "1.7.1.0")
    assert_equals "DATABASE_MIGRATION_REQUIRED" "$result" "1.7.0.0 → 1.7.1.0 = DATABASE_MIGRATION"

    # Test major update
    result=$(determine_action "1.7.0.0" "2.0.0.0")
    assert_equals "MAJOR_UPDATE_FRESH_INSTALL_REQUIRED" "$result" "1.7.0.0 → 2.0.0.0 = MAJOR_UPDATE"

    # Test downgrade warning
    result=$(determine_action "1.8.0.0" "1.7.0.0")
    assert_equals "DOWNGRADE_WARNING" "$result" "1.8.0.0 → 1.7.0.0 = DOWNGRADE_WARNING"
}

# ═══════════════════════════════════════════════════════════════
# TEST: CLAUDE CODE PLATFORM
# ═══════════════════════════════════════════════════════════════

test_claude_platform() {
    print_test_header "TEST: Claude Code Platform"

    cleanup_test_dir
    local project="$TEST_DIR/claude-project"
    mkdir -p "$project"

    # Simulate existing installation with old version
    mkdir -p "$project/.claude"
    echo "1.6.0.0" > "$project/.claude/.framework-version"

    # Test version detection
    source "$SCRIPT_DIR/version-check.sh"
    local installed=$(get_installed_version "claude" "$project")
    assert_equals "1.6.0.0" "$installed" "Detect Claude Code old version"

    # Simulate update to new version
    echo "1.7.0.0" > "$project/.claude/.framework-version"
    installed=$(get_installed_version "claude" "$project")
    assert_equals "1.7.0.0" "$installed" "Detect Claude Code new version"

    # Test fresh install scenario
    rm -rf "$project/.claude"
    installed=$(get_installed_version "claude" "$project")
    assert_equals "none" "$installed" "Detect Claude Code no installation"
}

# ═══════════════════════════════════════════════════════════════
# TEST: COPILOT CLI PLATFORM
# ═══════════════════════════════════════════════════════════════

test_copilot_platform() {
    print_test_header "TEST: Copilot CLI Platform"

    cleanup_test_dir
    local project="$TEST_DIR/copilot-project"
    mkdir -p "$project"

    # Simulate existing installation with old version
    mkdir -p "$project/.copilot"
    echo "1.6.0.0" > "$project/.copilot/.framework-version"

    # Test version detection
    source "$SCRIPT_DIR/version-check.sh"
    local installed=$(get_installed_version "copilot" "$project")
    assert_equals "1.6.0.0" "$installed" "Detect Copilot CLI old version"

    # Simulate update to new version
    echo "1.7.0.0" > "$project/.copilot/.framework-version"
    installed=$(get_installed_version "copilot" "$project")
    assert_equals "1.7.0.0" "$installed" "Detect Copilot CLI new version"

    # Test fresh install scenario
    rm -rf "$project/.copilot"
    installed=$(get_installed_version "copilot" "$project")
    assert_equals "none" "$installed" "Detect Copilot CLI no installation"
}

# ═══════════════════════════════════════════════════════════════
# TEST: CURSOR PLATFORM
# ═══════════════════════════════════════════════════════════════

test_cursor_platform() {
    print_test_header "TEST: Cursor Platform"

    cleanup_test_dir
    local project="$TEST_DIR/cursor-project"
    mkdir -p "$project"

    # Simulate existing installation with old version
    mkdir -p "$project/.cursor"
    echo "1.6.0.0" > "$project/.cursor/.framework-version"

    # Test version detection
    source "$SCRIPT_DIR/version-check.sh"
    local installed=$(get_installed_version "cursor" "$project")
    assert_equals "1.6.0.0" "$installed" "Detect Cursor old version"

    # Simulate update to new version
    echo "1.7.0.0" > "$project/.cursor/.framework-version"
    installed=$(get_installed_version "cursor" "$project")
    assert_equals "1.7.0.0" "$installed" "Detect Cursor new version"

    # Test fresh install scenario
    rm -rf "$project/.cursor"
    installed=$(get_installed_version "cursor" "$project")
    assert_equals "none" "$installed" "Detect Cursor no installation"
}

# ═══════════════════════════════════════════════════════════════
# TEST: LEGACY VERSION MIGRATION (3-component → 4-component)
# ═══════════════════════════════════════════════════════════════

test_legacy_version_migration() {
    print_test_header "TEST: Legacy Version Migration (3→4 component)"

    source "$SCRIPT_DIR/version-check.sh"

    # Test 3-component legacy version comparison
    result=$(compare_versions "1.6.0" "1.7.0.0")
    assert_equals "older" "$result" "1.6.0 (legacy) vs 1.7.0.0 = older"

    # Test update decision with legacy version
    result=$(determine_action "1.6.0" "1.7.0.0")
    assert_equals "FEATURE_UPDATE" "$result" "1.6.0 (legacy) → 1.7.0.0 = FEATURE_UPDATE"

    # Test version-to-number conversion
    local num1=$(version_to_number "1.6.0")
    local num2=$(version_to_number "1.6.0.0")
    assert_equals "$num1" "$num2" "1.6.0 and 1.6.0.0 convert to same number"
}

# ═══════════════════════════════════════════════════════════════
# TEST: FRAMEWORK .version FILE
# ═══════════════════════════════════════════════════════════════

test_framework_version_file() {
    print_test_header "TEST: Framework .version File"

    assert_file_exists "$FRAMEWORK_DIR/.version" "Framework .version file exists"

    if [ -f "$FRAMEWORK_DIR/.version" ]; then
        local version=$(cat "$FRAMEWORK_DIR/.version" | tr -d '[:space:]')
        echo -e "  ${CYAN}Current framework version: ${YELLOW}$version${NC}"

        # Verify it's 4-component format
        IFS='.' read -r -a parts <<< "$version"
        local count=${#parts[@]}
        if [ $count -eq 4 ]; then
            echo -e "  ${GREEN}✓${NC} Version is 4-component format (MAJOR.FEATURE.DATABASE.ITERATION)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "  ${RED}✗${NC} Version is not 4-component format (found $count components)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ═══════════════════════════════════════════════════════════════

main() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║         SkillFoundry - Version System Test Suite                ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Run all tests
    test_framework_version_file
    test_version_parsing
    test_version_comparison
    test_update_decisions
    test_legacy_version_migration
    test_claude_platform
    test_copilot_platform
    test_cursor_platform

    # Print summary
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                      TEST SUMMARY                             ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Total tests:     $((TESTS_PASSED + TESTS_FAILED))"
    echo -e "  ${GREEN}Passed:          $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed:          $TESTS_FAILED${NC}"
    echo ""

    # Cleanup
    cleanup_test_dir

    # Exit code
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ Some tests failed. Please review the output above.${NC}"
        echo ""
        exit 1
    fi
}

# Run tests
main "$@"

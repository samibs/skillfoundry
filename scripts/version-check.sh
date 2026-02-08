#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VERSION CHECK SCRIPT
# ═══════════════════════════════════════════════════════════════
# Detects installed version, compares with available version,
# determines if update or fresh install is needed
#
# Version format: MAJOR.FEATURE.DATABASE.ITERATION
# - MAJOR: Breaking changes, requires fresh install
# - FEATURE: New features, update possible
# - DATABASE: Schema changes, requires migration
# - ITERATION: Patches/bug fixes, safe update
# ═══════════════════════════════════════════════════════════════

set -e
set -o pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"

# ═══════════════════════════════════════════════════════════════
# VERSION PARSING
# ═══════════════════════════════════════════════════════════════

parse_version() {
    local version="$1"

    # Remove 'v' prefix if present
    version="${version#v}"

    # Split by dots
    IFS='.' read -r -a parts <<< "$version"

    # Pad with zeros if needed (handle 1.7.0 as 1.7.0.0)
    MAJOR="${parts[0]:-0}"
    FEATURE="${parts[1]:-0}"
    DATABASE="${parts[2]:-0}"
    ITERATION="${parts[3]:-0}"
}

version_to_number() {
    local version="$1"
    parse_version "$version"

    # Convert to comparable number: MMMMFFFFDDDDIIII
    printf "%04d%04d%04d%04d" "$MAJOR" "$FEATURE" "$DATABASE" "$ITERATION"
}

compare_versions() {
    local v1="$1"
    local v2="$2"

    local n1=$(version_to_number "$v1")
    local n2=$(version_to_number "$v2")

    if [ "$n1" -lt "$n2" ]; then
        echo "older"
    elif [ "$n1" -gt "$n2" ]; then
        echo "newer"
    else
        echo "same"
    fi
}

# ═══════════════════════════════════════════════════════════════
# VERSION DETECTION
# ═══════════════════════════════════════════════════════════════

get_installed_version() {
    local platform="$1"
    local install_dir="$2"

    local version_file=""

    case "$platform" in
        claude)
            version_file="$install_dir/.claude/.framework-version"
            ;;
        copilot)
            version_file="$install_dir/.copilot/.framework-version"
            ;;
        cursor)
            version_file="$install_dir/.cursor/.framework-version"
            ;;
    esac

    if [ -f "$version_file" ]; then
        cat "$version_file" | tr -d '[:space:]'
    else
        echo "none"
    fi
}

get_available_version() {
    if [ -f "$FRAMEWORK_DIR/.version" ]; then
        cat "$FRAMEWORK_DIR/.version" | tr -d '[:space:]'
    else
        echo "unknown"
    fi
}

# ═══════════════════════════════════════════════════════════════
# UPDATE DECISION LOGIC
# ═══════════════════════════════════════════════════════════════

determine_action() {
    local installed="$1"
    local available="$2"

    if [ "$installed" = "none" ]; then
        echo "FRESH_INSTALL"
        return
    fi

    if [ "$available" = "unknown" ]; then
        echo "ERROR_NO_VERSION"
        return
    fi

    # Parse versions
    parse_version "$installed"
    local inst_major=$MAJOR
    local inst_feature=$FEATURE
    local inst_database=$DATABASE
    local inst_iteration=$ITERATION

    parse_version "$available"
    local avail_major=$MAJOR
    local avail_feature=$FEATURE
    local avail_database=$DATABASE
    local avail_iteration=$ITERATION

    # Compare
    local comparison=$(compare_versions "$installed" "$available")

    if [ "$comparison" = "same" ]; then
        echo "UP_TO_DATE"
        return
    fi

    if [ "$comparison" = "newer" ]; then
        echo "DOWNGRADE_WARNING"
        return
    fi

    # Check if major version changed
    if [ "$inst_major" -ne "$avail_major" ]; then
        echo "MAJOR_UPDATE_FRESH_INSTALL_REQUIRED"
        return
    fi

    # Check if database version changed
    if [ "$inst_database" -ne "$avail_database" ]; then
        echo "DATABASE_MIGRATION_REQUIRED"
        return
    fi

    # Feature or iteration update
    if [ "$inst_feature" -ne "$avail_feature" ]; then
        echo "FEATURE_UPDATE"
        return
    fi

    if [ "$inst_iteration" -ne "$avail_iteration" ]; then
        echo "PATCH_UPDATE"
        return
    fi

    echo "UNKNOWN"
}

# ═══════════════════════════════════════════════════════════════
# VERSION DISPLAY
# ═══════════════════════════════════════════════════════════════

display_version_banner() {
    local version="$1"
    parse_version "$version"

    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                  ${GREEN}Claude AS Framework${NC}                       ${CYAN}║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Version: ${YELLOW}$MAJOR${NC}.${YELLOW}$FEATURE${NC}.${YELLOW}$DATABASE${NC}.${YELLOW}$ITERATION${NC}                                        ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${MAJOR} - Major Version      (Breaking changes)                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${FEATURE} - Feature Version    (New features)                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${DATABASE} - Database Version   (Schema changes)                 ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${ITERATION} - Iteration          (Patches/bug fixes)              ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
}

display_version_info() {
    local installed="$1"
    local available="$2"
    local action="$3"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  VERSION INFORMATION${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ "$installed" != "none" ]; then
        echo -e "  ${CYAN}Installed Version:${NC} ${YELLOW}$installed${NC}"
    else
        echo -e "  ${CYAN}Installed Version:${NC} ${RED}Not installed${NC}"
    fi

    echo -e "  ${CYAN}Available Version:${NC} ${GREEN}$available${NC}"
    echo ""

    case "$action" in
        FRESH_INSTALL)
            echo -e "  ${GREEN}✓${NC} Action: ${GREEN}Fresh installation${NC}"
            echo -e "    Run: ${YELLOW}./install.sh${NC}"
            ;;
        UP_TO_DATE)
            echo -e "  ${GREEN}✓${NC} Status: ${GREEN}Up to date${NC}"
            echo -e "    No action needed"
            ;;
        MAJOR_UPDATE_FRESH_INSTALL_REQUIRED)
            echo -e "  ${RED}⚠${NC}  Action: ${RED}Major version change - Fresh install required${NC}"
            echo -e "    Breaking changes detected"
            echo -e "    1. Backup your work"
            echo -e "    2. Run: ${YELLOW}./install.sh --force${NC}"
            ;;
        DATABASE_MIGRATION_REQUIRED)
            echo -e "  ${YELLOW}⚠${NC}  Action: ${YELLOW}Database migration required${NC}"
            echo -e "    Schema changes detected"
            echo -e "    1. Backup your database"
            echo -e "    2. Run: ${YELLOW}./update.sh --migrate${NC}"
            ;;
        FEATURE_UPDATE)
            echo -e "  ${GREEN}✓${NC} Action: ${GREEN}Feature update available${NC}"
            echo -e "    New features added"
            echo -e "    Run: ${YELLOW}./update.sh${NC}"
            ;;
        PATCH_UPDATE)
            echo -e "  ${GREEN}✓${NC} Action: ${GREEN}Patch update available${NC}"
            echo -e "    Bug fixes and improvements"
            echo -e "    Run: ${YELLOW}./update.sh${NC}"
            ;;
        DOWNGRADE_WARNING)
            echo -e "  ${YELLOW}⚠${NC}  Warning: ${YELLOW}Installed version is newer than available${NC}"
            echo -e "    Installed: ${installed}"
            echo -e "    Available: ${available}"
            echo -e "    Are you on a development branch?"
            ;;
        ERROR_NO_VERSION)
            echo -e "  ${RED}✗${NC} Error: ${RED}Cannot determine available version${NC}"
            echo -e "    .version file missing"
            ;;
        *)
            echo -e "  ${RED}✗${NC} Error: ${RED}Unknown state${NC}"
            ;;
    esac

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# CHANGELOG DISPLAY
# ═══════════════════════════════════════════════════════════════

show_changelog_since() {
    local since_version="$1"
    local changelog_file="$FRAMEWORK_DIR/CHANGELOG.md"

    if [ ! -f "$changelog_file" ]; then
        return
    fi

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  WHAT'S NEW${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Extract changelog entries newer than installed version
    # This is a simplified version - would need more complex parsing for production
    echo -e "${CYAN}See CHANGELOG.md for full details${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

main() {
    local platform="${1:-claude}"
    local install_dir="${2:-$HOME}"
    local show_banner="${3:-true}"

    # Get versions
    local installed=$(get_installed_version "$platform" "$install_dir")
    local available=$(get_available_version)

    # Determine action
    local action=$(determine_action "$installed" "$available")

    # Display
    if [ "$show_banner" = "true" ]; then
        if [ "$available" != "unknown" ]; then
            display_version_banner "$available"
        fi
    fi

    display_version_info "$installed" "$available" "$action"

    # Show changelog if update available
    if [[ "$action" =~ UPDATE ]] && [ "$installed" != "none" ]; then
        show_changelog_since "$installed"
    fi

    # Return status code based on action
    case "$action" in
        UP_TO_DATE)
            exit 0
            ;;
        FRESH_INSTALL|*UPDATE*)
            exit 10  # Update available
            ;;
        DOWNGRADE_WARNING|ERROR_*)
            exit 1  # Error
            ;;
        *)
            exit 1
            ;;
    esac
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi

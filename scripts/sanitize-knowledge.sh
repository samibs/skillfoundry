#!/bin/bash
# Sanitize Knowledge - Pre-commit sanitizer for knowledge repository files
# Strips secrets, normalizes paths, and validates JSON/JSONL before commit.
#
# USAGE:
#   ./scripts/sanitize-knowledge.sh <dir>           Sanitize all files in directory
#   ./scripts/sanitize-knowledge.sh --check <dir>   Dry-run: report what would be sanitized
#   ./scripts/sanitize-knowledge.sh --help           Show help
#
# macOS bash 3.2 compatible (no declare -A, no ${var^^}, no mapfile/readarray)

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# COLORS & FORMATTING
# ═══════════════════════════════════════════════════════════════

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
BOLD=$'\033[1m'
NC=$'\033[0m'

# ═══════════════════════════════════════════════════════════════
# GLOBALS / COUNTERS
# ═══════════════════════════════════════════════════════════════

FILES_PROCESSED=0
FILES_SKIPPED=0
LINES_REDACTED=0
PATHS_NORMALIZED=0
INVALID_ENTRIES_REMOVED=0
JSON_VALID=0
JSON_INVALID=0
DRY_RUN=0
TARGET_DIR=""

# Temp file for accumulating warnings (avoids subshell counter loss)
WARN_LOG=""

# ═══════════════════════════════════════════════════════════════
# USAGE / HELP
# ═══════════════════════════════════════════════════════════════

usage() {
    cat <<EOF
${BOLD}sanitize-knowledge.sh${NC} - Pre-commit sanitizer for knowledge files

${BOLD}USAGE:${NC}
  sanitize-knowledge.sh <dir>           Sanitize all files in directory
  sanitize-knowledge.sh --check <dir>   Dry-run: report what would be sanitized
  sanitize-knowledge.sh --help          Show help

${BOLD}DESCRIPTION:${NC}
  Recursively processes .json and .jsonl files in the target directory.
  Strips secret patterns, normalizes absolute paths to portable variables,
  and validates JSON structure. Files matching sensitive name patterns
  (.env*, *.key, *.pem, *.p12, *credential*, *secret*) are skipped entirely.

${BOLD}SANITIZATION RULES:${NC}
  - Lines matching API_KEY=, SECRET=, TOKEN=, PASSWORD=, PRIVATE_KEY=,
    AWS_ACCESS (case insensitive) are removed
  - Absolute home paths (/home/*/projects/*, /Users/*/code/*,
    C:\\Users\\*\\code\\*) are replaced with \$PROJECT_ROOT/
  - /tmp/tmp.* paths are replaced with \$TMPDIR/
  - .json files must pass jq validation (skipped if invalid)
  - .jsonl files: invalid lines are removed

${BOLD}EXIT CODES:${NC}
  0  Success
  1  Error (missing arguments, invalid directory, etc.)

${BOLD}EXAMPLES:${NC}
  sanitize-knowledge.sh ./staging
  sanitize-knowledge.sh --check ./staging
EOF
}

# ═══════════════════════════════════════════════════════════════
# LOGGING HELPERS
# ═══════════════════════════════════════════════════════════════

log_info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_ok() {
    printf "${GREEN}[OK]${NC} %s\n" "$1"
}

log_warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
    if [ -n "$WARN_LOG" ]; then
        echo "$1" >> "$WARN_LOG"
    fi
}

log_error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

log_skip() {
    printf "${YELLOW}[SKIP]${NC} %s\n" "$1"
}

log_dry() {
    printf "${BLUE}[DRY-RUN]${NC} %s\n" "$1"
}

# ═══════════════════════════════════════════════════════════════
# DEPENDENCY CHECK
# ═══════════════════════════════════════════════════════════════

check_dependencies() {
    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq is required but not installed. Install it with:"
        log_error "  macOS:  brew install jq"
        log_error "  Linux:  sudo apt-get install jq  OR  sudo yum install jq"
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# FILE SKIP CHECK (sensitive filenames)
# ═══════════════════════════════════════════════════════════════

should_skip_file() {
    local filepath="$1"
    local basename
    basename="$(basename "$filepath")"

    # Skip .env* files
    case "$basename" in
        .env|.env.*) return 0 ;;
    esac

    # Skip *.key, *.pem, *.p12
    case "$basename" in
        *.key|*.pem|*.p12) return 0 ;;
    esac

    # Skip files with "credential" or "secret" in the name (case insensitive)
    local lower_basename
    lower_basename="$(echo "$basename" | tr 'A-Z' 'a-z')"
    case "$lower_basename" in
        *credential*|*secret*) return 0 ;;
    esac

    return 1
}

# ═══════════════════════════════════════════════════════════════
# SECRET LINE DETECTION
# ═══════════════════════════════════════════════════════════════

# Patterns that indicate a line contains secrets (case insensitive)
SECRET_PATTERNS="API_KEY=|SECRET=|TOKEN=|PASSWORD=|PRIVATE_KEY=|AWS_ACCESS"

line_contains_secret() {
    local line="$1"
    echo "$line" | grep -i -qE "$SECRET_PATTERNS"
}

count_secret_lines() {
    local filepath="$1"
    local result
    result="$(grep -i -c -E "$SECRET_PATTERNS" "$filepath" 2>/dev/null)" || true
    if [ -z "$result" ] || [ "$result" -eq 0 ] 2>/dev/null; then
        echo "0"
    else
        echo "$result"
    fi
}

# ═══════════════════════════════════════════════════════════════
# PATH NORMALIZATION
# ═══════════════════════════════════════════════════════════════

normalize_paths_in_line() {
    local line="$1"
    local result="$line"

    # Replace /home/<user>/projects/<anything>/ with $PROJECT_ROOT/
    result="$(echo "$result" | sed 's|/home/[^/]*/projects/[^/]*/|\$PROJECT_ROOT/|g')"

    # Replace /Users/<user>/code/<anything>/ with $PROJECT_ROOT/
    result="$(echo "$result" | sed 's|/Users/[^/]*/code/[^/]*/|\$PROJECT_ROOT/|g')"

    # Replace C:\Users\<user>\code\<anything>\ with $PROJECT_ROOT/
    # Handle both backslash variants (literal and escaped)
    result="$(echo "$result" | sed 's|C:\\Users\\[^\\]*\\code\\[^\\]*\\|\$PROJECT_ROOT/|g')"
    result="$(echo "$result" | sed 's|C:\\\\Users\\\\[^\\]*\\\\code\\\\[^\\]*\\\\|\$PROJECT_ROOT/|g')"

    # Replace /tmp/tmp.* paths with $TMPDIR/
    result="$(echo "$result" | sed 's|/tmp/tmp\.[A-Za-z0-9._-]*/|\$TMPDIR/|g')"
    result="$(echo "$result" | sed 's|/tmp/tmp\.[A-Za-z0-9._-]*|\$TMPDIR|g')"

    echo "$result"
}

count_path_replacements() {
    local filepath="$1"
    local count=0
    local c

    c="$(grep -c '/home/[^/]*/projects/' "$filepath" 2>/dev/null)" || c=0
    count=$((count + c))

    c="$(grep -c '/Users/[^/]*/code/' "$filepath" 2>/dev/null)" || c=0
    count=$((count + c))

    c="$(grep -c 'C:\\Users\\[^\\]*\\code\\' "$filepath" 2>/dev/null)" || c=0
    count=$((count + c))

    c="$(grep -c 'C:\\\\Users\\\\[^\\]*\\\\code\\\\' "$filepath" 2>/dev/null)" || c=0
    count=$((count + c))

    c="$(grep -c '/tmp/tmp\.' "$filepath" 2>/dev/null)" || c=0
    count=$((count + c))

    echo "$count"
}

# ═══════════════════════════════════════════════════════════════
# JSON VALIDATION
# ═══════════════════════════════════════════════════════════════

validate_json() {
    local filepath="$1"
    jq empty "$filepath" 2>/dev/null
}

validate_jsonl_line() {
    local line="$1"
    echo "$line" | jq empty 2>/dev/null
}

# ═══════════════════════════════════════════════════════════════
# SANITIZE A SINGLE .json FILE
# ═══════════════════════════════════════════════════════════════

sanitize_json_file() {
    local filepath="$1"
    local relpath="${filepath#$TARGET_DIR/}"

    # Validate JSON structure first
    if ! validate_json "$filepath"; then
        log_warn "Invalid JSON, skipping: $relpath"
        JSON_INVALID=$((JSON_INVALID + 1))
        return
    fi
    JSON_VALID=$((JSON_VALID + 1))

    # Count what will change
    local secret_count
    secret_count="$(count_secret_lines "$filepath")"
    local path_count
    path_count="$(count_path_replacements "$filepath")"

    if [ "$DRY_RUN" -eq 1 ]; then
        if [ "$secret_count" -gt 0 ] || [ "$path_count" -gt 0 ]; then
            log_dry "$relpath: $secret_count secret line(s), $path_count path(s) to normalize"
        fi
        FILES_PROCESSED=$((FILES_PROCESSED + 1))
        LINES_REDACTED=$((LINES_REDACTED + secret_count))
        PATHS_NORMALIZED=$((PATHS_NORMALIZED + path_count))
        return
    fi

    # Build sanitized content line by line
    local tmpfile
    tmpfile="$(mktemp)"
    local redacted=0
    local normalized=0

    while IFS= read -r line || [ -n "$line" ]; do
        # Check for secret patterns
        if line_contains_secret "$line"; then
            redacted=$((redacted + 1))
            continue
        fi

        # Normalize paths
        local new_line
        new_line="$(normalize_paths_in_line "$line")"
        if [ "$new_line" != "$line" ]; then
            normalized=$((normalized + 1))
        fi

        echo "$new_line" >> "$tmpfile"
    done < "$filepath"

    # If secrets were stripped, re-validate JSON (structure may be broken)
    if [ "$redacted" -gt 0 ]; then
        if ! jq empty "$tmpfile" 2>/dev/null; then
            # Try to fix by running through jq (lenient parse of the remaining content)
            # If that fails too, write what we have and warn
            log_warn "JSON structure may be altered after secret removal: $relpath"
        fi
    fi

    # Write back
    cp "$tmpfile" "$filepath"
    rm -f "$tmpfile"

    LINES_REDACTED=$((LINES_REDACTED + redacted))
    PATHS_NORMALIZED=$((PATHS_NORMALIZED + normalized))
    FILES_PROCESSED=$((FILES_PROCESSED + 1))

    if [ "$redacted" -gt 0 ] || [ "$normalized" -gt 0 ]; then
        log_ok "$relpath: redacted=$redacted, paths_normalized=$normalized"
    fi
}

# ═══════════════════════════════════════════════════════════════
# SANITIZE A SINGLE .jsonl FILE
# ═══════════════════════════════════════════════════════════════

sanitize_jsonl_file() {
    local filepath="$1"
    local relpath="${filepath#$TARGET_DIR/}"

    local secret_count
    secret_count="$(count_secret_lines "$filepath")"
    local path_count
    path_count="$(count_path_replacements "$filepath")"

    if [ "$DRY_RUN" -eq 1 ]; then
        # Count invalid lines
        local invalid_lines=0
        while IFS= read -r line || [ -n "$line" ]; do
            if [ -z "$line" ]; then
                continue
            fi
            if ! validate_jsonl_line "$line"; then
                invalid_lines=$((invalid_lines + 1))
            fi
        done < "$filepath"

        if [ "$secret_count" -gt 0 ] || [ "$path_count" -gt 0 ] || [ "$invalid_lines" -gt 0 ]; then
            log_dry "$relpath: $secret_count secret line(s), $path_count path(s), $invalid_lines invalid line(s)"
        fi
        FILES_PROCESSED=$((FILES_PROCESSED + 1))
        LINES_REDACTED=$((LINES_REDACTED + secret_count))
        PATHS_NORMALIZED=$((PATHS_NORMALIZED + path_count))
        INVALID_ENTRIES_REMOVED=$((INVALID_ENTRIES_REMOVED + invalid_lines))
        return
    fi

    # Build sanitized content line by line
    local tmpfile
    tmpfile="$(mktemp)"
    local redacted=0
    local normalized=0
    local removed=0

    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines
        if [ -z "$line" ]; then
            continue
        fi

        # Check for secret patterns
        if line_contains_secret "$line"; then
            redacted=$((redacted + 1))
            continue
        fi

        # Normalize paths
        local new_line
        new_line="$(normalize_paths_in_line "$line")"
        if [ "$new_line" != "$line" ]; then
            normalized=$((normalized + 1))
        fi

        # Validate JSONL line
        if ! validate_jsonl_line "$new_line"; then
            log_warn "Removing invalid JSONL line in $relpath"
            removed=$((removed + 1))
            continue
        fi

        echo "$new_line" >> "$tmpfile"
    done < "$filepath"

    # Write back
    cp "$tmpfile" "$filepath"
    rm -f "$tmpfile"

    LINES_REDACTED=$((LINES_REDACTED + redacted))
    PATHS_NORMALIZED=$((PATHS_NORMALIZED + normalized))
    INVALID_ENTRIES_REMOVED=$((INVALID_ENTRIES_REMOVED + removed))
    FILES_PROCESSED=$((FILES_PROCESSED + 1))

    if [ "$redacted" -gt 0 ] || [ "$normalized" -gt 0 ] || [ "$removed" -gt 0 ]; then
        log_ok "$relpath: redacted=$redacted, paths_normalized=$normalized, invalid_removed=$removed"
    fi
}

# ═══════════════════════════════════════════════════════════════
# FILE DISCOVERY & DISPATCH
# ═══════════════════════════════════════════════════════════════

process_directory() {
    local dir="$1"

    log_info "Scanning directory: $dir"
    echo ""

    # Collect files using find (bash 3.2 compatible - no mapfile)
    local file_list
    file_list="$(mktemp)"
    find "$dir" -type f \( -name "*.json" -o -name "*.jsonl" \) 2>/dev/null | sort > "$file_list"

    local total_files
    total_files="$(wc -l < "$file_list" | tr -d ' ')"

    if [ "$total_files" -eq 0 ]; then
        log_warn "No .json or .jsonl files found in $dir"
        rm -f "$file_list"
        return
    fi

    log_info "Found $total_files file(s) to process"
    echo ""

    while IFS= read -r filepath; do
        # Skip empty lines from find
        if [ -z "$filepath" ]; then
            continue
        fi

        local relpath="${filepath#$TARGET_DIR/}"

        # Check if file should be skipped (sensitive name patterns)
        if should_skip_file "$filepath"; then
            log_skip "Sensitive file skipped: $relpath"
            FILES_SKIPPED=$((FILES_SKIPPED + 1))
            continue
        fi

        # Dispatch based on extension
        case "$filepath" in
            *.jsonl)
                sanitize_jsonl_file "$filepath"
                ;;
            *.json)
                sanitize_json_file "$filepath"
                ;;
        esac
    done < "$file_list"

    rm -f "$file_list"
}

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════

print_summary() {
    echo ""
    echo "════════════════════════════════════════════════════════"
    if [ "$DRY_RUN" -eq 1 ]; then
        printf "${BOLD}${BLUE}  SANITIZATION DRY-RUN SUMMARY${NC}\n"
    else
        printf "${BOLD}${GREEN}  SANITIZATION SUMMARY${NC}\n"
    fi
    echo "════════════════════════════════════════════════════════"
    printf "  ${BOLD}Files processed:${NC}        %d\n" "$FILES_PROCESSED"
    printf "  ${BOLD}Files skipped:${NC}          %d\n" "$FILES_SKIPPED"
    printf "  ${BOLD}Lines redacted:${NC}         %d\n" "$LINES_REDACTED"
    printf "  ${BOLD}Paths normalized:${NC}       %d\n" "$PATHS_NORMALIZED"
    printf "  ${BOLD}Invalid entries removed:${NC} %d\n" "$INVALID_ENTRIES_REMOVED"
    printf "  ${BOLD}JSON valid:${NC}             %d\n" "$JSON_VALID"
    printf "  ${BOLD}JSON invalid (skipped):${NC} %d\n" "$JSON_INVALID"
    echo "════════════════════════════════════════════════════════"

    # Print warnings if any
    if [ -n "$WARN_LOG" ] && [ -f "$WARN_LOG" ]; then
        local warn_count
        warn_count="$(wc -l < "$WARN_LOG" | tr -d ' ')"
        if [ "$warn_count" -gt 0 ]; then
            echo ""
            printf "${YELLOW}${BOLD}  Warnings: %d${NC}\n" "$warn_count"
            while IFS= read -r w; do
                printf "    ${YELLOW}- %s${NC}\n" "$w"
            done < "$WARN_LOG"
        fi
    fi

    echo ""
}

# ═══════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════

cleanup() {
    if [ -n "$WARN_LOG" ] && [ -f "$WARN_LOG" ]; then
        rm -f "$WARN_LOG"
    fi
}

trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

parse_args() {
    if [ $# -eq 0 ]; then
        log_error "Missing required argument: directory path"
        echo ""
        usage
        exit 1
    fi

    while [ $# -gt 0 ]; do
        case "$1" in
            --help|-h)
                usage
                exit 0
                ;;
            --check)
                DRY_RUN=1
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo ""
                usage
                exit 1
                ;;
            *)
                if [ -z "$TARGET_DIR" ]; then
                    TARGET_DIR="$1"
                else
                    log_error "Unexpected argument: $1"
                    echo ""
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [ -z "$TARGET_DIR" ]; then
        log_error "Missing required argument: directory path"
        echo ""
        usage
        exit 1
    fi

    # Resolve to absolute path
    if [ -d "$TARGET_DIR" ]; then
        TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
    else
        log_error "Directory does not exist: $TARGET_DIR"
        exit 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

main() {
    parse_args "$@"
    check_dependencies

    # Initialize warning log
    WARN_LOG="$(mktemp)"

    echo ""
    echo "════════════════════════════════════════════════════════"
    if [ "$DRY_RUN" -eq 1 ]; then
        printf "${BOLD}${BLUE}  sanitize-knowledge (DRY-RUN)${NC}\n"
    else
        printf "${BOLD}${GREEN}  sanitize-knowledge${NC}\n"
    fi
    echo "════════════════════════════════════════════════════════"
    printf "  ${BOLD}Target:${NC} %s\n" "$TARGET_DIR"
    printf "  ${BOLD}Mode:${NC}   %s\n" "$(if [ "$DRY_RUN" -eq 1 ]; then echo "Check (dry-run)"; else echo "Sanitize"; fi)"
    echo "════════════════════════════════════════════════════════"
    echo ""

    process_directory "$TARGET_DIR"
    print_summary

    if [ "$DRY_RUN" -eq 1 ]; then
        log_info "Dry-run complete. No files were modified."
    else
        log_ok "Sanitization complete."
    fi
}

main "$@"

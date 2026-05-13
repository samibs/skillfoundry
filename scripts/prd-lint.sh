#!/usr/bin/env bash
# scripts/prd-lint.sh
#
# PRD Linter — validates a PRD file against the SkillFoundry TEMPLATE.md structure.
# Catches missing sections, TBD markers, empty required fields, and common mistakes
# BEFORE /go or /forge runs on the PRD.
#
# USAGE:
#   ./scripts/prd-lint.sh <prd-file>          Lint a single PRD
#   ./scripts/prd-lint.sh genesis/            Lint all PRDs in a directory
#   ./scripts/prd-lint.sh --strict <prd-file> Fail on warnings too
#
# EXIT CODES:
#   0  Clean (no errors, no warnings)
#   1  Warnings only (proceed with caution)
#   2  Errors present (block /go execution)

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
PASSED=0
STRICT=0

_err()  { echo -e "  ${RED}[ERROR]${NC} $1"; ERRORS=$((ERRORS+1)); }
_warn() { echo -e "  ${YELLOW}[WARN] ${NC} $1"; WARNINGS=$((WARNINGS+1)); }
_ok()   { PASSED=$((PASSED+1)); }

# ─── Check a single PRD file ──────────────────────────────────────────────

lint_prd() {
    local file="$1"
    echo ""
    echo -e "${CYAN}PRD Linter: ${BOLD}$(basename "$file")${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -f "$file" ]; then
        _err "File not found: $file"
        return
    fi

    local content
    content=$(cat "$file")

    # ── 1. Front matter opens on line 1 ───────────────────────────────────
    local firstline
    firstline=$(head -1 "$file")
    if [ "$firstline" != "---" ]; then
        _err "File must start with '---' (YAML front matter). Found: '$firstline'"
    else
        _ok
    fi

    # ── 2. Required front matter fields ───────────────────────────────────
    for field in prd_id title status created author; do
        if ! grep -qE "^${field}:" "$file"; then
            _err "Missing required front matter field: ${field}:"
        else
            _ok
        fi
    done

    # ── 3. status should not be DRAFT if passed with --ready flag ─────────
    local status_val
    status_val=$(grep -m1 "^status:" "$file" | sed 's/status:[[:space:]]*//' | tr -d '"' | tr -d "'" | xargs)
    if [ "$status_val" = "DRAFT" ]; then
        _warn "PRD status is DRAFT — confirm it is ready before running /go"
    else
        _ok
    fi

    # ── 4. layers: [] must not be empty ───────────────────────────────────
    if grep -qE "^layers:\s*\[\s*\]" "$file"; then
        _err "layers: is empty. Must declare affected layers: [database, backend, frontend]"
    else
        _ok
    fi

    # ── 5. Required section headings ──────────────────────────────────────
    local required_sections=(
        "## 1. Overview"
        "## 2. User Stories"
        "## 3. Functional Requirements"
        "## 4. Non-Functional Requirements"
        "## 5. Technical Specifications"
        "## 7. Constraints"
        "## 8. Regression Surface"
        "## 9. Risks"
        "## 10. Implementation Plan"
        "## 11. Acceptance Criteria"
    )
    for section in "${required_sections[@]}"; do
        if ! grep -qF "$section" "$file"; then
            _err "Missing required section: $section"
        else
            _ok
        fi
    done

    # ── 6. No TBD/TODO markers outside comment blocks ─────────────────────
    local tbd_count
    tbd_count=$(grep -c -iE '\bTBD\b|\bTODO\b' "$file" 2>/dev/null || true)
    # Subtract those inside <!-- --> comment blocks
    local comment_tbd
    comment_tbd=$(grep -c -iE '<!--.*\b(TBD|TODO)\b' "$file" 2>/dev/null || true)
    local real_tbd=$(( tbd_count - comment_tbd ))
    if [ "$real_tbd" -gt 0 ]; then
        _err "$real_tbd TBD/TODO marker(s) found outside comment blocks. Remove before running /go"
    else
        _ok
    fi

    # ── 7. No vague language ──────────────────────────────────────────────
    local vague_count
    vague_count=$(grep -cE '\bmight\b|\bmaybe\b|\bpossibly\b|\bsomehow\b|\bsomewhere\b' "$file" 2>/dev/null || true)
    if [ "$vague_count" -gt 0 ]; then
        _warn "$vague_count instance(s) of vague language (might/maybe/possibly). Be specific."
    else
        _ok
    fi

    # ── 8. Dependency versions should be verified ─────────────────────────
    local unverified
    unverified=$(grep -c "\[ \]" "$file" 2>/dev/null | head -1 || echo "0")
    if [ "$unverified" -gt 0 ]; then
        _warn "$unverified unchecked checkbox(es) [ ] found. Verify all dependencies before implementation."
    else
        _ok
    fi

    # ── 9. §6 Contract section: if present, must not be empty ─────────────
    if grep -qF "## 6. Contract Specification" "$file"; then
        local contract_body
        contract_body=$(sed -n '/## 6\. Contract Specification/,/## 7\./p' "$file" | grep -v "^## " | grep -v "^$" | grep -v "^>" | wc -l)
        if [ "$contract_body" -lt 3 ]; then
            _warn "§6 Contract Specification is present but appears empty. Fill it or add a Skip reason."
        else
            _ok
        fi
    fi

    # ── 10. Regression Surface must have at least one real row ────────────
    if grep -qF "## 8. Regression Surface" "$file"; then
        local reg_rows
        reg_rows=$(sed -n '/## 8\. Regression Surface/,/## 9\./p' "$file" | grep -E "^\|[^-]" | grep -v "Feature at Risk" | wc -l)
        if [ "$reg_rows" -lt 1 ]; then
            _warn "§8 Regression Surface table has no rows. List existing features at risk."
        else
            _ok
        fi
    fi

    # ── 11. Definition of Done must have GuardLoop item ───────────────────
    if grep -qF "### 11.1 Definition of Done" "$file"; then
        if ! grep -qiE "guardloop|\/guardloop" "$file"; then
            _warn "§11.1 Definition of Done: missing GuardLoop scan item. Add: '- [ ] No new CRITICAL GuardLoop patterns'"
        else
            _ok
        fi
    fi

    # ── 12. User story FR-IDs column ──────────────────────────────────────
    if grep -qF "| US-001 |" "$file"; then
        if ! grep -qF "FR-IDs" "$file"; then
            _warn "§2 User story table is missing FR-IDs column for traceability."
        else
            _ok
        fi
    fi

    # ── Summary ───────────────────────────────────────────────────────────
    echo ""
    if [ "$ERRORS" -gt 0 ]; then
        echo -e "${RED}${BOLD}VERDICT: FAIL${NC} — $ERRORS error(s), $WARNINGS warning(s), $PASSED passed"
        echo -e "  Action: ${RED}BLOCK${NC} — fix errors before /go"
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}${BOLD}VERDICT: WARN${NC} — 0 errors, $WARNINGS warning(s), $PASSED passed"
        echo -e "  Action: ${YELLOW}REVIEW${NC} — warnings logged, proceed with caution"
    else
        echo -e "${GREEN}${BOLD}VERDICT: PASS${NC} — 0 errors, 0 warnings, $PASSED passed"
        echo -e "  Action: ${GREEN}PROCEED${NC} — PRD is ready for /go"
    fi
    echo ""
}

# ─── Lint all PRDs in a directory ─────────────────────────────────────────

lint_dir() {
    local dir="$1"
    local file_count=0
    local fail_count=0

    while IFS= read -r -d '' prd_file; do
        local basename
        basename=$(basename "$prd_file")
        # Skip template and schema files
        [ "$basename" = "TEMPLATE.md" ] && continue
        [ "$basename" = "README.md" ] && continue

        file_count=$((file_count + 1))
        local pre_errors=$ERRORS
        lint_prd "$prd_file"
        [ "$ERRORS" -gt "$pre_errors" ] && fail_count=$((fail_count + 1))
    done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "  PRDs linted: $file_count   Failed: ${RED}$fail_count${NC}   Passed: ${GREEN}$((file_count - fail_count))${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

# ─── Main ─────────────────────────────────────────────────────────────────

main() {
    local target=""

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --strict) STRICT=1; shift ;;
            --help|-h)
                echo "Usage: $0 [--strict] <prd-file|genesis-dir>"
                echo ""
                echo "  --strict    Treat warnings as errors (block on any finding)"
                echo ""
                echo "Exit codes: 0=clean  1=warnings  2=errors"
                exit 0
                ;;
            -*) echo "Unknown flag: $1"; exit 1 ;;
            *)  target="$1"; shift ;;
        esac
    done

    if [ -z "$target" ]; then
        echo "Usage: $0 [--strict] <prd-file|genesis-dir>"
        exit 1
    fi

    if [ -d "$target" ]; then
        lint_dir "$target"
    else
        lint_prd "$target"
    fi

    if [ "$STRICT" -eq 1 ] && [ "$WARNINGS" -gt 0 ]; then
        exit 2
    fi
    [ "$ERRORS" -gt 0 ] && exit 2
    [ "$WARNINGS" -gt 0 ] && exit 1
    exit 0
}

main "$@"

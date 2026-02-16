#!/bin/bash

# Compliance Evidence Collection & Packaging
# Automates collection, hashing, and packaging of compliance evidence artifacts.
# Evidence is stored in tamper-evident format with SHA-256 integrity verification.
#
# USAGE:
#   ./scripts/compliance-evidence.sh collect <profile> [--project=DIR]
#   ./scripts/compliance-evidence.sh package <profile> [--output=FILE]
#   ./scripts/compliance-evidence.sh verify <evidence-dir>
#   ./scripts/compliance-evidence.sh report <profile>
#   ./scripts/compliance-evidence.sh --help

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
FRAMEWORK_DIR="$(dirname "$SCRIPT_DIR")"
COMPLIANCE_DIR="$FRAMEWORK_DIR/compliance"
EVIDENCE_DIR="$COMPLIANCE_DIR/evidence"
VERSION_FILE="$FRAMEWORK_DIR/.version"

# Options
PROJECT_DIR="."
OUTPUT_FILE=""

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo "Compliance Evidence Collection & Packaging — Claude AS Framework"
    echo ""
    echo "Automates collection, hashing, and packaging of compliance evidence."
    echo "Evidence is stored in tamper-evident format with SHA-256 verification."
    echo ""
    echo "USAGE:"
    echo "  ./scripts/compliance-evidence.sh <command> [args]"
    echo ""
    echo "COMMANDS:"
    echo "  collect <profile>     Run compliance checks and collect evidence artifacts"
    echo "  package <profile>     Package evidence into tar.gz archive"
    echo "  verify <dir>          Verify evidence integrity (manifest + artifact hashes)"
    echo "  report <profile>      Generate human-readable evidence report"
    echo ""
    echo "OPTIONS:"
    echo "  --project=DIR         Project directory to scan (default: .)"
    echo "  --output=FILE         Output file for package command"
    echo "  --help                Show this help message"
    echo ""
    echo "PROFILES:"
    echo "  hipaa                 HIPAA compliance (15 checks)"
    echo "  soc2                  SOC 2 Type II (12 checks)"
    echo "  gdpr                  GDPR compliance (10 checks)"
    echo ""
    echo "EXAMPLES:"
    echo "  compliance-evidence.sh collect hipaa --project=./myapp"
    echo "  compliance-evidence.sh verify compliance/evidence/hipaa/2026-02-15/"
    echo "  compliance-evidence.sh package hipaa --output=hipaa-evidence.tar.gz"
    echo "  compliance-evidence.sh report hipaa"
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════

parse_options() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --project=*)  PROJECT_DIR="${1#*=}"; shift ;;
            --output=*)   OUTPUT_FILE="${1#*=}"; shift ;;
            --help)       show_help; exit 0 ;;
            *)            shift ;;
        esac
    done
}

# ═══════════════════════════════════════════════════════════════
# COLLECT - Run checks and collect evidence
# ═══════════════════════════════════════════════════════════════

cmd_collect() {
    local profile="${1:-}"
    if [ -z "$profile" ]; then
        echo -e "${RED}Error: profile name required${NC}"
        echo "Usage: compliance-evidence.sh collect <profile>"
        exit 1
    fi

    local checks_script="$COMPLIANCE_DIR/$profile/checks.sh"
    if [ ! -f "$checks_script" ]; then
        echo -e "${RED}Error: compliance profile not found: $profile${NC}"
        echo "Available profiles: $(ls -d "$COMPLIANCE_DIR"/*/ 2>/dev/null | xargs -I{} basename {} | grep -v evidence | tr '\n' ' ')"
        exit 1
    fi

    local today
    today=$(date +%Y-%m-%d)
    local evidence_path="$EVIDENCE_DIR/$profile/$today"
    mkdir -p "$evidence_path"
    chmod 700 "$evidence_path"

    echo -e "${CYAN}${BOLD}COLLECTING EVIDENCE: ${profile^^}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Profile:   $profile"
    echo "Project:   $PROJECT_DIR"
    echo "Output:    $evidence_path/"
    echo ""

    # Run compliance checks
    local results
    results=$(bash "$checks_script" "$PROJECT_DIR" 2>/dev/null)

    if [ -z "$results" ]; then
        echo -e "${RED}[FAIL]${NC} No results from compliance checks"
        exit 1
    fi

    # Process each check result and collect evidence
    local total=0
    local passed=0
    local failed=0
    local evidence_entries=""

    while IFS= read -r check; do
        [ -z "$check" ] && continue
        local check_id check_name status evidence_text
        check_id=$(echo "$check" | jq -r '.id')
        check_name=$(echo "$check" | jq -r '.name')
        status=$(echo "$check" | jq -r '.status')
        evidence_text=$(echo "$check" | jq -r '.evidence')
        local remediation
        remediation=$(echo "$check" | jq -r '.remediation // empty')

        total=$((total + 1))

        # Create evidence artifact
        local artifact_name="${check_id}-$(echo "$check_name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]').txt"
        local artifact_path="$evidence_path/$artifact_name"

        {
            echo "Check ID:    $check_id"
            echo "Check Name:  $check_name"
            echo "Status:      $status"
            echo "Collected:   $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
            echo "Project:     $PROJECT_DIR"
            echo ""
            echo "Evidence:"
            echo "  $evidence_text"
            if [ -n "$remediation" ] && [ "$status" != "pass" ]; then
                echo ""
                echo "Remediation:"
                echo "  $remediation"
            fi
        } > "$artifact_path"
        chmod 600 "$artifact_path"

        # Hash the artifact
        local artifact_hash
        artifact_hash=$(sha256sum "$artifact_path" | cut -d' ' -f1)

        # Build evidence entry
        local entry
        entry=$(jq -nc \
            --arg id "$check_id" \
            --arg name "$check_name" \
            --arg status "$status" \
            --arg artifact "$artifact_name" \
            --arg hash "$artifact_hash" \
            --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '{check_id:$id,check_name:$name,status:$status,artifact:$artifact,sha256:$hash,collected_at:$ts}')
        evidence_entries="${evidence_entries}${entry}\n"

        # Display result
        case "$status" in
            pass) echo -e "  ${GREEN}[PASS]${NC} $check_id: $check_name"; passed=$((passed + 1)) ;;
            fail) echo -e "  ${RED}[FAIL]${NC} $check_id: $check_name"; failed=$((failed + 1)) ;;
            warn) echo -e "  ${YELLOW}[WARN]${NC} $check_id: $check_name"; passed=$((passed + 1)) ;;
        esac
    done < <(echo "$results" | jq -c '.[]')

    # Build manifest
    local version
    version=$(cat "$VERSION_FILE" 2>/dev/null || echo "unknown")

    local evidence_array
    evidence_array=$(printf '%b' "$evidence_entries" | grep -v '^$' | jq -s '.')

    # Create manifest without manifest_hash first
    local manifest_content
    manifest_content=$(jq -nc \
        --arg profile "$profile" \
        --arg date "$today" \
        --arg version "$version" \
        --argjson total "$total" \
        --argjson passed "$passed" \
        --argjson failed "$failed" \
        --argjson evidence "$evidence_array" \
        '{profile:$profile,date:$date,framework_version:$version,checks_total:$total,checks_passed:$passed,checks_failed:$failed,evidence:$evidence,manifest_hash:""}')

    # Calculate manifest hash (excluding the manifest_hash field value)
    local manifest_hash
    manifest_hash=$(echo "$manifest_content" | jq 'del(.manifest_hash)' | sha256sum | cut -d' ' -f1)

    # Write final manifest with hash
    echo "$manifest_content" | jq --arg h "$manifest_hash" '.manifest_hash = $h' > "$evidence_path/manifest.json"
    chmod 600 "$evidence_path/manifest.json"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "Total:   $total checks"
    echo -e "Passed:  ${GREEN}$passed${NC}"
    echo -e "Failed:  ${RED}$failed${NC}"
    echo -e "Output:  $evidence_path/"
    echo -e "Manifest hash: ${CYAN}${manifest_hash:0:16}...${NC}"
}

# ═══════════════════════════════════════════════════════════════
# VERIFY - Verify evidence integrity
# ═══════════════════════════════════════════════════════════════

cmd_verify() {
    local evidence_path="${1:-}"
    if [ -z "$evidence_path" ]; then
        echo -e "${RED}Error: evidence directory required${NC}"
        echo "Usage: compliance-evidence.sh verify <evidence-dir>"
        exit 1
    fi

    local manifest="$evidence_path/manifest.json"
    if [ ! -f "$manifest" ]; then
        echo -e "${RED}[FAIL]${NC} Manifest not found: $manifest"
        exit 1
    fi

    echo -e "${CYAN}${BOLD}VERIFYING EVIDENCE INTEGRITY${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Path: $evidence_path"
    echo ""

    local all_valid=true
    local errors=0

    # Verify manifest hash
    local stored_hash
    stored_hash=$(jq -r '.manifest_hash' "$manifest")
    local computed_hash
    computed_hash=$(jq 'del(.manifest_hash)' "$manifest" | sha256sum | cut -d' ' -f1)

    if [ "$stored_hash" != "$computed_hash" ]; then
        echo -e "${RED}[FAIL]${NC} Manifest has been tampered with"
        echo "  Stored:   $stored_hash"
        echo "  Computed: $computed_hash"
        all_valid=false
        errors=$((errors + 1))
    else
        echo -e "${GREEN}[PASS]${NC} Manifest integrity verified"
    fi

    # Verify each evidence artifact hash
    while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        local artifact expected_hash check_id
        artifact=$(echo "$entry" | jq -r '.artifact')
        expected_hash=$(echo "$entry" | jq -r '.sha256')
        check_id=$(echo "$entry" | jq -r '.check_id')

        local artifact_path="$evidence_path/$artifact"
        if [ ! -f "$artifact_path" ]; then
            echo -e "${RED}[FAIL]${NC} Missing artifact: $artifact ($check_id)"
            all_valid=false
            errors=$((errors + 1))
            continue
        fi

        local actual_hash
        actual_hash=$(sha256sum "$artifact_path" | cut -d' ' -f1)

        if [ "$expected_hash" != "$actual_hash" ]; then
            echo -e "${RED}[FAIL]${NC} Tampered: $artifact ($check_id)"
            echo "  Expected: $expected_hash"
            echo "  Actual:   $actual_hash"
            all_valid=false
            errors=$((errors + 1))
        else
            echo -e "${GREEN}[PASS]${NC} Verified: $artifact"
        fi
    done < <(jq -c '.evidence[]' "$manifest")

    echo ""
    if [ "$all_valid" = true ]; then
        echo -e "${GREEN}${BOLD}All evidence verified — integrity intact${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}Verification failed — $errors error(s) found${NC}"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════════
# PACKAGE - Package evidence into archive
# ═══════════════════════════════════════════════════════════════

cmd_package() {
    local profile="${1:-}"
    if [ -z "$profile" ]; then
        echo -e "${RED}Error: profile name required${NC}"
        echo "Usage: compliance-evidence.sh package <profile>"
        exit 1
    fi

    local profile_evidence="$EVIDENCE_DIR/$profile"
    if [ ! -d "$profile_evidence" ]; then
        echo -e "${RED}Error: no evidence found for profile: $profile${NC}"
        echo "Run 'compliance-evidence.sh collect $profile' first."
        exit 1
    fi

    local output="${OUTPUT_FILE:-compliance-evidence-${profile}-$(date +%Y%m%d).tar.gz}"

    echo -e "${CYAN}${BOLD}PACKAGING EVIDENCE${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    tar -czf "$output" -C "$COMPLIANCE_DIR" "evidence/$profile/" 2>/dev/null

    local package_hash
    package_hash=$(sha256sum "$output" | cut -d' ' -f1)
    local package_size
    package_size=$(ls -lh "$output" | awk '{print $5}')

    echo -e "${GREEN}[PASS]${NC} Evidence packaged: $output"
    echo "  Size:    $package_size"
    echo "  SHA-256: $package_hash"
    echo ""
    echo "Provide this hash out-of-band for auditor verification."
}

# ═══════════════════════════════════════════════════════════════
# REPORT - Generate evidence report
# ═══════════════════════════════════════════════════════════════

cmd_report() {
    local profile="${1:-}"
    if [ -z "$profile" ]; then
        echo -e "${RED}Error: profile name required${NC}"
        echo "Usage: compliance-evidence.sh report <profile>"
        exit 1
    fi

    local profile_evidence="$EVIDENCE_DIR/$profile"
    if [ ! -d "$profile_evidence" ]; then
        echo -e "${YELLOW}No evidence collected for profile: $profile${NC}"
        exit 0
    fi

    echo -e "${CYAN}${BOLD}COMPLIANCE EVIDENCE REPORT: ${profile^^}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # List all evidence collection runs
    for run_dir in "$profile_evidence"/*/; do
        [ -d "$run_dir" ] || continue
        local manifest="$run_dir/manifest.json"
        [ -f "$manifest" ] || continue

        local date total passed failed version
        date=$(jq -r '.date' "$manifest")
        total=$(jq -r '.checks_total' "$manifest")
        passed=$(jq -r '.checks_passed' "$manifest")
        failed=$(jq -r '.checks_failed' "$manifest")
        version=$(jq -r '.framework_version' "$manifest")

        echo -e "${BOLD}Run: $date${NC} (v$version)"
        echo "  Checks: $total total, $passed passed, $failed failed"

        # Show failed checks
        local failures
        failures=$(jq -r '.evidence[] | select(.status == "fail") | "    [FAIL] \(.check_id): \(.check_name)"' "$manifest" 2>/dev/null || true)
        if [ -n "$failures" ]; then
            echo -e "${RED}$failures${NC}"
        fi

        # Verify integrity
        local stored_hash computed_hash
        stored_hash=$(jq -r '.manifest_hash' "$manifest")
        computed_hash=$(jq 'del(.manifest_hash)' "$manifest" | sha256sum | cut -d' ' -f1)
        if [ "$stored_hash" = "$computed_hash" ]; then
            echo -e "  Integrity: ${GREEN}VERIFIED${NC}"
        else
            echo -e "  Integrity: ${RED}TAMPERED${NC}"
        fi
        echo ""
    done
}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

COMMAND="${1:-}"
shift 2>/dev/null || true

# Extract first positional arg (profile or dir)
POSITIONAL="${1:-}"
shift 2>/dev/null || true

parse_options "$@"

case "$COMMAND" in
    collect)
        cmd_collect "$POSITIONAL"
        ;;
    package)
        cmd_package "$POSITIONAL"
        ;;
    verify)
        cmd_verify "$POSITIONAL"
        ;;
    report)
        cmd_report "$POSITIONAL"
        ;;
    --help|help)
        show_help
        ;;
    *)
        echo "Usage: $0 {collect|package|verify|report} [args]"
        echo "Run '$0 --help' for full usage."
        exit 1
        ;;
esac

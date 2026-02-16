#!/bin/bash

# GDPR Compliance Checks
# Scans project for General Data Protection Regulation compliance.
# Returns JSON array of check results.
#
# USAGE: bash compliance/gdpr/checks.sh [project-dir]

set -e
set -o pipefail

PROJECT_DIR="${1:-.}"

# ═══════════════════════════════════════════════════════════════
# CHECK FUNCTIONS
# ═══════════════════════════════════════════════════════════════

check_lawful_basis() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" 2>/dev/null \
        | xargs grep -liE "(lawful.*basis|legal.*basis|consent|legitimate.*interest)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Lawful basis documentation found"
    else
        status="fail"; evidence="No lawful basis documentation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-001","name":"Lawful Basis for Processing","category":"data_processing","status":$s,"evidence":$e,"remediation":"Document lawful basis for each data processing activity"}'
}

check_consent_mechanism() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.html" 2>/dev/null \
        | xargs grep -liE "(consent|opt.in|cookie.*consent|gdpr.*accept)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Consent mechanism found"
    else
        status="fail"; evidence="No consent mechanism detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-002","name":"Consent Mechanism","category":"consent","status":$s,"evidence":$e,"remediation":"Implement explicit consent collection with withdrawal option"}'
}

check_data_minimization() {
    local status="pass" evidence=""
    # Check for overly broad data collection
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(select \*|SELECT \*)" 2>/dev/null | head -1 | grep -q .; then
        status="warn"; evidence="SELECT * queries found — potential data over-collection"
    else
        evidence="No obvious data over-collection patterns detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-003","name":"Data Minimization","category":"data_protection","status":$s,"evidence":$e,"remediation":"Collect only necessary data, use specific column selects"}'
}

check_right_to_access() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(export.*data|data.*export|download.*data|subject.*access)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Data export/access capability found"
    else
        status="fail"; evidence="No data subject access request capability detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-004","name":"Right to Access","category":"data_subject_rights","status":$s,"evidence":$e,"remediation":"Implement data export endpoint for subject access requests"}'
}

check_right_to_erasure() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(delete.*account|purge|right.*forget|erasure|anonymiz)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Data erasure capability found"
    else
        status="fail"; evidence="No right to erasure implementation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-005","name":"Right to Erasure","category":"data_subject_rights","status":$s,"evidence":$e,"remediation":"Implement account deletion and data erasure"}'
}

check_data_portability() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(export.*json|export.*csv|data.*portab|download.*format)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Data portability support found"
    else
        status="fail"; evidence="No data portability support detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-006","name":"Data Portability","category":"data_subject_rights","status":$s,"evidence":$e,"remediation":"Implement data export in machine-readable format (JSON/CSV)"}'
}

check_privacy_by_design() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(encrypt|hash|anonymiz|pseudonymiz|mask)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Privacy-by-design patterns found"
    else
        status="fail"; evidence="No privacy-by-design patterns detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-007","name":"Privacy by Design","category":"data_protection","status":$s,"evidence":$e,"remediation":"Implement encryption, anonymization, and data minimization"}'
}

check_breach_notification() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" 2>/dev/null \
        | xargs grep -liE "(breach.*notif|incident.*response|72.*hour|data.*breach)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Breach notification procedure found"
    else
        status="fail"; evidence="No breach notification procedure detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-008","name":"Breach Notification","category":"breach_notification","status":$s,"evidence":$e,"remediation":"Document 72-hour breach notification procedure"}'
}

check_dpo_contact() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" -o -name "*.html" 2>/dev/null \
        | xargs grep -liE "(data.*protection.*officer|DPO|dpo@|privacy@)" 2>/dev/null | head -1 | grep -q .; then
        evidence="DPO contact information found"
    else
        status="warn"; evidence="No DPO contact information detected (may not be required)"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-009","name":"DPO Contact","category":"data_processing","status":$s,"evidence":$e,"remediation":"Document DPO contact information if required"}'
}

check_cross_border_transfers() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.yml" -o -name "*.yaml" 2>/dev/null \
        | xargs grep -liE "(data.*transfer|cross.border|standard.*contractual|adequacy)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Cross-border data transfer documentation found"
    else
        status="warn"; evidence="No cross-border transfer documentation (may not be required)"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"GDPR-010","name":"Cross-Border Transfers","category":"data_processing","status":$s,"evidence":$e,"remediation":"Document legal basis for cross-border data transfers"}'
}

# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

run_all_checks() {
    local results=()
    results+=("$(check_lawful_basis)")
    results+=("$(check_consent_mechanism)")
    results+=("$(check_data_minimization)")
    results+=("$(check_right_to_access)")
    results+=("$(check_right_to_erasure)")
    results+=("$(check_data_portability)")
    results+=("$(check_privacy_by_design)")
    results+=("$(check_breach_notification)")
    results+=("$(check_dpo_contact)")
    results+=("$(check_cross_border_transfers)")

    printf '%s\n' "${results[@]}" | jq -s '.'
}

run_all_checks

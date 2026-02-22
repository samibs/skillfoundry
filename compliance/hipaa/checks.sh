#!/bin/bash

# HIPAA Compliance Checks
# Scans project code for HIPAA compliance requirements.
# Returns JSON array of check results.
#
# USAGE: bash compliance/hipaa/checks.sh [project-dir]

set -e
set -o pipefail

PROJECT_DIR="${1:-.}"

# ═══════════════════════════════════════════════════════════════
# CHECK FUNCTIONS
# ═══════════════════════════════════════════════════════════════

# Each check outputs a single JSON object and sets check_status

check_encryption_at_rest() {
    local status="pass"
    local evidence=""

    # Look for encryption configuration in common locations
    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.toml" 2>/dev/null \
        | xargs grep -liE "(encrypt|cipher|aes|kms)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Encryption configuration found"
    elif find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" 2>/dev/null \
        | xargs grep -liE "(encrypt|cipher|aes|fernet|cryptography)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Encryption library usage found"
    else
        status="fail"
        evidence="No encryption-at-rest configuration detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-001","name":"Encryption at Rest","category":"encryption","status":$s,"evidence":$e,"remediation":"Configure database encryption and encrypted file storage"}'
}

check_encryption_in_transit() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.env*" 2>/dev/null \
        | xargs grep -liE "(https|tls|ssl|cert)" 2>/dev/null | head -1 | grep -q .; then
        evidence="TLS/HTTPS configuration found"
    elif find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(https|ssl_context|tls)" 2>/dev/null | head -1 | grep -q .; then
        evidence="HTTPS usage found in code"
    else
        status="fail"
        evidence="No HTTPS/TLS configuration detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-002","name":"Encryption in Transit","category":"encryption","status":$s,"evidence":$e,"remediation":"Configure HTTPS/TLS for all network communication"}'
}

check_phi_access_logging() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" 2>/dev/null \
        | xargs grep -liE "(audit.log|access.log|log.*(access|patient|phi))" 2>/dev/null | head -1 | grep -q .; then
        evidence="PHI access logging found"
    elif find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" 2>/dev/null \
        | xargs grep -liE "(audit|access.log)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Audit log configuration found"
    else
        status="fail"
        evidence="No PHI access logging detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-003","name":"PHI Access Logging","category":"audit_logging","status":$s,"evidence":$e,"remediation":"Implement audit logging for all PHI access"}'
}

check_authentication_required() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" 2>/dev/null \
        | xargs grep -liE "(auth|jwt|token|session|login|passport)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Authentication implementation found"
    else
        status="fail"
        evidence="No authentication implementation detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-004","name":"Authentication Required","category":"access_control","status":$s,"evidence":$e,"remediation":"Implement authentication on all non-public endpoints"}'
}

check_rbac() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" 2>/dev/null \
        | xargs grep -liE "(role|permission|rbac|authorize|can_access|has_role)" 2>/dev/null | head -1 | grep -q .; then
        evidence="RBAC implementation found"
    else
        status="fail"
        evidence="No role-based access control detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-005","name":"Role-Based Access Control","category":"access_control","status":$s,"evidence":$e,"remediation":"Implement RBAC for all data access"}'
}

check_session_timeout() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.yml" 2>/dev/null \
        | xargs grep -liE "(session.*timeout|expire|maxAge|max_age|SESSION_LIFETIME)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Session timeout configuration found"
    else
        status="fail"
        evidence="No session timeout configuration detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-006","name":"Session Timeout","category":"access_control","status":$s,"evidence":$e,"remediation":"Configure session timeout (max 15 minutes for PHI access)"}'
}

check_password_complexity() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(password.*valid|min.*length|complexity|bcrypt|argon2|scrypt)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Password complexity/hashing found"
    else
        status="fail"
        evidence="No password complexity requirements detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-007","name":"Password Complexity","category":"access_control","status":$s,"evidence":$e,"remediation":"Enforce password complexity and use bcrypt/argon2 for hashing"}'
}

check_no_phi_in_logs() {
    local status="pass"
    local evidence=""

    # Check for PHI-like patterns in log statements
    local phi_in_logs
    phi_in_logs=$(find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -lE "(log|print|console).*(ssn|social.*security|patient.*name|dob|birth)" 2>/dev/null | head -3 || true)

    if [ -n "$phi_in_logs" ]; then
        status="fail"
        evidence="Potential PHI in log statements: $(echo "$phi_in_logs" | tr '\n' ', ')"
    else
        evidence="No PHI detected in log statements"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-008","name":"No PHI in Logs","category":"data_handling","status":$s,"evidence":$e,"remediation":"Sanitize all PHI before logging"}'
}

check_data_backup() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.sh" -o -name "Dockerfile" 2>/dev/null \
        | xargs grep -liE "(backup|restore|snapshot|replicate)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Backup configuration found"
    else
        status="fail"
        evidence="No backup configuration detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-009","name":"Data Backup","category":"data_handling","status":$s,"evidence":$e,"remediation":"Configure automated data backups with restore testing"}'
}

check_secure_deletion() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(delete.*account|purge|data.*retention|gdpr.*delete|right.*forget)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Secure data deletion capability found"
    else
        status="fail"
        evidence="No secure deletion capability detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-010","name":"Secure Data Deletion","category":"data_handling","status":$s,"evidence":$e,"remediation":"Implement secure data deletion and retention policies"}'
}

check_no_hardcoded_credentials() {
    local status="pass"
    local evidence=""

    local cred_files
    cred_files=$(find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.go" -o -name "*.sh" 2>/dev/null \
        | xargs grep -lE "(password|secret|api.key)\s*=\s*['\"][^'\"]{8,}" 2>/dev/null | head -3 || true)

    if [ -n "$cred_files" ]; then
        status="fail"
        evidence="Potential hardcoded credentials in: $(echo "$cred_files" | tr '\n' ', ')"
    else
        evidence="No hardcoded credentials detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-011","name":"No Hardcoded Credentials","category":"encryption","status":$s,"evidence":$e,"remediation":"Move all credentials to environment variables or secrets manager"}'
}

check_input_validation() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(validat|sanitiz|escape|pydantic|zod|joi|class-validator)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Input validation found"
    else
        status="fail"
        evidence="No input validation detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-012","name":"Input Validation","category":"data_handling","status":$s,"evidence":$e,"remediation":"Validate and sanitize all user input"}'
}

check_error_messages_safe() {
    local status="pass"
    local evidence=""

    local unsafe_errors
    unsafe_errors=$(find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -lE "(stack.*trace|traceback|\.stack|Internal Server Error.*detail)" 2>/dev/null | head -3 || true)

    if [ -n "$unsafe_errors" ]; then
        status="warn"
        evidence="Potential stack trace exposure in: $(echo "$unsafe_errors" | tr '\n' ', ')"
    else
        evidence="No unsafe error message patterns detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-013","name":"Safe Error Messages","category":"data_handling","status":$s,"evidence":$e,"remediation":"Ensure error messages do not expose PHI or system internals"}'
}

check_incident_response() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" 2>/dev/null \
        | xargs grep -liE "(incident.*response|breach.*notification|security.*policy)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Incident response documentation found"
    else
        status="fail"
        evidence="No incident response documentation detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-014","name":"Incident Response","category":"incident_response","status":$s,"evidence":$e,"remediation":"Document incident response and breach notification procedures"}'
}

check_baa_template() {
    local status="pass"
    local evidence=""

    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" -o -name "*.pdf" 2>/dev/null \
        | xargs grep -liE "(business.*associate|BAA|baa.*agreement)" 2>/dev/null | head -1 | grep -q .; then
        evidence="BAA template found"
    elif [ -f "$PROJECT_DIR/docs/BAA.md" ] || [ -f "$PROJECT_DIR/compliance/BAA.md" ]; then
        evidence="BAA document found"
    else
        status="fail"
        evidence="No Business Associate Agreement template detected"
    fi

    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"HIPAA-015","name":"Business Associate Agreement","category":"data_handling","status":$s,"evidence":$e,"remediation":"Create BAA template for third-party data processors"}'
}

# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

run_all_checks() {
    local results=()
    results+=("$(check_encryption_at_rest)")
    results+=("$(check_encryption_in_transit)")
    results+=("$(check_phi_access_logging)")
    results+=("$(check_authentication_required)")
    results+=("$(check_rbac)")
    results+=("$(check_session_timeout)")
    results+=("$(check_password_complexity)")
    results+=("$(check_no_phi_in_logs)")
    results+=("$(check_data_backup)")
    results+=("$(check_secure_deletion)")
    results+=("$(check_no_hardcoded_credentials)")
    results+=("$(check_input_validation)")
    results+=("$(check_error_messages_safe)")
    results+=("$(check_incident_response)")
    results+=("$(check_baa_template)")

    printf '%s\n' "${results[@]}" | jq -s '.'
}

run_all_checks

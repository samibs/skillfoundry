#!/bin/bash

# SOC 2 Type II Compliance Checks
# Scans project for SOC 2 Trust Services Criteria compliance.
# Returns JSON array of check results.
#
# USAGE: bash compliance/soc2/checks.sh [project-dir]

set -e
set -o pipefail

PROJECT_DIR="${1:-.}"

# ═══════════════════════════════════════════════════════════════
# CHECK FUNCTIONS
# ═══════════════════════════════════════════════════════════════

check_access_controls() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(auth|login|session|jwt|rbac|permission)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Access control implementation found"
    else
        status="fail"; evidence="No access control implementation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-001","name":"Logical Access Controls","category":"security","status":$s,"evidence":$e,"remediation":"Implement authentication and authorization controls"}'
}

check_encryption() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.py" -o -name "*.ts" 2>/dev/null \
        | xargs grep -liE "(encrypt|tls|https|ssl|cipher)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Encryption configuration found"
    else
        status="fail"; evidence="No encryption configuration detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-002","name":"Data Encryption","category":"security","status":$s,"evidence":$e,"remediation":"Configure encryption for data at rest and in transit"}'
}

check_change_management() {
    local status="pass" evidence=""
    if [ -d "$PROJECT_DIR/.github/workflows" ] || [ -f "$PROJECT_DIR/.gitlab-ci.yml" ] || [ -f "$PROJECT_DIR/Jenkinsfile" ]; then
        evidence="CI/CD pipeline found"
    elif [ -d "$PROJECT_DIR/.git" ]; then
        evidence="Version control (git) in use"
    else
        status="fail"; evidence="No change management process detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-003","name":"Change Management","category":"security","status":$s,"evidence":$e,"remediation":"Implement CI/CD pipeline with code review process"}'
}

check_monitoring() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.py" -o -name "*.ts" 2>/dev/null \
        | xargs grep -liE "(monitor|alert|prometheus|datadog|newrelic|sentry|healthcheck|health_check)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Monitoring/alerting configuration found"
    else
        status="fail"; evidence="No monitoring configuration detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-004","name":"System Monitoring","category":"availability","status":$s,"evidence":$e,"remediation":"Implement system monitoring and alerting"}'
}

check_backup_recovery() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.yml" -o -name "*.yaml" -o -name "*.sh" 2>/dev/null \
        | xargs grep -liE "(backup|restore|disaster.*recovery|snapshot)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Backup/recovery configuration found"
    else
        status="fail"; evidence="No backup/recovery configuration detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-005","name":"Backup and Recovery","category":"availability","status":$s,"evidence":$e,"remediation":"Configure automated backups with documented recovery procedures"}'
}

check_input_validation() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(validat|sanitiz|escape|pydantic|zod|joi)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Input validation found"
    else
        status="fail"; evidence="No input validation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-006","name":"Input Validation","category":"processing_integrity","status":$s,"evidence":$e,"remediation":"Validate all input data at system boundaries"}'
}

check_error_handling() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(try|catch|except|error.*handl|ErrorBoundary)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Error handling implementation found"
    else
        status="fail"; evidence="No error handling detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-007","name":"Error Handling","category":"processing_integrity","status":$s,"evidence":$e,"remediation":"Implement comprehensive error handling"}'
}

check_audit_logging() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.py" -o -name "*.ts" -o -name "*.js" 2>/dev/null \
        | xargs grep -liE "(audit|access.log|logger|winston|bunyan|pino)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Audit logging found"
    else
        status="fail"; evidence="No audit logging detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-008","name":"Audit Logging","category":"security","status":$s,"evidence":$e,"remediation":"Implement comprehensive audit logging"}'
}

check_data_classification() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" 2>/dev/null \
        | xargs grep -liE "(data.*classif|confidential|sensitive|public|internal)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Data classification documentation found"
    else
        status="fail"; evidence="No data classification documentation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-009","name":"Data Classification","category":"confidentiality","status":$s,"evidence":$e,"remediation":"Document data classification policy"}'
}

check_vendor_management() {
    local status="pass" evidence=""
    if [ -f "$PROJECT_DIR/package.json" ] || [ -f "$PROJECT_DIR/requirements.txt" ] || [ -f "$PROJECT_DIR/go.mod" ]; then
        evidence="Dependency management found"
    else
        status="warn"; evidence="No dependency management file detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-010","name":"Vendor Management","category":"security","status":$s,"evidence":$e,"remediation":"Track and audit all third-party dependencies"}'
}

check_privacy_notice() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" -o -name "*.html" 2>/dev/null \
        | xargs grep -liE "(privacy.*policy|privacy.*notice|data.*protection)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Privacy notice/policy found"
    else
        status="fail"; evidence="No privacy notice detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-011","name":"Privacy Notice","category":"privacy","status":$s,"evidence":$e,"remediation":"Create privacy notice/policy document"}'
}

check_incident_response() {
    local status="pass" evidence=""
    if find "$PROJECT_DIR" -name "*.md" -o -name "*.txt" 2>/dev/null \
        | xargs grep -liE "(incident.*response|security.*policy|runbook)" 2>/dev/null | head -1 | grep -q .; then
        evidence="Incident response documentation found"
    else
        status="fail"; evidence="No incident response documentation detected"
    fi
    jq -nc --arg s "$status" --arg e "$evidence" \
        '{"id":"SOC2-012","name":"Incident Response","category":"security","status":$s,"evidence":$e,"remediation":"Document incident response procedures"}'
}

# ═══════════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════════

run_all_checks() {
    local results=()
    results+=("$(check_access_controls)")
    results+=("$(check_encryption)")
    results+=("$(check_change_management)")
    results+=("$(check_monitoring)")
    results+=("$(check_backup_recovery)")
    results+=("$(check_input_validation)")
    results+=("$(check_error_handling)")
    results+=("$(check_audit_logging)")
    results+=("$(check_data_classification)")
    results+=("$(check_vendor_management)")
    results+=("$(check_privacy_notice)")
    results+=("$(check_incident_response)")

    printf '%s\n' "${results[@]}" | jq -s '.'
}

run_all_checks

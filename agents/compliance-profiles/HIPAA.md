# HIPAA Compliance Preset

> Gate-keeper rule set for HIPAA (Health Insurance Portability and Accountability Act) compliance.
> Activated via: `/go --compliance=hipaa`

---

## Scope

Applies to any project handling Protected Health Information (PHI) or Electronic PHI (ePHI). Rules are **additive** - they extend existing gate-keeper rules, never weaken them.

---

## Mandatory Rules

### Data Encryption

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| HIPAA-ENC-001 | All PHI must be encrypted at rest (AES-256 minimum) | CRITICAL | No |
| HIPAA-ENC-002 | All PHI in transit must use TLS 1.2+ | CRITICAL | No |
| HIPAA-ENC-003 | Database columns containing PHI must use column-level encryption | HIGH | No |
| HIPAA-ENC-004 | Encryption keys must be stored in a key management service (not in code) | CRITICAL | No |
| HIPAA-ENC-005 | Backup data must be encrypted with same standards as live data | HIGH | No |

### Audit Logging

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| HIPAA-AUD-001 | All access to PHI must be logged (who, what, when, from where) | CRITICAL | No |
| HIPAA-AUD-002 | Audit logs must be immutable (append-only, no delete/update) | CRITICAL | No |
| HIPAA-AUD-003 | Audit logs must be retained for minimum 6 years | HIGH | No |
| HIPAA-AUD-004 | Failed access attempts must be logged and alerted | HIGH | No |
| HIPAA-AUD-005 | Log exports (PHI data downloads) must be tracked | HIGH | No |

### Access Controls

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| HIPAA-ACC-001 | Role-based access control (RBAC) required for all PHI endpoints | CRITICAL | No |
| HIPAA-ACC-002 | Minimum necessary principle - users see only PHI required for their role | CRITICAL | No |
| HIPAA-ACC-003 | Session timeout after 15 minutes of inactivity | HIGH | No |
| HIPAA-ACC-004 | Multi-factor authentication required for PHI access | HIGH | No |
| HIPAA-ACC-005 | Emergency access ("break the glass") must be logged and reviewed | HIGH | No |

### Data Handling

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| HIPAA-DAT-001 | PHI must never appear in application logs | CRITICAL | Yes |
| HIPAA-DAT-002 | PHI must never be included in error messages or stack traces | CRITICAL | Yes |
| HIPAA-DAT-003 | PHI fields must be identified and tagged in data models | HIGH | No |
| HIPAA-DAT-004 | Data retention policies must be defined for all PHI | HIGH | No |
| HIPAA-DAT-005 | PHI disposal must be secure (crypto-shred or DOD 5220.22-M) | HIGH | No |

### Business Associate Agreements

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| HIPAA-BAA-001 | All third-party services handling PHI must have BAA documented | CRITICAL | No |
| HIPAA-BAA-002 | Cloud providers must be HIPAA-eligible (AWS, Azure, GCP with BAA) | CRITICAL | No |

---

## Scan Patterns

Gate-keeper scans code for these patterns when HIPAA compliance is active:

```
Banned Patterns:
├── console.log() containing PHI field names (patient, ssn, diagnosis, etc.)
├── Unencrypted database connections (no SSL/TLS)
├── PHI in URL query parameters
├── PHI in GET request parameters
├── Hardcoded encryption keys
├── PHI stored in localStorage/sessionStorage
├── PHI in cookies without Secure+HttpOnly flags
├── Email containing PHI without encryption
└── PHI in cache without expiration
```

---

## PHI Field Identifiers

Fields that trigger PHI handling rules when detected in data models:

```
patient_name, patient_id, ssn, social_security,
date_of_birth, dob, diagnosis, diagnosis_code,
treatment, prescription, medical_record_number, mrn,
insurance_id, insurance_number, health_plan,
provider_name, provider_npi, lab_results,
imaging_results, vital_signs, allergies,
medications, immunizations, discharge_summary,
admission_date, discharge_date, billing_code,
icd_code, cpt_code, ndc_code
```

---

## Integration

When activated, these rules are injected into the gate-keeper validation pipeline:

1. Gate-keeper loads this preset file
2. Rules are merged with existing gate-keeper rules (additive only)
3. PHI field scan runs on all new/modified files
4. Audit logging verification runs on all API endpoints
5. Encryption verification runs on all data storage layers
6. Results are included in the gate-keeper report

---

*HIPAA Compliance Preset v1.0 - Claude AS Framework*

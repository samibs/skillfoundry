# GDPR Compliance Profile

General Data Protection Regulation compliance checks for the Claude AS Framework.

## Checks (10 total)

| ID | Check | Category | Critical |
|----|-------|----------|----------|
| GDPR-001 | Lawful Basis for Processing | data_processing | Yes |
| GDPR-002 | Consent Mechanism | consent | Yes |
| GDPR-003 | Data Minimization | data_protection | No |
| GDPR-004 | Right to Access | data_subject_rights | No |
| GDPR-005 | Right to Erasure | data_subject_rights | Yes |
| GDPR-006 | Data Portability | data_subject_rights | No |
| GDPR-007 | Privacy by Design | data_protection | No |
| GDPR-008 | Breach Notification | breach_notification | Yes |
| GDPR-009 | DPO Contact | data_processing | No |
| GDPR-010 | Cross-Border Transfers | data_processing | No |

## Usage

```bash
bash compliance/gdpr/checks.sh [project-dir]
```

## Integration

```bash
/go --compliance=gdpr
```

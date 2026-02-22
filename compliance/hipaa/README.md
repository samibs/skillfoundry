# HIPAA Compliance Profile

Health Insurance Portability and Accountability Act compliance checks for the SkillFoundry Framework.

## Checks (15 total)

| ID | Check | Category | Critical |
|----|-------|----------|----------|
| HIPAA-001 | Encryption at Rest | encryption | Yes |
| HIPAA-002 | Encryption in Transit | encryption | Yes |
| HIPAA-003 | PHI Access Logging | audit_logging | No |
| HIPAA-004 | Authentication Required | access_control | Yes |
| HIPAA-005 | Role-Based Access Control | access_control | Yes |
| HIPAA-006 | Session Timeout | access_control | No |
| HIPAA-007 | Password Complexity | access_control | No |
| HIPAA-008 | No PHI in Logs | data_handling | No |
| HIPAA-009 | Data Backup | data_handling | No |
| HIPAA-010 | Secure Data Deletion | data_handling | No |
| HIPAA-011 | No Hardcoded Credentials | encryption | Yes |
| HIPAA-012 | Input Validation | data_handling | No |
| HIPAA-013 | Safe Error Messages | data_handling | No |
| HIPAA-014 | Incident Response | incident_response | No |
| HIPAA-015 | Business Associate Agreement | data_handling | No |

## Usage

```bash
bash compliance/hipaa/checks.sh [project-dir]
```

## Integration

```bash
/go --compliance=hipaa
```

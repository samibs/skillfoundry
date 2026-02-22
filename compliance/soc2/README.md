# SOC 2 Type II Compliance Profile

SOC 2 Trust Services Criteria compliance checks for the SkillFoundry Framework.

## Checks (12 total)

| ID | Check | Category | Critical |
|----|-------|----------|----------|
| SOC2-001 | Logical Access Controls | security | Yes |
| SOC2-002 | Data Encryption | security | Yes |
| SOC2-003 | Change Management | security | No |
| SOC2-004 | System Monitoring | availability | No |
| SOC2-005 | Backup and Recovery | availability | Yes |
| SOC2-006 | Input Validation | processing_integrity | No |
| SOC2-007 | Error Handling | processing_integrity | No |
| SOC2-008 | Audit Logging | security | No |
| SOC2-009 | Data Classification | confidentiality | Yes |
| SOC2-010 | Vendor Management | security | No |
| SOC2-011 | Privacy Notice | privacy | No |
| SOC2-012 | Incident Response | security | No |

## Usage

```bash
bash compliance/soc2/checks.sh [project-dir]
```

## Integration

```bash
/go --compliance=soc2
```

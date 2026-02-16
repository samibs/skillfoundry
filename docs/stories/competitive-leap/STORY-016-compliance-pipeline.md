# STORY-016: Compliance-as-Code Pipeline

**Phase:** 5 — Moonshots
**PRD:** competitive-leap
**Priority:** COULD
**Effort:** L
**Dependencies:** STORY-013
**Affects:** FR-054

---

## Description

Codify compliance checks as formal pipeline stages that execute during `/go --compliance=<profile>`. Instead of relying on gate-keeper's general knowledge of compliance requirements, define explicit, auditable checks with pass/fail results.

---

## Technical Approach

### Directory structure

```
compliance/
├── hipaa/
│   ├── checks.sh        ← Executable compliance checks
│   ├── profile.json      ← Metadata (name, version, description)
│   └── README.md         ← What this profile covers
├── soc2/
│   ├── checks.sh
│   ├── profile.json
│   └── README.md
├── gdpr/
│   ├── checks.sh
│   ├── profile.json
│   └── README.md
└── evidence/             ← Generated evidence artifacts
    └── .gitkeep
```

### Profile metadata: `compliance/hipaa/profile.json`

```json
{
  "name": "HIPAA",
  "version": "1.0",
  "description": "Health Insurance Portability and Accountability Act compliance checks",
  "categories": [
    "encryption",
    "access_control",
    "audit_logging",
    "data_handling",
    "incident_response"
  ],
  "total_checks": 15
}
```

### Checks script: `compliance/hipaa/checks.sh`

```bash
#!/usr/bin/env bash
# HIPAA Compliance Checks
# Returns JSON array of check results

check_encryption_at_rest() {
    # Verify database encryption configuration
    # Check for encryption-related imports/configs
    local result="pass"
    # ... actual check logic
    echo '{"id":"HIPAA-001","name":"Encryption at Rest","status":"'$result'","evidence":"config/database.yml"}'
}

check_encryption_in_transit() {
    # Verify HTTPS/TLS configuration
    local result="pass"
    echo '{"id":"HIPAA-002","name":"Encryption in Transit","status":"'$result'","evidence":"config/ssl.yml"}'
}

check_access_logging() {
    # Verify audit log configuration for PHI access
    local result="pass"
    echo '{"id":"HIPAA-003","name":"PHI Access Logging","status":"'$result'","evidence":"logs/audit.log"}'
}

# ... more checks

run_all_checks() {
    echo "["
    check_encryption_at_rest
    echo ","
    check_encryption_in_transit
    echo ","
    check_access_logging
    echo "]"
}
```

### HIPAA checks (15 total)

| ID | Check | Category |
|----|-------|----------|
| HIPAA-001 | Encryption at rest configured | encryption |
| HIPAA-002 | Encryption in transit (HTTPS/TLS) | encryption |
| HIPAA-003 | PHI access logging enabled | audit_logging |
| HIPAA-004 | Authentication required for all endpoints | access_control |
| HIPAA-005 | Role-based access control implemented | access_control |
| HIPAA-006 | Session timeout configured (≤15 min) | access_control |
| HIPAA-007 | Password complexity requirements | access_control |
| HIPAA-008 | No PHI in logs | data_handling |
| HIPAA-009 | Data backup configured | data_handling |
| HIPAA-010 | Secure data deletion capability | data_handling |
| HIPAA-011 | No hardcoded credentials | encryption |
| HIPAA-012 | Input validation on all endpoints | data_handling |
| HIPAA-013 | Error messages don't expose PHI | data_handling |
| HIPAA-014 | Incident response procedure documented | incident_response |
| HIPAA-015 | Business associate agreement template | data_handling |

### Integration with `/go`

When `/go --compliance=hipaa` is invoked:

1. Load profile from `compliance/hipaa/profile.json`
2. After Phase 3 (Temper/layer-check), run `compliance/hipaa/checks.sh`
3. Report results in standard format
4. Fail the pipeline if any critical check fails
5. Store evidence in `compliance/evidence/`

---

## Acceptance Criteria

```gherkin
Scenario: HIPAA compliance checks run
  Given "/go --compliance=hipaa" is invoked
  When compliance stage executes
  Then all 15 HIPAA checks run
  And results are reported with pass/fail per check

Scenario: SOC2 compliance checks run
  Given "/go --compliance=soc2" is invoked
  When compliance stage executes
  Then all SOC2 checks run

Scenario: Pipeline fails on critical check failure
  Given a critical compliance check fails
  When the compliance stage completes
  Then the pipeline is halted with clear error

Scenario: Multiple profiles supported
  Given "/go --compliance=hipaa,gdpr" is invoked
  When compliance stage executes
  Then both HIPAA and GDPR checks run

Scenario: Custom profile
  Given a user creates compliance/custom/checks.sh
  When "/go --compliance=custom" runs
  Then the custom checks execute
```

---

## Security Checklist

- [ ] Compliance checks don't expose actual data
- [ ] Evidence artifacts don't contain secrets
- [ ] Compliance profiles can't be modified during pipeline execution

---

## Files to Create

| File | Action |
|------|--------|
| `compliance/hipaa/checks.sh` | Create HIPAA checks |
| `compliance/hipaa/profile.json` | Create HIPAA profile |
| `compliance/hipaa/README.md` | Create HIPAA documentation |
| `compliance/soc2/checks.sh` | Create SOC2 checks |
| `compliance/soc2/profile.json` | Create SOC2 profile |
| `compliance/soc2/README.md` | Create SOC2 documentation |
| `compliance/gdpr/checks.sh` | Create GDPR checks |
| `compliance/gdpr/profile.json` | Create GDPR profile |
| `compliance/gdpr/README.md` | Create GDPR documentation |
| `compliance/evidence/.gitkeep` | Create evidence directory |
| `tests/run-tests.sh` | Add compliance pipeline tests |

---

## Testing

- `bash compliance/hipaa/checks.sh` → valid JSON array
- `bash compliance/soc2/checks.sh` → valid JSON array
- `bash compliance/gdpr/checks.sh` → valid JSON array
- Each check has id, name, status, evidence fields
- Profile JSON validates with jq

# STORY-017: Compliance Evidence Collection

**Phase:** 5 — Moonshots
**PRD:** competitive-leap
**Priority:** COULD
**Effort:** M
**Dependencies:** STORY-016
**Affects:** FR-055

---

## Description

Automate the collection and packaging of compliance evidence artifacts. When compliance checks run, evidence is gathered and stored in a tamper-evident format that auditors can review.

---

## Technical Approach

### Evidence collection flow

```
Compliance check runs
        │
        ├── Check passes → Collect evidence artifact
        │                        │
        │                        ▼
        │                  Hash artifact (SHA-256)
        │                        │
        │                        ▼
        │                  Store in compliance/evidence/{profile}/{date}/
        │
        └── Check fails → Document failure with remediation steps
```

### Script: `scripts/compliance-evidence.sh`

```bash
#!/usr/bin/env bash
# Compliance evidence collection and packaging

# Usage:
#   compliance-evidence.sh collect <profile>              → Collect evidence for a profile
#   compliance-evidence.sh package <profile> [--output=X] → Package evidence into archive
#   compliance-evidence.sh verify <package>               → Verify evidence integrity
#   compliance-evidence.sh report <profile>               → Generate evidence report
```

### Evidence directory structure

```
compliance/evidence/
├── hipaa/
│   └── 2026-02-15/
│       ├── manifest.json           ← List of all evidence with hashes
│       ├── HIPAA-001-encryption.txt
│       ├── HIPAA-002-tls-config.txt
│       ├── HIPAA-003-audit-log-sample.txt
│       └── ...
└── soc2/
    └── 2026-02-15/
        ├── manifest.json
        └── ...
```

### Evidence manifest: `manifest.json`

```json
{
  "profile": "hipaa",
  "date": "2026-02-15",
  "framework_version": "1.11.0.0",
  "checks_total": 15,
  "checks_passed": 14,
  "checks_failed": 1,
  "evidence": [
    {
      "check_id": "HIPAA-001",
      "check_name": "Encryption at Rest",
      "status": "pass",
      "artifact": "HIPAA-001-encryption.txt",
      "sha256": "abc123...",
      "collected_at": "2026-02-15T14:30:00Z"
    }
  ],
  "manifest_hash": "sha256-of-entire-manifest-minus-this-field"
}
```

### Tamper evidence

The manifest includes a `manifest_hash` field that is the SHA-256 of the manifest content (excluding the `manifest_hash` field itself). Verifying integrity:

```bash
cmd_verify() {
    local package="$1"
    local manifest="$package/manifest.json"

    # Verify manifest hash
    local stored_hash
    stored_hash=$(jq -r '.manifest_hash' "$manifest")
    local computed_hash
    computed_hash=$(jq 'del(.manifest_hash)' "$manifest" | sha256sum | cut -d' ' -f1)

    if [ "$stored_hash" != "$computed_hash" ]; then
        echo -e "${RED}[FAIL]${NC} Manifest has been tampered with"
        exit 1
    fi

    # Verify each evidence artifact hash
    local all_valid=true
    while IFS= read -r line; do
        local artifact
        artifact=$(echo "$line" | jq -r '.artifact')
        local expected_hash
        expected_hash=$(echo "$line" | jq -r '.sha256')
        local actual_hash
        actual_hash=$(sha256sum "$package/$artifact" | cut -d' ' -f1)

        if [ "$expected_hash" != "$actual_hash" ]; then
            echo -e "${RED}[FAIL]${NC} $artifact has been modified"
            all_valid=false
        fi
    done < <(jq -c '.evidence[]' "$manifest")

    if [ "$all_valid" = true ]; then
        echo -e "${GREEN}[PASS]${NC} All evidence verified"
    fi
}
```

### Packaging

```bash
cmd_package() {
    local profile="$1"
    local output="${2:-compliance-evidence-${profile}-$(date +%Y%m%d).tar.gz}"

    tar -czf "$output" "compliance/evidence/$profile/"
    echo -e "${GREEN}[PASS]${NC} Evidence packaged: $output"
    echo -e "${CYAN}[INFO]${NC} SHA-256: $(sha256sum "$output" | cut -d' ' -f1)"
}
```

---

## Acceptance Criteria

```gherkin
Scenario: Evidence collected during compliance run
  Given HIPAA compliance checks run
  When a check passes with evidence
  Then the evidence artifact is stored in compliance/evidence/hipaa/{date}/

Scenario: Manifest generated
  Given evidence collection is complete
  When manifest is generated
  Then it lists all checks with hashes and statuses

Scenario: Evidence integrity verified
  Given an evidence package exists
  When "compliance-evidence.sh verify" runs
  Then all hashes match and verification passes

Scenario: Tampered evidence detected
  Given an evidence artifact was modified after collection
  When "compliance-evidence.sh verify" runs
  Then the tampered file is flagged

Scenario: Evidence packaged for auditor
  Given evidence exists for HIPAA profile
  When "compliance-evidence.sh package hipaa" runs
  Then a tar.gz archive is created with SHA-256 hash
```

---

## Security Checklist

- [ ] Evidence artifacts don't contain actual secrets or passwords
- [ ] SHA-256 hashes prevent undetected tampering
- [ ] Evidence files have restrictive permissions (600)
- [ ] Package hash printed for out-of-band verification

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/compliance-evidence.sh` | Create evidence collection script |
| `compliance/evidence/.gitkeep` | Ensure directory exists |
| `tests/run-tests.sh` | Add evidence collection tests |

---

## Testing

- `compliance-evidence.sh collect hipaa` → creates evidence directory with artifacts
- `compliance-evidence.sh verify compliance/evidence/hipaa/2026-02-15/` → passes
- Modify an artifact → verify detects tamper
- `compliance-evidence.sh package hipaa` → creates tar.gz
- `compliance-evidence.sh --help` → usage text, exit 0

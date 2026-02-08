# GDPR Compliance Preset

> Gate-keeper rule set for GDPR (General Data Protection Regulation) compliance.
> Activated via: `/go --compliance=gdpr`

---

## Scope

Applies to any project processing personal data of EU/EEA residents. Rules are **additive** - they extend existing gate-keeper rules, never weaken them.

---

## Mandatory Rules

### Lawful Basis & Consent (Articles 6, 7)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-CON-001 | Consent collection must be explicit, granular, and revocable | CRITICAL | No |
| GDPR-CON-002 | Consent records must include timestamp, version, and scope | CRITICAL | No |
| GDPR-CON-003 | Pre-ticked consent boxes are banned | CRITICAL | Yes |
| GDPR-CON-004 | Consent withdrawal must be as easy as giving consent | HIGH | No |
| GDPR-CON-005 | Processing purpose must be documented for each data collection | HIGH | No |

### Data Subject Rights (Articles 15-22)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-DSR-001 | Right to access: API endpoint for data export must exist | CRITICAL | No |
| GDPR-DSR-002 | Right to erasure: User deletion endpoint must exist | CRITICAL | No |
| GDPR-DSR-003 | Right to rectification: User data update endpoint must exist | HIGH | No |
| GDPR-DSR-004 | Right to portability: Data export in machine-readable format (JSON/CSV) | HIGH | No |
| GDPR-DSR-005 | Right to restriction: Ability to pause data processing per user | HIGH | No |
| GDPR-DSR-006 | DSR requests must be fulfilled within 30 days | HIGH | No |

### Data Protection by Design (Article 25)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-DPD-001 | Data minimization: Only collect data necessary for stated purpose | CRITICAL | No |
| GDPR-DPD-002 | Purpose limitation: Data used only for collected purpose | HIGH | No |
| GDPR-DPD-003 | Storage limitation: Retention periods defined for all personal data | HIGH | No |
| GDPR-DPD-004 | Pseudonymization where feasible (separate identifiers from data) | MEDIUM | No |
| GDPR-DPD-005 | Privacy impact assessment required for high-risk processing | HIGH | No |

### Data Security (Article 32)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-SEC-001 | Personal data must be encrypted at rest | CRITICAL | No |
| GDPR-SEC-002 | Personal data must be encrypted in transit (TLS 1.2+) | CRITICAL | No |
| GDPR-SEC-003 | Access to personal data must be logged | CRITICAL | No |
| GDPR-SEC-004 | Regular security testing must be documented | HIGH | No |
| GDPR-SEC-005 | Personal data backups must be encrypted | HIGH | No |

### Data Breach Notification (Articles 33, 34)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-BRN-001 | Breach detection mechanisms must exist (anomaly detection, alerts) | HIGH | No |
| GDPR-BRN-002 | Breach notification process must be documented (72-hour DPA notification) | HIGH | No |
| GDPR-BRN-003 | Breach logging must capture scope, affected data, and timeline | HIGH | No |

### International Transfers (Articles 44-49)

| Rule ID | Rule | Severity | Auto-Fix |
|---------|------|----------|----------|
| GDPR-TRF-001 | Data transfers outside EU/EEA must use approved mechanisms (SCCs, adequacy) | CRITICAL | No |
| GDPR-TRF-002 | Third-party processors must have DPA (Data Processing Agreement) | CRITICAL | No |
| GDPR-TRF-003 | Sub-processors must be documented and approved | HIGH | No |

---

## Personal Data Field Identifiers

Fields that trigger GDPR handling rules when detected in data models:

```
# Direct Identifiers
name, first_name, last_name, full_name,
email, email_address, phone, phone_number,
address, street, city, postal_code, zip_code,
date_of_birth, dob, national_id, passport_number,
social_security, tax_id, driver_license

# Indirect Identifiers
ip_address, device_id, cookie_id,
user_agent, geolocation, latitude, longitude,
browser_fingerprint, mac_address

# Special Category Data (Article 9)
race, ethnicity, political_opinion,
religious_belief, trade_union_membership,
genetic_data, biometric_data, health_data,
sexual_orientation, criminal_record
```

---

## Scan Patterns

Gate-keeper scans code for these patterns when GDPR compliance is active:

```
Banned Patterns:
├── Personal data in application logs without masking
├── Personal data in error messages or stack traces
├── Personal data in URL query parameters
├── Cookies set without consent check
├── Analytics/tracking without consent verification
├── Personal data stored without defined retention period
├── Hard-delete without checking retention requirements
├── Email addresses stored in plaintext without encryption option
├── IP addresses logged without anonymization option
├── Personal data sent to third-party services without DPA verification
└── Missing privacy policy link in user-facing pages
```

---

## Cookie Compliance

```
Required Cookie Categories:
├── Strictly Necessary (no consent needed)
│   └── Session cookies, CSRF tokens, load balancer cookies
├── Functional (consent required)
│   └── Language preferences, theme settings
├── Analytics (consent required)
│   └── Google Analytics, Matomo, usage tracking
└── Marketing (consent required)
    └── Ad tracking, remarketing, social media pixels

Cookie Banner Requirements:
├── Must appear before any non-essential cookies are set
├── Must offer granular consent (per category)
├── Must provide "Reject All" option equal to "Accept All"
├── Must link to full cookie policy
└── Must store consent proof with timestamp
```

---

## Integration

When activated, these rules are injected into the gate-keeper validation pipeline:

1. Gate-keeper loads this preset file
2. Rules are merged with existing gate-keeper rules (additive only)
3. Personal data field scan runs on all data models
4. Consent mechanism verification runs on user-facing endpoints
5. Data subject rights endpoint verification runs on API routes
6. Cookie compliance scan runs on frontend code
7. Results are included in the gate-keeper report

---

*GDPR Compliance Preset v1.0 - Claude AS Framework*

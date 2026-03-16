# STORY-008: Telemetry Consent + Privacy Policy

**Phase:** C — Telemetry MVP
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-007 (baseline and report commands must exist to be gated by consent)
**Affects:** FR-013, FR-014, US-012

---

## Description

Implement an opt-in consent mechanism for anonymous aggregate telemetry reporting, and publish a privacy policy documenting exactly what data is collected, stored, and (optionally) reported.

---

## Scope

### Files to create:
- `sf_cli/src/core/consent.ts` — consent management logic
- `sf_cli/__tests__/consent.test.ts` — unit tests
- `docs/PRIVACY.md` — privacy policy (also published on Docusaurus site)
- `site-docusaurus/docs/privacy.md` — same content, linked from site footer

### Files to modify:
- `sf_cli/src/core/telemetry.ts` — check consent before any aggregate reporting
- `sf_cli/src/commands/baseline.ts` — call consent check on first use
- `.skillfoundry/config.toml` template in `install.sh` — add `[telemetry]` section with `consent = "pending"`

---

## Technical Approach

### Consent Management (`consent.ts`)

```typescript
export type ConsentStatus = 'pending' | 'opted_in' | 'opted_out';

interface ConsentRecord {
  consent: ConsentStatus;
  consent_date: string | null;   // ISO 8601
  consent_version: number;       // Current: 1
}

export async function getConsent(): Promise<ConsentRecord> {
  // Read from .skillfoundry/config.toml [telemetry] section
  // If missing or consent = "pending", return pending
}

export async function promptConsent(): Promise<ConsentStatus> {
  // Display consent prompt (see below)
  // Write choice to config.toml
  // Return the choice
}

export async function ensureConsent(): Promise<ConsentStatus> {
  const record = await getConsent();
  if (record.consent === 'pending') {
    return await promptConsent();
  }
  return record.consent;
}

export async function setConsent(status: 'opted_in' | 'opted_out'): Promise<void> {
  // Write to config.toml:
  // [telemetry]
  // consent = "opted_in"
  // consent_date = "2026-03-16T10:00:00Z"
  // consent_version = 1
}
```

### Consent prompt (terminal):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SkillFoundry — Telemetry Consent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SkillFoundry can optionally send anonymous,
aggregate quality metrics to help improve
the framework.

What is collected:
  - Gate pass/fail counts (no code content)
  - Forge run duration and story counts
  - Error categories (no stack traces)
  - Framework version and OS type

What is NEVER collected:
  - Source code or file contents
  - File paths or project names
  - Personal information
  - API keys, tokens, or secrets

Full policy: https://samibs.github.io/skillfoundry/docs/privacy

Allow anonymous telemetry reporting? [y/N]:
```

Default is **No** (opt-out). Only explicit `y` or `yes` (case-insensitive) is treated as opt-in.

### Consent check integration:

The consent check is called ONLY when a command would send data externally (future aggregate reporting). Local-only commands (`sf metrics`, `sf report --html`, `sf metrics baseline`) do NOT require consent — they operate entirely on local data.

The consent prompt is triggered:
1. On the first run of any command that would report externally (none in Phase 1, but the mechanism is in place)
2. By running `sf telemetry consent` to change the preference

### CLI commands for consent management:

```
sf telemetry consent          # Show current status or prompt
sf telemetry consent --opt-in  # Opt in without prompt
sf telemetry consent --opt-out # Opt out without prompt
sf telemetry consent --status  # Print current consent status
```

### Privacy Policy (`docs/PRIVACY.md`)

The privacy policy covers:

```markdown
# Privacy Policy

## What SkillFoundry Collects

### Local Telemetry (always, stored on your machine only)
| Data | Purpose | Storage | Retention |
|------|---------|---------|-----------|
| Gate pass/fail counts | Quality trends | .skillfoundry/telemetry.jsonl | 5MB max, 2 archives |
| Forge run duration | Performance tracking | Same | Same |
| Story completion counts | Progress metrics | Same | Same |
| Security scan findings (counts only) | Security posture | Same | Same |
| Dependency scan findings (counts only) | Supply chain health | Same | Same |

### Anonymous Aggregate Reporting (opt-in only)
| Data | Purpose | Sent To | Retention |
|------|---------|---------|-----------|
| Aggregated gate statistics | Framework improvement | SkillFoundry analytics endpoint | 90 days |
| Framework version + OS type | Compatibility planning | Same | 90 days |
| Error category codes | Bug prioritization | Same | 90 days |

### Never Collected
- Source code, file contents, or diffs
- File paths, project names, or directory structures
- Personal information (name, email, IP address)
- API keys, tokens, credentials, or environment variables
- Git commit messages or branch names

## How to Control Telemetry

### Check current status
sf telemetry consent --status

### Opt in
sf telemetry consent --opt-in

### Opt out
sf telemetry consent --opt-out

### Delete all local telemetry
rm .skillfoundry/telemetry.jsonl

## Changes to This Policy
consent_version is incremented on policy changes.
If the policy version changes, you will be re-prompted.
```

---

## Acceptance Criteria

```gherkin
Scenario: First-time consent prompt appears
  Given a fresh SkillFoundry install with consent = "pending"
  When the user runs "sf telemetry consent"
  Then the consent prompt is displayed
  And the default is "No" (opt-out)

Scenario: User opts in
  Given the consent prompt is displayed
  When the user types "y" and presses Enter
  Then consent is set to "opted_in" in .skillfoundry/config.toml
  And consent_date is set to the current timestamp
  And consent_version is set to 1

Scenario: User opts out
  Given the consent prompt is displayed
  When the user types "n" or presses Enter (default)
  Then consent is set to "opted_out" in .skillfoundry/config.toml

Scenario: Consent is persisted
  Given the user has opted in
  When they run "sf telemetry consent --status"
  Then it prints "Telemetry: opted_in (since 2026-03-16)"

Scenario: CLI flags bypass prompt
  Given consent is "pending"
  When the user runs "sf telemetry consent --opt-in"
  Then consent is set to "opted_in" without showing a prompt

Scenario: Local commands do not require consent
  Given consent is "pending"
  When the user runs "sf metrics baseline" or "sf report --html"
  Then the command executes without showing a consent prompt
  And telemetry data is stored locally only

Scenario: Privacy policy is comprehensive
  Given the PRIVACY.md file exists
  When reviewed
  Then every collected data field is listed with its purpose and retention
  And the "Never Collected" section explicitly excludes source code, PII, and secrets

Scenario: Consent version triggers re-prompt
  Given consent_version is 1 and a new policy version 2 is released
  When the user runs a telemetry command
  Then the consent prompt re-appears with updated information
```

---

## Security Checklist

- [ ] Default is opt-out (user must explicitly say yes)
- [ ] No data is sent externally in Phase 1 (mechanism only)
- [ ] Consent status stored in local config file, not sent anywhere
- [ ] Privacy policy lists every field with purpose and retention
- [ ] Consent prompt clearly states what is and is not collected
- [ ] consent_version allows re-prompting on policy changes

---

## Testing

### Unit tests (`consent.test.ts`):
- Test `getConsent()` with missing config file (returns pending)
- Test `getConsent()` with existing opted_in record
- Test `setConsent('opted_in')` writes correct TOML
- Test `setConsent('opted_out')` writes correct TOML
- Test consent version mismatch triggers re-prompt
- Mock stdin to test prompt input handling ('y', 'n', '', 'Y', 'yes', 'no', 'garbage')

# STORY-009: Gitleaks Secrets Scanning Integration

## Goal

Integrate Gitleaks as a secrets scanner that runs mandatory before the T4 gate, detecting hardcoded API keys, tokens, passwords, and other secrets in the codebase.

## PRD Mapping

- FR-010 (Gitleaks Secrets Scanning)

## Epic

7 — Security Scanning Full Coverage

## Effort

S (Small) — External tool wrapper with output parsing and gate integration

## Dependencies

- None (foundation story for Epic 7)

## Scope

### Files to Create

- `sf_cli/src/core/gitleaks-scanner.ts` — Gitleaks wrapper with output parsing
- `sf_cli/src/core/__tests__/gitleaks-scanner.test.ts` — Unit tests
- `sf_cli/src/core/__tests__/fixtures/gitleaks/` — Test fixtures (files with intentional secrets for testing)

### Files to Modify

- `sf_cli/src/core/gates.ts` — Add Gitleaks scan as mandatory pre-T4 check
- `sf_cli/src/types.ts` — Add GitleaksFinding type

## Technical Approach

### Gitleaks Wrapper

```typescript
export interface GitleaksOptions {
  targetPath: string;       // Directory to scan (default: project root)
  configPath?: string;      // Custom .gitleaks.toml path
  reportFormat: 'json';     // Always JSON for parsing
  staged: boolean;          // Scan only staged files (for pre-commit use)
  verbose: boolean;         // Include detailed findings
}

export interface GitleaksFinding {
  description: string;      // Rule description (e.g., "AWS Access Key")
  file: string;             // Relative file path
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  match: string;            // Redacted secret (first 4 + last 4 chars, rest masked)
  secret: string;           // Full secret (never logged, only used for dedup)
  rule: string;             // Rule ID (e.g., "aws-access-key-id")
  entropy: number;          // Shannon entropy of the match
  fingerprint: string;      // Unique finding fingerprint for dedup
}

export class GitleaksScanner {
  async isAvailable(): Promise<boolean>;
  async scan(options?: Partial<GitleaksOptions>): Promise<GitleaksScanResult>;
  async scanStaged(): Promise<GitleaksScanResult>;
}

export interface GitleaksScanResult {
  scanner: 'gitleaks';
  available: boolean;       // Whether gitleaks binary was found
  success: boolean;         // true = scan ran (may have findings); false = scan failed to run
  findings: GitleaksFinding[];
  findingCount: number;
  duration: number;         // Milliseconds
  skipped: boolean;         // true if gitleaks not installed
  skipReason?: string;
}
```

### Binary Detection

```typescript
async isAvailable(): Promise<boolean> {
  // 1. Check if 'gitleaks' is in PATH (execSync 'which gitleaks')
  // 2. If found, verify version >= 8.18 (gitleaks version)
  // 3. Return true/false
}
```

### Execution

```typescript
async scan(options): Promise<GitleaksScanResult> {
  // 1. Check isAvailable()
  // 2. If not available: return { skipped: true, skipReason: 'gitleaks not installed' }
  // 3. Execute: gitleaks detect --source <targetPath> --report-format json --report-path /tmp/sf-gitleaks-<uuid>.json
  // 4. Parse JSON output
  // 5. Redact secrets in findings (mask middle characters)
  // 6. Clean up temp report file
  // 7. Return structured result
}
```

### Secret Redaction

Secrets are redacted in all output (logs, findings, reports):
- Show first 4 and last 4 characters: `AKIA****3XYZ`
- If secret is shorter than 10 chars: show first 2 and last 2: `pa****rd`
- The full secret value is never written to logs or reports

### .gitleaksignore Support

- If `.gitleaksignore` exists in project root, Gitleaks uses it natively
- The scanner documents how to add fingerprints to `.gitleaksignore` for false positive suppression
- Suppressed findings are still reported in scan results but marked as `suppressed: true`

### T4 Gate Integration

In `gates.ts`, add Gitleaks scan as a pre-T4 check:

```typescript
// In the T4 gate function:
const gitleaksResult = await gitleaksScanner.scan({ targetPath: projectRoot });

if (gitleaksResult.skipped) {
  logger.warn('Gitleaks not installed — secrets scanning skipped. Install: https://github.com/gitleaks/gitleaks#installation');
  // Gate passes with warning (not a hard failure if tool is missing)
} else if (gitleaksResult.findings.length > 0) {
  // Gate FAILS — secrets found
  return {
    passed: false,
    reason: `Gitleaks found ${gitleaksResult.findingCount} secret(s)`,
    details: gitleaksResult.findings.map(f => `${f.file}:${f.startLine} — ${f.description} (${f.rule})`),
  };
}
```

### Fixture Strategy

Test fixtures in `__tests__/fixtures/gitleaks/`:
- `has-aws-key.txt` — Contains a fake AWS access key (AKIA + 16 random chars)
- `has-github-token.txt` — Contains a fake GitHub token (ghp_ prefix)
- `has-private-key.txt` — Contains a fake RSA private key header
- `clean-file.txt` — Contains no secrets
- All fixtures use clearly fake values that cannot be mistaken for real credentials

## Acceptance Criteria

```gherkin
Feature: Gitleaks Secrets Scanning

  Scenario: Detect secrets in codebase
    Given a file contains an AWS access key
    When Gitleaks scan runs on the project
    Then the finding is reported with file path, line number, and rule ID
    And the secret value is redacted in the output (masked middle characters)

  Scenario: Clean codebase passes scan
    Given no files contain hardcoded secrets
    When Gitleaks scan runs
    Then findingCount is 0
    And success is true

  Scenario: T4 gate blocks on secrets
    Given Gitleaks finds 2 secrets in the codebase
    When the T4 gate evaluates
    Then the gate fails
    And the failure message lists both findings with file and line

  Scenario: Gitleaks not installed — graceful degradation
    Given gitleaks binary is not in PATH
    When the scanner runs
    Then skipped is true
    And skipReason explains gitleaks is not installed
    And the T4 gate passes with a warning (not a hard failure)

  Scenario: Staged-only scanning
    Given a staged file contains a secret
    And an unstaged file contains a different secret
    When scanStaged() runs
    Then only the staged file's secret is reported

  Scenario: False positive suppression
    Given a finding fingerprint is in .gitleaksignore
    When Gitleaks scan runs
    Then the finding is marked as suppressed
    And suppressed findings do not cause T4 gate failure
```

## Tests

- Unit: Gitleaks output JSON parsing into GitleaksFinding[]
- Unit: Secret redaction (various lengths)
- Unit: isAvailable() with gitleaks present and absent (mock exec)
- Unit: Scan with findings returns correct structure
- Unit: Scan with no findings returns empty findings array
- Unit: Graceful degradation when gitleaks not installed
- Unit: T4 gate integration — fail on findings, pass on clean
- Unit: T4 gate — warning on missing gitleaks
- Integration: Scan fixture directory with real gitleaks (skip in CI without gitleaks)

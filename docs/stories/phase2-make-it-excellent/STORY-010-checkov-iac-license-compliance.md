# STORY-010: Checkov IaC Scanning + License Compliance

## Goal

Integrate Checkov for Infrastructure-as-Code scanning (Terraform, Dockerfile, CloudFormation) and implement a license compliance checker that flags GPL/AGPL dependencies in commercial projects.

## PRD Mapping

- FR-011 (Checkov IaC Scanning)
- FR-012 (License Compliance Checker)

## Epic

7 — Security Scanning Full Coverage

## Effort

M (Medium) — Two distinct scanners: external tool wrapper (Checkov) + custom license checker

## Dependencies

- None (independent of STORY-009, can execute in parallel)

## Scope

### Files to Create

- `sf_cli/src/core/checkov-scanner.ts` — Checkov wrapper with SARIF/JSON parsing
- `sf_cli/src/core/license-checker.ts` — License compliance scanner
- `sf_cli/src/core/__tests__/checkov-scanner.test.ts` — Unit tests
- `sf_cli/src/core/__tests__/license-checker.test.ts` — Unit tests
- `sf_cli/src/core/__tests__/fixtures/checkov/Dockerfile.bad` — Misconfigured Dockerfile fixture
- `sf_cli/src/core/__tests__/fixtures/checkov/Dockerfile.good` — Properly configured Dockerfile fixture
- `sf_cli/src/core/__tests__/fixtures/licenses/package-gpl.json` — package.json with GPL dependency

### Files to Modify

- `sf_cli/src/types.ts` — Add CheckovFinding and LicenseFinding types

## Technical Approach

### Checkov Scanner

```typescript
export interface CheckovOptions {
  targetPath: string;           // Directory to scan
  frameworks: string[];         // Default: ['dockerfile', 'terraform', 'cloudformation']
  outputFormat: 'sarif' | 'json';  // Default: 'sarif'
  skipChecks?: string[];        // Check IDs to skip (e.g., ['CKV_DOCKER_3'])
  compact: boolean;             // Omit passing checks from output
}

export interface CheckovFinding {
  checkId: string;              // e.g., "CKV_DOCKER_2"
  checkName: string;            // e.g., "Ensure that HEALTHCHECK instructions have been added"
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  framework: string;            // 'dockerfile' | 'terraform' | 'cloudformation'
  guideline: string;            // URL to remediation documentation
  status: 'failed' | 'passed' | 'skipped';
}

export interface CheckovScanResult {
  scanner: 'checkov';
  available: boolean;
  success: boolean;
  findings: CheckovFinding[];
  findingCount: number;
  passedCount: number;
  scannedFiles: number;
  frameworks: string[];
  duration: number;
  skipped: boolean;
  skipReason?: string;
}

export class CheckovScanner {
  async isAvailable(): Promise<boolean>;   // Check 'checkov' in PATH, version >= 3.0
  async scan(options?: Partial<CheckovOptions>): Promise<CheckovScanResult>;
}
```

### Checkov Execution

```typescript
async scan(options): Promise<CheckovScanResult> {
  // 1. Check isAvailable()
  // 2. If not available: return { skipped: true, skipReason: 'checkov not installed (pip install checkov)' }
  // 3. Detect IaC files in targetPath (Dockerfile*, *.tf, *.yaml with CloudFormation markers)
  // 4. If no IaC files found: return { success: true, findings: [], scannedFiles: 0 }
  // 5. Execute: checkov -d <targetPath> --framework <frameworks> -o sarif --output-file-path /tmp/sf-checkov-<uuid>/
  // 6. Parse SARIF output into CheckovFinding[]
  // 7. Clean up temp directory
  // 8. Return structured result
}
```

### IaC File Detection

Before running Checkov, scan the project for relevant files:
- `Dockerfile*` (Dockerfile, Dockerfile.dev, etc.)
- `*.tf` (Terraform)
- `*.yaml` / `*.yml` with `AWSTemplateFormatVersion` or `Resources:` markers (CloudFormation)
- `docker-compose*.yml`

If no IaC files are found, skip the scan cleanly (not an error).

### License Compliance Checker

```typescript
export interface LicenseCheckOptions {
  targetPath: string;
  projectType: 'commercial' | 'open-source';  // Determined from sf config or .sfrc
  flagLicenses: string[];    // Default: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only']
  allowLicenses: string[];   // Explicit allowlist overrides flagLicenses
}

export interface LicenseFinding {
  package: string;          // Package name
  version: string;
  license: string;          // SPDX identifier
  source: string;           // Which manifest (package.json, requirements.txt, etc.)
  severity: 'high' | 'medium';  // GPL in commercial = high; unknown license = medium
  reason: string;           // "GPL-3.0 is copyleft; incompatible with commercial use"
}

export interface LicenseCheckResult {
  scanner: 'license';
  findings: LicenseFinding[];
  findingCount: number;
  checkedPackages: number;
  manifests: string[];      // Which manifest files were scanned
  projectType: string;
  duration: number;
}

export class LicenseChecker {
  async check(options?: Partial<LicenseCheckOptions>): Promise<LicenseCheckResult>;
}
```

### License Detection Strategy

1. **npm (package.json):** Read `node_modules/<pkg>/package.json` for `license` field. If `node_modules` absent, parse `package-lock.json` for license metadata.
2. **pip (requirements.txt):** Run `pip show <pkg>` if available, parse `License` field. Fallback: check PyPI JSON API.
3. **Cargo (Cargo.toml):** Parse `Cargo.lock` for dependency versions, check `crates.io` API for license metadata.
4. **Go (go.mod):** Parse `go.sum` and check `pkg.go.dev` license info.
5. **.NET (*.csproj):** Parse NuGet package references, check NuGet API for license.

For speed, npm and pip are checked locally first. Remote API calls are batched and cached.

### SPDX License Classification

```typescript
const COPYLEFT_LICENSES = new Set([
  'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'LGPL-2.1', 'LGPL-2.1-only', 'LGPL-2.1-or-later',
  'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'MPL-2.0',  // Weak copyleft — flagged as medium
]);

const RESTRICTED_FOR_COMMERCIAL = new Set([
  'GPL-2.0', 'GPL-2.0-only', 'GPL-2.0-or-later',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
]);
```

### Project Type Detection

The license checker determines project type from:
1. `.sfrc` or `sf.config.json` — `projectType: 'commercial' | 'open-source'`
2. If not configured, default to `'commercial'` (safer — flags more)
3. If `'open-source'`, copyleft licenses are allowed (only flag AGPL in non-AGPL projects)

## Acceptance Criteria

```gherkin
Feature: Checkov IaC Scanning

  Scenario: Detect Dockerfile misconfiguration
    Given a Dockerfile uses the `latest` tag for a base image
    When Checkov scan runs
    Then a finding is reported with check ID, severity, and remediation URL
    And the file path and line number are correct

  Scenario: Clean Dockerfile passes
    Given a Dockerfile follows all best practices
    When Checkov scan runs
    Then no failed findings are reported for that file

  Scenario: No IaC files present
    Given the project contains no Dockerfiles, Terraform, or CloudFormation files
    When Checkov scan runs
    Then scannedFiles is 0
    And success is true (no error)

  Scenario: Checkov not installed
    Given checkov is not in PATH
    When the scanner runs
    Then skipped is true
    And skipReason explains how to install checkov

  Scenario: Multiple IaC frameworks
    Given the project has a Dockerfile and main.tf
    When Checkov scan runs
    Then findings from both frameworks are included
    And each finding has the correct framework field

Feature: License Compliance Checking

  Scenario: GPL dependency in commercial project
    Given a commercial project uses a GPL-3.0 licensed npm package
    When the license checker runs
    Then the package is flagged with severity "high"
    And the reason explains GPL is copyleft and incompatible with commercial use

  Scenario: MIT/Apache dependencies pass
    Given a commercial project uses only MIT and Apache-2.0 licensed packages
    When the license checker runs
    Then findingCount is 0

  Scenario: Open-source project with GPL
    Given an open-source project uses a GPL-3.0 licensed package
    When the license checker runs
    Then the package is not flagged (GPL is compatible with open-source)

  Scenario: Unknown license
    Given a package has no license field or an unrecognized license string
    When the license checker runs
    Then the package is flagged with severity "medium"
    And the reason states "Unknown or unrecognized license"

  Scenario: Multiple manifest files
    Given the project has package.json and requirements.txt
    When the license checker runs
    Then packages from both manifests are checked
    And manifests array lists both files
```

## Tests

- Unit: Checkov SARIF output parsing into CheckovFinding[]
- Unit: Checkov JSON output parsing (fallback format)
- Unit: IaC file detection across framework types
- Unit: Checkov graceful degradation when not installed
- Unit: License checker with GPL dependency in commercial project
- Unit: License checker with MIT-only dependencies (clean)
- Unit: License checker with unknown license
- Unit: Project type detection from .sfrc
- Unit: SPDX license classification
- Unit: Multiple manifest file scanning
- Integration: Checkov scan against fixture Dockerfiles (skip without checkov)
- Integration: License checker against fixture package.json

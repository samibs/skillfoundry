# STORY-011: Unified Security Report

## Goal

Build an aggregator that combines output from all security scanners (Semgrep, Gitleaks, Checkov, dependency scanner, license checker) into a single structured JSON report with optional HTML rendering.

## PRD Mapping

- FR-013 (Unified Security Report)

## Epic

7 — Security Scanning Full Coverage

## Effort

M (Medium) — Aggregation logic, JSON schema, HTML template

## Dependencies

- STORY-009 (Gitleaks) — Gitleaks findings feed into the report
- STORY-010 (Checkov + License) — Checkov and license findings feed into the report

## Scope

### Files to Create

- `sf_cli/src/core/security-report.ts` — Report aggregator
- `sf_cli/src/core/security-report-html.ts` — HTML renderer
- `sf_cli/src/core/__tests__/security-report.test.ts` — Unit tests
- `sf_cli/src/core/templates/security-report.html` — HTML template

### Files to Modify

- `sf_cli/src/commands/report.ts` — Add `sf report security` subcommand
- `sf_cli/src/core/gates.ts` — Generate unified report at T4 gate completion

## Technical Approach

### Report Schema

```typescript
export interface SecurityReport {
  version: '1.0';
  generatedAt: string;           // ISO 8601
  projectPath: string;
  projectName: string;
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    scannersRun: number;
    scannersSkipped: number;
    scanDuration: number;        // Total milliseconds
  };
  scanners: {
    semgrep: ScannerSection;
    gitleaks: ScannerSection;
    checkov: ScannerSection;
    dependencies: ScannerSection;
    licenses: ScannerSection;
  };
}

export interface ScannerSection {
  name: string;
  status: 'completed' | 'skipped' | 'failed';
  statusReason?: string;         // Why skipped or failed
  duration: number;
  findingCount: number;
  findings: UnifiedFinding[];
}

export interface UnifiedFinding {
  id: string;                    // UUID
  scanner: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;              // e.g., 'secrets', 'iac', 'owasp', 'cve', 'license'
  title: string;                 // Short description
  description: string;           // Full description
  file?: string;
  line?: number;
  rule: string;                  // Scanner-specific rule ID
  remediation?: string;          // Suggested fix
  references?: string[];         // URLs to documentation
  suppressed: boolean;           // True if in ignore list
}
```

### Aggregation Logic

```typescript
export class SecurityReportGenerator {
  async generate(results: {
    semgrep?: SemgrepScanResult;
    gitleaks?: GitleaksScanResult;
    checkov?: CheckovScanResult;
    dependencies?: DependencyScanResult;
    licenses?: LicenseCheckResult;
  }): Promise<SecurityReport> {
    // 1. Normalize each scanner's findings into UnifiedFinding[]
    // 2. Classify severity and category
    // 3. Calculate summary statistics
    // 4. Assemble report sections
    // 5. Return structured report
  }

  async writeJson(report: SecurityReport, outputPath: string): Promise<void>;
  async writeHtml(report: SecurityReport, outputPath: string): Promise<void>;
}
```

### Finding Normalization

Each scanner's output is normalized into `UnifiedFinding`:

| Scanner | Severity Mapping | Category |
|---------|-----------------|----------|
| Semgrep | Uses Semgrep severity directly | `owasp` |
| Gitleaks | All secrets = `high` (API keys) or `critical` (private keys) | `secrets` |
| Checkov | Maps Checkov severity (CRITICAL/HIGH/MEDIUM/LOW) | `iac` |
| Dependency Scanner | Maps CVSS: >=9=critical, >=7=high, >=4=medium, <4=low | `cve` |
| License Checker | GPL in commercial = `high`; unknown = `medium` | `license` |

### HTML Report

The HTML report is a self-contained single file (no external CSS/JS dependencies):

```
┌──────────────────────────────────────────────────────┐
│ SkillFoundry Security Report                         │
│ Generated: 2026-03-16 14:30:00 │ Project: my-app    │
├──────────────────────────────────────────────────────┤
│ SUMMARY                                              │
│ ┌─────────┬─────────┬──────────┬─────────┬────────┐  │
│ │Critical │ High    │ Medium   │ Low     │ Info   │  │
│ │ 0       │ 3       │ 7        │ 2       │ 1      │  │
│ └─────────┴─────────┴──────────┴─────────┴────────┘  │
│                                                      │
│ SCANNERS                                             │
│ [+] Semgrep (2 findings)          ← collapsible      │
│ [+] Gitleaks (1 finding)          ← collapsible      │
│ [+] Checkov (5 findings)          ← collapsible      │
│ [-] Dependencies (0 findings)     ← collapsed         │
│ [!] Licenses (skipped)            ← shows reason      │
│                                                      │
│ Each expanded section shows a table of findings:     │
│ Severity │ File │ Line │ Rule │ Description │ Fix    │
└──────────────────────────────────────────────────────┘
```

Features:
- Dark mode by default (light mode toggle)
- Collapsible sections per scanner
- Severity color coding (critical=red, high=orange, medium=yellow, low=blue)
- Filter by severity (checkboxes)
- Suppressed findings shown separately (collapsed by default)
- No external dependencies (inline CSS + vanilla JS)

### CLI Command

```
sf report security [--format json|html|both] [--output <path>] [--scan]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `both` | Output format |
| `--output` | `.sf/reports/security/` | Output directory |
| `--scan` | false | Run all scanners before generating report (otherwise, use cached results from last pipeline run) |

### Gate Integration

At T4 gate completion, the unified report is automatically generated and saved to `.sf/reports/security/security-report-<timestamp>.json`. The HTML version is generated alongside. Previous reports are retained (not overwritten) for audit trail.

## Acceptance Criteria

```gherkin
Feature: Unified Security Report

  Scenario: Aggregate all scanner outputs
    Given Semgrep found 2 OWASP issues
    And Gitleaks found 1 secret
    And Checkov found 3 IaC issues
    And dependency scanner found 1 CVE
    And license checker found 1 GPL violation
    When the unified report is generated
    Then totalFindings is 8
    And the report has 5 scanner sections with correct finding counts
    And each finding has a normalized severity and category

  Scenario: Scanner skipped gracefully
    Given Checkov is not installed (skipped)
    When the unified report is generated
    Then the checkov section has status "skipped"
    And statusReason explains why
    And totalFindings counts only findings from scanners that ran

  Scenario: JSON output
    Given the report is generated
    When written as JSON
    Then the file is valid JSON matching the SecurityReport schema
    And can be consumed by external tools (CI dashboards, SIEM)

  Scenario: HTML output
    Given the report is generated
    When written as HTML
    Then the file opens in a browser as a self-contained page
    And scanner sections are collapsible
    And findings are color-coded by severity
    And suppressed findings are in a separate collapsed section

  Scenario: CLI command
    Given scanner results are available from the last pipeline run
    When `sf report security --format json` is run
    Then a JSON report is written to .sf/reports/security/
    And the file path is printed to stdout

  Scenario: Auto-generation at T4 gate
    Given a pipeline run reaches the T4 gate
    When all security scanners complete
    Then a unified report (JSON + HTML) is automatically generated
    And saved to .sf/reports/security/ with a timestamp

  Scenario: Empty report (no findings)
    Given all scanners ran and found nothing
    When the report is generated
    Then totalFindings is 0
    And the HTML report shows a green "All clear" banner
```

## Tests

- Unit: Finding normalization from each scanner type
- Unit: Severity mapping correctness
- Unit: Summary statistics calculation
- Unit: Scanner section with status "skipped" and "failed"
- Unit: JSON output schema validation
- Unit: HTML template renders without errors
- Unit: Suppressed findings separated correctly
- Unit: CLI command argument parsing
- Integration: Full report generation with mock scanner results
- Integration: HTML file opens and renders (snapshot test)

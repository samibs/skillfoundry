// Unified Security Report Aggregator (STORY-011)
// Combines output from all security scanners into a single structured report.
// Scanners: Semgrep (OWASP SAST), Gitleaks (secrets), Checkov (IaC),
//           dependency-scanner (CVE), license-checker (license compliance).
// Supports JSON and self-contained HTML output.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import type { SecurityReport as SemgrepReport } from './semgrep-scanner.js';
import type { GitleaksScanResult } from './gitleaks-scanner.js';
import type { CheckovScanResult } from '../types.js';
import type { LicenseCheckResult } from '../types.js';
import type { CombinedDepReport } from './dependency-scanner.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Overall verdict for the unified report. */
export type UnifiedVerdict = 'PASS' | 'WARN' | 'FAIL';

/** Normalised severity used throughout the unified report. */
export type UnifiedSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Status of a scanner section in the unified report. */
export type ScannerStatus = 'completed' | 'skipped' | 'failed';

/**
 * A single normalised security finding aggregated from any scanner.
 */
export interface UnifiedFinding {
  /** UUID v4 — unique identifier for this finding. */
  id: string;
  /** Name of the scanner that produced this finding. */
  scanner: string;
  /** Normalised severity. */
  severity: UnifiedSeverity;
  /** Finding category: 'secrets' | 'iac' | 'owasp' | 'cve' | 'license' | string */
  category: string;
  /** Short human-readable title. */
  title: string;
  /** Full description of the finding. */
  description: string;
  /** Relative file path where the issue was found, if applicable. */
  file?: string;
  /** Line number, if applicable. */
  line?: number;
  /** Scanner-specific rule or check ID. */
  rule: string;
  /** Suggested remediation, if available. */
  remediation?: string;
  /** Reference URLs to documentation or advisories. */
  references?: string[];
  /** True when this finding is suppressed (e.g., .gitleaksignore). */
  suppressed: boolean;
}

/**
 * Per-scanner section within the unified report.
 */
export interface ScannerSection {
  /** Display name of the scanner. */
  name: string;
  /** Execution status of this scanner. */
  status: ScannerStatus;
  /** Human-readable reason when status is 'skipped' or 'failed'. */
  statusReason?: string;
  /** Wall-clock time spent in milliseconds. */
  duration: number;
  /** Total number of findings (including suppressed). */
  findingCount: number;
  /** Normalised findings from this scanner. */
  findings: UnifiedFinding[];
}

/**
 * Full unified security report schema.
 */
export interface UnifiedSecurityReport {
  /** Schema version. */
  version: '1.0';
  /** ISO 8601 timestamp of report generation. */
  generatedAt: string;
  /** Absolute path of the scanned project. */
  projectPath: string;
  /** Display name of the project (last path segment). */
  projectName: string;
  /** Overall security verdict. */
  verdict: UnifiedVerdict;
  /** Aggregate statistics across all scanners. */
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    scannersRun: number;
    scannersSkipped: number;
    scanDuration: number;
  };
  /** Per-scanner sections. */
  scanners: {
    semgrep: ScannerSection;
    gitleaks: ScannerSection;
    checkov: ScannerSection;
    dependencies: ScannerSection;
    licenses: ScannerSection;
  };
}

// ---------------------------------------------------------------------------
// Severity normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Normalise an uppercase severity string (CRITICAL / HIGH / MEDIUM / LOW / INFO)
 * to the lowercase unified form.
 *
 * @param raw - Raw severity string from any scanner.
 * @returns UnifiedSeverity.
 */
export function normaliseSeverity(raw: string): UnifiedSeverity {
  switch (raw.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH':     return 'high';
    case 'MEDIUM':
    case 'MODERATE': return 'medium';
    case 'LOW':      return 'low';
    default:         return 'info';
  }
}

/**
 * Assign a numeric rank to a severity for sorting (lower = more severe).
 *
 * @param severity - UnifiedSeverity value.
 * @returns Numeric rank.
 */
function severityRank(severity: UnifiedSeverity): number {
  const ranks: Record<UnifiedSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return ranks[severity];
}

// ---------------------------------------------------------------------------
// Finding normalisation — one function per scanner
// ---------------------------------------------------------------------------

/**
 * Convert Semgrep SecurityReport findings to UnifiedFinding[].
 *
 * Semgrep severity mapping:
 *   CRITICAL → critical  HIGH → high  MEDIUM → medium  LOW → low  INFO → info
 * Category: 'owasp'
 *
 * @param report - Result from runSecurityScan().
 * @returns Array of normalised findings.
 */
export function normaliseSemgrepFindings(report: SemgrepReport): UnifiedFinding[] {
  return report.findings.map((f) => ({
    id: randomUUID(),
    scanner: 'semgrep',
    severity: normaliseSeverity(f.severity),
    category: 'owasp',
    title: f.message.split('\n')[0].slice(0, 120),
    description: f.message,
    file: f.file || undefined,
    line: f.line || undefined,
    rule: f.rule,
    remediation: f.fix ?? undefined,
    references: [],
    suppressed: false,
  }));
}

/**
 * Convert Gitleaks findings to UnifiedFinding[].
 *
 * Severity mapping (per story spec):
 *   Rules containing 'private' or 'rsa' or 'ec' key → critical
 *   All other secrets                                 → high
 * Category: 'secrets'
 *
 * @param result - Result from GitleaksScanner.scan().
 * @returns Array of normalised findings.
 */
export function normaliseGitleaksFindings(result: GitleaksScanResult): UnifiedFinding[] {
  return result.findings.map((f) => {
    const ruleLC = f.rule.toLowerCase();
    const severity: UnifiedSeverity =
      ruleLC.includes('private') || ruleLC.includes('rsa') || ruleLC.includes(' ec ')
        ? 'critical'
        : 'high';

    return {
      id: randomUUID(),
      scanner: 'gitleaks',
      severity,
      category: 'secrets',
      title: f.description,
      description: `Secret detected by rule "${f.rule}". Match: ${f.match}`,
      file: f.file || undefined,
      line: f.startLine || undefined,
      rule: f.rule,
      remediation: 'Remove the secret from source code, rotate the credential, and add to .gitleaksignore if it is a false positive.',
      references: ['https://github.com/gitleaks/gitleaks#configuration'],
      suppressed: f.suppressed,
    };
  });
}

/**
 * Convert Checkov findings to UnifiedFinding[].
 *
 * Severity: maps Checkov severity directly (already normalised in types).
 * Category: 'iac'
 *
 * @param result - Result from CheckovScanner.scan().
 * @returns Array of normalised findings.
 */
export function normaliseCheckovFindings(result: CheckovScanResult): UnifiedFinding[] {
  return result.findings.map((f) => ({
    id: randomUUID(),
    scanner: 'checkov',
    severity: f.severity as UnifiedSeverity,
    category: 'iac',
    title: `${f.checkId}: ${f.checkName}`,
    description: `IaC misconfiguration in ${f.framework.toUpperCase()} file. Check ${f.checkId} failed.`,
    file: f.file || undefined,
    line: f.line || undefined,
    rule: f.checkId,
    remediation: `See remediation guide: ${f.guideline}`,
    references: [f.guideline],
    suppressed: false,
  }));
}

/**
 * Convert CombinedDepReport findings to UnifiedFinding[].
 *
 * CVSS-based severity mapping (per story spec):
 *   'critical' → critical
 *   'high'     → high
 *   'moderate' → medium
 *   'low'      → low
 *   others     → info
 * Category: 'cve'
 *
 * @param report - Result from runDependencyScan() / scanDependencies().
 * @returns Array of normalised findings.
 */
export function normaliseDependencyFindings(report: CombinedDepReport): UnifiedFinding[] {
  const allFindings = report.reports.flatMap((r) => r.findings);
  return allFindings.map((f) => ({
    id: randomUUID(),
    scanner: 'dependency-scanner',
    severity: normaliseSeverity(f.severity),
    category: 'cve',
    title: f.title,
    description: `Vulnerable dependency: ${f.name}@${f.version} (${f.package_manager}). CVE: ${f.cve || 'N/A'}`,
    file: undefined,
    line: undefined,
    rule: f.cve || `vuln-${f.name}`,
    remediation: f.advisory_url ? `See advisory: ${f.advisory_url}` : `Update ${f.name} to a patched version.`,
    references: f.advisory_url ? [f.advisory_url] : [],
    suppressed: false,
  }));
}

/**
 * Convert LicenseCheckResult findings to UnifiedFinding[].
 *
 * Severity mapping (per story spec):
 *   GPL in commercial = 'high'
 *   unknown license   = 'medium'
 * Category: 'license'
 *
 * @param result - Result from LicenseChecker.check().
 * @returns Array of normalised findings.
 */
export function normaliseLicenseFindings(result: LicenseCheckResult): UnifiedFinding[] {
  return result.findings.map((f) => ({
    id: randomUUID(),
    scanner: 'license-checker',
    severity: f.severity as UnifiedSeverity,
    category: 'license',
    title: `${f.package}: ${f.license} license`,
    description: `License compliance issue for ${f.package}@${f.version}: ${f.reason}`,
    file: f.source,
    line: undefined,
    rule: `license-${f.license.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    remediation: `Review the ${f.license} license terms or replace ${f.package} with a permissively-licensed alternative.`,
    references: [],
    suppressed: false,
  }));
}

// ---------------------------------------------------------------------------
// Verdict determination
// ---------------------------------------------------------------------------

/**
 * Compute the overall verdict from aggregated finding counts.
 *
 * FAIL if any critical or high findings.
 * WARN if any medium findings (but no critical/high).
 * PASS otherwise.
 *
 * @param summary - Aggregated count object from the report summary.
 * @returns UnifiedVerdict.
 */
export function computeVerdict(summary: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}): UnifiedVerdict {
  if (summary.critical > 0 || summary.high > 0) return 'FAIL';
  if (summary.medium > 0) return 'WARN';
  return 'PASS';
}

// ---------------------------------------------------------------------------
// Scanner section builder
// ---------------------------------------------------------------------------

/**
 * Build a ScannerSection for a scanner that completed successfully.
 *
 * @param name - Display name of the scanner.
 * @param findings - Normalised findings.
 * @param duration - Wall-clock duration in milliseconds.
 * @returns ScannerSection with status 'completed'.
 */
function completedSection(
  name: string,
  findings: UnifiedFinding[],
  duration: number,
): ScannerSection {
  return {
    name,
    status: 'completed',
    duration,
    findingCount: findings.length,
    findings: [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
  };
}

/**
 * Build a ScannerSection for a scanner that was skipped.
 *
 * @param name - Display name.
 * @param reason - Human-readable skip reason.
 * @returns ScannerSection with status 'skipped'.
 */
function skippedSection(name: string, reason: string): ScannerSection {
  return {
    name,
    status: 'skipped',
    statusReason: reason,
    duration: 0,
    findingCount: 0,
    findings: [],
  };
}

/**
 * Build a ScannerSection for a scanner that failed with an error.
 *
 * @param name - Display name.
 * @param reason - Error description.
 * @returns ScannerSection with status 'failed'.
 */
function failedSection(name: string, reason: string): ScannerSection {
  return {
    name,
    status: 'failed',
    statusReason: reason,
    duration: 0,
    findingCount: 0,
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// Report generator inputs
// ---------------------------------------------------------------------------

/**
 * All possible scanner results fed to the generator.
 * Each field is optional — absent fields result in 'skipped' sections.
 */
export interface ScannerResults {
  /** Result from runSecurityScan(). */
  semgrep?: SemgrepReport;
  /** Result from GitleaksScanner.scan(). */
  gitleaks?: GitleaksScanResult;
  /** Result from CheckovScanner.scan(). */
  checkov?: CheckovScanResult;
  /** Result from runDependencyScan(). */
  dependencies?: CombinedDepReport;
  /** Result from LicenseChecker.check(). */
  licenses?: LicenseCheckResult;
}

// ---------------------------------------------------------------------------
// UnifiedSecurityReportGenerator
// ---------------------------------------------------------------------------

/**
 * Aggregates scanner outputs into a UnifiedSecurityReport and writes
 * JSON and/or HTML output files.
 *
 * Usage:
 * ```typescript
 * const gen = new UnifiedSecurityReportGenerator('/path/to/project');
 * const report = gen.generate({ semgrep, gitleaks, checkov, dependencies, licenses });
 * await gen.writeJson(report, '/path/to/output.json');
 * await gen.writeHtml(report, '/path/to/output.html');
 * ```
 */
export class UnifiedSecurityReportGenerator {
  private readonly projectPath: string;

  /**
   * @param projectPath - Absolute path to the project root being scanned.
   */
  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Aggregate all scanner results into a unified report.
   * Scanner failures are isolated — one failing scanner does not block others.
   *
   * @param results - Partial scanner results object.
   * @returns Fully assembled UnifiedSecurityReport.
   */
  generate(results: ScannerResults): UnifiedSecurityReport {
    const log = getLogger();
    const totalStart = Date.now();

    // ── Semgrep section ──────────────────────────────────────────
    let semgrepSection: ScannerSection;
    try {
      if (!results.semgrep) {
        semgrepSection = skippedSection('Semgrep', 'No Semgrep results provided');
      } else {
        const findings = normaliseSemgrepFindings(results.semgrep);
        semgrepSection = completedSection('Semgrep', findings, results.semgrep.scanDurationMs);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('security-report', 'semgrep_normalisation_failed', { error: msg });
      semgrepSection = failedSection('Semgrep', `Normalisation error: ${msg}`);
    }

    // ── Gitleaks section ─────────────────────────────────────────
    let gitleaksSection: ScannerSection;
    try {
      if (!results.gitleaks) {
        gitleaksSection = skippedSection('Gitleaks', 'No Gitleaks results provided');
      } else if (results.gitleaks.skipped) {
        gitleaksSection = skippedSection(
          'Gitleaks',
          results.gitleaks.skipReason ?? 'Gitleaks was skipped',
        );
      } else if (!results.gitleaks.success) {
        gitleaksSection = failedSection(
          'Gitleaks',
          results.gitleaks.skipReason ?? 'Gitleaks scan failed',
        );
      } else {
        const findings = normaliseGitleaksFindings(results.gitleaks);
        gitleaksSection = completedSection('Gitleaks', findings, results.gitleaks.duration);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('security-report', 'gitleaks_normalisation_failed', { error: msg });
      gitleaksSection = failedSection('Gitleaks', `Normalisation error: ${msg}`);
    }

    // ── Checkov section ──────────────────────────────────────────
    let checkovSection: ScannerSection;
    try {
      if (!results.checkov) {
        checkovSection = skippedSection('Checkov', 'No Checkov results provided');
      } else if (results.checkov.skipped) {
        checkovSection = skippedSection(
          'Checkov',
          results.checkov.skipReason ?? 'Checkov was skipped',
        );
      } else if (!results.checkov.success) {
        checkovSection = failedSection(
          'Checkov',
          results.checkov.skipReason ?? 'Checkov scan failed',
        );
      } else {
        const findings = normaliseCheckovFindings(results.checkov);
        checkovSection = completedSection('Checkov', findings, results.checkov.duration);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('security-report', 'checkov_normalisation_failed', { error: msg });
      checkovSection = failedSection('Checkov', `Normalisation error: ${msg}`);
    }

    // ── Dependency scanner section ───────────────────────────────
    let dependenciesSection: ScannerSection;
    try {
      if (!results.dependencies) {
        dependenciesSection = skippedSection('Dependency Scanner', 'No dependency scan results provided');
      } else {
        const findings = normaliseDependencyFindings(results.dependencies);
        // Duration is not tracked at the combined level — use 0
        dependenciesSection = completedSection('Dependency Scanner', findings, 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('security-report', 'dependency_normalisation_failed', { error: msg });
      dependenciesSection = failedSection('Dependency Scanner', `Normalisation error: ${msg}`);
    }

    // ── License checker section ──────────────────────────────────
    let licensesSection: ScannerSection;
    try {
      if (!results.licenses) {
        licensesSection = skippedSection('License Checker', 'No license check results provided');
      } else {
        const findings = normaliseLicenseFindings(results.licenses);
        licensesSection = completedSection('License Checker', findings, results.licenses.duration);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('security-report', 'license_normalisation_failed', { error: msg });
      licensesSection = failedSection('License Checker', `Normalisation error: ${msg}`);
    }

    // ── Aggregate statistics ─────────────────────────────────────
    const allSections = [
      semgrepSection,
      gitleaksSection,
      checkovSection,
      dependenciesSection,
      licensesSection,
    ];

    const allFindings = allSections.flatMap((s) => s.findings);
    // Exclude suppressed findings from severity counts
    const activeFindings = allFindings.filter((f) => !f.suppressed);

    const summary = {
      totalFindings: allFindings.length,
      critical: activeFindings.filter((f) => f.severity === 'critical').length,
      high: activeFindings.filter((f) => f.severity === 'high').length,
      medium: activeFindings.filter((f) => f.severity === 'medium').length,
      low: activeFindings.filter((f) => f.severity === 'low').length,
      info: activeFindings.filter((f) => f.severity === 'info').length,
      scannersRun: allSections.filter((s) => s.status === 'completed').length,
      scannersSkipped: allSections.filter((s) => s.status === 'skipped' || s.status === 'failed').length,
      scanDuration: Date.now() - totalStart,
    };

    const verdict = computeVerdict(summary);

    const report: UnifiedSecurityReport = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      projectPath: this.projectPath,
      projectName: basename(this.projectPath),
      verdict,
      summary,
      scanners: {
        semgrep: semgrepSection,
        gitleaks: gitleaksSection,
        checkov: checkovSection,
        dependencies: dependenciesSection,
        licenses: licensesSection,
      },
    };

    log.info('security-report', 'report_generated', {
      verdict,
      totalFindings: summary.totalFindings,
      scannersRun: summary.scannersRun,
      scannersSkipped: summary.scannersSkipped,
      durationMs: summary.scanDuration,
    });

    return report;
  }

  /**
   * Write the report as formatted JSON to the given path.
   * Creates parent directories automatically.
   *
   * @param report - UnifiedSecurityReport to serialise.
   * @param outputPath - Absolute path for the output file.
   */
  writeJson(report: UnifiedSecurityReport, outputPath: string): void {
    const log = getLogger();
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    log.info('security-report', 'json_written', { path: outputPath });
  }

  /**
   * Write the report as a self-contained HTML file to the given path.
   * Creates parent directories automatically.
   *
   * @param report - UnifiedSecurityReport to render.
   * @param outputPath - Absolute path for the output file.
   */
  writeHtml(report: UnifiedSecurityReport, outputPath: string): void {
    const log = getLogger();
    const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const html = renderSecurityReportHtml(report);
    writeFileSync(outputPath, html, 'utf-8');
    log.info('security-report', 'html_written', { path: outputPath });
  }
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe insertion into HTML content.
 *
 * @param str - Raw string.
 * @returns HTML-escaped string.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Safely convert any value to an HTML-escaped string. */
function safeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return escapeHtml(String(value));
}

/** Map a severity to its CSS class name. */
function severityClass(severity: UnifiedSeverity): string {
  const map: Record<UnifiedSeverity, string> = {
    critical: 'sev-critical',
    high: 'sev-high',
    medium: 'sev-medium',
    low: 'sev-low',
    info: 'sev-info',
  };
  return map[severity];
}

/** Map a status to its CSS class name. */
function statusClass(status: ScannerStatus): string {
  if (status === 'completed') return 'status-ok';
  if (status === 'skipped') return 'status-skip';
  return 'status-fail';
}

/**
 * Render a ScannerSection as an HTML collapsible block.
 *
 * @param section - The scanner section to render.
 * @param sectionId - Unique HTML ID for the collapsible.
 * @returns HTML string for the section.
 */
function renderScannerSection(section: ScannerSection, sectionId: string): string {
  const headerIcon = section.status === 'completed'
    ? (section.findingCount > 0 ? '&#9888;' : '&#10003;')
    : (section.status === 'skipped' ? '&#8212;' : '&#10005;');

  const findingLabel = section.findingCount === 1 ? '1 finding' : `${section.findingCount} findings`;
  const statusLabel = section.status === 'completed'
    ? findingLabel
    : (section.statusReason || section.status);

  const activeFindings = section.findings.filter((f) => !f.suppressed);
  const suppressedFindings = section.findings.filter((f) => f.suppressed);

  const findingsTable = (findings: UnifiedFinding[], suppressedGroup: boolean): string => {
    if (findings.length === 0) {
      return suppressedGroup
        ? ''
        : '<p class="no-findings">No findings detected.</p>';
    }

    const rows = findings.map((f) => `
        <tr class="${severityClass(f.severity)}${suppressedGroup ? ' suppressed-row' : ''}">
          <td><span class="badge ${severityClass(f.severity)}">${safeHtml(f.severity.toUpperCase())}</span></td>
          <td>${safeHtml(f.file || '—')}</td>
          <td>${safeHtml(f.line?.toString() || '—')}</td>
          <td><code>${safeHtml(f.rule)}</code></td>
          <td>${safeHtml(f.title)}</td>
          <td>${safeHtml(f.remediation || '—')}</td>
        </tr>`).join('');

    return `
      <table class="findings-table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>File</th>
            <th>Line</th>
            <th>Rule</th>
            <th>Description</th>
            <th>Remediation</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  const suppressedBlock = suppressedFindings.length > 0 ? `
    <details class="suppressed-block">
      <summary class="suppressed-summary">&#8203; ${suppressedFindings.length} suppressed finding(s)</summary>
      ${findingsTable(suppressedFindings, true)}
    </details>` : '';

  const bodyContent = section.status !== 'completed'
    ? `<p class="scanner-status-msg">${safeHtml(section.statusReason || section.status)}</p>`
    : `${findingsTable(activeFindings, false)}${suppressedBlock}`;

  return `
  <details class="scanner-section" id="${safeHtml(sectionId)}">
    <summary class="scanner-header">
      <span class="scanner-icon">${headerIcon}</span>
      <span class="scanner-name">${safeHtml(section.name)}</span>
      <span class="scanner-status ${statusClass(section.status)}">${safeHtml(statusLabel)}</span>
      ${section.duration > 0 ? `<span class="scanner-duration">${section.duration}ms</span>` : ''}
    </summary>
    <div class="scanner-body">
      ${bodyContent}
    </div>
  </details>`;
}

/**
 * Render a UnifiedSecurityReport as a self-contained HTML document.
 * No external CSS or JS dependencies. Dark mode by default with a light mode toggle.
 *
 * @param report - The report to render.
 * @returns Complete HTML string.
 */
export function renderSecurityReportHtml(report: UnifiedSecurityReport): string {
  const verdictClass = report.verdict === 'PASS'
    ? 'verdict-pass'
    : (report.verdict === 'WARN' ? 'verdict-warn' : 'verdict-fail');

  const summaryBanner = report.summary.totalFindings === 0
    ? '<div class="all-clear">&#10003; All clear — no security findings detected across all scanners.</div>'
    : '';

  const allSections = [
    { key: 'semgrep', section: report.scanners.semgrep },
    { key: 'gitleaks', section: report.scanners.gitleaks },
    { key: 'checkov', section: report.scanners.checkov },
    { key: 'dependencies', section: report.scanners.dependencies },
    { key: 'licenses', section: report.scanners.licenses },
  ];

  const scannerHtml = allSections
    .map(({ key, section }) => renderScannerSection(section, `scanner-${key}`))
    .join('\n');

  const generatedDate = new Date(report.generatedAt).toLocaleString();

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkillFoundry Security Report — ${safeHtml(report.projectName)}</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #21262d;
    --text: #c9d1d9;
    --text-muted: #8b949e;
    --text-bright: #f0f6fc;
    --accent: #58a6ff;
    --critical: #ff4d4f;
    --high: #ff7a45;
    --medium: #faad14;
    --low: #69c0ff;
    --info: #8b949e;
    --pass: #3fb950;
    --warn: #d29922;
    --fail: #f85149;
    --skip: #8b949e;
  }
  [data-theme="light"] {
    --bg: #f6f8fa;
    --surface: #ffffff;
    --border: #d0d7de;
    --text: #24292f;
    --text-muted: #57606a;
    --text-bright: #1f2328;
    --accent: #0969da;
    --critical: #cf222e;
    --high: #d1242f;
    --medium: #9a6700;
    --low: #0550ae;
    --info: #57606a;
    --pass: #1a7f37;
    --warn: #9a6700;
    --fail: #cf222e;
    --skip: #57606a;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
    font-size: 14px;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
  h1 { color: var(--accent); font-size: 1.8rem; }
  h2 { color: var(--accent); font-size: 1.2rem; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
  .subtitle { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.3rem; }
  .theme-toggle { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; white-space: nowrap; }
  .theme-toggle:hover { background: var(--border); }

  /* Verdict banner */
  .verdict-banner {
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    display: inline-block;
  }
  .verdict-pass { background: rgba(63,185,80,0.15); border: 1px solid var(--pass); color: var(--pass); }
  .verdict-warn { background: rgba(210,153,34,0.15); border: 1px solid var(--warn); color: var(--warn); }
  .verdict-fail { background: rgba(248,81,73,0.15); border: 1px solid var(--fail); color: var(--fail); }

  /* Summary grid */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  .summary-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }
  .summary-card .count { font-size: 2rem; font-weight: 700; }
  .summary-card .label { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .count-critical { color: var(--critical); }
  .count-high { color: var(--high); }
  .count-medium { color: var(--medium); }
  .count-low { color: var(--low); }
  .count-info { color: var(--info); }

  /* All-clear banner */
  .all-clear {
    background: rgba(63,185,80,0.12);
    border: 1px solid var(--pass);
    color: var(--pass);
    border-radius: 8px;
    padding: 1.2rem 1.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  /* Scanner sections (collapsible) */
  .scanner-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 0.75rem;
    overflow: hidden;
  }
  .scanner-section[open] { border-color: var(--accent); }
  .scanner-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1.25rem;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }
  .scanner-header::-webkit-details-marker { display: none; }
  .scanner-icon { font-size: 1.1rem; width: 1.2rem; flex-shrink: 0; }
  .scanner-name { font-weight: 600; color: var(--text-bright); flex: 1; }
  .scanner-status { font-size: 0.85rem; border-radius: 4px; padding: 0.2rem 0.6rem; font-weight: 500; }
  .status-ok { background: rgba(63,185,80,0.15); color: var(--pass); }
  .status-skip { background: rgba(139,148,158,0.15); color: var(--skip); }
  .status-fail { background: rgba(248,81,73,0.15); color: var(--fail); }
  .scanner-duration { color: var(--text-muted); font-size: 0.8rem; margin-left: auto; }
  .scanner-body { padding: 0 1.25rem 1.25rem; }
  .scanner-status-msg { color: var(--text-muted); font-style: italic; padding: 0.5rem 0; }
  .no-findings { color: var(--pass); padding: 0.5rem 0; }

  /* Findings table */
  .findings-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.75rem; }
  .findings-table th {
    background: var(--border);
    color: var(--text-bright);
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .findings-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; word-break: break-word; }
  .findings-table tr:last-child td { border-bottom: none; }
  .findings-table code { background: var(--border); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.8rem; word-break: break-all; }
  .suppressed-row { opacity: 0.6; }

  /* Severity badges */
  .badge { display: inline-block; padding: 0.15em 0.5em; border-radius: 4px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; white-space: nowrap; }
  .sev-critical { background: rgba(255,77,79,0.18); color: var(--critical); }
  .sev-high { background: rgba(255,122,69,0.18); color: var(--high); }
  .sev-medium { background: rgba(250,173,20,0.18); color: var(--medium); }
  .sev-low { background: rgba(105,192,255,0.18); color: var(--low); }
  .sev-info { background: rgba(139,148,158,0.18); color: var(--info); }

  /* Suppressed findings block */
  .suppressed-block { margin-top: 1rem; }
  .suppressed-summary {
    color: var(--text-muted);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.4rem 0;
    user-select: none;
  }

  /* Severity filter checkboxes */
  .filter-bar { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
  .filter-bar label { font-size: 0.85rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
  .filter-bar input[type=checkbox] { accent-color: var(--accent); }

  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.8rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>SkillFoundry Security Report</h1>
      <p class="subtitle">Project: <strong>${safeHtml(report.projectName)}</strong> &nbsp;&bull;&nbsp; Generated: ${safeHtml(generatedDate)}</p>
    </div>
    <button class="theme-toggle" onclick="toggleTheme()">Toggle Light/Dark</button>
  </header>

  <div class="verdict-banner ${verdictClass}">Verdict: ${safeHtml(report.verdict)}</div>

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="count count-critical">${safeHtml(report.summary.critical)}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card">
      <div class="count count-high">${safeHtml(report.summary.high)}</div>
      <div class="label">High</div>
    </div>
    <div class="summary-card">
      <div class="count count-medium">${safeHtml(report.summary.medium)}</div>
      <div class="label">Medium</div>
    </div>
    <div class="summary-card">
      <div class="count count-low">${safeHtml(report.summary.low)}</div>
      <div class="label">Low</div>
    </div>
    <div class="summary-card">
      <div class="count count-info">${safeHtml(report.summary.info)}</div>
      <div class="label">Info</div>
    </div>
    <div class="summary-card">
      <div class="count" style="color:var(--text-bright)">${safeHtml(report.summary.scannersRun)}</div>
      <div class="label">Scanners Run</div>
    </div>
  </div>

  ${summaryBanner}

  <h2>Scanner Results</h2>
  <div class="filter-bar" id="filterBar">
    <span style="color:var(--text-muted);font-size:0.85rem;">Filter:</span>
    <label><input type="checkbox" checked data-sev="critical" onchange="filterFindings()"> <span class="badge sev-critical">CRITICAL</span></label>
    <label><input type="checkbox" checked data-sev="high" onchange="filterFindings()"> <span class="badge sev-high">HIGH</span></label>
    <label><input type="checkbox" checked data-sev="medium" onchange="filterFindings()"> <span class="badge sev-medium">MEDIUM</span></label>
    <label><input type="checkbox" checked data-sev="low" onchange="filterFindings()"> <span class="badge sev-low">LOW</span></label>
    <label><input type="checkbox" checked data-sev="info" onchange="filterFindings()"> <span class="badge sev-info">INFO</span></label>
  </div>

  <div id="scannerSections">
  ${scannerHtml}
  </div>

  <footer>
    Generated by SkillFoundry Security Scanner at ${safeHtml(generatedDate)} &mdash; Project: ${safeHtml(report.projectPath)}
  </footer>
</div>

<script>
function toggleTheme() {
  var html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
}

function filterFindings() {
  var checkboxes = document.querySelectorAll('#filterBar input[type=checkbox]');
  var active = new Set();
  checkboxes.forEach(function(cb) {
    if (cb.checked) active.add(cb.dataset.sev);
  });
  var rows = document.querySelectorAll('.findings-table tbody tr');
  rows.forEach(function(row) {
    var badge = row.querySelector('.badge');
    if (!badge) return;
    var sev = badge.textContent.trim().toLowerCase();
    row.style.display = active.has(sev) ? '' : 'none';
  });
}
<\/script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a UnifiedSecurityReportGenerator for the given project root.
 *
 * @param projectPath - Absolute path to the project.
 * @returns A ready-to-use generator instance.
 */
export function createUnifiedReportGenerator(projectPath: string): UnifiedSecurityReportGenerator {
  return new UnifiedSecurityReportGenerator(projectPath);
}

/**
 * Generate default output paths for a security report based on a timestamp.
 * Creates the directory if it does not exist.
 *
 * @param projectPath - Absolute path to the project root.
 * @param timestamp - ISO string or compact timestamp used in the filename.
 * @returns Object with jsonPath and htmlPath.
 */
export function getDefaultReportPaths(
  projectPath: string,
  timestamp?: string,
): { dir: string; jsonPath: string; htmlPath: string } {
  const ts = (timestamp ?? new Date().toISOString())
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  const dir = join(projectPath, '.sf', 'reports', 'security');
  const jsonPath = join(dir, `security-report-${ts}.json`);
  const htmlPath = join(dir, `security-report-${ts}.html`);
  return { dir, jsonPath, htmlPath };
}

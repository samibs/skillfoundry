import type { SecurityReport as SemgrepReport } from './semgrep-scanner.js';
import type { GitleaksScanResult } from './gitleaks-scanner.js';
import type { CheckovScanResult } from '../types.js';
import type { LicenseCheckResult } from '../types.js';
import type { CombinedDepReport } from './dependency-scanner.js';
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
/**
 * Normalise an uppercase severity string (CRITICAL / HIGH / MEDIUM / LOW / INFO)
 * to the lowercase unified form.
 *
 * @param raw - Raw severity string from any scanner.
 * @returns UnifiedSeverity.
 */
export declare function normaliseSeverity(raw: string): UnifiedSeverity;
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
export declare function normaliseSemgrepFindings(report: SemgrepReport): UnifiedFinding[];
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
export declare function normaliseGitleaksFindings(result: GitleaksScanResult): UnifiedFinding[];
/**
 * Convert Checkov findings to UnifiedFinding[].
 *
 * Severity: maps Checkov severity directly (already normalised in types).
 * Category: 'iac'
 *
 * @param result - Result from CheckovScanner.scan().
 * @returns Array of normalised findings.
 */
export declare function normaliseCheckovFindings(result: CheckovScanResult): UnifiedFinding[];
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
export declare function normaliseDependencyFindings(report: CombinedDepReport): UnifiedFinding[];
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
export declare function normaliseLicenseFindings(result: LicenseCheckResult): UnifiedFinding[];
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
export declare function computeVerdict(summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
}): UnifiedVerdict;
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
export declare class UnifiedSecurityReportGenerator {
    private readonly projectPath;
    /**
     * @param projectPath - Absolute path to the project root being scanned.
     */
    constructor(projectPath: string);
    /**
     * Aggregate all scanner results into a unified report.
     * Scanner failures are isolated — one failing scanner does not block others.
     *
     * @param results - Partial scanner results object.
     * @returns Fully assembled UnifiedSecurityReport.
     */
    generate(results: ScannerResults): UnifiedSecurityReport;
    /**
     * Write the report as formatted JSON to the given path.
     * Creates parent directories automatically.
     *
     * @param report - UnifiedSecurityReport to serialise.
     * @param outputPath - Absolute path for the output file.
     */
    writeJson(report: UnifiedSecurityReport, outputPath: string): void;
    /**
     * Write the report as a self-contained HTML file to the given path.
     * Creates parent directories automatically.
     *
     * @param report - UnifiedSecurityReport to render.
     * @param outputPath - Absolute path for the output file.
     */
    writeHtml(report: UnifiedSecurityReport, outputPath: string): void;
}
/**
 * Render a UnifiedSecurityReport as a self-contained HTML document.
 * No external CSS or JS dependencies. Dark mode by default with a light mode toggle.
 *
 * @param report - The report to render.
 * @returns Complete HTML string.
 */
export declare function renderSecurityReportHtml(report: UnifiedSecurityReport): string;
/**
 * Create a UnifiedSecurityReportGenerator for the given project root.
 *
 * @param projectPath - Absolute path to the project.
 * @returns A ready-to-use generator instance.
 */
export declare function createUnifiedReportGenerator(projectPath: string): UnifiedSecurityReportGenerator;
/**
 * Generate default output paths for a security report based on a timestamp.
 * Creates the directory if it does not exist.
 *
 * @param projectPath - Absolute path to the project root.
 * @param timestamp - ISO string or compact timestamp used in the filename.
 * @returns Object with jsonPath and htmlPath.
 */
export declare function getDefaultReportPaths(projectPath: string, timestamp?: string): {
    dir: string;
    jsonPath: string;
    htmlPath: string;
};

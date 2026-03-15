export type DepFindingSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';
export interface DependencyFinding {
    name: string;
    version: string;
    severity: DepFindingSeverity;
    cve: string;
    title: string;
    advisory_url: string;
    package_manager: string;
}
export interface DependencyScanReport {
    package_manager: string;
    total_dependencies: number;
    vulnerable_count: number;
    findings: DependencyFinding[];
    scanner_available: boolean;
    error: string | null;
}
export interface CombinedDepReport {
    reports: DependencyScanReport[];
    total_vulnerable: number;
    summary: {
        critical: number;
        high: number;
        moderate: number;
        low: number;
    };
    verdict: 'PASS' | 'WARN' | 'FAIL';
}
interface DetectedPlatform {
    npm: boolean;
    python: boolean;
    dotnet: boolean;
    rust: boolean;
    go: boolean;
}
export declare function detectPlatforms(workDir: string): DetectedPlatform;
/**
 * Scan npm dependencies using `npm audit --json`.
 */
export declare function scanNpm(workDir: string): DependencyScanReport;
/**
 * Scan Python dependencies using `pip-audit --format json`.
 */
export declare function scanPython(workDir: string): DependencyScanReport;
/**
 * Scan .NET dependencies using `dotnet list package --vulnerable --format json`.
 */
export declare function scanDotnet(workDir: string): DependencyScanReport;
/**
 * Run dependency scans for all detected platforms in the project.
 * Returns a combined report with merged findings and verdict.
 */
export declare function runDependencyScan(workDir: string): CombinedDepReport;
/**
 * Format dependency scan report for CLI output.
 */
export declare function formatDepReport(report: CombinedDepReport): string;
export {};

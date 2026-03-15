export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export interface SecurityFinding {
    id: string;
    severity: FindingSeverity;
    category: string;
    rule: string;
    message: string;
    file: string;
    line: number;
    column: number;
    snippet: string;
    fix: string | null;
    source: 'semgrep' | 'regex';
}
export interface SecurityReport {
    scannerVersion: string;
    scanDurationMs: number;
    target: string;
    findings: SecurityFinding[];
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
    owaspCoverage: string[];
    verdict: 'PASS' | 'WARN' | 'FAIL';
}
interface SemgrepResult {
    results?: SemgrepMatch[];
    errors?: SemgrepError[];
    version?: string;
}
interface SemgrepMatch {
    check_id: string;
    path: string;
    start: {
        line: number;
        col: number;
    };
    end: {
        line: number;
        col: number;
    };
    extra: {
        message: string;
        severity: string;
        metadata?: {
            owasp?: string[];
            cwe?: string[];
            category?: string;
            confidence?: string;
            fix?: string;
            fix_regex?: unknown;
        };
        lines?: string;
        fix?: string;
    };
}
interface SemgrepError {
    message: string;
    level: string;
}
/**
 * Detect if Semgrep CLI is installed and return its version.
 * Returns null if not installed. Caches the result.
 */
export declare function detectSemgrep(): string | null;
/** Reset the detection cache (useful for testing). */
export declare function resetDetectionCache(): void;
/**
 * Map Semgrep severity to our normalized severity.
 * Semgrep uses: ERROR, WARNING, INFO
 */
export declare function mapSeverity(semgrepSeverity: string, confidence?: string): FindingSeverity;
/**
 * Extract OWASP category from Semgrep match metadata.
 */
export declare function extractOwaspCategory(match: SemgrepMatch): string;
export interface ScanOptions {
    target: string;
    timeout?: number;
    includeCustomRules?: boolean;
    extraConfigs?: string[];
}
/**
 * Run Semgrep scan against a target directory.
 * Returns parsed results or null if Semgrep is not available.
 */
export declare function runSemgrepScan(options: ScanOptions): SemgrepResult | null;
/**
 * Parse Semgrep JSON output into our internal format.
 */
export declare function parseSemgrepOutput(jsonOutput: string): SemgrepResult;
/**
 * Convert a Semgrep match to our SecurityFinding format.
 */
export declare function convertMatch(match: SemgrepMatch, workDir: string): SecurityFinding;
/**
 * Run regex-based fallback scan for secret patterns.
 * Used when Semgrep is not installed.
 */
export declare function runRegexScan(target: string): SecurityFinding[];
/**
 * Generate a complete security report from scan results.
 */
export declare function generateSecurityReport(findings: SecurityFinding[], target: string, scanDurationMs: number, scannerVersion: string): SecurityReport;
/**
 * Run a complete security scan: Semgrep if available, regex fallback otherwise.
 * This is the main entry point used by T4 gate and /security audit.
 */
export declare function runSecurityScan(target: string, timeout?: number): SecurityReport;
/**
 * Format a security report as a readable string for CLI output.
 */
export declare function formatSecurityReport(report: SecurityReport): string;
/**
 * Get platform-specific Semgrep install instructions.
 */
export declare function getSemgrepInstallInstructions(): string;
export {};

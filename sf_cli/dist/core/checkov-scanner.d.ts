import type { CheckovFinding, CheckovScanResult } from '../types.js';
/** Options controlling a Checkov scan. All fields are optional. */
export interface CheckovOptions {
    /** Directory to scan. Defaults to process.cwd(). */
    targetPath: string;
    /** IaC frameworks to include. Default: ['dockerfile', 'terraform', 'cloudformation', 'kubernetes', 'arm']. */
    frameworks: string[];
    /** Output format for parsing. Default: 'json'. */
    outputFormat: 'json';
    /** Check IDs to skip, e.g. ['CKV_DOCKER_3']. */
    skipChecks?: string[];
    /** When true, omit passing checks from output. */
    compact: boolean;
}
export type { CheckovScanResult, CheckovFinding };
interface CheckovRawCheck {
    check_id?: string;
    check_name?: string;
    check_result?: {
        result?: string;
        evaluated_keys?: string[];
    };
    resource?: string;
    file_path?: string;
    file_line_range?: [number, number];
    repo_file_path?: string;
    file_abs_path?: string;
    severity?: string | null;
    guideline?: string;
    check_type?: string;
}
/**
 * Map Checkov severity strings to our normalised severity levels.
 *
 * Checkov uses: CRITICAL, HIGH, MEDIUM, LOW, NONE, or null.
 * When not set, defaults to 'medium' as a conservative fallback.
 *
 * @param raw - Raw severity string from Checkov output.
 * @returns Normalised severity.
 */
export declare function mapCheckovSeverity(raw: string | null | undefined): CheckovFinding['severity'];
/**
 * Recursively walk a directory and collect IaC files with their detected frameworks.
 *
 * @param dir - Directory to walk.
 * @param maxDepth - Maximum recursion depth to prevent runaway traversal.
 * @returns Array of objects with the file path and its detected framework.
 */
export declare function detectIaCFiles(dir: string, maxDepth?: number): Array<{
    path: string;
    framework: string;
}>;
/**
 * Parse a single Checkov failed/skipped check entry into a CheckovFinding.
 *
 * @param check - Raw check object from Checkov JSON output.
 * @param status - Whether this check failed, passed, or was skipped.
 * @param targetPath - Root directory of the scan for relativising file paths.
 * @returns Parsed CheckovFinding.
 */
export declare function parseCheckovCheck(check: CheckovRawCheck, status: CheckovFinding['status'], targetPath: string): CheckovFinding;
/**
 * Parse Checkov JSON output (single scan result block or array of blocks).
 *
 * Checkov may return a single JSON object or a JSON array when multiple
 * frameworks are scanned together (--framework is comma-separated in v3).
 *
 * @param jsonOutput - Raw JSON string from Checkov stdout/file.
 * @param targetPath - Root directory for relativising file paths.
 * @param includePassedChecks - When true, also parse passed_checks.
 * @returns Parsed CheckovFinding[].
 */
export declare function parseCheckovOutput(jsonOutput: string, targetPath: string, includePassedChecks?: boolean): {
    findings: CheckovFinding[];
    passedCount: number;
    scannedFiles: number;
};
/**
 * Locate the Checkov binary by checking PATH and common installation directories.
 *
 * @returns Absolute path to the Checkov binary, or null when not found.
 */
export declare function findCheckovBinary(): string | null;
/**
 * Wrapper around the Checkov CLI for Infrastructure-as-Code scanning.
 *
 * Usage:
 * ```typescript
 * const scanner = new CheckovScanner('/path/to/project');
 * const result = await scanner.scan();
 * if (result.skipped) { ... }
 * if (result.findings.length > 0) { ... }
 * ```
 */
export declare class CheckovScanner {
    private readonly projectRoot;
    /**
     * @param projectRoot - Absolute path to the project root directory.
     */
    constructor(projectRoot: string);
    /**
     * Check whether Checkov is installed and reachable on PATH.
     *
     * @returns true when a usable Checkov binary was found.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Run a Checkov scan on the target directory.
     *
     * - When Checkov is not installed, returns a skipped result (gate passes with warning).
     * - When no IaC files are detected, returns success with zero findings.
     * - Cleans up the temporary output directory on completion.
     *
     * @param options - Partial scan options. targetPath defaults to the project root.
     * @returns CheckovScanResult with findings and metadata.
     */
    scan(options?: Partial<CheckovOptions>): Promise<CheckovScanResult>;
    /**
     * Build the argument array for execFileSync.
     * All values are passed as separate array elements (no shell interpolation).
     */
    private buildArgs;
}
/**
 * Create a CheckovScanner for the given project root.
 *
 * @param projectRoot - Absolute path to the project to scan.
 * @returns A ready-to-use CheckovScanner instance.
 */
export declare function createCheckovScanner(projectRoot: string): CheckovScanner;
/**
 * Return platform-appropriate Checkov install instructions.
 */
export declare function getCheckovInstallInstructions(): string;

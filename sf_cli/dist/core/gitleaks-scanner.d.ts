import type { GitleaksFinding } from '../types.js';
/** Options controlling a Gitleaks scan. All fields are optional. */
export interface GitleaksOptions {
    /** Directory to scan. Defaults to process.cwd(). */
    targetPath: string;
    /** Custom .gitleaks.toml config path. When omitted, Gitleaks uses its default config. */
    configPath?: string;
    /** Report format — always JSON for machine-readable parsing. */
    reportFormat: 'json';
    /** When true, only staged files are scanned (pre-commit mode). */
    staged: boolean;
    /** When true, include per-finding detail in log output. */
    verbose: boolean;
}
/** Result returned by every scan call. */
export interface GitleaksScanResult {
    /** Discriminator for the scanner type. */
    scanner: 'gitleaks';
    /** True when the Gitleaks binary was located on the system. */
    available: boolean;
    /** True when the scan executed (findings may still be empty). False when the scan itself crashed. */
    success: boolean;
    /** Parsed, redacted findings. Empty array when scan is clean or skipped. */
    findings: GitleaksFinding[];
    /** Convenience alias for findings.length. */
    findingCount: number;
    /** Wall-clock duration of the scan in milliseconds. */
    duration: number;
    /** True when the scan was intentionally skipped (binary missing). */
    skipped: boolean;
    /** Human-readable reason for skipping, when applicable. */
    skipReason?: string;
}
interface GitleaksRawFinding {
    Description?: string;
    File?: string;
    StartLine?: number;
    EndLine?: number;
    StartColumn?: number;
    EndColumn?: number;
    Match?: string;
    Secret?: string;
    RuleID?: string;
    Entropy?: number;
    Fingerprint?: string;
    description?: string;
    file?: string;
    startLine?: number;
    endLine?: number;
    startColumn?: number;
    endColumn?: number;
    match?: string;
    secret?: string;
    ruleID?: string;
    entropy?: number;
    fingerprint?: string;
}
/**
 * Redact a secret value for safe display.
 *
 * Rules:
 * - Length >= 10: show first 4 + `****` + last 4 chars  →  `AKIA****3XYZ`
 * - Length  4..9: show first 2 + `****` + last 2 chars  →  `pa****rd`
 * - Length   < 4: replace entirely with `****`
 *
 * @param secret - The raw secret string to redact.
 * @returns A redacted string safe for logs and reports.
 */
export declare function redactSecret(secret: string): string;
/**
 * Parse a Gitleaks version string and return `[major, minor, patch]`.
 * Returns `[0, 0, 0]` when the string cannot be parsed.
 */
export declare function parseGitleaksVersion(versionOutput: string): [number, number, number];
/**
 * Return true when [major, minor, patch] meets the minimum supported version.
 */
export declare function isSupportedVersion(version: [number, number, number]): boolean;
/**
 * Locate the Gitleaks binary by checking PATH and common installation directories.
 * Returns the absolute path to the binary, or null when not found.
 */
export declare function findGitleaksBinary(): string | null;
/**
 * Parse raw Gitleaks JSON output into GitleaksFinding[].
 * Redacts secret values. Marks findings whose fingerprints appear in
 * the suppressedFingerprints set.
 *
 * @param jsonOutput - Raw string from the Gitleaks JSON report file.
 * @param targetPath - Root directory of the scan (for relativising file paths).
 * @param suppressedFingerprints - Set of fingerprints from .gitleaksignore.
 * @returns Array of parsed, redacted findings.
 */
export declare function parseGitleaksOutput(jsonOutput: string, targetPath: string, suppressedFingerprints: Set<string>): GitleaksFinding[];
/**
 * Load suppressed fingerprints from .gitleaksignore in the target directory.
 * Returns an empty set when the file does not exist.
 * Lines starting with `#` are treated as comments and ignored.
 *
 * @param targetPath - Directory containing the .gitleaksignore file.
 * @returns Set of suppressed fingerprint strings.
 */
export declare function loadGitleaksIgnore(targetPath: string): Set<string>;
/**
 * Wrapper around the Gitleaks CLI for secrets scanning.
 *
 * Usage:
 * ```typescript
 * const scanner = new GitleaksScanner(projectRoot);
 * const result = await scanner.scan();
 * if (result.skipped) { ... }
 * if (result.findings.length > 0) { ... }
 * ```
 */
export declare class GitleaksScanner {
    private readonly projectRoot;
    /**
     * @param projectRoot - Absolute path to the project root directory.
     *                      Used as the default scan target and for locating .gitleaksignore.
     */
    constructor(projectRoot: string);
    /**
     * Check whether a supported Gitleaks binary is installed.
     * Verifies the version is >= 8.18.
     *
     * @returns true when a usable Gitleaks binary is available.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Run a full Gitleaks scan on the target directory.
     *
     * - When Gitleaks is not installed, returns a skipped result (gate passes with warning).
     * - When secrets are found, returns findings with redacted match values.
     * - Suppressed fingerprints (from .gitleaksignore) are included in findings but
     *   marked `suppressed: true` and must not cause gate failures.
     *
     * @param options - Partial scan options. targetPath defaults to the project root.
     * @returns GitleaksScanResult with findings and metadata.
     */
    scan(options?: Partial<GitleaksOptions>): Promise<GitleaksScanResult>;
    /**
     * Scan only staged files (for pre-commit hook usage).
     * Equivalent to calling `scan({ staged: true })`.
     *
     * @returns GitleaksScanResult for staged files only.
     */
    scanStaged(): Promise<GitleaksScanResult>;
    /**
     * Build the argument array for execFileSync.
     * All values are passed as separate array elements (no shell interpolation).
     */
    private buildArgs;
    /**
     * Read and parse the Gitleaks JSON report from disk.
     * Returns an empty array when the report file does not exist or is empty.
     */
    private readAndParseReport;
}
/**
 * Create a GitleaksScanner for the given project root.
 * This is the recommended entry point for gate integration.
 *
 * @param projectRoot - Absolute path to the project to scan.
 * @returns A ready-to-use GitleaksScanner instance.
 */
export declare function createGitleaksScanner(projectRoot: string): GitleaksScanner;
/**
 * Return platform-appropriate Gitleaks install instructions.
 */
export declare function getGitleaksInstallInstructions(): string;
/**
 * Write a JSON array to a file path — used in tests to simulate Gitleaks output.
 * This function exists solely to support unit testing without running the binary.
 *
 * @param path - Absolute path to write the JSON report to.
 * @param findings - Array of raw Gitleaks finding objects.
 */
export declare function _writeTestReport(path: string, findings: GitleaksRawFinding[]): void;
export {};

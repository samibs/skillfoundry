import type { LicenseFinding, LicenseCheckResult } from '../types.js';
/** Options controlling a license compliance check. All fields are optional. */
export interface LicenseCheckOptions {
    /** Directory to scan. Defaults to process.cwd(). */
    targetPath: string;
    /** Project type — determines which licenses are flagged. Default: 'commercial'. */
    projectType: 'commercial' | 'open-source';
    /** SPDX identifiers to flag. Defaults to COPYLEFT_LICENSES + RESTRICTED_FOR_COMMERCIAL. */
    flagLicenses: string[];
    /**
     * Explicit allowlist — packages listed here are never flagged,
     * even if their license is on the flagLicenses list.
     */
    allowLicenses: string[];
}
export type { LicenseCheckResult, LicenseFinding };
/**
 * Strong copyleft licenses — generally incompatible with commercial proprietary use.
 */
export declare const COPYLEFT_LICENSES: Set<string>;
/**
 * Licenses that are restricted specifically for commercial/proprietary projects.
 * Flagged as HIGH severity.
 */
export declare const RESTRICTED_FOR_COMMERCIAL: Set<string>;
/**
 * Permissive licenses — always safe for commercial use.
 */
export declare const PERMISSIVE_LICENSES: Set<string>;
/**
 * Detect the project type from .sfrc, sf.config.json, or .skillfoundry/config.toml.
 * Defaults to 'commercial' when not configured (safer — flags more).
 *
 * @param targetPath - Root of the project.
 * @returns Detected project type.
 */
export declare function detectProjectType(targetPath: string): 'commercial' | 'open-source';
/**
 * Normalise a license string to a canonical SPDX identifier.
 * Handles common non-SPDX representations.
 *
 * @param raw - Raw license string from a manifest.
 * @returns Normalised SPDX identifier, or the input trimmed if no mapping found.
 */
export declare function normaliseLicense(raw: string | undefined | null): string;
/**
 * Determine whether a package should be flagged given the project type.
 *
 * @param normalised - Normalised SPDX license identifier.
 * @param projectType - Commercial or open-source project.
 * @param flagLicenses - Additional licenses to flag (from options).
 * @param allowLicenses - Licenses explicitly allowed (override flag list).
 * @returns Finding severity, or null when no finding.
 */
export declare function evaluateLicense(normalised: string, projectType: 'commercial' | 'open-source', flagLicenses: string[], allowLicenses: string[]): {
    severity: LicenseFinding['severity'];
    reason: string;
} | null;
/**
 * Parse package.json dependencies and check license fields from node_modules.
 *
 * Strategy (local-only, no network):
 * 1. Read dependencies + devDependencies from package.json.
 * 2. For each package, read node_modules/<pkg>/package.json for the license field.
 * 3. Fallback to package-lock.json metadata when node_modules is absent.
 *
 * @param targetPath - Root of the project.
 * @param manifestPath - Absolute path to the package.json file.
 * @returns Array of packages with their resolved licenses.
 */
export declare function scanNpmLicenses(targetPath: string, manifestPath: string): Array<{
    name: string;
    version: string;
    license: string;
    source: string;
}>;
/**
 * Parse a Python requirements.txt and return package names with placeholder versions.
 * License information is obtained from local dist-info/egg-info when available.
 *
 * @param targetPath - Root of the project.
 * @param manifestPath - Absolute path to requirements.txt.
 * @returns Array of packages with their resolved licenses.
 */
export declare function scanPipLicenses(targetPath: string, manifestPath: string): Array<{
    name: string;
    version: string;
    license: string;
    source: string;
}>;
/**
 * Parse a Cargo.toml and return package licenses from the [package] section.
 * Also reads Cargo.lock for transitive dependency license info where available.
 *
 * @param _targetPath - Root of the project (unused, kept for API consistency).
 * @param manifestPath - Absolute path to Cargo.toml.
 * @returns Array of packages with their resolved licenses.
 */
export declare function scanCargoLicenses(_targetPath: string, manifestPath: string): Array<{
    name: string;
    version: string;
    license: string;
    source: string;
}>;
/**
 * Parse go.mod and return required module names with placeholder licenses.
 * License information for Go modules is not embedded in go.mod/go.sum —
 * we flag all as UNKNOWN for manual review since there is no local metadata.
 *
 * @param _targetPath - Root of the project.
 * @param manifestPath - Absolute path to go.mod.
 * @returns Array of packages with UNKNOWN licenses (manual review needed).
 */
export declare function scanGoLicenses(_targetPath: string, manifestPath: string): Array<{
    name: string;
    version: string;
    license: string;
    source: string;
}>;
/**
 * Parse a .NET .csproj file and return NuGet package references.
 * License information for NuGet packages is not embedded in .csproj —
 * flag all as UNKNOWN for manual review.
 *
 * @param _targetPath - Root of the project.
 * @param manifestPath - Absolute path to the .csproj file.
 * @returns Array of packages with UNKNOWN licenses.
 */
export declare function scanDotnetLicenses(_targetPath: string, manifestPath: string): Array<{
    name: string;
    version: string;
    license: string;
    source: string;
}>;
/**
 * Discover all dependency manifest files in the target directory.
 *
 * @param targetPath - Root of the project.
 * @returns Array of discovered manifest file paths.
 */
export declare function discoverManifests(targetPath: string): string[];
/**
 * License compliance scanner for SkillFoundry projects.
 *
 * Scans all detected dependency manifests and flags copyleft or
 * unknown licenses based on the project's commercial/open-source type.
 *
 * Usage:
 * ```typescript
 * const checker = new LicenseChecker('/path/to/project');
 * const result = await checker.check();
 * if (result.findings.length > 0) { ... }
 * ```
 */
export declare class LicenseChecker {
    private readonly projectRoot;
    /**
     * @param projectRoot - Absolute path to the project root directory.
     */
    constructor(projectRoot: string);
    /**
     * Run license compliance checking against the project.
     *
     * @param options - Partial check options. targetPath defaults to the project root.
     * @returns LicenseCheckResult with all findings.
     */
    check(options?: Partial<LicenseCheckOptions>): Promise<LicenseCheckResult>;
}
/**
 * Create a LicenseChecker for the given project root.
 *
 * @param projectRoot - Absolute path to the project to check.
 * @returns A ready-to-use LicenseChecker instance.
 */
export declare function createLicenseChecker(projectRoot: string): LicenseChecker;

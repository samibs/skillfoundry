// License Compliance Checker (STORY-010)
// Reads dependency manifests and flags copyleft/incompatible licenses
// in projects marked as commercial. Checks npm, pip, Cargo, Go, and .NET.

import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, normalize, isAbsolute } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { LicenseFinding, LicenseCheckResult } from '../types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

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

// Re-export result types for convenience
export type { LicenseCheckResult, LicenseFinding };

// ---------------------------------------------------------------------------
// SPDX license classification
// ---------------------------------------------------------------------------

/**
 * Strong copyleft licenses — generally incompatible with commercial proprietary use.
 */
export const COPYLEFT_LICENSES = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-2.0+',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'GPL-3.0+',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'AGPL-3.0+',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-2.1+',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'LGPL-3.0+',
  'MPL-2.0',       // Weak copyleft
  'EUPL-1.1',
  'EUPL-1.2',
  'CDDL-1.0',
  'SSPL-1.0',
  'BUSL-1.1',
]);

/**
 * Licenses that are restricted specifically for commercial/proprietary projects.
 * Flagged as HIGH severity.
 */
export const RESTRICTED_FOR_COMMERCIAL = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-2.0+',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'GPL-3.0+',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'AGPL-3.0+',
  'SSPL-1.0',
  'BUSL-1.1',
]);

/**
 * Permissive licenses — always safe for commercial use.
 */
export const PERMISSIVE_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'Apache 2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'Unlicense',
  'WTFPL',
  'Artistic-2.0',
  'Zlib',
  'PSF-2.0',
  'Python-2.0',
  '0BSD',
  'BlueOak-1.0.0',
]);

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * Validate that a path is absolute and normalised, without traversal sequences.
 *
 * @param label - Label for error messages.
 * @param p - Path to validate.
 * @returns Normalised absolute path.
 */
function validatePath(label: string, p: string): string {
  if (!p || typeof p !== 'string') {
    throw new TypeError(`${label}: path must be a non-empty string`);
  }
  const normalised = normalize(p);
  if (!isAbsolute(normalised)) {
    throw new TypeError(`${label}: path must be absolute — got "${normalised}"`);
  }
  if (normalised.includes('..')) {
    throw new TypeError(`${label}: path must not contain traversal sequences — got "${normalised}"`);
  }
  return normalised;
}

// ---------------------------------------------------------------------------
// Config / project-type detection
// ---------------------------------------------------------------------------

/**
 * Detect the project type from .sfrc, sf.config.json, or .skillfoundry/config.toml.
 * Defaults to 'commercial' when not configured (safer — flags more).
 *
 * @param targetPath - Root of the project.
 * @returns Detected project type.
 */
export function detectProjectType(targetPath: string): 'commercial' | 'open-source' {
  // 1. Check .sfrc (JSON format)
  const sfrc = join(targetPath, '.sfrc');
  if (existsSync(sfrc)) {
    try {
      const content = readFileSync(sfrc, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed.projectType === 'open-source') return 'open-source';
      if (parsed.projectType === 'commercial') return 'commercial';
    } catch {
      // Ignore malformed .sfrc
    }
  }

  // 2. Check sf.config.json
  const sfConfig = join(targetPath, 'sf.config.json');
  if (existsSync(sfConfig)) {
    try {
      const content = readFileSync(sfConfig, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed.projectType === 'open-source') return 'open-source';
      if (parsed.projectType === 'commercial') return 'commercial';
    } catch {
      // Ignore malformed sf.config.json
    }
  }

  // 3. Check .skillfoundry/config.toml for license_policy = "commercial" | "open-source"
  const sfToml = join(targetPath, '.skillfoundry', 'config.toml');
  if (existsSync(sfToml)) {
    try {
      const content = readFileSync(sfToml, 'utf-8');
      const policyMatch = content.match(/license_policy\s*=\s*["']([^"']+)["']/);
      if (policyMatch) {
        const policy = policyMatch[1].trim().toLowerCase();
        if (policy === 'open-source' || policy === 'opensource') return 'open-source';
        if (policy === 'commercial') return 'commercial';
      }
    } catch {
      // Ignore malformed config.toml
    }
  }

  // Default: commercial (safer)
  return 'commercial';
}

// ---------------------------------------------------------------------------
// License normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a license string to a canonical SPDX identifier.
 * Handles common non-SPDX representations.
 *
 * @param raw - Raw license string from a manifest.
 * @returns Normalised SPDX identifier, or the input trimmed if no mapping found.
 */
export function normaliseLicense(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return 'UNKNOWN';
  const trimmed = raw.trim();
  if (!trimmed) return 'UNKNOWN';

  // Handle SPDX expression with AND/OR — take the first license
  const splitFirst = trimmed.split(/\s+(?:AND|OR|and|or)\s+/)[0].trim();
  // Keep both the parens-included and parens-stripped forms for lookup
  const firstTermWithParens = splitFirst;
  const firstTermNoParens = splitFirst.replace(/[()]/g, '').trim();

  const mapping: Record<string, string> = {
    'Apache License 2.0': 'Apache-2.0',
    'Apache License, Version 2.0': 'Apache-2.0',
    'Apache 2.0': 'Apache-2.0',
    'Apache-2': 'Apache-2.0',
    'The MIT License': 'MIT',
    'MIT License': 'MIT',
    'MIT license': 'MIT',
    'BSD': 'BSD-2-Clause',
    'BSD License': 'BSD-3-Clause',
    'New BSD License': 'BSD-3-Clause',
    'Simplified BSD License': 'BSD-2-Clause',
    'GNU General Public License v2 (GPLv2)': 'GPL-2.0',
    'GNU General Public License v2 or later (GPLv2+)': 'GPL-2.0-or-later',
    'GNU General Public License v3 (GPLv3)': 'GPL-3.0',
    'GNU General Public License v3 or later (GPLv3+)': 'GPL-3.0-or-later',
    'GNU Lesser General Public License v2 (LGPLv2)': 'LGPL-2.1',
    'GNU Lesser General Public License v2 or later (LGPLv2+)': 'LGPL-2.1-or-later',
    'GNU Lesser General Public License v3 (LGPLv3)': 'LGPL-3.0',
    'GNU Affero General Public License v3 (AGPLv3)': 'AGPL-3.0',
    'AGPL': 'AGPL-3.0',
    'GPL': 'GPL-3.0',
    'LGPL': 'LGPL-3.0',
    'Mozilla Public License 2.0 (MPL 2.0)': 'MPL-2.0',
    'ISC License (ISCL)': 'ISC',
    'Python Software Foundation License': 'PSF-2.0',
    'Public Domain': 'Unlicense',
    'CC0': 'CC0-1.0',
  };

  // Try exact match with parens first, then without parens
  return mapping[firstTermWithParens] ?? mapping[firstTermNoParens] ?? firstTermWithParens;
}

// ---------------------------------------------------------------------------
// License evaluation
// ---------------------------------------------------------------------------

/**
 * Determine whether a package should be flagged given the project type.
 *
 * @param normalised - Normalised SPDX license identifier.
 * @param projectType - Commercial or open-source project.
 * @param flagLicenses - Additional licenses to flag (from options).
 * @param allowLicenses - Licenses explicitly allowed (override flag list).
 * @returns Finding severity, or null when no finding.
 */
export function evaluateLicense(
  normalised: string,
  projectType: 'commercial' | 'open-source',
  flagLicenses: string[],
  allowLicenses: string[],
): { severity: LicenseFinding['severity']; reason: string } | null {
  // Unknown license — always flag as medium
  if (normalised === 'UNKNOWN') {
    return {
      severity: 'medium',
      reason: 'Unknown or unrecognized license — manual review required',
    };
  }

  // Explicit allowlist overrides everything
  if (allowLicenses.includes(normalised)) return null;

  // Permissive licenses are always safe
  if (PERMISSIVE_LICENSES.has(normalised)) return null;

  // Open-source projects: only flag AGPL
  if (projectType === 'open-source') {
    if (
      normalised.startsWith('AGPL') &&
      !normalised.startsWith('LGPL')
    ) {
      return {
        severity: 'medium',
        reason: `${normalised} requires all network-facing modifications to be open-sourced (AGPL copyleft)`,
      };
    }
    return null;
  }

  // Commercial projects: flag GPL family and custom flagged licenses
  if (RESTRICTED_FOR_COMMERCIAL.has(normalised) || flagLicenses.includes(normalised)) {
    return {
      severity: 'high',
      reason: `${normalised} is a copyleft license incompatible with commercial proprietary use`,
    };
  }

  // Weak copyleft (LGPL, MPL) in commercial — flag as medium
  if (COPYLEFT_LICENSES.has(normalised)) {
    return {
      severity: 'medium',
      reason: `${normalised} is a copyleft license that may require source disclosure; review terms for commercial use`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// npm manifest scanning
// ---------------------------------------------------------------------------

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
export function scanNpmLicenses(
  targetPath: string,
  manifestPath: string,
): Array<{ name: string; version: string; license: string; source: string }> {
  const packages: Array<{ name: string; version: string; license: string; source: string }> = [];

  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return packages;
  }

  const allDeps: Record<string, string> = {
    ...(pkgJson.dependencies as Record<string, string> ?? {}),
    ...(pkgJson.devDependencies as Record<string, string> ?? {}),
    ...(pkgJson.peerDependencies as Record<string, string> ?? {}),
    ...(pkgJson.optionalDependencies as Record<string, string> ?? {}),
  };

  const nodeModules = join(targetPath, 'node_modules');
  const hasNodeModules = existsSync(nodeModules);

  // Try package-lock.json for version info
  const lockPath = join(targetPath, 'package-lock.json');
  let lockPackages: Record<string, { version?: string; license?: string }> = {};
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as {
        packages?: Record<string, { version?: string; license?: string }>;
        dependencies?: Record<string, { version?: string; license?: string }>;
      };
      // v3 lock format uses `packages` keyed as `node_modules/<name>`
      if (lock.packages) {
        for (const [key, val] of Object.entries(lock.packages)) {
          const name = key.replace(/^node_modules\//, '');
          lockPackages[name] = val;
        }
      } else if (lock.dependencies) {
        lockPackages = lock.dependencies;
      }
    } catch {
      // Ignore malformed lock file
    }
  }

  for (const [name, reqVersion] of Object.entries(allDeps)) {
    // Skip workspace references
    if (typeof reqVersion !== 'string' || reqVersion.startsWith('workspace:')) continue;

    let resolvedVersion = reqVersion.replace(/^[\^~>=<]/, '') || 'unknown';
    let license = 'UNKNOWN';

    // 1. Check node_modules
    if (hasNodeModules) {
      // Handle scoped packages: @scope/name → node_modules/@scope/name
      const pkgPath = join(nodeModules, ...name.split('/'), 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const depPkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
            version?: string;
            license?: string | { type?: string };
            licenses?: Array<{ type?: string }>;
          };
          resolvedVersion = depPkg.version ?? resolvedVersion;

          if (depPkg.license) {
            license = typeof depPkg.license === 'string'
              ? depPkg.license
              : (depPkg.license.type ?? 'UNKNOWN');
          } else if (Array.isArray(depPkg.licenses) && depPkg.licenses.length > 0) {
            license = depPkg.licenses[0].type ?? 'UNKNOWN';
          }
        } catch {
          // Skip unreadable package.json
        }
      }
    }

    // 2. Fallback: package-lock.json
    if (license === 'UNKNOWN' && lockPackages[name]) {
      const lockEntry = lockPackages[name];
      resolvedVersion = lockEntry.version ?? resolvedVersion;
      if (lockEntry.license) {
        license = lockEntry.license;
      }
    }

    packages.push({ name, version: resolvedVersion, license, source: manifestPath });
  }

  return packages;
}

// ---------------------------------------------------------------------------
// requirements.txt scanning
// ---------------------------------------------------------------------------

/**
 * Parse a Python requirements.txt and return package names with placeholder versions.
 * License information is obtained from local dist-info/egg-info when available.
 *
 * @param targetPath - Root of the project.
 * @param manifestPath - Absolute path to requirements.txt.
 * @returns Array of packages with their resolved licenses.
 */
export function scanPipLicenses(
  targetPath: string,
  manifestPath: string,
): Array<{ name: string; version: string; license: string; source: string }> {
  const packages: Array<{ name: string; version: string; license: string; source: string }> = [];

  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch {
    return packages;
  }

  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('-'));

  for (const line of lines) {
    // Parse "package==version" | "package>=version" | "package"
    const match = line.match(/^([A-Za-z0-9._-]+)\s*(?:[=><!~^]=?\s*([^\s,;#]+))?/);
    if (!match) continue;

    const name = match[1];
    const version = match[2] ?? 'unknown';
    let license = 'UNKNOWN';

    // Try to find license from installed dist-info in site-packages
    const sitePackagesDirs = findPythonSitePackages(targetPath);
    for (const siteDir of sitePackagesDirs) {
      // Look for <name>-<version>.dist-info/METADATA or <name>-<version>.egg-info/PKG-INFO
      const safeName = name.replace(/-/g, '_');
      const foundLicense = readPipDistInfoLicense(siteDir, safeName);
      if (foundLicense !== 'UNKNOWN') {
        license = foundLicense;
        break;
      }
    }

    packages.push({ name, version, license, source: manifestPath });
  }

  return packages;
}

/**
 * Find Python site-packages directories relative to the target path.
 * Checks common virtualenv/venv paths.
 *
 * @param targetPath - Root of the project.
 * @returns Array of absolute paths to site-packages directories.
 */
function findPythonSitePackages(targetPath: string): string[] {
  const candidates: string[] = [];
  const venvNames = ['venv', '.venv', 'env', '.env', 'virtualenv'];

  for (const venv of venvNames) {
    const venvPath = join(targetPath, venv);
    if (!existsSync(venvPath)) continue;

    // lib/pythonX.Y/site-packages
    const libPath = join(venvPath, 'lib');
    if (!existsSync(libPath)) continue;

    try {
      const libEntries = readdirSync(libPath, { withFileTypes: true, encoding: 'utf8' }) as Dirent<string>[];
      for (const entry of libEntries) {
        if (entry.isDirectory() && entry.name.startsWith('python')) {
          const sitePkgs = join(libPath, entry.name, 'site-packages');
          if (existsSync(sitePkgs)) {
            candidates.push(sitePkgs);
          }
        }
      }
    } catch {
      // Skip unreadable lib dirs
    }
  }

  return candidates;
}

/**
 * Read the License field from a package's dist-info METADATA file.
 *
 * @param sitePackagesDir - Absolute path to site-packages.
 * @param safeName - Package name with hyphens replaced by underscores.
 * @returns License string, or 'UNKNOWN' when not found.
 */
function readPipDistInfoLicense(sitePackagesDir: string, safeName: string): string {
  try {
    const entries = readdirSync(sitePackagesDir, { withFileTypes: true, encoding: 'utf8' }) as Dirent<string>[];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      const nameMatch = lower.startsWith(safeName.toLowerCase() + '-');
      if (!nameMatch) continue;

      // .dist-info/METADATA
      if (entry.name.endsWith('.dist-info')) {
        const metaPath = join(sitePackagesDir, entry.name, 'METADATA');
        if (existsSync(metaPath)) {
          const meta = readFileSync(metaPath, 'utf-8');
          const licenseMatch = meta.match(/^License(?:-Expression)?:\s*(.+)$/m);
          if (licenseMatch) return licenseMatch[1].trim();
        }
      }

      // .egg-info/PKG-INFO
      if (entry.name.endsWith('.egg-info')) {
        const pkgInfo = join(sitePackagesDir, entry.name, 'PKG-INFO');
        if (existsSync(pkgInfo)) {
          const info = readFileSync(pkgInfo, 'utf-8');
          const licenseMatch = info.match(/^License:\s*(.+)$/m);
          if (licenseMatch) return licenseMatch[1].trim();
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Cargo.toml scanning
// ---------------------------------------------------------------------------

/**
 * Parse a Cargo.toml and return package licenses from the [package] section.
 * Also reads Cargo.lock for transitive dependency license info where available.
 *
 * @param _targetPath - Root of the project (unused, kept for API consistency).
 * @param manifestPath - Absolute path to Cargo.toml.
 * @returns Array of packages with their resolved licenses.
 */
export function scanCargoLicenses(
  _targetPath: string,
  manifestPath: string,
): Array<{ name: string; version: string; license: string; source: string }> {
  const packages: Array<{ name: string; version: string; license: string; source: string }> = [];

  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch {
    return packages;
  }

  // Extract [package] section
  const packageSection = content.match(/\[package\]([\s\S]*?)(?=\[|\s*$)/);
  if (!packageSection) return packages;

  const nameMatch = packageSection[1].match(/name\s*=\s*["']([^"']+)["']/);
  const versionMatch = packageSection[1].match(/version\s*=\s*["']([^"']+)["']/);
  const licenseMatch = packageSection[1].match(/license\s*=\s*["']([^"']+)["']/);

  if (nameMatch) {
    packages.push({
      name: nameMatch[1],
      version: versionMatch?.[1] ?? 'unknown',
      license: licenseMatch?.[1] ?? 'UNKNOWN',
      source: manifestPath,
    });
  }

  // Read Cargo.lock for transitive dependencies
  const lockPath = join(manifestPath, '..', 'Cargo.lock');
  if (existsSync(lockPath)) {
    try {
      const lockContent = readFileSync(lockPath, 'utf-8');
      // Parse [[package]] sections from Cargo.lock TOML
      const pkgBlocks = lockContent.split(/\n\[\[package\]\]/);
      for (const block of pkgBlocks.slice(1)) {
        const bName = block.match(/name\s*=\s*["']([^"']+)["']/)?.[1];
        const bVersion = block.match(/version\s*=\s*["']([^"']+)["']/)?.[1];
        const bLicense = block.match(/license\s*=\s*["']([^"']+)["']/)?.[1];

        if (bName) {
          packages.push({
            name: bName,
            version: bVersion ?? 'unknown',
            license: bLicense ?? 'UNKNOWN',
            source: lockPath,
          });
        }
      }
    } catch {
      // Ignore malformed Cargo.lock
    }
  }

  return packages;
}

// ---------------------------------------------------------------------------
// go.mod scanning
// ---------------------------------------------------------------------------

/**
 * Parse go.mod and return required module names with placeholder licenses.
 * License information for Go modules is not embedded in go.mod/go.sum —
 * we flag all as UNKNOWN for manual review since there is no local metadata.
 *
 * @param _targetPath - Root of the project.
 * @param manifestPath - Absolute path to go.mod.
 * @returns Array of packages with UNKNOWN licenses (manual review needed).
 */
export function scanGoLicenses(
  _targetPath: string,
  manifestPath: string,
): Array<{ name: string; version: string; license: string; source: string }> {
  const packages: Array<{ name: string; version: string; license: string; source: string }> = [];

  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch {
    return packages;
  }

  // Match lines in the `require` block: <module> <version> [// indirect]
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/g) ?? [];
  const singleRequires = Array.from(content.matchAll(/^require\s+(\S+)\s+(\S+)/gm));

  for (const block of requireBlock) {
    const lines = block.split('\n').slice(1, -1);
    for (const line of lines) {
      const trimmed = line.replace(/\/\/.*$/, '').trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        packages.push({
          name: parts[0],
          version: parts[1],
          license: 'UNKNOWN', // Go module licenses require remote lookup
          source: manifestPath,
        });
      }
    }
  }

  for (const m of singleRequires) {
    packages.push({
      name: m[1],
      version: m[2],
      license: 'UNKNOWN',
      source: manifestPath,
    });
  }

  return packages;
}

// ---------------------------------------------------------------------------
// .csproj scanning
// ---------------------------------------------------------------------------

/**
 * Parse a .NET .csproj file and return NuGet package references.
 * License information for NuGet packages is not embedded in .csproj —
 * flag all as UNKNOWN for manual review.
 *
 * @param _targetPath - Root of the project.
 * @param manifestPath - Absolute path to the .csproj file.
 * @returns Array of packages with UNKNOWN licenses.
 */
export function scanDotnetLicenses(
  _targetPath: string,
  manifestPath: string,
): Array<{ name: string; version: string; license: string; source: string }> {
  const packages: Array<{ name: string; version: string; license: string; source: string }> = [];

  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch {
    return packages;
  }

  // Match <PackageReference Include="..." Version="..." />
  const matches = content.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g);
  for (const m of matches) {
    packages.push({
      name: m[1],
      version: m[2],
      license: 'UNKNOWN',
      source: manifestPath,
    });
  }

  // Also match <PackageReference Include="..." Version="..."> (separate closing tag)
  const multiLineMatches = content.matchAll(/<PackageReference\s+Include="([^"]+)"\s*>\s*<Version>([^<]+)<\/Version>/g);
  for (const m of multiLineMatches) {
    packages.push({
      name: m[1],
      version: m[2],
      license: 'UNKNOWN',
      source: manifestPath,
    });
  }

  return packages;
}

// ---------------------------------------------------------------------------
// Manifest discovery
// ---------------------------------------------------------------------------

/**
 * Discover all dependency manifest files in the target directory.
 *
 * @param targetPath - Root of the project.
 * @returns Array of discovered manifest file paths.
 */
export function discoverManifests(targetPath: string): string[] {
  const manifests: string[] = [];
  const excludeDirs = new Set([
    'node_modules', 'dist', '.git', 'coverage', '__pycache__',
    '.next', '.nuxt', '.cache', 'vendor', 'target',
  ]);

  function walk(dir: string, depth: number): void {
    if (depth > 4) return;
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' }) as Dirent<string>[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name)) {
          walk(join(dir, entry.name), depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const name = entry.name;
      if (
        name === 'package.json' ||
        name === 'requirements.txt' ||
        name === 'Cargo.toml' ||
        name === 'go.mod' ||
        name.endsWith('.csproj')
      ) {
        manifests.push(join(dir, name));
      }
    }
  }

  walk(targetPath, 0);
  return manifests;
}

// ---------------------------------------------------------------------------
// LicenseChecker class
// ---------------------------------------------------------------------------

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
export class LicenseChecker {
  private readonly projectRoot: string;

  /**
   * @param projectRoot - Absolute path to the project root directory.
   */
  constructor(projectRoot: string) {
    this.projectRoot = validatePath('projectRoot', projectRoot);
  }

  /**
   * Run license compliance checking against the project.
   *
   * @param options - Partial check options. targetPath defaults to the project root.
   * @returns LicenseCheckResult with all findings.
   */
  async check(options: Partial<LicenseCheckOptions> = {}): Promise<LicenseCheckResult> {
    const start = Date.now();
    const log = getLogger();

    const targetPath = options.targetPath
      ? validatePath('targetPath', options.targetPath)
      : this.projectRoot;

    const projectType = options.projectType ?? detectProjectType(targetPath);
    const flagLicenses = options.flagLicenses ?? [];
    const allowLicenses = options.allowLicenses ?? [];

    log.info('license', 'check_start', { targetPath, projectType });

    const manifests = discoverManifests(targetPath);
    const findings: LicenseFinding[] = [];
    let checkedPackages = 0;

    for (const manifestPath of manifests) {
      const name = manifestPath.split('/').pop() ?? '';
      let packages: Array<{ name: string; version: string; license: string; source: string }> = [];

      if (name === 'package.json') {
        packages = scanNpmLicenses(targetPath, manifestPath);
      } else if (name === 'requirements.txt') {
        packages = scanPipLicenses(targetPath, manifestPath);
      } else if (name === 'Cargo.toml') {
        packages = scanCargoLicenses(targetPath, manifestPath);
      } else if (name === 'go.mod') {
        packages = scanGoLicenses(targetPath, manifestPath);
      } else if (name.endsWith('.csproj')) {
        packages = scanDotnetLicenses(targetPath, manifestPath);
      }

      checkedPackages += packages.length;

      for (const pkg of packages) {
        const normalised = normaliseLicense(pkg.license);
        const result = evaluateLicense(normalised, projectType, flagLicenses, allowLicenses);
        if (result) {
          findings.push({
            package: pkg.name,
            version: pkg.version,
            license: normalised,
            source: pkg.source,
            severity: result.severity,
            reason: result.reason,
          });
        }
      }
    }

    const duration = Date.now() - start;

    if (findings.length > 0) {
      log.warn('license', 'compliance_issues_found', {
        total: findings.length,
        high: findings.filter((f) => f.severity === 'high').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        projectType,
        durationMs: duration,
      });
    } else {
      log.info('license', 'check_clean', {
        checkedPackages,
        manifests: manifests.length,
        durationMs: duration,
      });
    }

    return {
      scanner: 'license',
      findings,
      findingCount: findings.length,
      checkedPackages,
      manifests,
      projectType,
      duration,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a LicenseChecker for the given project root.
 *
 * @param projectRoot - Absolute path to the project to check.
 * @returns A ready-to-use LicenseChecker instance.
 */
export function createLicenseChecker(projectRoot: string): LicenseChecker {
  return new LicenseChecker(projectRoot);
}

// Gitleaks Secrets Scanning Integration (STORY-009)
// Wraps the Gitleaks CLI to detect hardcoded secrets before the T4 gate.
// Gracefully degrades when Gitleaks is not installed — logs a warning and skips.
// Never logs or persists raw secret values; all output is redacted.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, isAbsolute, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
// ---------------------------------------------------------------------------
// Minimum required Gitleaks version
// ---------------------------------------------------------------------------
const MIN_VERSION_MAJOR = 8;
const MIN_VERSION_MINOR = 18;
// ---------------------------------------------------------------------------
// Path validation helpers
// ---------------------------------------------------------------------------
/**
 * Validate that a path is absolute, normalised, and does not contain traversal sequences.
 * Throws a TypeError when the path fails validation.
 */
function validatePath(label, p) {
    if (!p || typeof p !== 'string') {
        throw new TypeError(`${label}: path must be a non-empty string`);
    }
    const normalised = normalize(p);
    if (!isAbsolute(normalised)) {
        throw new TypeError(`${label}: path must be absolute — got "${normalised}"`);
    }
    // Guard against directory traversal even after normalisation
    if (normalised.includes('..')) {
        throw new TypeError(`${label}: path must not contain traversal sequences — got "${normalised}"`);
    }
    return normalised;
}
// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------
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
export function redactSecret(secret) {
    if (!secret)
        return '****';
    const len = secret.length;
    if (len >= 10) {
        return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
    }
    if (len >= 4) {
        return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
    }
    return '****';
}
// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------
/**
 * Parse a Gitleaks version string and return `[major, minor, patch]`.
 * Returns `[0, 0, 0]` when the string cannot be parsed.
 */
export function parseGitleaksVersion(versionOutput) {
    const match = versionOutput.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return [0, 0, 0];
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}
/**
 * Return true when [major, minor, patch] meets the minimum supported version.
 */
export function isSupportedVersion(version) {
    const [major, minor] = version;
    if (major > MIN_VERSION_MAJOR)
        return true;
    if (major === MIN_VERSION_MAJOR && minor >= MIN_VERSION_MINOR)
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------
const COMMON_INSTALL_PATHS = [
    '/usr/local/bin/gitleaks',
    '/usr/bin/gitleaks',
    '/opt/homebrew/bin/gitleaks',
    '/home/linuxbrew/.linuxbrew/bin/gitleaks',
];
/**
 * Locate the Gitleaks binary by checking PATH and common installation directories.
 * Returns the absolute path to the binary, or null when not found.
 */
export function findGitleaksBinary() {
    // 1. Check PATH via `which`/`where`
    try {
        const result = execSync('which gitleaks 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 5_000,
        }).trim();
        if (result && existsSync(result))
            return result;
    }
    catch {
        // `which` failed or binary not in PATH — fall through to common paths
    }
    // 2. Check well-known install paths
    for (const p of COMMON_INSTALL_PATHS) {
        if (existsSync(p))
            return p;
    }
    return null;
}
// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------
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
export function parseGitleaksOutput(jsonOutput, targetPath, suppressedFingerprints) {
    const trimmed = jsonOutput.trim();
    if (!trimmed || trimmed === 'null')
        return [];
    let raw;
    try {
        raw = JSON.parse(trimmed);
    }
    catch {
        return [];
    }
    if (!Array.isArray(raw))
        return [];
    return raw.map((r) => {
        // Accept both PascalCase (v8 default) and camelCase field names
        const description = (r.Description ?? r.description ?? 'Secret detected').trim();
        const file = (r.File ?? r.file ?? '').replace(/\\/g, '/');
        const startLine = r.StartLine ?? r.startLine ?? 0;
        const endLine = r.EndLine ?? r.endLine ?? startLine;
        const startColumn = r.StartColumn ?? r.startColumn ?? 0;
        const endColumn = r.EndColumn ?? r.endColumn ?? startColumn;
        const rawSecret = r.Secret ?? r.secret ?? '';
        const rawMatch = r.Match ?? r.match ?? rawSecret;
        const rule = (r.RuleID ?? r.ruleID ?? 'unknown-rule').trim();
        const entropy = r.Entropy ?? r.entropy ?? 0;
        const fingerprint = (r.Fingerprint ?? r.fingerprint ?? '').trim();
        // Relativise the path when it is absolute and starts with targetPath
        let relativePath = file;
        const resolvedTarget = targetPath.replace(/\\/g, '/');
        if (file.startsWith(resolvedTarget)) {
            relativePath = file.slice(resolvedTarget.length).replace(/^\//, '');
        }
        return {
            description,
            file: relativePath || file,
            startLine,
            endLine,
            startColumn,
            endColumn,
            match: redactSecret(rawMatch || rawSecret),
            secret: rawSecret, // kept in memory only — never logged
            rule,
            entropy,
            fingerprint,
            suppressed: fingerprint.length > 0 && suppressedFingerprints.has(fingerprint),
        };
    });
}
// ---------------------------------------------------------------------------
// .gitleaksignore loader
// ---------------------------------------------------------------------------
/**
 * Load suppressed fingerprints from .gitleaksignore in the target directory.
 * Returns an empty set when the file does not exist.
 * Lines starting with `#` are treated as comments and ignored.
 *
 * @param targetPath - Directory containing the .gitleaksignore file.
 * @returns Set of suppressed fingerprint strings.
 */
export function loadGitleaksIgnore(targetPath) {
    const ignorePath = join(targetPath, '.gitleaksignore');
    if (!existsSync(ignorePath))
        return new Set();
    try {
        const content = readFileSync(ignorePath, 'utf-8');
        const fingerprints = content
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith('#'));
        return new Set(fingerprints);
    }
    catch {
        return new Set();
    }
}
// ---------------------------------------------------------------------------
// GitleaksScanner class
// ---------------------------------------------------------------------------
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
export class GitleaksScanner {
    projectRoot;
    /**
     * @param projectRoot - Absolute path to the project root directory.
     *                      Used as the default scan target and for locating .gitleaksignore.
     */
    constructor(projectRoot) {
        this.projectRoot = validatePath('projectRoot', projectRoot);
    }
    /**
     * Check whether a supported Gitleaks binary is installed.
     * Verifies the version is >= 8.18.
     *
     * @returns true when a usable Gitleaks binary is available.
     */
    async isAvailable() {
        const binaryPath = findGitleaksBinary();
        if (!binaryPath)
            return false;
        try {
            const versionOutput = execFileSync(binaryPath, ['version'], {
                encoding: 'utf-8',
                timeout: 10_000,
            }).trim();
            const version = parseGitleaksVersion(versionOutput);
            return isSupportedVersion(version);
        }
        catch {
            return false;
        }
    }
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
    async scan(options = {}) {
        const start = Date.now();
        const log = getLogger();
        const targetPath = options.targetPath
            ? validatePath('targetPath', resolve(options.targetPath))
            : this.projectRoot;
        const binaryPath = findGitleaksBinary();
        if (!binaryPath) {
            log.warn('gitleaks', 'gitleaks_not_installed', {
                message: 'Gitleaks binary not found — secrets scanning skipped',
                installGuide: 'https://github.com/gitleaks/gitleaks#installation',
            });
            return {
                scanner: 'gitleaks',
                available: false,
                success: false,
                findings: [],
                findingCount: 0,
                duration: Date.now() - start,
                skipped: true,
                skipReason: 'Gitleaks not installed — install from https://github.com/gitleaks/gitleaks#installation',
            };
        }
        // Validate version
        const available = await this.isAvailable();
        if (!available) {
            log.warn('gitleaks', 'gitleaks_version_unsupported', {
                minVersion: `${MIN_VERSION_MAJOR}.${MIN_VERSION_MINOR}.0`,
            });
            return {
                scanner: 'gitleaks',
                available: false,
                success: false,
                findings: [],
                findingCount: 0,
                duration: Date.now() - start,
                skipped: true,
                skipReason: `Gitleaks version too old — required >= ${MIN_VERSION_MAJOR}.${MIN_VERSION_MINOR}.0`,
            };
        }
        // Build temp report path
        const reportPath = join(tmpdir(), `sf-gitleaks-${randomUUID()}.json`);
        try {
            const args = this.buildArgs({
                targetPath,
                reportPath,
                configPath: options.configPath,
                staged: options.staged ?? false,
            });
            log.info('gitleaks', 'scan_start', {
                targetPath,
                staged: options.staged ?? false,
            });
            try {
                execFileSync(binaryPath, args, {
                    encoding: 'utf-8',
                    timeout: 120_000,
                    maxBuffer: 10 * 1024 * 1024,
                    // Gitleaks exits non-zero when secrets are found — that is expected behaviour
                });
            }
            catch (err) {
                // Gitleaks exits 1 when findings are present — check if report was written
                const execErr = err;
                // Exit code 1 = findings found (normal), exit code != 1 = actual error
                if (execErr.status !== 1 && execErr.status !== 0) {
                    log.error('gitleaks', 'scan_execution_error', {
                        exitCode: execErr.status,
                        message: execErr.message?.slice(0, 200),
                    });
                    return {
                        scanner: 'gitleaks',
                        available: true,
                        success: false,
                        findings: [],
                        findingCount: 0,
                        duration: Date.now() - start,
                        skipped: false,
                        skipReason: `Gitleaks exited with unexpected code ${execErr.status}`,
                    };
                }
                // Exit 1 is expected when findings exist — continue to parse report
            }
            // Parse the JSON report
            const suppressedFingerprints = loadGitleaksIgnore(targetPath);
            const findings = this.readAndParseReport(reportPath, targetPath, suppressedFingerprints);
            const duration = Date.now() - start;
            // Log finding summary (no secret values — file:line only)
            const activeFindings = findings.filter((f) => !f.suppressed);
            if (activeFindings.length > 0) {
                log.warn('gitleaks', 'secrets_found', {
                    total: findings.length,
                    suppressed: findings.length - activeFindings.length,
                    active: activeFindings.length,
                    locations: activeFindings.slice(0, 10).map((f) => `${f.file}:${f.startLine} (${f.rule})`),
                });
            }
            else if (findings.length > 0) {
                log.info('gitleaks', 'all_findings_suppressed', {
                    total: findings.length,
                    suppressed: findings.length,
                });
            }
            else {
                log.info('gitleaks', 'scan_clean', { durationMs: duration });
            }
            return {
                scanner: 'gitleaks',
                available: true,
                success: true,
                findings,
                findingCount: findings.length,
                duration,
                skipped: false,
            };
        }
        finally {
            // Always clean up the temp report file
            try {
                if (existsSync(reportPath)) {
                    unlinkSync(reportPath);
                }
            }
            catch {
                // Best-effort cleanup
            }
        }
    }
    /**
     * Scan only staged files (for pre-commit hook usage).
     * Equivalent to calling `scan({ staged: true })`.
     *
     * @returns GitleaksScanResult for staged files only.
     */
    async scanStaged() {
        return this.scan({ targetPath: this.projectRoot, staged: true });
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * Build the argument array for execFileSync.
     * All values are passed as separate array elements (no shell interpolation).
     */
    buildArgs(opts) {
        const args = [
            'detect',
            '--source', opts.targetPath,
            '--report-format', 'json',
            '--report-path', opts.reportPath,
            '--exit-code', '0', // let us inspect the report regardless of findings
        ];
        if (opts.staged) {
            args.push('--staged');
        }
        else {
            // Full scan without git history (scan working tree files only)
            args.push('--no-git');
        }
        if (opts.configPath) {
            const safeConfigPath = validatePath('configPath', resolve(opts.configPath));
            args.push('--config', safeConfigPath);
        }
        // Suppress verbose output — we control logging
        args.push('--log-level', 'warn');
        return args;
    }
    /**
     * Read and parse the Gitleaks JSON report from disk.
     * Returns an empty array when the report file does not exist or is empty.
     */
    readAndParseReport(reportPath, targetPath, suppressedFingerprints) {
        if (!existsSync(reportPath))
            return [];
        try {
            const content = readFileSync(reportPath, 'utf-8');
            return parseGitleaksOutput(content, targetPath, suppressedFingerprints);
        }
        catch {
            return [];
        }
    }
}
// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------
/**
 * Create a GitleaksScanner for the given project root.
 * This is the recommended entry point for gate integration.
 *
 * @param projectRoot - Absolute path to the project to scan.
 * @returns A ready-to-use GitleaksScanner instance.
 */
export function createGitleaksScanner(projectRoot) {
    return new GitleaksScanner(projectRoot);
}
// ---------------------------------------------------------------------------
// Install instructions helper
// ---------------------------------------------------------------------------
/**
 * Return platform-appropriate Gitleaks install instructions.
 */
export function getGitleaksInstallInstructions() {
    const platform = process.platform;
    const lines = [
        'Gitleaks is not installed. Install it for secrets scanning:',
        '',
    ];
    if (platform === 'darwin') {
        lines.push('  brew install gitleaks');
        lines.push('  # or: https://github.com/gitleaks/gitleaks/releases');
    }
    else if (platform === 'linux') {
        lines.push('  # Download from: https://github.com/gitleaks/gitleaks/releases');
        lines.push('  # or: go install github.com/gitleaks/gitleaks/v8@latest');
        lines.push('  # or: docker run ghcr.io/gitleaks/gitleaks:latest detect');
    }
    else if (platform === 'win32') {
        lines.push('  choco install gitleaks');
        lines.push('  # or: https://github.com/gitleaks/gitleaks/releases');
    }
    lines.push('');
    lines.push('After installation, add a .gitleaksignore file to suppress false positives.');
    lines.push('See: https://github.com/gitleaks/gitleaks#configuration');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Write a stub report for tests (exported for test use only)
// ---------------------------------------------------------------------------
/**
 * Write a JSON array to a file path — used in tests to simulate Gitleaks output.
 * This function exists solely to support unit testing without running the binary.
 *
 * @param path - Absolute path to write the JSON report to.
 * @param findings - Array of raw Gitleaks finding objects.
 */
export function _writeTestReport(path, findings) {
    const dir = join(path, '..');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(findings, null, 2), 'utf-8');
}
//# sourceMappingURL=gitleaks-scanner.js.map
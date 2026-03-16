// Checkov IaC Scanning Integration (STORY-010)
// Wraps the Checkov CLI to detect Infrastructure-as-Code misconfigurations.
// Supports Dockerfile, Terraform, CloudFormation, Kubernetes, and ARM templates.
// Gracefully degrades when Checkov is not installed — logs a warning and skips.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, normalize, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
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
function validatePath(label, p) {
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
// Severity mapping
// ---------------------------------------------------------------------------
/**
 * Map Checkov severity strings to our normalised severity levels.
 *
 * Checkov uses: CRITICAL, HIGH, MEDIUM, LOW, NONE, or null.
 * When not set, defaults to 'medium' as a conservative fallback.
 *
 * @param raw - Raw severity string from Checkov output.
 * @returns Normalised severity.
 */
export function mapCheckovSeverity(raw) {
    if (!raw)
        return 'medium';
    switch (raw.toUpperCase()) {
        case 'CRITICAL': return 'critical';
        case 'HIGH': return 'high';
        case 'MEDIUM': return 'medium';
        case 'LOW': return 'low';
        default: return 'medium';
    }
}
// ---------------------------------------------------------------------------
// IaC file detection
// ---------------------------------------------------------------------------
const IAC_PATTERNS = [
    { regex: /^Dockerfile(\..*)?$/i, framework: 'dockerfile' },
    { regex: /^docker-compose.*\.(yml|yaml)$/i, framework: 'dockerfile' },
    { regex: /\.tf$/i, framework: 'terraform' },
    { regex: /\.tf\.json$/i, framework: 'terraform' },
    { regex: /\.cfn\.(yaml|yml|json)$/i, framework: 'cloudformation' },
    { regex: /\.yaml$/i, framework: 'yaml' }, // generic — checked for CF/k8s markers
    { regex: /\.yml$/i, framework: 'yaml' },
    { regex: /\.bicep$/i, framework: 'arm' },
    { regex: /\.json$/i, framework: 'arm' }, // ARM JSON templates
];
const EXCLUDE_DIRS = new Set([
    'node_modules', 'dist', '.git', 'coverage', '__pycache__',
    '.next', '.nuxt', '.cache', 'vendor', 'target',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
/**
 * Check whether a YAML/JSON file contains CloudFormation markers.
 *
 * @param filePath - Absolute path to the file.
 * @returns true when CloudFormation markers are detected.
 */
function isCloudFormationFile(filePath) {
    try {
        const stat = statSync(filePath);
        if (stat.size > MAX_FILE_SIZE)
            return false;
        const content = readFileSync(filePath, 'utf-8');
        return content.includes('AWSTemplateFormatVersion') ||
            (content.includes('Resources:') && content.includes('Type:') && content.includes('Properties:'));
    }
    catch {
        return false;
    }
}
/**
 * Recursively walk a directory and collect IaC files with their detected frameworks.
 *
 * @param dir - Directory to walk.
 * @param maxDepth - Maximum recursion depth to prevent runaway traversal.
 * @returns Array of objects with the file path and its detected framework.
 */
export function detectIaCFiles(dir, maxDepth = 6) {
    const found = [];
    function walk(current, depth) {
        if (depth > maxDepth)
            return;
        let entries;
        try {
            entries = readdirSync(current, { withFileTypes: true, encoding: 'utf8' });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!EXCLUDE_DIRS.has(entry.name)) {
                    walk(join(current, entry.name), depth + 1);
                }
                continue;
            }
            if (!entry.isFile())
                continue;
            const name = entry.name;
            const filePath = join(current, name);
            for (const { regex, framework } of IAC_PATTERNS) {
                if (regex.test(name)) {
                    // For generic YAML/JSON, check for CloudFormation markers
                    if (framework === 'yaml' || framework === 'arm') {
                        if (name.endsWith('.yaml') || name.endsWith('.yml')) {
                            if (isCloudFormationFile(filePath)) {
                                found.push({ path: filePath, framework: 'cloudformation' });
                            }
                            // also check for kubernetes markers
                            else {
                                try {
                                    const content = readFileSync(filePath, 'utf-8');
                                    if (content.includes('apiVersion:') && content.includes('kind:')) {
                                        found.push({ path: filePath, framework: 'kubernetes' });
                                    }
                                }
                                catch {
                                    // skip unreadable files
                                }
                            }
                        }
                        else if (name.endsWith('.json')) {
                            try {
                                const content = readFileSync(filePath, 'utf-8');
                                if (content.includes('"$schema"') && content.includes('deploymentTemplate')) {
                                    found.push({ path: filePath, framework: 'arm' });
                                }
                                else if (isCloudFormationFile(filePath)) {
                                    found.push({ path: filePath, framework: 'cloudformation' });
                                }
                            }
                            catch {
                                // skip unreadable files
                            }
                        }
                    }
                    else {
                        found.push({ path: filePath, framework });
                    }
                    break; // stop after first match
                }
            }
        }
    }
    walk(dir, 0);
    return found;
}
// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------
/**
 * Parse a single Checkov failed/skipped check entry into a CheckovFinding.
 *
 * @param check - Raw check object from Checkov JSON output.
 * @param status - Whether this check failed, passed, or was skipped.
 * @param targetPath - Root directory of the scan for relativising file paths.
 * @returns Parsed CheckovFinding.
 */
export function parseCheckovCheck(check, status, targetPath) {
    const checkId = check.check_id ?? 'UNKNOWN';
    const checkName = check.check_name ?? 'Unknown check';
    const severity = mapCheckovSeverity(check.severity);
    // Resolve file path — Checkov may provide relative or absolute paths
    let rawFile = check.file_path ?? check.repo_file_path ?? check.file_abs_path ?? '';
    rawFile = rawFile.replace(/\\/g, '/');
    let resolvedFile;
    if (isAbsolute(rawFile)) {
        const normalTarget = targetPath.replace(/\\/g, '/');
        resolvedFile = rawFile.startsWith(normalTarget)
            ? rawFile.slice(normalTarget.length).replace(/^\//, '')
            : rawFile;
    }
    else {
        resolvedFile = rawFile.replace(/^\//, '');
    }
    const line = Array.isArray(check.file_line_range) ? (check.file_line_range[0] ?? 1) : 1;
    const guideline = check.guideline ?? `https://docs.bridgecrew.io/docs/${checkId.toLowerCase()}`;
    // Determine framework from check_type or file extension
    let framework = (check.check_type ?? '').toLowerCase();
    if (!framework) {
        if (/dockerfile/i.test(resolvedFile)) {
            framework = 'dockerfile';
        }
        else if (resolvedFile.endsWith('.tf') || resolvedFile.endsWith('.tf.json')) {
            framework = 'terraform';
        }
        else if (/cloudformation/i.test(checkId) || checkId.startsWith('CKV_AWS_')) {
            framework = 'cloudformation';
        }
        else {
            framework = 'unknown';
        }
    }
    return { checkId, checkName, severity, file: resolvedFile, line, framework, guideline, status };
}
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
export function parseCheckovOutput(jsonOutput, targetPath, includePassedChecks = false) {
    const trimmed = jsonOutput.trim();
    if (!trimmed) {
        return { findings: [], passedCount: 0, scannedFiles: 0 };
    }
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return { findings: [], passedCount: 0, scannedFiles: 0 };
    }
    // Normalise to array of blocks
    const blocks = Array.isArray(parsed)
        ? parsed
        : [parsed];
    const findings = [];
    let passedCount = 0;
    const scannedFilesSet = new Set();
    for (const block of blocks) {
        if (!block || typeof block !== 'object')
            continue;
        const results = block.results;
        if (!results)
            continue;
        // Failed checks
        for (const check of results.failed_checks ?? []) {
            const finding = parseCheckovCheck(check, 'failed', targetPath);
            findings.push(finding);
            if (finding.file)
                scannedFilesSet.add(finding.file);
        }
        // Passed checks
        passedCount += (results.passed_checks ?? []).length;
        if (includePassedChecks) {
            for (const check of results.passed_checks ?? []) {
                const finding = parseCheckovCheck(check, 'passed', targetPath);
                findings.push(finding);
                if (finding.file)
                    scannedFilesSet.add(finding.file);
            }
        }
        else {
            for (const check of results.passed_checks ?? []) {
                const rawFile = (check.file_path ?? '').replace(/\\/g, '/');
                if (rawFile) {
                    const rel = isAbsolute(rawFile)
                        ? rawFile.slice(targetPath.replace(/\\/g, '/').length).replace(/^\//, '')
                        : rawFile.replace(/^\//, '');
                    scannedFilesSet.add(rel || rawFile);
                }
            }
        }
        // Skipped checks
        for (const check of results.skipped_checks ?? []) {
            const finding = parseCheckovCheck(check, 'skipped', targetPath);
            findings.push(finding);
            if (finding.file)
                scannedFilesSet.add(finding.file);
        }
    }
    return { findings, passedCount, scannedFiles: scannedFilesSet.size };
}
// ---------------------------------------------------------------------------
// Binary detection
// ---------------------------------------------------------------------------
const COMMON_CHECKOV_PATHS = [
    '/usr/local/bin/checkov',
    '/usr/bin/checkov',
    '/opt/homebrew/bin/checkov',
    '/home/linuxbrew/.linuxbrew/bin/checkov',
];
/**
 * Locate the Checkov binary by checking common paths and PATH.
 * Uses only existsSync and execFileSync — never shells out via execSync.
 *
 * @returns Absolute path to the Checkov binary, or null when not found.
 */
export function findCheckovBinary() {
    // 1. Check well-known install paths first (no shell needed)
    for (const p of COMMON_CHECKOV_PATHS) {
        if (existsSync(p))
            return p;
    }
    // 2. Check PATH via execFileSync (safe — no shell interpolation)
    const whichBin = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = execFileSync(whichBin, ['checkov'], {
            encoding: 'utf-8',
            timeout: 5_000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim().split('\n')[0].trim();
        if (result && existsSync(result))
            return result;
    }
    catch {
        // Binary not in PATH
    }
    return null;
}
// ---------------------------------------------------------------------------
// CheckovScanner class
// ---------------------------------------------------------------------------
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
export class CheckovScanner {
    projectRoot;
    /**
     * @param projectRoot - Absolute path to the project root directory.
     */
    constructor(projectRoot) {
        this.projectRoot = validatePath('projectRoot', projectRoot);
    }
    /**
     * Check whether Checkov is installed and reachable on PATH.
     *
     * @returns true when a usable Checkov binary was found.
     */
    async isAvailable() {
        return findCheckovBinary() !== null;
    }
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
    async scan(options = {}) {
        const start = Date.now();
        const log = getLogger();
        const targetPath = options.targetPath
            ? validatePath('targetPath', options.targetPath)
            : this.projectRoot;
        const binaryPath = findCheckovBinary();
        if (!binaryPath) {
            log.warn('checkov', 'checkov_not_installed', {
                message: 'Checkov binary not found — IaC scanning skipped',
                installGuide: 'pip install checkov',
            });
            return {
                scanner: 'checkov',
                available: false,
                success: false,
                findings: [],
                findingCount: 0,
                passedCount: 0,
                scannedFiles: 0,
                frameworks: [],
                duration: Date.now() - start,
                skipped: true,
                skipReason: 'Checkov not installed — install with: pip install checkov',
            };
        }
        // Detect IaC files before invoking Checkov
        const iacFiles = detectIaCFiles(targetPath);
        if (iacFiles.length === 0) {
            log.info('checkov', 'no_iac_files_found', { targetPath });
            return {
                scanner: 'checkov',
                available: true,
                success: true,
                findings: [],
                findingCount: 0,
                passedCount: 0,
                scannedFiles: 0,
                frameworks: [],
                duration: Date.now() - start,
                skipped: false,
            };
        }
        const detectedFrameworks = [...new Set(iacFiles.map((f) => f.framework))];
        const frameworks = options.frameworks?.length ? options.frameworks : detectedFrameworks;
        // Build temp output directory
        const tmpDir = join(tmpdir(), `sf-checkov-${randomUUID()}`);
        mkdirSync(tmpDir, { recursive: true });
        try {
            const args = this.buildArgs({
                targetPath,
                tmpDir,
                frameworks,
                skipChecks: options.skipChecks ?? [],
                compact: options.compact ?? true,
            });
            log.info('checkov', 'scan_start', { targetPath, frameworks });
            let rawOutput = '';
            try {
                rawOutput = execFileSync(binaryPath, args, {
                    encoding: 'utf-8',
                    timeout: 300_000, // 5 minutes
                    maxBuffer: 20 * 1024 * 1024,
                });
            }
            catch (err) {
                // Checkov exits non-zero when findings are present — stdout still has JSON
                const execErr = err;
                if (execErr.stdout) {
                    rawOutput = execErr.stdout;
                }
                else {
                    // Attempt to read from the output file Checkov wrote to tmpDir
                    try {
                        const files = readdirSync(tmpDir);
                        const jsonFile = files.find((f) => f.endsWith('.json'));
                        if (jsonFile) {
                            rawOutput = readFileSync(join(tmpDir, jsonFile), 'utf-8');
                        }
                    }
                    catch {
                        // Ignore read errors
                    }
                }
                // Only treat as a hard failure if no output at all and exit code is unexpected
                if (!rawOutput && execErr.status !== 0 && execErr.status !== 1) {
                    log.error('checkov', 'scan_execution_error', {
                        exitCode: execErr.status,
                        message: execErr.stderr?.slice(0, 300),
                    });
                    return {
                        scanner: 'checkov',
                        available: true,
                        success: false,
                        findings: [],
                        findingCount: 0,
                        passedCount: 0,
                        scannedFiles: 0,
                        frameworks,
                        duration: Date.now() - start,
                        skipped: false,
                        skipReason: `Checkov exited with unexpected code ${execErr.status}`,
                    };
                }
            }
            const { findings, passedCount, scannedFiles } = parseCheckovOutput(rawOutput, targetPath);
            const failedFindings = findings.filter((f) => f.status === 'failed');
            const duration = Date.now() - start;
            log.info('checkov', 'scan_complete', {
                failed: failedFindings.length,
                passed: passedCount,
                scannedFiles,
                frameworks,
                durationMs: duration,
            });
            return {
                scanner: 'checkov',
                available: true,
                success: true,
                findings: failedFindings,
                findingCount: failedFindings.length,
                passedCount,
                scannedFiles,
                frameworks,
                duration,
                skipped: false,
            };
        }
        finally {
            // Always clean up temp directory
            try {
                rmSync(tmpDir, { recursive: true, force: true });
            }
            catch {
                // Best-effort cleanup
            }
        }
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    /**
     * Build the argument array for execFileSync.
     * All values are passed as separate array elements (no shell interpolation).
     */
    /**
     * Validate that a user-provided value matches a safe pattern.
     * Rejects anything with shell metacharacters or traversal attempts.
     */
    static validateArgValue(label, value) {
        // Allow only alphanumeric, hyphens, underscores, dots (e.g. "CKV_DOCKER_3", "terraform")
        if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
            throw new TypeError(`${label}: unsafe value rejected — got "${value}"`);
        }
    }
    buildArgs(opts) {
        const args = [
            '--directory', opts.targetPath,
            '--output', 'json',
            '--output-file-path', opts.tmpDir,
        ];
        if (opts.frameworks.length > 0) {
            // Validate each framework name against whitelist pattern
            for (const fw of opts.frameworks) {
                CheckovScanner.validateArgValue('framework', fw);
            }
            // Checkov v3 accepts comma-separated frameworks via a single --framework flag
            args.push('--framework', opts.frameworks.join(','));
        }
        if (opts.skipChecks.length > 0) {
            // Validate each check ID against whitelist pattern
            for (const check of opts.skipChecks) {
                CheckovScanner.validateArgValue('skipCheck', check);
            }
            args.push('--skip-check', opts.skipChecks.join(','));
        }
        if (opts.compact) {
            args.push('--compact');
        }
        // Suppress verbose progress output
        args.push('--quiet');
        return args;
    }
}
// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------
/**
 * Create a CheckovScanner for the given project root.
 *
 * @param projectRoot - Absolute path to the project to scan.
 * @returns A ready-to-use CheckovScanner instance.
 */
export function createCheckovScanner(projectRoot) {
    return new CheckovScanner(projectRoot);
}
// ---------------------------------------------------------------------------
// Install instructions helper
// ---------------------------------------------------------------------------
/**
 * Return platform-appropriate Checkov install instructions.
 */
export function getCheckovInstallInstructions() {
    const platform = process.platform;
    const lines = [
        'Checkov is not installed. Install it for IaC security scanning:',
        '',
    ];
    if (platform === 'darwin') {
        lines.push('  pip install checkov');
        lines.push('  # or: brew install checkov');
    }
    else if (platform === 'linux') {
        lines.push('  pip install checkov');
        lines.push('  # or: pip3 install checkov');
    }
    else if (platform === 'win32') {
        lines.push('  pip install checkov');
    }
    lines.push('');
    lines.push('After installation, re-run the IaC scan for infrastructure security coverage.');
    lines.push('See: https://www.checkov.io/1.Welcome/Quick%20Start.html');
    return lines.join('\n');
}
//# sourceMappingURL=checkov-scanner.js.map
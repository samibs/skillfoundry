// Semgrep SAST Integration
// Provides real OWASP security scanning via Semgrep CLI.
// Falls back to regex pattern matching when Semgrep is not installed.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getLogger } from '../utils/logger.js';
// ---------------------------------------------------------------------------
// OWASP Category Mapping
// ---------------------------------------------------------------------------
const OWASP_CATEGORIES = [
    'A01:2021 Broken Access Control',
    'A02:2021 Cryptographic Failures',
    'A03:2021 Injection',
    'A04:2021 Insecure Design',
    'A05:2021 Security Misconfiguration',
    'A06:2021 Vulnerable Components',
    'A07:2021 Auth Failures',
    'A08:2021 Data Integrity Failures',
    'A09:2021 Logging Failures',
    'A10:2021 SSRF',
];
// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
let semgrepVersionCache = undefined;
/**
 * Detect if Semgrep CLI is installed and return its version.
 * Returns null if not installed. Caches the result.
 */
export function detectSemgrep() {
    if (semgrepVersionCache !== undefined) {
        return semgrepVersionCache;
    }
    try {
        const version = execSync('semgrep --version 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 10_000,
        }).trim();
        semgrepVersionCache = version || null;
        return semgrepVersionCache;
    }
    catch {
        semgrepVersionCache = null;
        return null;
    }
}
/** Reset the detection cache (useful for testing). */
export function resetDetectionCache() {
    semgrepVersionCache = undefined;
}
// ---------------------------------------------------------------------------
// Severity Mapping
// ---------------------------------------------------------------------------
/**
 * Map Semgrep severity to our normalized severity.
 * Semgrep uses: ERROR, WARNING, INFO
 */
export function mapSeverity(semgrepSeverity, confidence) {
    const sev = semgrepSeverity.toUpperCase();
    if (sev === 'ERROR') {
        // High-confidence errors are CRITICAL, others are HIGH
        return confidence === 'HIGH' ? 'CRITICAL' : 'HIGH';
    }
    if (sev === 'WARNING') {
        return 'MEDIUM';
    }
    if (sev === 'INFO') {
        return 'LOW';
    }
    return 'INFO';
}
// ---------------------------------------------------------------------------
// OWASP Category Extraction
// ---------------------------------------------------------------------------
/**
 * Extract OWASP category from Semgrep match metadata.
 */
export function extractOwaspCategory(match) {
    const meta = match.extra?.metadata;
    if (meta?.owasp && meta.owasp.length > 0) {
        // Find matching canonical category
        const owaspTag = meta.owasp[0];
        const canonical = OWASP_CATEGORIES.find((c) => c.toLowerCase().includes(owaspTag.toLowerCase()) ||
            owaspTag.toLowerCase().includes(c.split(' ')[0].toLowerCase()));
        return canonical || `OWASP: ${owaspTag}`;
    }
    if (meta?.category) {
        return meta.category;
    }
    // Infer from rule ID
    const ruleId = match.check_id.toLowerCase();
    if (ruleId.includes('injection') || ruleId.includes('sqli') || ruleId.includes('xss') || ruleId.includes('command-injection')) {
        return 'A03:2021 Injection';
    }
    if (ruleId.includes('crypto') || ruleId.includes('secret') || ruleId.includes('password') || ruleId.includes('hardcoded')) {
        return 'A02:2021 Cryptographic Failures';
    }
    if (ruleId.includes('auth') || ruleId.includes('session')) {
        return 'A07:2021 Auth Failures';
    }
    if (ruleId.includes('ssrf')) {
        return 'A10:2021 SSRF';
    }
    if (ruleId.includes('deseriali')) {
        return 'A08:2021 Data Integrity Failures';
    }
    return 'Security';
}
/**
 * Run Semgrep scan against a target directory.
 * Returns parsed results or null if Semgrep is not available.
 */
export function runSemgrepScan(options) {
    const version = detectSemgrep();
    if (!version) {
        return null;
    }
    const { target, timeout = 60_000, includeCustomRules = true, extraConfigs = [] } = options;
    const log = getLogger();
    // Build command
    const configs = ['p/owasp-top-ten'];
    // Add custom rules if .semgrep/ directory exists
    const customRulesDir = join(target, '.semgrep');
    if (includeCustomRules && existsSync(customRulesDir)) {
        try {
            const ruleFiles = readdirSync(customRulesDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
            if (ruleFiles.length > 0) {
                configs.push(customRulesDir);
                log.info('gate', 'semgrep_custom_rules', { count: ruleFiles.length });
            }
        }
        catch {
            // Ignore custom rules dir read errors
        }
    }
    // Add any extra configs
    configs.push(...extraConfigs);
    const configArgs = configs.map((c) => `--config ${c}`).join(' ');
    const excludes = [
        '--exclude=node_modules',
        '--exclude=dist',
        '--exclude=.git',
        '--exclude=coverage',
        '--exclude=__pycache__',
        '--exclude=.next',
        '--exclude=.nuxt',
    ].join(' ');
    const cmd = `semgrep scan ${configArgs} --json --quiet ${excludes} --timeout ${Math.floor(timeout / 1000)} "${target}" 2>/dev/null`;
    log.info('gate', 'semgrep_scan_start', { target, configs });
    try {
        const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: timeout + 5_000, // Extra buffer for process overhead
            maxBuffer: 10 * 1024 * 1024,
            cwd: target,
        });
        return parseSemgrepOutput(output);
    }
    catch (err) {
        // Semgrep exits non-zero when findings are present — still valid JSON
        const execErr = err;
        if (execErr.stdout) {
            try {
                return parseSemgrepOutput(execErr.stdout);
            }
            catch {
                // Parse failed — fall through
            }
        }
        log.error('gate', 'semgrep_scan_failed', {
            error: execErr.stderr?.slice(0, 200) || 'Unknown error',
        });
        return null;
    }
}
// ---------------------------------------------------------------------------
// Output Parsing
// ---------------------------------------------------------------------------
/**
 * Parse Semgrep JSON output into our internal format.
 */
export function parseSemgrepOutput(jsonOutput) {
    const trimmed = jsonOutput.trim();
    if (!trimmed) {
        return { results: [], errors: [] };
    }
    const parsed = JSON.parse(trimmed);
    return {
        results: Array.isArray(parsed.results) ? parsed.results : [],
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
        version: parsed.version || undefined,
    };
}
// ---------------------------------------------------------------------------
// Finding Conversion
// ---------------------------------------------------------------------------
/**
 * Convert a Semgrep match to our SecurityFinding format.
 */
export function convertMatch(match, workDir) {
    const confidence = match.extra?.metadata?.confidence;
    const fix = match.extra?.fix || match.extra?.metadata?.fix || null;
    return {
        id: match.check_id,
        severity: mapSeverity(match.extra.severity, confidence),
        category: extractOwaspCategory(match),
        rule: match.check_id,
        message: match.extra.message,
        file: relative(workDir, match.path) || match.path,
        line: match.start.line,
        column: match.start.col,
        snippet: (match.extra.lines || '').slice(0, 200),
        fix: fix || null,
        source: 'semgrep',
    };
}
const REGEX_PATTERNS = [
    {
        id: 'hardcoded-password',
        pattern: /password\s*=\s*['"][^'"]+['"]/gi,
        severity: 'HIGH',
        category: 'A02:2021 Cryptographic Failures',
        message: 'Hardcoded password detected',
    },
    {
        id: 'hardcoded-api-key',
        pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
        severity: 'HIGH',
        category: 'A02:2021 Cryptographic Failures',
        message: 'Hardcoded API key detected',
    },
    {
        id: 'hardcoded-secret',
        pattern: /secret\s*=\s*['"][^'"]+['"]/gi,
        severity: 'HIGH',
        category: 'A02:2021 Cryptographic Failures',
        message: 'Hardcoded secret detected',
    },
    {
        id: 'private-key',
        pattern: /BEGIN\s+(RSA\s+|DSA\s+|EC\s+)?PRIVATE\s+KEY/g,
        severity: 'CRITICAL',
        category: 'A02:2021 Cryptographic Failures',
        message: 'Private key detected in source code',
    },
    {
        id: 'eval-usage',
        pattern: /\beval\s*\(/g,
        severity: 'HIGH',
        category: 'A03:2021 Injection',
        message: 'eval() usage detected — potential code injection',
    },
    {
        id: 'innerHTML-usage',
        pattern: /\.innerHTML\s*=/g,
        severity: 'MEDIUM',
        category: 'A03:2021 Injection',
        message: 'innerHTML assignment detected — potential XSS',
    },
    {
        id: 'sql-concatenation',
        pattern: /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/gi,
        severity: 'HIGH',
        category: 'A03:2021 Injection',
        message: 'String concatenation in SQL query — potential SQL injection',
    },
];
/**
 * Run regex-based fallback scan for secret patterns.
 * Used when Semgrep is not installed.
 */
export function runRegexScan(target) {
    const findings = [];
    // File extensions to scan
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.java', '.cs', '.json'];
    const excludeDirs = new Set(['node_modules', 'dist', '.git', 'coverage', '__pycache__', '.next']);
    function scanDir(dir) {
        try {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!excludeDirs.has(entry.name)) {
                        scanDir(join(dir, entry.name));
                    }
                    continue;
                }
                if (!extensions.some((ext) => entry.name.endsWith(ext)))
                    continue;
                // Skip test files
                if (/\.(test|spec)\.[tj]sx?$/.test(entry.name))
                    continue;
                const filePath = join(dir, entry.name);
                try {
                    // Read file with size limit (skip files > 1MB)
                    const { readFileSync, statSync } = require('node:fs');
                    const stat = statSync(filePath);
                    if (stat.size > 1_000_000)
                        continue;
                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n');
                    for (const rp of REGEX_PATTERNS) {
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            // Skip comments
                            if (/^\s*(\/\/|#|\/\*|\*)/.test(line))
                                continue;
                            rp.pattern.lastIndex = 0;
                            if (rp.pattern.test(line)) {
                                findings.push({
                                    id: rp.id,
                                    severity: rp.severity,
                                    category: rp.category,
                                    rule: `regex/${rp.id}`,
                                    message: rp.message,
                                    file: relative(target, filePath),
                                    line: i + 1,
                                    column: 0,
                                    snippet: line.trim().slice(0, 200),
                                    fix: null,
                                    source: 'regex',
                                });
                            }
                        }
                    }
                }
                catch {
                    // Skip unreadable files
                }
            }
        }
        catch {
            // Skip unreadable directories
        }
    }
    scanDir(target);
    return findings;
}
// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------
/**
 * Generate a complete security report from scan results.
 */
export function generateSecurityReport(findings, target, scanDurationMs, scannerVersion) {
    const summary = {
        critical: findings.filter((f) => f.severity === 'CRITICAL').length,
        high: findings.filter((f) => f.severity === 'HIGH').length,
        medium: findings.filter((f) => f.severity === 'MEDIUM').length,
        low: findings.filter((f) => f.severity === 'LOW').length,
        info: findings.filter((f) => f.severity === 'INFO').length,
    };
    // Determine OWASP categories covered
    const coveredCategories = new Set();
    for (const f of findings) {
        const owaspMatch = OWASP_CATEGORIES.find((c) => f.category.includes(c.split(' ')[0]));
        if (owaspMatch)
            coveredCategories.add(owaspMatch);
    }
    // If Semgrep was used, all scanned categories count as covered
    const owaspCoverage = scannerVersion !== 'regex-fallback'
        ? [...OWASP_CATEGORIES] // Semgrep p/owasp-top-ten covers all 10
        : [...coveredCategories].sort();
    // Determine verdict
    let verdict = 'PASS';
    if (summary.critical > 0 || summary.high > 0) {
        verdict = 'FAIL';
    }
    else if (summary.medium > 0 || summary.low > 0) {
        verdict = 'WARN';
    }
    return {
        scannerVersion,
        scanDurationMs,
        target,
        findings: findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
        summary,
        owaspCoverage,
        verdict,
    };
}
function severityRank(s) {
    const ranks = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
        INFO: 4,
    };
    return ranks[s];
}
// ---------------------------------------------------------------------------
// Full Scan (Semgrep-first, regex-fallback)
// ---------------------------------------------------------------------------
/**
 * Run a complete security scan: Semgrep if available, regex fallback otherwise.
 * This is the main entry point used by T4 gate and /security audit.
 */
export function runSecurityScan(target, timeout) {
    const start = Date.now();
    const log = getLogger();
    // Try Semgrep first
    const semgrepResult = runSemgrepScan({ target, timeout });
    if (semgrepResult && semgrepResult.results) {
        const findings = semgrepResult.results.map((m) => convertMatch(m, target));
        // Also run regex patterns for anything Semgrep might miss (secrets in non-standard patterns)
        const regexFindings = runRegexScan(target);
        // Deduplicate: if Semgrep found the same file:line, skip the regex finding
        const semgrepKeys = new Set(findings.map((f) => `${f.file}:${f.line}`));
        const uniqueRegex = regexFindings.filter((f) => !semgrepKeys.has(`${f.file}:${f.line}`));
        const allFindings = [...findings, ...uniqueRegex];
        const scanDurationMs = Date.now() - start;
        log.info('gate', 'semgrep_scan_complete', {
            semgrepFindings: findings.length,
            regexFindings: uniqueRegex.length,
            durationMs: scanDurationMs,
        });
        return generateSecurityReport(allFindings, target, scanDurationMs, semgrepResult.version || detectSemgrep() || 'semgrep');
    }
    // Fallback to regex-only
    log.info('gate', 'semgrep_not_available', { fallback: 'regex' });
    const regexFindings = runRegexScan(target);
    const scanDurationMs = Date.now() - start;
    return generateSecurityReport(regexFindings, target, scanDurationMs, 'regex-fallback');
}
// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------
/**
 * Format a security report as a readable string for CLI output.
 */
export function formatSecurityReport(report) {
    const lines = [];
    lines.push('Security Scan Report');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`Scanner: ${report.scannerVersion}`);
    lines.push(`Target: ${report.target}`);
    lines.push(`Duration: ${report.scanDurationMs}ms`);
    lines.push('');
    // Summary
    lines.push('Findings Summary:');
    lines.push(`  CRITICAL: ${report.summary.critical}`);
    lines.push(`  HIGH:     ${report.summary.high}`);
    lines.push(`  MEDIUM:   ${report.summary.medium}`);
    lines.push(`  LOW:      ${report.summary.low}`);
    lines.push(`  INFO:     ${report.summary.info}`);
    lines.push('');
    // OWASP Coverage
    lines.push(`OWASP Coverage: ${report.owaspCoverage.length}/10 categories`);
    for (const cat of report.owaspCoverage) {
        lines.push(`  [x] ${cat}`);
    }
    lines.push('');
    // Findings detail
    if (report.findings.length > 0) {
        lines.push('Findings:');
        lines.push('─────────────────────────────────────────────────');
        for (const f of report.findings.slice(0, 50)) { // Limit to 50 for readability
            lines.push(`  [${f.severity}] ${f.rule}`);
            lines.push(`    ${f.file}:${f.line} — ${f.message}`);
            if (f.snippet) {
                lines.push(`    > ${f.snippet.slice(0, 120)}`);
            }
            if (f.fix) {
                lines.push(`    Fix: ${f.fix}`);
            }
            lines.push('');
        }
        if (report.findings.length > 50) {
            lines.push(`  ... and ${report.findings.length - 50} more findings`);
        }
    }
    else {
        lines.push('No security findings detected.');
    }
    lines.push('');
    lines.push(`Verdict: ${report.verdict}`);
    // Install guide when using fallback
    if (report.scannerVersion === 'regex-fallback') {
        lines.push('');
        lines.push('Note: Using regex-based scanning (limited coverage).');
        lines.push('For full OWASP scanning, install Semgrep:');
        lines.push('  pip install semgrep');
        lines.push('  # or: brew install semgrep');
        lines.push('  # or: https://semgrep.dev/docs/getting-started/');
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Install Instructions
// ---------------------------------------------------------------------------
/**
 * Get platform-specific Semgrep install instructions.
 */
export function getSemgrepInstallInstructions() {
    const platform = process.platform;
    const lines = [
        'Semgrep is not installed. Install it for full OWASP security scanning:',
        '',
    ];
    if (platform === 'darwin') {
        lines.push('  brew install semgrep');
        lines.push('  # or: pip install semgrep');
    }
    else if (platform === 'linux') {
        lines.push('  pip install semgrep');
        lines.push('  # or: pip3 install semgrep');
    }
    else if (platform === 'win32') {
        lines.push('  pip install semgrep');
        lines.push('  # Note: Semgrep has limited Windows support.');
        lines.push('  # Consider using WSL for full compatibility.');
    }
    lines.push('');
    lines.push('After installation, re-run the security scan for full OWASP coverage.');
    return lines.join('\n');
}
//# sourceMappingURL=semgrep-scanner.js.map
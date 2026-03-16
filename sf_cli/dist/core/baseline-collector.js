// Baseline collector — captures a snapshot of current code quality metrics.
// Used by `sf metrics baseline` to establish a quality reference point.
// Handles missing tools gracefully: -1 means "tool not available".
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { getLogger } from '../utils/logger.js';
// ── Source file extensions by language ──────────────────────────
const SOURCE_EXTENSIONS = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.cs': 'C#',
};
const TEST_PATTERNS = [
    /\.test\.[tj]sx?$/,
    /\.spec\.[tj]sx?$/,
    /test_.*\.py$/,
    /.*_test\.py$/,
    /.*Tests?\.cs$/,
];
// ── Core Collection ────────────────────────────────────────────
/**
 * Collect a baseline snapshot of code quality metrics for the given directory.
 *
 * @param workDir - The project root directory to analyze
 * @returns BaselineSnapshot with collected metrics
 */
export async function collectBaseline(workDir) {
    const log = getLogger();
    log.info('telemetry', 'collecting_baseline', { workDir });
    const sourceFiles = collectSourceFiles(workDir);
    const testFiles = sourceFiles.filter((f) => TEST_PATTERNS.some((p) => p.test(f)));
    const languageBreakdown = computeLanguageBreakdown(sourceFiles);
    const primaryLanguage = detectPrimaryLanguage(languageBreakdown);
    const loc = countLinesOfCode(sourceFiles);
    const lintErrorCount = countLintErrors(workDir, log);
    const typeErrorCount = countTypeErrors(workDir, log);
    const snapshot = {
        timestamp: new Date().toISOString(),
        work_dir: workDir,
        test_file_count: testFiles.length,
        lint_error_count: lintErrorCount,
        type_error_count: typeErrorCount,
        loc,
        file_count: sourceFiles.length,
        primary_language: primaryLanguage,
        language_breakdown: languageBreakdown,
    };
    log.info('telemetry', 'baseline_collected', {
        files: snapshot.file_count,
        tests: snapshot.test_file_count,
        loc: snapshot.loc,
        language: snapshot.primary_language,
    });
    return snapshot;
}
// ── File Discovery ─────────────────────────────────────────────
/**
 * Recursively collect source files from the working directory.
 * Skips node_modules, .git, dist, build, and other non-source directories.
 *
 * @param dir - Directory to scan
 * @returns Array of absolute file paths
 */
function collectSourceFiles(dir) {
    const SKIP_DIRS = new Set([
        'node_modules', '.git', 'dist', 'build', 'out', '.next',
        '__pycache__', '.venv', 'venv', 'bin', 'obj', '.skillfoundry',
        '.claude', 'coverage', '.nyc_output',
    ]);
    const files = [];
    function walk(currentDir) {
        let entries;
        try {
            entries = readdirSync(currentDir);
        }
        catch {
            return; // Permission denied or inaccessible
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry))
                continue;
            const fullPath = join(currentDir, entry);
            let stat;
            try {
                stat = statSync(fullPath);
            }
            catch {
                continue; // Broken symlink or permission issue
            }
            if (stat.isDirectory()) {
                walk(fullPath);
            }
            else if (stat.isFile()) {
                const ext = extname(entry);
                if (ext in SOURCE_EXTENSIONS) {
                    files.push(fullPath);
                }
            }
        }
    }
    walk(dir);
    return files;
}
// ── Language Detection ──────────────────────────────────────────
/**
 * Compute file count by language from source file list.
 *
 * @param files - Array of file paths
 * @returns Record mapping language name to file count
 */
function computeLanguageBreakdown(files) {
    const breakdown = {};
    for (const file of files) {
        const ext = extname(file);
        const lang = SOURCE_EXTENSIONS[ext];
        if (lang) {
            breakdown[lang] = (breakdown[lang] || 0) + 1;
        }
    }
    return breakdown;
}
/**
 * Detect primary language by file count.
 *
 * @param breakdown - Language breakdown from computeLanguageBreakdown
 * @returns Language name with the highest file count, or 'Unknown'
 */
function detectPrimaryLanguage(breakdown) {
    let maxCount = 0;
    let primary = 'Unknown';
    for (const [lang, count] of Object.entries(breakdown)) {
        if (count > maxCount) {
            maxCount = count;
            primary = lang;
        }
    }
    return primary;
}
// ── LOC Counting ────────────────────────────────────────────────
/**
 * Count non-empty lines across all source files.
 *
 * @param files - Array of absolute file paths
 * @returns Total non-empty line count
 */
function countLinesOfCode(files) {
    let total = 0;
    for (const file of files) {
        try {
            const content = readFileSync(file, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim().length > 0) {
                    total++;
                }
            }
        }
        catch {
            // Skip unreadable files
        }
    }
    return total;
}
// ── Lint Error Counting ────────────────────────────────────────
/**
 * Count ESLint errors if eslint is available.
 * Returns -1 if eslint is not installed or not runnable.
 *
 * @param workDir - Project root directory
 * @param log - Logger instance
 * @returns Error count, or -1 if eslint is not available
 */
function countLintErrors(workDir, log) {
    // Check for eslint availability
    const eslintPaths = [
        join(workDir, 'node_modules', '.bin', 'eslint'),
        join(workDir, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    ];
    let eslintBin = null;
    for (const p of eslintPaths) {
        if (existsSync(p)) {
            eslintBin = p;
            break;
        }
    }
    if (!eslintBin) {
        // Try global eslint
        try {
            execSync('which eslint', { cwd: workDir, stdio: 'pipe', timeout: 5000 });
            eslintBin = 'eslint';
        }
        catch {
            log.debug('baseline', 'eslint_not_available', {});
            return -1;
        }
    }
    try {
        // Use execFileSync to prevent shell injection via eslintBin path
        const resolvedBin = resolve(eslintBin);
        const result = execFileSync(resolvedBin, ['--format', 'json', '.'], {
            cwd: workDir,
            stdio: 'pipe',
            timeout: 60000,
            encoding: 'utf-8',
        });
        const parsed = JSON.parse(result);
        let errorCount = 0;
        if (Array.isArray(parsed)) {
            for (const fileResult of parsed) {
                errorCount += fileResult.errorCount ?? 0;
            }
        }
        return errorCount;
    }
    catch {
        log.debug('telemetry', 'eslint_parse_failed', {});
        return -1;
    }
}
// ── Type Error Counting ────────────────────────────────────────
/**
 * Count TypeScript type errors if tsc is available.
 * Returns -1 if tsc is not installed or not runnable.
 *
 * @param workDir - Project root directory
 * @param log - Logger instance
 * @returns Error count, or -1 if tsc is not available
 */
function countTypeErrors(workDir, log) {
    // Only relevant if tsconfig.json exists
    if (!existsSync(join(workDir, 'tsconfig.json'))) {
        return -1;
    }
    const tscPaths = [
        join(workDir, 'node_modules', '.bin', 'tsc'),
        join(workDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    ];
    let tscBin = null;
    for (const p of tscPaths) {
        if (existsSync(p)) {
            tscBin = p;
            break;
        }
    }
    if (!tscBin) {
        try {
            execSync('which tsc', { cwd: workDir, stdio: 'pipe', timeout: 5000 });
            tscBin = 'tsc';
        }
        catch {
            log.debug('baseline', 'tsc_not_available', {});
            return -1;
        }
    }
    try {
        // Use execFileSync to prevent shell injection via tscBin path
        const resolvedBin = resolve(tscBin);
        let result;
        try {
            result = execFileSync(resolvedBin, ['--noEmit'], {
                cwd: workDir,
                stdio: 'pipe',
                timeout: 120000,
                encoding: 'utf-8',
            });
        }
        catch (err) {
            // tsc exits non-zero when there are type errors — capture stderr/stdout
            const execErr = err;
            result = (execErr.stdout ?? '') + (execErr.stderr ?? '');
        }
        // Count lines matching "error TS"
        const lines = result.split('\n');
        let errorCount = 0;
        for (const line of lines) {
            if (line.includes('error TS')) {
                errorCount++;
            }
        }
        return errorCount;
    }
    catch {
        log.debug('telemetry', 'tsc_execution_failed', {});
        return -1;
    }
}
/**
 * Format a baseline snapshot for console display.
 *
 * @param snapshot - The baseline snapshot to format
 * @returns Formatted string for CLI output
 */
export function formatBaseline(snapshot) {
    const lintDisplay = snapshot.lint_error_count === -1 ? 'N/A (eslint not available)' : String(snapshot.lint_error_count);
    const typeDisplay = snapshot.type_error_count === -1 ? 'N/A (tsc not available)' : String(snapshot.type_error_count);
    const langBreakdown = Object.entries(snapshot.language_breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(', ');
    const lines = [
        'Code Quality Baseline',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `  Timestamp:        ${snapshot.timestamp}`,
        `  Source Files:     ${snapshot.file_count}`,
        `  Lines of Code:    ${snapshot.loc.toLocaleString()}`,
        `  Test Files:       ${snapshot.test_file_count}`,
        `  Lint Errors:      ${lintDisplay}`,
        `  Type Errors:      ${typeDisplay}`,
        `  Primary Language: ${snapshot.primary_language}`,
        `  Breakdown:        ${langBreakdown || 'No source files found'}`,
    ];
    return lines.join('\n');
}
//# sourceMappingURL=baseline-collector.js.map
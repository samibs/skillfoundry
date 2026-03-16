/**
 * STORY-014: P95 Gate Latency Enforcement
 *
 * Records gate execution times and enforces P95 <500ms per gate tier.
 * Storage: `.skillfoundry/perf.jsonl` (JSONL append-only).
 * Enforcement: CI can run `sf benchmark --perf` to check P95 regressions.
 */
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
// ── Constants ─────────────────────────────────────────────────────────────────
const PERF_DIR = '.skillfoundry';
const PERF_FILE = 'perf.jsonl';
const DEFAULT_P95_THRESHOLD_MS = 500;
// ── Recording ─────────────────────────────────────────────────────────────────
/**
 * Record a gate execution time.
 */
export function recordGatePerf(workDir, result, runId) {
    const resolvedWorkDir = resolve(workDir);
    const dirPath = join(resolvedWorkDir, PERF_DIR);
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }
    const entry = {
        gate: result.tier,
        duration_ms: result.durationMs,
        timestamp: new Date().toISOString(),
        run_id: runId,
    };
    const filePath = join(resolvedWorkDir, PERF_DIR, PERF_FILE);
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}
/**
 * Record multiple gate results at once.
 */
export function recordGateResults(workDir, results, runId) {
    for (const result of results) {
        recordGatePerf(workDir, result, runId);
    }
}
// ── Reading ───────────────────────────────────────────────────────────────────
/**
 * Read all perf entries from the log.
 */
export function readPerfLog(workDir) {
    const filePath = join(resolve(workDir), PERF_DIR, PERF_FILE);
    if (!existsSync(filePath))
        return [];
    const content = readFileSync(filePath, 'utf-8');
    const entries = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            entries.push(JSON.parse(trimmed));
        }
        catch {
            // Skip malformed
        }
    }
    return entries;
}
// ── Statistics ─────────────────────────────────────────────────────────────────
/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
/**
 * Compute performance statistics per gate tier.
 */
export function computePerfStats(entries) {
    const byGate = new Map();
    for (const entry of entries) {
        if (!byGate.has(entry.gate)) {
            byGate.set(entry.gate, []);
        }
        byGate.get(entry.gate).push(entry.duration_ms);
    }
    const stats = [];
    for (const [gate, durations] of byGate) {
        const sorted = [...durations].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        stats.push({
            gate,
            count: sorted.length,
            min_ms: sorted[0],
            max_ms: sorted[sorted.length - 1],
            avg_ms: Math.round(sum / sorted.length),
            p50_ms: percentile(sorted, 50),
            p95_ms: percentile(sorted, 95),
            p99_ms: percentile(sorted, 99),
        });
    }
    return stats.sort((a, b) => a.gate.localeCompare(b.gate));
}
// ── Enforcement ───────────────────────────────────────────────────────────────
/**
 * Check P95 gate latency against threshold.
 * T3 (tests) is excluded from the check since test duration depends on suite size.
 */
export function checkP95(workDir, thresholdMs = DEFAULT_P95_THRESHOLD_MS, minSamples = 5) {
    const entries = readPerfLog(workDir);
    const stats = computePerfStats(entries);
    const violations = [];
    for (const stat of stats) {
        // Skip T3 (test duration depends on suite size, not framework perf)
        if (stat.gate === 'T3')
            continue;
        // Need enough samples for meaningful P95
        if (stat.count < minSamples)
            continue;
        if (stat.p95_ms > thresholdMs) {
            violations.push({
                gate: stat.gate,
                p95_ms: stat.p95_ms,
                threshold_ms: thresholdMs,
            });
        }
    }
    return {
        passed: violations.length === 0,
        stats,
        violations,
    };
}
/**
 * Format perf check result as human-readable text.
 */
export function formatPerfResult(result) {
    const lines = [
        '',
        '  Gate Performance (P95 Latency)',
        '  ═══════════════════════════════════',
    ];
    for (const stat of result.stats) {
        const isT3 = stat.gate === 'T3';
        const p95Icon = isT3 ? '\x1b[2m○\x1b[0m' :
            (stat.p95_ms <= 500 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m');
        lines.push(`  ${p95Icon} ${stat.gate}  P50: ${stat.p50_ms}ms  P95: ${stat.p95_ms}ms  P99: ${stat.p99_ms}ms  (${stat.count} samples)${isT3 ? ' [excluded]' : ''}`);
    }
    if (result.violations.length > 0) {
        lines.push('');
        lines.push('  \x1b[31mViolations:\x1b[0m');
        for (const v of result.violations) {
            lines.push(`    ${v.gate}: P95 ${v.p95_ms}ms > threshold ${v.threshold_ms}ms`);
        }
    }
    lines.push('');
    lines.push(result.passed
        ? '  \x1b[32mPerformance check: PASS\x1b[0m'
        : '  \x1b[31mPerformance check: FAIL\x1b[0m');
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=perf-tracker.js.map
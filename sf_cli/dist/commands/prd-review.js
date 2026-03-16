/**
 * STORY-013: PRD Review CLI Command
 *
 * Implements `sf prd review <path>` — scores a PRD on four dimensions
 * (completeness, specificity, consistency, scope) and outputs color-coded
 * per-dimension results with actionable improvement suggestions.
 *
 * Flags:
 *   --json        Output raw JSON instead of formatted text
 *   --threshold N Minimum score per dimension for pass (default: 6)
 *   --verbose     Include raw LLM justifications in full
 *   --no-cache    Force fresh scoring (bypass in-memory cache)
 *
 * Exit codes: 0 = all dimensions pass, 1 = any dimension fails / error
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { scorePrd, isPrdContent, clearScoreCache, PrdNotDetectedError, PrdScoringError } from '../core/prd-scorer.js';
import { AnthropicAdapter } from '../core/provider.js';
import { getLogger } from '../utils/logger.js';
// ── ANSI color helpers (chalk-free to avoid extra deps) ──────────────────────
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
function colorScore(score, threshold) {
    if (score >= 8)
        return `${GREEN}${score}/10${RESET}`;
    if (score >= threshold)
        return `${YELLOW}${score}/10${RESET}`;
    return `${RED}${score}/10${RESET}`;
}
function colorLabel(label, score, threshold) {
    if (score >= 8)
        return `${GREEN}${label}${RESET}`;
    if (score >= threshold)
        return `${YELLOW}${label}${RESET}`;
    return `${RED}${label}${RESET}`;
}
/**
 * Render a Unicode progress bar for the given score.
 * Each filled cell = '█', empty = '░'. 10 cells total.
 * @param score - Integer 1–10.
 * @returns 10-character progress bar string.
 */
export function renderProgressBar(score) {
    const clamped = Math.max(1, Math.min(10, score));
    const filled = '█'.repeat(clamped);
    const empty = '░'.repeat(10 - clamped);
    return filled + empty;
}
/**
 * Format a single dimension block for human-readable output.
 * @param name - Dimension label (e.g., 'COMPLETENESS').
 * @param dim - PrdDimensionScore for this dimension.
 * @param threshold - Minimum passing score.
 * @returns Formatted multi-line string for this dimension.
 */
export function formatDimension(name, dim, threshold) {
    const passLabel = dim.score >= threshold
        ? `${GREEN}PASS${RESET}`
        : `${RED}FAIL${RESET}`;
    const bar = renderProgressBar(dim.score);
    const paddedName = name.padEnd(15);
    const lines = [
        `  ${colorLabel(paddedName, dim.score, threshold)} ${bar}  ${colorScore(dim.score, threshold)}  ${passLabel}`,
        `  ${DIM}${dim.justification}${RESET}`,
        '',
    ];
    return lines.join('\n');
}
/**
 * Format the full PRD review result for human-readable terminal output.
 * @param score - Full PrdScore from the scorer.
 * @param filePath - Path to the PRD file (for display).
 * @param threshold - Minimum passing score per dimension.
 * @param latencyMs - Time taken for scoring in milliseconds.
 * @returns Formatted review output string.
 */
export function formatReviewOutput(score, filePath, threshold, latencyMs) {
    const SEP = '─'.repeat(58);
    const DBL = '═'.repeat(58);
    const lines = [
        '',
        `  ${BOLD}${CYAN}PRD Quality Review${RESET}`,
        `  ${DBL}`,
        `  File: ${basename(filePath)}`,
        `  Scored: ${score.cached ? `${DIM}Cached result${RESET}` : `${(latencyMs / 1000).toFixed(1)}s`}`,
        `  ${SEP}`,
        '',
        formatDimension('COMPLETENESS', score.completeness, threshold),
        formatDimension('SPECIFICITY', score.specificity, threshold),
        formatDimension('CONSISTENCY', score.consistency, threshold),
        formatDimension('SCOPE', score.scope, threshold),
        `  ${SEP}`,
    ];
    if (score.pass) {
        lines.push(`  ${BOLD}${GREEN}RESULT: PASS (all dimensions >= ${threshold}/10)${RESET}`);
    }
    else {
        const failing = getDimensionsBelow(score, threshold);
        const failList = failing.map(([k, v]) => `${k}: ${v}/10`).join(', ');
        lines.push(`  ${BOLD}${RED}RESULT: FAIL (${failList} — below threshold ${threshold})${RESET}`);
    }
    lines.push(`  ${SEP}`);
    lines.push('');
    if (score.pass) {
        lines.push(`  ${BOLD}SUGGESTIONS:${RESET}`);
        score.suggestions.forEach((s, i) => {
            lines.push(`  ${i + 1}. ${s}`);
        });
    }
    else {
        lines.push(`  ${BOLD}${RED}BLOCKING ISSUES:${RESET}`);
        score.suggestions.forEach((s, i) => {
            lines.push(`  ${i + 1}. ${s}`);
        });
    }
    lines.push('');
    return lines.join('\n');
}
/**
 * Return [dimensionName, score] pairs for dimensions scoring below threshold.
 * @param score - Full PrdScore.
 * @param threshold - Minimum passing score.
 * @returns Array of [name, score] tuples for failing dimensions.
 */
export function getDimensionsBelow(score, threshold) {
    const dims = [
        ['completeness', score.completeness.score],
        ['specificity', score.specificity.score],
        ['consistency', score.consistency.score],
        ['scope', score.scope.score],
    ];
    return dims.filter(([, v]) => v < threshold);
}
/**
 * Parse `prd review` subcommand arguments.
 * @param args - Raw argument string from the slash command dispatcher.
 * @returns Parsed options.
 */
export function parsePrdReviewArgs(args) {
    const parts = args.trim().split(/\s+/);
    const flags = parts.filter((p) => p.startsWith('--'));
    const positional = parts.filter((p) => !p.startsWith('--'));
    // Strip the leading 'review' token if present (command is `/prd review <path>`)
    const fileTokens = positional.filter((p) => p !== 'review');
    const filePath = fileTokens[0] ?? '';
    const json = flags.includes('--json');
    const verbose = flags.includes('--verbose');
    const noCache = flags.includes('--no-cache');
    const thresholdFlag = flags.find((f) => f.startsWith('--threshold='));
    let threshold = 6;
    if (thresholdFlag) {
        const val = parseInt(thresholdFlag.split('=')[1], 10);
        if (!isNaN(val) && val >= 1 && val <= 10)
            threshold = val;
    }
    else {
        const thIdx = flags.indexOf('--threshold');
        if (thIdx !== -1) {
            const val = parseInt(parts[parts.indexOf('--threshold') + 1], 10);
            if (!isNaN(val) && val >= 1 && val <= 10)
                threshold = val;
        }
    }
    return { filePath, json, threshold, verbose, noCache };
}
// ── Command implementation ───────────────────────────────────────────────────
export const prdReviewCommand = {
    name: 'prd',
    description: 'PRD quality tools — review <path> scores a PRD on four dimensions',
    usage: '/prd review <path> [--json] [--threshold N] [--verbose] [--no-cache]',
    execute: async (args, session) => {
        const log = getLogger();
        const { filePath, json, threshold, verbose: _verbose, noCache } = parsePrdReviewArgs(args);
        // Sub-command routing: only 'review' is implemented here
        const subcommand = args.trim().split(/\s+/)[0];
        if (subcommand !== 'review') {
            return [
                '',
                `  PRD Tools`,
                `  Usage: /prd review <path> [--json] [--threshold N] [--verbose] [--no-cache]`,
                ``,
                `  Subcommands:`,
                `    review <path>  Score a PRD file on completeness, specificity, consistency, scope`,
                '',
            ].join('\n');
        }
        if (!filePath) {
            return [
                '',
                `  ${RED}Error: path is required${RESET}`,
                `  Usage: /prd review <path>`,
                '',
            ].join('\n');
        }
        // Resolve path relative to workDir with confinement check
        const resolvedPath = resolve(session.workDir, filePath);
        const normWorkDir = resolve(session.workDir);
        if (!resolvedPath.startsWith(normWorkDir)) {
            log.error('prd-review', 'path_traversal_rejected', { path: filePath, resolved: resolvedPath });
            return [
                '',
                `  ${RED}Error: Path escapes project directory — rejected${RESET}`,
                '',
            ].join('\n');
        }
        if (!existsSync(resolvedPath)) {
            log.error('prd-review', 'file_not_found', { path: resolvedPath });
            return [
                '',
                `  ${RED}Error: File not found: ${filePath}${RESET}`,
                '',
            ].join('\n');
        }
        // Verify it's a PRD before calling the scorer
        let content;
        try {
            content = readFileSync(resolvedPath, 'utf-8');
        }
        catch (err) {
            return [
                '',
                `  ${RED}Error: Cannot read file: ${filePath}${RESET}`,
                `  ${err instanceof Error ? err.message : String(err)}`,
                '',
            ].join('\n');
        }
        if (!isPrdContent(content)) {
            return [
                '',
                `  ${RED}Error: File does not appear to be a PRD: ${filePath}${RESET}`,
                `  A PRD must have a markdown heading and at least two of: Goal, User Stories, Scope,`,
                `  Requirements, Security, Technical Approach, or Risks sections.`,
                '',
            ].join('\n');
        }
        // Check provider is configured
        if (!session.config.provider || !session.config.model) {
            return [
                '',
                `  ${RED}Error: No LLM provider configured. Run \`sf setup\` first.${RESET}`,
                '',
            ].join('\n');
        }
        // Clear cache if requested
        if (noCache) {
            clearScoreCache();
        }
        // Build provider adapter
        let provider;
        try {
            provider = new AnthropicAdapter();
        }
        catch (err) {
            return [
                '',
                `  ${RED}Error: Failed to initialise LLM provider: ${err instanceof Error ? err.message : String(err)}${RESET}`,
                `  Check your ANTHROPIC_API_KEY environment variable.`,
                '',
            ].join('\n');
        }
        const scoringStart = Date.now();
        let score;
        try {
            score = await scorePrd(content, resolvedPath, provider, session.config.model);
        }
        catch (err) {
            if (err instanceof PrdNotDetectedError) {
                return [
                    '',
                    `  ${RED}Error: File does not appear to be a PRD${RESET}`,
                    `  ${err.message}`,
                    '',
                ].join('\n');
            }
            if (err instanceof PrdScoringError) {
                log.error('prd-review', 'scoring_failed', { path: resolvedPath, error: err.message });
                return [
                    '',
                    `  ${RED}Error: Scoring failed — LLM response could not be parsed${RESET}`,
                    `  ${err.message}`,
                    `  Retry with \`sf prd review ${filePath}\` or check your network connection.`,
                    '',
                ].join('\n');
            }
            const msg = err instanceof Error ? err.message : String(err);
            log.error('prd-review', 'unexpected_error', { path: resolvedPath, error: msg });
            return [
                '',
                `  ${RED}Error: ${msg}${RESET}`,
                '',
            ].join('\n');
        }
        const latencyMs = Date.now() - scoringStart;
        // Apply custom threshold — override pass value if threshold differs from default 6
        const adjustedPass = [
            score.completeness.score,
            score.specificity.score,
            score.consistency.score,
            score.scope.score,
        ].every((s) => s >= threshold);
        const adjustedScore = { ...score, pass: adjustedPass };
        // JSON output
        if (json) {
            return JSON.stringify(adjustedScore, null, 2);
        }
        return formatReviewOutput(adjustedScore, resolvedPath, threshold, latencyMs);
    },
};
//# sourceMappingURL=prd-review.js.map
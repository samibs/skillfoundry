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
import { resolve, basename, join } from 'node:path';
import { scorePrd, isPrdContent, clearScoreCache, PrdNotDetectedError, PrdScoringError } from '../core/prd-scorer.js';
import { AnthropicAdapter } from '../core/provider.js';
import { getLogger } from '../utils/logger.js';
import { getFrameworkRoot } from '../core/framework.js';
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
// ── PRD creation ─────────────────────────────────────────────────────────────
/**
 * Turn a feature idea into a filename slug: lowercase ASCII words joined by
 * hyphens, at most 50 characters, never empty.
 */
export function slugifyIdea(idea) {
    const slug = idea
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
        .replace(/-+$/, '');
    return slug || 'feature';
}
/** Strip a leading `create` keyword and surrounding quotes from `/prd` arguments. */
export function parsePrdIdea(args) {
    return args
        .trim()
        .replace(/^create\b\s*/i, '')
        .trim()
        .replace(/^(["'])([\s\S]*)\1$/, '$2')
        .trim();
}
/**
 * Build the prompt for `/prd create`: the same PRD Architect instructions the IDE
 * `/prd` skill uses (`.claude/commands/prd.md`), plus where to save the result.
 * Throws if the framework's skill file cannot be found.
 */
export function buildPrdCreatePrompt(idea, frameworkRoot, today = new Date()) {
    const skillPath = join(frameworkRoot, '.claude', 'commands', 'prd.md');
    if (!existsSync(skillPath)) {
        throw new Error(`PRD skill not found at ${skillPath}`);
    }
    const skill = readFileSync(skillPath, 'utf-8');
    const date = today.toISOString().slice(0, 10);
    const targetPath = `genesis/${date}-${slugifyIdea(idea)}.md`;
    const prompt = [
        skill.trim(),
        '',
        '---',
        '',
        '## This request',
        '',
        `Feature idea: ${idea}`,
        '',
        'Follow the PRD workflow above. Ask the required intake questions first if the idea does not',
        'already answer them, and wait for the answers. When the PRD is complete, save it with the',
        `file-write tool to \`${targetPath}\` in the current project (create \`genesis/\` if needed;`,
        "if the project has its own `genesis/TEMPLATE.md`, follow that template's sections). Then tell",
        `the user to check it with \`/prd review ${targetPath}\` and build it with \`/forge\`.`,
    ].join('\n');
    return { prompt, targetPath };
}
function prdUsage() {
    return [
        '',
        `  PRD Tools`,
        `  Usage: /prd create <idea>`,
        `         /prd review <path> [--json] [--threshold N] [--verbose] [--no-cache]`,
        ``,
        `  Subcommands:`,
        `    create <idea>  Draft a PRD with the AI and save it to genesis/`,
        `    review <path>  Score a PRD file on completeness, specificity, consistency, scope`,
        ``,
        `  /prd <idea> (without "create") also drafts a PRD.`,
        '',
    ].join('\n');
}
async function createPrd(args, session) {
    const idea = parsePrdIdea(args);
    if (!idea) {
        return ['', `  ${RED}Error: describe the feature${RESET}`, `  Usage: /prd create <idea>`, ''].join('\n');
    }
    if (!session.sendToAI) {
        return ['', `  ${RED}Error: /prd create needs the interactive sf session${RESET}`, ''].join('\n');
    }
    let built;
    try {
        built = buildPrdCreatePrompt(idea, getFrameworkRoot());
    }
    catch (err) {
        getLogger().error('prd-review', 'create_skill_unavailable', { error: err instanceof Error ? err.message : String(err) });
        return ['', `  ${RED}Error: ${err instanceof Error ? err.message : String(err)}${RESET}`, ''].join('\n');
    }
    await session.sendToAI(built.prompt, `/prd create ${idea}  →  ${built.targetPath}`);
}
// ── Command implementation ───────────────────────────────────────────────────
export const prdReviewCommand = {
    name: 'prd',
    description: 'PRDs — create <idea> drafts one with the AI; review <path> scores one on four dimensions',
    usage: '/prd create <idea> | /prd review <path> [--json] [--threshold N] [--verbose] [--no-cache]',
    execute: async (args, session) => {
        const log = getLogger();
        const { filePath, json, threshold, verbose: _verbose, noCache } = parsePrdReviewArgs(args);
        // Sub-command routing: 'review' scores a file; anything else is a feature idea to draft
        const subcommand = args.trim().split(/\s+/)[0];
        if (!subcommand || subcommand === 'help' || subcommand === '--help') {
            return prdUsage();
        }
        if (subcommand !== 'review') {
            return createPrd(args, session);
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
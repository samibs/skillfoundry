/**
 * Token Optimizer — Context compression to reduce LLM costs.
 *
 * Strategies: strip markdown overhead, collapse repeated patterns,
 * strip code comments, truncate long file contents, deduplicate
 * instructions, and compact tables.
 */
// ── Constants ───────────────────────────────────────────────────
const LINE = '\u2501';
const COST_PER_1K_INPUT = 0.003; // approximate $/1K tokens
// ── Token Estimation ────────────────────────────────────────────
export function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / 3.5);
}
// ── Compression Strategies ──────────────────────────────────────
/**
 * Convert markdown headers to bold, tables to key-value, remove HRs.
 */
export function stripMarkdownOverhead(text) {
    let result = text;
    // Headers → bold (## Heading → **Heading**)
    result = result.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');
    // Horizontal rules → empty
    result = result.replace(/^[-*_]{3,}\s*$/gm, '');
    // Clean up multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');
    return result;
}
/**
 * Collapse 3+ repeated or similar lines into a count.
 */
export function collapseRepeatedPatterns(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
        const normalized = lines[i].replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '[timestamp]')
            .replace(/\d+\.\d+\.\d+\.\d+/g, '[ip]')
            .replace(/\b[0-9a-f]{8,}\b/gi, '[hash]')
            .trim();
        if (!normalized) {
            result.push(lines[i]);
            i++;
            continue;
        }
        let count = 1;
        let j = i + 1;
        while (j < lines.length) {
            const nextNorm = lines[j].replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '[timestamp]')
                .replace(/\d+\.\d+\.\d+\.\d+/g, '[ip]')
                .replace(/\b[0-9a-f]{8,}\b/gi, '[hash]')
                .trim();
            if (nextNorm === normalized) {
                count++;
                j++;
            }
            else {
                break;
            }
        }
        if (count >= 3) {
            result.push(`${count}x ${normalized}`);
        }
        else {
            for (let k = i; k < j; k++) {
                result.push(lines[k]);
            }
        }
        i = j;
    }
    return result.join('\n');
}
/**
 * Remove code comments (// and /* *\/) but preserve JSDoc.
 */
export function stripCodeComments(code) {
    if (!code)
        return code;
    // Remove multi-line comments (but not JSDoc /** ... */)
    let result = code.replace(/\/\*(?!\*)[\s\S]*?\*\//g, '');
    // Remove single-line comments (but not URLs like http://)
    result = result.replace(/(?<![:"'])\/\/(?!\/)[^\n]*/g, '');
    // Clean up blank lines left behind
    result = result.replace(/\n{3,}/g, '\n\n');
    return result;
}
/**
 * Truncate long code blocks (>50 lines) to first 10 + last 10.
 */
export function truncateFileContents(text, maxLines = 50) {
    const keepLines = 10;
    return text.replace(/```[\s\S]*?```/g, (block) => {
        const lines = block.split('\n');
        if (lines.length <= maxLines + 2)
            return block; // +2 for ``` markers
        const header = lines[0]; // ```language
        const footer = lines[lines.length - 1]; // ```
        const content = lines.slice(1, -1);
        const truncated = content.length - keepLines * 2;
        return [
            header,
            ...content.slice(0, keepLines),
            `[... ${truncated} lines truncated ...]`,
            ...content.slice(-keepLines),
            footer,
        ].join('\n');
    });
}
/**
 * Remove duplicate sentences across the text.
 */
export function deduplicateInstructions(text) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const seen = new Set();
    const result = [];
    for (const sentence of sentences) {
        const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
        if (normalized.length < 10) {
            result.push(sentence);
            continue;
        }
        if (!seen.has(normalized)) {
            seen.add(normalized);
            result.push(sentence);
        }
    }
    return result.join(' ');
}
/**
 * Convert markdown tables to compact key: value lists.
 */
export function compactTables(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
        // Detect table: line with |, followed by separator line with |---
        if (lines[i].includes('|') &&
            i + 1 < lines.length &&
            /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
            const headers = lines[i].split('|').filter((h) => h.trim()).map((h) => h.trim());
            i += 2; // skip header + separator
            while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
                const cells = lines[i].split('|').filter((c) => c.trim()).map((c) => c.trim());
                const pairs = headers.map((h, j) => `${h}: ${cells[j] || ''}`);
                result.push(`- ${pairs.join(', ')}`);
                i++;
            }
        }
        else {
            result.push(lines[i]);
            i++;
        }
    }
    return result.join('\n');
}
// ── Strategy Registry ───────────────────────────────────────────
const STRATEGY_MAP = {
    'strip-markdown': stripMarkdownOverhead,
    'collapse-repeats': collapseRepeatedPatterns,
    'strip-comments': stripCodeComments,
    'truncate-files': truncateFileContents,
    'dedup-instructions': deduplicateInstructions,
    'compact-tables': compactTables,
};
export function getAllCompressionStrategies() {
    return [
        { id: 'strip-markdown', description: 'Convert headers to bold, remove horizontal rules' },
        { id: 'collapse-repeats', description: 'Collapse 3+ similar lines into count + pattern' },
        { id: 'strip-comments', description: 'Remove code comments (preserve JSDoc)' },
        { id: 'truncate-files', description: 'Truncate code blocks >50 lines to first/last 10' },
        { id: 'dedup-instructions', description: 'Remove duplicate sentences across text' },
        { id: 'compact-tables', description: 'Convert markdown tables to key:value lists' },
    ];
}
// ── Main Functions ──────────────────────────────────────────────
/**
 * Analyze token usage in a text, broken down by section.
 */
export function analyzeTokens(text) {
    const totalTokens = estimateTokens(text);
    const sections = text.split(/^(?=##?\s)/m);
    const breakdown = sections
        .filter((s) => s.trim())
        .map((s) => {
        const heading = s.match(/^##?\s+(.+)/m)?.[1] || '(preamble)';
        const tokens = estimateTokens(s);
        return { section: heading.slice(0, 40), tokens, pct: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0 };
    })
        .sort((a, b) => b.tokens - a.tokens);
    const suggestions = [];
    for (const s of breakdown) {
        if (s.pct > 25)
            suggestions.push(`"${s.section}" uses ${s.pct.toFixed(0)}% of tokens — consider trimming`);
    }
    if (/\|.*\|.*\|/m.test(text))
        suggestions.push('Tables detected — use compact-tables to save ~30%');
    if (/```[\s\S]{2000,}?```/.test(text))
        suggestions.push('Large code blocks — use truncate-files to trim');
    if (totalTokens > 10000)
        suggestions.push('Context >10K tokens — consider aggressive compression');
    return {
        totalTokens,
        breakdown,
        suggestions,
        estimatedCostUsd: (totalTokens / 1000) * COST_PER_1K_INPUT,
    };
}
/**
 * Compress text using selected (or all) strategies.
 */
export function compressContext(text, options) {
    const strategies = options?.strategies || Object.keys(STRATEGY_MAP);
    const originalTokens = estimateTokens(text);
    const applied = [];
    let current = text;
    for (const stratId of strategies) {
        const fn = STRATEGY_MAP[stratId];
        if (!fn)
            continue;
        const beforeTokens = estimateTokens(current);
        const after = fn(current);
        const afterTokens = estimateTokens(after);
        const saved = beforeTokens - afterTokens;
        if (saved > 0) {
            current = after;
            applied.push({
                strategy: stratId,
                originalTokens: beforeTokens,
                compressedTokens: afterTokens,
                savedTokens: saved,
                savedPct: beforeTokens > 0 ? (saved / beforeTokens) * 100 : 0,
            });
        }
        if (options?.maxTokens && estimateTokens(current) <= options.maxTokens)
            break;
    }
    const compressedTokens = estimateTokens(current);
    const totalSaved = originalTokens - compressedTokens;
    return {
        original: text,
        compressed: current,
        originalTokens,
        compressedTokens,
        totalSaved,
        totalSavedPct: originalTokens > 0 ? (totalSaved / originalTokens) * 100 : 0,
        strategiesApplied: applied,
    };
}
// ── Formatting ──────────────────────────────────────────────────
export function formatAnalysisReport(analysis) {
    const lines = [
        'Token Analysis',
        LINE.repeat(60),
        `  Total tokens: ~${analysis.totalTokens.toLocaleString()}`,
        `  Estimated cost: $${analysis.estimatedCostUsd.toFixed(4)}/request`,
        '',
        '  Breakdown by section:',
    ];
    for (const s of analysis.breakdown.slice(0, 15)) {
        const bar = '\u2588'.repeat(Math.round(s.pct / 5)) + '\u2591'.repeat(Math.max(0, 20 - Math.round(s.pct / 5)));
        lines.push(`    ${s.section.padEnd(35)} ${String(s.tokens).padStart(6)} (${s.pct.toFixed(0)}%) ${bar}`);
    }
    if (analysis.suggestions.length > 0) {
        lines.push('');
        lines.push('  Suggestions:');
        for (const s of analysis.suggestions) {
            lines.push(`    - ${s}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
export function formatCompressReport(result) {
    const lines = [
        'Token Compression',
        LINE.repeat(60),
        `  Before: ~${result.originalTokens.toLocaleString()} tokens`,
        `  After:  ~${result.compressedTokens.toLocaleString()} tokens`,
        `  Saved:  ~${result.totalSaved.toLocaleString()} tokens (${result.totalSavedPct.toFixed(1)}%)`,
        '',
    ];
    if (result.strategiesApplied.length > 0) {
        lines.push('  Strategies applied:');
        for (const s of result.strategiesApplied) {
            lines.push(`    ${s.strategy.padEnd(22)} -${s.savedTokens} tokens (${s.savedPct.toFixed(1)}%)`);
        }
    }
    else {
        lines.push('  No compression possible — text is already compact.');
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=token-optimizer.js.map
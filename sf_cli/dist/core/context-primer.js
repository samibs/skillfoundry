// Context primer — generates a compact memory bank index for session start.
// Reads all JSONL knowledge files, produces a ~400-800 token markdown summary
// showing entry counts, top entries by weight, and most recent entries.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../utils/logger.js';
const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
const MAX_TOP_ENTRIES = 5;
const MAX_RECENT_ENTRIES = 5;
const SNIPPET_LENGTH = 80;
const STALENESS_THRESHOLD_DAYS = 7;
// ── Core ────────────────────────────────────────────────────────
/**
 * Generate a context primer from all JSONL knowledge files.
 * Returns compact markdown suitable for session-start injection.
 *
 * @param workDir - Project root directory
 * @returns PrimerResult with markdown and metadata
 */
export function generatePrimer(workDir) {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir)) {
        return {
            markdown: '## Memory Bank — Empty\n\nNo knowledge entries found. Run `/gohm` after a forge session to populate.',
            totalEntries: 0,
            estimatedTokens: 20,
            isStale: false,
        };
    }
    // Load all entries from all JSONL files
    const allEntries = [];
    const fileStats = [];
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
        const filePath = join(knowledgeDir, file);
        const entries = loadJSONLFile(filePath);
        const charCount = entries.reduce((sum, e) => sum + (e.content?.length ?? 0), 0);
        fileStats.push({
            fileName: file,
            entryCount: entries.length,
            estimatedTokens: estimateTokens(charCount),
        });
        allEntries.push(...entries);
    }
    if (allEntries.length === 0) {
        return {
            markdown: '## Memory Bank — Empty\n\nKnowledge files exist but contain no entries.',
            totalEntries: 0,
            estimatedTokens: 15,
            isStale: false,
        };
    }
    // Count by type
    const typeCounts = new Map();
    const typeTokens = new Map();
    for (const entry of allEntries) {
        const t = entry.type || 'unknown';
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
        typeTokens.set(t, (typeTokens.get(t) ?? 0) + estimateTokens(entry.content?.length ?? 0));
    }
    // Top entries by weight
    const topByWeight = [...allEntries]
        .filter((e) => typeof e.weight === 'number')
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, MAX_TOP_ENTRIES);
    // Most recent entries
    const topByRecency = [...allEntries]
        .filter((e) => e.created_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_RECENT_ENTRIES);
    // Staleness check
    const newestDate = topByRecency.length > 0 ? new Date(topByRecency[0].created_at) : null;
    const daysSinceNewest = newestDate ? Math.floor((Date.now() - newestDate.getTime()) / 86400000) : Infinity;
    const isStale = daysSinceNewest > STALENESS_THRESHOLD_DAYS;
    // Build markdown
    const lines = [];
    lines.push(`## Memory Bank — ${allEntries.length} entries`);
    lines.push('');
    // Type summary table
    lines.push('| Type | Count | Est. Tokens |');
    lines.push('|------|-------|-------------|');
    for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${type} | ${count} | ~${typeTokens.get(type) ?? 0} |`);
    }
    lines.push('');
    // Top by weight
    if (topByWeight.length > 0) {
        lines.push('### Highest Weight');
        for (const entry of topByWeight) {
            const shortId = shortID(entry.id);
            const snippet = truncate(entry.content, SNIPPET_LENGTH);
            lines.push(`- [${shortId}] ${entry.type} (${(entry.weight ?? 0).toFixed(1)}): "${snippet}"`);
        }
        lines.push('');
    }
    // Most recent
    if (topByRecency.length > 0) {
        lines.push('### Most Recent');
        for (const entry of topByRecency) {
            const shortId = shortID(entry.id);
            const age = formatRelativeAge(entry.created_at);
            const snippet = truncate(entry.content, SNIPPET_LENGTH);
            lines.push(`- [${shortId}] ${entry.type} (${age}): "${snippet}"`);
        }
        lines.push('');
    }
    // Staleness warning
    if (isStale) {
        lines.push(`> **Stale**: Last entry was ${daysSinceNewest}d ago. Consider running \`/gohm\`.`);
        lines.push('');
    }
    lines.push('Use `/recall "query"` to search, `/recall --full <id>` to expand.');
    const markdown = lines.join('\n');
    const primerTokens = estimateTokens(markdown.length);
    log.info('memory', 'context_primer_generated', {
        totalEntries: allEntries.length,
        fileCount: files.length,
        primerTokens,
        isStale,
    });
    return {
        markdown,
        totalEntries: allEntries.length,
        estimatedTokens: primerTokens,
        isStale,
    };
}
// ── Helpers ─────────────────────────────────────────────────────
/**
 * Load and parse a JSONL file, skipping malformed lines.
 */
function loadJSONLFile(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const entries = [];
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.length === 0)
                continue;
            try {
                entries.push(JSON.parse(trimmed));
            }
            catch {
                // Skip malformed lines
            }
        }
        return entries;
    }
    catch {
        return [];
    }
}
/**
 * Estimate token count from character count (chars / 4 heuristic).
 */
function estimateTokens(charCount) {
    return Math.ceil(charCount / 4);
}
/**
 * Truncate a string to maxLen, appending "..." if truncated.
 */
function truncate(text, maxLen) {
    if (!text)
        return '';
    const clean = text.replace(/\n/g, ' ').trim();
    if (clean.length <= maxLen)
        return clean;
    return clean.slice(0, maxLen - 3) + '...';
}
/**
 * Short ID: first 8 chars of UUID.
 */
function shortID(id) {
    if (!id)
        return '???';
    return id.slice(0, 8);
}
/**
 * Format a date as relative age: "today", "1d ago", "7d ago", etc.
 */
export function formatRelativeAge(dateStr) {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime()))
            return 'unknown';
        const days = Math.floor((Date.now() - date.getTime()) / 86400000);
        if (days === 0)
            return 'today';
        if (days === 1)
            return '1d ago';
        if (days < 7)
            return `${days}d ago`;
        if (days < 30)
            return `${Math.floor(days / 7)}w ago`;
        return `${Math.floor(days / 30)}mo ago`;
    }
    catch {
        return 'unknown';
    }
}
// Export for testing
export { loadJSONLFile, estimateTokens, truncate, shortID };
//# sourceMappingURL=context-primer.js.map
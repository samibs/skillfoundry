// Layered recall — progressive disclosure search across knowledge files.
// Three modes: index (compact list), preview (summaries), full (complete entries).
// Reuses TF-IDF scoring from semantic-search.sh, ported to TypeScript.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../utils/logger.js';
const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
const DEFAULT_LIMIT = 20;
const INDEX_SNIPPET_LENGTH = 60;
const PREVIEW_SNIPPET_LENGTH = 200;
// ── Index mode ──────────────────────────────────────────────────
/**
 * Search knowledge and return a compact index of matches.
 * Returns: id, type, snippet (60 chars), score, weight.
 */
export function recallIndex(query, workDir, filters) {
    const log = getLogger();
    const entries = loadAllEntries(workDir);
    const filtered = applyFilters(entries, filters);
    const scored = scoreEntries(filtered, query);
    const limit = filters?.limit ?? DEFAULT_LIMIT;
    const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
        id: s.entry.id,
        type: s.entry.type,
        snippet: truncate(s.entry.content, INDEX_SNIPPET_LENGTH),
        score: s.score,
        weight: s.entry.weight ?? 0,
        scoreBreakdown: s.breakdown,
    }));
    log.debug('memory', 'recall_index', {
        query,
        totalEntries: entries.length,
        filtered: filtered.length,
        results: results.length,
    });
    return results;
}
/**
 * Load specific entries by ID and return content previews (200 chars).
 */
export function recallPreview(ids, workDir) {
    const log = getLogger();
    const entries = loadAllEntries(workDir);
    const idSet = new Set(ids);
    const matched = entries.filter((e) => idSet.has(e.id));
    log.debug('memory', 'recall_preview', {
        requested: ids.length,
        found: matched.length,
    });
    return matched.map((e) => ({
        id: e.id,
        type: e.type,
        content: truncate(e.content, PREVIEW_SNIPPET_LENGTH),
        weight: e.weight ?? 0,
        tags: e.tags ?? [],
        createdAt: e.created_at,
    }));
}
/**
 * Load specific entries by ID and return complete entries.
 */
export function recallFull(ids, workDir) {
    const log = getLogger();
    const entries = loadAllEntries(workDir);
    const idSet = new Set(ids);
    const matched = entries.filter((e) => idSet.has(e.id));
    log.debug('memory', 'recall_full', {
        requested: ids.length,
        found: matched.length,
    });
    return matched.map((e) => ({ entry: e }));
}
function scoreEntries(entries, query) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);
    return entries.map((entry) => {
        const contentLower = (entry.content ?? '').toLowerCase();
        const typeLower = (entry.type ?? '').toLowerCase();
        const tagsLower = (entry.tags ?? []).map((t) => t.toLowerCase());
        // Exact phrase match: +100
        const exactMatch = contentLower.includes(queryLower) ? 100 : 0;
        // Individual word matches: +10 per word
        let wordMatches = 0;
        for (const word of queryWords) {
            if (contentLower.includes(word))
                wordMatches += 10;
        }
        // Type field match: +20
        let typeBonus = 0;
        for (const word of queryWords) {
            if (typeLower.includes(word)) {
                typeBonus = 20;
                break;
            }
        }
        // Weight bonus: +10 * weight
        const weightBonus = Math.round((entry.weight ?? 0) * 10);
        // Tags match: +5 per word
        let tagBonus = 0;
        for (const word of queryWords) {
            for (const tag of tagsLower) {
                if (tag.includes(word)) {
                    tagBonus += 5;
                    break;
                }
            }
        }
        const score = exactMatch + wordMatches + typeBonus + weightBonus + tagBonus;
        const breakdown = { exactMatch, wordMatches, typeBonus, weightBonus, tagBonus };
        return { entry, score, breakdown };
    });
}
// ── Filters ─────────────────────────────────────────────────────
function applyFilters(entries, filters) {
    if (!filters)
        return entries;
    let result = entries;
    // Type filter
    if (filters.type) {
        result = result.filter((e) => e.type === filters.type);
    }
    // Minimum weight
    if (filters.minWeight !== undefined) {
        result = result.filter((e) => (e.weight ?? 0) >= filters.minWeight);
    }
    // Since filter
    if (filters.since) {
        const cutoff = parseSinceFilter(filters.since);
        if (cutoff) {
            result = result.filter((e) => {
                if (!e.created_at)
                    return false;
                return new Date(e.created_at).getTime() >= cutoff.getTime();
            });
        }
    }
    // Tags filter (entry must match at least one tag)
    if (filters.tags && filters.tags.length > 0) {
        const filterTags = new Set(filters.tags.map((t) => t.toLowerCase()));
        result = result.filter((e) => {
            const entryTags = (e.tags ?? []).map((t) => t.toLowerCase());
            return entryTags.some((t) => filterTags.has(t));
        });
    }
    return result;
}
function parseSinceFilter(since) {
    // Handle relative: "7d", "30d", "4w"
    const relMatch = since.match(/^(\d+)([dwm])$/);
    if (relMatch) {
        const value = parseInt(relMatch[1], 10);
        const unit = relMatch[2];
        const now = Date.now();
        switch (unit) {
            case 'd': return new Date(now - value * 86400000);
            case 'w': return new Date(now - value * 7 * 86400000);
            case 'm': return new Date(now - value * 30 * 86400000);
        }
    }
    // Handle ISO date
    try {
        const date = new Date(since);
        if (!isNaN(date.getTime()))
            return date;
    }
    catch {
        // Fall through
    }
    return null;
}
// ── Helpers ─────────────────────────────────────────────────────
function loadAllEntries(workDir) {
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir))
        return [];
    const entries = [];
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
        const filePath = join(knowledgeDir, file);
        try {
            const content = readFileSync(filePath, 'utf-8');
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
        }
        catch {
            // Skip unreadable files
        }
    }
    return entries;
}
function truncate(text, maxLen) {
    if (!text)
        return '';
    const clean = text.replace(/\n/g, ' ').trim();
    if (clean.length <= maxLen)
        return clean;
    return clean.slice(0, maxLen - 3) + '...';
}
// ── Format output ───────────────────────────────────────────────
/**
 * Format index results as compact markdown table.
 */
export function formatIndexResults(results) {
    if (results.length === 0)
        return 'No matching entries found.';
    const lines = [];
    lines.push('| ID | Type | Score | Weight | Content |');
    lines.push('|----|------|-------|--------|---------|');
    for (const r of results) {
        lines.push(`| ${r.id.slice(0, 8)} | ${r.type} | ${r.score} | ${r.weight.toFixed(1)} | ${r.snippet} |`);
    }
    lines.push('');
    lines.push(`${results.length} result(s). Use \`/recall --preview <id1>,<id2>\` to expand.`);
    return lines.join('\n');
}
/**
 * Format preview results as readable markdown.
 */
export function formatPreviewResults(results) {
    if (results.length === 0)
        return 'No entries found for the given IDs.';
    const lines = [];
    for (const r of results) {
        lines.push(`### [${r.id.slice(0, 8)}] ${r.type} (weight: ${r.weight.toFixed(1)})`);
        lines.push(`> ${r.content}`);
        if (r.tags.length > 0)
            lines.push(`Tags: ${r.tags.join(', ')}`);
        lines.push(`Created: ${r.createdAt}`);
        lines.push('');
    }
    lines.push(`Use \`/recall --full <id>\` for complete entries.`);
    return lines.join('\n');
}
/**
 * Format full results as complete JSON blocks.
 */
export function formatFullResults(results) {
    if (results.length === 0)
        return 'No entries found for the given IDs.';
    const lines = [];
    for (const r of results) {
        lines.push(`### [${r.entry.id.slice(0, 8)}] ${r.entry.type}`);
        lines.push('```json');
        lines.push(JSON.stringify(r.entry, null, 2));
        lines.push('```');
        lines.push('');
    }
    return lines.join('\n');
}
// Export for testing
export { loadAllEntries, scoreEntries, applyFilters, parseSinceFilter };
//# sourceMappingURL=layered-recall.js.map
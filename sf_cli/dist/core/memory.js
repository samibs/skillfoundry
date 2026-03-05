// Memory system — reads memory_bank/knowledge/*.jsonl, provides recall and capture.
// Lessons are structured entries that accumulate across sessions.
import { readFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
function loadJsonl(filePath) {
    if (!existsSync(filePath))
        return [];
    try {
        const raw = readFileSync(filePath, 'utf-8');
        return raw
            .split('\n')
            .filter((line) => line.trim())
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((entry) => entry !== null);
    }
    catch {
        return [];
    }
}
function loadAllKnowledge(workDir) {
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir))
        return [];
    const entries = [];
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
        entries.push(...loadJsonl(join(knowledgeDir, file)));
    }
    return entries;
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);
}
function scoreMatch(entry, queryTokens) {
    const entryText = `${entry.content} ${entry.tags.join(' ')} ${entry.type}`.toLowerCase();
    const entryTokens = new Set(tokenize(entryText));
    let matches = 0;
    for (const qt of queryTokens) {
        if (entryTokens.has(qt)) {
            matches++;
        }
        else {
            // Partial match: check if any entry token contains the query token
            for (const et of entryTokens) {
                if (et.includes(qt) || qt.includes(et)) {
                    matches += 0.5;
                    break;
                }
            }
        }
    }
    // Normalize by query length
    const score = queryTokens.length > 0 ? matches / queryTokens.length : 0;
    // Boost recent entries slightly
    const age = Date.now() - new Date(entry.created_at || '2020-01-01').getTime();
    const recencyBoost = Math.max(0, 1 - age / (365 * 24 * 60 * 60 * 1000)); // 1.0 for today, 0 for >1yr
    return score + recencyBoost * 0.1;
}
export function recall(workDir, query, maxResults = 10) {
    const entries = loadAllKnowledge(workDir);
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
        return { entries: entries.slice(0, maxResults), query, matchCount: entries.length };
    }
    const scored = entries
        .map((entry) => ({ entry, score: scoreMatch(entry, queryTokens) }))
        .filter((s) => s.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
    return {
        entries: scored.map((s) => s.entry),
        query,
        matchCount: scored.length,
    };
}
export function capture(workDir, entry, targetFile = 'patterns-universal.jsonl') {
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir)) {
        mkdirSync(knowledgeDir, { recursive: true });
    }
    const fullEntry = {
        ...entry,
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
    };
    const filePath = join(knowledgeDir, targetFile);
    appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', 'utf-8');
    return fullEntry;
}
export function captureLesson(workDir, content, tags, source) {
    return capture(workDir, {
        type: 'lesson',
        content,
        tags,
        source,
    }, 'patterns-universal.jsonl');
}
export function captureDecision(workDir, content, tags, source) {
    return capture(workDir, {
        type: 'decision',
        content,
        tags,
        source,
    }, 'decisions-universal.jsonl');
}
export function captureError(workDir, content, tags, source) {
    return capture(workDir, {
        type: 'error',
        content,
        tags,
        source,
    }, 'errors-universal.jsonl');
}
export function getMemoryStats(workDir) {
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir)) {
        return { totalEntries: 0, byType: {}, byFile: {}, recentEntries: [] };
    }
    const byType = {};
    const byFile = {};
    const allEntries = [];
    const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
        const entries = loadJsonl(join(knowledgeDir, file));
        byFile[file] = entries.length;
        for (const entry of entries) {
            byType[entry.type] = (byType[entry.type] || 0) + 1;
            allEntries.push(entry);
        }
    }
    // Sort by created_at descending
    allEntries.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return {
        totalEntries: allEntries.length,
        byType,
        byFile,
        recentEntries: allEntries.slice(0, 5),
    };
}
//# sourceMappingURL=memory.js.map
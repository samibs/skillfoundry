// Memory system — reads memory_bank/knowledge/*.jsonl, provides recall and capture.
// Lessons are structured entries that accumulate across sessions.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');

export interface MemoryEntry {
  id: string;
  type: 'fact' | 'decision' | 'error' | 'pattern' | 'preference' | 'lesson';
  content: string;
  tags: string[];
  source?: string;
  created_at: string;
  project?: string;
  confidence?: number;
}

export interface RecallResult {
  entries: MemoryEntry[];
  query: string;
  matchCount: number;
}

function loadJsonl(filePath: string): MemoryEntry[] {
  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as MemoryEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is MemoryEntry => entry !== null);
  } catch {
    return [];
  }
}

function loadAllKnowledge(workDir: string): MemoryEntry[] {
  const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
  if (!existsSync(knowledgeDir)) return [];

  const entries: MemoryEntry[] = [];
  const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.jsonl'));

  for (const file of files) {
    entries.push(...loadJsonl(join(knowledgeDir, file)));
  }

  return entries;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreMatch(entry: MemoryEntry, queryTokens: string[]): number {
  const entryText = `${entry.content} ${entry.tags.join(' ')} ${entry.type}`.toLowerCase();
  const entryTokens = new Set(tokenize(entryText));

  let matches = 0;
  for (const qt of queryTokens) {
    if (entryTokens.has(qt)) {
      matches++;
    } else {
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

export function recall(workDir: string, query: string, maxResults: number = 10): RecallResult {
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

export function capture(
  workDir: string,
  entry: Omit<MemoryEntry, 'id' | 'created_at'>,
  targetFile: string = 'patterns-universal.jsonl',
): MemoryEntry {
  const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
  }

  const fullEntry: MemoryEntry = {
    ...entry,
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };

  const filePath = join(knowledgeDir, targetFile);
  appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', 'utf-8');

  return fullEntry;
}

export function captureLesson(
  workDir: string,
  content: string,
  tags: string[],
  source?: string,
): MemoryEntry {
  return capture(workDir, {
    type: 'lesson',
    content,
    tags,
    source,
  }, 'patterns-universal.jsonl');
}

export function captureDecision(
  workDir: string,
  content: string,
  tags: string[],
  source?: string,
): MemoryEntry {
  return capture(workDir, {
    type: 'decision',
    content,
    tags,
    source,
  }, 'decisions-universal.jsonl');
}

export function captureError(
  workDir: string,
  content: string,
  tags: string[],
  source?: string,
): MemoryEntry {
  return capture(workDir, {
    type: 'error',
    content,
    tags,
    source,
  }, 'errors-universal.jsonl');
}

export function getMemoryStats(workDir: string): {
  totalEntries: number;
  byType: Record<string, number>;
  byFile: Record<string, number>;
  recentEntries: MemoryEntry[];
} {
  const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
  if (!existsSync(knowledgeDir)) {
    return { totalEntries: 0, byType: {}, byFile: {}, recentEntries: [] };
  }

  const byType: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  const allEntries: MemoryEntry[] = [];

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
  allEntries.sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );

  return {
    totalEntries: allEntries.length,
    byType,
    byFile,
    recentEntries: allEntries.slice(0, 5),
  };
}

// Memory harvester — automatically writes knowledge entries to memory_bank/knowledge/*.jsonl
// after each forge pipeline run. Extracts facts and errors from run data.

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MicroGateResult, StoryExecution } from '../types.js';

const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
const DEDUP_TAIL_LINES = 50;

// ── Input/Output types ────────────────────────────────────────────

export interface HarvestInput {
  runId: string;
  workDir: string;
  storiesCompleted: number;
  storiesFailed: number;
  storiesTotal: number;
  totalCostUsd: number;
  gateVerdict: string;
  gateSummary: { passed: number; failed: number; warned: number } | null;
  storyExecutions: Record<string, StoryExecution>;
  microGateResults: MicroGateResult[];
  prdFiles: string[];
}

export interface HarvestResult {
  entriesWritten: number;
}

interface KnowledgeEntry {
  id: string;
  type: 'fact' | 'error';
  content: string;
  created_at: string;
  created_by: string;
  session_id: string;
  context: {
    prd_id: string | null;
    story_id: string | null;
    phase: string;
  };
  weight: number;
  validation_count: number;
  retrieval_count: number;
  tags: string[];
  reality_anchor: {
    has_tests: boolean;
    test_file: string | null;
    test_passing: boolean;
  };
  lineage: {
    parent_id: string | null;
    supersedes: string[];
    superseded_by: string | null;
  };
}

// ── Core harvest function ─────────────────────────────────────────

/**
 * Extracts knowledge entries from a completed pipeline run and appends
 * them to memory_bank/knowledge/*.jsonl files.
 *
 * @param input - Run data collected during the pipeline DEBRIEF phase
 * @returns The number of entries written
 */
export function harvestRunMemory(input: HarvestInput): HarvestResult {
  const knowledgeDir = join(input.workDir, KNOWLEDGE_DIR);
  if (!existsSync(knowledgeDir)) {
    mkdirSync(knowledgeDir, { recursive: true });
  }

  const entries: Array<{ file: string; entry: KnowledgeEntry }> = [];
  const now = new Date().toISOString();

  // 1. Run summary fact
  const costStr = `$${input.totalCostUsd.toFixed(2)}`;
  const verdictStr = input.gateVerdict !== 'UNKNOWN' ? `, TEMPER ${input.gateVerdict}` : '';
  const summaryContent = `Forge run: ${input.storiesCompleted}/${input.storiesTotal} stories${verdictStr}, ${costStr}`;
  entries.push({
    file: 'facts.jsonl',
    entry: buildEntry('fact', summaryContent, input.runId, now, input.prdFiles),
  });

  // 2. Failed story errors
  for (const [storyFile, execution] of Object.entries(input.storyExecutions)) {
    if (execution.status !== 'failed') continue;

    const fixerStr = execution.fixerAttempts > 0 ? ` after ${execution.fixerAttempts} fixer attempts` : '';
    const errorContent = `${storyFile} failed: T2/T5 compilation${fixerStr}`;
    entries.push({
      file: 'errors.jsonl',
      entry: buildEntry('error', errorContent, input.runId, now, input.prdFiles, storyFile),
    });
  }

  // 3. MG FAIL findings
  for (const mgResult of input.microGateResults) {
    if (mgResult.verdict !== 'FAIL' || mgResult.skippedDueToError) continue;

    for (const finding of mgResult.findings) {
      const locationStr = finding.location ? ` in ${finding.location}` : '';
      const errorContent = `${mgResult.gate} ${mgResult.agent} FAIL: ${finding.description}${locationStr}`;
      entries.push({
        file: 'errors.jsonl',
        entry: buildEntry('error', errorContent, input.runId, now, input.prdFiles),
      });
    }
  }

  // 4. Gate verdict fact (only if TEMPER actually ran)
  if (input.gateSummary) {
    const verdictContent = `TEMPER: ${input.gateSummary.passed}P ${input.gateSummary.failed}F ${input.gateSummary.warned}W — verdict ${input.gateVerdict}`;
    entries.push({
      file: 'facts.jsonl',
      entry: buildEntry('fact', verdictContent, input.runId, now, input.prdFiles),
    });
  }

  // Deduplicate and write
  let written = 0;
  const entriesByFile = groupBy(entries, (e) => e.file);

  for (const [file, fileEntries] of Object.entries(entriesByFile)) {
    const filePath = join(knowledgeDir, file);
    const existingContent = loadTailContent(filePath, DEDUP_TAIL_LINES);

    for (const { entry } of fileEntries) {
      if (existingContent.includes(entry.content)) continue;

      appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
      written++;
    }
  }

  return { entriesWritten: written };
}

// ── Helpers ───────────────────────────────────────────────────────

function buildEntry(
  type: 'fact' | 'error',
  content: string,
  runId: string,
  now: string,
  prdFiles: string[],
  storyId?: string,
): KnowledgeEntry {
  return {
    id: randomUUID(),
    type,
    content,
    created_at: now,
    created_by: 'forge-pipeline',
    session_id: runId,
    context: {
      prd_id: prdFiles.length > 0 ? prdFiles[0] : null,
      story_id: storyId || null,
      phase: 'DEBRIEF',
    },
    weight: 0.5,
    validation_count: 0,
    retrieval_count: 0,
    tags: ['forge', 'auto-harvest'],
    reality_anchor: {
      has_tests: false,
      test_file: null,
      test_passing: false,
    },
    lineage: {
      parent_id: null,
      supersedes: [],
      superseded_by: null,
    },
  };
}

function loadTailContent(filePath: string, lineCount: number): string {
  if (!existsSync(filePath)) return '';

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const tail = lines.slice(-lineCount);
    return tail.join('\n');
  } catch {
    return '';
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

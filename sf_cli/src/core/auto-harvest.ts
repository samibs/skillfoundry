// Auto-harvest — rule-based knowledge extraction from pipeline events.
// Generates BufferedEntry objects from story completions, gate failures,
// and fixer interventions. Zero LLM calls — all pattern-based.

import { basename } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { BufferedEntry } from './memory-buffer.js';

// ── Event types ─────────────────────────────────────────────────

export interface StoryCompletionEvent {
  storyId: string;
  prdId: string;
  filesCreated: string[];
  filesModified: string[];
  testFilesCreated: string[];
  dependenciesAdded: string[];
  patterns: string[]; // e.g. ["singleton", "repository pattern"]
}

export interface GateFailureEvent {
  gate: string; // e.g. "T2", "T3", "T5"
  agent: string;
  storyId: string;
  prdId: string;
  reason: string;
  resolution?: string;
}

export interface FixerInterventionEvent {
  storyId: string;
  prdId: string;
  errorType: string;
  errorFile: string;
  errorMessage: string;
  fixApplied: string;
  attempts: number;
  succeeded: boolean;
}

export interface SessionSummaryEvent {
  storiesCompleted: number;
  storiesTotal: number;
  testFilesCreated: number;
  entriesHarvested: number;
  gateVerdict: string;
}

// ── Extraction rules ────────────────────────────────────────────

/**
 * Extract knowledge entries from a completed story.
 * Rule: each significant artifact produces a fact or decision entry.
 */
export function harvestStoryCompletion(event: StoryCompletionEvent): BufferedEntry[] {
  const log = getLogger();
  const entries: BufferedEntry[] = [];

  // Files created → fact
  if (event.filesCreated.length > 0) {
    const fileNames = event.filesCreated.map((f) => basename(f));
    const moduleName = inferModule(event.filesCreated[0]);
    entries.push({
      type: 'fact',
      content: `Created ${fileNames.join(', ')} for ${moduleName}`,
      tags: extractTags(event.filesCreated),
      storyId: event.storyId,
      prdId: event.prdId,
    });
  }

  // Test files created → fact
  if (event.testFilesCreated.length > 0) {
    entries.push({
      type: 'fact',
      content: `Added ${event.testFilesCreated.length} test file(s): ${event.testFilesCreated.map((f) => basename(f)).join(', ')}`,
      tags: ['testing', ...extractTags(event.testFilesCreated)],
      storyId: event.storyId,
      prdId: event.prdId,
    });
  }

  // Dependencies added → decision
  for (const dep of event.dependenciesAdded) {
    entries.push({
      type: 'decision',
      content: `Added dependency ${dep} for ${event.storyId}`,
      tags: ['dependency', dep.replace(/[^a-z0-9-]/gi, '')],
      storyId: event.storyId,
      prdId: event.prdId,
    });
  }

  // Patterns used → decision
  for (const pattern of event.patterns) {
    entries.push({
      type: 'decision',
      content: `Applied ${pattern} pattern in ${event.storyId}`,
      tags: ['pattern', pattern.toLowerCase().replace(/\s+/g, '-')],
      storyId: event.storyId,
      prdId: event.prdId,
    });
  }

  if (entries.length > 0) {
    log.debug('memory', 'auto_harvest_story', {
      storyId: event.storyId,
      entriesExtracted: entries.length,
    });
  }

  return entries;
}

/**
 * Extract knowledge entries from a gate failure.
 * Rule: gate failure + resolution = error entry.
 */
export function harvestGateFailure(event: GateFailureEvent): BufferedEntry[] {
  const log = getLogger();
  const resolutionStr = event.resolution ? ` Resolution: ${event.resolution}` : '';
  const entry: BufferedEntry = {
    type: 'error',
    content: `${event.gate} gate failed (${event.agent}): ${event.reason}.${resolutionStr}`,
    tags: ['gate-failure', event.gate.toLowerCase(), event.agent],
    storyId: event.storyId,
    prdId: event.prdId,
  };

  log.debug('memory', 'auto_harvest_gate_failure', {
    gate: event.gate,
    storyId: event.storyId,
  });

  return [entry];
}

/**
 * Extract knowledge entries from a fixer intervention.
 * Rule: error + fix attempts + outcome = error entry.
 */
export function harvestFixerIntervention(event: FixerInterventionEvent): BufferedEntry[] {
  const log = getLogger();
  const outcomeStr = event.succeeded ? 'Fixed' : 'Unresolved';
  const entry: BufferedEntry = {
    type: 'error',
    content: `${event.errorType} in ${basename(event.errorFile)}: ${event.errorMessage}. ${outcomeStr} after ${event.attempts} attempt(s): ${event.fixApplied}`,
    tags: ['fixer', event.errorType.toLowerCase().replace(/\s+/g, '-')],
    storyId: event.storyId,
    prdId: event.prdId,
  };

  log.debug('memory', 'auto_harvest_fixer', {
    storyId: event.storyId,
    errorType: event.errorType,
    succeeded: event.succeeded,
    attempts: event.attempts,
  });

  return [entry];
}

/**
 * Generate a session summary fact.
 * Rule: always produced at session close.
 */
export function harvestSessionSummary(event: SessionSummaryEvent): BufferedEntry {
  const log = getLogger();
  const entry: BufferedEntry = {
    type: 'fact',
    content: `Session: ${event.storiesCompleted}/${event.storiesTotal} stories, ${event.testFilesCreated} test files, ${event.entriesHarvested} knowledge entries, verdict ${event.gateVerdict}`,
    tags: ['session-summary', 'forge'],
  };

  log.debug('memory', 'auto_harvest_session_summary', {
    storiesCompleted: event.storiesCompleted,
    entriesHarvested: event.entriesHarvested,
  });

  return entry;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Infer module name from a file path.
 * e.g. "src/core/auth-service.ts" → "core module"
 *      "src/components/Header.tsx" → "components module"
 */
function inferModule(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  // Find the first meaningful directory after src/
  const srcIdx = parts.indexOf('src');
  if (srcIdx >= 0 && srcIdx + 1 < parts.length - 1) {
    return `${parts[srcIdx + 1]} module`;
  }
  // Fallback: use parent directory
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} module`;
  }
  return 'project';
}

/**
 * Extract tags from file paths.
 * e.g. ["src/core/auth.ts", "src/core/auth.test.ts"] → ["core", "auth"]
 */
function extractTags(filePaths: string[]): string[] {
  const tags = new Set<string>();
  for (const fp of filePaths) {
    const parts = fp.replace(/\\/g, '/').split('/');
    // Add directory names (skip common ones)
    for (const part of parts) {
      if (['src', 'dist', 'node_modules', '__tests__', 'test', 'tests'].includes(part)) continue;
      if (part.includes('.')) continue; // skip filenames
      if (part.length > 1 && part.length < 30) {
        tags.add(part.toLowerCase());
      }
    }
    // Add filename stem
    const name = basename(fp).replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '').replace(/\.(ts|js|tsx|jsx)$/, '');
    if (name.length > 1 && name.length < 30) {
      tags.add(name.toLowerCase());
    }
  }
  return [...tags].slice(0, 10);
}

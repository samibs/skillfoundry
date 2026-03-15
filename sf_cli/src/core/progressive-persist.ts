// Progressive persist — writes story deliverables to disk as each story completes.
// Survives context exhaustion by persisting incrementally, not just at pipeline end.

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { StoryExecution, PipelinePhase } from '../types.js';
import { getLogger } from '../utils/logger.js';

export interface StoryDeliverable {
  storyFile: string;
  status: 'completed' | 'failed';
  filesCreated: string[];
  filesModified: string[];
  testFiles: string[];
  commitStub: string;
  decisions: string[];
}

export interface ForgeState {
  runId: string;
  prdId: string;
  startedAt: string;
  updatedAt: string;
  phases: PipelinePhase[];
  stories: Record<string, {
    status: 'pending' | 'running' | 'completed' | 'failed';
    deliverable?: string; // path to STORY-N.md
  }>;
  issueCount: number;
}

const DELIVERY_DIR = 'delivery';
const STATE_FILE = '.skillfoundry/forge-state.json';

/**
 * Persist a completed story's deliverables to disk.
 * Creates delivery/{prd-id}/STORY-{N}.md with the file manifest.
 */
export function persistStoryDeliverable(
  workDir: string,
  prdId: string,
  deliverable: StoryDeliverable,
): string {
  const log = getLogger();
  const deliveryDir = join(workDir, DELIVERY_DIR, prdId);
  if (!existsSync(deliveryDir)) {
    mkdirSync(deliveryDir, { recursive: true });
  }

  const storyName = basename(deliverable.storyFile, '.md');
  const filePath = join(deliveryDir, `${storyName}.md`);

  const lines: string[] = [];
  lines.push(`# ${storyName} — Delivery Manifest`);
  lines.push('');
  lines.push(`**Status:** ${deliverable.status}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');

  if (deliverable.filesCreated.length > 0) {
    lines.push('## Files Created');
    for (const f of deliverable.filesCreated) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (deliverable.filesModified.length > 0) {
    lines.push('## Files Modified');
    for (const f of deliverable.filesModified) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (deliverable.testFiles.length > 0) {
    lines.push('## Test Files');
    for (const f of deliverable.testFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (deliverable.commitStub) {
    lines.push('## Commit Stub');
    lines.push('```');
    lines.push(deliverable.commitStub);
    lines.push('```');
    lines.push('');
  }

  if (deliverable.decisions.length > 0) {
    lines.push('## Decisions');
    for (const d of deliverable.decisions) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  writeFileSync(filePath, lines.join('\n'), 'utf-8');

  log.info('persist', 'story_deliverable_saved', {
    story: storyName,
    path: filePath,
    filesCreated: deliverable.filesCreated.length,
    filesModified: deliverable.filesModified.length,
    testFiles: deliverable.testFiles.length,
  });

  return filePath;
}

/**
 * Save or update forge pipeline state.
 * Called after each batch to enable resume.
 */
export function saveForgeState(workDir: string, state: ForgeState): string {
  const log = getLogger();
  const stateDir = join(workDir, '.skillfoundry');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  const filePath = join(workDir, STATE_FILE);
  state.updatedAt = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');

  log.info('persist', 'forge_state_saved', {
    runId: state.runId,
    completedStories: Object.values(state.stories).filter((s) => s.status === 'completed').length,
    totalStories: Object.keys(state.stories).length,
  });

  return filePath;
}

/**
 * Load existing forge state for resume.
 */
export function loadForgeState(workDir: string): ForgeState | null {
  const filePath = join(workDir, STATE_FILE);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ForgeState;
  } catch {
    return null;
  }
}

/**
 * Get completion percentage from forge state.
 */
export function getCompletionPercentage(state: ForgeState): number {
  const total = Object.keys(state.stories).length;
  if (total === 0) return 0;
  const completed = Object.values(state.stories).filter((s) => s.status === 'completed').length;
  return Math.round((completed / total) * 100);
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SfState } from '../types.js';

const STATE_FILE = join('.claude', 'state.json');

function defaultState(): SfState {
  return {
    current_state: 'IDLE',
    updated_at: new Date().toISOString(),
    current_prd: '',
    current_story: '',
    last_plan_id: '',
    last_run_id: '',
    recovery: { rollback_available: false, resume_point: '' },
  };
}

export function loadState(workDir: string): SfState {
  const path = join(workDir, STATE_FILE);
  if (!existsSync(path)) {
    return defaultState();
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return defaultState();
  }
}

export function saveState(workDir: string, state: SfState): void {
  const dir = join(workDir, '.claude');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(workDir, STATE_FILE);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function updateState(
  workDir: string,
  updates: Partial<SfState>,
): SfState {
  const current = loadState(workDir);
  const updated: SfState = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
    recovery: { ...current.recovery, ...(updates.recovery ?? {}) },
  };
  saveState(workDir, updated);
  return updated;
}

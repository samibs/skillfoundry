import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const STATE_FILE = join('.claude', 'state.json');
function defaultState() {
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
export function loadState(workDir) {
    const path = join(workDir, STATE_FILE);
    if (!existsSync(path)) {
        return defaultState();
    }
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return defaultState();
    }
}
export function saveState(workDir, state) {
    const dir = join(workDir, '.claude');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const path = join(workDir, STATE_FILE);
    writeFileSync(path, JSON.stringify(state, null, 2));
}
export function updateState(workDir, updates) {
    const current = loadState(workDir);
    const updated = {
        ...current,
        ...updates,
        updated_at: new Date().toISOString(),
        recovery: { ...current.recovery, ...(updates.recovery ?? {}) },
    };
    saveState(workDir, updated);
    return updated;
}
//# sourceMappingURL=session.js.map
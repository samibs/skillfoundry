import type { SfState } from '../types.js';
export declare function loadState(workDir: string): SfState;
export declare function saveState(workDir: string, state: SfState): void;
export declare function updateState(workDir: string, updates: Partial<SfState>): SfState;

import type { SfConfig, SfPolicy } from '../types.js';
export declare function ensureWorkspace(workDir: string): void;
export declare function loadConfig(workDir: string): SfConfig;
export declare function loadPolicy(workDir: string): SfPolicy;
export declare function saveConfig(workDir: string, config: SfConfig): void;
export declare function createDefaultFiles(workDir: string, force: boolean): void;

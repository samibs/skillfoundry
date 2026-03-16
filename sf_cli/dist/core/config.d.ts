import type { SfConfig, SfPolicy, EmbeddingServiceOptions } from '../types.js';
/**
 * Build default EmbeddingServiceOptions from environment variables.
 * Reads OLLAMA_HOST and SF_OPENAI_API_KEY from the process environment.
 * @returns Fully populated EmbeddingServiceOptions with sensible defaults.
 */
export declare function getDefaultEmbeddingOptions(): EmbeddingServiceOptions;
export declare function ensureWorkspace(workDir: string): void;
export declare function loadConfig(workDir: string): SfConfig;
export declare function loadPolicy(workDir: string): SfPolicy;
export declare function saveConfig(workDir: string, config: SfConfig): void;
export declare function createDefaultFiles(workDir: string, force: boolean): void;

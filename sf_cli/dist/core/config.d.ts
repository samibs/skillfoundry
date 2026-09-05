import type { SfConfig, SfPolicy, EmbeddingServiceOptions, DeliveryEfficiencyConfig } from '../types.js';
/**
 * Build default EmbeddingServiceOptions from environment variables.
 * Reads OLLAMA_HOST and SF_OPENAI_API_KEY from the process environment.
 * @returns Fully populated EmbeddingServiceOptions with sensible defaults.
 */
export declare function getDefaultEmbeddingOptions(): EmbeddingServiceOptions;
/**
 * Delivery Efficiency defaults.
 *
 * Enabled by default: the layer only ever narrows work that risk analysis shows to be
 * unnecessary, and safety-critical changes still classify HIGH and validate fully.
 */
export declare const DEFAULT_DELIVERY_EFFICIENCY: DeliveryEfficiencyConfig;
export declare function ensureWorkspace(workDir: string): void;
export declare function loadConfig(workDir: string): SfConfig;
export declare function loadPolicy(workDir: string): SfPolicy;
export declare function saveConfig(workDir: string, config: SfConfig): void;
export declare function createDefaultFiles(workDir: string, force: boolean): void;

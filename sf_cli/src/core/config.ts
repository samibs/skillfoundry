import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';
import type { SfConfig, SfPolicy, EmbeddingServiceOptions } from '../types.js';
import { AVAILABLE_PROVIDERS, detectAvailableProviders } from './provider.js';

/**
 * Build default EmbeddingServiceOptions from environment variables.
 * Reads OLLAMA_HOST and SF_OPENAI_API_KEY from the process environment.
 * @returns Fully populated EmbeddingServiceOptions with sensible defaults.
 */
export function getDefaultEmbeddingOptions(): EmbeddingServiceOptions {
  const ollamaHost = process.env.OLLAMA_HOST ?? 'localhost:11434';
  const ollamaUrl = ollamaHost.startsWith('http') ? ollamaHost : `http://${ollamaHost}`;
  return {
    preferredProvider: 'ollama',
    ollamaUrl,
    ollamaModel: 'nomic-embed-text',
    openaiApiKey: process.env.SF_OPENAI_API_KEY,
    openaiModel: 'text-embedding-3-small',
    maxChunkLength: 8192,
    cacheTtlMs: 3_600_000, // 1 hour
    maxCacheSize: 500,
  };
}

const WORK_DIR = '.skillfoundry';
const CONFIG_FILE = join(WORK_DIR, 'config.toml');
const POLICY_FILE = join(WORK_DIR, 'policy.toml');

const DEFAULT_CONFIG: SfConfig = {
  provider: 'anthropic',
  engine: 'api',
  model: 'claude-sonnet-4-20250514',
  fallback_provider: 'openai',
  fallback_engine: 'broker',
  monthly_budget_usd: 50,
  run_budget_usd: 2,
  memory_sync_enabled: false,
  memory_sync_remote: 'origin',
  route_local_first: false,
  local_provider: 'ollama',
  local_model: 'llama3.1',
  context_window: 0, // 0 = auto-detect from model
  log_level: 'info',
  data_jurisdiction: 'none',
  quality_fallback: false,
  routing_rules: {},
};

const DEFAULT_POLICY: SfPolicy = {
  allow_shell: false,
  allow_network: false,
  allow_paths: ['.', 'memory_bank', '.skillfoundry', 'docs', 'genesis'],
  redact: true,
};

export function ensureWorkspace(workDir: string): void {
  const dirs = [WORK_DIR, join(WORK_DIR, 'plans'), join(WORK_DIR, 'runs')];
  for (const dir of dirs) {
    const full = join(workDir, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
    }
  }
}

export function loadConfig(workDir: string): SfConfig {
  let config: SfConfig;
  const path = join(workDir, CONFIG_FILE);
  if (!existsSync(path)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    const raw = readFileSync(path, 'utf-8');
    const parsed = TOML.parse(raw);
    // Extract nested routing.rules before flat merge
    const routingRules: Record<string, string> = {};
    const routing = parsed.routing as Record<string, unknown> | undefined;
    if (routing && typeof routing === 'object' && routing.rules && typeof routing.rules === 'object') {
      for (const [k, v] of Object.entries(routing.rules as Record<string, unknown>)) {
        if (v === 'local' || v === 'cloud' || v === 'auto') {
          routingRules[k] = v;
        }
      }
    }
    // Remove nested routing to avoid overwriting flat fields
    delete parsed.routing;
    config = { ...DEFAULT_CONFIG, ...parsed, routing_rules: routingRules } as unknown as SfConfig;
  }

  // Auto-select provider: if configured provider has no credentials, pick the first available one
  const available = detectAvailableProviders();
  const localProviders = ['ollama', 'lmstudio'];
  if (!available.includes(config.provider) || localProviders.includes(config.provider)) {
    const preferred = available.filter((p) => !localProviders.includes(p));
    if (preferred.length > 0) {
      const picked = preferred[0];
      const info = AVAILABLE_PROVIDERS[picked];
      if (info) {
        config.provider = picked;
        config.model = info.defaultModel;
      }
    }
  }

  return config;
}

export function loadPolicy(workDir: string): SfPolicy {
  const path = join(workDir, POLICY_FILE);
  if (!existsSync(path)) {
    return { ...DEFAULT_POLICY };
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = TOML.parse(raw);
  return { ...DEFAULT_POLICY, ...parsed } as unknown as SfPolicy;
}

export function saveConfig(workDir: string, config: SfConfig): void {
  ensureWorkspace(workDir);
  const path = join(workDir, CONFIG_FILE);
  writeFileSync(path, TOML.stringify(config as unknown as TOML.JsonMap));
}

export function createDefaultFiles(workDir: string, force: boolean): void {
  ensureWorkspace(workDir);
  const configPath = join(workDir, CONFIG_FILE);
  const policyPath = join(workDir, POLICY_FILE);
  if (!existsSync(configPath) || force) {
    writeFileSync(configPath, TOML.stringify(DEFAULT_CONFIG as unknown as TOML.JsonMap));
  }
  if (!existsSync(policyPath) || force) {
    writeFileSync(policyPath, TOML.stringify(DEFAULT_POLICY as unknown as TOML.JsonMap));
  }
}
